export type FacilityMetricKind = 'minutes' | 'percent';

export function formatFacilityMetric(
  value: number | null,
  kind: FacilityMetricKind = 'minutes',
): string {
  if (value === null) return '—';
  if (kind === 'percent') {
    return value === 0 ? '0%' : `${value}%`;
  }
  return `${value} min`;
}