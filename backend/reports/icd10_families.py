"""Curated ICD-10 disease-family grouping for diagnosis reports.

Grouping resolves an ICD-10 code to a clinically meaningful "family" so that
related sub-codes (e.g. B50, B50.9, B54) count as one row (e.g. "Malaria").

Resolution order:
  1. Curated family overrides (finer-grained than WHO blocks).
  2. WHO ICD-10 block ranges from the bundled groups file.
  3. Fallback: the 3-char category prefix of the code itself.
"""
from __future__ import annotations

from pathlib import Path

ICD10_DATA_DIR = Path(__file__).resolve().parents[1] / "common" / "data" / "icd10"
WHO_GROUPS_FILE = ICD10_DATA_DIR / "icd102019syst_groups.txt"

# Curated disease families. Ordered list of (start_prefix, end_prefix, label).
# These override the coarser WHO block for the most clinically relevant groups.
CURATED_FAMILIES: list[tuple[str, str, str]] = [
    ("A01", "A01", "Typhoid and paratyphoid fevers"),
    ("A15", "A19", "Tuberculosis"),
    ("A33", "A35", "Tetanus"),
    ("A80", "A80", "Poliomyelitis"),
    ("A90", "A90", "Dengue fever"),
    ("A96", "A96", "Lassa fever"),
    ("A98", "A98", "Other viral haemorrhagic fevers"),
    ("B15", "B19", "Viral hepatitis"),
    ("B50", "B54", "Malaria"),
    ("C50", "C50", "Breast cancer"),
    ("C61", "C61", "Prostate cancer"),
    ("D50", "D53", "Nutritional anaemia"),
    ("E08", "E14", "Diabetes mellitus"),
    ("E40", "E46", "Malnutrition"),
    ("E66", "E66", "Obesity"),
    ("F32", "F33", "Depression"),
    ("G40", "G41", "Epilepsy"),
    ("H40", "H40", "Glaucoma"),
    ("H52", "H52", "Refractive error"),
    ("I10", "I15", "Hypertensive diseases"),
    ("I20", "I25", "Ischaemic heart disease"),
    ("I60", "I69", "Cerebrovascular disease"),
    ("I80", "I89", "Venous disorders"),
    ("J00", "J06", "Acute upper respiratory infections"),
    ("J09", "J18", "Influenza and pneumonia"),
    ("J20", "J22", "Acute lower respiratory infections"),
    ("J40", "J47", "Chronic lower respiratory disease"),
    ("K25", "K27", "Peptic ulcer disease"),
    ("K35", "K38", "Appendicitis"),
    ("K50", "K52", "Noninfective enteritis and colitis"),
    ("K80", "K87", "Gallbladder and biliary disease"),
    ("L20", "L30", "Dermatitis and eczema"),
    ("M15", "M19", "Osteoarthritis"),
    ("M05", "M14", "Inflammatory polyarthropathies"),
    ("M50", "M54", "Dorsopathies"),
    ("N10", "N16", "Renal tubulo-interstitial disease"),
    ("N17", "N19", "Renal failure"),
    ("N20", "N23", "Urolithiasis"),
    ("N30", "N39", "Other urinary system disease"),
    ("N40", "N51", "Male genital organ disease"),
    ("N80", "N98", "Noninflammatory female genital disorder"),
    ("O10", "O16", "Hypertensive disorders in pregnancy"),
    ("O80", "O84", "Delivery"),
    ("R10", "R19", "Abdominal and pelvic symptoms"),
    ("R50", "R69", "General symptoms and signs"),
    ("Z00", "Z13", "Health examination and investigation"),
]

# WHO ICD-10 block ranges: (start, end, label). Loaded once from the bundled file.
WHO_BLOCKS: list[tuple[str, str, str]] = []


def _load_who_blocks_into(blocks: list) -> None:
    if not WHO_GROUPS_FILE.exists():
        return
    for raw in WHO_GROUPS_FILE.read_text(encoding="utf-8").splitlines():
        parts = raw.split(";")
        if len(parts) >= 4:
            start, end, _, label = parts[0], parts[1], parts[2], parts[3]
            blocks.append((start.strip(), end.strip(), label.strip()))


def _prefix(code: str) -> str:
    return (code or "").strip().upper()[:3]


def resolve_family(code: str) -> str:
    """Resolve an ICD-10 code to a disease-family label."""
    label, _, _ = resolve_family_range(code)
    return label


def resolve_family_range(code: str) -> tuple[str, str, str]:
    """Resolve an ICD-10 code to ``(label, start_prefix, end_prefix)``.

    ``start``/``end`` are the matched range boundaries, useful for building a
    display range such as ``B50–B54`` for a family row.
    """
    prefix = _prefix(code)
    if not prefix:
        return (code or "").strip() or "—", prefix, prefix

    for start, end, label in CURATED_FAMILIES:
        if start <= prefix <= end:
            return label, start, end

    if not WHO_BLOCKS:
        _load_who_blocks_into(WHO_BLOCKS)
    for start, end, label in WHO_BLOCKS:
        if start <= prefix <= end:
            return label, start, end

    return prefix, prefix, prefix