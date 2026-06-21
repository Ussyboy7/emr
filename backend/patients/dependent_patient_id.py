"""Parse dependent patient IDs and resolve principals from personal numbers."""

from __future__ import annotations

import re

from patients.models import Patient

DEPENDENT_ID_RE = re.compile(r"^(ED|RD)-([^-]+)-(\d+)$", re.IGNORECASE)
# Legacy typo: retiree dependent stored as RD-R-{personal_number}-{seq}
MALFORMED_RD_R_RE = re.compile(r"^RD-R-([^-]+)-(\d+)$", re.IGNORECASE)


def normalize_dependent_patient_id_format(patient_id: str | None) -> str | None:
    """Return a canonical ED-/RD- patient_id, fixing known legacy typos."""
    raw = (patient_id or "").strip()
    if not raw:
        return raw
    if DEPENDENT_ID_RE.match(raw):
        return raw
    malformed = MALFORMED_RD_R_RE.match(raw)
    if malformed:
        return f"RD-{malformed.group(1).upper()}-{malformed.group(2)}"
    return raw


def parse_dependent_patient_id(patient_id: str | None):
    """Return (prefix, personal_number, sequence, preferred_principal_category) or None."""
    canonical = normalize_dependent_patient_id_format(patient_id)
    match = DEPENDENT_ID_RE.match(canonical or "")
    if not match:
        return None
    prefix = match.group(1).upper()
    personal_number = match.group(2).upper()
    sequence = int(match.group(3))
    preferred_category = "employee" if prefix == "ED" else "retiree"
    return prefix, personal_number, sequence, preferred_category


def find_principal_for_dependent_id(patient_id: str | None) -> Patient | None:
    parsed = parse_dependent_patient_id(patient_id)
    if not parsed:
        return None
    _prefix, personal_number, _sequence, preferred_category = parsed
    return find_principal_by_personal_number(personal_number, preferred_category)


def personal_number_lookup_variants(personal_number: str) -> list[str]:
    pn = (personal_number or "").strip().upper()
    if not pn:
        return []
    variants: list[str] = []
    for candidate in (pn, f"R-{pn}" if not pn.startswith("R-") else pn[2:]):
        if candidate and candidate not in variants:
            variants.append(candidate)
    return variants


def _principal_base_qs(*, include_inactive: bool = False):
    qs = Patient.objects.filter(
        category__in=["employee", "retiree"],
        merged_into__isnull=True,
    )
    if not include_inactive:
        qs = qs.filter(is_active=True)
    return qs


def _pick_principal(qs, preferred_category: str | None):
    if preferred_category:
        match = qs.filter(category=preferred_category).first()
        if match:
            return match
    return qs.first()


def find_principal_by_personal_number(
    personal_number: str,
    preferred_category: str | None = None,
) -> Patient | None:
    variants = personal_number_lookup_variants(personal_number)
    if not variants:
        return None

    for include_inactive in (False, True):
        base_qs = _principal_base_qs(include_inactive=include_inactive)

        for variant in variants:
            hit = _pick_principal(
                base_qs.filter(personal_number__iexact=variant),
                preferred_category,
            )
            if hit:
                return hit

        for variant in variants:
            for prefix in ("R", "E"):
                hit = base_qs.filter(patient_id__iexact=f"{prefix}-{variant}").first()
                if hit:
                    return hit

    return None


def describe_principal_lookup(personal_number: str, preferred_category: str | None = None) -> str:
    variants = personal_number_lookup_variants(personal_number)
    patient_ids = [f"R-{variant}" for variant in variants] + [f"E-{variant}" for variant in variants]
    return (
        f"tried personal_number in {variants}, patient_id in {patient_ids}"
        + (f", preferred_category={preferred_category}" if preferred_category else "")
    )


def normalize_person_name(patient: Patient) -> str:
    return " ".join(
        part
        for part in [
            (patient.surname or "").strip().upper(),
            (patient.first_name or "").strip().upper(),
            (patient.middle_name or "").strip().upper(),
        ]
        if part
    )
