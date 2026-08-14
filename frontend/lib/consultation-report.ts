/**
 * Shared consultation report: type, HTML generator, and loader.
 * Used by Patient Medical Records and Consultation History "View Report" modal.
 */
import { getOrganizationServicesHeader } from '@/lib/constants/organization';
import { formatDisplayDate, formatDisplayTime, formatDisplayDateTime } from '@/lib/dates';
import { apiFetch } from '@/lib/api-client';
import { logWarn } from './client-logger';
import { patientService, consultationService } from '@/lib/services';
import type { ApiResponse } from './types/common';
import { buildOrderedLabResultViewRows } from '@/lib/laboratory/template-utils';
import {
  enrichSessionDisplayFromWorkspaceBundle,
} from '@/lib/consultation/workspace-bundle-enrichment';
import type { SessionWorkspaceBundle } from '@/lib/services/consultation-service';

export { summarizeLabTestForConsultationReport } from '@/lib/consultation/workspace-bundle-enrichment';

// API Response interfaces for consultation report
interface PrescriptionApiResponse {
  id: number;
  patient_name?: string;
  medication_name?: string;
  medication?: any;
  medications?: any[];
  dosage?: string;
  frequency?: string;
  duration?: string;
  quantity?: number;
  prescribed_at?: string;
  created_at?: string;
}

interface LabOrderApiResponse {
  id: number;
  tests?: any[];
  test_details?: any;
  test_name?: string;
  test?: any;
  priority?: string;
  status?: string;
  order_id?: number;
  doctor_details?: any;
  doctor_name?: string;
  clinic?: any;
  order_date?: string;
}

interface RadiologyOrderApiResponse {
  id: number;
  procedure?: string;
  procedure_name?: string;
  priority?: string;
  status?: string;
  studies?: any[];
  report?: string;
  findings?: string;
  impression?: string;
}

interface PhysioOrderApiResponse {
  id: number;
  diagnosis?: string;
  chief_complaint?: string;
  priority?: string;
  status?: string;
}

// ----- Shared type (same shape as Medical Records "fullSession") -----
export interface ConsultationReportSession {
  id: number;
  patient?: number;
  patient_name?: string;
  patient_id?: string;
  patient_age?: number | string;
  patient_gender?: string;
  doctor_name?: string;
  clinic_name?: string;
  location_clinic_name?: string;
  room_name?: string;
  started_at?: string;
  ended_at?: string;
  status?: string;
  presentation_complaint?: string;
  history_of_presenting_illness?: string;
  physical_examination?: string;
  assessment?: string;
  plan?: string;
  visit?: number;
  visit_type?: string;
  /** When set, annual check-up PDF download uses this record id. */
  annual_checkup_id?: number;
  vitals?: Record<string, unknown>;
  prescriptions?: Array<{ id?: string; medication?: string; medication_name?: string; dosage?: string; frequency?: string; duration?: string; quantity?: string }>;
  labOrders?: Array<{ test?: string; priority?: string; status?: string; result?: string }>;
  radiologyOrders?: Array<{ procedure?: string; priority?: string; status?: string; result?: string }>;
  physioOrders?: Array<{ diagnosis?: string; priority?: string; status?: string }>;
  eyeOrders?: Array<{ chief_complaint?: string; diagnosis?: string; priority?: string; status?: string }>;
  diagnoses?: Array<{ id?: string; code?: string; name?: string; type?: string; notes?: string }>;
}

// ----- Formatters for HTML -----
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '';
  const formatted = formatDisplayDate(dateString);
  return formatted === '—' ? '' : formatted;
};

const formatTime = (dateString: string | undefined): string => {
  if (!dateString) return '';
  const formatted = formatDisplayTime(dateString);
  return formatted === '—' ? '' : formatted;
};

const formatPriority = (p: string | undefined): string => {
  if (p == null || p === '') return 'Routine';
  const s = String(p).toLowerCase();
  if (s === 'stat') return 'STAT';
  if (s === 'urgent') return 'Urgent';
  return String(p);
};

const vitalLabel = (key: string): string => {
  if (key === 'recordedAt' || key === 'recorded_at') return 'Recorded at';
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, (str) => str.toUpperCase());
};

const formatVitalDisplay = (key: string, value: unknown): string => {
  if (value == null || value === '') return '';
  if (key === 'recordedAt' || key === 'recorded_at' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)))
    return formatDate(String(value)) + ' ' + formatTime(String(value));
  return String(value);
};

const formatLabResult = (value: unknown, normalRange?: Record<string, any>): string => {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'object' || Array.isArray(value)) return String(value);

  const payload = value as Record<string, unknown>;
  if (!Object.keys(payload).length) return '';

  const rows = buildOrderedLabResultViewRows(payload as Record<string, any>, normalRange);
  if (!rows.length) return '';

  return rows
    .map((r) => {
      const unit = r.unit ? ` ${r.unit}` : '';
      const range = r.normalRange ? ` (${r.normalRange})` : '';
      return `${r.parameter}: ${r.value}${unit}${range}`.trim();
    })
    .join('\n');
};

const formatRadiologyResult = (value: unknown): string => {
  if (value == null || value === '') return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value !== 'object') return String(value);

  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null && v !== '');
  if (!entries.length) return '';
  return entries.map(([k, v]) => `${k}: ${String(v)}`).join('\n');
};

const formatResultWithPending = (
  result: unknown,
  status: unknown,
  doneStatuses: string[],
): string => {
  const text = result == null ? '' : String(result).trim();
  if (text) return text;

  const currentStatus = String(status ?? '').toLowerCase();
  const isDone = doneStatuses.some((s) => s.toLowerCase() === currentStatus);
  return isDone ? 'Completed' : 'Pending';
};

// ----- HTML generator (single source for Download/Print) -----
function escapeHtmlForHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function buildConsultationReportHTML(session: ConsultationReportSession): string {
  const vitals = session.vitals || {};
  const prescriptions = session.prescriptions || [];
  const labOrders = session.labOrders || [];
  const radiologyOrders = session.radiologyOrders || [];
  const physioOrders = session.physioOrders || [];
  const eyeOrders = session.eyeOrders || [];
  const diagnoses = session.diagnoses || [];

  const durationStr =
    session.ended_at && session.started_at
      ? Math.round(
          (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60),
        ) + ' min'
      : session.started_at
        ? Math.round((Date.now() - new Date(session.started_at).getTime()) / (1000 * 60)) + ' min (ongoing)'
        : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Consultation Report - Session ${session.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; font-size: 11pt; }
    .banner { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
    .banner h1 { margin: 0; font-size: 18pt; }
    .banner p { margin: 4px 0 0; font-size: 10pt; color: #444; }
    .section { margin-bottom: 18px; }
    .section h3 { font-size: 11pt; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .meta-table td { border: none; padding: 3px 8px; }
    .meta-table td:first-child, .meta-table td:nth-child(3) { font-weight: 600; white-space: nowrap; }
    .vitals-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); gap: 8px; }
    .vital-item { padding: 8px; border: 1px solid #ccc; text-align: center; }
    .footer { margin-top: 28px; text-align: center; font-size: 9pt; color: #666; border-top: 1px solid #ddd; padding-top: 12px; }
    @media print {
      html, body { height: auto !important; overflow: visible !important; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="banner">
    <h1>CONSULTATION REPORT</h1>
    <p>${escapeHtmlForHtml(getOrganizationServicesHeader())}</p>
  </div>

  <div class="section">
    <table class="meta-table">
      <tr><td>Patient Name</td><td>${escapeHtmlForHtml(session.patient_name ?? '')}</td>
          <td>Patient ID</td><td>${escapeHtmlForHtml(String(session.patient_id ?? ''))}</td></tr>
      <tr><td>Age / Gender</td><td>${escapeHtmlForHtml(
        [session.patient_age != null && session.patient_age !== '' ? `${session.patient_age} years` : '', session.patient_gender || ''].filter(Boolean).join(' / ')
      )}</td>
          <td>Doctor</td><td>${escapeHtmlForHtml(session.doctor_name ?? '')}</td></tr>
      <tr><td>Location</td><td colspan="3">${escapeHtmlForHtml(session.location_clinic_name ?? '')}</td></tr>
      <tr><td>Clinic</td><td>${escapeHtmlForHtml(session.clinic_name ?? '')}</td>
          <td>Room</td><td>${escapeHtmlForHtml(session.room_name ?? '')}</td></tr>
      ${durationStr ? `<tr><td>Duration</td><td>${escapeHtmlForHtml(durationStr)}</td><td>Status</td><td>${escapeHtmlForHtml(session.status === 'completed' ? 'Completed' : 'In Progress')}</td></tr>` : ''}
    </table>
  </div>

  ${Object.keys(vitals).length > 0 ? `
  <div class="section">
    <h3>VITAL SIGNS</h3>
    <div class="vitals-grid">
      ${Object.entries(vitals).map(([key, value]) =>
        `<div class="vital-item"><strong>${vitalLabel(key)}</strong><br>${formatVitalDisplay(key, value)}</div>`
      ).join('')}
    </div>
  </div>
  ` : ''}

  <div class="section">
    <h3>CLINICAL NOTES</h3>
    ${session.presentation_complaint ? `<p><strong>Presentation Complaint:</strong> ${escapeHtmlForHtml(session.presentation_complaint).replace(/\n/g, '<br>')}</p>` : ''}
    ${session.history_of_presenting_illness ? `<p><strong>History of Present Illness:</strong> ${escapeHtmlForHtml(session.history_of_presenting_illness).replace(/\n/g, '<br>')}</p>` : ''}
    ${session.physical_examination ? `<p><strong>Physical Examination:</strong> ${escapeHtmlForHtml(session.physical_examination).replace(/\n/g, '<br>')}</p>` : ''}
    ${session.assessment ? `<p><strong>Assessment:</strong> ${escapeHtmlForHtml(session.assessment).replace(/\n/g, '<br>')}</p>` : ''}
    ${session.plan ? `<p><strong>Treatment Plan:</strong> ${escapeHtmlForHtml(session.plan).replace(/\n/g, '<br>')}</p>` : ''}
  </div>

  ${diagnoses.length > 0 ? `
  <div class="section">
    <h3>DIAGNOSES</h3>
    <table>
      <thead><tr><th>ICD-10 Code</th><th>Diagnosis</th><th>Type</th></tr></thead>
      <tbody>
        ${diagnoses.map((dx: any) => `<tr><td>${escapeHtmlForHtml(dx.code ?? '')}</td><td>${escapeHtmlForHtml(dx.name ?? '')}${dx.notes?.trim() ? `<br><span style="font-size:10pt;color:#555">${escapeHtmlForHtml(dx.notes)}</span>` : ''}</td><td>${escapeHtmlForHtml(dx.type ?? '')}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${prescriptions.length > 0 ? `
  <div class="section">
    <h3>PRESCRIPTIONS</h3>
    <table>
      <thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Qty</th></tr></thead>
      <tbody>
        ${prescriptions.map((rx: any) => `<tr><td>${escapeHtmlForHtml((rx.medication_name ?? rx.medication) ?? '')}</td><td>${escapeHtmlForHtml(rx.dosage ?? '')}</td><td>${escapeHtmlForHtml(rx.frequency ?? '')}</td><td>${escapeHtmlForHtml(rx.duration ?? '')}</td><td style="text-align:center">${escapeHtmlForHtml(rx.quantity != null ? String(rx.quantity) : '')}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${labOrders.length > 0 ? `
  <div class="section">
    <h3>LABORATORY ORDERS</h3>
    <table>
      <thead><tr><th>Test</th><th>Priority</th><th>Status</th><th>Result</th></tr></thead>
      <tbody>
        ${labOrders.map((lab: any) => `<tr><td>${escapeHtmlForHtml(lab.test ?? '')}</td><td>${escapeHtmlForHtml(formatPriority(lab.priority))}</td><td>${escapeHtmlForHtml(lab.status ?? '')}</td><td>${(formatResultWithPending(lab.result ? formatLabResult(lab.result) : '', lab.status, ['verified', 'completed', 'results_ready']).toString().replace(/\n/g, '<br>'))}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${radiologyOrders.length > 0 ? `
  <div class="section">
    <h3>RADIOLOGY ORDERS</h3>
    <table>
      <thead><tr><th>Procedure</th><th>Priority</th><th>Status</th><th>Finding</th></tr></thead>
      <tbody>
        ${radiologyOrders.map((rad: any) => `<tr><td>${escapeHtmlForHtml(rad.procedure ?? '')}</td><td>${escapeHtmlForHtml(formatPriority(rad.priority))}</td><td>${escapeHtmlForHtml(rad.status ?? '')}</td><td>${(formatResultWithPending(rad.result, rad.status, ['verified', 'completed', 'reported']).toString().replace(/\n/g, '<br>'))}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${physioOrders.length > 0 ? `
  <div class="section">
    <h3>PHYSIOTHERAPY ORDERS</h3>
    <table>
      <thead><tr><th>Diagnosis / Chief Complaint</th><th>Priority</th><th>Status</th></tr></thead>
      <tbody>
        ${physioOrders.map((p: any) => `<tr><td>${escapeHtmlForHtml(p.diagnosis ?? '')}</td><td>${escapeHtmlForHtml(formatPriority(p.priority))}</td><td>${escapeHtmlForHtml(p.status ?? '')}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${eyeOrders.length > 0 ? `
  <div class="section">
    <h3>EYE CARE ORDERS</h3>
    <table>
      <thead><tr><th>Diagnosis / Chief Complaint</th><th>Priority</th><th>Status</th></tr></thead>
      <tbody>
        ${eyeOrders.map((e: any) => `<tr><td>${escapeHtmlForHtml(e.diagnosis || e.chief_complaint || '—')}</td><td>${escapeHtmlForHtml(formatPriority(e.priority))}</td><td>${escapeHtmlForHtml(e.status ?? '')}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="footer">
    <p>${escapeHtmlForHtml(getOrganizationServicesHeader())}</p>
    <p>Generated: ${escapeHtmlForHtml(formatDisplayDateTime(new Date()))} | Document ID: ${escapeHtmlForHtml(String(session.id))}</p>
  </div>
</body>
</html>`;
}

// ----- Loader: fetch full session data for the report (used by both Medical Records and Consultation History) -----

/** Apply workspace-bundle rows onto a report session (shared with annual check-up fallback). */
export function applyBundleToReportSession(
  session: ConsultationReportSession,
  bundle: SessionWorkspaceBundle,
  vitalsRows?: unknown[],
): ConsultationReportSession {
  const enriched = enrichSessionDisplayFromWorkspaceBundle(bundle, vitalsRows);

  session.prescriptions = enriched.prescriptions.map((rx) => ({
    ...rx,
    quantity: rx.quantity != null ? String(rx.quantity) : '',
  }));
  session.labOrders = enriched.labOrders.map((lab) => ({
    test: lab.test,
    priority: lab.priority,
    status: lab.status,
    result: lab.result,
  }));
  session.radiologyOrders = enriched.radiologyOrders.map((rad) => ({
    procedure: rad.procedure,
    priority: rad.priority,
    status: rad.status,
    result: formatRadiologyResult(rad.finding),
  }));
  session.physioOrders = enriched.physioOrders;
  session.eyeOrders = enriched.eyeOrders.map((o) => ({
    chief_complaint: o.diagnosis,
    diagnosis: o.diagnosis,
    priority: o.priority,
    status: o.status,
  }));
  session.diagnoses = enriched.diagnoses.map((d) => ({
    id: String(d.id),
    code: d.code,
    name: d.name,
    type: d.type,
    notes: d.notes,
  }));
  if (Object.keys(enriched.vitals).length > 0) {
    session.vitals = enriched.vitals;
  }

  return session;
}

export async function loadConsultationReportSession(sessionId: number, opts?: { scope?: string }): Promise<ConsultationReportSession> {
  const scopeParam = opts?.scope ? `?clinic_id=${opts.scope}` : '';
  const [session, bundle] = await Promise.all([
    apiFetch<Record<string, unknown>>(`/consultation/sessions/${sessionId}/${scopeParam}`),
    consultationService.getSessionWorkspaceBundle(sessionId, opts),
  ]);

  const patientId = session.patient as number;
  const visitId = session.visit as number | undefined;
  const visitType = session.visit_type ? String(session.visit_type) : undefined;

  const patient = patientId
    ? await apiFetch<Record<string, unknown>>(`/patients/${patientId}/`).catch(() => null)
    : null;

  let vitalsRows: unknown[] = bundle.vitals.results || [];
  if (visitId && !vitalsRows.length) {
    const vital = await patientService.resolveVital({ visit: visitId }).catch(() => null);
    vitalsRows = vital ? [vital] : [];
  }

  if (patient) {
    session.patient_name = patient.full_name ?? '';
    session.patient_id = patient.patient_id ?? String(patient.id);
    session.patient_age = patient.age ?? '';
    session.patient_gender = patient.gender ?? '';
  }

  return {
    ...applyBundleToReportSession(session as unknown as ConsultationReportSession, bundle, vitalsRows),
    visit_type: visitType,
  };
}

// Re-export formatters for use by ConsultationReportModal
export const reportFormatters = {
  formatDate,
  formatTime,
  formatPriority,
  vitalLabel,
  formatVitalDisplay,
  formatLabResult,
  formatRadiologyResult,
  formatResultWithPending,
};
