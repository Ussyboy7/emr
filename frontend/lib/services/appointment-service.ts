/**
 * Appointment API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface Appointment {
  id: number;
  appointment_id: string;
  patient: number;
  patient_name?: string;
  doctor?: number;
  doctor_name?: string;
  clinic?: number;
  clinic_name?: string;
  room?: number;
  room_name?: string;
  appointment_type: 'consultation' | 'follow_up' | 'routine' | 'emergency' | 'procedure';
  status: 'scheduled' | 'confirmed' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
  appointment_date: string;
  appointment_time: string;
  duration_minutes: number;
  reason?: string;
  notes?: string;
  is_recurring: boolean;
  recurrence_pattern?: string;
  recurrence_end_date?: string;
  reminder_sent: boolean;
  reminder_sent_at?: string;
  created_at: string;
  updated_at: string;
  created_by?: number;
}

class AppointmentService {
  /**
   * Get all appointments
   */
  async getAppointments(params?: {
    patient?: number;
    doctor?: number;
    clinic?: number;
    status?: string;
    appointment_type?: string;
    appointment_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Appointment[]; count: number; next?: string; previous?: string }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Appointment[]; count: number; next?: string; previous?: string }>(
      `/appointments/${query}`
    );
  }

  /**
   * Get appointment by ID
   */
  async getAppointment(id: number): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/`);
  }

  /**
   * Create appointment
   */
  async createAppointment(data: {
    patient: number;
    doctor?: number;
    clinic?: number;
    room?: number;
    appointment_type: 'consultation' | 'follow_up' | 'routine' | 'emergency' | 'procedure';
    appointment_date: string;
    appointment_time: string;
    duration_minutes?: number;
    reason?: string;
    notes?: string;
    is_recurring?: boolean;
    recurrence_pattern?: string;
    recurrence_end_date?: string;
  }): Promise<Appointment> {
    return apiFetch<Appointment>('/appointments/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update appointment
   */
  async updateAppointment(id: number, data: Partial<Appointment>): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete appointment
   */
  async deleteAppointment(id: number): Promise<void> {
    return apiFetch<void>(`/appointments/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Confirm appointment
   */
  async confirmAppointment(id: number): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/confirm/`, {
      method: 'POST',
    });
  }

  /**
   * Cancel appointment
   */
  async cancelAppointment(id: number): Promise<Appointment> {
    return apiFetch<Appointment>(`/appointments/${id}/cancel/`, {
      method: 'POST',
    });
  }

  /**
   * Get upcoming appointments
   */
  async getUpcomingAppointments(): Promise<Appointment[]> {
    return apiFetch<Appointment[]>('/appointments/upcoming/');
  }

  /**
   * Get today's appointments
   */
  async getTodayAppointments(): Promise<Appointment[]> {
    return apiFetch<Appointment[]>('/appointments/today/');
  }
}

export const appointmentService = new AppointmentService();

