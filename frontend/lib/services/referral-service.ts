/**
 * Referral API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface Referral {
  id: number;
  referral_id: string;
  patient: number;
  patient_name?: string;
  visit?: number;
  session?: number;
  referred_by?: number;
  referred_by_name?: string;
  specialty: string;
  facility: string;
  facility_type: 'internal' | 'external' | 'specialist';
  reason: string;
  clinical_summary?: string;
  urgency: 'routine' | 'urgent' | 'emergency';
  contact_person?: string;
  contact_phone?: string;
  contact_email?: string;
  status:
    | 'draft'
    | 'submitted_to_records'
    | 'records_review'
    | 'returned_for_correction'
    | 'approved_for_forms'
    | 'closed'
    | 'cancelled';
  notes?: string;
  referred_at: string;
  submitted_at?: string;
  reviewed_at?: string;
  approved_at?: string;
  closed_at?: string;
  responsibility_forms_count?: number;
  latest_responsibility_form?: ResponsibilityFormIssuance | null;
}

export interface ResponsibilityFormIssuance {
  id: number;
  referral: number;
  referral_id_display?: string;
  sequence_number: number;
  issue_date: string;
  valid_from: string;
  valid_to: string;
  status: 'active' | 'expired' | 'revoked' | 'used';
  hospital_name_snapshot?: string;
  document_file?: string;
  document_file_url?: string;
  notes?: string;
  issued_by?: number;
  issued_by_name?: string;
}

class ReferralService {
  /**
   * Get all referrals
   */
  async getReferrals(params?: {
    patient?: string;
    visit?: string;
    session?: string;
    referred_by?: string;
    specialty?: string;
    facility?: string;
    status?: string;
    urgency?: string;
    search?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Referral[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Referral[]; count: number }>(`/consultation/referrals/${query}`);
  }

  /**
   * Get a single referral
   */
  async getReferral(referralId: number): Promise<Referral> {
    return apiFetch<Referral>(`/consultation/referrals/${referralId}/`);
  }

  /**
   * Create a referral
   */
  async createReferral(data: Partial<Referral>): Promise<Referral> {
    return apiFetch<Referral>('/consultation/referrals/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a referral
   */
  async updateReferral(referralId: number, data: Partial<Referral>): Promise<Referral> {
    return apiFetch<Referral>(`/consultation/referrals/${referralId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a referral
   */
  async deleteReferral(referralId: number): Promise<void> {
    return apiFetch<void>(`/consultation/referrals/${referralId}/`, {
      method: 'DELETE',
    });
  }

  async submitToRecords(referralId: number): Promise<Referral> {
    return apiFetch<Referral>(`/consultation/referrals/${referralId}/submit_to_records/`, {
      method: 'POST',
    });
  }

  async startReview(referralId: number): Promise<Referral> {
    return apiFetch<Referral>(`/consultation/referrals/${referralId}/start_review/`, {
      method: 'POST',
    });
  }

  async approveForForms(referralId: number): Promise<Referral> {
    return apiFetch<Referral>(`/consultation/referrals/${referralId}/approve_for_forms/`, {
      method: 'POST',
    });
  }

  async returnForCorrection(referralId: number, notes?: string): Promise<Referral> {
    return apiFetch<Referral>(`/consultation/referrals/${referralId}/return_for_correction/`, {
      method: 'POST',
      body: JSON.stringify({ notes: notes || '' }),
    });
  }

  async closeReferral(referralId: number): Promise<Referral> {
    return apiFetch<Referral>(`/consultation/referrals/${referralId}/close_referral/`, {
      method: 'POST',
    });
  }

  async getForms(referralId: number): Promise<ResponsibilityFormIssuance[]> {
    return apiFetch<ResponsibilityFormIssuance[]>(`/consultation/referrals/${referralId}/forms/`);
  }

  async issueForm(
    referralId: number,
    payload: { valid_from: string; valid_to: string; notes?: string; document_file?: File }
  ): Promise<ResponsibilityFormIssuance> {
    if (payload.document_file) {
      const formData = new FormData();
      formData.append('valid_from', payload.valid_from);
      formData.append('valid_to', payload.valid_to);
      if (payload.notes) formData.append('notes', payload.notes);
      formData.append('document_file', payload.document_file);
      return apiFetch<ResponsibilityFormIssuance>(`/consultation/referrals/${referralId}/forms/`, {
        method: 'POST',
        body: formData,
      });
    }
    return apiFetch<ResponsibilityFormIssuance>(`/consultation/referrals/${referralId}/forms/`, {
      method: 'POST',
      body: JSON.stringify({
        valid_from: payload.valid_from,
        valid_to: payload.valid_to,
        notes: payload.notes || '',
      }),
    });
  }

  async updateFormStatus(
    referralId: number,
    formId: number,
    status: ResponsibilityFormIssuance['status']
  ): Promise<ResponsibilityFormIssuance> {
    return apiFetch<ResponsibilityFormIssuance>(`/consultation/referrals/${referralId}/update_form_status/`, {
      method: 'POST',
      body: JSON.stringify({ form_id: formId, status }),
    });
  }
}

export const referralService = new ReferralService();

