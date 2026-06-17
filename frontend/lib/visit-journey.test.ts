import { describe, expect, it } from 'vitest';
import {
  toVisitJourneyDisplayVisit,
  type VisitJourneyRawVisit,
} from './visit-journey';

describe('toVisitJourneyDisplayVisit', () => {
  const base: VisitJourneyRawVisit = {
    id: 42,
    visit_id: 'V-2026-001',
    patient: 7,
    date: '2026-06-15',
    time: '09:30',
    visit_type: 'consultation',
    clinic: 'GOPD',
    location_clinic_name: 'GOPD Main',
    doctor_name: 'Dr. Ade',
    clinical_notes: 'Follow-up',
    status: 'in_progress',
  };

  it('maps visit_id and numeric id for display', () => {
    const display = toVisitJourneyDisplayVisit(base);
    expect(display.id).toBe('V-2026-001');
    expect(display.numericId).toBe(42);
    expect(display.patientId).toBe('7');
  });

  it('falls back to numeric id when visit_id is missing', () => {
    const display = toVisitJourneyDisplayVisit({ ...base, visit_id: undefined });
    expect(display.id).toBe('42');
  });

  it('applies defaults for optional fields', () => {
    const display = toVisitJourneyDisplayVisit({
      id: 1,
      patient: 2,
    });
    expect(display.type).toBe('consultation');
    expect(display.status).toBe('scheduled');
    expect(display.doctor).toBe('Doctor');
    expect(display.notes).toBe('');
    expect(display.date).toBe('');
    expect(display.time).toBe('');
  });

  it('preserves clinic and doctor display fields', () => {
    const display = toVisitJourneyDisplayVisit(base);
    expect(display.department).toBe('GOPD');
    expect(display.location_clinic_name).toBe('GOPD Main');
    expect(display.doctor).toBe('Dr. Ade');
    expect(display.notes).toBe('Follow-up');
    expect(display.status).toBe('in_progress');
  });
});
