import type { VisitFilters } from '@/lib/services/visit-service';

export type PoolStatusFilter =
  | 'all'
  | 'pending'
  | 'vitals-recorded'
  | 'ready-for-consultation'
  | 'sent-to-room'
  | 'in-consultation'
  | 'sent-to-physiotherapy'
  | 'sent-to-eye-clinic'
  | 'completed';

export type PoolNursingStatus = NonNullable<VisitFilters['nursing_status']> | 'in_consultation';

const STATUS_TO_API: Partial<Record<PoolStatusFilter, PoolNursingStatus>> = {
  pending: 'pending',
  'vitals-recorded': 'vitals_incomplete',
  'ready-for-consultation': 'ready',
  'sent-to-room': 'sent_to_room',
  'in-consultation': 'in_consultation',
  completed: 'completed',
};

/** Visit types shown in the pool queue filter (values match backend Visit.visit_type). */
export const POOL_VISIT_TYPE_OPTIONS = [
  { value: 'all', label: 'All Types' },
  { value: 'emergency', label: 'Emergency' },
  { value: 'consultation', label: 'Consultation' },
  { value: 'follow_up', label: 'Follow-up' },
] as const;

/** Visit list pages (manage visits) — superset of pool queue types. */
export const VISIT_TYPE_FILTER_OPTIONS = [
  ...POOL_VISIT_TYPE_OPTIONS,
  { value: 'routine', label: 'Routine Checkup' },
  { value: 'annual_checkup', label: 'Annual Check-up' },
  { value: 'nursing_procedure', label: 'Nursing Procedure' },
] as const;

export function mapStatusFilterToNursingStatus(
  statusFilter: string,
): PoolNursingStatus | undefined {
  return STATUS_TO_API[statusFilter as PoolStatusFilter];
}

export function usesClientStageFilter(statusFilter: string): boolean {
  return statusFilter === 'sent-to-physiotherapy' || statusFilter === 'sent-to-eye-clinic';
}

export function clientStageNursingStatus(statusFilter: string): string | null {
  if (statusFilter === 'sent-to-physiotherapy') return 'Sent to Physiotherapy';
  if (statusFilter === 'sent-to-eye-clinic') return 'Sent to Eye Clinic';
  return null;
}

export function mapTypeFilterToVisitType(typeFilter: string): string | undefined {
  if (!typeFilter || typeFilter === 'all') return undefined;
  return typeFilter;
}

export function shouldLimitPoolToInProgress(
  hasDateFilter: boolean,
  statusFilter: string,
): boolean {
  if (hasDateFilter) return false;
  if (statusFilter === 'completed') return false;
  return true;
}

export function buildNursingPoolQueryParams(input: {
  date?: string;
  start_date?: string;
  end_date?: string;
  search?: string;
  typeFilter: string;
  clinicFilter: string;
  statusFilter: string;
}): VisitFilters {
  const hasDateFilter = Boolean(input.date || input.start_date || input.end_date);
  const nursingStatus = usesClientStageFilter(input.statusFilter)
    ? undefined
    : mapStatusFilterToNursingStatus(input.statusFilter);

  return {
    date: input.date,
    start_date: input.start_date,
    end_date: input.end_date,
    search: input.search || undefined,
    visit_type: mapTypeFilterToVisitType(input.typeFilter),
    clinic: input.clinicFilter !== 'all' ? input.clinicFilter : undefined,
    nursing_pool: 1,
    ...(shouldLimitPoolToInProgress(hasDateFilter, input.statusFilter)
      ? { status: 'in_progress' as const }
      : {}),
    nursing_status: nursingStatus,
  };
}
