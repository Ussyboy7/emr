/**
 * Ward management API service
 */
import { apiFetch, buildQueryString } from '../api-client';
import { MAX_LIST_PAGE_SIZE } from '../pagination-constants';

export interface Ward {
  id: number;
  ward_code: string;
  name: string;
  ward_type: string;
  floor?: string;
  building?: string;
  total_beds: number;
  occupied_beds: number;
  available_beds: number;
  occupancy_rate: number;
  description?: string;
  status: string;
  head_nurse?: number;
  head_nurse_name?: string;
  phone_extension?: string;
  beds_count: number;
}

/** Embedded escort details on a PatientAdmission. */
export interface AdmissionEscort {
  id: number;
  admission: number;
  admission_display_id?: string;
  patient_name?: string;
  ward_name?: string;
  referral: number | null;
  referral_id_display?: string | null;
  referral_status?: string | null;
  referral_urgency?: string | null;
  referral_specialty?: string | null;
  referral_reason?: string | null;
  referral_clinical_summary?: string | null;
  referral_facility_type?: string | null;
  referral_facility_partner?: number | null;
  referral_contact_person?: string | null;
  referral_contact_phone?: string | null;
  referral_contact_email?: string | null;
  referral_notes?: string | null;
  facility: number | null;
  facility_name: string | null;
  facility_name_snapshot: string;
  primary_nurse: number | null;
  primary_nurse_name: string | null;
  additional_nurses: number[];
  additional_nurse_names: string[];
  transport_mode: string;
  departure_at: string | null;
  handover_summary: string;
  arrival_confirmed_at: string | null;
  arrival_confirmed_by: number | null;
  arrival_confirmed_by_name: string | null;
  arrival_notes: string;
  arrival_call_outcome: string;
  is_arrival_confirmed: boolean;
  created_at: string;
  updated_at: string;
}

/** Doctor-side payload to create an external-care referral as part of
 * initiating a discharge. Mirrors the consultation referral form. */
export interface InitiateDischargeReferralInput {
  facility_partner?: number | null;
  facility?: string;
  facility_type?: 'internal' | 'external' | 'specialist';
  specialty: string;
  reason: string;
  clinical_summary?: string;
  urgency?: 'routine' | 'urgent' | 'emergency';
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  notes?: string;
}

export interface PatientAdmission {
  id: number;
  admission_id: string;
  patient: number;
  patient_name: string;
  visit: number;
  ward: number;
  ward_name: string;
  bed?: number;
  bed_number?: string;
  admission_type: string;
  admitting_doctor?: number;
  admitting_doctor_name?: string;
  admission_date: string;
  admission_diagnosis: string;
  presenting_complaint?: string;
  admission_instructions?: string;
  admission_notes?: string;
  status: string;
  current_condition?: string;
  discharge_date?: string;
  discharge_type?: string;
  discharge_diagnosis?: string;
  discharge_notes?: string;
  discharge_summary?: string;
  follow_up_instructions?: string;
  discharge_doctor?: number;
  discharge_doctor_name?: string;
  transfer_to_ward?: number;
  transfer_reason?: string;
  length_of_stay: number;
  is_active: boolean;
  // Nurse exit / sign-out
  nurse_exit_summary?: string;
  discharged_with?: 'self' | 'family' | 'escort_to_external' | 'transferred' | 'mortuary' | '';
  companion_name?: string;
  companion_relationship?: string;
  companion_phone?: string;
  physically_left_at?: string | null;
  confirmed_by_nurse?: number | null;
  confirmed_by_nurse_name?: string | null;
  // Embedded escort (read-only)
  escort?: AdmissionEscort | null;
  location_clinic_name?: string;
}

export interface WardAssignment {
  id: number;
  admission: number;
  nurse: number;
  nurse_name: string;
  patient_name: string;
  ward_name: string;
  assignment_type: string;
  status: string;
  assigned_at: string;
  completed_at?: string;
  responsibilities?: string;
  shift_notes?: string;
  assigned_by?: number;
  assigned_by_name?: string;
  is_active: boolean;
}

export interface Bed {
  id: number;
  bed_number: string;
  ward: number;
  ward_name?: string;
  bed_type: string;
  status: string;
  current_patient?: number;
  current_patient_name?: string;
  admission_date?: string;
  has_oxygen: boolean;
  has_suction: boolean;
  has_monitor: boolean;
  has_ventilator: boolean;
  has_iv_pole: boolean;
}

export interface AdmissionObservationVital {
  id: number;
  admission: number;
  recorded_at: string;
  temperature_c?: string | null;
  pulse?: number | null;
  respiratory_rate?: number | null;
  bp_systolic?: number | null;
  bp_diastolic?: number | null;
  fbs_mmol?: string | null;
  rbs_mmol?: string | null;
  notes?: string;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
}

export interface AdmissionTreatmentRow {
  id: number;
  admission: number;
  drug_name: string;
  dosage?: string;
  route?: string;
  time_administered?: string | null;
  time_completed?: string | null;
  drug_reaction?: string;
  nurse_initials?: string;
  doctor_initials?: string;
  created_at: string;
  recorded_by?: number | null;
  recorded_by_name?: string | null;
}

class WardService {
  /**
   * Get all wards
   */
  async getWards(params?: {
    ward_type?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Ward[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Ward[]; count: number }>(`/wards/${query}`);
  }

  /**
   * Get ward by ID
   */
  async getWard(id: number): Promise<Ward> {
    return apiFetch<Ward>(`/wards/${id}/`);
  }

  /**
   * Create ward
   */
  async createWard(data: {
    ward_code: string;
    name: string;
    ward_type: string;
    floor?: string;
    building?: string;
    total_beds: number;
    description?: string;
    status?: string;
    head_nurse?: number;
    phone_extension?: string;
  }): Promise<Ward> {
    return apiFetch<Ward>('/wards/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update ward
   */
  async updateWard(id: number, data: Partial<Ward>): Promise<Ward> {
    return apiFetch<Ward>(`/wards/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get ward beds
   */
  async getWardBeds(wardId: number): Promise<Bed[]> {
    return apiFetch<Bed[]>(`/wards/${wardId}/beds/`);
  }

  async createBed(data: {
    ward: number;
    bed_number: string;
    bed_type?: string;
    status?: string;
    has_oxygen?: boolean;
    has_suction?: boolean;
    has_monitor?: boolean;
    has_ventilator?: boolean;
    has_iv_pole?: boolean;
  }): Promise<Bed> {
    return apiFetch<Bed>('/beds/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateBed(id: number, data: Partial<Bed>): Promise<Bed> {
    return apiFetch<Bed>(`/beds/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteBed(id: number): Promise<void> {
    await apiFetch(`/beds/${id}/`, { method: 'DELETE' });
  }

  /**
   * Get ward occupancy
   */
  async getWardOccupancy(wardId: number): Promise<any> {
    return apiFetch<any>(`/wards/${wardId}/occupancy/`);
  }

  /**
   * Get all patient admissions
   */
  async getAdmissions(params?: {
    patient?: number;
    ward?: number;
    status?: string;
    /**
     * Comma-separated list of statuses to include. Use when callers want
     * "any of these" (e.g. the nurse's Active-patients view sends
     * ``admitted,pending_discharge,transferred`` so discharged is excluded
     * even when the user picks "All Status").
     */
    status_in?: string;
    admitting_doctor?: number;
    page?: number;
    page_size?: number;
    admission_date?: string;
    admission_date_after?: string;
    admission_date_before?: string;
    admission_type?: string;
    /** "Recently discharged" view scope — discharge_date >= this date. */
    discharged_after?: string;
    discharged_before?: string;
    search?: string;
    escalated?: string | number | boolean;
    unassigned_bed?: string | number | boolean;
  }): Promise<{ results: PatientAdmission[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PatientAdmission[]; count: number }>(`/admissions/${query}`);
  }

  async getAdmissionListStats(params?: Omit<
    Parameters<WardService['getAdmissions']>[0],
    'page' | 'page_size' | 'status' | 'ordering'
  >): Promise<{
    total: number;
    admitted: number;
    pending_discharge: number;
    escalated: number;
    unassigned_bed: number;
  }> {
    const query = buildQueryString(params || {});
    const path = query ? `/admissions/list-stats/${query}` : '/admissions/list-stats/';
    return apiFetch(path);
  }

  /**
   * Get admission by ID
   */
  async getAdmission(id: number): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${id}/`);
  }

  /**
   * Create patient admission
   */
  async createAdmission(data: {
    patient: number;
    visit: number;
    ward: number;
    bed?: number;
    admission_type: string;
    admitting_doctor?: number;
    nursing_order?: number;
    admission_diagnosis: string;
    presenting_complaint?: string;
    admission_instructions?: string;
    admission_notes?: string;
  }): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>('/admissions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Discharge patient (direct — used when there is no pending_discharge step)
   */
  async dischargePatient(admissionId: number, data: {
    discharge_type: string;
    discharge_doctor?: number;
    discharge_diagnosis?: string;
    discharge_notes?: string;
    discharge_summary?: string;
    follow_up_instructions?: string;
  }): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/discharge/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Step 1 of 2-step discharge: doctor fills in discharge details and sets
   * status to pending_discharge. When ``referral`` is provided, the backend
   * creates a linked ``consultation.Referral`` and a stub
   * ``AdmissionEscort`` so the nurse can pick it up at sign-out.
   */
  async initiateDischarge(admissionId: number, data: {
    discharge_type: string;
    discharge_diagnosis: string;
    discharge_notes?: string;
    discharge_summary?: string;
    follow_up_instructions?: string;
    referral?: InitiateDischargeReferralInput;
  }): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/initiate_discharge/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Edit the external-care referral attached at ``initiate_discharge``.
   *
   * Same field shape as ``InitiateDischargeReferralInput`` so the doctor
   * can adjust any combination of facility / specialty / urgency / contacts
   * without re-creating the referral. Backend rejects edits once the nurse
   * has confirmed arrival at the receiving facility.
   */
  async updateAdmissionReferral(
    admissionId: number,
    data: Partial<InitiateDischargeReferralInput>,
  ): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/update_referral/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Cancel the external-care referral. Allowed only while the admission
   * is still ``pending_discharge`` and the escort hasn't been arrival-
   * confirmed; after that the patient has physically left and the
   * cancellation must go through the consultation referrals module.
   */
  async cancelAdmissionReferral(
    admissionId: number,
    reason?: string,
  ): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/cancel_referral/`, {
      method: 'POST',
      body: JSON.stringify({ reason: reason || '' }),
    });
  }

  /**
   * Step 2 of 2-step discharge: nurse confirms the patient has left.
   *
   * The exit summary is required (the backend rejects pending_discharge
   * confirmations without it). Optional companion + escort blocks may be
   * supplied — escort details land on a stub ``AdmissionEscort`` row that
   * the nurse will later mark "arrival confirmed" via
   * ``confirmAdmissionEscortArrival``.
   */
  async completeDischarge(admissionId: number, data: {
    nurse_exit_summary: string;
    discharged_with?: PatientAdmission['discharged_with'];
    companion_name?: string;
    companion_relationship?: string;
    companion_phone?: string;
    discharge_notes?: string;
    follow_up_instructions?: string;
    escort?: {
      primary_nurse?: number;
      additional_nurses?: number[];
      transport_mode?: string;
      handover_summary?: string;
    };
  }): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/discharge/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Fetch escort assignments — used by the nurse "patients leaving with us"
   * queue. ``status`` filters by arrival_confirmed_at: ``pending`` returns
   * escorts still in transit, ``confirmed`` returns those with handover
   * already logged.
   */
  async getAdmissionEscorts(params?: {
    admission?: number;
    facility?: number;
    referral?: number;
    status?: 'pending' | 'confirmed';
    page?: number;
    page_size?: number;
  }): Promise<{ results: AdmissionEscort[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: AdmissionEscort[]; count: number }>(`/admission-escorts/${query}`);
  }

  /** Mark a completed escort as having handed over at the receiving facility. */
  async confirmAdmissionEscortArrival(escortId: number, data: {
    arrival_notes?: string;
    arrival_call_outcome?: 'answered' | 'voicemail' | 'handover_in_person';
  }): Promise<AdmissionEscort> {
    return apiFetch<AdmissionEscort>(`/admission-escorts/${escortId}/confirm_arrival/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Download the Ward Admission Summary PDF as a Blob.
   *
   * Behaviour by admission status:
   *   - admitted / pending_discharge → live render, marked INTERIM
   *   - discharged < 7 days → live render, snapshot opportunistically
   *     (lets late labs / radiology / escort confirmation reach the
   *     final audit copy)
   *   - discharged ≥ 7 days → cached snapshot (audit-locked)
   */
  async fetchAdmissionSummaryPdf(admissionId: number): Promise<Blob> {
    return apiFetch<Blob>(`/admissions/${admissionId}/summary_pdf/`, {
      responseType: 'blob',
    });
  }

  /**
   * Download the patient-facing one-page Discharge Slip PDF (the handout
   * the patient takes home). Only available post-discharge.
   */
  async fetchDischargeSlipPdf(admissionId: number): Promise<Blob> {
    return apiFetch<Blob>(`/admissions/${admissionId}/discharge_slip_pdf/`, {
      responseType: 'blob',
    });
  }

  /**
   * Download the formal Referral Letter PDF for the receiving facility.
   * Only available when the admission has a linked external referral
   * (i.e. ``admission.escort.referral``). The backend returns 400 if
   * no referral exists.
   */
  async fetchReferralLetterPdf(admissionId: number): Promise<Blob> {
    return apiFetch<Blob>(`/admissions/${admissionId}/referral_letter_pdf/`, {
      responseType: 'blob',
    });
  }

  /**
   * Download a Patient / Guardian Responsibility Form PDF.
   *
   * ``formType`` defaults to ``'auto'`` which picks the right template:
   *   * ``transfer`` — patient is being transferred to another facility
   *   * ``dama``     — Discharge Against Medical Advice
   *   * ``general``  — generic discharge acknowledgment
   *
   * Always rendered live (these are pre-signature handouts).
   */
  async fetchResponsibilityFormPdf(
    admissionId: number,
    formType: 'transfer' | 'dama' | 'general' | 'auto' = 'auto',
  ): Promise<Blob> {
    return apiFetch<Blob>(
      `/admissions/${admissionId}/responsibility_form_pdf/?form_type=${encodeURIComponent(formType)}`,
      { responseType: 'blob' },
    );
  }

  /**
   * Update admission details (PATCH)
   */
  async updateAdmission(admissionId: number, data: {
    current_condition?: string;
    admission_notes?: string;
    discharge_diagnosis?: string;
    discharge_notes?: string;
    discharge_summary?: string;
    follow_up_instructions?: string;
  }): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Assign or change a patient's bed. Pass bedId=null to remove from bed.
   * Returns the updated admission (with bed_number populated).
   */
  async assignBedToAdmission(admissionId: number, bedId: number | null): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/assign_bed/`, {
      method: 'POST',
      body: JSON.stringify({ bed_id: bedId }),
    });
  }

  /**
   * Transfer patient
   */
  async transferPatient(admissionId: number, data: {
    new_ward_id: number;
    transfer_reason?: string;
  }): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>(`/admissions/${admissionId}/transfer/`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Active nurse assignments for a bounded set of admissions (unpaginated).
   * Used by Ward Care Care Plan — backs `/assignments/active-for-admissions/`.
   */
  async getActiveAssignmentsForAdmissions(
    admissionIds: number[],
  ): Promise<{ results: WardAssignment[]; count: number }> {
    const ids = [...new Set(admissionIds.filter((id) => Number.isFinite(id)))];
    if (!ids.length) {
      return { results: [], count: 0 };
    }
    const query = buildQueryString({ admission_ids: ids.join(',') });
    return apiFetch<{ results: WardAssignment[]; count: number }>(
      `/assignments/active-for-admissions/${query}`,
    );
  }

  /**
   * Get ward assignments
   */
  async getAssignments(params?: {
    admission?: number;
    nurse?: number;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: WardAssignment[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: WardAssignment[]; count: number }>(`/assignments/${query}`);
  }

  /**
   * Create ward assignment
   */
  async createAssignment(data: {
    admission: number;
    nurse: number;
    assignment_type: string;
    responsibilities?: string;
  }): Promise<WardAssignment> {
    // Backend exposes assignments at `/assignments/` (see `backend/wards/urls.py`)
    return apiFetch<WardAssignment>('/assignments/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Complete ward assignment
   */
  async completeAssignment(assignmentId: number, notes?: string): Promise<WardAssignment> {
    return apiFetch<WardAssignment>(`/assignments/${assignmentId}/complete/`, {
      method: 'POST',
      body: JSON.stringify({ notes }),
    });
  }

  /**
   * Get beds
   */
  async getBeds(params?: {
    ward?: number;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Bed[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Bed[]; count: number }>(`/beds/${query}`);
  }

  async getObservationVitals(params: { admission: number }): Promise<{ results: AdmissionObservationVital[]; count?: number }> {
    const query = buildQueryString({ ...params, page_size: MAX_LIST_PAGE_SIZE });
    return apiFetch<{ results: AdmissionObservationVital[]; count?: number }>(`/observation-vitals/${query}`);
  }

  async createObservationVital(data: {
    admission: number;
    temperature_c?: string;
    pulse?: number;
    respiratory_rate?: number;
    bp_systolic?: number;
    bp_diastolic?: number;
    fbs_mmol?: string;
    rbs_mmol?: string;
    notes?: string;
    recorded_at?: string;
  }): Promise<AdmissionObservationVital> {
    return apiFetch<AdmissionObservationVital>('/observation-vitals/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getTreatmentSheetRows(params: { admission: number }): Promise<{ results: AdmissionTreatmentRow[]; count?: number }> {
    const query = buildQueryString({ ...params, page_size: MAX_LIST_PAGE_SIZE });
    return apiFetch<{ results: AdmissionTreatmentRow[]; count?: number }>(`/treatment-sheet-rows/${query}`);
  }

  async createTreatmentSheetRow(data: {
    admission: number;
    drug_name: string;
    dosage?: string;
    route?: string;
    time_administered?: string;
    time_completed?: string;
    drug_reaction?: string;
    nurse_initials?: string;
    doctor_initials?: string;
  }): Promise<AdmissionTreatmentRow> {
    return apiFetch<AdmissionTreatmentRow>('/treatment-sheet-rows/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

}

export const wardService = new WardService();
export default wardService;