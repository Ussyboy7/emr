/**
 * Ward management API service
 */
import { apiFetch, buildQueryString } from '../api-client';

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
  async getWardBeds(wardId: number): Promise<any[]> {
    return apiFetch<any[]>(`/wards/${wardId}/beds/`);
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
    admitting_doctor?: number;
    page?: number;
    page_size?: number;
  }): Promise<{ results: PatientAdmission[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: PatientAdmission[]; count: number }>(`/admissions/${query}`);
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
    admission_notes?: string;
  }): Promise<PatientAdmission> {
    return apiFetch<PatientAdmission>('/admissions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Discharge patient
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

  /**
   * Assign bed to patient
   */
  async assignBed(bedId: number, admissionId: number): Promise<Bed> {
    return apiFetch<Bed>(`/beds/${bedId}/assign_patient/`, {
      method: 'POST',
      body: JSON.stringify({ admission: admissionId }),
    });
  }
}

export const wardService = new WardService();