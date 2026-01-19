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
  consultation_session?: number;
  priority: 'routine' | 'urgent' | 'stat';
  clinic?: string;
  clinical_notes?: string;
  studies: RadiologyStudy[];
  ordered_at: string;
  // For creating orders with studies
  studies_data?: any[];
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

export interface RadiologyTemplate {
  id: number;
  name: string;
  code: string;
  category: 'xray' | 'ct' | 'mri' | 'ultrasound' | 'mammography' | 'fluoroscopy' | 'angiography' | 'nuclear' | 'dental' | 'interventional';
  subcategory?: 'plain_film' | 'contrast_studies' | 'special_procedures' | 'doppler' | 'abdominal' | 'cardiac' | 'musculoskeletal' | 'neurological' | 'thoracic' | 'vascular' | 'oncological' | 'cytology';
  description?: string;
  body_part?: string;
  modality?: string;
  contrast_required?: boolean;
  radiation_exposure?: 'none' | 'low' | 'moderate' | 'high';
  preparation_required?: string;
  indications?: string;
  contraindications?: string;
  turnaround_time?: string;
  report_template?: any;
  is_active: boolean;
  created_at: string;
  updated_at: string;
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
    page_size?: number;
    consultation_session?: number;
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
    page_size?: number;
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
    page_size?: number;
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


  /**
   * Get radiology templates
   */
  async getTemplates(params?: {
    category?: string;
    modality?: string;
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: RadiologyTemplate[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: RadiologyTemplate[]; count: number }>(`/radiology/templates/${query}`);
  }

  /**
   * Get a single radiology template
   */
  async getTemplate(templateId: number): Promise<RadiologyTemplate> {
    return apiFetch<RadiologyTemplate>(`/radiology/templates/${templateId}/`);
  }

  /**
   * Create a radiology template
   */
  async createTemplate(data: Partial<RadiologyTemplate>): Promise<RadiologyTemplate> {
    return apiFetch<RadiologyTemplate>('/radiology/templates/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a radiology template
   */
  async updateTemplate(templateId: number, data: Partial<RadiologyTemplate>): Promise<RadiologyTemplate> {
    return apiFetch<RadiologyTemplate>(`/radiology/templates/${templateId}/`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a radiology template
   */
  async deleteTemplate(templateId: number): Promise<void> {
    return apiFetch<void>(`/radiology/templates/${templateId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Toggle template active status
   */
  async toggleTemplateStatus(templateId: number): Promise<RadiologyTemplate> {
    return apiFetch<RadiologyTemplate>(`/radiology/templates/${templateId}/toggle_status/`, {
      method: 'POST',
    });
  }

  /**
   * Get radiology statistics
   */
  async getStats(): Promise<{
    pendingOrders: number;
    inProgress: number;
    awaitingReport: number;
    criticalFindings: number;
  }> {
    // Get all orders - use a larger page size to get more data for stats
    const ordersResponse = await this.getOrders({ page: 1, page_size: 100 });
    const allOrders = ordersResponse.results;

    // Calculate stats based on studies within orders
    const pendingOrders = allOrders.filter(order =>
      order.studies && order.studies.some(s => s.status === 'pending')
    ).length;

    const inProgress = allOrders.filter(order =>
      order.studies && order.studies.some(s => s.status === 'processing')
    ).length;

    const awaitingReport = allOrders.filter(order =>
      order.studies && order.studies.some(s => s.status === 'reported')
    ).length;

    const criticalFindings = allOrders.filter(order =>
      order.studies && order.studies.some(s => (s as any).critical === true)
    ).length;

    return {
      pendingOrders,
      inProgress,
      awaitingReport,
      criticalFindings,
    };
  }

  /**
   * Update order status
   */
  async updateOrderStatus(orderId: number, status: string): Promise<RadiologyOrder> {
    return apiFetch<RadiologyOrder>(`/radiology/orders/${orderId}/update_status/`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  /**
   * Update order results
   */
  async updateOrderResults(orderId: number, data: {
    findings: string;
    impression: string;
    critical: boolean;
    reportFile?: File | null;
    status: string;
  }): Promise<RadiologyOrder> {
    const formData = new FormData();
    formData.append('findings', data.findings);
    formData.append('impression', data.impression);
    formData.append('critical', data.critical.toString());
    formData.append('status', data.status);

    if (data.reportFile) {
      formData.append('report_file', data.reportFile);
    }

    return apiFetch<RadiologyOrder>(`/radiology/orders/${orderId}/update_results/`, {
      method: 'POST',
      body: formData,
    });
  }

  /**
   * Update study status (individual study processing like lab tests)
   */
  async updateStudyStatus(studyId: number, status: string, data?: { processing_method?: string; outsourced_lab?: string | null }): Promise<any> {
    const requestData = { status, ...data };
    return apiFetch<any>(`/radiology/studies/${studyId}/update_status/`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  /**
   * Update study results (individual study results like lab tests)
   */
  async updateStudyResults(studyId: number, data: {
    findings: string;
    impression: string;
    critical: boolean;
    reportFile?: File | null;
    status: string;
  }): Promise<any> {
    const formData = new FormData();
    formData.append('findings', data.findings);
    formData.append('impression', data.impression);
    formData.append('critical', data.critical.toString());
    formData.append('status', data.status);

    if (data.reportFile) {
      formData.append('report_file', data.reportFile);
    }

    return apiFetch<any>(`/radiology/studies/${studyId}/update_results/`, {
      method: 'POST',
      body: formData,
    });
  }
}

export const radiologyService = new RadiologyService();

