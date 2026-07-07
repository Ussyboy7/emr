import { describe, expect, it } from 'vitest';
import {
  getConsultationLegState,
  legNeedsRoutingAction,
  normalizeOrderLegState,
} from './visit-leg-status';

describe('visit-leg-status', () => {
  it('marks consultation leg completed when clinic is in completedClinics', () => {
    const state = getConsultationLegState({
      visitClinics: ['GOPD', 'Physiotherapy'],
      completedClinics: ['GOPD'],
      opdClinicNames: ['GOPD', 'Physiotherapy', 'Eye Clinic'],
    });
    expect(state).toBe('completed');
  });

  it('does not offer routing action for completed legs', () => {
    expect(legNeedsRoutingAction('completed')).toBe(false);
    expect(legNeedsRoutingAction('pending')).toBe(true);
  });

  it('normalizes order leg state from API', () => {
    expect(normalizeOrderLegState('completed')).toBe('completed');
    expect(normalizeOrderLegState(undefined)).toBe('pending');
  });
});
