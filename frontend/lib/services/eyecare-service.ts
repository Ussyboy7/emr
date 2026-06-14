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
  by_day?: Array<any>;
  by_week?: Array<any>;
  by_month?: Array<any>;
  by_bimonth?: Array<any>;
  by_quarter?: Array<any>;
  by_halfyear?: Array<any>;
  period: {
    start_date: string;
    end_date: string;
  };
}

class EyecareService {
  async getAnalyticsSummary(
    period: URLSearchParams | { start: string; end: string }
  ): Promise<EyecareAnalyticsSummary> {
    const query =
      period instanceof URLSearchParams
        ? `?${period.toString()}`
        : buildQueryString({ start_date: period.start, end_date: period.end });
    return apiFetch<EyecareAnalyticsSummary>(`/eyecare/analytics/summary/${query}`);
  }
}

export const eyecareService = new EyecareService();