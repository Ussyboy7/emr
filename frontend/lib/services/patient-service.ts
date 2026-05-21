/**
 * Patient API service
 */
import { apiFetch, buildQueryString } from '../api-client';

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
    priority: patient.priority || 'Normal',
    visitDate: String(patient.visitDate || ''),
    visitTime: String(patient.visitTime || ''),
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
   * Create a new patient
   */
  async createPatient(data: Partial<Patient>): Promise<Patient> {
    return apiFetch<Patient>('/patients/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a patient
   */
  async updatePatient(patientId: number, data: Partial<Patient>): Promise<Patient> {
    return apiFetch<Patient>(`/patients/${patientId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
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

  /**
   * Get patient medical history
   */
  async getPatientHistory(patientId: number): Promise<any> {
    return apiFetch<any>(`/patients/${patientId}/history/`);
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

  async uploadPatientPhoto(patientId: number, formData: FormData): Promise<Patient> {
    return apiFetch<Patient>(`/patients/patients/${patientId}/upload_photo/`, {
      method: 'POST',
      body: formData,
      headers: {}, // Let browser set Content-Type for FormData
    });
  }
}

export const patientService = new PatientService();
export default patientService;
