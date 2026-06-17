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
import { helpService } from './help-service';

const mockApiFetch = apiFetch as ReturnType<typeof vi.fn>;

describe('helpService', () => {
  beforeEach(() => {
    mockApiFetch.mockReset();
  });

  describe('getSystemStatus', () => {
    it('fetches system health status', async () => {
      mockApiFetch.mockResolvedValue({ status: 'healthy', services: { database: 'ok' } });

      const res = await helpService.getSystemStatus();
      expect(res.status).toBe('healthy');
      expect(mockApiFetch).toHaveBeenCalledWith('/health/');
    });

    it('returns unhealthy on error', async () => {
      mockApiFetch.mockRejectedValue(new Error('Connection failed'));

      const res = await helpService.getSystemStatus();
      expect(res.status).toBe('unhealthy');
      expect(res.services.api).toContain('unhealthy');
    });
  });

  describe('submitTicket', () => {
    it('resolves with ticket including id and status', async () => {
      const ticket = {
        category: 'bug',
        priority: 'high' as const,
        subject: 'Login issue',
        description: 'Cannot login',
      };

      const res = await helpService.submitTicket(ticket);
      expect(res.id).toBeDefined();
      expect(res.status).toBe('open');
      expect(res.subject).toBe('Login issue');
    });
  });

  describe('getFAQs', () => {
    it('returns empty array', async () => {
      const res = await helpService.getFAQs();
      expect(res).toEqual([]);
    });
  });
});
