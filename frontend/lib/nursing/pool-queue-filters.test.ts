import { describe, expect, it } from 'vitest';

import {
  buildNursingPoolQueryParams,
  clientStageNursingStatus,
  mapStatusFilterToNursingStatus,
  mapTypeFilterToVisitType,
  shouldLimitPoolToInProgress,
  usesClientStageFilter,
} from './pool-queue-filters';

describe('pool-queue-filters', () => {
  it('maps status filters to API nursing_status values', () => {
    expect(mapStatusFilterToNursingStatus('pending')).toBe('pending');
    expect(mapStatusFilterToNursingStatus('vitals-recorded')).toBe('vitals_incomplete');
    expect(mapStatusFilterToNursingStatus('ready-for-consultation')).toBe('ready');
    expect(mapStatusFilterToNursingStatus('sent-to-room')).toBe('sent_to_room');
    expect(mapStatusFilterToNursingStatus('in-consultation')).toBe('in_consultation');
    expect(mapStatusFilterToNursingStatus('completed')).toBe('completed');
    expect(mapStatusFilterToNursingStatus('all')).toBeUndefined();
  });

  it('maps visit type filter using backend visit_type slugs', () => {
    expect(mapTypeFilterToVisitType('follow_up')).toBe('follow_up');
    expect(mapTypeFilterToVisitType('emergency')).toBe('emergency');
    expect(mapTypeFilterToVisitType('all')).toBeUndefined();
  });

  it('does not limit to in_progress when completed filter is used without a date', () => {
    expect(shouldLimitPoolToInProgress(false, 'completed')).toBe(false);
    expect(shouldLimitPoolToInProgress(false, 'pending')).toBe(true);
    expect(shouldLimitPoolToInProgress(true, 'pending')).toBe(false);
  });

  it('builds pool query params with nursing_pool and conditional status', () => {
    const pendingToday = buildNursingPoolQueryParams({
      date: '2026-06-17',
      typeFilter: 'all',
      clinicFilter: 'all',
      statusFilter: 'pending',
    });
    expect(pendingToday.nursing_pool).toBe(1);
    expect(pendingToday.nursing_status).toBe('pending');
    expect(pendingToday.status).toBeUndefined();

    const completedAllTime = buildNursingPoolQueryParams({
      typeFilter: 'follow_up',
      clinicFilter: 'Nursing',
      statusFilter: 'completed',
    });
    expect(completedAllTime.nursing_status).toBe('completed');
    expect(completedAllTime.status).toBeUndefined();
    expect(completedAllTime.visit_type).toBe('follow_up');
    expect(completedAllTime.clinic).toBe('Nursing');
  });

  it('uses client stage filters for physio and eye clinic', () => {
    expect(usesClientStageFilter('sent-to-physiotherapy')).toBe(true);
    expect(usesClientStageFilter('sent-to-eye-clinic')).toBe(true);
    expect(clientStageNursingStatus('sent-to-eye-clinic')).toBe('Sent to Eye Clinic');
    const params = buildNursingPoolQueryParams({
      typeFilter: 'all',
      clinicFilter: 'all',
      statusFilter: 'sent-to-physiotherapy',
    });
    expect(params.nursing_status).toBeUndefined();
  });
});
