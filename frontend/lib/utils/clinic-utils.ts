/**
 * Utility functions for clinic name normalization and comparison.
 * Canonical OPD names should come from GET /organization/outpatient-clinic-types/.
 */

/**
 * Join non-empty parts for subtitles (no placeholder when data is missing).
 */
export function joinDisplayParts(
  parts: Array<string | number | null | undefined | false>,
  sep = ' • '
): string {
  return parts
    .map((p) => {
      if (p == null || p === false) return '';
      const s = String(p).trim();
      return s;
    })
    .filter(Boolean)
    .join(sep);
}

/**
 * Ordered unique service clinic names from visit (primary `clinic` first, then `clinics` array).
 * Does not default to GOPD — empty input yields [].
 */
export function getVisitServiceClinicsList(visitLike: {
  clinic?: string | null;
  clinics?: string[] | null;
}): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();
  const add = (v: string | null | undefined) => {
    const t = (v && String(v).trim()) || '';
    if (!t || seen.has(t)) return;
    seen.add(t);
    ordered.push(t);
  };
  add(visitLike.clinic);
  if (Array.isArray(visitLike.clinics)) {
    visitLike.clinics.forEach((c) => add(c));
  }
  return ordered;
}

/** Comma-separated display for service clinics; empty if none. */
export function getVisitServiceClinicsDisplay(visitLike: {
  clinic?: string | null;
  clinics?: string[] | null;
}): string {
  return getVisitServiceClinicsList(visitLike).join(', ');
}

function matchCanonical(
  value: string,
  canonicalNames?: readonly string[] | null
): string | null {
  if (!canonicalNames?.length || !value?.trim()) return null;
  const vl = value.trim().toLowerCase();
  for (const c of canonicalNames) {
    if (c.toLowerCase() === vl) return c;
  }
  return null;
}

/**
 * Normalize a visit service clinic string toward a canonical API name when possible.
 *
 * @param canonicalNames — Active `OutpatientClinicType.name` list from the API (optional).
 */
export function normalizeClinicName(
  clinic: string | null | undefined,
  canonicalNames?: readonly string[] | null
): string {
  if (!clinic || !clinic.trim()) {
    return '';
  }

  const trimmed = clinic.trim();

  const direct = matchCanonical(trimmed, canonicalNames);
  if (direct) return direct;

  const titleCase =
    trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase() : '';
  const titleHit = matchCanonical(titleCase, canonicalNames);
  if (titleHit) return titleHit;

  const variations: Record<string, string> = {
    eye: 'Eye Clinic',
    'eye clinic': 'Eye Clinic',
    eyecare: 'Eye Clinic',
    ophthalmology: 'Eye Clinic',
    'ophthalmology clinic': 'Eye Clinic',
    'sickle cell': 'Sickle Cell',
    'sickle cell clinic': 'Sickle Cell',
    diamond: 'Diamond',
    'diamond club': 'Diamond',
    'diamond club clinic': 'Diamond',
    physiotherapy: 'Physiotherapy',
    'physiotherapy clinic': 'Physiotherapy',
    general: 'GOPD',
    'general clinic': 'GOPD',
    'general outpatient': 'GOPD',
    'general out-patient': 'GOPD',
    'general opd': 'GOPD',
    'gen opd': 'GOPD',
    'g.o.p': 'GOPD',
    'g.o.p.': 'GOPD',
    'g.o.p.d': 'GOPD',
    'g.o.p.d.': 'GOPD',
    gop: 'GOPD',
    gopd: 'GOPD',
    healthron: 'Healthron',
    'healthron clinic': 'Healthron',
    dental: 'Dental',
    'dental clinic': 'Dental',
    dentistry: 'Dental',
  };

  const lower = trimmed.toLowerCase();
  const viaVar = variations[lower];
  if (viaVar) {
    const hit = matchCanonical(viaVar, canonicalNames);
    if (hit) return hit;
    return viaVar;
  }

  return trimmed;
}

/**
 * Check if two clinic names match (case-insensitive), optionally resolving via canonical list.
 */
export function clinicMatches(
  clinic1: string | null | undefined,
  clinic2: string | null | undefined,
  canonicalNames?: readonly string[] | null
): boolean {
  const a = normalizeClinicName(clinic1, canonicalNames);
  const b = normalizeClinicName(clinic2, canonicalNames);
  if (!a || !b) return false;
  return a.toLowerCase() === b.toLowerCase();
}
