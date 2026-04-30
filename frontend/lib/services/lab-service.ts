"use client";

/**
 * Laboratory API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface LabOrder {
  id: number;
  order_id: string;
  lab_number?: string;  // One Lab ID per order (BT-YY-NNNN)
  patient: {
    id: number;
    name: string;
    age: number;
    gender: string;
  };
  doctor: {
    id: number;
    name: string;
    specialty: string;
  };
  tests: LabTest[];
  priority: 'routine' | 'urgent' | 'stat';
  ordered_at: string;
  clinic: string;
  source_type?: 'internal_emr' | 'external_manual';
  external_clinic?: number | null;
  external_clinic_details?: { id: number; name: string; code?: string; location?: string } | null;
  external_requesting_doctor_name?: string;
  manual_request_reference?: string;
  manual_request_file?: string | null;
  clinical_notes?: string;
  icd10_diagnoses?: Array<{ code: string; name: string; type: string; notes?: string }>;
}

export interface LabTest {
  id: number;
  name: string;
  code: string;
  sample_type: string;
  status: 'pending' | 'sample_collected' | 'processing' | 'results_ready' | 'verified' | 'rejected';
  processing_method?: 'in_house' | 'outsourced';
  outsourced_lab?: string;
  lab_number?: string;
  collected_by?: string | number;
  collected_by_name?: string;
  collected_at?: string;
  processed_by?: string | number;
  processed_by_name?: string;
  processed_at?: string;
  results?: Record<string, any>;
  result_file?: { name: string; type: string; uploaded_at: string };
  result_attachments?: LabResultAttachment[];
  template?: string;
  // Provided by backend serializer for UI use
  template_name?: string | null;
  template_category?: string | null;
  template_sample_type?: string | null;
  template_normal_range?: Record<string, any> | null;
  rejected_by?: string | number;
  rejected_by_name?: string;
  rejected_at?: string;
  verification_notes?: string;
  notes?: string;
}

export interface LabResultAttachment {
  id: number;
  test: number;
  row_id: string;
  row_name: string;
  file: string;
  uploaded_by?: number | null;
  uploaded_by_name?: string | null;
  uploaded_at: string;
}

export interface CustomLabResultRow {
  id: string;
  name: string;
  value: string;
  unit: string;
  reference_range: string;
  notes: string;
}

/** External / outsourced lab partners (managed in Django admin or via API). */
export interface LabPartner {
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

export interface LabTemplate {
  id: number;
  name: string;
  code: string;
  sample_type: string;
  description?: string;
  normal_range?: Record<string, any>; // JSON field storing parameter definitions
  category?: string; // May not exist in backend, but used in frontend
  turnaround_time?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface LabResult {
  id: number;
  test?: LabTest;
  test_details?: LabTest; // API returns this as test_details
  order: LabOrder;
  patient: {
    id: number;
    name: string;
  };
  patient_name?: string; // API also returns this
  order_id?: string; // API also returns this
  overall_status?: 'normal' | 'abnormal' | 'critical';
  priority?: 'low' | 'medium' | 'high';
  created_at: string;
}

export interface LabAnalyticsSummary {
  period: { start: string; end: string };
  summary: {
    orders_count: number;
    tests_total: number;
    tests_verified: number;
    tests_results_ready: number;
    tests_rejected: number;
    unique_patients: number;
  };
  patients_by_gender: Record<string, number>;
  patients_by_category: Record<string, number>;
  npa_staff_linked_vs_non_npa: { npa_staff_linked: number; non_npa: number };
  tests_by_status: Record<string, number>;
  tests_by_processing_method: Record<string, number>;
  tests_processing_summary?: {
    in_house: number;
    outsourced: number;
    unassigned: number;
    total: number;
  };
  by_day: Array<{ date: string; tests: number; orders: number }>;
  top_tests: Array<{ code: string; name: string; count: number }>;
  tests_by_template_category: Record<string, number>;
  tests_by_category_with_investigations?: Record<
    string,
    {
      total: number;
      processing: { in_house: number; outsourced: number; unassigned: number };
      investigations: Array<{
        code: string;
        name: string;
        count: number;
        processing: { in_house: number; outsourced: number; unassigned: number };
      }>;
    }
  >;
  major_lab_classes?: Record<
    string,
    {
      total: number;
      processing: { in_house: number; outsourced: number; unassigned: number };
      investigations: Array<{
        code: string;
        name: string;
        count: number;
        processing: { in_house: number; outsourced: number; unassigned: number };
      }>;
    }
  >;
  /** Breakdown of orders/tests by LabOrder.source_type (internal_emr vs external_manual). */
  orders_by_source?: Record<string, { orders: number; tests: number }>;
  /** External manual requests aggregated by originating clinic. */
  external_orders_by_clinic?: Array<{
    clinic_id?: number | null;
    clinic_name: string;
    clinic_code?: string;
    orders: number;
    tests: number;
  }>;
}

class LabService {
  /**
   * Get all lab orders
   */
  async getOrders(params?: {
    patient?: string;
    doctor?: string;
    priority?: string;
    status?: string;
    source_type?: 'internal_emr' | 'external_manual';
    search?: string;
    /** Filter orders that have at least one test with this processing method */
    processing_method?: 'in_house' | 'outsourced';
    date?: string;
    start_date?: string;
    end_date?: string;
    /**
     * Which timestamp the date / start_date / end_date params apply to.
     * Defaults to ``ordered_at`` on the backend; pass ``rejected_at`` when
     * you want to show today's test rejections regardless of the original
     * order date (e.g. on the "Rework Required" tab).
     */
    date_field?: 'ordered_at' | 'rejected_at';
    page?: number;
    page_size?: number;
    consultation_session?: number;
  }): Promise<{ results: LabOrder[]; count: number; next?: string; previous?: string }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: LabOrder[]; count: number; next?: string; previous?: string }>(
      `/laboratory/orders/${query}`
    );
  }

  async getOrderStats(params?: {
    priority?: string;
    search?: string;
    processing_method?: 'in_house' | 'outsourced';
    source_type?: 'internal_emr' | 'external_manual';
    gender?: string;
    date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{
    total: number;
    pending: number;
    processing: number;
    results_ready: number;
    rework_required: number;
    stat: number;
  }> {
    const query = buildQueryString(params || {});
    return apiFetch(`/laboratory/orders/stats/${query}`);
  }

  /**
   * Get a single lab order by ID
   */
  async getOrder(orderId: number): Promise<LabOrder> {
    return apiFetch<LabOrder>(`/laboratory/orders/${orderId}/`);
  }

  /**
   * Create a new lab order
   */
  async createOrder(data: Partial<LabOrder>): Promise<LabOrder> {
    return apiFetch<LabOrder>('/laboratory/orders/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async createExternalOrder(data: {
    patient: number;
    priority: 'routine' | 'urgent' | 'stat';
    external_clinic: number;
    external_requesting_doctor_name: string;
    manual_request_reference?: string;
    manual_request_file?: File;
    clinical_notes?: string;
    tests_data: Array<{
      template?: number | null;
      name: string;
      code: string;
      sample_type: string;
      status?: 'pending';
      notes?: string;
    }>;
  }): Promise<LabOrder> {
    if (data.manual_request_file) {
      const formData = new FormData();
      formData.append('source_type', 'external_manual');
      formData.append('patient', String(data.patient));
      formData.append('priority', data.priority);
      formData.append('external_clinic', String(data.external_clinic));
      formData.append('external_requesting_doctor_name', data.external_requesting_doctor_name);
      if (data.manual_request_reference) formData.append('manual_request_reference', data.manual_request_reference);
      if (data.clinical_notes) formData.append('clinical_notes', data.clinical_notes);
      formData.append('tests_data', JSON.stringify(data.tests_data));
      formData.append('manual_request_file', data.manual_request_file);
      return apiFetch<LabOrder>('/laboratory/orders/', {
        method: 'POST',
        body: formData,
      });
    }
    return apiFetch<LabOrder>('/laboratory/orders/', {
      method: 'POST',
      body: JSON.stringify({
        source_type: 'external_manual',
        ...data,
      }),
    });
  }

  /**
   * Update a lab order
   */
  async updateOrder(orderId: number, data: Partial<LabOrder>): Promise<LabOrder> {
    return apiFetch<LabOrder>(`/laboratory/orders/${orderId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Generate lab number for a test (called when Collect Sample dialog opens)
   */
  async generateLabNumber(orderId: number, testId: number): Promise<LabTest> {
    return apiFetch<LabTest>(`/laboratory/orders/${orderId}/generate_lab_number/`, {
      method: 'POST',
      body: JSON.stringify({ 
        test_id: testId,
      }),
    });
  }

  /**
   * Collect samples for multiple tests (assigns sequential lab numbers)
   */
  async collectSamples(orderId: number, testIds: number[], collectionMethod?: string, notes?: string): Promise<LabTest[]> {
    return apiFetch<LabTest[]>(`/laboratory/orders/${orderId}/collect_samples/`, {
      method: 'POST',
      body: JSON.stringify({
        test_ids: testIds,
        collection_method: collectionMethod || '',
        notes: notes || '',
      }),
    });
  }

  /**
   * Process a test
   */
  async processTest(
    orderId: number,
    testId: number,
    processingMethod: 'in_house' | 'outsourced',
    outsourcedLab?: string
  ): Promise<LabTest> {
    return apiFetch<LabTest>(`/laboratory/orders/${orderId}/process/`, {
      method: 'POST',
      body: JSON.stringify({
        test_id: testId,
        processing_method: processingMethod,
        outsourced_lab: outsourcedLab || '',
      }),
    });
  }

  /**
   * Submit results for a test
   */
  async submitResults(
    orderId: number,
    testId: number,
    results: Record<string, string> | { custom_results: CustomLabResultRow[] },
    resultFile?: File,
    notes?: string,
    customAttachments?: Record<string, File | null>
  ): Promise<LabTest> {
    const hasCustomAttachments = customAttachments && Object.values(customAttachments).some(Boolean);
    const hasCustomRows = Array.isArray((results as any)?.custom_results);
    if (resultFile || hasCustomAttachments || hasCustomRows) {
      // Upload file using FormData
      const formData = new FormData();
      formData.append('test_id', testId.toString());
      formData.append('results', JSON.stringify(results || {}));
      if (resultFile) formData.append('result_file', resultFile);
      if (customAttachments) {
        Object.entries(customAttachments).forEach(([rowId, file]) => {
          if (file) formData.append(`custom_attachment_${rowId}`, file);
        });
      }
      formData.append('notes', notes || '');
      
      return apiFetch<LabTest>(`/laboratory/orders/${orderId}/submit_results/`, {
        method: 'POST',
        body: formData,
      });
    } else {
      return apiFetch<LabTest>(`/laboratory/orders/${orderId}/submit_results/`, {
        method: 'POST',
        body: JSON.stringify({
          test_id: testId,
          results,
          notes: notes || '',
        }),
      });
    }
  }

  /**
   * List outsourced lab partners (for processing dropdown).
   */
  async getLabPartners(params?: {
    is_active?: boolean;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: LabPartner[]; count: number }> {
    const query = buildQueryString({
      is_active: true,
      page_size: 200,
      ...params,
    });
    const path = `/laboratory/lab-partners/${query}`;
    const raw = await apiFetch<LabPartner[] | { results?: LabPartner[]; count?: number }>(path);
    const results = Array.isArray(raw) ? raw : raw?.results ?? [];
    const count = Array.isArray(raw) ? raw.length : raw?.count ?? results.length;
    return { results, count };
  }

  async createLabPartner(data: Partial<LabPartner>): Promise<LabPartner> {
    return apiFetch<LabPartner>('/laboratory/lab-partners/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateLabPartner(id: number, data: Partial<LabPartner>): Promise<LabPartner> {
    return apiFetch<LabPartner>(`/laboratory/lab-partners/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteLabPartner(id: number): Promise<void> {
    return apiFetch<void>(`/laboratory/lab-partners/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get lab templates
   */
  async getTemplates(params?: {
    search?: string;
    category?: string;
    is_active?: boolean;
    code?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: LabTemplate[]; count: number }> {
    const query = params ? buildQueryString(params) : 'page_size=100';
    const response = await apiFetch<{ results: LabTemplate[]; count: number }>(`/laboratory/templates/?${query}`);
    return response;
  }

  /**
   * Get a single lab template by ID
   */
  async getTemplate(templateId: number): Promise<LabTemplate> {
    return apiFetch<LabTemplate>(`/laboratory/templates/${templateId}/`);
  }

  /**
   * Create a new lab template
   */
  async createTemplate(data: Partial<LabTemplate>): Promise<LabTemplate> {
    return apiFetch<LabTemplate>('/laboratory/templates/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a lab template
   */
  async updateTemplate(templateId: number, data: Partial<LabTemplate>): Promise<LabTemplate> {
    return apiFetch<LabTemplate>(`/laboratory/templates/${templateId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a lab template
   */
  async deleteTemplate(templateId: number): Promise<void> {
    return apiFetch<void>(`/laboratory/templates/${templateId}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get pending verifications
   */
  async getPendingVerifications(params?: {
    patient?: string;
    overall_status?: string;
    priority?: string;
    search?: string;
    gender?: string;
    processing_method?: 'in_house' | 'outsourced';
    page?: number;
    page_size?: number;
  }): Promise<{ results: LabResult[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: LabResult[]; count: number }>(`/laboratory/verification/${query}`);
  }

  /**
   * Verify a lab result
   */
  async verifyResult(
    resultId: number,
    overallStatus: 'normal' | 'abnormal' | 'critical',
    priority: 'low' | 'medium' | 'high',
    notes?: string
  ): Promise<LabResult> {
    return apiFetch<LabResult>(`/laboratory/verification/${resultId}/verify/`, {
      method: 'POST',
      body: JSON.stringify({
        overall_status: overallStatus,
        priority,
        notes: notes || '',
      }),
    });
  }

  /**
   * Get a single test by ID
   */
  async getTest(testId: number): Promise<LabTest> {
    return apiFetch<LabTest>(`/laboratory/tests/${testId}/`);
  }

  /**
   * Update a test (for rework/resubmit)
   */
  async updateTest(testId: number, data: Partial<LabTest>): Promise<LabTest> {
    return apiFetch<LabTest>(`/laboratory/tests/${testId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get verified lab results (for verification history)
   */
  async getVerifiedResults(params?: {
    patient?: string;
    overall_status?: string;
    priority?: string;
    clinic?: string;
    gender?: string;
    search?: string;
    processing_method?: 'in_house' | 'outsourced';
    date?: string;
    start_date?: string;
    end_date?: string;
    page?: number;
    page_size?: number;
    status?: string;
  }): Promise<{ results: LabResult[]; count: number }> {
    const queryParams = { ...params, status: params?.status || 'verified' };
    const query = buildQueryString(queryParams);
    return apiFetch<{ results: LabResult[]; count: number }>(`/laboratory/verification/${query}`);
  }

  /**
   * Stats for verified results / completed tests (counts across filters)
   */
  async getVerifiedResultsStats(params?: {
    patient?: string;
    overall_status?: string;
    priority?: string;
    clinic?: string;
    gender?: string;
    search?: string;
    processing_method?: 'in_house' | 'outsourced';
    date?: string;
    start_date?: string;
    end_date?: string;
    status?: string;
  }): Promise<{ total: number; normal: number; abnormal: number; critical: number }> {
    // Some deployments do not expose a dedicated stats endpoint.
    // Derive stats via lightweight filtered list calls (page_size=1) and read `count`.
    const base = { ...(params || {}), status: params?.status || 'verified' };

    const [allRes, normalRes, abnormalRes, criticalRes] = await Promise.all([
      this.getVerifiedResults({ ...base, page: 1, page_size: 1, overall_status: base.overall_status || undefined }),
      this.getVerifiedResults({ ...base, page: 1, page_size: 1, overall_status: 'normal' }),
      this.getVerifiedResults({ ...base, page: 1, page_size: 1, overall_status: 'abnormal' }),
      this.getVerifiedResults({ ...base, page: 1, page_size: 1, overall_status: 'critical' }),
    ]);

    return {
      total: allRes.count || 0,
      normal: normalRes.count || 0,
      abnormal: abnormalRes.count || 0,
      critical: criticalRes.count || 0,
    };
  }

  async getVerificationStats(params?: {
    status?: 'results_ready' | 'verified' | 'all';
    overall_status?: string;
    priority?: string;
    clinic?: string;
    gender?: string;
    search?: string;
    processing_method?: 'in_house' | 'outsourced';
    date?: string;
    start_date?: string;
    end_date?: string;
  }): Promise<{ total: number; normal: number; abnormal: number; critical: number }> {
    const query = buildQueryString(params || {});
    return apiFetch(`/laboratory/verification/stats/${query}`);
  }

  /**
   * Get completed/verified lab tests
   */
  async getCompletedTests(params?: {
    patient?: string;
    status?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: LabTest[]; count: number }> {
    const queryParams = { ...params, status: 'verified' };
    const query = buildQueryString(queryParams);
    return apiFetch<{ results: LabTest[]; count: number }>(`/laboratory/tests/${query}`);
  }

  /**
   * Reject a lab result and send it back to lab technician
   */
  async rejectResult(
    testId: number,
    rejectionReason: string
  ): Promise<LabTest> {
    return apiFetch<LabTest>(`/laboratory/tests/${testId}/`, {
      method: 'PATCH',
      body: JSON.stringify({
        status: 'rejected', // Set status to rejected
        verification_notes: rejectionReason, // Store rejection reason in verification_notes
        // rejected_by and rejected_at will be set by the backend
      }),
    });
  }

  async getAnalyticsSummary(start: string, end: string): Promise<LabAnalyticsSummary> {
    const query = buildQueryString({ start, end });
    return apiFetch<LabAnalyticsSummary>(`/laboratory/analytics/summary/${query}`);
  }

  /**
   * Get lab statistics (pending, processing, results ready, critical)
   */
  async getStats(): Promise<{
    pendingTests: number;
    inProgress: number;
    resultsReady: number;
    critical: number;
  }> {
    // Get all orders and calculate stats
    const orders = await this.getOrders({ page: 1 });
    const allTests = orders.results.flatMap(order => order.tests || []);
    
    return {
      pendingTests: allTests.filter(t => t.status === 'pending').length,
      inProgress: allTests.filter(t => t.status === 'sample_collected' || t.status === 'processing').length,
      resultsReady: allTests.filter(t => t.status === 'results_ready').length,
      critical: orders.results.filter(o => o.priority === 'stat' && o.tests.some(t => t.status !== 'verified')).length,
    };
  }
}

export const labService = new LabService();
export default labService;
