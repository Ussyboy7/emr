/**
 * Shared shape for Radiology → Completed Studies list and report dialog.
 */

import { getMediaUrl } from '@/lib/media-url';
import { transformPriority } from '@/lib/services/transformers';

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
  return getMediaUrl(url) ?? url;
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
  const rawFileUrl = (sd.report_file_url || sd.report_file) as string | undefined;
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
      photo: apiReportAny.patient_details?.photo || null,
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

/** Verification page study row (nested under report). */
export interface VerificationRadiologyStudy {
  id: string;
  procedure: string;
  category: string;
  bodyPart: string;
  status: 'Pending' | 'Scheduled' | 'Acquired' | 'Processing' | 'Reported' | 'Verified';
  processingMethod?: 'In-house' | 'Outsourced';
  outsourcedFacility?: string;
  imagesCount?: number;
  report?: string;
  customReports?: CompletedRadiologyReport['customReports'];
  critical?: boolean;
  reportAttachments?: Array<{ name: string; url: string }>;
  reportFile?: { name: string; type: string; uploadedAt: string; url?: string };
  reportedBy?: string;
  reportedAt?: string;
  verifiedBy?: string;
  verifiedAt?: string;
}

/** Verification page row shape. */
export interface VerificationRadiologyReport {
  id: string;
  orderId: string;
  studyId: string;
  patient: { id: string; name: string; age: number; gender: string };
  doctor: { id: string; name: string; specialty: string };
  study: VerificationRadiologyStudy;
  priority: 'Routine' | 'Urgent' | 'STAT';
  clinic: string;
  location_clinic_name?: string;
  clinicalIndication?: string;
  provisionalDiagnosis?: string;
  lmp?: string;
}

function mapVerificationStudyStatus(raw: string): VerificationRadiologyStudy['status'] {
  switch (raw) {
    case 'pending':
      return 'Pending';
    case 'scheduled':
      return 'Scheduled';
    case 'acquired':
      return 'Acquired';
    case 'processing':
      return 'Processing';
    case 'reported':
    case 'results_ready':
      return 'Reported';
    case 'verified':
      return 'Verified';
    default:
      return 'Reported';
  }
}

/** Map verification API row using the shared completed-report transform. */
export function transformApiRowToVerificationRadiologyReport(
  apiReport: Record<string, unknown>,
): VerificationRadiologyReport {
  const completed = transformApiRadiologyReportToCompleted(apiReport);
  const api = apiReport as Record<string, unknown>;
  const studyObj = (api.study_details || api.study || {}) as Record<string, unknown>;
  const orderDetails = (api.order_details || {}) as Record<string, unknown>;
  const clinicalIndication = String(orderDetails.clinical_notes || api.clinical_notes || '').trim();
  const provisionalDiagnosis = String(
    orderDetails.provisional_diagnosis || api.provisional_diagnosis || '',
  ).trim();
  const lmp = String(orderDetails.lmp || api.lmp || '').trim();
  const rf = completed.reportFile;
  const studyStatusRaw = String(studyObj.status || 'reported').toLowerCase();
  const processingMethod = studyObj.processing_method as string | undefined;

  return {
    id: completed.id,
    orderId: completed.orderId,
    studyId: studyObj.id != null ? String(studyObj.id) : '',
    patient: {
      id: completed.patient.id,
      name: completed.patient.name,
      age: completed.age ?? 0,
      gender: completed.gender,
      photo: completed.patient.photo ?? null,
    },
    doctor: completed.doctor,
    study: {
      id: studyObj.id != null ? String(studyObj.id) : '',
      procedure: completed.studyName,
      category: completed.category,
      bodyPart: String(studyObj.body_part || ''),
      status: mapVerificationStudyStatus(studyStatusRaw),
      processingMethod:
        processingMethod === 'in_house'
          ? 'In-house'
          : processingMethod === 'outsourced'
            ? 'Outsourced'
            : undefined,
      outsourcedFacility: studyObj.outsourced_facility
        ? String(studyObj.outsourced_facility)
        : undefined,
      imagesCount:
        studyObj.images_count != null ? Number(studyObj.images_count) : undefined,
      report: completed.report,
      customReports: completed.customReports,
      critical: completed.overallStatus === 'Critical' || Boolean(studyObj.critical),
      reportAttachments: completed.reportAttachments,
      reportFile: rf
        ? {
            name: rf.name,
            type: 'application/pdf',
            uploadedAt: String(studyObj.reported_at || ''),
            url: rf.url,
          }
        : undefined,
      reportedBy: completed.reportedBy !== 'Unknown' ? completed.reportedBy : undefined,
      reportedAt: studyObj.reported_at ? String(studyObj.reported_at) : undefined,
      verifiedBy: completed.verifiedBy !== 'Unknown' ? completed.verifiedBy : undefined,
      verifiedAt: completed.verifiedAt || undefined,
    },
    priority: transformPriority(String(api.priority || 'routine')) as 'Routine' | 'Urgent' | 'STAT',
    clinic: completed.clinic,
    location_clinic_name: completed.location_clinic_name,
    clinicalIndication: clinicalIndication || undefined,
    provisionalDiagnosis: provisionalDiagnosis || undefined,
    lmp: lmp || undefined,
  };
}
