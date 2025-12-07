/**
 * Laboratory API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface LabOrder {
  id: number;
  order_id: string;
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
  clinical_notes?: string;
}

export interface LabTest {
  id: number;
  name: string;
  code: string;
  sample_type: string;
  status: 'pending' | 'sample_collected' | 'processing' | 'results_ready' | 'verified';
  processing_method?: 'in_house' | 'outsourced';
  outsourced_lab?: string;
  collected_by?: string;
  collected_at?: string;
  processed_by?: string;
  processed_at?: string;
  results?: Record<string, string>;
  result_file?: { name: string; type: string; uploaded_at: string };
  template?: string;
}

export interface LabTemplate {
  id: number;
  name: string;
  code: string;
  sample_type: string;
  description?: string;
  normal_range?: Record<string, any>;
}

export interface LabResult {
  id: number;
  test: LabTest;
  order: LabOrder;
  patient: {
    id: number;
    name: string;
  };
  overall_status?: 'normal' | 'abnormal' | 'critical';
  priority?: 'low' | 'medium' | 'high';
  created_at: string;
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
    search?: string;
    page?: number;
  }): Promise<{ results: LabOrder[]; count: number; next?: string; previous?: string }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: LabOrder[]; count: number; next?: string; previous?: string }>(
      `/laboratory/orders/${query}`
    );
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
   * Collect sample for a test
   */
  async collectSample(orderId: number, testId: number, collectionMethod?: string, notes?: string): Promise<LabTest> {
    return apiFetch<LabTest>(`/laboratory/orders/${orderId}/collect_sample/`, {
      method: 'POST',
      body: JSON.stringify({ 
        test_id: testId,
        collection_method: collectionMethod,
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
    results: Record<string, string>,
    resultFile?: File,
    notes?: string
  ): Promise<LabTest> {
    if (resultFile) {
      // Upload file using FormData
      const formData = new FormData();
      formData.append('test_id', testId.toString());
      formData.append('result_file', resultFile);
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
   * Get lab templates
   */
  async getTemplates(): Promise<LabTemplate[]> {
    return apiFetch<LabTemplate[]>('/laboratory/templates/');
  }

  /**
   * Get pending verifications
   */
  async getPendingVerifications(params?: {
    patient?: string;
    overall_status?: string;
    priority?: string;
    page?: number;
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
   * Get completed/verified lab tests
   */
  async getCompletedTests(params?: {
    patient?: string;
    status?: string;
    page?: number;
  }): Promise<{ results: LabTest[]; count: number }> {
    const queryParams = { ...params, status: 'verified' };
    const query = buildQueryString(queryParams);
    return apiFetch<{ results: LabTest[]; count: number }>(`/laboratory/tests/${query}`);
  }
}

export const labService = new LabService();

