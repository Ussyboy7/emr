/**
 * Visit API service
 */
import { apiFetch, buildQueryString } from '../api-client';
import { peekServerTodayApi } from '../dates';
import { Visit } from './patient-service';
import type { SessionWorkspaceBundle } from './consultation-service';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';

export interface VisitFilters {
  patient?: number;
  status?: string;
  visit_type?: string;
  clinic?: string;
  search?: string;
  date?: string;
  start_date?: string;
  end_date?: string;
  ordering?: string;
  page?: number;
  page_size?: number;
  /** When set with a date, scopes to nursing day's activity (in_progress + completed). */
  nursing_pool?: 1 | '1';
  /** Server-side nursing queue segment. */
  nursing_status?: 'pending' | 'vitals_incomplete' | 'ready' | 'sent_to_room' | 'in_consultation' | 'sent_to_physiotherapy' | 'completed';
}

/** Full nursing pool report (trends, legs, aligned vs queue-date room counts). */
export interface NursingPoolAnalyticsSummary {
  total: number;
  pending_vitals: number;
  vitals_incomplete: number;
  ready_for_consultation: number;
  /** Legacy dashboard card: active queue rows whose queued_at is in range. */
  sent_to_room: number;
  sent_to_room_by_queue_date: number;
  /** Active queue row present; visit already limited by visit date (recommended for reporting). */
  sent_to_room_aligned: number;
  multi_clinic_visits: number;
  single_clinic_visits: number;
  visits_with_eye_clinic: number;
  visits_with_physiotherapy: number;
  eye_checked_in: number;
  physio_checked_in: number;
}

export interface NursingPoolAnalyticsDayRow {
  date: string;
  total: number;
  pending_vitals: number;
  vitals_incomplete: number;
  ready_for_consultation: number;
  sent_to_room_aligned: number;
  sent_to_room_by_queue_date: number;
  multi_clinic: number;
  checked_in_physio: number;
  checked_in_eye: number;
}

export interface NursingPoolAnalyticsResponse {
  summary: NursingPoolAnalyticsSummary;
  by_day: NursingPoolAnalyticsDayRow[];
  period: { start: string; end: string };
}

class VisitService {
  /**
   * Get all visits
   */
  async getVisits(params?: VisitFilters): Promise<{ results: Visit[]; count: number; next?: string; previous?: string }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    return apiFetch<{ results: Visit[]; count: number; next?: string; previous?: string }>(
      `/visits/${query}`
    );
  }

  /** Dashboard stats for nursing pool (same filters as getVisits except pagination / nursing_status). */
  async getNursingPoolMetrics(
    params?: Omit<VisitFilters, 'page' | 'page_size' | 'nursing_status'>
  ): Promise<{
    total: number;
    pending_vitals: number;
    ready_for_consultation: number;
    in_consultation: number;
    completed: number;
  }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    // Trailing slash before query (same pattern as `/visits/?page=1`) — Django route is `nursing-pool-metrics/`.
    const path = query ? `/visits/nursing-pool-metrics/?${query.slice(1)}` : '/visits/nursing-pool-metrics/';
    return apiFetch(path);
  }

  /** Analytics report: daily breakdown, vitals_incomplete, physio/eye legs, aligned sent_to_room. */
  async getNursingPoolAnalytics(
    params?: Omit<VisitFilters, 'page' | 'page_size' | 'nursing_status'>
  ): Promise<NursingPoolAnalyticsResponse> {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    const path = query
      ? `/visits/nursing-pool-analytics/?${query.slice(1)}`
      : '/visits/nursing-pool-analytics/';
    return apiFetch(path);
  }

  /** Tab counts for visits list page (replaces 4 parallel COUNT requests). */
  async getListStats(
    params?: Omit<VisitFilters, 'page' | 'page_size' | 'status' | 'ordering'>
  ): Promise<{
    total: number;
    scheduled: number;
    inProgress: number;
    completed: number;
  }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    const path = query ? `/visits/list-stats/?${query.slice(1)}` : '/visits/list-stats/';
    return apiFetch(path);
  }

  /**
   * Get a single visit by ID
   */
  async getVisit(id: number | string): Promise<Visit> {
    return apiFetch<Visit>(`/visits/${id}/`);
  }

  /** Best-matching visit for a patient (e.g. in-progress or latest). */
  async resolveVisit(params: {
    patient: number;
    status?: string;
    ordering?: string;
    date?: string;
  }): Promise<Visit | null> {
    try {
      const query = buildQueryString(params as Record<string, string | number | undefined>);
      return await apiFetch<Visit>(`/visits/resolve/${query}`);
    } catch {
      return null;
    }
  }

  /** Diagnoses, orders, prescriptions, and vitals scoped to a visit. */
  async getVisitWorkspaceBundle(visitId: number): Promise<SessionWorkspaceBundle> {
    return apiFetch<SessionWorkspaceBundle>(`/visits/${visitId}/workspace-bundle/`);
  }

  /**
   * Get a single visit by ID (alias for getVisit)
   */
  async getVisitById(id: number | string): Promise<Visit> {
    return this.getVisit(id);
  }

  /**
   * Create a new visit
   */
  async createVisit(data: Partial<Visit>): Promise<Visit> {
    return apiFetch<Visit>('/visits/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a visit
   */
  async updateVisit(id: number | string, data: Partial<Visit>): Promise<Visit> {
    return apiFetch<Visit>(`/visits/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async closeWorkflow(
    id: number | string,
    data: { reason?: string; source_stage?: string } = {}
  ): Promise<{
    detail: string;
    visit_cancelled: boolean;
    queue_items_deactivated: number;
    sessions_cancelled: number;
    nursing_orders_cancelled: number;
  }> {
    return apiFetch(`/visits/${id}/close-workflow/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a visit
   */
  async deleteVisit(id: number | string): Promise<void> {
    return apiFetch<void>(`/visits/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get today's visits
   */
  async getTodayVisits(): Promise<Visit[]> {
    const today = peekServerTodayApi();
    const result = await this.getVisits({ date: today, page_size: MAX_LIST_PAGE_SIZE });
    return result.results;
  }

  /**
   * Get active visits (in progress)
   */
  async getActiveVisits(): Promise<Visit[]> {
    const result = await this.getVisits({ status: 'in_progress', page_size: MAX_LIST_PAGE_SIZE });
    return result.results;
  }

  /**
   * Get visits for a specific patient
   */
  async getPatientVisits(patientId: number | string): Promise<Visit[]> {
    const result = await this.getVisits({ patient: Number(patientId), page_size: MAX_LIST_PAGE_SIZE });
    return result.results;
  }
}

export const visitService = new VisitService();
