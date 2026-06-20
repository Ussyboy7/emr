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

export type SupportTicketStatus = 'open' | 'in_progress' | 'resolved' | 'closed';

export interface SupportTicket {
  reference?: string;
  id?: number;
  category: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  subject: string;
  description: string;
  status?: SupportTicketStatus;
  created_at?: string;
  user_id?: number;
  user_name?: string;
  user_username?: string;
}

export interface UserDocSummary {
  slug: string;
  title: string;
  filename: string;
}

export interface UserDocDetail extends UserDocSummary {
  content: string;
}

export interface Paginated<T> {
  count: number;
  results: T[];
}

class HelpService {
  async getSystemStatus(): Promise<SystemStatus> {
    return apiFetch<SystemStatus>('/health/');
  }

  async submitTicket(
    ticket: Omit<SupportTicket, 'reference' | 'id' | 'status' | 'created_at' | 'user_id' | 'user_name' | 'user_username'>,
  ): Promise<SupportTicket> {
    return apiFetch<SupportTicket>('/support/tickets/', {
      method: 'POST',
      body: JSON.stringify(ticket),
    });
  }

  async listMyTickets(params?: { page?: number; page_size?: number; status?: SupportTicketStatus }): Promise<Paginated<SupportTicket>> {
    return apiFetch<Paginated<SupportTicket>>(`/support/tickets/${buildQueryString(params ?? {})}`);
  }

  async listTicketQueue(params?: {
    page?: number;
    page_size?: number;
    status?: SupportTicketStatus;
    search?: string;
  }): Promise<Paginated<SupportTicket>> {
    return apiFetch<Paginated<SupportTicket>>(`/support/tickets/queue/${buildQueryString(params ?? {})}`);
  }

  async updateTicketStatus(id: number, status: SupportTicketStatus): Promise<SupportTicket> {
    return apiFetch<SupportTicket>(`/support/tickets/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  }

  async listUserDocs(): Promise<{ results: UserDocSummary[] }> {
    return apiFetch<{ results: UserDocSummary[] }>('/support/docs/');
  }

  async getUserDoc(slug: string): Promise<UserDocDetail> {
    return apiFetch<UserDocDetail>(`/support/docs/${slug}/`);
  }
}

export const helpService = new HelpService();
export default helpService;
