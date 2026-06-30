import type { Diagnosis } from '@/lib/services';

export const DUPLICATE_VISIT_DIAGNOSIS_MESSAGE =
  'This ICD-10 code is already recorded for this visit.';

/** Matches backend unique_together on (patient, visit, icd10_code). */
export function hasVisitDiagnosis(
  diagnoses: Diagnosis[],
  icd10CodeId: number,
  visitId?: number | null,
): boolean {
  const targetVisit = visitId ?? null;
  return diagnoses.some((d) => {
    if (d.icd10_code !== icd10CodeId) return false;
    return (d.visit ?? null) === targetVisit;
  });
}

export function getDuplicateVisitDiagnosisMessage(error: unknown): string | null {
  const parts: string[] = [];
  if (error instanceof Error) {
    parts.push(error.message);
    const apiMessage = (error as { apiMessage?: string }).apiMessage;
    if (apiMessage) parts.push(apiMessage);
  } else if (error != null) {
    parts.push(String(error));
  }

  const combined = parts.join(' ').toLowerCase();
  if (!combined) return null;

  if (combined.includes('already recorded for this visit')) {
    return DUPLICATE_VISIT_DIAGNOSIS_MESSAGE;
  }
  if (combined.includes('unique') && combined.includes('icd10')) {
    return DUPLICATE_VISIT_DIAGNOSIS_MESSAGE;
  }
  return null;
}
