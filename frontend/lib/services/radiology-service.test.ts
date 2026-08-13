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
import { radiologyService } from './radiology-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('radiologyService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getOrders', () => {
    it('fetches radiology orders', async () => {
      const payload = { results: [{ id: 1, order_id: 'RAD-001' }], count: 1 };
      mockApiFetch.mockResolvedValue(payload);

      const res = await radiologyService.getOrders({ page: 1 });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/radiology/orders/');
    });

    it('passes filter params', async () => {
      mockApiFetch.mockResolvedValue({ results: [], count: 0 });

      await radiologyService.getOrders({ priority: 'stat', processing_method: 'outsourced' });
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('priority=stat');
      expect(url).toContain('processing_method=outsourced');
    });
  });

  describe('getOrder', () => {
    it('fetches single radiology order', async () => {
      mockApiFetch.mockResolvedValue({ id: 3, order_id: 'RAD-003' });

      const res = await radiologyService.getOrder(3);
      expect(res.id).toBe(3);
      expect(mockApiFetch).toHaveBeenCalledWith('/radiology/orders/3/');
    });
  });

  describe('createOrder', () => {
    it('posts new radiology order', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, order_id: 'RAD-001' });

      const res = await radiologyService.createOrder({ patient: 5, priority: 'routine' } as any);
      expect(res.id).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/radiology/orders/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('scheduleStudy', () => {
    it('posts schedule for a study', async () => {
      mockApiFetch.mockResolvedValue({ id: 2, status: 'scheduled' });

      const res = await radiologyService.scheduleStudy(1, 2, '2025-01-15', '10:00');
      expect(res.status).toBe('scheduled');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/radiology/orders/1/schedule/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('scheduled_date'),
        }),
      );
    });
  });

  describe('acquireStudy', () => {
    it('posts acquisition for a study', async () => {
      mockApiFetch.mockResolvedValue({ id: 2, status: 'acquired' });

      const res = await radiologyService.acquireStudy(1, 2, 'in_house', 5);
      expect(res.status).toBe('acquired');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/radiology/orders/1/acquire/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('createReport', () => {
    it('posts a study report', async () => {
      mockApiFetch.mockResolvedValue({ id: 2, status: 'reported' });

      await radiologyService.createReport(1, 2, 'Normal findings', 'Follow up in 6 months');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/radiology/orders/1/report/',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('Normal findings'),
        }),
      );
    });
  });

  describe('verifyReport', () => {
    it('posts verification for a report', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, overall_status: 'abnormal' });

      const res = await radiologyService.verifyReport(5, 'abnormal', 'high');
      expect(res.overall_status).toBe('abnormal');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/radiology/verification/5/verify/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('getTemplates', () => {
    it('fetches radiology templates', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Chest X-Ray' }], count: 1 });

      const res = await radiologyService.getTemplates({ category: 'xray' });
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/radiology/templates/');
      expect(url).toContain('page_size=500');
    });
  });

  describe('getOrderStats', () => {
    it('fetches order statistics', async () => {
      const stats = { total: 20, pending: 5, processing: 3, results_ready: 10, rejected: 1, stat: 1 };
      mockApiFetch.mockResolvedValue(stats);

      const res = await radiologyService.getOrderStats();
      expect(res.total).toBe(20);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/radiology/orders/stats/');
    });
  });

  describe('getImagingPartners', () => {
    it('fetches imaging partners', async () => {
      mockApiFetch.mockResolvedValue({ results: [{ id: 1, name: 'Imaging Lab' }], count: 1 });

      const res = await radiologyService.getImagingPartners();
      expect(res.results).toHaveLength(1);
      const url = mockApiFetch.mock.calls[0][0] as string;
      expect(url).toContain('/radiology/imaging-partners/');
    });

    it('normalizes array response', async () => {
      mockApiFetch.mockResolvedValue([{ id: 1, name: 'Partner A' }]);

      const res = await radiologyService.getImagingPartners();
      expect(res.results).toHaveLength(1);
      expect(res.count).toBe(1);
    });
  });

  describe('dispatchOutsourced', () => {
    it('posts outsourced dispatch', async () => {
      mockApiFetch.mockResolvedValue({ id: 1, dispatch_id: 'RAD-2025-000001' });

      const res = await radiologyService.dispatchOutsourced(5, {
        partner_id: 2,
        study_ids: [10, 11],
      });
      expect(res.dispatch_id).toBe('RAD-2025-000001');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/radiology/orders/5/dispatch_outsourced/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('routeStudies', () => {
    it('posts selected studies with an internal destination', async () => {
      mockApiFetch.mockResolvedValue({ lines: [{ id: 10, routing_status: 'sent_to_processing', processing_clinic_name: 'Bode Thomas' }] });

      const response = await radiologyService.routeStudies(5, {
        study_ids: [10, 11],
        destination_type: 'internal',
        processing_clinic: 9,
        reason: 'Send to imaging facility',
      });

      expect(response.lines[0].processing_clinic_name).toBe('Bode Thomas');

      expect(mockApiFetch).toHaveBeenCalledWith(
        '/radiology/orders/5/route-studies/',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            study_ids: [10, 11],
            destination_type: 'internal',
            processing_clinic: 9,
            reason: 'Send to imaging facility',
          }),
        }),
      );
    });

    it('posts selected studies with an external destination and reason', async () => {
      mockApiFetch.mockResolvedValue({ lines: [] });

      await radiologyService.routeStudies(5, {
        study_ids: [12],
        destination_type: 'external',
        external_destination: 'External Imaging Centre',
        reason: 'Modality unavailable at internal facilities',
      });

      expect(mockApiFetch.mock.calls[0][1].body).toContain('external_destination');
      expect(mockApiFetch.mock.calls[0][1].body).toContain('Modality unavailable at internal facilities');
    });
  });
});
