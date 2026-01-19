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

export interface ICD10Code {
  id: number;
  code: string;
  description: string;
  category: string;
  is_active: boolean;
}

export interface Diagnosis {
  id: number;
  patient: number;
  visit?: number;
  session?: number;
  icd10_code: number;
  diagnosis_text: string;
  status: 'confirmed' | 'suspected' | 'ruled_out';
  certainty: 'confirmed' | 'probable' | 'possible';
  diagnosed_by?: number;
  diagnosed_at: string;
  notes: string;
  patient_name?: string;
  diagnosed_by_name?: string;
  icd10_code_details?: {
    code: string;
    description: string;
    category: string;
  };
}

export interface ConsultationSession {
  id: number;
  session_id: string;
  room: number;
  room_name?: string;
  patient: number;
  patient_name?: string;
  patient_id?: string;
  patient_age?: number;
  patient_gender?: string;
  doctor?: number;
  doctor_name?: string;
  visit?: number;
  clinic_name?: string;
  status: 'active' | 'completed' | 'cancelled';
  presentation_complaint?: string;
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

  /**
   * Get ICD-10 codes
   */
  async getICD10Codes(params?: {
    search?: string;
    category?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: ICD10Code[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: ICD10Code[]; count: number }>(`/consultation/icd10-codes/${query}`);
  }

  /**
   * Get diagnoses
   */
  async getDiagnoses(params?: {
    patient?: number;
    visit?: number;
    session?: number;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Diagnosis[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Diagnosis[]; count: number }>(`/consultation/diagnoses/${query}`);
  }

  /**
   * Create a diagnosis
   */
  async createDiagnosis(data: Partial<Diagnosis>): Promise<Diagnosis> {
    return apiFetch<Diagnosis>('/consultation/diagnoses/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a diagnosis
   */
  async updateDiagnosis(id: number, data: Partial<Diagnosis>): Promise<Diagnosis> {
    return apiFetch<Diagnosis>(`/consultation/diagnoses/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a diagnosis
   */
  async deleteDiagnosis(id: number): Promise<void> {
    await apiFetch(`/consultation/diagnoses/${id}/`, {
      method: 'DELETE',
    });
  }
}

export const consultationService = new ConsultationService();

