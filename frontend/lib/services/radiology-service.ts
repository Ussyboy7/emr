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
  provisional_diagnosis?: string;
  lmp?: string;
  report?: string;
  critical?: boolean;
  studies: RadiologyStudy[];
  ordered_at: string;
  icd10_diagnoses?: Array<{ code: string; name: string; type: string; notes?: string }>;
  patient_details?: { id?: number; name?: string; age?: number; gender?: string };
  // For creating orders with studies
  studies_data?: Record<string, unknown>[];
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
  custom_reports?: CustomRadiologyReportRow[];
  report_attachments?: RadiologyReportAttachment[];
  recommendations?: string;
  acquired_by?: number;
  acquired_at?: string;
  reported_by?: number;
  reported_at?: string;
  verified_by?: number;
  verified_at?: string;
  verification_notes?: string;
}

export interface CustomRadiologyReportRow {
  id: string;
  procedure: string;
  report: string;
  recommendations?: string;
  critical?: boolean;
}

export interface RadiologyReportAttachment {
  id: number;
  row_id: string;
  row_name?: string;
  file: string;
  uploaded_by_name?: string | null;
  uploaded_at: string;
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
  radiation_exposure?: 'none' | 'low' | 'moderate' | 'high';
  preparation_required?: string;
  indications?: string;
  contraindications?: string;
  turnaround_time?: string;
  report_template?: Record<string, unknown>;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface RadiologyAnalyticsSummary {
  period: { start: string; end: string };
  summary: {
    orders_count: number;
    studies_total: number;
    studies_verified: number;
    studies_reported: number;
    studies_marked_critical: number;
    unique_patients: number;
  };
  patients_by_gender: Record<string, number>;
  patients_by_category: Record<string, number>;
  npa_staff_linked_vs_non_npa: { npa_staff_linked: number; non_npa: number };
  studies_by_status: Record<string, number>;
  studies_by_modality: Record<string, number>;
  studies_by_template_category: Record<string, number>;
  studies_by_processing_method: Record<string, number>;
  studies_processing_summary?: {
    in_house: number;
    outsourced: number;
    unassigned: number;
    total: number;
  };
  procedures_by_processing_method?: Array<{
    procedure: string;
    total: number;
    processing: {
      in_house: number;
      outsourced: number;
      unassigned: number;
    };
  }>;
  orders_by_priority: Record<string, number>;
  by_day: Array<{ date: string; studies: number; orders: number }>;
  top_procedures: Array<{ procedure: string; count: number }>;
}

export interface ImagingPartner {
  id: number;
  name: string;
  code?: string;
  phone?: string;
  email?: string;
  notes?: string;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
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
    /** Orders that have at least one study with this processing method */
    processing_method?: 'in_house' | 'outsourced';
    /** Orders that have at least one study in this workflow status */
    study_status?: 'pending' | 'processing' | 'reported' | 'rejected' | 'verified';
    gender?: 'male' | 'female';
    date?: string;
    start_date?: string;
    end_date?: string;
    /**
     * Which timestamp the date / start_date / end_date params apply to.
     * Defaults to ``ordered_at`` on the backend; pass ``rejected_at`` when
     * you want to show today's study rejections regardless of the original
     * order date (e.g. on the "Rejected" tab).
     */
    date_field?: 'ordered_at' | 'rejected_at';
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
   * Create a study within an existing order
   */
  async createStudy(data: Partial<RadiologyStudy> & { order: number }): Promise<RadiologyStudy> {
    return apiFetch<RadiologyStudy>('/radiology/studies/', {
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
    recommendations?: string
  ): Promise<RadiologyStudy> {
    return apiFetch<RadiologyStudy>(`/radiology/orders/${orderId}/report/`, {
      method: 'POST',
      body: JSON.stringify({
        study_id: studyId,
        report,
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
    clinic?: string;
    gender?: string;
    processing_method?: 'in_house' | 'outsourced';
    category?: string;
    search?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
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
    clinic?: string;
    gender?: string;
    processing_method?: 'in_house' | 'outsourced';
    category?: string;
    search?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: RadiologyReport[]; count: number }> {
    // Backend RadiologyReportViewSet reads `status`, not `study_status` (see get_queryset).
    const queryParams = { ...params, status: 'verified' };
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
    code?: string;
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

  async getOrderStats(params?: {
    priority?: string;
    search?: string;
    processing_method?: 'in_house' | 'outsourced';
    gender?: 'male' | 'female';
    date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    total: number;
    pending: number;
    processing: number;
    results_ready: number;
    rejected: number;
    stat: number;
  }> {
    const query = buildQueryString(params || {});
    return apiFetch(`/radiology/orders/stats/${query}`);
  }

  async getVerificationStats(params?: {
    status?: 'reported' | 'verified' | 'all';
    overall_status?: string;
    priority?: string;
    clinic?: string;
    gender?: string;
    processing_method?: 'in_house' | 'outsourced';
    category?: string;
    search?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    total: number;
    normal: number;
    abnormal: number;
    critical: number;
  }> {
    const query = buildQueryString(params || {});
    return apiFetch(`/radiology/verification/stats/${query}`);
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
    report: string;
    critical: boolean;
    reportFile?: File | null;
    status: string;
  }): Promise<RadiologyOrder> {
    const formData = new FormData();
    formData.append('report', data.report);
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
    const requestData: Record<string, unknown> = { status };
    if (data?.processing_method) {
      requestData.processing_method = data.processing_method;
    }
    // Backend expects 'outsourced_facility', not 'outsourced_lab'
    if (data?.outsourced_lab !== undefined && data?.outsourced_lab !== null) {
      requestData.outsourced_facility = data.outsourced_lab;
    }
    return apiFetch<any>(`/radiology/studies/${studyId}/update_status/`, {
      method: 'POST',
      body: JSON.stringify(requestData),
    });
  }

  /**
   * Update study results (individual study results like lab tests)
   */
  async updateStudyResults(studyId: number, data: {
    report: string;
    critical: boolean;
    reportFile?: File | null;
    customReports?: CustomRadiologyReportRow[];
    customReportFiles?: Record<string, File | null>;
    status: string;
  }): Promise<any> {
    const formData = new FormData();
    formData.append('report', data.report);
    formData.append('critical', data.critical.toString());
    formData.append('status', data.status);

    if (data.reportFile) {
      formData.append('report_file', data.reportFile);
    }
    if (data.customReports) {
      formData.append('custom_reports', JSON.stringify(data.customReports));
      Object.entries(data.customReportFiles || {}).forEach(([rowId, file]) => {
        if (file) formData.append(`custom_report_file_${rowId}`, file);
      });
    }

    return apiFetch<any>(`/radiology/studies/${studyId}/update_results/`, {
      method: 'POST',
      body: formData,
    });
  }

  async getAnalyticsSummary(start: string, end: string): Promise<RadiologyAnalyticsSummary> {
    const query = buildQueryString({ start, end });
    return apiFetch<RadiologyAnalyticsSummary>(`/radiology/analytics/summary/${query}`);
  }

  /**
   * List outsourced imaging partners (for processing dropdown).
   */
  async getImagingPartners(params?: {
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: ImagingPartner[]; count: number }> {
    const query = buildQueryString({
      is_active: true,
      page_size: 200,
      ...params,
    });
    const path = `/radiology/imaging-partners/${query}`;
    const raw = await apiFetch<ImagingPartner[] | { results?: ImagingPartner[]; count?: number }>(path);
    const results = Array.isArray(raw) ? raw : raw?.results ?? [];
    const count = Array.isArray(raw) ? raw.length : raw?.count ?? results.length;
    return { results, count };
  }

  async createImagingPartner(data: Partial<ImagingPartner>): Promise<ImagingPartner> {
    return apiFetch<ImagingPartner>('/radiology/imaging-partners/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateImagingPartner(id: number, data: Partial<ImagingPartner>): Promise<ImagingPartner> {
    return apiFetch<ImagingPartner>(`/radiology/imaging-partners/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteImagingPartner(id: number): Promise<void> {
    return apiFetch<void>(`/radiology/imaging-partners/${id}/`, {
      method: 'DELETE',
    });
  }
}

export const radiologyService = new RadiologyService();
