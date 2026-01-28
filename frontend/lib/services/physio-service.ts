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
  patient_name: string;
  patient_id: string;
  ordered_by: number;
  ordered_by_name: string;
  consultation_session?: number;
  diagnosis: string;
  chief_complaint: string;
  treatment_goal: string;
  special_instructions: string;
  status: string;
  priority: string;
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
  exercises_prescribed: any[];
  equipment_used: any[];
  patient_education: string;
  next_session_plan: string;

  // Session & Continuity
  session_notes: string;
  progress_notes: string;
  recommendations: any[];
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
  home_exercises?: any[]; // Home exercise program
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
    return apiFetch<{ results: PhysioTemplate[]; count: number }>(`/physiotherapy/templates/${query}`);
  }

  /**
   * Get a single physiotherapy template
   */
  async getTemplate(templateId: number): Promise<PhysioTemplate> {
    return apiFetch<PhysioTemplate>(`/physiotherapy/templates/${templateId}/`);
  }

  /**
   * Create a physiotherapy template
   */
  async createTemplate(template: Omit<PhysioTemplate, 'id' | 'created_at' | 'updated_at'>): Promise<PhysioTemplate> {
    return apiFetch<PhysioTemplate>('/physiotherapy/templates/', {
      method: 'POST',
      body: JSON.stringify(template),
    });
  }

  /**
   * Update a physiotherapy template
   */
  async updateTemplate(templateId: number, template: Partial<PhysioTemplate>): Promise<PhysioTemplate> {
    return apiFetch<PhysioTemplate>(`/physiotherapy/templates/${templateId}/`, {
      method: 'PATCH',
      body: JSON.stringify(template),
    });
  }

  /**
   * Delete a physiotherapy template
   */
  async deleteTemplate(templateId: number): Promise<void> {
    return apiFetch<void>(`/physiotherapy/templates/${templateId}/`, {
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
    consultation_session?: number;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: PhysioOrder[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PhysioOrder[]; count: number }>(`/physiotherapy/orders/${query}`);
  }

  /**
   * Get a single physiotherapy order
   */
  async getOrder(orderId: number): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>(`/physiotherapy/orders/${orderId}/`);
  }

  /**
   * Create a physiotherapy order
   */
  async createOrder(order: Omit<PhysioOrder, 'id' | 'ordered_at' | 'created_at' | 'updated_at' | 'patient_name' | 'patient_id' | 'ordered_by_name' | 'clinic_name'>): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>('/physiotherapy/orders/', {
      method: 'POST',
      body: JSON.stringify(order),
    });
  }

  /**
   * Update a physiotherapy order
   */
  async updateOrder(orderId: number, order: Partial<PhysioOrder>): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>(`/physiotherapy/orders/${orderId}/`, {
      method: 'PATCH',
      body: JSON.stringify(order),
    });
  }

  /**
   * Schedule a physiotherapy order
   */
  async scheduleOrder(orderId: number, scheduledAt: string): Promise<PhysioOrder> {
    return apiFetch<PhysioOrder>(`/physiotherapy/orders/${orderId}/schedule/`, {
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
  }): Promise<{ results: PhysioSession[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PhysioSession[]; count: number }>(`/physiotherapy/sessions/${query}`);
  }

  /**
   * Get a single physiotherapy session
   */
  async getSession(sessionId: number): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/physiotherapy/sessions/${sessionId}/`);
  }

  /**
   * Create a physiotherapy session
   */
  async createSession(session: Omit<PhysioSession, 'id' | 'created_at' | 'updated_at' | 'patient_name' | 'patient_id' | 'physiotherapist_name' | 'template_name' | 'order_details'>): Promise<PhysioSession> {
    return apiFetch<PhysioSession>('/physiotherapy/sessions/', {
      method: 'POST',
      body: JSON.stringify(session),
    });
  }

  /**
   * Update a physiotherapy session
   */
  async updateSession(sessionId: number, session: Partial<PhysioSession>): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/physiotherapy/sessions/${sessionId}/`, {
      method: 'PATCH',
      body: JSON.stringify(session),
    });
  }

  /**
   * Start a physiotherapy session
   */
  async startSession(sessionId: number): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/physiotherapy/sessions/${sessionId}/start_session/`, {
      method: 'POST',
    });
  }

  /**
   * Complete a physiotherapy session
   */
  async completeSession(sessionId: number): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/physiotherapy/sessions/${sessionId}/complete_session/`, {
      method: 'POST',
    });
  }

  /**
   * Create the next session in a treatment plan
   */
  async createNextSession(orderId: number, scheduledAt: string, physiotherapistId: number, notes?: string): Promise<PhysioSession> {
    return apiFetch<PhysioSession>('/physiotherapy/sessions/create_next_session/', {
      method: 'POST',
      body: JSON.stringify({
        order_id: orderId,
        scheduled_at: scheduledAt,
        physiotherapist_id: physiotherapistId,
        notes: notes || '',
      }),
    });
  }

  /**
   * Add recommendation to a session
   */
  async addRecommendation(sessionId: number, recommendation: string, type: string = 'general'): Promise<PhysioSession> {
    return apiFetch<PhysioSession>(`/physiotherapy/sessions/${sessionId}/add_recommendation/`, {
      method: 'POST',
      body: JSON.stringify({ recommendation, type }),
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
    return apiFetch('/physiotherapy/stats/');
  }
}

export const physioService = new PhysioService();