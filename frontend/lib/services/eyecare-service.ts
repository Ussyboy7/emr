/**
 * Eyecare API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface EyecareAnalyticsSummary {
  session_metrics: {
    total_sessions: number;
    completed_sessions: number;
    avg_duration: number;
    completion_rate: number;
  };
  patient_demographics: {
    attendance_by_category: Array<{
      sn: number;
      key: string;
      label: string;
      male: number;
      female: number;
      total: number;
      percentage: number;
    }>;
    attendance_totals: {
      male: number;
      female: number;
      total: number;
    };
  };
  period: {
    start_date: string;
    end_date: string;
  };
}

class EyecareService {
  async getAnalyticsSummary(start: string, end: string): Promise<EyecareAnalyticsSummary> {
    const query = buildQueryString({ start_date: start, end_date: end });
    return apiFetch<EyecareAnalyticsSummary>(`/eyecare/analytics/summary/${query}`);
  }
}

export const eyecareService = new EyecareService();