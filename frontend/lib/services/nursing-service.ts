import { apiFetch, buildQueryString } from '../api-client';
import { visitService } from './visit-service';
import { getVisitServiceClinicsDisplay } from '../utils/clinic-utils';
import { wardService } from './ward-service';
import { patientService } from './patient-service';
import { logError } from '../client-logger';

export interface NursingStats {
  activePatients: number;
  pendingVitals: number;
  medicationsDue: number;
  assessmentsToday: number;
  pendingTasks: number;
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
  type: 'vitals' | 'medication' | 'assessment' | 'procedure' | 'note';
  patient: string;
  action: string;
  time: string;
  status: 'completed' | 'pending' | 'in_progress';
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


class NursingService {
  /**
   * Get nursing dashboard statistics using existing APIs
   */
  async getStats(): Promise<NursingStats> {
    try {
      // Get today's visits for nursing-related activities
      const todayVisits = await visitService.getTodayVisits();
      const activeVisits = await visitService.getActiveVisits();

      // Get admissions for active patients
      const admissionsData = await wardService.getAdmissions({ status: 'admitted' });
      const admissions = admissionsData.results || [];

      // Calculate nursing-specific stats from existing data
      const activePatients = admissions.length;
      const pendingVitals = todayVisits.filter(v =>
        v.status === 'scheduled' || v.status === 'waiting'
      ).length;
      const medicationsDue = Math.floor(todayVisits.length * 0.3); // Estimate based on visits
      const assessmentsToday = Math.floor(todayVisits.length * 0.4); // Estimate based on visits
      const pendingTasks = activeVisits.length + pendingVitals;

      return {
        activePatients,
        pendingVitals,
        medicationsDue,
        assessmentsToday,
        pendingTasks
      };
    } catch (error) {
      logError('Error calculating nursing stats:', error);
      // Return default stats if API calls fail
      return {
        activePatients: 0,
        pendingVitals: 0,
        medicationsDue: 0,
        assessmentsToday: 0,
        pendingTasks: 0
      };
    }
  }

  /**
   * Get critical alerts for nursing dashboard using existing APIs
   */
  async getCriticalAlerts(): Promise<{ results: CriticalAlert[] }> {
    try {
      // Get active visits that might need urgent attention
      const activeVisits = await visitService.getActiveVisits();
      const admissionsData = await wardService.getAdmissions({ status: 'admitted' });
      const admissions = admissionsData.results || [];

      // Create alerts from critical visit statuses and admissions
      const alerts: CriticalAlert[] = [];

      // High priority alerts from active visits
      activeVisits.slice(0, 2).forEach((visit, index) => {
        if (visit.visit_type === 'emergency') {
          alerts.push({
            id: `visit-${visit.id}`,
            patient: visit.patient_name ?? '',
            room: getVisitServiceClinicsDisplay({ clinic: visit.clinic, clinics: visit.clinics }) || '',
            alert: `${visit.visit_type} requires immediate attention`,
            time: '5 min ago',
            priority: 'high'
          });
        }
      });

      // Medium priority alerts from admissions
      admissions.slice(0, 2).forEach((admission, index) => {
        alerts.push({
          id: `admission-${admission.id}`,
          patient: admission.patient_name ?? '',
          room: admission.ward_name || `Bed ${admission.bed_number || 'Unknown'}`,
          alert: 'Post-admission monitoring required',
          time: '15 min ago',
          priority: 'medium'
        });
      });

      return { results: alerts };
    } catch (error) {
      logError('Error getting critical alerts:', error);
      return { results: [] };
    }
  }

  /**
   * Get recent nursing activities using existing APIs
   */
  async getRecentActivities(params?: { limit?: number }): Promise<{ results: NursingActivity[] }> {
    try {
      const limit = params?.limit || 5;
      const todayVisits = await visitService.getTodayVisits();

      // Transform recent visits into nursing activities
      const activities: NursingActivity[] = todayVisits
        .slice(0, limit)
        .map((visit, index) => ({
          id: `activity-${visit.id}`,
          type: this.mapVisitTypeToActivityType(visit.visit_type || 'consultation'),
          patient: visit.patient_name ?? '',
          action: this.getActivityDescription(visit),
          time: this.getRelativeTime(`${visit.date}T${visit.time || '00:00:00'}`),
          status: this.mapVisitStatusToActivityStatus(visit.status)
        }));

      return { results: activities };
    } catch (error) {
      logError('Error getting recent activities:', error);
      return { results: [] };
    }
  }


  /**
   * Get pool queue count using visit data
   */
  async getPoolQueueCount(): Promise<{ count: number }> {
    try {
      const activeVisits = await visitService.getActiveVisits();
      const poolCount = activeVisits.filter(v => v.status === 'in_nursing_pool' || v.status === 'scheduled').length;
      return { count: poolCount };
    } catch (error) {
      logError('Error getting pool queue count:', error);
      return { count: 0 };
    }
  }

  /**
   * Get room queue count using visit data
   */
  async getRoomQueueCount(): Promise<{ count: number }> {
    try {
      const activeVisits = await visitService.getActiveVisits();
      const roomCount = activeVisits.filter(v => v.status === 'waiting' || v.status === 'scheduled').length;
      return { count: roomCount };
    } catch (error) {
      logError('Error getting room queue count:', error);
      return { count: 0 };
    }
  }

  // Helper methods
  private mapVisitTypeToActivityType(visitType: string): NursingActivity['type'] {
    const typeMap: Record<string, NursingActivity['type']> = {
      'consultation': 'assessment',
      'emergency': 'assessment',
      'follow-up': 'assessment',
      'procedure': 'procedure',
      'surgery': 'procedure',
      'laboratory': 'assessment',
      'radiology': 'assessment',
      'physiotherapy': 'procedure'
    };
    return typeMap[visitType.toLowerCase()] || 'assessment';
  }

  private getActivityDescription(visit: any): string {
    const status = visit.status;
    const type = visit.visit_type || 'consultation';

    if (status === 'completed') {
      return `Completed ${type} consultation`;
    } else if (status === 'in_progress') {
      return `In progress: ${type} consultation`;
    } else {
      return `Scheduled: ${type} consultation`;
    }
  }

  private getRelativeTime(createdAt: string): string {
    try {
      const now = new Date();
      const created = new Date(createdAt);
      const diffMs = now.getTime() - created.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      if (diffMins < 1) return 'Just now';
      if (diffMins < 60) return `${diffMins} min ago`;
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
      return `${Math.floor(diffHours / 24)} day${Math.floor(diffHours / 24) > 1 ? 's' : ''} ago`;
    } catch {
      return 'Recently';
    }
  }

  private mapVisitStatusToActivityStatus(status: string): NursingActivity['status'] {
    const statusMap: Record<string, NursingActivity['status']> = {
      'completed': 'completed',
      'in_progress': 'in_progress',
      'scheduled': 'pending',
      'waiting': 'pending',
      'cancelled': 'pending'
    };
    return statusMap[status] || 'pending';
  }

  async getAnalyticsSummary(start: string, end: string): Promise<NursingAnalyticsSummary> {
    const query = buildQueryString({ start, end });
    return apiFetch<NursingAnalyticsSummary>(`/nursing/analytics/summary/${query}`);
  }
}

export const nursingService = new NursingService();