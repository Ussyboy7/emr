import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../api-client', () => ({
  apiFetch: vi.fn(),
  buildQueryString: vi.fn((params: Record<string, unknown>) => {
    const entries = Object.entries(params || {}).filter(([, v]) => v !== undefined && v !== '');
    if (!entries.length) return '';
    return '?' + entries.map(([k, v]) => `${k}=${v}`).join('&');
  }),
}));

import { apiFetch } from '../api-client';
import { referralService } from './referral-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('referralService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getReferrals', () => {
    it('fetches referrals list', async () => {
      const payload = { results: [{ id: 1, referral_id: 'REF-001' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await referralService.getReferrals({ page: 1 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/consultation/referrals/');
    });

    it('passes exclude_draft as string param', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await referralService.getReferrals({ exclude_draft: true });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('exclude_draft=true');
    });
  });

  describe('getReferral', () => {
    it('fetches single referral', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, referral_id: 'REF-005' });

      const res = await referralService.getReferral(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/consultation/referrals/5/');
    });
  });

  describe('createReferral', () => {
    it('posts new referral', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, referral_id: 'REF-001' });

      const res = await referralService.createReferral({
        patient: 10,
        specialty: 'Cardiology',
        facility: 'City Hospital',
        reason: 'Further evaluation',
      } as any);
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/referrals/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateReferral', () => {
    it('patches an existing referral', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, status: 'submitted_to_records' });

      const res = await referralService.updateReferral(3, { status: 'submitted_to_records' } as any);
      expect(res.status).toBe('submitted_to_records');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/referrals/3/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('deleteReferral', () => {
    it('deletes a referral', async () => {
      mockApiFetch.mockResolvedValue(undefined);

      await referralService.deleteReferral(3);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/referrals/3/',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  describe('submitToRecords', () => {
    it('posts submit-to-records action', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, status: 'submitted_to_records' });

      const res = await referralService.submitToRecords(1);
      expect(res.status).toBe('submitted_to_records');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/referrals/1/submit_to_records/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('approveForForms', () => {
    it('posts approve-for-forms action', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, status: 'approved_for_forms' });

      const res = await referralService.approveForForms(1);
      expect(res.status).toBe('approved_for_forms');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/referrals/1/approve_for_forms/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('acknowledgeResponsibilityForm', () => {
    it('posts acknowledgment for a form', async () => {
      mockApiFetch.mockResolvedValue({ id: 10, referral: 1, sequence_number: 1 });

      const res = await referralService.acknowledgeResponsibilityForm(1, 10);
      expect(res.id).toBe(10);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/consultation/referrals/1/acknowledge_responsibility_form/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"form_id":10'),
        }),
      );
    });
  });

  describe('getReferralFacilities', () => {
    it('fetches referral facilities', async () => {
      mockApiFetch.mockResolvedValue([{ id: 1, name: 'City Hospital' }]);

      const res = await referralService.getReferralFacilities();
      expect(res).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/consultation/referral-facilities/');
    });

    it('normalizes paginated response', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Hospital A' }] });

      const res = await referralService.getReferralFacilities();
      expect(res).toHaveLength(1);
    });
  });
});
