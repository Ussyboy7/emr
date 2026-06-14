/**
 * Analytics service for the main clinical dashboard
 */
import { apiFetch, buildQueryString } from '../api-client';
import { peekServerTodayApi, toApiDateString } from '../dates';

export interface ClinicalDashboardData {
  period: {
    start_date: string;
    end_date: string;
  };
  metrics: {
    total_patients: number;
    total_visits: number;
    avg_wait_time_minutes: number;
    completion_rate_percentage: number;
  };
  overview: {
    patients: number;
    clinical: number;
    laboratory: number;
    pharmacy: number;
  };
  visits_trend: Array<{
    month: string;
    visits: number;
    newPatients?: number;
  }>;
  clinic_distribution: Record<string, number>;
  patient_demographics_percentages: Record<string, number>;
  top_diagnoses: Array<{
    diagnosis: string;
    cases: number;
  }>;
  consultation_metrics: {
    completed_sessions: number;
    avg_duration: number;
    avg_wait_time: number;
  };
  lab_metrics: {
    tests_this_month: number;
    avg_turnaround_hours: number;
    completion_rate: number;
  };
  test_distribution: Array<{
    test: string;
    count: number;
  }>;
  pharmacy_metrics: {
    dispensed_this_month: number;
    pending_orders: number;
    avg_wait_time: number;
    low_stock_items: number;
  };
  weekly_activity: Array<{
    day: string;
    patients: number;
    consultations: number;
    lab_tests: number;
    prescriptions: number;
  }>;
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
}

class AnalyticsService {
  async getClinicalDashboard(start: string, end: string): Promise<ClinicalDashboardData> {
    const query = buildQueryString({ start_date: start, end_date: end });
    return apiFetch<ClinicalDashboardData>(`/analytics/dashboard/${query}`);
  }

  async getClinicDistribution(): Promise<Array<{ name: string; value: number }>> {
    try {
      const end = new Date();
      const start = new Date(end);
      start.setDate(start.getDate() - 30);
      const data = await this.getClinicalDashboard(
        toApiDateString(start),
        peekServerTodayApi()
      );
      return Object.entries(data.clinic_distribution).map(([name, value]) => ({
        name,
        value
      }));
    } catch (error) {
      console.error('Failed to get clinic distribution:', error);
      return [];
    }
  }
}

export const analyticsService = new AnalyticsService();