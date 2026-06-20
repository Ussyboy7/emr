import { apiFetch, buildQueryString } from '../api-client';
import { MAX_LIST_PAGE_SIZE } from '../pagination-constants';

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

export interface ICD10Category {
  category: string;
  count: number;
}

export interface ICD10Stats {
  total_codes: number;
  active_codes: number;
  inactive_codes: number;
  total_diagnoses: number;
  categories: ICD10Category[];
  top_used_codes: { code: string; description: string; usage_count: number }[];
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

export interface SessionWorkspaceBundle {
  diagnoses: { results: Diagnosis[]; count: number };
  prescriptions: { results: unknown[]; count: number };
  lab_orders: { results: unknown[]; count: number };
  radiology_orders: { results: unknown[]; count: number };
  nursing_orders: { results: unknown[]; count: number };
  physio_orders: { results: unknown[]; count: number };
  eye_orders: { results: unknown[]; count: number };
  vitals: { results: unknown[]; count: number };
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

export interface ConsultationAnalytics {
  session_metrics: {
    total_sessions: number;
    completed_sessions: number;
    active_sessions: number;
    completion_rate: number;
    avg_duration: number;
    median_duration: number;
    max_duration: number;
    min_duration: number;
  };
  throughput: Record<string, number>;
  room_utilization: Record<string, {
    sessions: number;
    completed: number;
    avg_duration: number;
  }>;
  doctor_productivity: Record<string, {
    sessions: number;
    completed: number;
    avg_duration: number;
  }>;
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
  clinical_outcomes: {
    prescriptions: number;
    lab_orders: number;
    nursing_orders: number;
  };
  referrals: {
    total: number;
    pending: number;
    completed: number;
  };
  diagnoses: {
    total: number;
    by_certainty: Record<string, number>;
  };
  by_day?: Array<{ date: string; sessions: number; completed: number }>;
  by_week?: Array<{ week: string; sessions: number; completed: number }>;
  by_month?: Array<{ month: string; sessions: number; completed: number }>;
  by_bimonth?: Array<{ bimonth: string; sessions: number; completed: number }>;
  by_quarter?: Array<{ quarter: string; sessions: number; completed: number }>;
  by_halfyear?: Array<{ halfyear: string; sessions: number; completed: number }>;
  period: {
    start_date: string;
    end_date: string;
  };
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
   * Get comprehensive consultation analytics
   */
  async getComprehensiveAnalytics(params: {
    start: string;
    end: string;
  }): Promise<ConsultationAnalytics> {
    const query = buildQueryString(params);
    return apiFetch<ConsultationAnalytics>(`/consultation/sessions/comprehensive-analytics/${query}`);
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

  /** Best-matching session for a visit (e.g. latest completed for reports). */
  async resolveSessionForVisit(params: {
    visit: number;
    status?: string;
    patient?: number;
    ordering?: string;
  }): Promise<ConsultationSession | null> {
    try {
      const query = buildQueryString(params as Record<string, string | number | undefined>);
      return await apiFetch<ConsultationSession>(`/consultation/sessions/resolve-for-visit/${query}`);
    } catch {
      return null;
    }
  }

  /** Consultation session counts per room for a calendar day. */
  async getRoomDaySessionCounts(date: string): Promise<Record<string, number>> {
    try {
      const query = buildQueryString({ date });
      const res = await apiFetch<{ counts: Record<string, number> }>(
        `/consultation/sessions/room-day-counts/${query}`
      );
      return res.counts || {};
    } catch {
      return {};
    }
  }

  /**
   * Get a single consultation session
   */
  async getSession(id: number): Promise<ConsultationSession> {
    return apiFetch<ConsultationSession>(`/consultation/sessions/${id}/`);
  }

  /** Diagnoses, orders, prescriptions, and vitals for consultation room / edit modals. */
  async getSessionWorkspaceBundle(sessionId: number): Promise<SessionWorkspaceBundle> {
    return apiFetch<SessionWorkspaceBundle>(`/consultation/sessions/${sessionId}/workspace-bundle/`);
  }

  /** History page stat cards (replaces 4 parallel COUNT list calls). */
  async getHistoryStats(params?: {
    clinic?: string;
    doctor?: number;
    date?: string;
    start_date?: string;
    end_date?: string;
    search?: string;
    calendar_today?: string;
    week_start?: string;
    week_end?: string;
  }): Promise<{
    today: number;
    thisWeek: number;
    inProgress: number;
    completed: number;
  }> {
    const query = buildQueryString(params || {});
    return apiFetch(`/consultation/sessions/history-stats/${query}`);
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

  async markQueuePatientLeft(
    queueId: number,
    data: { reason?: string } = {}
  ): Promise<{ detail: string }> {
    return apiFetch(`/consultation/queue/${queueId}/mark-left/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async endSessionNotSeen(
    sessionId: number,
    data: { reason?: string } = {}
  ): Promise<{ detail: string }> {
    return apiFetch(`/consultation/sessions/${sessionId}/end-not-seen/`, {
      method: 'POST',
      body: JSON.stringify(data),
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

  /** Exact ICD-10 code lookup (no paginated search). */
  async resolveICD10Code(code: string): Promise<ICD10Code | null> {
    try {
      const query = buildQueryString({ code: code.trim() });
      return await apiFetch<ICD10Code>(`/consultation/icd10-codes/resolve/${query}`);
    } catch {
      return null;
    }
  }

  async getICD10Stats(): Promise<ICD10Stats> {
    return apiFetch<ICD10Stats>('/consultation/icd10-codes/stats/');
  }

  async getICD10Categories(): Promise<{ results: ICD10Category[]; count: number }> {
    return apiFetch<{ results: ICD10Category[]; count: number }>('/consultation/icd10-codes/categories/');
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

  async sessionHasDiagnosis(sessionId: number): Promise<boolean> {
    const res = await apiFetch<{ exists: boolean }>(
      `/consultation/diagnoses/exists/?session=${sessionId}`,
    );
    return Boolean(res.exists);
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
    page?: number;
    page_size?: number;
  }): Promise<{ results: PresentingComplaintCategory[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PresentingComplaintCategory[]; count: number }>(
      `/consultation/presenting-complaint-categories/${query}`
    );
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
    // Backend exposes categories endpoint with optional nested complaints.
    // `include_inactive` maps to `active_only=false`.
    const resp = await this.getPresentingComplaintCategories({
      include_complaints: true,
      active_only: params?.include_inactive ? false : true,
      page: 1,
      page_size: MAX_LIST_PAGE_SIZE,
    });
    return (resp.results || []) as any;
  }
}

export const consultationService = new ConsultationService();
