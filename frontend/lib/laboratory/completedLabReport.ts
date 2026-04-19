import { transformPriority } from '@/lib/services/transformers';

export interface CompletedTestResultRow {
  parameter: string;
  value: string;
  unit: string;
  normalRange: string;
  status: 'Normal' | 'Abnormal' | 'Critical';
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

  const orderId = (orderDetails as any).order_id || '';

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

  const resolveTemplateMeta = (parameterName: string) => {
    const normalRangeObj: Record<string, any> | undefined =
      (test as any)?.template_normal_range || (test as any)?.template?.normal_range;
    if (!normalRangeObj || typeof normalRangeObj !== 'object') return null;
    const wanted = String(parameterName || '').trim().toLowerCase();
    if (!wanted) return null;
    for (const [k, v] of Object.entries(normalRangeObj)) {
      if (String(k).trim().toLowerCase() === wanted) return { key: k, meta: v as any };
    }
    return null;
  };

  const formatTemplateRange = (meta: Record<string, unknown>) => {
    if (!meta) return '';
    if (typeof (meta as any).range === 'string' && (meta as any).range.trim()) return (meta as any).range.trim();
    const min = (meta as any).min ?? (meta as any).normalRangeMin;
    const max = (meta as any).max ?? (meta as any).normalRangeMax;
    if (min !== undefined && max !== undefined && String(min).trim() && String(max).trim()) {
      return `${min}-${max}`;
    }
    return '';
  };

  const processedResultsRaw = Object.entries(test.results || {}).map(([key, value]) => {
    const valueStr = String(value);
    const valueNum = parseFloat(valueStr);

    let unit = '';
    let normalRange = '';
    let status: 'Normal' | 'Abnormal' | 'Critical' = 'Normal';

    const templateMatch = resolveTemplateMeta(key);
    if (templateMatch) {
      unit = String((templateMatch.meta?.unit ?? '') || '');
      normalRange = formatTemplateRange(templateMatch.meta);

      const minRaw = templateMatch.meta?.min ?? templateMatch.meta?.normalRangeMin;
      const maxRaw = templateMatch.meta?.max ?? templateMatch.meta?.normalRangeMax;
      const min = minRaw !== undefined && String(minRaw).trim() !== '' ? Number(minRaw) : undefined;
      const max = maxRaw !== undefined && String(maxRaw).trim() !== '' ? Number(maxRaw) : undefined;
      if (!isNaN(valueNum) && valueStr.trim() !== '' && (min !== undefined || max !== undefined)) {
        if (min !== undefined && !isNaN(min) && valueNum < min) status = 'Abnormal';
        if (max !== undefined && !isNaN(max) && valueNum > max) status = 'Abnormal';
      }
    }

    // Hardcoded validation logic disabled (template metadata is source of truth).
    if (false && !templateMatch && !isNaN(valueNum) && valueStr.trim() !== '') {
      if (test.code === 'LFT') {
        if (key.toLowerCase().includes('alt') || key.toLowerCase().includes('sgpt')) {
          unit = 'U/L';
          normalRange = '7-56';
          if (valueNum > 1000) status = 'Critical';
          else if (valueNum < 7 || valueNum > 56) status = 'Abnormal';
          else status = 'Normal';
        } else if (key.toLowerCase().includes('ast') || key.toLowerCase().includes('sgot')) {
          unit = 'U/L';
          normalRange = '10-40';
          if (valueNum > 1000) status = 'Critical';
          else if (valueNum < 10 || valueNum > 40) status = 'Abnormal';
          else status = 'Normal';
        } else if (key.toLowerCase().includes('alp') || key.toLowerCase().includes('alkaline phosphatase')) {
          unit = 'U/L';
          normalRange = '44-147';
          if (valueNum > 1000) status = 'Critical';
          else if (valueNum < 44 || valueNum > 147) status = 'Abnormal';
          else status = 'Normal';
        } else if (key.toLowerCase().includes('albumin')) {
          unit = 'g/dL';
          normalRange = '3.5-5.0';
          if (valueNum < 2.0 || valueNum > 6.0) status = 'Critical';
          else if (valueNum < 3.5 || valueNum > 5.0) status = 'Abnormal';
          else status = 'Normal';
        } else if (key.toLowerCase().includes('bilirubin') && key.toLowerCase().includes('total')) {
          unit = 'mg/dL';
          normalRange = '0.1-1.2';
          if (valueNum > 5.0) status = 'Critical';
          else if (valueNum > 1.2) status = 'Abnormal';
          else status = 'Normal';
        }
      } else if (test.code === 'FBS') {
        if (key.toLowerCase().includes('glucose')) {
          unit = 'mg/dL';
          normalRange = '70-140';
          if (valueNum < 40 || valueNum > 600) status = 'Critical';
          else if (valueNum < 70 || valueNum > 140) status = 'Abnormal';
          else status = 'Normal';
        }
      } else if (test.code === '24HR_PROTEIN') {
        if (key.toLowerCase() === 'result') {
          unit = 'mg/day';
          normalRange = '<150';
          if (!isNaN(valueNum)) {
            if (valueNum > 1000) status = 'Critical';
            else if (valueNum > 300) status = 'Abnormal';
            else status = 'Normal';
          }
        }
      }
    }

    return {
      parameter: key,
      value: valueStr,
      unit,
      normalRange,
      status,
    };
  });

  // De-duplicate generic "Result" alias when a specific analyte row has the same value/range/unit.
  const processedResults = (() => {
    const generic = processedResultsRaw.find((r) => String(r.parameter).trim().toLowerCase() === 'result');
    if (!generic) return processedResultsRaw;
    const hasEquivalentSpecific = processedResultsRaw.some(
      (r) =>
        String(r.parameter).trim().toLowerCase() !== 'result' &&
        String(r.value).trim() === String(generic.value).trim() &&
        String(r.unit).trim().toLowerCase() === String(generic.unit).trim().toLowerCase() &&
        String(r.normalRange).trim().toLowerCase() === String(generic.normalRange).trim().toLowerCase()
    );
    if (!hasEquivalentSpecific) return processedResultsRaw;
    return processedResultsRaw.filter((r) => String(r.parameter).trim().toLowerCase() !== 'result');
  })();

  let overallStatus: 'Normal' | 'Abnormal' | 'Critical' = 'Normal';
  if (test.overall_status) {
    const statusMap: Record<string, 'Normal' | 'Abnormal' | 'Critical'> = {
      normal: 'Normal',
      abnormal: 'Abnormal',
      critical: 'Critical',
    };
    overallStatus = statusMap[String(test.overall_status).toLowerCase()] || 'Normal';
  } else {
    if (processedResults.some((r) => r.status === 'Abnormal')) overallStatus = 'Abnormal';
    else overallStatus = 'Normal';
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
