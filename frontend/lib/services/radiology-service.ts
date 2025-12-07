/**
 * Radiology API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface RadiologyOrder {
  id: number;
  order_id: string;
  patient: number;
  patient_name?: string;
  doctor?: number;
  doctor_name?: string;
  visit?: number;
  priority: 'routine' | 'urgent' | 'stat';
  clinic?: string;
  clinical_notes?: string;
  studies: RadiologyStudy[];
  ordered_at: string;
}

export interface RadiologyStudy {
  id: number;
  order: number;
  procedure: string;
  body_part?: string;
  modality?: string;
  status: 'pending' | 'scheduled' | 'acquired' | 'processing' | 'reported' | 'verified';
  scheduled_date?: string;
  scheduled_time?: string;
  scheduled_by?: number;
  processing_method?: 'in_house' | 'outsourced';
  outsourced_facility?: string;
  images_count?: number;
  technical_notes?: string;
  report?: string;
  findings?: string;
  impression?: string;
  recommendations?: string;
  acquired_by?: number;
  acquired_at?: string;
  reported_by?: number;
  reported_at?: string;
  verified_by?: number;
  verified_at?: string;
  verification_notes?: string;
}

export interface RadiologyReport {
  id: number;
  study: number;
  study_details?: RadiologyStudy;
  order: number;
  order_id?: string;
  patient: number;
  patient_name?: string;
  overall_status?: 'normal' | 'abnormal' | 'critical';
  priority?: 'low' | 'medium' | 'high';
  created_at: string;
}

class RadiologyService {
  /**
   * Get all radiology orders
   */
  async getOrders(params?: {
    patient?: string;
    doctor?: string;
    priority?: string;
    search?: string;
    page?: number;
  }): Promise<{ results: RadiologyOrder[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: RadiologyOrder[]; count: number }>(`/radiology/orders/${query}`);
  }

  /**
   * Get a single radiology order
   */
  async getOrder(orderId: number): Promise<RadiologyOrder> {
    return apiFetch<RadiologyOrder>(`/radiology/orders/${orderId}/`);
  }

  /**
   * Create a radiology order
   */
  async createOrder(data: Partial<RadiologyOrder>): Promise<RadiologyOrder> {
    return apiFetch<RadiologyOrder>('/radiology/orders/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Schedule a study
   */
  async scheduleStudy(
    orderId: number,
    studyId: number,
    scheduledDate: string,
    scheduledTime: string
  ): Promise<RadiologyStudy> {
    return apiFetch<RadiologyStudy>(`/radiology/orders/${orderId}/schedule/`, {
      method: 'POST',
      body: JSON.stringify({
        study_id: studyId,
        scheduled_date: scheduledDate,
        scheduled_time: scheduledTime,
      }),
    });
  }

  /**
   * Complete acquisition
   */
  async acquireStudy(
    orderId: number,
    studyId: number,
    processingMethod: 'in_house' | 'outsourced',
    imagesCount: number,
    outsourcedFacility?: string,
    technicalNotes?: string
  ): Promise<RadiologyStudy> {
    return apiFetch<RadiologyStudy>(`/radiology/orders/${orderId}/acquire/`, {
      method: 'POST',
      body: JSON.stringify({
        study_id: studyId,
        processing_method: processingMethod,
        images_count: imagesCount,
        outsourced_facility: outsourcedFacility || '',
        technical_notes: technicalNotes || '',
      }),
    });
  }

  /**
   * Create report for a study
   */
  async createReport(
    orderId: number,
    studyId: number,
    report: string,
    findings?: string,
    impression?: string,
    recommendations?: string
  ): Promise<RadiologyStudy> {
    return apiFetch<RadiologyStudy>(`/radiology/orders/${orderId}/report/`, {
      method: 'POST',
      body: JSON.stringify({
        study_id: studyId,
        report,
        findings: findings || '',
        impression: impression || '',
        recommendations: recommendations || '',
      }),
    });
  }

  /**
   * Get pending verifications
   */
  async getPendingVerifications(params?: {
    patient?: string;
    overall_status?: string;
    priority?: string;
    page?: number;
  }): Promise<{ results: RadiologyReport[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: RadiologyReport[]; count: number }>(
      `/radiology/verification/${query}`
    );
  }

  /**
   * Get verified/completed reports
   */
  async getVerifiedReports(params?: {
    patient?: string;
    overall_status?: string;
    priority?: string;
    page?: number;
  }): Promise<{ results: RadiologyReport[]; count: number }> {
    const queryParams = { ...params, study_status: 'verified' };
    const query = buildQueryString(queryParams);
    return apiFetch<{ results: RadiologyReport[]; count: number }>(
      `/radiology/verification/${query}`
    );
  }

  /**
   * Verify a radiology report
   */
  async verifyReport(
    reportId: number,
    overallStatus: 'normal' | 'abnormal' | 'critical',
    priority: 'low' | 'medium' | 'high',
    notes?: string
  ): Promise<RadiologyReport> {
    return apiFetch<RadiologyReport>(`/radiology/verification/${reportId}/verify/`, {
      method: 'POST',
      body: JSON.stringify({
        overall_status: overallStatus,
        priority,
        notes: notes || '',
      }),
    });
  }
}

export const radiologyService = new RadiologyService();

