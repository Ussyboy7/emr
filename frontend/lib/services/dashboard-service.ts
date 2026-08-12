/**
 * Operational dashboard API (single aggregate request).
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface OperationalDashboardPayload {
  date: string;
  todayStats: {
    patientsToday: number;
    patientsChange: number;
    consultations: number;
    consultationsChange: number;
    labTests: number;
    labTestsChange: number;
    prescriptions: number;
    prescriptionsChange: number;
  };
  queueStatus: {
    nursingPool: number;
    consultationWaiting: number;
    labPending: number;
    pharmacyQueue: number;
  };
  wardStatus: {
    activeAdmissions: number;
    pendingDischarges: number;
    escalated: number;
    availableBeds: number;
  };
  recentPatients: Array<{
    visitId: number;
    id: string;
    name: string;
    clinic: string;
    locationClinicId?: number | null;
    time: string;
    status: string;
  }>;
  criticalAlerts: Array<{ type: string; message: string; time: string }>;
  facilityPerformance: Array<{
    name: string;
    visits: number;
    completionRate: number;
    avgConsultationTime: number | null;
    labTestsProcessed: number;
    prescriptionsDispensed: number;
  }>;
  upcomingAppointments: Array<{
    patient: string;
    type: string;
    time: string;
    clinic: string;
  }>;
}

export async function getOperationalDashboard(
  params?: { date?: string; clinic_id?: string },
): Promise<OperationalDashboardPayload> {
  const qs = buildQueryString((params || {}) as Record<string, string | undefined>);
  return apiFetch<OperationalDashboardPayload>(`/common/dashboard/operational${qs || '/'}`);
}
