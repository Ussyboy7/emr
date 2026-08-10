# Disease Pattern Reports — Search Feature

**Date:** 2026-08-10
**Status:** Approved (design gate passed)

## Summary

Add a search filter to the three ICD-10 diagnosis reports under Medical Records:

- **Disease Pattern** (`/medical-records/reports/disease-pattern`)
- **Disease Pattern Compared** (`/medical-records/reports/disease-pattern-compared`)
- **Top Diagnoses** (`/medical-records/reports/top-diagnoses`)

The search matches an ICD-10 **code** OR **description** (case-insensitive
substring) and is implemented as a backend `?search=` query param, so the JSON
fetch, CSV export, and PDF export all respect the filter.

## Decisions (confirmed with user)

- Scope: all three report pages.
- Match fields: ICD-10 code + description.
- Mechanism: backend filter param (`?search=`), not client-side filtering.
- Summary behavior: when a search term is active, the **entire** report —
  summary cards, `%` column, and table — reflects the matching set.

## Backend

### `backend/reports/disease_pattern_report.py`

- `_diagnosis_qs(period_start, period_end, org_facility_id=None, search=None)`
  — when `search` is a non-empty string, add:
  ```python
  qs = qs.filter(
      Q(icd10_code__code__icontains=search)
      | Q(icd10_code__description__icontains=search)
  )
  ```
- `build_disease_pattern_report(..., search=None)` — accepts and forwards
  `search` to `_diagnosis_qs`.
- `build_disease_pattern_compared_report(..., search=None)` — accepts `search`
  and forwards it to each period's `build_disease_pattern_report` call.

Because the filter is applied to the queryset *before* the DB aggregation, the
counts, totals, percentages, and summary all recompute from the matching set.

### `backend/reports/top_diagnoses_report.py`

- `build_top_diagnoses_report(..., search=None)` — apply the same
  `code OR description` icontains filter to `qs` before the count /
  distinct / aggregation steps. `total_lines` (the percentage denominator)
  therefore reflects the filtered set, consistent with the pattern reports.

### `backend/reports/views.py`

- Add a small helper:
  ```python
  def _search_term(request):
      value = (request.query_params.get("search") or "").strip()
      return value or None
  ```
- Pass `search=_search_term(request)` in:
  - `DiseasePatternReportView.get`
  - `DiseasePatternComparedReportView.get`
  - `TopDiagnosesReportView.get`

### Exports

`respond_with_export` serializes the already-filtered `report` dict for both
CSV and PDF, so no export-specific changes are needed. Export row/percentage
numbers match the on-screen filtered table.

## Frontend

### New component `frontend/components/reports/ReportSearchField.tsx`

A labeled `Input` with a search icon, styled to match the existing
`ReportDateFilterFields` / `Top N` select fields. Props:

- `value: string`
- `onChange: (value: string) => void`
- `placeholder?: string` (default: `"Search code or description…"`)

### All three report pages

Each of:
- `frontend/app/medical-records/reports/disease-pattern/page.tsx`
- `frontend/app/medical-records/reports/disease-pattern-compared/page.tsx`
- `frontend/app/medical-records/reports/top-diagnoses/page.tsx`

changes:

1. Add `const [search, setSearch] = useState("");`
2. Build the API query with the search term included only when non-empty:
   ```ts
   const queryExtra: Record<string, string> = {};
   const term = search.trim();
   if (term) queryExtra.search = term;
   ```
   Use it in both `fetchReport` (`buildQuery(queryExtra)`) and
   `ReportExportButtons` (`buildQuery: () => period.buildQuery(queryExtra)`).
   On the **compared** page, keep the existing `{ periods: "3" }` extra and
   merge `search` into the same object (e.g. `{ periods: "3", ...queryExtra }`).
3. Add `search` to the `useMrReportAutoFetch` dependency array.
4. Render `ReportSearchField` in the Filters card and adjust the grid columns
   to fit it.

## Testing

- **Backend:** add/extend report view tests asserting that `?search=` filters
  results by code and by description, returns empty when no match, and that
  the search term does not break CSV/PDF export.
- **Frontend:** run `npm run type-check` and `npm run lint`; existing Vitest
  suites must remain green.

## Out of Scope

- No changes to the analytics/executive dashboards or `analytics-service.ts`.
- No pagination or result limits beyond the existing Top N.
- No autocomplete/suggest API — search is a plain substring filter.
