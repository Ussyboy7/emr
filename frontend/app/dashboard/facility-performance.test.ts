import { describe, expect, it } from 'vitest';
import { formatFacilityMetric } from './facility-performance';

describe('formatFacilityMetric', () => {
  it('renders minutes, hiding null as an em dash', () => {
    expect(formatFacilityMetric(null)).toBe('—');
    expect(formatFacilityMetric(30.0)).toBe('30 min');
    expect(formatFacilityMetric(0)).toBe('0 min');
  });

  it('renders completion rate as a percentage', () => {
    expect(formatFacilityMetric(50.0, 'percent')).toBe('50%');
    expect(formatFacilityMetric(0, 'percent')).toBe('0%');
  });
});