"""
Annual employee check-up component definitions (Tier A + Tier B auto-rules).

Tier C role-specific components are deferred to v2.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class CheckupComponent:
    code: str
    label: str
    captured_via: str
    skippable: bool = False
    tier: str = "A"


TIER_A_COMPONENTS: list[CheckupComponent] = [
    CheckupComponent("vitals", "Vitals (BP, HR, Temp, SpO₂, RR)", "vitals", skippable=False),
    CheckupComponent("anthropometry", "Anthropometry & BMI", "vitals", skippable=False),
    CheckupComponent("vision_acuity", "Visual acuity (Snellen)", "eyecare", skippable=True),
    CheckupComponent("lab_fbc", "FBC", "laboratory", skippable=True),
    CheckupComponent("lab_fbs", "FBS", "laboratory", skippable=True),
    CheckupComponent("lab_urinalysis", "Urinalysis", "laboratory", skippable=True),
    CheckupComponent("history_review", "Medical history review", "medical_history", skippable=False),
    CheckupComponent("physical_exam", "Physical examination", "consultation", skippable=False),
    CheckupComponent("fitness_assessment", "Doctor fitness assessment", "annual_checkup", skippable=False),
]

TIER_B_COMPONENTS: list[CheckupComponent] = [
    CheckupComponent("ecg", "ECG", "consultation", skippable=True, tier="B"),
    CheckupComponent("lab_hba1c_lipids", "HbA1c & lipid profile", "laboratory", skippable=True, tier="B"),
    CheckupComponent("mammography", "Mammography", "radiology", skippable=True, tier="B"),
    CheckupComponent("pap_smear", "Pap smear", "laboratory", skippable=True, tier="B"),
    CheckupComponent("psa", "PSA", "laboratory", skippable=True, tier="B"),
    CheckupComponent("chest_xray", "Chest X-ray", "radiology", skippable=True, tier="B"),
]

ALL_COMPONENTS: dict[str, CheckupComponent] = {
    c.code: c for c in (*TIER_A_COMPONENTS, *TIER_B_COMPONENTS)
}

TIER_A_CODES: list[str] = [c.code for c in TIER_A_COMPONENTS]

FITNESS_OUTCOME_CHOICES = [
    ("fit", "Fit for duty"),
    ("fit_with_conditions", "Fit with conditions"),
    ("temporarily_unfit", "Temporarily unfit"),
    ("unfit", "Unfit for duty"),
]

OUTCOME_NOTE_TEMPLATES = [
    "Fit for duty without restrictions.",
    "Fit for duty with recommendation for lifestyle modification.",
    "Fit for desk duties; avoid strenuous physical activity pending review.",
    "Temporarily unfit — follow-up required before resuming full duties.",
    "Referred for specialist review; HR to note pending outcome.",
]

LAB_TEST_ALIASES: dict[str, tuple[str, ...]] = {
    "lab_fbc": ("fbc", "full blood count", "complete blood count", "cbc", "haematology", "hematology"),
    "lab_fbs": ("fbs", "fasting blood sugar", "fasting glucose", "fbg", "fasting blood glucose"),
    "lab_urinalysis": ("urinalysis", "urine analysis", "ua", "urine routine"),
    "lab_hba1c": ("hba1c", "hb a1c", "glycated hemoglobin", "glycated haemoglobin", "a1c"),
    "lab_lipid": ("lipid", "lipid profile", "cholesterol panel", "lipogram", "fasting lipids"),
    "lab_renal": ("renal function", "renal function test", "rft", "kidney function", "urea creatinine"),
    "lab_liver": ("liver function", "liver function test", "lft", "hepatic panel"),
    "pap_smear": ("pap smear", "pap test", "cervical smear", "pap"),
    "psa": ("psa", "prostate specific antigen", "prostate"),
}

RADIOLOGY_ALIASES: dict[str, tuple[str, ...]] = {
    "mammography": ("mammogram", "mammography", "breast imaging"),
    "chest_xray": ("chest x-ray", "chest xray", "cxr", "chest radiograph", "chest x ray"),
    "abdominal_scan": ("abdominal scan", "abdominal ultrasound", "sono abdomen", "us abdomen"),
    "ecg": ("ecg", "electrocardiogram", "ekg", "electrocardiography"),
}


def component_label(code: str) -> str:
    comp = ALL_COMPONENTS.get(code)
    return comp.label if comp else code.replace("_", " ").title()


def component_meta(code: str) -> dict[str, Any]:
    comp = ALL_COMPONENTS.get(code)
    if not comp:
        return {"code": code, "label": component_label(code), "skippable": True, "tier": "?"}
    return {
        "code": comp.code,
        "label": comp.label,
        "captured_via": comp.captured_via,
        "skippable": comp.skippable,
        "tier": comp.tier,
    }


def _patient_age(patient) -> int | None:
    try:
        age = patient.age
        return int(age) if age is not None else None
    except (TypeError, ValueError, AttributeError):
        return None


def _latest_bmi(patient, visit=None) -> float | None:
    from .models import VitalReading

    try:
        patient_pk = int(getattr(patient, "pk", None) or 0)
    except (TypeError, ValueError):
        return None
    if patient_pk <= 0:
        return None

    qs = VitalReading.objects.filter(patient_id=patient_pk)
    if visit is not None:
        qs = qs.filter(visit=visit)
    vital = qs.order_by("-recorded_at").first()
    if vital and vital.bmi is not None:
        return float(vital.bmi)
    return None


def _has_family_cardiac_history(patient) -> bool:
    try:
        history = patient.medical_history
    except Exception:
        return False
    keywords = ("cardiac", "heart", "coronary", "myocardial", "hypertension", "stroke")
    for entry in history.family_history or []:
        text = " ".join(
            str(v) for v in (entry.values() if isinstance(entry, dict) else [entry])
        ).lower()
        if any(k in text for k in keywords):
            return True
    return False


def _is_smoker(patient) -> bool:
    try:
        history = patient.medical_history
    except Exception:
        return False
    social = history.social_history or {}
    if isinstance(social, dict):
        smoking = str(social.get("smoking") or social.get("tobacco") or "").lower()
        if smoking in ("yes", "current", "active", "smoker", "true"):
            return True
        if "smok" in smoking and smoking not in ("no", "never", "non-smoker", "nonsmoker"):
            return True
    return False


def _has_known_ifg(patient) -> bool:
    try:
        history = patient.medical_history
    except Exception:
        return False
    keywords = ("ifg", "impaired fasting", "prediabetes", "pre-diabetes", "glucose intolerance")
    for dx in history.diagnoses or []:
        text = " ".join(
            str(v) for v in (dx.values() if isinstance(dx, dict) else [dx])
        ).lower()
        if any(k in text for k in keywords):
            return True
    return False


def _tier_b_ecg(patient, visit=None) -> bool:
    age = _patient_age(patient)
    bmi = _latest_bmi(patient, visit=visit)
    if age is not None and age >= 40:
        return True
    if bmi is not None and bmi >= 30:
        return True
    return _has_family_cardiac_history(patient)


def _tier_b_hba1c_lipids(patient, visit=None) -> bool:
    age = _patient_age(patient)
    if age is not None and age >= 40:
        return True
    return _has_known_ifg(patient)


def _tier_b_mammography(patient, programme_year: int) -> bool:
    if (patient.gender or "").lower() != "female":
        return False
    age = _patient_age(patient)
    return age is not None and age >= 40


def _tier_b_pap_smear(patient, programme_year: int) -> bool:
    if (patient.gender or "").lower() != "female":
        return False
    age = _patient_age(patient)
    return age is not None and age >= 25


def _tier_b_psa(patient) -> bool:
    if (patient.gender or "").lower() != "male":
        return False
    age = _patient_age(patient)
    return age is not None and age >= 50


def _tier_b_chest_xray(patient, programme_year: int) -> bool:
    # Desk-role 3-year rule deferred (needs occupational_category in v2).
    return _is_smoker(patient)


def compute_required_components(patient, programme_year: int | None = None, visit=None) -> list[str]:
    """Return ordered list of component codes required for this patient/year."""
    from datetime import date

    year = programme_year or date.today().year
    required = list(TIER_A_CODES)

    if _tier_b_ecg(patient, visit=visit):
        required.append("ecg")
    if _tier_b_hba1c_lipids(patient, visit=visit):
        required.append("lab_hba1c_lipids")
    if _tier_b_mammography(patient, year):
        required.append("mammography")
    if _tier_b_pap_smear(patient, year):
        required.append("pap_smear")
    if _tier_b_psa(patient):
        required.append("psa")
    if _tier_b_chest_xray(patient, year):
        required.append("chest_xray")

    return list(dict.fromkeys(required))
