"use client";

/**
 * Laboratory API service
 */
import { apiFetch, buildQueryString } from '../api-client';
import { DEFAULT_CATALOG_PAGE_SIZE, MAX_CATALOG_PAGE_SIZE } from '../pagination-constants';

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
  location_clinic_name?: string;
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
  location_clinic_name?: string;
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

/**
 * One outbound batch send-out from a `LabOrder` to a single external `LabPartner`.
 * Created by `dispatchOutsourced`; drives the post-dispatch print panel and the
 * Dispatches history shown on the order detail dialog.
 */
export interface LabReferralDispatch {
  id: number;
  dispatch_id: string;
  order: number;
  partner_id: number | null;
  partner_name: string;
  partner_address_snapshot?: string;
  tests: {
    id: number;
    name: string;
    code: string;
    sample_type: string;
    status: string;
    lab_number?: string | null;
  }[];
  status: 'issued' | 'cancelled' | 'superseded';
  superseded_by: number | null;
  superseded_by_dispatch_id: string | null;
  cancellation_reason: string;
  notes: string;
  issued_by: number | null;
  issued_by_name: string | null;
  issued_at: string;
  cancelled_by: number | null;
  cancelled_by_name: string | null;
  cancelled_at: string | null;
  referral_letter_printed_at: string | null;
  responsibility_form_printed_at: string | null;
}

/** External / outsourced lab partners (managed in Django admin or via API). */
export interface LabPartner {
  id: number;
  name: string;
  code?: string;
  phone?: string;
  email?: string;
  /** Multi-line postal address printed on referral letters / responsibility forms. */
  address?: string;
  /** Addressee role for letter "To:" block (default "The Medical Director"). */
  contact_person_title?: string;
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
  category?: string;
  turnaround_time?: string;
  sort_order?: number;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface TemplateFieldOption {
  id: number;
  template: number;
  template_code: string;
  template_name: string;
  field_name: string;
  value: string;
  sort_order: number;
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
  by_week?: Array<{ week: string; tests: number; orders: number }>;
  by_month?: Array<{ month: string; tests: number; orders: number }>;
  by_bimonth?: Array<{ bimonth: string; tests: number; orders: number }>;
  by_quarter?: Array<{ quarter: string; tests: number; orders: number }>;
  by_halfyear?: Array<{ halfyear: string; tests: number; orders: number }>;
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
    /** Orders with at least one test in this workflow stage (list tabs). */
    workflow_tab?: 'pending' | 'processing' | 'results_ready' | 'rejected';
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
   * Create a new outsourced dispatch for one or more tests on an order. The
   * backend serialises a `LBR-YYYY-NNNNNN` slip and flips each test's status
   * to `processing` with `processing_method=outsourced`.
   */
  async dispatchOutsourced(
    orderId: number,
    payload: { partner_id: number; test_ids: number[]; notes?: string }
  ): Promise<LabReferralDispatch> {
    return apiFetch<LabReferralDispatch>(
      `/laboratory/orders/${orderId}/dispatch_outsourced/`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      }
    );
  }

  /** List every dispatch ever issued for an order (newest first). */
  async getOrderDispatches(orderId: number): Promise<LabReferralDispatch[]> {
    const response = await apiFetch<LabReferralDispatch[] | { results: LabReferralDispatch[] }>(
      `/laboratory/orders/${orderId}/dispatches/`
    );
    return Array.isArray(response) ? response : response?.results ?? [];
  }

  /** Cancel an issued dispatch (e.g. wrong partner, wrong tests). */
  async cancelDispatch(
    orderId: number,
    dispatchId: number,
    reason?: string
  ): Promise<LabReferralDispatch> {
    return apiFetch<LabReferralDispatch>(
      `/laboratory/orders/${orderId}/dispatches/${dispatchId}/cancel/`,
      {
        method: 'POST',
        body: JSON.stringify({ reason: reason || '' }),
      }
    );
  }

  /**
   * Fetch the standardised Referral Letter PDF for a dispatch as a Blob and
   * stamp `referral_letter_printed_at` on the server.
   */
  async fetchReferralLetterPdf(orderId: number, dispatchId: number): Promise<Blob> {
    return apiFetch<Blob>(
      `/laboratory/orders/${orderId}/dispatches/${dispatchId}/referral_letter/`,
      { responseType: 'blob' }
    );
  }

  /**
   * Fetch the standardised Responsibility Form PDF for a dispatch as a Blob
   * and stamp `responsibility_form_printed_at` on the server.
   */
  async fetchResponsibilityFormPdf(orderId: number, dispatchId: number): Promise<Blob> {
    return apiFetch<Blob>(
      `/laboratory/orders/${orderId}/dispatches/${dispatchId}/responsibility_form/`,
      { responseType: 'blob' }
    );
  }

  /**
   * Submit results for a test
   */
  async submitResults(
    orderId: number,
    testId: number,
    results: Record<string, string> | { custom_results: CustomLabResultRow[] },
    resultFiles?: File[],
    notes?: string,
    customAttachments?: Record<string, File | null>
  ): Promise<LabTest> {
    const hasCustomAttachments = customAttachments && Object.values(customAttachments).some(Boolean);
    const hasCustomRows = Array.isArray((results as any)?.custom_results);
    const hasFiles = resultFiles && resultFiles.length > 0;
    if (hasFiles || hasCustomAttachments || hasCustomRows) {
      // Upload file using FormData
      const formData = new FormData();
      formData.append('test_id', testId.toString());
      formData.append('results', JSON.stringify(results || {}));
      if (hasFiles) {
        resultFiles.forEach((file, idx) => {
          formData.append(`report_file_${idx}`, file);
        });
        formData.append('report_file_count', String(resultFiles.length));
      }
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
      page_size: DEFAULT_CATALOG_PAGE_SIZE,
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
    const query = buildQueryString({
      page_size: MAX_CATALOG_PAGE_SIZE,
      ...(params || {}),
    });
    const response = await apiFetch<{ results: LabTemplate[]; count: number }>(`/laboratory/templates/${query}`);
    return response;
  }

  async getTemplateListStats(): Promise<{
    total: number;
    active: number;
    chemistry: number;
    hematology: number;
    microbiology: number;
    serology: number;
    toxicology: number;
  }> {
    return apiFetch('/laboratory/templates/list-stats/');
  }

  /** Exact template lookup by code (e.g. OTHER). */
  async resolveTemplateByCode(code: string): Promise<LabTemplate | null> {
    try {
      const query = buildQueryString({ code });
      return await apiFetch<LabTemplate>(`/laboratory/templates/resolve/${query}`);
    } catch {
      return null;
    }
  }

  /**
   * Get a single lab template by ID
   */
  async getTemplate(templateId: number): Promise<LabTemplate> {
    return apiFetch<LabTemplate>(`/laboratory/templates/${templateId}/`);
  }

  // ── Template Field Options ──────────────────────────────────────────

  /**
   * List field options for a template (or for a specific field).
   */
  async getFieldOptions(params: {
    template?: number;
    field_name?: string;
  }): Promise<TemplateFieldOption[]> {
    const query = buildQueryString(params);
    return apiFetch<TemplateFieldOption[]>(`/laboratory/template-field-options/${query}`);
  }

  /**
   * Create a field option.
   */
  async createFieldOption(data: {
    template: number;
    field_name: string;
    value: string;
    sort_order?: number;
  }): Promise<TemplateFieldOption> {
    return apiFetch<TemplateFieldOption>('/laboratory/template-field-options/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update a field option.
   */
  async updateFieldOption(id: number, data: { value: string; sort_order?: number }): Promise<TemplateFieldOption> {
    return apiFetch<TemplateFieldOption>(`/laboratory/template-field-options/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Delete a field option.
   */
  async deleteFieldOption(id: number): Promise<void> {
    await apiFetch<void>(`/laboratory/template-field-options/${id}/`, {
      method: 'DELETE',
    });
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
   * Bulk-reorder lab templates
   */
  async reorderTemplates(orders: { id: number; sort_order: number }[]): Promise<void> {
    return apiFetch<void>('/laboratory/templates/reorder/', {
      method: 'PATCH',
      body: JSON.stringify({ orders }),
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
    results_only?: boolean;
    page?: number;
    page_size?: number;
  }): Promise<{ results: LabTest[]; count: number }> {
    const query = buildQueryString({
      ...params,
      results_only: params?.results_only === false ? undefined : true,
    } as Record<string, string | number | boolean | undefined>);
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

  async getPatientTracker(search: string): Promise<{
    search: string;
    results: Array<{
      patient_name: string;
      patient_id: string;
      test_name: string;
      test_code: string;
      test_status: string;
      test_status_display: string;
      lab_number: string | null;
      order_id: string | null;
      clinic: string | null;
      screen: 'lab_orders' | 'verification' | 'completed';
      tab: string;
      screen_label: string;
      tab_label: string;
      href_screen: string;
      is_active: boolean;
    }>;
  }> {
    const query = buildQueryString({ search: search.trim() });
    return apiFetch(`/laboratory/patient-tracker/${query}`);
  }

  async getAnalyticsSummary(period: URLSearchParams | { start: string; end: string }): Promise<LabAnalyticsSummary> {
    const query =
      period instanceof URLSearchParams
        ? `?${period.toString()}`
        : buildQueryString({ start: period.start, end: period.end });
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
    const stats = await this.getOrderStats();
    return {
      pendingTests: stats.pending,
      inProgress: stats.processing,
      resultsReady: stats.results_ready,
      critical: stats.stat,
    };
  }
}

export const labService = new LabService();
export default labService;
