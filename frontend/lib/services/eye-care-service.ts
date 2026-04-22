/**
 * Eye Care API service
 */
import { apiFetch } from '../api-client';

export interface EyeOrder {
  id: number;
  patient: number;
  patient_name: string;
  patient_id: string;
  ordered_by: number;
  ordered_by_name?: string;
  visit?: number;
  chief_complaint: string;
  visual_acuity_od: string;
  visual_acuity_os: string;
  visual_acuity_ou: string;
  refraction_od: string;
  refraction_os: string;
  iop_od: number | null;
  iop_os: number | null;
  diagnosis: string;
  treatment_plan: string;
  special_instructions: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  ordered_at: string;
  scheduled_at: string | null;
  completed_at: string | null;
}

export interface EyeSession {
  id: number;
  order: number;
  /** Nested order payload from list/detail serializers */
  order_details?: EyeOrder;
  patient_name?: string;
  patient_id?: string;
  session_number: number;
  status: 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  scheduled_at: string;
  started_at: string | null;
  completed_at: string | null;
  duration_minutes: number | null;
  notes: string;
  procedures_performed: string;
  findings: string;
  created_at?: string;
}

export const eyeCareService = {
  /**
   * Fetch all eye orders with optional filters
   */
  async getOrders(params?: {
    status?: string;
    priority?: string;
    patient?: number;
    page_size?: number;
  }) {
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    const url = `/eyecare/orders/${queryString ? `?${queryString}` : ''}`;
    return apiFetch<{ results: EyeOrder[] }>(url);
  },

  /**
   * Create a new eye order
   */
  async createOrder(data: Partial<EyeOrder>) {
    return apiFetch<EyeOrder>('/eyecare/orders/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Get a specific eye order by ID
   */
  async getOrder(id: number) {
    return apiFetch<EyeOrder>(`/eyecare/orders/${id}/`);
  },

  /**
   * Update an eye order
   */
  async updateOrder(id: number, data: Partial<EyeOrder>) {
    return apiFetch<EyeOrder>(`/eyecare/orders/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },

  /**
   * Mark an order as completed
   */
  async completeOrder(id: number) {
    return apiFetch<EyeOrder>(`/eyecare/orders/${id}/complete/`, {
      method: 'POST',
    });
  },

  /**
   * Check in patient from visit to eye clinic
   */
  async checkinFromVisit(visitId: number) {
    return apiFetch<EyeOrder>('/eyecare/orders/checkin-from-visit/', {
      method: 'POST',
      body: JSON.stringify({ visit: visitId }),
    });
  },

  /**
   * Fetch all eye sessions
   */
  async getSessions(params?: {
    order?: number;
    status?: string;
    page?: number;
    page_size?: number;
  }) {
    const queryString = new URLSearchParams(params as Record<string, string>).toString();
    const url = `/eyecare/sessions/${queryString ? `?${queryString}` : ''}`;
    return apiFetch<{ results: EyeSession[]; count?: number }>(url);
  },

  /**
   * Create a new eye session
   */
  async createSession(data: Partial<EyeSession>) {
    return apiFetch<EyeSession>('/eyecare/sessions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  /**
   * Update an eye session
   */
  async updateSession(id: number, data: Partial<EyeSession>) {
    return apiFetch<EyeSession>(`/eyecare/sessions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  },
};
