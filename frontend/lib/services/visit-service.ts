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
  page?: number;
  page_size?: number;
}

class VisitService {
  /**
   * Get all visits
   */
  async getVisits(params?: VisitFilters): Promise<{ results: Visit[]; count: number; next?: string; previous?: string }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Visit[]; count: number; next?: string; previous?: string }>(
      `/visits/${query}`
    );
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

