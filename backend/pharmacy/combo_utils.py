"""
Parse combination-product generic names for pharmacy (split / UI / split-combo API).

Slashes in strengths (e.g. 8mg/500mg) must not create extra "components".
"""

from __future__ import annotations

import re
from typing import List

# Split on "+" or "and", or on "/" only when the next non-space char is a letter
# (starts a drug name, not a digit in a strength).
_COMBO_SPLIT_PATTERN = re.compile(
    r"\s*\+\s*|\s+and\s+|\s*/\s*(?=[A-Za-z])",
    flags=re.IGNORECASE,
)

# Drop tokens that are only a dose/strength fragment (safety net after split).
_STRENGTH_LIKE = re.compile(
    r"^[\d./\s,+-]+(mg|mcg|µg|ug|g|ml|l|iu|units?)\s*$",
    re.IGNORECASE,
)


def combo_component_names_from_display_name(name: str) -> List[str]:
    """
    Return ordered, de-duplicated component name strings for a combination generic.

    Examples:
        "Codeine/Paracetamol" -> ["Codeine", "Paracetamol"]
        "Codeine/Paracetamol8mg/500mg" -> ["Codeine", "Paracetamol8mg/500mg"]  (not three parts)
    """
    raw = (name or "").strip()
    if not raw:
        return []
    parts = _COMBO_SPLIT_PATTERN.split(raw)
    out: List[str] = []
    seen: set[str] = set()
    for p in parts:
        p = p.strip()
        if not p or _STRENGTH_LIKE.match(p):
            continue
        k = p.lower()
        if k in seen:
            continue
        seen.add(k)
        out.append(p)
    return out
