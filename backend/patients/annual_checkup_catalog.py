"""
DB-backed annual check-up component catalog and programme defaults.

Seeded via migration; editable by administrators through the programme API.
"""

from __future__ import annotations

from datetime import date
from typing import Any

# Default catalog seeded on first migrate (admin can toggle active / defaults in UI).
SEED_COMPONENTS: list[dict[str, Any]] = [
    {
        "code": "vitals",
        "label": "Vitals (BP, HR, Temp, SpO₂, RR)",
        "captured_via": "vitals",
        "tier": "A",
        "sort_order": 10,
        "skippable": False,
        "lab_template_codes": [],
        "radiology_template_codes": [],
        "name_aliases": [],
    },
    {
        "code": "anthropometry",
        "label": "Anthropometry & BMI",
        "captured_via": "vitals",
        "tier": "A",
        "sort_order": 20,
        "skippable": False,
        "lab_template_codes": [],
        "radiology_template_codes": [],
        "name_aliases": [],
    },
    {
        "code": "vision_acuity",
        "label": "Visual acuity (Snellen)",
        "captured_via": "eyecare",
        "tier": "A",
        "sort_order": 30,
        "skippable": True,
        "lab_template_codes": [],
        "radiology_template_codes": [],
        "name_aliases": ["visual acuity", "snellen", "eye test"],
    },
    {
        "code": "lab_fbc",
        "label": "FBC",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 40,
        "skippable": True,
        "lab_template_codes": ["FBC"],
        "radiology_template_codes": [],
        "name_aliases": ["fbc", "full blood count", "complete blood count", "cbc"],
    },
    {
        "code": "lab_fbs",
        "label": "FBS (fasting blood sugar)",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 50,
        "skippable": True,
        "lab_template_codes": ["FBS"],
        "radiology_template_codes": [],
        "name_aliases": ["fbs", "fasting blood sugar", "fasting glucose", "fbg"],
    },
    {
        "code": "lab_urinalysis",
        "label": "Urinalysis",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 60,
        "skippable": True,
        "lab_template_codes": ["URINE-AX", "UA"],
        "radiology_template_codes": [],
        "name_aliases": ["urinalysis", "urine analysis", "ua"],
    },
    {
        "code": "lab_stool",
        "label": "Stool analysis",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 70,
        "skippable": True,
        "lab_template_codes": ["STOOL-AX"],
        "radiology_template_codes": [],
        "name_aliases": ["stool", "stool analysis", "faeces"],
    },
    {
        "code": "blood_group",
        "label": "Blood group",
        "captured_via": "patient_record",
        "tier": "A",
        "sort_order": 80,
        "skippable": True,
        "lab_template_codes": ["BG"],
        "radiology_template_codes": [],
        "name_aliases": ["blood group", "abo", "rh"],
    },
    {
        "code": "genotype",
        "label": "Haemoglobin genotype",
        "captured_via": "patient_record",
        "tier": "A",
        "sort_order": 90,
        "skippable": True,
        "lab_template_codes": ["HB-GT"],
        "radiology_template_codes": [],
        "name_aliases": ["genotype", "hb genotype", "haemoglobin genotype"],
    },
    {
        "code": "lab_hiv",
        "label": "HIV screening",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 100,
        "skippable": True,
        "lab_template_codes": ["RVS"],
        "radiology_template_codes": [],
        "name_aliases": ["hiv", "retroviral", "hiv 1/2"],
    },
    {
        "code": "lab_hep_b",
        "label": "Hepatitis B (HBsAg)",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 110,
        "skippable": True,
        "lab_template_codes": ["HBSAG"],
        "radiology_template_codes": [],
        "name_aliases": ["hepatitis b", "hbsag", "hep b"],
    },
    {
        "code": "lab_hep_c",
        "label": "Hepatitis C",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 120,
        "skippable": True,
        "lab_template_codes": ["HCV"],
        "radiology_template_codes": [],
        "name_aliases": ["hepatitis c", "hcv", "hep c"],
    },
    {
        "code": "lab_renal",
        "label": "Renal function test",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 125,
        "skippable": True,
        "lab_template_codes": ["RFT"],
        "radiology_template_codes": [],
        "name_aliases": ["renal function", "renal function test", "rft", "kidney function", "urea creatinine"],
    },
    {
        "code": "lab_liver",
        "label": "Liver function test",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 126,
        "skippable": True,
        "lab_template_codes": ["LFT"],
        "radiology_template_codes": [],
        "name_aliases": ["liver function", "liver function test", "lft", "hepatic panel"],
    },
    {
        "code": "lab_noble_cup",
        "label": "Noble Cup (urine drug screen)",
        "captured_via": "laboratory",
        "tier": "A",
        "sort_order": 130,
        "skippable": True,
        "lab_template_codes": ["NOBLE-CUP"],
        "radiology_template_codes": [],
        "name_aliases": ["noble cup", "drug screen"],
    },
    {
        "code": "history_review",
        "label": "Medical history review",
        "captured_via": "medical_history",
        "tier": "A",
        "sort_order": 140,
        "skippable": False,
        "lab_template_codes": [],
        "radiology_template_codes": [],
        "name_aliases": [],
    },
    {
        "code": "physical_exam",
        "label": "Physical examination",
        "captured_via": "consultation",
        "tier": "A",
        "sort_order": 150,
        "skippable": False,
        "lab_template_codes": [],
        "radiology_template_codes": [],
        "name_aliases": [],
    },
    {
        "code": "fitness_assessment",
        "label": "Doctor fitness assessment",
        "captured_via": "annual_checkup",
        "tier": "A",
        "sort_order": 160,
        "skippable": False,
        "lab_template_codes": [],
        "radiology_template_codes": [],
        "name_aliases": [],
    },
    {
        "code": "ecg",
        "label": "ECG",
        "captured_via": "radiology",
        "tier": "B",
        "sort_order": 200,
        "skippable": True,
        "lab_template_codes": [],
        "radiology_template_codes": ["OTHER-ECG-RESTING"],
        "name_aliases": ["ecg", "electrocardiogram", "ekg"],
    },
    {
        "code": "lab_hba1c",
        "label": "HbA1c",
        "captured_via": "laboratory",
        "tier": "B",
        "sort_order": 210,
        "skippable": True,
        "lab_template_codes": ["HBA1C"],
        "radiology_template_codes": [],
        "name_aliases": ["hba1c", "hb a1c", "glycated hemoglobin"],
    },
    {
        "code": "lab_lipid",
        "label": "Lipid profile",
        "captured_via": "laboratory",
        "tier": "B",
        "sort_order": 220,
        "skippable": True,
        "lab_template_codes": ["LIPID"],
        "radiology_template_codes": [],
        "name_aliases": ["lipid", "lipid profile", "cholesterol panel", "lipogram"],
    },
    {
        "code": "mammography",
        "label": "Mammography",
        "captured_via": "radiology",
        "tier": "B",
        "sort_order": 230,
        "skippable": True,
        "lab_template_codes": [],
        "radiology_template_codes": ["MG-SCREENING", "MG-DIAGNOSTIC"],
        "name_aliases": ["mammogram", "mammography", "breast imaging"],
    },
    {
        "code": "pap_smear",
        "label": "Pap smear",
        "captured_via": "laboratory",
        "tier": "B",
        "sort_order": 240,
        "skippable": True,
        "lab_template_codes": ["PAP-SMEAR"],
        "radiology_template_codes": [],
        "name_aliases": ["pap smear", "pap test", "cervical smear", "pap"],
    },
    {
        "code": "psa",
        "label": "PSA",
        "captured_via": "laboratory",
        "tier": "B",
        "sort_order": 250,
        "skippable": True,
        "lab_template_codes": ["PSA"],
        "radiology_template_codes": [],
        "name_aliases": ["psa", "prostate specific antigen"],
    },
    {
        "code": "chest_xray",
        "label": "Chest X-ray",
        "captured_via": "radiology",
        "tier": "B",
        "sort_order": 260,
        "skippable": True,
        "lab_template_codes": [],
        "radiology_template_codes": ["XR-CHEST-APPA", "XR-CHEST-PA-LAT"],
        "name_aliases": ["chest x-ray", "chest xray", "cxr", "chest radiograph"],
    },
    {
        "code": "abdominal_scan",
        "label": "Abdominal scan (ultrasound)",
        "captured_via": "radiology",
        "tier": "B",
        "sort_order": 270,
        "skippable": True,
        "lab_template_codes": [],
        "radiology_template_codes": ["US-SONO-ABDOMEN"],
        "name_aliases": ["abdominal scan", "abdominal ultrasound", "sono abdomen", "us abdomen"],
    },
]

# Standard occupational panel pre-ticked for new annual visits (admin-editable).
DEFAULT_SELECTED_CODES: list[str] = [
    "vitals",
    "anthropometry",
    "vision_acuity",
    "lab_fbc",
    "lab_fbs",
    "lab_urinalysis",
    "lab_stool",
    "blood_group",
    "genotype",
    "lab_hiv",
    "lab_hep_b",
    "lab_hep_c",
    "lab_renal",
    "lab_liver",
    "lab_noble_cup",
    "abdominal_scan",
    "history_review",
    "physical_exam",
    "fitness_assessment",
]


def seed_catalog_and_programme(apps, schema_editor):
    Component = apps.get_model("patients", "AnnualCheckupComponentDefinition")
    Programme = apps.get_model("patients", "AnnualCheckupProgrammeSettings")
    for row in SEED_COMPONENTS:
        Component.objects.update_or_create(code=row["code"], defaults=row)
    year = date.today().year
    Programme.objects.update_or_create(
        programme_year=year,
        defaults={"default_selected_codes": list(DEFAULT_SELECTED_CODES)},
    )


def get_active_catalog() -> list[Any]:
    from .models import AnnualCheckupComponentDefinition

    return list(
        AnnualCheckupComponentDefinition.objects.filter(is_active=True).order_by(
            "sort_order", "label"
        )
    )


def get_full_catalog() -> list[Any]:
    """All catalog rows (including inactive) for admin programme UI."""
    from .models import AnnualCheckupComponentDefinition

    return list(
        AnnualCheckupComponentDefinition.objects.all().order_by("sort_order", "label")
    )


def get_definition(code: str) -> Any | None:
    from .models import AnnualCheckupComponentDefinition

    try:
        return AnnualCheckupComponentDefinition.objects.get(code=code, is_active=True)
    except AnnualCheckupComponentDefinition.DoesNotExist:
        return None


def component_meta(code: str) -> dict[str, Any]:
    defn = get_definition(code)
    if defn:
        return {
            "code": defn.code,
            "label": defn.label,
            "captured_via": defn.captured_via,
            "skippable": defn.skippable,
            "tier": defn.tier,
            "lab_template_codes": defn.lab_template_codes or [],
            "radiology_template_codes": defn.radiology_template_codes or [],
            "name_aliases": defn.name_aliases or [],
        }
    return {
        "code": code,
        "label": code.replace("_", " ").title(),
        "captured_via": "consultation",
        "skippable": True,
        "tier": "?",
        "lab_template_codes": [],
        "radiology_template_codes": [],
        "name_aliases": [],
    }


def component_label(code: str) -> str:
    return component_meta(code)["label"]


def get_default_selected_codes(programme_year: int | None = None) -> list[str]:
    from .models import AnnualCheckupComponentDefinition, AnnualCheckupProgrammeSettings

    year = programme_year or date.today().year
    settings = (
        AnnualCheckupProgrammeSettings.objects.filter(programme_year=year)
        .order_by("-programme_year")
        .first()
    )
    if settings and settings.default_selected_codes:
        active = set(
            AnnualCheckupComponentDefinition.objects.filter(is_active=True).values_list(
                "code", flat=True
            )
        )
        return [c for c in settings.default_selected_codes if c in active]
    return list(DEFAULT_SELECTED_CODES)


def serialize_catalog_entry(defn) -> dict[str, Any]:
    return {
        "code": defn.code,
        "label": defn.label,
        "captured_via": defn.captured_via,
        "tier": defn.tier,
        "sort_order": defn.sort_order,
        "skippable": defn.skippable,
        "is_active": defn.is_active,
        "lab_template_codes": defn.lab_template_codes or [],
        "radiology_template_codes": defn.radiology_template_codes or [],
        "name_aliases": defn.name_aliases or [],
    }


EDITABLE_CATALOG_FIELDS = (
    "label",
    "captured_via",
    "tier",
    "sort_order",
    "is_active",
    "skippable",
    "lab_template_codes",
    "radiology_template_codes",
    "name_aliases",
)


def _normalize_catalog_code(raw: str) -> str:
    code = str(raw or "").strip().lower().replace("-", "_").replace(" ", "_")
    while "__" in code:
        code = code.replace("__", "_")
    return code.strip("_")


def create_catalog_component(data: dict[str, Any]) -> Any:
    """Create a new catalog investigation; raises ValueError on invalid data."""
    from .models import AnnualCheckupComponentDefinition

    code = _normalize_catalog_code(data.get("code"))
    if not code:
        raise ValueError("code is required")
    if not code.replace("_", "").isalnum():
        raise ValueError("code must be alphanumeric with underscores")
    if AnnualCheckupComponentDefinition.objects.filter(code=code).exists():
        raise ValueError(f"Catalog code already exists: {code}")

    label = str(data.get("label") or "").strip()
    if not label:
        raise ValueError("label is required")

    captured_via = data.get("captured_via")
    valid_via = {c[0] for c in AnnualCheckupComponentDefinition.CAPTURED_VIA_CHOICES}
    if captured_via not in valid_via:
        raise ValueError(f"Invalid captured_via: {captured_via}")

    tier = data.get("tier") or "A"
    if tier not in ("A", "B", "C"):
        raise ValueError("tier must be A, B, or C")

    return AnnualCheckupComponentDefinition.objects.create(
        code=code,
        label=label,
        captured_via=captured_via,
        tier=tier,
        sort_order=int(data.get("sort_order") or 0),
        is_active=bool(data.get("is_active", True)),
        skippable=bool(data.get("skippable", True)),
        lab_template_codes=data.get("lab_template_codes") or [],
        radiology_template_codes=data.get("radiology_template_codes") or [],
        name_aliases=data.get("name_aliases") or [],
    )


def create_catalog_components(creates: list[dict[str, Any]]) -> list[Any]:
    return [create_catalog_component(row) for row in creates]


def update_catalog_components(updates: list[dict[str, Any]]) -> list[Any]:
    """Apply admin catalog edits; raises ValueError for unknown codes."""
    from .models import AnnualCheckupComponentDefinition

    saved: list[Any] = []
    for row in updates:
        code = row.get("code")
        if not code:
            raise ValueError("Each catalog update must include a code.")
        try:
            defn = AnnualCheckupComponentDefinition.objects.get(code=code)
        except AnnualCheckupComponentDefinition.DoesNotExist as exc:
            raise ValueError(f"Unknown catalog code: {code}") from exc
        for field in EDITABLE_CATALOG_FIELDS:
            if field in row:
                setattr(defn, field, row[field])
        defn.save()
        saved.append(defn)
    return saved
