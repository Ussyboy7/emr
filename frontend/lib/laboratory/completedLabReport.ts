import { transformPriority } from '@/lib/services/transformers';
import {
  buildOrderedLabResultViewRows,
  deriveOverallStatus,
  type ResultStatus,
} from '@/lib/laboratory/template-utils';

export interface CompletedTestResultRow {
  parameter: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'Abnormal' | 'Critical';
  attachment?: {
    url: string;
    name: string;
  } | null;
}

/** Shape used by Laboratory Completed Tests and shared Lab Report dialog */
export interface CompletedTest {
  id: string;
  orderId: string;
  patient: { id: string; name: string; age: number | null; gender: string };
  doctor: { id: string; name: string; specialty: string };
  testName: string;
  testCode: string;
  results: CompletedTestResultRow[];
  result_file?: string | null;
  result_file_exists?: boolean;
  overallStatus: 'Normal' | 'Abnormal' | 'Critical';
  priority: 'Routine' | 'Urgent' | 'STAT';
  orderedAt: string;
  completedAt: string;
  verifiedBy: string;
  verifiedAt: string;
  submittedBy: string;
  clinic: string;
  turnaroundTime: string;
  processing_method?: 'in_house' | 'outsourced';
  outsourced_lab?: string;
}

/**
 * Map a row from GET /laboratory/verification/ or GET /laboratory/tests/ into CompletedTest.
 * Matches Laboratory → Completed Tests list transform.
 */
export function transformApiRowToCompletedTest(
  row: Record<string, unknown>,
  listMode: 'verification' | 'tests'
): CompletedTest {
  // @ts-ignore - Empty object fallback for API response processing
  const test: Record<string, unknown> = listMode === 'verification' ? (row.test_details || row.test || {}) : row;

  const orderDetails = test.order_details || {};

  const patientDetails = (orderDetails as any).patient_details;
  const patientName = (patientDetails as any)?.name ?? (orderDetails as any).patient_name ?? '';
  const patientId =
    (patientDetails as any)?.patient_id?.toString() || (patientDetails as any)?.id?.toString() || '';

  const age = (patientDetails as any)?.age ?? null;
  const gender = (patientDetails as any)?.gender || '';

  const orderId = (orderDetails as any).lab_number || (orderDetails as any).order_id || '';

  const doctorDetails = (orderDetails as any).doctor_details;
  const doctorName = (doctorDetails as any)?.name || (orderDetails as any).doctor_name || '';
  const doctorSpecialty = (doctorDetails as any)?.specialty || '';

  // order_details.clinic is the primary source; nested `order` is only present if the API expands it.
  const orderObj = typeof row.order === 'object' && row.order != null ? row.order : null;
  const clinic =
    ((orderDetails as any).clinic && String((orderDetails as any).clinic).trim()) ||
    ((orderObj as any)?.clinic && String((orderObj as any).clinic).trim()) ||
    '';

  const orderedAt = (test as any).collected_at || (test as any).lab_order?.order_date || new Date().toISOString();
  const completedAt = (test as any).processed_at || (test as any).verified_at || new Date().toISOString();
  const turnaroundMs = new Date(completedAt).getTime() - new Date(orderedAt).getTime();
  const turnaroundHours = Math.floor(turnaroundMs / 3600000);
  const turnaroundMins = Math.floor((turnaroundMs % 3600000) / 60000);
  const turnaroundTime =
    turnaroundHours > 0
      ? `${turnaroundHours}h ${turnaroundMins}m`
      : turnaroundMins > 0
        ? `${turnaroundMins}m`
        : '< 1 min';

  const rf = test.result_file;
  const resultFileExists = (test as any)?.result_file_exists !== false;
  const resultFileUrl =
    rf && typeof rf === 'string'
      ? rf.startsWith('http')
        ? rf
        : typeof window !== 'undefined'
          ? `${window.location.origin}${rf}`
          : rf
      : null;

  const normalRangeObj: Record<string, any> | undefined =
    (test as any)?.template_normal_range || (test as any)?.template?.normal_range;

  const resultPayload = (test.results || {}) as Record<string, any>;

  const toAbs = (raw: string) => {
    const s = String(raw);
    if (s.startsWith('http')) return s;
    if (typeof window === 'undefined') return s;
    return s.startsWith('/') ? `${window.location.origin}${s}` : `${window.location.origin}/${s}`;
  };

  const processedResults = buildOrderedLabResultViewRows(resultPayload, normalRangeObj, {
    resultAttachments: (test as any).result_attachments,
    resolveFileUrl: toAbs,
    attachmentDisplayName: displayNameFromLabResultFileUrl,
  });

  let overallStatus: ResultStatus;
  if (test.overall_status) {
    const statusMap: Record<string, ResultStatus> = {
      normal: 'Normal',
      abnormal: 'Abnormal',
      critical: 'Critical',
    };
    overallStatus = statusMap[String(test.overall_status).toLowerCase()] || deriveOverallStatus(processedResults);
  } else {
    overallStatus = deriveOverallStatus(processedResults);
  }

  const priority = transformPriority((test as any).lab_order?.priority || (test as any).priority || 'routine') as
    | 'Routine'
    | 'Urgent'
    | 'STAT';

  const doctorIdRaw = (test as any).lab_order?.doctor?.id ?? (doctorDetails as any)?.id;

  return {
    id: (test as any).id != null ? String((test as any).id) : '',
    orderId,
    patient: {
      id: patientId,
      name: patientName,
      age: age ?? null,
      gender,
    },
    doctor: {
      id: doctorIdRaw != null ? String(doctorIdRaw) : '',
      name: doctorName,
      specialty: doctorSpecialty,
    },
    testName: (test as any).name,
    testCode: (test as any).code,
    results: processedResults,
    overallStatus,
    priority,
    orderedAt,
    completedAt,
    verifiedBy: (test as any).verified_by_name || (test as any).verified_by || '',
    verifiedAt: (test as any).verified_at || new Date().toISOString(),
    submittedBy: (test as any).processed_by_name || (test as any).processed_by || '',
    clinic,
    turnaroundTime,
    result_file: resultFileUrl,
    result_file_exists: resultFileExists,
    processing_method: (test as any).processing_method,
    outsourced_lab: (test as any).outsourced_lab,
  };
}

/** Collapse accidental `.pdf.pdf` from storage/upload naming. */
export function sanitizeLabResultFileName(name: string): string {
  let n = name.trim();
  while (n.length > 4 && n.toLowerCase().endsWith('.pdf.pdf')) {
    n = n.slice(0, -4);
  }
  return n || 'report.pdf';
}

/** Human-readable filename from an absolute or relative result file URL. */
export function displayNameFromLabResultFileUrl(url: string): string {
  try {
    const path = url.split('?')[0];
    const seg = path.split('/').filter(Boolean).pop() || 'report.pdf';
    return sanitizeLabResultFileName(decodeURIComponent(seg));
  } catch {
    return 'report.pdf';
  }
}
