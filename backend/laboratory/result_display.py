"""
Ordering and deduplication for structured lab result rows.

Mirrors ``buildOrderedLabResultViewRows`` / ``orderResultRows`` in
``frontend/lib/laboratory/template-utils.ts`` so PDFs and API consumers stay aligned.
"""


def normalize_order_key(s):
    """Whitespace-normalized lower key for ``normal_range._order`` lookups."""
    return " ".join(str(s or "").split()).strip().lower()


def _explicit_order_index_map(normal_range):
    if not isinstance(normal_range, dict):
        return {}
    order = normal_range.get("_order")
    if not isinstance(order, list):
        return {}
    return {normalize_order_key(k): i for i, k in enumerate(order) if isinstance(k, str)}


def sort_lab_result_rows_for_pdf(packed_rows, normal_range):
    """
    Sort (parameter, value, unit, ref, status, flag) tuples by template ``_order``,
    then alphabetically by parameter name.
    """
    idx_map = _explicit_order_index_map(normal_range)

    def sort_key(row):
        param = row[0]
        k = normalize_order_key(param)
        if k in idx_map:
            return (0, idx_map[k], param.lower())
        return (1, param.lower(), param)

    return sorted(packed_rows, key=sort_key)


def dedupe_result_alias_rows(packed_rows):
    """
    Drop a generic ``Result`` row when another analyte carries the same
    value, unit, and reference range text.
    """
    generic = next((r for r in packed_rows if normalize_order_key(r[0]) == "result"), None)
    if generic is None:
        return packed_rows
    _, gv, gu, gr, _, _ = generic
    gvn, gun, grn = str(gv).strip(), str(gu).strip().lower(), str(gr).strip().lower()

    def row_equiv(spec):
        if normalize_order_key(spec[0]) == "result":
            return False
        _, sv, su, sr, _, __ = spec
        return (
            str(sv).strip() == gvn
            and str(su).strip().lower() == gun
            and str(sr).strip().lower() == grn
        )

    if not any(row_equiv(r) for r in packed_rows):
        return packed_rows
    return [r for r in packed_rows if normalize_order_key(r[0]) != "result"]
