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

  /**
   * Update an eye session with uploaded diagnostic files.
   */
  async updateSessionWithFiles(
    id: number,
    data: Partial<EyeSession>,
    files: {
      pachymetry_file?: File | null;
      oct_file?: File | null;
      visual_field_file?: File | null;
    }
  ) {
    const formData = new FormData();
    Object.entries(data).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      formData.append(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
    });
    Object.entries(files).forEach(([key, file]) => {
      if (file) formData.append(key, file);
    });

    return apiFetch<EyeSession>(`/eyecare/sessions/${id}/`, {
      method: 'PATCH',
      body: formData,
    });
  },
};
