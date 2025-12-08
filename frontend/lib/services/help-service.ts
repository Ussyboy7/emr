/**
 * Help and Support API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface SystemStatus {
  status: 'healthy' | 'unhealthy';
  services: {
    database?: string;
    cache?: string;
    [key: string]: string | undefined;
  };
}

export interface SupportTicket {
  id?: number;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  description: string;
  status?: 'open' | 'in_progress' | 'resolved' | 'closed';
  created_at?: string;
  updated_at?: string;
}

class HelpService {
  /**
   * Get system health status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    try {
      return await apiFetch<SystemStatus>('/health/');
    } catch (err) {
      // If health check fails, return unhealthy status
      return {
        status: 'unhealthy',
        services: {
          api: 'unhealthy: Connection failed',
        },
      };
    }
  }

  /**
   * Submit a support ticket
   * Note: This would require a support ticket API endpoint
   * For now, we'll use a placeholder
   */
  async submitTicket(ticket: SupportTicket): Promise<SupportTicket> {
    // In a real system, this would call an API endpoint
    // For now, we'll simulate it
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve({
          ...ticket,
          id: Date.now(),
          status: 'open',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        });
      }, 1000);
    });
  }

  /**
   * Get FAQs (would load from API if available)
   */
  async getFAQs(): Promise<any[]> {
    // FAQs are static content, but could be loaded from API
    return [];
  }
}

export const helpService = new HelpService();

