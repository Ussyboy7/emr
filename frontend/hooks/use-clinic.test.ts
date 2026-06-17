import { describe, expect, it, vi } from 'vitest';

const mockContext = {
  activeClinicId: 1,
  activeClinicName: 'Main Clinic',
  clinics: [{ id: 1, name: 'Main Clinic' }, { id: 2, name: 'Branch Clinic' }],
  isMultiClinic: true,
  switchClinic: vi.fn(),
  loading: false,
};

vi.mock('@/contexts/ClinicContext', () => ({
  useClinicContext: vi.fn(() => mockContext),
}));

import { useClinic } from './use-clinic';

describe('useClinic', () => {
  it('returns clinic context values', () => {
    const result = useClinic();
    expect(result.activeClinicId).toBe(1);
    expect(result.activeClinicName).toBe('Main Clinic');
    expect(result.clinics).toHaveLength(2);
    expect(result.isMultiClinic).toBe(true);
    expect(result.loading).toBe(false);
    expect(typeof result.switchClinic).toBe('function');
  });
});
