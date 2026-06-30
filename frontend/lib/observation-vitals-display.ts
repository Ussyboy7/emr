import type { AdmissionObservationVital } from '@/lib/services/ward-service';

const SPO2_LINE_RE = /^\s*SpO2\s*([0-9.]+)\s*%?\s*$/i;

/** Parse SpO2 from the legacy "SpO2 98%" first line in observation vital notes. */
export function parseSpo2FromObservationNotes(notes?: string | null): string | null {
  for (const line of (notes || '').split('\n')) {
    const m = line.trim().match(SPO2_LINE_RE);
    if (m?.[1]) return m[1];
  }
  return null;
}

/** Nurse-facing notes on a vital row (excludes SpO2 machine line). */
export function nurseNotesFromObservationVital(notes?: string | null): string {
  return (notes || '')
    .split('\n')
    .filter((line) => !SPO2_LINE_RE.test(line.trim()))
    .join('\n')
    .trim();
}

export function truncateObservationNote(text: string, max = 48): string {
  const t = text.trim();
  if (!t) return '—';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

export function formatObservationBp(
  systolic?: number | null,
  diastolic?: number | null,
): string {
  if (systolic != null && diastolic != null) return `${systolic}/${diastolic}`;
  return '—';
}

export function formatObservationCell(
  value: string | number | null | undefined,
  unit?: string,
): string {
  if (value == null || value === '') return '—';
  return unit ? `${value}${unit}` : String(value);
}

/** Map ward admission vital → VitalsDetailModal shape (pool queue parity). */
export function observationVitalToDetail(
  v: AdmissionObservationVital,
  wardName?: string | null,
) {
  const spo2 = parseSpo2FromObservationNotes(v.notes);
  const nurseNotes = nurseNotesFromObservationVital(v.notes);
  const glucoseLines: string[] = [];
  if (v.fbs_mmol != null && v.fbs_mmol !== '') glucoseLines.push(`FBS ${v.fbs_mmol} mmol/L`);
  if (v.rbs_mmol != null && v.rbs_mmol !== '') glucoseLines.push(`RBS ${v.rbs_mmol} mmol/L`);
  const combinedNotes = [nurseNotes, glucoseLines.join(', ')].filter(Boolean).join('\n');
  const location = wardName?.trim() ? `${wardName.trim()} (ward)` : 'Ward';

  return {
    id: v.id,
    recorded_at: v.recorded_at,
    recorded_by_name: v.recorded_by_name ?? undefined,
    location_clinic_name: location,
    temperature: v.temperature_c != null ? String(v.temperature_c) : undefined,
    pulse: v.pulse != null ? String(v.pulse) : undefined,
    heartRate: v.pulse != null ? String(v.pulse) : undefined,
    bloodPressureSystolic: v.bp_systolic != null ? String(v.bp_systolic) : undefined,
    bloodPressureDiastolic: v.bp_diastolic != null ? String(v.bp_diastolic) : undefined,
    respiratoryRate: v.respiratory_rate != null ? String(v.respiratory_rate) : undefined,
    oxygenSaturation: spo2 ?? undefined,
    notes: combinedNotes || undefined,
  };
}
