import { apiFetch, buildQueryString } from '../api-client';

export interface ConsultationStats {
  today: {
    sessions: number;
    active: number;
    completed: number;
    patients: number;
    avg_duration: number;
    prescriptions: number;
    lab_orders: number;
    nursing_orders: number;
  };
  week: {
    sessions: number;
    patients: number;
    by_day: Array<{ day: string; count: number }>;
  };
  month: {
    sessions: number;
    patients: number;
    prescriptions: number;
    lab_orders: number;
  };
  clinic_breakdown: Array<{ clinic: string; count: number }>;
  recent_sessions: Array<{
    id: number;
    patient: string;
    diagnosis: string;
    duration: number;
    time: string;
  }>;
  queue_count: number;
  pending_referrals: number;
  active_sessions: number;
  completed_today: number;
}

export interface ConsultationSession {
  id: number;
  session_id: string;
  room: number;
  room_name?: string;
  patient: number;
  patient_name?: string;
  doctor?: number;
  doctor_name?: string;
  visit?: number;
  status: 'active' | 'completed' | 'cancelled';
  chief_complaint?: string;
  history_of_presenting_illness?: string;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  notes?: string;
  started_at: string;
  ended_at?: string;
}

export interface ConsultationQueueItem {
  id: number;
  room: number;
  room_name?: string;
  patient: number;
  patient_name?: string;
  visit?: number;
  priority: number;
  notes?: string;
  queued_at: string;
  called_at?: string;
  is_active: boolean;
}

class ConsultationService {
  /**
   * Get consultation statistics for dashboard
   */
  async getStats(doctorId?: number): Promise<ConsultationStats> {
    const params = doctorId ? { doctor: doctorId } : {};
    const query = buildQueryString(params);
    return apiFetch<ConsultationStats>(`/consultation/sessions/stats/${query}`);
  }

  /**
   * Get consultation sessions
   */
  async getSessions(params?: {
    room?: number;
    patient?: number;
    doctor?: number;
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: ConsultationSession[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: ConsultationSession[]; count: number }>(`/consultation/sessions/${query}`);
  }

  /**
   * Get a single consultation session
   */
  async getSession(id: number): Promise<ConsultationSession> {
    return apiFetch<ConsultationSession>(`/consultation/sessions/${id}/`);
  }

  /**
   * Create a consultation session
   */
  async createSession(data: Partial<ConsultationSession>): Promise<ConsultationSession> {
    return apiFetch<ConsultationSession>('/consultation/sessions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a consultation session
   */
  async updateSession(id: number, data: Partial<ConsultationSession>): Promise<ConsultationSession> {
    return apiFetch<ConsultationSession>(`/consultation/sessions/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * End a consultation session
   */
  async endSession(id: number): Promise<ConsultationSession> {
    return apiFetch<ConsultationSession>(`/consultation/sessions/${id}/end/`, {
      method: 'POST',
    });
  }

  /**
   * Get consultation queue items
   */
  async getQueue(params?: {
    room?: number;
    patient?: number;
    is_active?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<{ results: ConsultationQueueItem[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: ConsultationQueueItem[]; count: number }>(`/consultation/queue/${query}`);
  }

  /**
   * Call a patient from queue
   */
  async callPatient(queueId: number): Promise<ConsultationQueueItem> {
    return apiFetch<ConsultationQueueItem>(`/consultation/queue/${queueId}/call/`, {
      method: 'POST',
    });
  }
}

export const consultationService = new ConsultationService();

