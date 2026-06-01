import { apiFetch, buildQueryString } from '../api-client';
import { visitService, type VisitFilters } from './visit-service';
import type { Visit, VitalReading } from './patient-service';
import { getVisitServiceClinicsDisplay } from '../utils/clinic-utils';
import { logError } from '../client-logger';

export interface NursingPoolDashboardMetrics {
  totalInPool: number;
  pendingVitals: number;
  readyForConsultation: number;
  inConsultation: number;
}

export interface NursingPendingTask {
  visitId: number;
  patientName: string;
  patientId: string;
  segment: 'pending_vitals' | 'vitals_incomplete' | 'ready';
  subtitle: string;
  href: string;
}

export interface CriticalAlert {
  id: string;
  patient: string;
  room: string;
  alert: string;
  time: string;
  priority: 'high' | 'medium' | 'low';
}

export interface NursingActivity {
  id: string;
  type: 'vitals' | 'room' | 'pool';
  patient: string;
  action: string;
  time: string;
  status: 'completed' | 'pending' | 'in_progress';
  href: string;
}

export interface NursingDashboardData {
  metrics: NursingPoolDashboardMetrics;
  roomQueueCount: number;
  poolQueueCount: number;
  pendingTasks: NursingPendingTask[];
  recentActivities: NursingActivity[];
  criticalAlerts: CriticalAlert[];
}

export interface NursingAnalyticsSummary {
  period: { start: string; end: string };
  summary: {
    total_orders: number;
    completed_orders: number;
    pending_orders: number;
    unique_patients: number;
  };
  patients_by_gender: Record<string, number>;
  patients_by_category: Record<string, number>;
  npa_staff_linked_vs_non_npa: { npa_staff_linked: number; non_npa: number };
  orders_by_status: Record<string, number>;
  orders_by_priority: Record<string, number>;
  orders_by_type: Record<string, number>;
  by_day?: Array<{ date: string; orders: number; completed: number }>;
  by_week?: Array<{ week: string; orders: number; completed: number }>;
  by_month?: Array<{ month: string; orders: number; completed: number }>;
  by_bimonth?: Array<{ bimonth: string; orders: number; completed: number }>;
  by_quarter?: Array<{ quarter: string; orders: number; completed: number }>;
  by_halfyear?: Array<{ halfyear: string; orders: number; completed: number }>;
}

function poolMetricsParams(serverToday: string): Omit<VisitFilters, 'page' | 'page_size' | 'nursing_status'> {
  return {
    status: 'in_progress',
    nursing_pool: 1,
    date: serverToday,
  };
}

function ymdFromIso(iso?: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatRelativeTime(iso?: string | null): string {
  if (!iso) return 'Recently';
  try {
    const now = Date.now();
    const created = new Date(iso).getTime();
    if (Number.isNaN(created)) return 'Recently';
    const diffMins = Math.floor((now - created) / 60000);
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} min ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    return `${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) !== 1 ? 's' : ''} ago`;
  } catch {
    return 'Recently';
  }
}

function visitToTask(visit: Visit, segment: NursingPendingTask['segment']): NursingPendingTask {
  const patientName = visit.patient_name || 'Patient';
  const patientId = visit.patient_id || visit.visit_id || '';
  const clinic = getVisitServiceClinicsDisplay({ clinic: visit.clinic, clinics: visit.clinics });
  const subtitles: Record<NursingPendingTask['segment'], string> = {
    pending_vitals: 'Awaiting initial vitals',
    vitals_incomplete: 'Vitals recorded — temperature or pulse missing',
    ready: 'Ready to send to consultation room',
  };
  return {
    visitId: visit.id,
    patientName,
    patientId,
    segment,
    subtitle: clinic ? `${subtitles[segment]} · ${clinic}` : subtitles[segment],
    href:
      segment === 'ready'
        ? '/nursing/pool-queue'
        : '/nursing/patient-vitals',
  };
}

class NursingService {
  /**
   * Nursing pool metrics (same source as Pool Queue page).
   */
  async getPoolMetrics(serverToday: string): Promise<NursingPoolDashboardMetrics> {
    const metrics = await visitService.getNursingPoolMetrics(poolMetricsParams(serverToday));
    return {
      totalInPool: metrics.total ?? 0,
      pendingVitals: metrics.pending_vitals ?? 0,
      readyForConsultation: metrics.ready_for_consultation ?? 0,
      inConsultation: metrics.in_consultation ?? 0,
    };
  }

  /**
   * Active consultation room queue rows for today (matches Room Queue page source).
   */
  async getRoomQueueCount(serverToday: string): Promise<number> {
    try {
      const res = await apiFetch<{ results: Array<{ queued_at?: string }>; count?: number }>(
        '/consultation/queue/?is_active=true&page_size=500',
      );
      const rows = res.results ?? [];
      const todayRows = rows.filter((row) => ymdFromIso(row.queued_at) === serverToday);
      return todayRows.length;
    } catch (error) {
      logError('Error getting room queue count:', error);
      return 0;
    }
  }

  async getPendingTasks(serverToday: string, limit = 6): Promise<NursingPendingTask[]> {
    const base = { ...poolMetricsParams(serverToday), page: 1 };
    try {
      const [pendingRes, incompleteRes, readyRes] = await Promise.all([
        visitService.getVisits({ ...base, nursing_status: 'pending', page_size: limit }),
        visitService.getVisits({ ...base, nursing_status: 'vitals_incomplete', page_size: limit }),
        visitService.getVisits({ ...base, nursing_status: 'ready', page_size: limit }),
      ]);

      const tasks: NursingPendingTask[] = [];
      const seen = new Set<number>();

      const push = (visit: Visit, segment: NursingPendingTask['segment']) => {
        if (seen.has(visit.id) || tasks.length >= limit) return;
        seen.add(visit.id);
        tasks.push(visitToTask(visit, segment));
      };

      for (const v of pendingRes.results ?? []) push(v, 'pending_vitals');
      for (const v of incompleteRes.results ?? []) push(v, 'vitals_incomplete');
      for (const v of readyRes.results ?? []) push(v, 'ready');

      return tasks;
    } catch (error) {
      logError('Error loading nursing pending tasks:', error);
      return [];
    }
  }

  async getCriticalAlerts(serverToday: string): Promise<CriticalAlert[]> {
    try {
      const base = { ...poolMetricsParams(serverToday), page: 1, page_size: 3 };
      const incompleteRes = await visitService.getVisits({
        ...base,
        nursing_status: 'vitals_incomplete',
      });
      return (incompleteRes.results ?? []).map((visit) => ({
        id: `vitals-incomplete-${visit.id}`,
        patient: visit.patient_name || 'Patient',
        room: getVisitServiceClinicsDisplay({ clinic: visit.clinic, clinics: visit.clinics }) || 'Pool',
        alert: 'Incomplete vitals — record temperature and pulse',
        time: formatRelativeTime(`${visit.date}T${visit.time || '00:00:00'}`),
        priority: 'medium' as const,
      }));
    } catch (error) {
      logError('Error loading nursing critical alerts:', error);
      return [];
    }
  }

  async getRecentActivities(serverToday: string, limit = 6): Promise<NursingActivity[]> {
    try {
      const vitalsRes = await apiFetch<{ results: VitalReading[] }>(
        '/vitals/?ordering=-recorded_at&page_size=30',
      );
      const todayVitals = (vitalsRes.results ?? []).filter(
        (v) => ymdFromIso(v.recorded_at) === serverToday,
      );

      const activities: NursingActivity[] = todayVitals.slice(0, limit).map((vital) => ({
        id: `vital-${vital.id}`,
        type: 'vitals' as const,
        patient: vital.patient_name || 'Patient',
        action: 'Vitals recorded',
        time: formatRelativeTime(vital.recorded_at),
        status: 'completed' as const,
        href: '/nursing/patient-vitals',
      }));

      if (activities.length >= limit) {
        return activities.slice(0, limit);
      }

      const sentRes = await visitService.getVisits({
        ...poolMetricsParams(serverToday),
        nursing_status: 'sent_to_room',
        page: 1,
        page_size: limit,
      });

      for (const visit of sentRes.results ?? []) {
        if (activities.length >= limit) break;
        activities.push({
          id: `sent-${visit.id}`,
          type: 'room',
          patient: visit.patient_name || 'Patient',
          action: 'Sent to consultation room',
          time: formatRelativeTime(`${visit.date}T${visit.time || '00:00:00'}`),
          status: 'completed',
          href: '/nursing/room-queue',
        });
      }

      return activities.slice(0, limit);
    } catch (error) {
      logError('Error loading nursing recent activities:', error);
      return [];
    }
  }

  /**
   * Pool size for legacy callers (e.g. main hospital dashboard).
   */
  async getPoolQueueCount(serverToday?: string): Promise<{ count: number }> {
    try {
      const date =
        serverToday ?? new Date().toISOString().split('T')[0];
      const metrics = await this.getPoolMetrics(date);
      return { count: metrics.totalInPool };
    } catch (error) {
      logError('Error getting pool queue count:', error);
      return { count: 0 };
    }
  }

  /**
   * Full dashboard payload for the Nursing home page.
   */
  async getDashboardData(serverToday: string): Promise<NursingDashboardData> {
    const [metrics, roomQueueCount, pendingTasks, criticalAlerts, recentActivities] =
      await Promise.all([
        this.getPoolMetrics(serverToday),
        this.getRoomQueueCount(serverToday),
        this.getPendingTasks(serverToday),
        this.getCriticalAlerts(serverToday),
        this.getRecentActivities(serverToday),
      ]);

    return {
      metrics,
      roomQueueCount,
      poolQueueCount: metrics.totalInPool,
      pendingTasks,
      criticalAlerts,
      recentActivities,
    };
  }

  async getAnalyticsSummary(start: string, end: string): Promise<NursingAnalyticsSummary> {
    const query = buildQueryString({ start, end });
    return apiFetch<NursingAnalyticsSummary>(`/nursing/analytics/summary/${query}`);
  }
}

export const nursingService = new NursingService();
