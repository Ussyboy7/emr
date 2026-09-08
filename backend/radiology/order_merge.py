"""Append / collapse fully-pending same-visit radiology orders."""

from __future__ import annotations

from django.db import transaction
from django.db.models import Count

PRIORITY_RANK = {"routine": 0, "urgent": 1, "stat": 2}


def radiology_order_is_fully_pending(order) -> bool:
    """True when every study is still untouched (safe to append/merge)."""
    if getattr(order, "source_type", None) == "external_manual":
        return False
    if getattr(order, "status", "pending") not in ("pending",):
        return False
    studies = list(order.studies.all())
    if not studies:
        return True
    for s in studies:
        if s.status != "pending":
            return False
        if getattr(s, "routing_status", "pending_triage") not in (
            "pending_triage",
            "",
            None,
        ):
            return False
        if getattr(s, "scheduled_date", None):
            return False
    return True


def find_mergeable_radiology_order(
    *,
    patient_id,
    visit_id=None,
    consultation_session_id=None,
    admission_id=None,
    for_update: bool = False,
):
    from radiology.models import RadiologyOrder

    qs = RadiologyOrder.objects.filter(patient_id=patient_id).exclude(
        source_type="external_manual"
    )
    if visit_id:
        qs = qs.filter(visit_id=visit_id)
    elif admission_id:
        qs = qs.filter(admission_id=admission_id)
    else:
        return None
    if for_update:
        qs = qs.select_for_update(of=("self",))

    candidates = list(qs.prefetch_related("studies").order_by("-ordered_at", "-id")[:30])
    pending = [o for o in candidates if radiology_order_is_fully_pending(o)]
    if not pending:
        return None

    if consultation_session_id:
        session_match = next(
            (
                o
                for o in pending
                if o.consultation_session_id == consultation_session_id
            ),
            None,
        )
        if session_match:
            return session_match
    return pending[0]


def bump_priority(current: str, incoming: str | None) -> str:
    cur = current or "routine"
    nxt = incoming or "routine"
    if PRIORITY_RANK.get(nxt, 0) > PRIORITY_RANK.get(cur, 0):
        return nxt
    return cur


def _study_key(study) -> str:
    template_id = getattr(study, "template_id", None)
    if template_id:
        return f"template:{template_id}"
    procedure = str(getattr(study, "procedure", "") or "").strip().upper()
    body = str(getattr(study, "body_part", "") or "").strip().upper()
    return f"proc:{procedure}|{body}"


@transaction.atomic
def merge_pending_same_visit_radiology_orders(*, dry_run: bool = False) -> dict:
    """Collapse historical fully-pending RadiologyOrders that share patient+visit."""
    from radiology.models import RadiologyOrder

    groups = list(
        RadiologyOrder.objects.filter(visit_id__isnull=False)
        .exclude(source_type="external_manual")
        .values("patient_id", "visit_id")
        .annotate(c=Count("id"))
        .filter(c__gt=1)
        .order_by("patient_id", "visit_id")
    )

    merged_groups = 0
    deleted_orders = 0
    moved_studies = 0
    dropped_dupes = 0

    for g in groups:
        orders = list(
            RadiologyOrder.objects.filter(
                patient_id=g["patient_id"],
                visit_id=g["visit_id"],
            )
            .exclude(source_type="external_manual")
            .prefetch_related("studies")
            .order_by("ordered_at", "id")
        )
        pending = [o for o in orders if radiology_order_is_fully_pending(o)]
        if len(pending) < 2:
            continue

        keeper = pending[0]
        donors = pending[1:]
        if dry_run:
            merged_groups += 1
            deleted_orders += len(donors)
            continue

        keeper_keys = {_study_key(s) for s in keeper.studies.all()}
        note_bits = []
        for donor in donors:
            if (donor.clinical_notes or "").strip():
                note_bits.append(donor.clinical_notes.strip())
            for study in list(donor.studies.all()):
                key = _study_key(study)
                if key in keeper_keys:
                    study.delete()
                    dropped_dupes += 1
                    continue
                study.order_id = keeper.pk
                study.save(update_fields=["order"])
                keeper_keys.add(key)
                moved_studies += 1

            new_priority = bump_priority(keeper.priority, donor.priority)
            if new_priority != keeper.priority:
                keeper.priority = new_priority
                keeper.save(update_fields=["priority"])

            donor.delete()
            deleted_orders += 1

        if note_bits:
            extra = "\n".join(note_bits)
            keeper.clinical_notes = (
                f"{keeper.clinical_notes}\n{extra}".strip()
                if keeper.clinical_notes
                else extra
            )
            keeper.save(update_fields=["clinical_notes"])
        merged_groups += 1

    return {
        "groups": len(groups),
        "merged_groups": merged_groups,
        "deleted_orders": deleted_orders,
        "moved_studies": moved_studies,
        "dropped_dupes": dropped_dupes,
        "dry_run": dry_run,
    }
