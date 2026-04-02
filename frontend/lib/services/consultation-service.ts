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
  patient_age_display?: string;
  patient_gender?: string;
  doctor?: number;
  doctor_name?: string;
  visit?: number;
  clinic_name?: string;
  status: 'active' | 'paused' | 'completed' | 'cancelled';
  presentation_complaint?: string;
  history_of_presenting_illness?: string;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  notes?: string;
  started_at: string;
  last_resumed_at?: string;
  paused_at?: string;
  active_seconds?: number;
  active_duration_seconds?: number;
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

export interface PresentingComplaintCategory {
  id: number;
  name: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
  complaint_count?: number;
  active_complaint_count?: number;
  complaints?: PresentingComplaint[];
}

export interface PresentingComplaint {
  id: number;
  category: number;
  category_name?: string;
  label: string;
  normalized_label?: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
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
    visit?: number;
    status?: string;
    search?: string;
    clinic?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
    ordering?: string;
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

  async pauseSession(id: number): Promise<ConsultationSession> {
    return apiFetch<ConsultationSession>(`/consultation/sessions/${id}/pause/`, {
      method: 'POST',
    });
  }

  async resumeSession(id: number): Promise<ConsultationSession> {
    return apiFetch<ConsultationSession>(`/consultation/sessions/${id}/resume/`, {
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

  /**
   * Presenting complaint categories
   */
  async getPresentingComplaintCategories(params?: {
    active_only?: boolean;
    include_complaints?: boolean;
  }): Promise<PresentingComplaintCategory[]> {
    const query = buildQueryString(params || {});
    return apiFetch<PresentingComplaintCategory[]>(`/consultation/presenting-complaint-categories/${query}`);
  }

  async createPresentingComplaintCategory(
    data: Partial<PresentingComplaintCategory>
  ): Promise<PresentingComplaintCategory> {
    return apiFetch<PresentingComplaintCategory>('/consultation/presenting-complaint-categories/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePresentingComplaintCategory(
    id: number,
    data: Partial<PresentingComplaintCategory>
  ): Promise<PresentingComplaintCategory> {
    return apiFetch<PresentingComplaintCategory>(`/consultation/presenting-complaint-categories/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePresentingComplaintCategory(id: number): Promise<void> {
    await apiFetch(`/consultation/presenting-complaint-categories/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Presenting complaints
   */
  async getPresentingComplaints(params?: {
    category?: number;
    active_only?: boolean;
    is_active?: boolean;
    search?: string;
  }): Promise<PresentingComplaint[]> {
    const query = buildQueryString(params || {});
    return apiFetch<PresentingComplaint[]>(`/consultation/presenting-complaints/${query}`);
  }

  async createPresentingComplaint(data: Partial<PresentingComplaint>): Promise<PresentingComplaint> {
    return apiFetch<PresentingComplaint>('/consultation/presenting-complaints/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePresentingComplaint(
    id: number,
    data: Partial<PresentingComplaint>
  ): Promise<PresentingComplaint> {
    return apiFetch<PresentingComplaint>(`/consultation/presenting-complaints/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deletePresentingComplaint(id: number): Promise<void> {
    await apiFetch(`/consultation/presenting-complaints/${id}/`, {
      method: 'DELETE',
    });
  }

  async getPresentingComplaintLibrary(params?: { include_inactive?: boolean }): Promise<Array<{
    id: number;
    name: string;
    is_active: boolean;
    sort_order: number;
    complaints: PresentingComplaint[];
  }>> {
    const query = buildQueryString(params || {});
    return apiFetch<Array<{
      id: number;
      name: string;
      is_active: boolean;
      sort_order: number;
      complaints: PresentingComplaint[];
    }>>(`/consultation/presenting-complaints/library/${query}`);
  }
}

export const consultationService = new ConsultationService();
