"""Shared ICD-10 code + description aggregation for MR diagnosis reports."""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from common.diagnosis_resolution import ResolvedDiagnosis
from reports.icd10_families import resolve_family_range


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


def filter_icd_counts(
    counts: dict[tuple[str, str], int],
    search: str | None,
) -> dict[tuple[str, str], int]:
    """Case-insensitive filter on code or description."""
    term = (search or "").strip().lower()
    if not term:
        return counts
    return {
        key: value
        for key, value in counts.items()
        if term in (key[0] or "").lower() or term in (key[1] or "").lower()
    }


def build_icd_frequency_rows(
    counts: dict[tuple[str, str], int],
    *,
    include_percentage: bool = True,
    grand_total: int | None = None,
) -> list[dict]:
    total = grand_total if grand_total is not None else sum(counts.values())
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


def group_icd_frequency_rows_by_family(
    rows: list[dict],
    *,
    grand_total: int,
) -> list[dict]:
    """Collapse code-level frequency rows into ICD-10 family ranges."""
    families: dict[str, dict] = defaultdict(
        lambda: {
            "label": "",
            "range_start": "",
            "range_end": "",
            "count": 0,
            "codes": set(),
        }
    )
    for item in rows:
        code = item.get("code") or "—"
        description = item.get("description") or ""
        label, range_start, range_end = resolve_family_range(code)
        entry = families[label]
        entry["label"] = label
        entry["range_start"] = range_start
        entry["range_end"] = range_end
        entry["count"] += int(item.get("count") or 0)
        entry["codes"].add(f"{code} — {description}" if description and description != "—" else code)

    family_rows: list[dict] = []
    for sn, entry in enumerate(
        sorted(families.values(), key=lambda e: (-e["count"], e["label"])),
        start=1,
    ):
        range_start, range_end = entry["range_start"], entry["range_end"]
        code = (
            f"{range_start}–{range_end}"
            if range_start and range_end and range_start != range_end
            else range_start or "—"
        )
        count = entry["count"]
        family_rows.append(
            {
                "sn": sn,
                "code": code,
                "description": entry["label"],
                "diagnosis": entry["label"],
                "count": count,
                "total": count,
                "codes": sorted(entry["codes"]),
                "codes_count": len(entry["codes"]),
                "percentage": round((count / grand_total * 100) if grand_total > 0 else 0, 1),
            }
        )
    return family_rows


def finalize_icd_frequency_report(
    counts: dict[tuple[str, str], int],
    *,
    limit: int | None = None,
    page: int | None = None,
    page_size: int | None = None,
    search: str | None = None,
    group_by: str | None = None,
) -> tuple[list[dict], dict]:
    """
    Apply search → code rows → optional family grouping → Top N → pagination.

    Returns ``(data_rows, summary_fragment)``.
    """
    if limit is not None:
        limit = max(1, min(int(limit), 1000))
    if page is not None:
        page = max(1, int(page))
    if page_size is not None:
        page_size = max(1, min(int(page_size), 100))

    filtered = filter_icd_counts(counts, search)
    grand_total = sum(filtered.values())
    code_rows = build_icd_frequency_rows(filtered, grand_total=grand_total)
    distinct_codes = len(code_rows)

    if group_by == "family":
        ranked = group_icd_frequency_rows_by_family(code_rows, grand_total=grand_total)
    else:
        ranked = code_rows

    if limit is not None:
        ranked = ranked[:limit]

    # Re-number after Top N so S/N matches the visible ranking.
    for sn, row in enumerate(ranked, start=1):
        row["sn"] = sn

    ranking_count = len(ranked)
    if page is not None and page_size is not None:
        start = (page - 1) * page_size
        end = start + page_size
        data = ranked[start:end]
    else:
        data = ranked

    summary = {
        "total_diagnosis_lines": grand_total,
        "distinct_icd10_codes": distinct_codes,
        "ranking_count": ranking_count,
        "limit": limit,
        "page": page,
        "page_size": page_size,
        "group_by": "family" if group_by == "family" else "code",
        "grand_total": grand_total,
    }
    return data, summary


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
