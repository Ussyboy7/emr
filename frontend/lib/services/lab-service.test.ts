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
import { labService } from './lab-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('labService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getOrders', () => {
    it('fetches lab orders list', async () => {
      const payload = { results: [{ id: 1, order_id: 'LB-001' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await labService.getOrders({ page: 1 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/laboratory/orders/');
    });

    it('passes filter params to query string', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await labService.getOrders({ priority: 'urgent', status: 'pending' });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('priority=urgent');
      expect(url).toContain('status=pending');
    });
  });

  describe('getOrder', () => {
    it('fetches single lab order by ID', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, order_id: 'LB-005' });

      const res = await labService.getOrder(5);
      expect(res.id).toBe(5);
      expect(mockApiFetch).toHaveBeenCalledWith('/laboratory/orders/5/');
    });
  });

  describe('createOrder', () => {
    it('posts new lab order', async () => {
      const order = { id: 1, order_id: 'LB-001' };
      mockApiFetch.mockResolvedValue(order);

      const res = await labService.createOrder({ priority: 'routine' } as any);
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/laboratory/orders/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('updateOrder', () => {
    it('patches an existing order', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, priority: 'stat' });

      const res = await labService.updateOrder(3, { priority: 'stat' } as any);
      expect(res.priority).toBe('stat');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/laboratory/orders/3/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('getTemplates', () => {
    it('fetches lab templates', async () => {
      const payload = { results: [{ id: 1, name: 'CBC', code: 'CBC' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await labService.getTemplates({ search: 'CBC' });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/laboratory/templates/');
    });

    it('includes default catalog page size when filtering templates', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await labService.getTemplates({ is_active: true });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('is_active=true');
      expect(url).toContain('page_size=500');
    });
  });

  describe('getTemplate', () => {
    it('fetches single template by ID', async () => {
      mockApiFetch.mockResolvedValue({ id: 10, name: 'Lipid Panel' });

      const res = await labService.getTemplate(10);
      expect(res.id).toBe(10);
      expect(mockApiFetch).toHaveBeenCalledWith('/laboratory/templates/10/');
    });
  });

  describe('createTemplate', () => {
    it('posts new lab template', async () => {
      mockApiFetch.mockResolvedValue({ id: 2, name: 'RFT', code: 'RFT' });

      const res = await labService.createTemplate({ name: 'RFT', code: 'RFT' } as any);
      expect(res.code).toBe('RFT');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/laboratory/templates/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('verifyResult', () => {
    it('posts verification for a lab result', async () => {
      mockApiFetch.mockResolvedValue({ id: 7, overall_status: 'normal' });

      const res = await labService.verifyResult(7, 'normal', 'low', 'Looks good');
      expect(res.overall_status).toBe('normal');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/laboratory/verification/7/verify/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"overall_status":"normal"'),
        }),
      );
    });
  });

  describe('getPendingVerifications', () => {
    it('fetches pending verifications', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await labService.getPendingVerifications({ page: 1 });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/laboratory/verification/');
    });
  });

  describe('getOrderStats', () => {
    it('fetches order statistics', async () => {
      const stats = { total: 50, pending: 10, processing: 5, results_ready: 30, rework_required: 2, stat: 3 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await labService.getOrderStats();
      expect(res.total).toBe(50);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/laboratory/orders/stats/');
    });
  });

  describe('collectSamples', () => {
    it('posts sample collection for multiple tests', async () => {
      mockApiFetch.mockResolvedValue([{ id: 1, status: 'sample_collected' }]);

      const res = await labService.collectSamples(5, [1, 2]);
      expect(res).toHaveLength(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/laboratory/orders/5/collect_samples/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('test_ids'),
        }),
      );
    });
  });

  describe('getLabPartners', () => {
    it('fetches lab partners list', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'External Lab' }], count: 1 });

      const res = await labService.getLabPartners();
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/laboratory/lab-partners/');
    });

    it('normalizes array response', async () => {
      mockApiFetch.mockResolvedValue([{ id: 1, name: 'Lab A' }]);

      const res = await labService.getLabPartners();
      expect(res.results).toHaveLength(1);
      expect(res.count).toBe(1);
    });
  });
});
