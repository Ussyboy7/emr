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
  status: 'draft' | 'sent' | 'accepted' | 'scheduled' | 'completed' | 'cancelled';
  notes?: string;
  referred_at: string;
  accepted_at?: string;
  scheduled_at?: string;
  completed_at?: string;
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
}

export const referralService = new ReferralService();

