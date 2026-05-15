/**
 * Physiotherapy API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface PhysioTemplate {
  id: number;
  name: string;
  code: string;
  category: string;
  description: string;
  duration_minutes: number;
  equipment_needed: string[];
  contraindications: string;
  instructions: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface PhysioOrder {
  id: number;
  patient: number;
  visit?: number;
  patient_name: string;
  patient_id: string;
  ordered_by: number;
  ordered_by_name: string;
  consultation_session?: number;
  history_clinical_findings: string;
  diagnosis: string;
  drug_history: string;
  special_instructions: string;
  status: string;
  priority: string;
  /** nursing | doctor | self | other | unspecified */
  referral_source?: string;
  ordered_at: string;
  scheduled_at?: string;
  completed_at?: string;
  sessions_completed: number;
}

export interface PhysioSession {
  id: number;
  order: number;
  order_details: PhysioOrder;
  physiotherapist: number;
  physiotherapist_name: string;
  session_number: number;
  status: string;
  scheduled_at: string;
  started_at?: string;
  completed_at?: string;
  duration_minutes?: number;
  created_at: string;

  // Patient Assessment
  presenting_complaint: string;
  pain_level_before?: number;
  pain_level_after?: number;

  // Medical & Social Background
  medical_history: string;
  surgical_history: string;
  medications: string;
  allergies: string;
  social_history: string;
  previous_treatments: string;

  // Physical Examination
  posture_gait: string;
  range_of_motion: string;
  muscle_strength: string;
  sensation: string;
  reflexes: string;
  balance_coordination: string;
  special_tests: string;

  // Functional Evaluation
  functional_assessment: string;
  assistive_devices: string;
  functional_goals: string;
  functional_limitations: string;

  // Clinical Reasoning
  assessment_findings: string;
  diagnosis_impression: string;
  prognosis: string;
  clinical_reasoning: string;

  // Treatment & Plan
  treatment_performed: string;
  exercises_prescribed: Record<string, unknown>[];
  equipment_used: Record<string, unknown>[];
  patient_education: string;
  next_session_plan: string;

  // Session & Continuity
  session_notes: string;
  progress_notes: string;
  recommendations: Record<string, unknown>[];
  follow_up_instructions: string;

  // Legacy fields
  patient_name: string;
  patient_id: string;
  notes?: string;
  patient_response?: string;
  functional_improvement?: string;
  next_session_date?: string;
  follow_up_notes?: string;
  assessment?: string; // Legacy assessment field
  home_exercises?: Record<string, unknown>[]; // Home exercise program
  updated_at: string;
}

class PhysioService {
  /**
   * Get physiotherapy templates
   */
  async getTemplates(params?: {
    category?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: PhysioTemplate[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PhysioTemplate[]; count: number }>(`/templates/${query}`);
  }

  getTemplate(templateId: number): Promise<PhysioTemplate> {
      return apiFetch<PhysioTemplate>(`/templates/${templateId}/`);
    }

    createTemplate(data: Partial<PhysioTemplate>): Promise<PhysioTemplate> {
      return apiFetch<PhysioTemplate>('/templates/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    updateTemplate(templateId: number, data: Partial<PhysioTemplate>): Promise<PhysioTemplate> {
      return apiFetch<PhysioTemplate>(`/templates/${templateId}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }

    deleteTemplate(templateId: number): Promise<void> {
      return apiFetch<void>(`/templates/${templateId}/`, {
        method: 'DELETE',
      });
    }

  /**
   * Get physiotherapy orders
   */
  async getOrders(params?: {
    status?: string;
    priority?: string;
    clinic?: string;
    patient?: string;
    visit?: number;
    consultation_session?: number;
    referral_source?: string;
    ordered_at_after?: string;
    ordered_at_before?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: PhysioOrder[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PhysioOrder[]; count: number }>(`/orders/${query}`);
  }

  getOrder(orderId: number): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>(`/orders/${orderId}/`);
  }

  createOrder(data: Partial<PhysioOrder>): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>('/orders/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateOrder(orderId: number, data: Partial<PhysioOrder>): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>(`/orders/${orderId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  scheduleOrder(orderId: number, scheduledAt: string): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>(`/orders/${orderId}/schedule/`, {
      method: 'POST',
      body: JSON.stringify({ scheduled_at: scheduledAt }),
    });
  }

  /**
   * Complete a physiotherapy order (sets status=completed, completed_at=now).
   * Backend has no /orders/{id}/complete/ action; this uses updateOrder.
   */
  async completeOrder(orderId: number): Promise<PhysioOrder> {
    return this.updateOrder(orderId, {
      status: 'completed',
      completed_at: new Date().toISOString(),
    });
  }

  /**
   * Get physiotherapy sessions
   */
  async getSessions(params?: {
    status?: string;
    physiotherapist?: number;
    template?: number;
    order?: number;
    search?: string;
    page?: number;
    page_size?: number;
    completed_after?: string;
    completed_before?: string;
  }): Promise<{ results: PhysioSession[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PhysioSession[]; count: number }>(`/sessions/${query}`);
  }

  getSession(sessionId: number): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/sessions/${sessionId}/`);
  }

  createSession(data: Partial<PhysioSession>): Promise<PhysioSession> {
    return apiFetch<PhysioSession>('/sessions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  updateSession(sessionId: number, data: Partial<PhysioSession>): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/sessions/${sessionId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  startSession(sessionId: number): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/sessions/${sessionId}/start_session/`, {
      method: 'POST',
    });
  }

  completeSession(sessionId: number, data?: { notes?: string; pain_level_before?: number; pain_level_after?: number }): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/sessions/${sessionId}/complete_session/`, {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  }

  downloadSessionReport(sessionId: number): Promise<Blob> {
    return apiFetch<Blob>(`/sessions/${sessionId}/session_report_pdf/`, {
      responseType: 'blob',
    });
  }

  createNextSession(orderId: number): Promise<PhysioSession> {
    return apiFetch<PhysioSession>('/sessions/create_next_session/', {
      method: 'POST',
      body: JSON.stringify({ order: orderId }),
    });
  }

  addRecommendation(sessionId: number, recommendation: string): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/sessions/${sessionId}/add_recommendation/`, {
      method: 'POST',
      body: JSON.stringify({ recommendation }),
    });
  }

  /**
   * Get physiotherapy statistics
   */
  async getStats(): Promise<{
    total_orders: number;
    pending_orders: number;
    completed_sessions: number;
    active_sessions: number;
    total_sessions: number;
  }> {
    return apiFetch('/stats/');
  }

  getAnalyticsSummary(params?: {
    start_date?: string;
    end_date?: string;
  }): Promise<PhysiotherapyAnalyticsSummary> {
    const query = buildQueryString(params || {});
    return apiFetch<PhysiotherapyAnalyticsSummary>(`/analytics/summary/${query}`);
  }

  async getPatientTracker(search: string): Promise<{
    search: string;
    results: Array<{
      patient_name: string;
      patient_id: string;
      item_name: string;
      item_code: string;
      item_status: string;
      item_status_display: string;
      order_id: string | null;
      clinic: string | null;
      screen: 'orders' | 'completed';
      tab: string;
      screen_label: string;
      tab_label: string;
      href_screen: string;
      is_active: boolean;
    }>;
  }> {
    const query = buildQueryString({ search: search.trim() });
    return apiFetch(`/patient-tracker/${query}`);
  }
}

export interface PhysiotherapyAnalyticsSummary {
  session_metrics: {
    total_sessions: number;
    completed_sessions: number;
    avg_duration: number;
    completion_rate: number;
  };
  patient_demographics: {
    attendance_by_category: Array<{
      sn: number;
      key: string;
      label: string;
      male: number;
      female: number;
      total: number;
      percentage: number;
    }>;
    attendance_totals: {
      male: number;
      female: number;
      total: number;
    };
  };
  by_day?: Array<any>;
  by_week?: Array<any>;
  by_month?: Array<any>;
  by_bimonth?: Array<any>;
  by_quarter?: Array<any>;
  by_halfyear?: Array<any>;
  period: {
    start_date: string;
    end_date: string;
  };
}

export const physioService = new PhysioService();