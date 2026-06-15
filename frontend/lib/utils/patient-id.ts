import { DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { patientService, type Patient } from '@/lib/services/patient-service';

/**
 * Resolve a patient reference (DB pk, display id like E-A2962, or numeric-looking id) to the numeric pk.
 */
export async function resolvePatientNumericId(idRef: string | number): Promise<number> {
  const raw = String(idRef).trim();
  if (!raw) {
    throw new Error('Patient ID is required');
  }

  if (/^\d+$/.test(raw)) {
    const parsed = parseInt(raw, 10);
    if (Number.isFinite(parsed) && parsed > 0) {
      try {
        await patientService.getPatient(parsed);
        return parsed;
      } catch {
        // Numeric display ids fall through to search.
      }
    }
  }

  const searchResult = await patientService.getPatients({
    search: raw,
    page_size: DEFAULT_LIST_PAGE_SIZE,
  });
  const upper = raw.toUpperCase();
  const matched =
    searchResult.results.find((p) => p.patient_id === raw) ||
    searchResult.results.find((p) => p.patient_id?.toUpperCase() === upper) ||
    searchResult.results.find((p) => String(p.id) === raw);

  if (!matched) {
    throw new Error(`Patient with ID "${raw}" not found`);
  }
  return matched.id;
}

/** Resolve id reference and load the full patient record. */
export async function resolvePatientRecord(idRef: string | number): Promise<Patient> {
  const numericId = await resolvePatientNumericId(idRef);
  return patientService.getPatient(numericId);
}
