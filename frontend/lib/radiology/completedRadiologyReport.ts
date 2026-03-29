/**
 * Shared shape for Radiology → Completed Studies list and report dialog.
 */

export interface CompletedRadiologyReport {
  id: string;
  orderId: string;
  patient: { id: string; name: string; age: number | null; gender: string };
  patientName: string;
  patientId: string;
  age: number;
  gender: string;
  doctor: { id: string; name: string; specialty: string };
  studyName: string;
  studyType: string;
  category: string;
  overallStatus: string;
  priority: string;
  orderingDoctor: string;
  orderedAt: string;
  completedAt: string;
  reportedBy: string;
  verifiedBy: string;
  verifiedAt: string;
  clinic: string;
  turnaroundTime: string;
  report?: string;
  reportFile?: { name: string; url: string };
}

export function calculateRadiologyTurnaroundTime(createdAt?: string, verifiedAt?: string): string {
  if (!createdAt || !verifiedAt) return 'N/A';

  try {
    const start = new Date(createdAt);
    const end = new Date(verifiedAt);
    const diffMs = end.getTime() - start.getTime();

    if (diffMs < 0) return 'N/A';

    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffDays > 0) {
      return `${diffDays}d ${diffHours % 24}h`;
    }
    if (diffHours > 0) {
      return `${diffHours}h ${diffMins % 60}m`;
    }
    return diffMins > 0 ? `${diffMins}m` : '< 1 min';
  } catch {
    return 'N/A';
  }
}

/** Collapse accidental `.pdf.pdf` (and repeats) from storage/upload naming. */
export function sanitizeRadiologyReportFileName(name: string): string {
  let n = name.trim();
  while (n.length > 4 && n.toLowerCase().endsWith('.pdf.pdf')) {
    n = n.slice(0, -4);
  }
  return n || 'report.pdf';
}

function toAbsoluteMediaUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  if (typeof window === 'undefined') return url;
  return `${window.location.origin}${url.startsWith('/') ? url : `/${url}`}`;
}

/**
 * Map a row from radiology verification / verified reports API into CompletedRadiologyReport.
 */
export function transformApiRadiologyReportToCompleted(apiReport: any): CompletedRadiologyReport {
  const legacyFindings = String(apiReport.study_details?.findings || '').trim();
  const legacyImpression = String(apiReport.study_details?.impression || '').trim();
  const reportText = String(apiReport.study_details?.report || '').trim() || legacyFindings;
  const mergedReportText = legacyImpression
    ? `${reportText}\n\nImpression:\n${legacyImpression}`.trim()
    : reportText;

  const sd = apiReport.study_details || {};
  const rawFileUrl = sd.report_file_url as string | undefined;
  const fileUrl = rawFileUrl ? toAbsoluteMediaUrl(rawFileUrl) : undefined;
  const rf = sd.report_file;
  const rawName =
    (typeof rf === 'string' ? rf.split('/').filter(Boolean).pop() : null) || 'report.pdf';
  const fileName = sanitizeRadiologyReportFileName(rawName);

  return {
    id: apiReport.id != null ? String(apiReport.id) : '',
    orderId: apiReport.order_id || '',
    patient: {
      id: apiReport.patient_details?.id != null ? String(apiReport.patient_details.id) : '',
      name: apiReport.patient_name ?? '',
      age: apiReport.patient_details?.age ?? null,
      gender: apiReport.patient_details?.gender || 'Unknown',
    },
    patientName: apiReport.patient_name ?? '',
    patientId:
      apiReport.patient_details?.patient_id?.toString() ||
      (apiReport.patient_details?.id != null ? String(apiReport.patient_details.id) : ''),
    age: apiReport.patient_details?.age || 0,
    gender: apiReport.patient_details?.gender || 'Unknown',
    doctor: {
      id:
        apiReport.order_details?.doctor != null ? String(apiReport.order_details.doctor) : '',
      name: apiReport.order_details?.doctor_name || 'Unknown',
      specialty: apiReport.order_details?.doctor_specialty || '',
    },
    studyName: sd.procedure || 'Unknown Study',
    studyType: sd.modality || 'Unknown',
    category: sd.modality || 'X-Ray',
    overallStatus:
      apiReport.overall_status === 'critical'
        ? 'Critical'
        : apiReport.overall_status === 'abnormal'
          ? 'Abnormal'
          : 'Normal',
    priority: apiReport.priority || 'Routine',
    orderingDoctor: apiReport.order_details?.doctor_name || 'Unknown',
    orderedAt: sd.created_at || '',
    completedAt: sd.verified_at || '',
    reportedBy: sd.reported_by_name || sd.verified_by_name || 'Unknown',
    verifiedBy: sd.verified_by_name || 'Unknown',
    verifiedAt: sd.verified_at || '',
    clinic: apiReport.order_details?.clinic || '',
    turnaroundTime: calculateRadiologyTurnaroundTime(sd.created_at, sd.verified_at),
    report: mergedReportText || undefined,
    reportFile: fileUrl
      ? {
          name: fileName,
          url: fileUrl,
        }
      : undefined,
  };
}
