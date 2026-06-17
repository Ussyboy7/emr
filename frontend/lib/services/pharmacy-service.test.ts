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
import { pharmacyService } from './pharmacy-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('pharmacyService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getPrescriptions', () => {
    it('fetches prescriptions list', async () => {
      const payload = { results: [{ id: 1, prescription_id: 'RX-001' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await pharmacyService.getPrescriptions({ page: 1 });
      expect(res.results).toHaveLength(1);
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('/v1/pharmacy/prescriptions/');
    });
  });

  describe('getPrescription', () => {
    it('fetches single prescription', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, prescription_id: 'RX-005' });

      const res = await pharmacyService.getPrescription(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/v1/pharmacy/prescriptions/5/');
    });
  });

  describe('getMedications', () => {
    it('fetches medications with search', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await pharmacyService.getMedications({ search: 'paracetamol' });
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('/v1/pharmacy/medications/');
      expect(callArg).toContain('search=paracetamol');
    });
  });

  describe('getGenerics', () => {
    it('fetches generic medications', async () => {
      const payload = { results: [{ id: 1, name: 'Paracetamol' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await pharmacyService.getGenerics();
      expect(res.results).toHaveLength(1);
    });
  });

  describe('getInventory', () => {
    it('fetches inventory list', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await pharmacyService.getInventory({ page: 1, page_size: 20 });
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('/v1/pharmacy/inventory/');
    });
  });

  describe('getStockRequests', () => {
    it('fetches stock requests', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await pharmacyService.getStockRequests();
      const callArg = mockApiFetch.mock.calls[0][0] as string;
      expect(callArg).toContain('/v1/pharmacy/stock-requests/');
    });
  });

  describe('createStockRequest', () => {
    it('posts stock request with items', async () => {
      const req = { id: 1, request_id: 'SR-001' };
      mockApiFetch.mockResolvedValue(req);

      const res = await pharmacyService.createStockRequest({
        notes: 'Urgent restock',
        items: [{ medication: 10, quantity: 50 }],
      });
      expect(mockApiFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/pharmacy/stock-requests/'),
        expect.objectContaining({ method: 'POST' }),
      );
      expect(res.id).toBe(1);
    });
  });

  describe('checkInteractions', () => {
    it('posts medication IDs for interaction check', async () => {
      mockApiFetch.mockResolvedValue([]);

      const res = await pharmacyService.checkInteractions([1, 2, 3]);
      expect(res).toEqual([]);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/v1/pharmacy/prescriptions/check_interactions/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('medication_ids'),
        }),
      );
    });
  });

  describe('dispense', () => {
    it('posts dispense action', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, quantity: 10 });

      const res = await pharmacyService.dispense(5, 10, 10);
      expect(res.quantity).toBe(10);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/v1/pharmacy/prescriptions/5/dispense/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });
});
