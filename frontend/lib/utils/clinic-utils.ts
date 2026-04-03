/**
 * Utility functions for clinic name normalization and comparison.
 * Ensures consistent handling of clinic names across the application.
 */

import { CLINICS } from '@/lib/constants/clinics';

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

/**
 * Normalize clinic name to standard format (title case).
 * Handles various input formats and converts to canonical clinic name.
 *
 * @param clinic - Raw clinic name from API or user input
 * @returns Normalized clinic name matching one of the standard clinics, or the input if no match; empty in → empty out
 */
export function normalizeClinicName(clinic: string | null | undefined): string {
  if (!clinic || !clinic.trim()) {
    return '';
  }

  const trimmed = clinic.trim();

  const titleCase = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();

  const matched = CLINICS.find(
    (c) =>
      c.toLowerCase() === titleCase.toLowerCase() || c.toLowerCase() === trimmed.toLowerCase()
  );

  if (matched) {
    return matched;
  }

  const variations: Record<string, string> = {
    eye: 'Eye Clinic',
    'eye clinic': 'Eye Clinic',
    ophthalmology: 'Eye Clinic',
    'sickle cell': 'Sickle Cell',
    'sickle cell clinic': 'Sickle Cell',
    diamond: 'Diamond',
    'diamond club': 'Diamond',
    'diamond club clinic': 'Diamond',
    physiotherapy: 'Physiotherapy',
    'physiotherapy clinic': 'Physiotherapy',
    general: 'GOPD',
    'general clinic': 'GOPD',
    gopd: 'GOPD',
    healthron: 'Healthron',
    'healthron clinic': 'Healthron',
    dental: 'Dental',
    'dental clinic': 'Dental',
    dentistry: 'Dental',
  };

  const lower = trimmed.toLowerCase();
  if (variations[lower]) {
    return variations[lower];
  }

  return titleCase;
}

/**
 * Check if two clinic names match (case-insensitive).
 */
export function clinicMatches(
  clinic1: string | null | undefined,
  clinic2: string | null | undefined
): boolean {
  const a = normalizeClinicName(clinic1);
  const b = normalizeClinicName(clinic2);
  if (!a || !b) return false;
  return a === b;
}

/**
 * Check if a clinic name is valid (matches one of the standard clinics).
 */
export function isValidClinic(clinic: string | null | undefined): boolean {
  if (!clinic || !String(clinic).trim()) return false;
  const normalized = normalizeClinicName(clinic);
  if (!normalized) return false;
  return CLINICS.includes(normalized as (typeof CLINICS)[number]);
}

/**
 * Get clinic value for API/filter usage.
 */
export function getClinicValue(clinic: string | null | undefined): string {
  return normalizeClinicName(clinic);
}
