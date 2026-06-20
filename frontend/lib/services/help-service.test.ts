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
      mockApiFetch.mockResolvedValue({ status: 'healthy', services: { database: 'healthy' } });

      const res = await helpService.getSystemStatus();
      expect(res.status).toBe('healthy');
      expect(mockApiFetch).toHaveBeenCalledWith('/health/');
    });
  });

  describe('submitTicket', () => {
    it('posts support ticket to API', async () => {
      mockApiFetch.mockResolvedValue({
        reference: 'EMR-2026-ABC123',
        id: 42,
        status: 'open',
        category: 'technical',
        priority: 'high',
        subject: 'Login issue',
      });

      const res = await helpService.submitTicket({
        category: 'technical',
        priority: 'high',
        subject: 'Login issue',
        description: 'Cannot login',
      });

      expect(res.reference).toBe('EMR-2026-ABC123');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/support/tickets/',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  describe('listMyTickets', () => {
    it('fetches paginated user tickets', async () => {
      mockApiFetch.mockResolvedValue({ count: 1, results: [{ id: 1, subject: 'Test' }] });
      const res = await helpService.listMyTickets({ page: 1 });
      expect(res.count).toBe(1);
      expect(mockApiFetch).toHaveBeenCalledWith('/support/tickets/?page=1');
    });
  });

  describe('listTicketQueue', () => {
    it('fetches IT queue', async () => {
      mockApiFetch.mockResolvedValue({ count: 0, results: [] });
      await helpService.listTicketQueue({ status: 'open' });
      expect(mockApiFetch).toHaveBeenCalledWith('/support/tickets/queue/?status=open');
    });
  });

  describe('updateTicketStatus', () => {
    it('patches ticket status', async () => {
      mockApiFetch.mockResolvedValue({ id: 5, status: 'resolved' });
      await helpService.updateTicketStatus(5, 'resolved');
      expect(mockApiFetch).toHaveBeenCalledWith(
        '/support/tickets/5/',
        expect.objectContaining({ method: 'PATCH' }),
      );
    });
  });

  describe('user docs', () => {
    it('lists and loads guides', async () => {
      mockApiFetch.mockResolvedValueOnce({ results: [{ slug: 'quick-start', title: 'Quick Start', filename: 'x.md' }] });
      const list = await helpService.listUserDocs();
      expect(list.results[0].slug).toBe('quick-start');

      mockApiFetch.mockResolvedValueOnce({ slug: 'quick-start', title: 'Quick Start', filename: 'x.md', content: '# Hi' });
      const doc = await helpService.getUserDoc('quick-start');
      expect(doc.content).toContain('# Hi');
    });
  });
});
