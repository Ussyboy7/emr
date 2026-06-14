/**
 * Human Resources API — annual check-up compliance (HR-safe fields only).
 */
import { apiFetch, buildQueryString } from '../api-client';

export type ComplianceStatus =
  | 'completed'
  | 'in_progress'
  | 'exempt'
  | 'due'
  | 'overdue';

export interface HRComplianceRow {
  patient_id: number;
  patient_display_id: string;
  personal_number: string;
  full_name: string;
  division: string;
  location: string;
  location_clinic_name: string;
  programme_year: number;
  compliance_status: ComplianceStatus;
  annual_checkup_id: number | null;
  visit_id: string | null;
  visit_date: string | null;
  fitness_outcome: string;
  fitness_outcome_display: string;
  outcome_notes: string;
  signed_off_at: string | null;
  has_outcome_letter: boolean;
  exemption_reason: string;
  exemption_notes: string;
}

export interface HRComplianceSummary {
  completed: number;
  in_progress: number;
  exempt: number;
  due: number;
  overdue: number;
  total_eligible: number;
}

export interface AnnualCheckupExemption {
  id: number;
  patient: number;
  patient_name: string;
  patient_display_id: string;
  programme_year: number;
  reason: string;
  reason_display: string;
  notes: string;
  granted_by: number | null;
  granted_by_name: string | null;
  granted_at: string;
  expires_at: string | null;
}

class HRService {
  async getCompliance(params?: {
    programme_year?: number;
    division?: string;
    status?: string;
    search?: string;
  }): Promise<{
    programme_year: number;
    summary: HRComplianceSummary;
    results: HRComplianceRow[];
    count: number;
  }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | undefined>);
    return apiFetch(`/hr/compliance/${query}`);
  }

  async getSummary(programme_year?: number): Promise<HRComplianceSummary & { programme_year: number }> {
    const query = buildQueryString({
      programme_year,
    } as Record<string, number | undefined>);
    return apiFetch(`/hr/compliance/summary/${query}`);
  }

  async exportCsv(programme_year?: number, params?: { division?: string; status?: string }): Promise<Blob> {
    const query = buildQueryString({
      programme_year,
      ...params,
    } as Record<string, string | number | undefined>);
    return apiFetch<Blob>(`/hr/compliance/export-csv/${query}`, { responseType: 'blob' });
  }

  async fetchOutcomeLetterPdf(annualCheckupId: number): Promise<Blob> {
    return apiFetch<Blob>(`/hr/compliance/${annualCheckupId}/outcome-letter-pdf/`, {
      responseType: 'blob',
    });
  }

  downloadBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async listExemptions(params?: {
    programme_year?: number;
    patient?: number;
    page_size?: number;
  }): Promise<{ results: AnnualCheckupExemption[]; count: number }> {
    const query = buildQueryString((params || {}) as Record<string, string | number | undefined>);
    return apiFetch(`/hr/exemptions/${query}`);
  }

  async createExemption(data: {
    patient: number;
    programme_year: number;
    reason: string;
    notes?: string;
    expires_at?: string | null;
  }): Promise<AnnualCheckupExemption> {
    return apiFetch('/hr/exemptions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteExemption(id: number): Promise<void> {
    await apiFetch(`/hr/exemptions/${id}/`, { method: 'DELETE' });
  }
}

export const hrService = new HRService();
export default hrService;
