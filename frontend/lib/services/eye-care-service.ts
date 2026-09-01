/**
 * Eye Care API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface EyeOrder {
  id: number;
  patient: number;
  patient_name: string;
  patient_id: string;
  ordered_by: number;
  ordered_by_name?: string;
  visit?: number;
  consultation_session?: number | null;
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
  completed_sessions_count?: number;
  location_clinic_name?: string;
}

export type EyeRefractionEntry = {
  sphere: string;
  cylinder: string;
  axis: string;
  va: string;
};

export type EyeSoapNote = {
  subjective: {
    chiefComplaint: string;
    ocularHistory: string;
    medicalHistory: string;
    drugHistory: string;
    allergyHistory: string;
    familyOcularHistory: string;
    familyMedicalHistory: string;
    socialHistory: string;
  };
  objective: {
    visualAcuity: Record<string, { od: string; os: string; ou: string }>;
    examination: Record<string, { od: string; os: string }>;
    diagnostics: {
      iopOd: string;
      iopOs: string;
      method: string;
      time: string;
      pachymetry: string;
      oct: string;
      visualField: string;
    };
    refraction: {
      lensometry: { od: EyeRefractionEntry; os: EyeRefractionEntry; add: string; prism: string };
      autorefraction: { od: EyeRefractionEntry; os: EyeRefractionEntry };
      retinoscopy: { od: EyeRefractionEntry; os: EyeRefractionEntry };
      subjective: { od: EyeRefractionEntry; os: EyeRefractionEntry };
      nearAddition: { add: string; nearVa: string };
    };
  };
  assessment: {
    diagnosis: string;
  };
  plan: {
    opticalCorrection: string;
    medications: string;
    managementPlan: string;
    followUpDate: string;
  };
};

export type EyeSessionDiagnosticAttachment = {
  id: number | null;
  category: 'pachymetry' | 'oct' | 'visual_field';
  file: string;
  uploaded_at: string | null;
  legacy?: boolean;
};

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
  soap_note?: EyeSoapNote;
  pachymetry_file?: string | null;
  oct_file?: string | null;
  visual_field_file?: string | null;
  /** Multi-upload rows merged with legacy single-file URLs when present */
  diagnostic_attachments?: EyeSessionDiagnosticAttachment[];
  created_at?: string;
}

export const eyeCareService = {
  /**
   * Fetch eye orders with server-side pagination and filters.
   */
  async getOrders(params?: {
    status?: string;
    status_tab?: 'pending' | 'in_progress' | 'cancelled' | 'completed' | 'all' | string;
    priority?: string;
    patient?: number;
    page?: number;
    page_size?: number;
    search?: string;
    date_filter?: 'today' | 'week' | 'month' | 'all' | string;
    ordered_at_after?: string;
    ordered_at_before?: string;
    consultation_session?: number;
  }): Promise<{ results: EyeOrder[]; count: number }> {
    const qs = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    return apiFetch<{ results: EyeOrder[]; count: number }>(`/eyecare/orders${qs || ''}`);
  },

  /**
   * Single-request eye clinic home dashboard payload.
   */
  async getHomeDashboard(params?: { date?: string }): Promise<{
    date: string;
    stats: {
      queue: number;
      inProgress: number;
      activeSessions: number;
      completedToday: number;
      scheduledToday: number;
    };
    queuePreview: EyeOrder[];
    inProgressOrders: EyeOrder[];
    activeSessions: EyeSession[];
    recentCompletedSessions: EyeSession[];
  }> {
    const qs = buildQueryString((params || {}) as Record<string, string | undefined>);
    return apiFetch(`/eyecare/orders/home-dashboard${qs || '/'}`);
  },

  async getOrderStats(params?: {
    date_filter?: string;
    ordered_at_after?: string;
    ordered_at_before?: string;
  }): Promise<{
    pending: number;
    in_progress: number;
    cancelled: number;
    completed: number;
  }> {
    const qs = buildQueryString((params || {}) as Record<string, string | undefined>);
    return apiFetch(`/eyecare/orders/stats/${qs || ''}`);
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
    search?: string;
    ordering?: string;
    has_diagnosis?: boolean;
    has_findings?: boolean;
    is_urgent?: boolean;
    completed_after?: string;
    completed_before?: string;
  }) {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    return apiFetch<{
      results: EyeSession[];
      count?: number;
      completed_stats?: {
        total: number;
        withDiagnosis: number;
        urgent: number;
        withFindings: number;
      };
    }>(`/eyecare/sessions/${query}`);
  },

  /**
   * Aggregate completed-session card counts (single DB round-trip).
   */
  async getCompletedStats(params?: {
    search?: string;
    completed_after?: string;
    completed_before?: string;
    has_diagnosis?: boolean;
    has_findings?: boolean;
    is_urgent?: boolean;
  }): Promise<{
    total: number;
    withDiagnosis: number;
    urgent: number;
    withFindings: number;
  }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | boolean | undefined>);
    return apiFetch(`/eyecare/sessions/completed-stats${query || '/'}`);
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
   * Get one eye session (e.g. after file changes)
   */
  async getSession(id: number) {
    return apiFetch<EyeSession>(`/eyecare/sessions/${id}/`);
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

  /**
   * Update an eye session with uploaded diagnostic files.
   * Append any number of files per modality using repeated FormData keys
   * (backend: getlist pachymetry_files, oct_files, visual_field_files).
   */
  async updateSessionWithFiles(
    id: number,
    data: Partial<EyeSession>,
    files: {
      pachymetry_files?: File[];
      oct_files?: File[];
      visual_field_files?: File[];
    }
  ) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
    for (const f of files.pachymetry_files ?? []) {
      formData.append('pachymetry_files', f);
    }
    for (const f of files.oct_files ?? []) {
      formData.append('oct_files', f);
    }
    for (const f of files.visual_field_files ?? []) {
      formData.append('visual_field_files', f);
    }

    return apiFetch<EyeSession>(`/eyecare/sessions/${id}/`, {
      method: 'PATCH',
      body: formData,
    });
  },

  /**
   * Remove one diagnostic upload (multi-file rows only; legacy single files are not deletable here).
   */
  async deleteSessionDiagnosticFile(fileId: number) {
    return apiFetch<void>(`/eyecare/session-diagnostic-files/${fileId}/`, {
      method: 'DELETE',
    });
  },

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
    return apiFetch(`/eyecare/patient-tracker/${query}`);
  },
};
