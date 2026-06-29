/**
 * Patient API service
 */
import { apiFetch, buildQueryString } from '../api-client';
import { getVisitTypeLabel } from '../utils/priority';

function appendPatientFormFields(formData: FormData, data: Record<string, unknown>): void {
  Object.entries(data).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      formData.append(key, String(value));
    }
  });
}

/**
 * Normalize API gender to a display label.
 * Patient list serializer uses Django choice labels ("Male" / "Female");
 * detail serializer uses raw values ("male" / "female"). Treat both consistently.
 */
export function formatPatientGenderLabel(gender: unknown): 'Male' | 'Female' | '' {
  const s = String(gender ?? '').trim().toLowerCase();
  if (s === 'male' || s === 'm') return 'Male';
  if (s === 'female' || s === 'f') return 'Female';
  return '';
}

/**
 * Safely validates and sanitizes patient data for rendering
 * Prevents "Objects are not valid as a React child" errors
 */
export function sanitizePatientForRendering(patient: Record<string, unknown>): Record<string, unknown> {
  if (!patient || typeof patient !== 'object') {
    console.error('Invalid patient object received:', patient);
    throw new Error('Invalid patient data received from API');
  }

  // Ensure all required fields are proper types to prevent React rendering errors
  return {
    id: String(patient.id || ''),
    visitId: String(patient.visitId || ''),
    patientId: String(patient.patient_id ?? patient.patientId ?? ''),
    name: typeof patient.full_name === 'string' ? String(patient.full_name) : (typeof patient.name === 'string' ? String(patient.name) : ''),
    age: typeof patient.age === 'number' ? patient.age : parseInt(String(patient.age || '0')) || 0,
    ageDisplay: patient.age_display ? String(patient.age_display) : undefined,
    gender: formatPatientGenderLabel(patient.gender) || String(patient.gender || ''),
    mrn: String(patient.patient_id ?? ''),
    personalNumber: String(patient.personal_number || ''),
    allergies: Array.isArray(patient.allergies)
      ? (patient.allergies as unknown[]).map((a: unknown) => String(a).trim()).filter((a: string) => a)
      : (patient.allergies ? String(patient.allergies).split(/[,\n]/).map((a: string) => a.trim()).filter((a: string) => a) : []),
    waitTime: typeof patient.waitTime === 'number' ? patient.waitTime : 0,
    vitalsCompleted: Boolean(patient.vitalsCompleted),
    priority:
      patient.priority ||
      (patient.visitType ? getVisitTypeLabel(String(patient.visitType)) : 'Consultation'),
    visitDate: String(patient.visitDate || ''),
    visitTime: String(patient.visitTime || ''),
    visitType: patient.visitType ? String(patient.visitType) : undefined,
    queueItemId:
      typeof patient.queueItemId === 'number' ? patient.queueItemId : undefined,
    queuePosition: typeof patient.queuePosition === 'number' ? patient.queuePosition : 0,
    bloodGroup: patient.blood_group ? String(patient.blood_group) : undefined,
    genotype: patient.genotype ? String(patient.genotype) : undefined,
    employeeType: patient.employee_type ? String(patient.employee_type) : undefined,
    division: patient.division ? String(patient.division) : undefined,
    location: patient.location ? String(patient.location) : undefined,
    phone: patient.phone ? String(patient.phone) : undefined,
    email: patient.email ? String(patient.email) : undefined,
    occupation: patient.occupation ? String(patient.occupation) : undefined,
    religion: patient.religion ? String(patient.religion) : undefined,
    tribe: patient.tribe ? String(patient.tribe) : undefined,
    photo: patient.photo || null,
    vitals: patient.vitals || undefined,
  };
}

export interface Patient {
  id: number;
  patient_id: string;
  display_patient_id?: string;
  category: 'employee' | 'retiree' | 'nonnpa' | 'dependent';
  title?: string;
  surname: string;
  first_name: string;
  middle_name?: string;
  full_name?: string;
  gender: 'male' | 'female';
  date_of_birth: string;
  age?: number;
  age_display?: string;
  marital_status?: string;
  religion?: string;
  tribe?: string;
  occupation?: string;
  photo?: string;
  personal_number?: string;
  employee_id?: string;
  employee_type?: string;
  division?: string;
  location?: string;
  nonnpa_type?: string;
  dependent_type?: string;
  principal_staff?: number;
  /** Populated on list responses when serializer embeds principal (dependents list). */
  principal_staff_full_name?: string;
  principal_staff_patient_id?: string;
  principal_staff_category?: string;
  email?: string;
  phone?: string;
  state_of_residence?: string;
  residential_address?: string;
  state_of_origin?: string;
  lga?: string;
  permanent_address?: string;
  blood_group?: string;
  genotype?: string;
  allergies?: string;
  nok_surname?: string;
  nok_first_name?: string;
  nok_middle_name?: string;
  nok_relationship?: string;
  nok_address?: string;
  nok_phone?: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  created_by_name?: string | null;
  updated_by_name?: string | null;
  total_visits?: number;
  last_visit_at?: string | null;
}

export interface Visit {
  id: number;
  visit_id: string;
  patient: number;
  patient_id?: string;
  patient_name?: string;
  patient_photo?: string | null;
  /** Completed years from patient DOB (from Visit API). */
  age?: number;
  gender?: string;
  visit_type: string;
  status: string;
  date: string;
  time: string;
  clinic?: string;
  clinics?: string[]; // Multiple clinics for this visit
  completed_clinics?: string[]; // Clinics that have been completed
  location?: string;
  location_clinic_name?: string;
  doctor?: number;
  doctor_name?: string;
  created_by?: number | null;
  created_by_name?: string | null;
  clinical_notes?: string;
  is_new_registration?: boolean;
  is_first_visit?: boolean;
  is_returning_visit?: boolean;
  patient_visit_status?: string;
}

export interface VitalReading {
  id: number;
  visit?: number;
  patient: number;
  patient_name?: string;
  patient_photo?: string | null;
  temperature?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  pain_scale?: number | null;
  blood_sugar?: number | string | null;
  random_blood_sugar?: number | string | null;
  notes?: string;
  recorded_at: string;
  recorded_by?: number;
  recorded_by_name?: string | null;
}

class PatientService {
  /**
   * Get all patients
   */
  async getPatients(params?: {
    category?: string;
    gender?: string;
    blood_group?: string;
    location?: string;
    principal_staff?: number;
    search?: string;
    ordering?: string;
    page?: number;
    page_size?: number;
    age_min?: number;
    age_max?: number;
    last_visit_after?: string;
    last_visit_before?: string;
  }): Promise<{ results: Patient[]; count: number; next?: string; previous?: string }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Patient[]; count: number; next?: string; previous?: string }>(
      `/patients/${query}`
    );
  }

  /**
   * Get total and per-category patient counts.
   */
  async getPatientCounts(): Promise<{ total: number; employees: number; retirees: number; dependents: number; nonnpa: number }> {
    return apiFetch<{ total: number; employees: number; retirees: number; dependents: number; nonnpa: number }>('/patients/counts/');
  }

  /**
   * Get a single patient by ID
   */
  async getPatient(patientId: number): Promise<Patient> {
    return apiFetch<Patient>(`/patients/${patientId}/`);
  }

  /**
   * Load full patient + visit for an active consultation session.
   * Always returns sanitized camelCase fields (bloodGroup, employeeType, visitType, etc.).
   */
  async buildConsultationPatient(
    patientId: number,
    overlay: {
      visitId?: string | number | null;
      queueItemId?: number;
      waitTime?: number;
      priority?: string;
      vitalsCompleted?: boolean;
      queuePosition?: number;
      visitDate?: string;
      visitTime?: string;
      visitType?: string;
      clinics?: string[];
      completedClinics?: string[];
      visitClinic?: string;
      vitals?: unknown;
    } = {}
  ): Promise<Record<string, unknown>> {
    const visitIdNum = overlay.visitId ? Number(overlay.visitId) : NaN;
    const [apiPatient, visitData] = await Promise.all([
      this.getPatient(patientId),
      Number.isFinite(visitIdNum) && visitIdNum > 0
        ? apiFetch<Visit>(`/visits/${visitIdNum}/`).catch(() => null)
        : Promise.resolve(null),
    ]);

    const visitType = overlay.visitType || visitData?.visit_type || undefined;
    const fullName =
      apiPatient.full_name?.trim() ||
      `${apiPatient.first_name || ''} ${apiPatient.surname || ''}`.trim();

    const patientData: Record<string, unknown> = {
      id: String(apiPatient.id),
      visitId: overlay.visitId
        ? String(overlay.visitId)
        : visitData
          ? String(visitData.id)
          : '',
      patient_id: apiPatient.patient_id,
      patientId: apiPatient.patient_id,
      full_name: fullName,
      name: fullName,
      age: apiPatient.age ?? 0,
      age_display: apiPatient.age_display,
      gender: apiPatient.gender,
      personal_number: apiPatient.personal_number,
      allergies: apiPatient.allergies,
      waitTime: overlay.waitTime ?? 0,
      vitalsCompleted: overlay.vitalsCompleted ?? false,
      priority: overlay.priority ?? getVisitTypeLabel(visitType),
      visitDate: overlay.visitDate || visitData?.date || '',
      visitTime:
        overlay.visitTime ||
        (visitData?.time ? String(visitData.time).slice(0, 5) : ''),
      visitType,
      queueItemId: overlay.queueItemId,
      queuePosition: overlay.queuePosition,
      blood_group: apiPatient.blood_group,
      genotype: apiPatient.genotype,
      employee_type: apiPatient.employee_type,
      division: apiPatient.division,
      location: apiPatient.location,
      phone: apiPatient.phone,
      email: apiPatient.email,
      occupation: apiPatient.occupation,
      religion: apiPatient.religion,
      tribe: apiPatient.tribe,
      photo: apiPatient.photo,
      vitals: overlay.vitals,
      clinics: overlay.clinics ?? visitData?.clinics ?? [],
      completedClinics: overlay.completedClinics ?? visitData?.completed_clinics ?? [],
      visitClinic: overlay.visitClinic,
    };

    const sanitized = sanitizePatientForRendering(patientData);
    return {
      ...sanitized,
      visitType,
      queueItemId: overlay.queueItemId,
      clinics: patientData.clinics,
      completedClinics: patientData.completedClinics,
      visitClinic: overlay.visitClinic,
    };
  }

  /**
   * Create a new patient (optional photo via multipart).
   */
  async createPatient(data: Partial<Patient>, photo?: File): Promise<Patient> {
    if (!photo) {
      return apiFetch<Patient>('/patients/', {
        method: 'POST',
        body: JSON.stringify(data),
      });
    }

    const formData = new FormData();
    appendPatientFormFields(formData, { ...data, is_active: data.is_active ?? true });
    formData.append('photo', photo);
    return apiFetch<Patient>('/patients/', {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Update a patient (optional photo upload or removal via multipart).
   */
  async updatePatient(
    patientId: number,
    data: Partial<Patient>,
    options?: { photo?: File; clearPhoto?: boolean },
  ): Promise<Patient> {
    const { photo, clearPhoto } = options ?? {};
    if (!photo && !clearPhoto) {
      return apiFetch<Patient>(`/patients/${patientId}/`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    }

    const formData = new FormData();
    appendPatientFormFields(formData, data as Record<string, unknown>);
    if (photo) {
      formData.append('photo', photo);
    }
    if (clearPhoto) {
      formData.append('clear_photo', 'true');
    }
    return apiFetch<Patient>(`/patients/${patientId}/`, {
      method: 'PATCH',
      body: formData,
    });
  }

  /**
   * Delete a patient (soft delete)
   */
  async deletePatient(patientId: number): Promise<void> {
    return apiFetch<void>(`/patients/${patientId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get patient visits
   */
  async getPatientVisits(patientId: number): Promise<Visit[]> {
    return apiFetch<Visit[]>(`/patients/${patientId}/visits/`);
  }

  /**
   * Get patient vitals
   */
  async getPatientVitals(patientId: number, visitId?: number): Promise<VitalReading[]> {
    const params = new URLSearchParams({
      patient: patientId.toString(),
      page_size: '100'
    });
    if (visitId) {
      params.append('visit', visitId.toString());
    }
    const response = await apiFetch<{ results: VitalReading[]; count: number }>(`/vitals/?${params.toString()}`);
    return response.results || [];
  }

  /** Latest vital for a patient and/or visit (no paginated list hop). */
  async resolveVital(params: {
    patient?: number;
    visit?: number;
    ordering?: string;
  }): Promise<VitalReading | null> {
    try {
      const query = buildQueryString(params as Record<string, string | number | undefined>);
      return await apiFetch<VitalReading>(`/vitals/resolve/${query}`);
    } catch {
      return null;
    }
  }

  /** Whether a visit has at least one vital reading. */
  async vitalsExistForVisit(visitId: number): Promise<boolean> {
    try {
      const res = await apiFetch<{ exists: boolean }>(`/vitals/exists/?visit=${visitId}`);
      return res.exists;
    } catch {
      return false;
    }
  }

  /** Vitals history dashboard stat cards (replaces 4 parallel COUNT list calls). */
  async getVitalsHistoryStats(params?: Record<string, string | undefined>): Promise<{
    total: number;
    today: number;
    week: number;
    patients: number;
  }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | undefined>);
    const path = query ? `/vitals/history-stats/${query}` : '/vitals/history-stats/';
    return apiFetch(path);
  }

  /**
   * Get patient medical history
   */
  async getPatientHistory(patientId: number): Promise<any> {
    return apiFetch<any>(`/patients/${patientId}/history/`);
  }

  /** Full clinical overview for history tabs / consultation room sidebar. */
  async getClinicalOverview(patientId: number): Promise<{
    consultations: { results: unknown[]; count: number };
    lab_results: { results: unknown[]; count: number };
    radiology_reports: { results: unknown[]; count: number };
    radiology_orders: { results: unknown[]; count: number };
    prescriptions: { results: unknown[]; count: number };
    vitals: { results: unknown[]; count: number };
    physio_orders: { results: unknown[]; count: number };
    eye_orders: { results: unknown[]; count: number };
    ward_admissions: { results: unknown[]; count: number };
    certificates: { results: unknown[]; count: number };
    referrals: { results: unknown[]; count: number };
    visits: unknown[];
    annual_checkups: { results: unknown[]; count: number };
    medical_history: unknown;
  }> {
    return apiFetch(`/patients/${patientId}/clinical-overview/`);
  }

  /** Batch dependent counts keyed by principal staff id. */
  async getDependentsCounts(principalStaffIds: number[]): Promise<Record<string, number>> {
    if (!principalStaffIds.length) return {};
    const query = buildQueryString({
      principal_staff: principalStaffIds.join(','),
    });
    return apiFetch<Record<string, number>>(`/patients/dependents-counts/${query}`);
  }

  /**
   * Update patient medical history
   */
  async updatePatientHistory(patientId: number, data: Record<string, unknown>): Promise<Record<string, unknown>> {
    return apiFetch<any>(`/patients/${patientId}/update_history/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async promoteToOfficer(
    patientId: number,
    newPersonalNumber: string,
  ): Promise<{ patient: Patient; dependents_updated: number }> {
    return apiFetch<{ patient: Patient; dependents_updated: number }>(
      `/patients/${patientId}/promote/`,
      {
        method: 'PATCH',
        body: JSON.stringify({ new_personal_number: newPersonalNumber }),
      },
    );
  }

  async convertToCsr(patientId: number): Promise<{ patient: Patient; dependents_converted: number }> {
    return apiFetch<{ patient: Patient; dependents_converted: number }>(`/patients/${patientId}/convert-to-csr/`, {
      method: 'PATCH',
    });
  }

  /**
   * Merge this patient (loser) into another patient (winner). All clinical
   * FKs (visits, vitals, lab orders, prescriptions, consults, etc.) are
   * re-pointed to the winner; the loser is tombstoned. Admin-only.
   */
  async mergePatient(
    loserId: number,
    winnerId: number,
    reason: string,
  ): Promise<{
    winner_id: number;
    winner_patient_id: string;
    loser_id: number;
    loser_old_patient_id: string;
    loser_new_patient_id: string;
    counters: Record<string, number>;
    merge_audit_id: number;
    winner: Patient;
  }> {
    return apiFetch(`/patients/${loserId}/merge/`, {
      method: 'POST',
      body: JSON.stringify({ winner_id: winnerId, reason }),
    });
  }

  async getMergeAudit(patientId: number): Promise<
    Array<{
      id: number;
      winner_id: number;
      winner_patient_id: string;
      loser_id: number;
      loser_patient_id: string;
      merged_at: string;
      merged_by: string | null;
      reason: string;
      has_repointed_rows: boolean;
      counters: Record<string, number>;
    }>
  > {
    return apiFetch(`/patients/${patientId}/merge-audit/`);
  }

  /**
   * Reverse a previous merge. Admin-only emergency undo. Uses the merge
   * audit row's stored repointed_rows to accurately revert FK re-points
   * and restore the loser's tombstone record.
   */
  async unmergePatient(
    winnerId: number,
    mergeAuditId: number,
  ): Promise<{
    audit_id: number;
    original_audit_id: number;
    winner_id: number;
    winner_patient_id: string;
    loser_id: number;
    loser_patient_id: string;
  }> {
    return apiFetch(`/patients/${winnerId}/unmerge/`, {
      method: 'POST',
      body: JSON.stringify({ merge_audit_id: mergeAuditId }),
    });
  }
}

export const patientService = new PatientService();
export default patientService;
