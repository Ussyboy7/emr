/**
 * Visit API service
 */
import { apiFetch, buildQueryString } from '../api-client';
import { Visit } from './patient-service';

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
  /** Exclude visits that already have a completed consultation (nursing pool). */
  nursing_pool?: 1 | '1';
  /** Server-side nursing queue segment (requires nursing_pool=1). */
  nursing_status?: 'pending' | 'vitals_incomplete' | 'ready' | 'sent_to_room';
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
    sent_to_room: number;
  }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    // Trailing slash before query (same pattern as `/visits/?page=1`) — Django route is `nursing-pool-metrics/`.
    const path = query ? `/visits/nursing-pool-metrics/?${query.slice(1)}` : '/visits/nursing-pool-metrics/';
    return apiFetch(path);
  }

  /**
   * Get a single visit by ID
   */
  async getVisit(id: number | string): Promise<Visit> {
    return apiFetch<Visit>(`/visits/${id}/`);
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
    try {
      return await apiFetch(`/visits/${id}/close-workflow/`, {
        method: 'POST',
        body: JSON.stringify(data),
      });
    } catch (err: any) {
      // Backward-compatible fallback for environments that haven't deployed
      // the dedicated close-workflow endpoint yet.
      if (err?.status !== 404) throw err;

      await this.updateVisit(id, { status: 'cancelled' } as Partial<Visit>);

      let queueItemsDeactivated = 0;
      try {
        const queue = await apiFetch<{ results: Array<{ id: number }> }>(
          `/consultation/queue/?visit=${id}&is_active=true&page_size=100`
        );
        for (const item of queue.results || []) {
          await apiFetch(`/consultation/queue/${item.id}/call/`, { method: 'POST' });
          queueItemsDeactivated += 1;
        }
      } catch {
        // Queue cleanup is best effort in fallback mode.
      }

      return {
        detail: 'Visit cancelled via compatibility fallback.',
        visit_cancelled: true,
        queue_items_deactivated: queueItemsDeactivated,
        sessions_cancelled: 0,
        nursing_orders_cancelled: 0,
      };
    }
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
    const today = new Date().toISOString().split('T')[0];
    const result = await this.getVisits({ date: today, page_size: 100 });
    return result.results;
  }

  /**
   * Get active visits (in progress)
   */
  async getActiveVisits(): Promise<Visit[]> {
    const result = await this.getVisits({ status: 'in_progress', page_size: 100 });
    return result.results;
  }

  /**
   * Get visits for a specific patient
   */
  async getPatientVisits(patientId: number | string): Promise<Visit[]> {
    const result = await this.getVisits({ patient: Number(patientId), page_size: 100 });
    return result.results;
  }
}

export const visitService = new VisitService();
