"""
Annual check-up business logic: creation, component evaluation, sign-off.
"""

from __future__ import annotations

from datetime import date

from django.core.files.base import ContentFile
from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from audit.services import AuditService

from .annual_checkup_catalog import (
    component_meta,
    get_default_selected_codes,
    get_definition,
)
from .annual_checkup_components import LAB_TEST_ALIASES, RADIOLOGY_ALIASES
from .models import AnnualCheckup, MedicalHistory, Patient, Visit, VitalReading


def _require_medical_doctor(user) -> None:
    role = getattr(user, "system_role", None)
    if user.is_superuser:
        return
    if role != "Medical Doctor":
        raise PermissionDenied("Only Medical Doctors can sign off annual check-ups.")


def _normalize_name(value: str) -> str:
    return " ".join((value or "").lower().replace("-", " ").split())


def _name_matches_aliases(name: str, aliases: tuple[str, ...]) -> bool:
    norm = _normalize_name(name)
    for alias in aliases:
        if alias in norm or norm in alias:
            return True
    return False


def _lab_tests_for_visit(visit) -> list[str]:
    from laboratory.models import LabTest

    names: list[str] = []
    tests = LabTest.objects.filter(order__visit=visit).select_related("template", "order")
    for test in tests:
        if test.template_id and test.template.name:
            names.append(test.template.name)
        if test.name:
            names.append(test.name)
    return names


def _radiology_procedures_for_visit(visit) -> list[str]:
    from radiology.models import RadiologyStudy

    names: list[str] = []
    studies = RadiologyStudy.objects.filter(order__visit=visit).select_related("template", "order")
    for study in studies:
        if study.template_id and study.template.name:
            names.append(study.template.name)
        if study.procedure:
            names.append(study.procedure)
    return names


def _aliases_for_code(code: str) -> tuple[str, ...]:
    meta = component_meta(code)
    aliases = [str(a).lower() for a in (meta.get("name_aliases") or [])]
    if code in LAB_TEST_ALIASES:
        aliases.extend(LAB_TEST_ALIASES[code])
    if code in RADIOLOGY_ALIASES:
        aliases.extend(RADIOLOGY_ALIASES[code])
    return tuple(dict.fromkeys(aliases))


def _has_lab_component(visit, code: str) -> bool:
    if code == "lab_hba1c_lipids":
        return _has_lab_component(visit, "lab_hba1c") and _has_lab_component(visit, "lab_lipid")

    from laboratory.models import LabTest

    meta = component_meta(code)
    template_codes = meta.get("lab_template_codes") or []
    if template_codes:
        if LabTest.objects.filter(
            order__visit=visit, template__code__in=template_codes
        ).exists():
            return True

    aliases = _aliases_for_code(code)
    if not aliases:
        return False
    return any(_name_matches_aliases(n, aliases) for n in _lab_tests_for_visit(visit))


def _has_radiology_component(visit, code: str) -> bool:
    from radiology.models import RadiologyStudy

    meta = component_meta(code)
    template_codes = meta.get("radiology_template_codes") or []
    if template_codes:
        if RadiologyStudy.objects.filter(
            order__visit=visit, template__code__in=template_codes
        ).exists():
            return True

    aliases = _aliases_for_code(code)
    if not aliases:
        return False
    return any(_name_matches_aliases(n, aliases) for n in _radiology_procedures_for_visit(visit))


def _has_ecg(visit) -> bool:
    if _has_radiology_component(visit, "ecg"):
        return True
    from consultation.models import ConsultationSession

    for session in ConsultationSession.objects.filter(visit=visit):
        blob = " ".join(
            filter(
                None,
                [
                    session.physical_examination,
                    session.notes,
                    session.assessment,
                    session.plan,
                ],
            )
        ).lower()
        if "ecg" in blob or "electrocardiogram" in blob:
            return True
    return False


def _vital_for_visit(visit) -> VitalReading | None:
    return visit.vital_readings.order_by("-recorded_at").first()


def _medical_history_has_content(history: MedicalHistory) -> bool:
    """True when structured history on file has been populated (not an empty shell)."""
    if history.allergies:
        return True
    if history.diagnoses:
        return True
    if history.current_medications:
        return True
    if history.surgical_history:
        return True
    if history.family_history:
        return True
    social = history.social_history
    if isinstance(social, dict) and any(v not in (None, "", [], {}) for v in social.values()):
        return True
    return False


def _component_done(annual_checkup, visit, code: str) -> bool:
    overrides = annual_checkup.component_overrides or {}
    if code in overrides:
        return True

    if code == "vitals":
        vital = _vital_for_visit(visit)
        if not vital:
            return False
        return all(
            [
                vital.blood_pressure_systolic,
                vital.blood_pressure_diastolic,
                vital.heart_rate,
                vital.temperature,
                vital.oxygen_saturation,
                vital.respiratory_rate,
            ]
        )

    if code == "anthropometry":
        vital = _vital_for_visit(visit)
        if not vital:
            return False
        return bool(vital.height and vital.weight and vital.bmi)

    if code == "vision_acuity":
        from eyecare.models import EyeOrder

        for order in EyeOrder.objects.filter(visit=visit):
            if order.visual_acuity_od or order.visual_acuity_os or order.visual_acuity_ou:
                return True
        return False

    if code == "blood_group":
        if getattr(visit.patient, "blood_group", None):
            return True
        return _has_lab_component(visit, code)

    if code == "genotype":
        if getattr(visit.patient, "genotype", None):
            return True
        return _has_lab_component(visit, code)

    meta = component_meta(code)
    if meta.get("captured_via") == "laboratory" or code in ("pap_smear", "psa"):
        return _has_lab_component(visit, code)

    if meta.get("captured_via") == "radiology" and code != "ecg":
        return _has_radiology_component(visit, code)

    if code == "ecg":
        return _has_ecg(visit)

    if code == "history_review":
        from consultation.models import ConsultationSession
        from django.db.models import Q

        if ConsultationSession.objects.filter(visit=visit).filter(
            Q(history_of_presenting_illness__gt="")
            | Q(assessment__gt="")
            | Q(presentation_complaint__gt="")
        ).exists():
            return True

        try:
            history = visit.patient.medical_history
        except MedicalHistory.DoesNotExist:
            return False

        if _medical_history_has_content(history):
            return True

        if history.updated_at and visit.created_at and history.updated_at >= visit.created_at:
            return True

        return False

    if code == "physical_exam":
        from consultation.models import ConsultationSession

        return ConsultationSession.objects.filter(visit=visit).exclude(
            physical_examination=""
        ).exists()

    if code == "fitness_assessment":
        return bool(annual_checkup.fitness_outcome)

    return False


def evaluate_components(annual_checkup) -> tuple[list[str], list[str]]:
    """Return (completed_codes, incomplete_codes) for the check-up."""
    visit = annual_checkup.visit
    required = annual_checkup.components_required or []
    completed = [code for code in required if _component_done(annual_checkup, visit, code)]
    incomplete = [code for code in required if code not in completed]
    return completed, incomplete


def refresh_components_completed(annual_checkup, *, save: bool = True) -> AnnualCheckup:
    completed, _ = evaluate_components(annual_checkup)
    annual_checkup.components_completed = completed
    if save:
        annual_checkup.save(update_fields=["components_completed", "updated_at"])
    return annual_checkup


def build_component_checklist(annual_checkup) -> list[dict]:
    completed_set = set(annual_checkup.components_completed or [])
    overrides = annual_checkup.component_overrides or {}
    items = []
    for code in annual_checkup.components_required or []:
        meta = component_meta(code)
        done = code in completed_set
        item = {
            **meta,
            "done": done,
            "selected": True,
            "override_reason": overrides.get(code),
        }
        items.append(item)
    return items


def build_full_catalog_with_selection(annual_checkup) -> list[dict]:
    """All active catalog entries with selected/done flags for the doctor UI."""
    from .annual_checkup_catalog import get_active_catalog, serialize_catalog_entry

    selected = set(annual_checkup.components_required or [])
    completed = set(annual_checkup.components_completed or [])
    overrides = annual_checkup.component_overrides or {}
    rows = []
    for defn in get_active_catalog():
        code = defn.code
        rows.append(
            {
                **serialize_catalog_entry(defn),
                "selected": code in selected,
                "done": code in completed,
                "override_reason": overrides.get(code),
            }
        )
    return rows


@transaction.atomic
def create_annual_checkup_for_visit(visit: Visit, programme_year: int | None = None) -> AnnualCheckup:
    if visit.visit_type != "annual_checkup":
        raise ValidationError("Visit type must be annual_checkup.")

    if hasattr(visit, "annual_checkup"):
        return visit.annual_checkup

    patient = visit.patient
    if patient.category != "employee":
        raise ValidationError("Annual check-ups are only for employee patients.")
    if not patient.is_active:
        raise ValidationError("Patient must be active.")

    year = programme_year or date.today().year
    required = get_default_selected_codes(year)

    checkup = AnnualCheckup.objects.create(
        visit=visit,
        patient=patient,
        programme_year=year,
        status="in_progress",
        components_required=required,
        components_completed=[],
    )
    return refresh_components_completed(checkup)


@transaction.atomic
def sign_off_annual_checkup(
    annual_checkup: AnnualCheckup,
    *,
    user,
    fitness_outcome: str,
    outcome_notes: str = "",
    override_reason: str = "",
    request=None,
) -> AnnualCheckup:
    _require_medical_doctor(user)

    if annual_checkup.status == "completed":
        raise ValidationError("This annual check-up has already been signed off.")

    annual_checkup.fitness_outcome = fitness_outcome
    annual_checkup.outcome_notes = outcome_notes or ""
    refresh_components_completed(annual_checkup, save=False)

    _, incomplete = evaluate_components(annual_checkup)
    if incomplete:
        if not (override_reason or "").strip():
            labels = [component_meta(c)["label"] for c in incomplete]
            raise ValidationError(
                {
                    "override_reason": (
                        f"Incomplete components: {', '.join(labels)}. "
                        "Provide an override reason to sign off anyway."
                    ),
                    "incomplete_components": incomplete,
                }
            )
        annual_checkup.sign_off_override_reason = override_reason.strip()

    from hr.compliance import next_programme_due_date
    from .annual_checkup_pdfs import (
        build_annual_checkup_report_pdf,
        build_hr_outcome_letter_pdf,
    )

    pdf_bytes = build_annual_checkup_report_pdf(annual_checkup)
    fname = f"annual_checkup_{annual_checkup.visit.visit_id}_{annual_checkup.programme_year}.pdf"
    if annual_checkup.report_pdf:
        annual_checkup.report_pdf.delete(save=False)
    annual_checkup.report_pdf.save(fname, ContentFile(pdf_bytes), save=False)

    letter_bytes = build_hr_outcome_letter_pdf(annual_checkup)
    letter_fname = (
        f"outcome_letter_{annual_checkup.visit.visit_id}_"
        f"{annual_checkup.programme_year}.pdf"
    )
    if annual_checkup.outcome_letter_pdf:
        annual_checkup.outcome_letter_pdf.delete(save=False)
    annual_checkup.outcome_letter_pdf.save(
        letter_fname, ContentFile(letter_bytes), save=False
    )

    annual_checkup.status = "completed"
    annual_checkup.signed_off_by = user
    annual_checkup.signed_off_at = timezone.now()
    annual_checkup.next_due_date = next_programme_due_date(annual_checkup.programme_year)
    annual_checkup.save()

    visit = annual_checkup.visit
    if visit.status != "completed":
        visit.status = "completed"
        visit.doctor = visit.doctor or user
        visit.save(update_fields=["status", "doctor", "updated_at"])

    AuditService.log_activity(
        user=user,
        action="update",
        object_type="annual_checkup",
        object_id=str(annual_checkup.id),
        module="patients",
        object_repr=f"Annual check-up {annual_checkup.programme_year} — {annual_checkup.patient.get_full_name()}",
        description=(
            f"Signed off annual check-up ({fitness_outcome})"
            + (f" with override: {override_reason}" if override_reason else "")
        ),
        request=request,
    )

    return annual_checkup


def validate_selected_component_codes(codes: list[str]) -> list[str]:
    from .annual_checkup_catalog import get_active_catalog

    active = {d.code for d in get_active_catalog()}
    cleaned = list(dict.fromkeys(codes))
    invalid = [c for c in cleaned if c not in active]
    if invalid:
        raise ValidationError({"components_required": f"Unknown components: {', '.join(invalid)}"})
    return cleaned


@transaction.atomic
def order_investigations_for_checkup(
    annual_checkup: AnnualCheckup,
    *,
    user,
    consultation_session_id: int | None = None,
    component_codes: list[str] | None = None,
    priority: str = "routine",
) -> dict:
    """Create lab and radiology orders for pending selected components."""
    from consultation.models import ConsultationSession
    from laboratory.models import LabTemplate
    from laboratory.serializers import LabOrderSerializer
    from radiology.models import RadiologyTemplate
    from radiology.serializers import RadiologyOrderSerializer

    visit = annual_checkup.visit
    patient = annual_checkup.patient
    session = None
    if consultation_session_id:
        session = ConsultationSession.objects.filter(
            pk=consultation_session_id, visit=visit
        ).first()
    if session is None:
        session = (
            ConsultationSession.objects.filter(visit=visit, status="active")
            .order_by("-started_at")
            .first()
        )

    selected = set(annual_checkup.components_required or [])
    if component_codes:
        selected &= set(validate_selected_component_codes(component_codes))

    completed, _ = evaluate_components(annual_checkup)
    completed_set = set(completed)

    lab_tests_data: list[dict] = []
    radiology_studies_data: list[dict] = []
    ordered_labels: list[str] = []
    skipped: list[str] = []

    for code in selected:
        if code in completed_set:
            continue
        defn = get_definition(code)
        if not defn:
            continue
        meta = component_meta(code)

        if meta.get("captured_via") == "laboratory":
            template_codes = meta.get("lab_template_codes") or []
            if not template_codes:
                skipped.append(code)
                continue
            for tpl_code in template_codes:
                tpl = LabTemplate.objects.filter(code=tpl_code, is_active=True).first()
                if not tpl:
                    continue
                from laboratory.models import LabTest

                if LabTest.objects.filter(
                    order__visit=visit, template_id=tpl.id
                ).exists():
                    continue
                lab_tests_data.append(
                    {
                        "name": tpl.name,
                        "code": tpl.code,
                        "sample_type": tpl.sample_type or "Blood",
                        "template": tpl.id,
                        "status": "pending",
                        "notes": f"Annual check-up {annual_checkup.programme_year}",
                    }
                )
                ordered_labels.append(defn.label)

        elif meta.get("captured_via") == "radiology":
            template_codes = meta.get("radiology_template_codes") or []
            if not template_codes:
                skipped.append(code)
                continue
            tpl_code = template_codes[0]
            tpl = RadiologyTemplate.objects.filter(code=tpl_code, is_active=True).first()
            if not tpl:
                skipped.append(code)
                continue
            from radiology.models import RadiologyStudy

            if RadiologyStudy.objects.filter(
                order__visit=visit, template_id=tpl.id
            ).exists():
                continue
            radiology_studies_data.append(
                {
                    "procedure": tpl.name,
                    "template": tpl.id,
                    "status": "pending",
                    "notes": f"Annual check-up {annual_checkup.programme_year}",
                }
            )
            ordered_labels.append(defn.label)

    lab_order_id = None
    radiology_order_id = None

    if lab_tests_data:
        from common.order_location import resolve_order_location_clinic

        payload = {
            "patient": patient.id,
            "visit": visit.id,
            "priority": priority,
            "clinical_notes": f"Annual check-up {annual_checkup.programme_year} panel",
            "tests_data": lab_tests_data,
        }
        if session:
            payload["consultation_session"] = session.id
        location_clinic = resolve_order_location_clinic(visit=visit, session=session, user=user)
        if location_clinic is not None:
            payload["location_clinic"] = location_clinic.id
        serializer = LabOrderSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        lab_order = serializer.save(created_by=user, doctor=user)
        lab_order_id = lab_order.id

    if radiology_studies_data:
        from common.order_location import resolve_order_location_clinic

        payload = {
            "patient": patient.id,
            "visit": visit.id,
            "priority": priority,
            "clinical_notes": f"Annual check-up {annual_checkup.programme_year} imaging",
            "studies_data": radiology_studies_data,
        }
        if session:
            payload["consultation_session"] = session.id
        location_clinic = resolve_order_location_clinic(visit=visit, session=session, user=user)
        if location_clinic is not None:
            payload["location_clinic"] = location_clinic.id
        serializer = RadiologyOrderSerializer(data=payload)
        serializer.is_valid(raise_exception=True)
        rad_order = serializer.save(created_by=user, doctor=user)
        radiology_order_id = rad_order.id

    refresh_components_completed(annual_checkup)

    return {
        "lab_order_id": lab_order_id,
        "radiology_order_id": radiology_order_id,
        "ordered": ordered_labels,
        "skipped": skipped,
        "lab_tests_count": len(lab_tests_data),
        "radiology_studies_count": len(radiology_studies_data),
    }
