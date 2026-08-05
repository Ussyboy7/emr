import { describe, expect, it } from 'vitest';
import {
  isClinicAllowed,
  recordClinicId,
  clinicGuardRowClass,
} from './clinic-guard';

describe('clinic-guard', () => {
  it('extracts the org clinic id', () => {
    expect(recordClinicId({ locationClinicId: 3 })).toBe(3);
    expect(recordClinicId({ clinicId: 7 })).toBe(7);
    expect(recordClinicId({ locationClinicId: 3, clinicId: 7 })).toBe(3);
    expect(recordClinicId({})).toBeNull();
    expect(recordClinicId({ locationClinicId: null })).toBeNull();
  });

  it('allows everything in aggregate (null active clinic) view', () => {
    expect(isClinicAllowed({ locationClinicId: 1 }, null)).toBe(true);
    expect(isClinicAllowed({ locationClinicId: 2 }, null)).toBe(true);
  });

  it('allows records matching the active clinic', () => {
    expect(isClinicAllowed({ locationClinicId: 5 }, 5)).toBe(true);
  });

  it('flags records from another clinic', () => {
    expect(isClinicAllowed({ locationClinicId: 5 }, 6)).toBe(false);
  });

  it('does not flag records without clinic attribution', () => {
    expect(isClinicAllowed({}, 6)).toBe(true);
  });

  it('returns a warning tint only for out-of-scope rows', () => {
    expect(clinicGuardRowClass({ locationClinicId: 5 }, 6)).toContain('amber');
    expect(clinicGuardRowClass({ locationClinicId: 5 }, 5)).toBe('');
    expect(clinicGuardRowClass({}, 5)).toBe('');
  });
});
