import { describe, expect, it } from 'vitest';
import type { Diagnosis } from '@/lib/services';
import {
  DUPLICATE_VISIT_DIAGNOSIS_MESSAGE,
  getDuplicateVisitDiagnosisMessage,
  hasVisitDiagnosis,
} from './visit-diagnoses';

const dx = (overrides: Partial<Diagnosis>): Diagnosis => ({
  id: 1,
  patient: 10,
  visit: 20,
  icd10_code: 100,
  diagnosis_text: '',
  status: 'confirmed',
  certainty: 'confirmed',
  diagnosed_at: '2026-01-01T00:00:00Z',
  notes: '',
  ...overrides,
});

describe('hasVisitDiagnosis', () => {
  it('returns true when icd10 and visit match', () => {
    expect(hasVisitDiagnosis([dx({ icd10_code: 100, visit: 20 })], 100, 20)).toBe(true);
  });

  it('returns false for same icd10 on a different visit', () => {
    expect(hasVisitDiagnosis([dx({ icd10_code: 100, visit: 20 })], 100, 99)).toBe(false);
  });

  it('returns false for a different icd10 on the same visit', () => {
    expect(hasVisitDiagnosis([dx({ icd10_code: 100, visit: 20 })], 200, 20)).toBe(false);
  });

  it('treats missing visit as null', () => {
    expect(hasVisitDiagnosis([dx({ visit: undefined })], 100, null)).toBe(true);
    expect(hasVisitDiagnosis([dx({ visit: 20 })], 100, null)).toBe(false);
  });
});

describe('getDuplicateVisitDiagnosisMessage', () => {
  it('maps backend unique constraint errors', () => {
    const err = new Error('The fields patient, visit, icd10_code must make a unique set.');
    expect(getDuplicateVisitDiagnosisMessage(err)).toBe(DUPLICATE_VISIT_DIAGNOSIS_MESSAGE);
  });

  it('maps explicit validation copy', () => {
    const err = new Error('This ICD-10 code is already recorded for this visit.');
    expect(getDuplicateVisitDiagnosisMessage(err)).toBe(DUPLICATE_VISIT_DIAGNOSIS_MESSAGE);
  });

  it('returns null for unrelated errors', () => {
    expect(getDuplicateVisitDiagnosisMessage(new Error('Network error'))).toBeNull();
  });
});
