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
  location_clinic_name?: string;
  report?: string;
  reportFile?: { name: string; url: string };
  reportAttachments?: Array<{ name: string; url: string }>;
  customReports?: Array<{
    id: string;
    procedure: string;
    report: string;
    recommendations?: string;
    critical?: boolean;
    attachment?: { name: string; url: string } | null;
  }>;
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
  const apiRoot = process.env.NEXT_PUBLIC_API_URL || '';
  const mediaBase = apiRoot.endsWith('/api') ? apiRoot.slice(0, -4) : apiRoot.endsWith('/api/v1') ? apiRoot.slice(0, -7) : apiRoot;
  if (url.startsWith('/media/')) return `${mediaBase}${url}`;
  return `${mediaBase}/media/${url.replace(/^\/+/, '')}`;
}

/**
 * Map a row from radiology verification / verified reports API into CompletedRadiologyReport.
 */
export function transformApiRadiologyReportToCompleted(apiReport: Record<string, unknown>): CompletedRadiologyReport {
  const apiReportAny = apiReport as any;
  const legacyFindings = String(apiReportAny.study_details?.findings || '').trim();
  const legacyImpression = String(apiReportAny.study_details?.impression || '').trim();
  const reportText = String(apiReportAny.study_details?.report || '').trim() || legacyFindings;
  const mergedReportText = legacyImpression
    ? `${reportText}\n\nImpression:\n${legacyImpression}`.trim()
    : reportText;

  const sd = apiReportAny.study_details || {};
  const rawFileUrl = sd.report_file_url as string | undefined;
  const fileUrl = rawFileUrl ? toAbsoluteMediaUrl(rawFileUrl) : undefined;
  const rf = sd.report_file;
  const rawName =
    (typeof rf === 'string' ? rf.split('/').filter(Boolean).pop() : null) || 'report.pdf';
  const fileName = sanitizeRadiologyReportFileName(rawName);
  const attachments = Array.isArray(sd.report_attachments) ? sd.report_attachments : [];
  const customReports = Array.isArray(sd.custom_reports)
    ? sd.custom_reports.map((row: any) => {
        const attachment = attachments.find((file: any) =>
          file.row_id === row.id || file.row_name?.trim().toLowerCase() === String(row.procedure || row.name || '').trim().toLowerCase()
        );
        return {
          id: String(row.id || ''),
          procedure: String(row.procedure || row.name || ''),
          report: String(row.report || ''),
          recommendations: row.recommendations ? String(row.recommendations) : undefined,
          critical: Boolean(row.critical),
          attachment: attachment?.file
            ? {
                name: String(attachment.row_name || attachment.file.split('/').filter(Boolean).pop() || 'Report file'),
                url: toAbsoluteMediaUrl(String(attachment.file)),
              }
            : null,
        };
      })
    : [];

  return {
    id: apiReportAny.id != null ? String(apiReportAny.id) : '',
    orderId: apiReportAny.order_id || '',
    patient: {
      id: apiReportAny.patient_details?.id != null ? String(apiReportAny.patient_details.id) : '',
      name: apiReportAny.patient_name ?? '',
      age: apiReportAny.patient_details?.age ?? null,
      gender: apiReportAny.patient_details?.gender || 'Unknown',
    },
    patientName: apiReportAny.patient_name ?? '',
    patientId:
      apiReportAny.patient_details?.patient_id?.toString() ||
      (apiReportAny.patient_details?.id != null ? String(apiReportAny.patient_details.id) : ''),
    age: apiReportAny.patient_details?.age || 0,
    gender: apiReportAny.patient_details?.gender || 'Unknown',
    doctor: {
      id:
        apiReportAny.order_details?.doctor != null ? String(apiReportAny.order_details.doctor) : '',
      name: apiReportAny.order_details?.doctor_name || 'Unknown',
      specialty: apiReportAny.order_details?.doctor_specialty || '',
    },
    studyName: (sd as any).procedure || 'Unknown Study',
    studyType: (sd as any).modality || 'Unknown',
    category: (sd as any).modality || 'X-Ray',
    overallStatus:
      apiReportAny.overall_status === 'critical'
        ? 'Critical'
        : apiReportAny.overall_status === 'abnormal'
          ? 'Abnormal'
          : 'Normal',
    priority: apiReportAny.priority || 'Routine',
    orderingDoctor: apiReportAny.order_details?.doctor_name || 'Unknown',
    orderedAt: (sd as any).created_at || '',
    completedAt: (sd as any).verified_at || '',
    reportedBy: (sd as any).reported_by_name || (sd as any).verified_by_name || 'Unknown',
    verifiedBy: (sd as any).verified_by_name || 'Unknown',
    verifiedAt: (sd as any).verified_at || '',
    clinic: apiReportAny.order_details?.clinic || '',
    location_clinic_name: apiReportAny.location_clinic_name || apiReportAny.study_details?.location_clinic_name || apiReportAny.order_details?.location_clinic_name || '',
    turnaroundTime: calculateRadiologyTurnaroundTime((sd as any).created_at, (sd as any).verified_at),
    report: mergedReportText || undefined,
    customReports,
    reportAttachments: attachments
      .filter((att: any) => {
        if (!att.row_id) return true;
        return !customReports.some((row: any) =>
          row.id === att.row_id || row.procedure?.trim().toLowerCase() === att.row_name?.trim().toLowerCase()
        );
      })
      .map((att: any) => ({
        name: att.row_name || att.file?.split('/').filter(Boolean).pop() || 'Additional file',
        url: toAbsoluteMediaUrl(String(att.file)),
      })),
    reportFile: fileUrl
      ? {
          name: fileName,
          url: fileUrl,
        }
      : undefined,
  };
}
