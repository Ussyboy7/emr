"""Shared ICD-10 code + description aggregation for MR diagnosis reports."""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from common.diagnosis_resolution import ResolvedDiagnosis


def _normalize_icd_row(code: str, description: str) -> tuple[str, str]:
    code = (code or "").strip().upper()
    description = (description or "").strip()
    return code, description


def increment_icd_counts(
    counts: dict[tuple[str, str], int],
    rows: Iterable[ResolvedDiagnosis],
) -> None:
    """Multi-count every resolved ICD row; skip empty entries."""
    for row in rows:
        code, description = _normalize_icd_row(
            row.get("code") or "",
            row.get("name") or row.get("description") or "",
        )
        if not code and not description:
            continue
        counts[(code, description)] += 1


def build_icd_frequency_rows(
    counts: dict[tuple[str, str], int],
    *,
    include_percentage: bool = True,
) -> list[dict]:
    total = sum(counts.values())
    sorted_items = sorted(counts.items(), key=lambda item: (-item[1], item[0][0], item[0][1]))
    result = []
    for sn, ((code, description), count) in enumerate(sorted_items, start=1):
        row = {
            "sn": sn,
            "code": code or "—",
            "description": description or "—",
            "diagnosis": f"{code} — {description}" if code and description else code or description,
            "count": count,
            "total": count,
        }
        if include_percentage:
            row["percentage"] = round((count / total * 100) if total > 0 else 0, 1)
        result.append(row)
    return result


def merge_icd_period_reports(
    period_slices: list[tuple],
    period_reports: list[dict],
) -> list[dict]:
    """
    Merge ICD disease-pattern reports across periods.

    Each period report must have ``data`` rows with ``code``, ``description``, and counts.
    """
    period_labels = [label for _, _, label in period_slices]
    merged: dict[str, dict] = {}

    for (_, _, label), report in zip(period_slices, period_reports):
        for row in report.get("data") or []:
            code = (row.get("code") or "").strip().upper() or "—"
            if code not in merged:
                merged[code] = {
                    "code": code,
                    "description": row.get("description") or "",
                    "periods": {},
                }
            merged[code]["periods"][label] = {
                "total": row.get("total", 0) or 0,
                "male": row.get("male", 0) or 0,
                "female": row.get("female", 0) or 0,
                "employee": row.get("employee", 0) or 0,
                "non_employee": row.get("non_employee", 0) or 0,
            }

    rows = []
    for sn, code in enumerate(
        sorted(
            merged.keys(),
            key=lambda c: (
                -max((merged[c]["periods"].get(lbl) or {}).get("total", 0) for lbl in period_labels),
                c,
            ),
        ),
        start=1,
    ):
        entry = merged[code]
        row = {
            "sn": sn,
            "code": entry["code"],
            "description": entry["description"],
            "diagnosis": f"{entry['code']} — {entry['description']}".strip(" —"),
            "periods": {},
        }
        for label in period_labels:
            row["periods"][label] = entry["periods"].get(
                label,
                {"total": 0, "male": 0, "female": 0, "employee": 0, "non_employee": 0},
            )
        rows.append(row)
    return rows
