import { apiFetch, buildQueryString } from '../api-client';

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

export interface EquipmentStatus {
  id: string;
  name: string;
  status: 'online' | 'offline' | 'maintenance';
  battery: number;
  location: string;
}

class NursingService {
  /**
   * Get nursing dashboard statistics
   */
  async getStats(): Promise<NursingStats> {
    return apiFetch<NursingStats>('/nursing/dashboard/stats/');
  }

  /**
   * Get critical alerts for nursing dashboard
   */
  async getCriticalAlerts(): Promise<{ results: CriticalAlert[] }> {
    return apiFetch<{ results: CriticalAlert[] }>('/nursing/alerts/critical/');
  }

  /**
   * Get recent nursing activities
   */
  async getRecentActivities(params?: { limit?: number }): Promise<{ results: NursingActivity[] }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: NursingActivity[] }>(`/nursing/activities/recent/${query}`);
  }

  /**
   * Get equipment status
   */
  async getEquipmentStatus(): Promise<{ results: EquipmentStatus[] }> {
    return apiFetch<{ results: EquipmentStatus[] }>('/nursing/equipment/status/');
  }

  /**
   * Get pool queue count
   */
  async getPoolQueueCount(): Promise<{ count: number }> {
    return apiFetch<{ count: number }>('/nursing/queue/pool/count/');
  }

  /**
   * Get room queue count
   */
  async getRoomQueueCount(): Promise<{ count: number }> {
    return apiFetch<{ count: number }>('/nursing/queue/room/count/');
  }

  /**
   * Get pending tasks
   */
  async getPendingTasks(): Promise<{ results: any[] }> {
    return apiFetch<{ results: any[] }>('/nursing/tasks/pending/');
  }

  /**
   * Get patient vitals
   */
  async getPatientVitals(patientId: number): Promise<any[]> {
    return apiFetch<any[]>(`/nursing/patients/${patientId}/vitals/`);
  }

  /**
   * Record patient vitals
   */
  async recordVitals(patientId: number, vitalsData: any): Promise<any> {
    return apiFetch<any>(`/nursing/patients/${patientId}/vitals/`, {
      method: 'POST',
      body: JSON.stringify(vitalsData),
    });
  }

  /**
   * Administer medication
   */
  async administerMedication(medicationId: number, administrationData: any): Promise<any> {
    return apiFetch<any>(`/nursing/medications/${medicationId}/administer/`, {
      method: 'POST',
      body: JSON.stringify(administrationData),
    });
  }

  /**
   * Get medications due for administration
   */
  async getMedicationsDue(): Promise<{ results: any[] }> {
    return apiFetch<{ results: any[] }>('/nursing/medications/due/');
  }
}

export const nursingService = new NursingService();
export { NursingService };