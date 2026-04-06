import { apiFetch, buildQueryString } from '../api-client';

export type MedicalCertificatePurpose = 'fitness' | 'illness' | 'travel' | 'employment';

export interface MedicalCertificate {
  id: number;
  certificate_number: string;
  patient: number;
  patient_name?: string;
  patient_name_snapshot?: string;
  patient_id_snapshot?: string;
  patient_category_snapshot?: string;
  purpose: MedicalCertificatePurpose;
  valid_from: string; // YYYY-MM-DD
  valid_to: string; // YYYY-MM-DD
  /** Calendar days of sick leave (illness / sick leave certificates). */
  sick_leave_days?: number | null;
  findings?: string;
  recommendations?: string;
  issued_by?: number;
  issued_by_name?: string;
  doctor_name_snapshot?: string;
  issued_at: string;
}

export class MedicalCertificateService {
  async getCertificates(params?: {
    patient?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: MedicalCertificate[]; count: number; next?: string; previous?: string }> {
    const query = buildQueryString(params || {});
    // `patients.urls` is included at the API root, so routes are under `/medical-certificates/`.
    return apiFetch<{ results: MedicalCertificate[]; count: number; next?: string; previous?: string }>(
      `/medical-certificates/${query}`,
    );
  }

  async createCertificate(payload: {
    patient: number;
    purpose: MedicalCertificatePurpose;
    valid_from: string;
    valid_to: string;
    sick_leave_days?: number | null;
    findings?: string;
    recommendations?: string;
  }): Promise<MedicalCertificate> {
    // `patients.urls` is included at the API root, so routes are under `/medical-certificates/`.
    return apiFetch<MedicalCertificate>(`/medical-certificates/`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

export const medicalCertificateService = new MedicalCertificateService();

