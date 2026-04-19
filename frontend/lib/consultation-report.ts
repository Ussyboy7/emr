/**
 * Shared consultation report: type, HTML generator, and loader.
 * Used by Patient Medical Records and Consultation History "View Report" modal.
 */
import { getOrganizationHeader } from '@/lib/constants/organization';
import { apiFetch } from '@/lib/api-client';
import { consultationService, physioService, patientService } from '@/lib/services';
import { logWarn } from './client-logger';
import type { ApiResponse } from './types/common';

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
  vitals?: Record<string, unknown>;
  prescriptions?: Array<{ id?: string; medication?: string; medication_name?: string; dosage?: string; frequency?: string; duration?: string; quantity?: string }>;
  labOrders?: Array<{ test?: string; priority?: string; status?: string; result?: string }>;
  radiologyOrders?: Array<{ procedure?: string; priority?: string; status?: string; result?: string }>;
  physioOrders?: Array<{ diagnosis?: string; priority?: string; status?: string }>;
  diagnoses?: Array<{ id?: string; code?: string; name?: string; type?: string; notes?: string }>;
}

// ----- Formatters for HTML -----
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString();
  } catch {
    return '';
  }
};

const formatTime = (dateString: string | undefined): string => {
  if (!dateString) return '';
  try {
    const d = new Date(dateString);
    return isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
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
  if (typeof value !== 'object') return String(value);

  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v != null && v !== '');
  if (entries.length === 0) return '';

  return entries
    .map(([key, v]) => {
      const fieldMeta = normalRange?.[key] ?? {};
      const unit = fieldMeta.unit ? ` ${fieldMeta.unit}` : '';
      let range = '';
      if (fieldMeta.range) {
        range = ` (${fieldMeta.range})`;
      } else if (fieldMeta.min != null || fieldMeta.max != null) {
        range = ` (${fieldMeta.min ?? ''}-${fieldMeta.max ?? ''})`;
      }
      return `${key}: ${String(v)}${unit}${range}`.trim();
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

/** True if API attached a result file (string URL or { url } object). */
function labTestHasResultFile(test: any): boolean {
  const rf = test?.result_file;
  if (rf == null || rf === false) return false;
  if (typeof rf === 'string') return rf.trim().length > 0;
  if (typeof rf === 'object' && rf && typeof (rf as { url?: string }).url === 'string') {
    return (rf as { url: string }).url.trim().length > 0;
  }
  return true;
}

/**
 * Text for consultation report lab tables (session viewer, PDF, shared modal).
 * Uses structured results when present; otherwise PDF-on-file or a short status label.
 */
export function summarizeLabTestForConsultationReport(test: any): string {
  const status = String(test?.status ?? '').toLowerCase();
  const norm = test?.template_normal_range || test?.template?.normal_range;
  const fromResults = formatLabResult(test?.results ?? test?.result ?? '', norm).trim();
  if (fromResults) return fromResults;
  if (labTestHasResultFile(test)) {
    return 'PDF report on file';
  }
  if (status === 'verified' || status === 'results_ready') {
    return 'Completed';
  }
  return '';
}

// ----- HTML generator (single source for Download/Print) -----
export function buildConsultationReportHTML(session: ConsultationReportSession): string {
  const vitals = session.vitals || {};
  const prescriptions = session.prescriptions || [];
  const labOrders = session.labOrders || [];
  const radiologyOrders = session.radiologyOrders || [];
  const physioOrders = session.physioOrders || [];
  const diagnoses = session.diagnoses || [];

  const durationStr =
    session.ended_at && session.started_at
      ? Math.round(
          (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60),
        ) + ' minutes'
      : session.started_at
        ? Math.round((Date.now() - new Date(session.started_at).getTime()) / (1000 * 60)) + ' minutes (ongoing)'
        : '';

  return `
<!DOCTYPE html>
<html>
<head>
  <title>Consultation Report - Session ${session.id}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; }
    .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
    .section { margin-bottom: 20px; }
    .section h3 { color: #333; border-bottom: 1px solid #ccc; padding-bottom: 5px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f5f5f5; }
    .vitals-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    .vital-item { padding: 10px; border: 1px solid #ddd; text-align: center; }
    .footer { margin-top: 30px; text-align: center; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Nigerian Ports Authority</h1>
    <h2>Medical Services Department</h2>
    <h3>Consultation Report</h3>
    <p>Session ID: ${session.id}</p>
  </div>

  <div class="section">
    <h3>PATIENT INFORMATION</h3>
    <p><strong>Name:</strong> ${session.patient_name ?? ''}</p>
    <p><strong>Patient ID:</strong> ${session.patient_id ?? ''}</p>
    <p><strong>Age:</strong> ${session.patient_age ?? ''} years</p>
    <p><strong>Gender:</strong> ${session.patient_gender ?? ''}</p>
  </div>

  <div class="section">
    <h3>CONSULTATION DETAILS</h3>
    <p><strong>Doctor:</strong> ${session.doctor_name ?? ''}</p>
    <p><strong>Clinic:</strong> ${session.clinic_name ?? ''}</p>
    <p><strong>Room:</strong> ${session.room_name ?? ''}</p>
    <p><strong>Date & Time:</strong> ${formatDate(session.started_at)} ${formatTime(session.started_at)}</p>
    <p><strong>Duration:</strong> ${durationStr}</p>
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
    ${session.presentation_complaint ? `<p><strong>Presentation Complaint:</strong> ${session.presentation_complaint.replace(/\n/g, '<br>')}</p>` : ''}
    ${session.history_of_presenting_illness ? `<p><strong>History of Present Illness:</strong> ${session.history_of_presenting_illness.replace(/\n/g, '<br>')}</p>` : ''}
    ${session.physical_examination ? `<p><strong>Physical Examination:</strong> ${session.physical_examination.replace(/\n/g, '<br>')}</p>` : ''}
    ${session.assessment ? `<p><strong>Assessment:</strong> ${session.assessment.replace(/\n/g, '<br>')}</p>` : ''}
    ${session.plan ? `<p><strong>Treatment Plan:</strong> ${session.plan.replace(/\n/g, '<br>')}</p>` : ''}
  </div>

  ${diagnoses.length > 0 ? `
  <div class="section">
    <h3>DIAGNOSES</h3>
    <table>
      <thead><tr><th>ICD-10 Code</th><th>Diagnosis</th><th>Diagnosis Type</th></tr></thead>
      <tbody>
        ${diagnoses.map((dx: any) => `<tr><td>${dx.code ?? ''}</td><td>${dx.name ?? ''}</td><td>${dx.type ?? ''}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${prescriptions.length > 0 ? `
  <div class="section">
    <h3>PRESCRIPTIONS</h3>
    <table>
      <thead><tr><th>Medication</th><th>Dose</th><th>Frequency</th><th>Duration</th><th>Quantity</th></tr></thead>
      <tbody>
        ${prescriptions.map((rx: any) => `<tr><td>${(rx.medication_name ?? rx.medication) ?? ''}</td><td>${rx.dosage ?? ''}</td><td>${rx.frequency ?? ''}</td><td>${rx.duration ?? ''}</td><td>${rx.quantity ?? ''}</td></tr>`).join('')}
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
        ${labOrders.map((lab: any) => `<tr><td>${lab.test ?? ''}</td><td>${formatPriority(lab.priority)}</td><td>${lab.status ?? ''}</td><td>${formatResultWithPending(lab.result ? formatLabResult(lab.result) : '', lab.status, ['verified', 'completed', 'results_ready']).toString().replace(/\n/g, '<br>')}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  ${radiologyOrders.length > 0 ? `
  <div class="section">
    <h3>RADIOLOGY ORDERS</h3>
    <table>
      <thead><tr><th>Procedure</th><th>Priority</th><th>Status</th><th>Result</th></tr></thead>
      <tbody>
        ${radiologyOrders.map((rad: any) => `<tr><td>${rad.procedure ?? ''}</td><td>${formatPriority(rad.priority)}</td><td>${rad.status ?? ''}</td><td>${formatResultWithPending(rad.result, rad.status, ['verified', 'completed', 'reported']).toString().replace(/\n/g, '<br>')}</td></tr>`).join('')}
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
        ${physioOrders.map((p: any) => `<tr><td>${p.diagnosis ?? ''}</td><td>${formatPriority(p.priority)}</td><td>${p.status ?? ''}</td></tr>`).join('')}
      </tbody>
    </table>
  </div>
  ` : ''}

  <div class="section">
    <h3>SESSION OUTCOME</h3>
    <p><strong>Status:</strong> ${session.status === 'completed' ? 'Completed' : (session.status ?? '')}</p>
  </div>

  <div class="footer">
    <p>Generated: ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}</p>
    <p>Document ID: ${session.id}</p>
    <p>${getOrganizationHeader()}</p>
  </div>
</body>
</html>`;
}

// ----- Loader: fetch full session data for the report (used by both Medical Records and Consultation History) -----
export async function loadConsultationReportSession(sessionId: number): Promise<ConsultationReportSession> {
  const session = (await consultationService.getSession(sessionId)) as unknown as Record<string, unknown>;

  const patientId = session.patient as number;
  if (patientId) {
    try {
      const patient = await patientService.getPatient(patientId);
      session.patient_name = patient.full_name ?? '';
      session.patient_id = patient.patient_id ?? String(patient.id);
      session.patient_age = patient.age ?? '';
      session.patient_gender = patient.gender ?? '';
    } catch (err) {
      logWarn('Could not load patient for report:', err);
    }
  }

  const visitId = session.visit as number | undefined;
  if (visitId) {
    try {
      const prescriptionsResult = await apiFetch<ApiResponse<PrescriptionApiResponse>>(`/pharmacy/prescriptions/?visit=${visitId}&page_size=100`);
      session.prescriptions = (prescriptionsResult.results || []).flatMap((p: PrescriptionApiResponse) => {
        const items = (p.medications && p.medications.length) ? p.medications : (p.medication_name || p.medication ? [p] : []);
        return items.map((m: any) => ({
          id: String(p.id) + (m.id != null ? '-' + m.id : ''),
          medication: (m.medication_name || m.medication_details?.name || m.medication?.name || p.medication_name || p.medication) ?? '',
          dosage: m.dosage || p.dosage || '',
          frequency: m.frequency || p.frequency || '',
          duration: m.duration || p.duration || '',
          quantity: m.quantity ?? p.quantity ?? '',
        }));
      });
    } catch (err) {
      logWarn('Could not load prescriptions:', err);
      session.prescriptions = [];
    }

    try {
      const labOrders = await apiFetch<{ results: any[] }>(`/laboratory/orders/?visit=${visitId}&page_size=100`);
      const orderRows = labOrders.results || [];
      const testResponses = await Promise.all(
        orderRows.map((order: any) =>
          apiFetch<{ results: any[] }>(`/laboratory/tests/?order=${order.id}&page_size=200`).catch(() => ({ results: [] }))
        )
      );

      session.labOrders = orderRows.flatMap((order: any, idx: number) => {
        const tests = testResponses[idx]?.results || [];
        if (!tests.length) {
          // Fallback to nested tests from order if tests endpoint returns nothing.
          const nestedTests = order.tests || [];
          return nestedTests.map((t: any) => ({
            test: (t.name || t.test_name || t.template_name || '').trim(),
            priority: order.priority ?? '',
            status: t.status ?? order.status ?? '',
            result: summarizeLabTestForConsultationReport(t),
          }));
        }

        return tests.map((t: any) => ({
          test: (t.name || t.test_name || t.template_name || '').trim(),
          priority: order.priority ?? '',
          status: t.status ?? order.status ?? '',
          result: summarizeLabTestForConsultationReport(t),
        }));
      });
    } catch (err) {
      logWarn('Could not load lab orders:', err);
      session.labOrders = [];
    }

    try {
      const radiologyOrders = await apiFetch<{ results: any[] }>(`/radiology/orders/?visit=${visitId}&page_size=100`);
      session.radiologyOrders = (radiologyOrders.results || []).flatMap((order: any) => {
        const studies = order.studies || [];
        if (studies.length) {
          return studies.map((s: any) => ({
            procedure: (s.procedure ?? order.procedure_name ?? order.procedure ?? '').toString().trim(),
            priority: order.priority ?? '',
            status: s.status ?? order.status ?? '',
            result: formatRadiologyResult(
              s.report ?? s.findings ?? s.impression ?? s.results ?? ''
            ),
          }));
        }
        const proc = (order.procedure_name ?? order.procedure ?? '').toString().trim();
        if (!proc) return [];
        return [{
          procedure: proc,
          priority: order.priority ?? '',
          status: order.status ?? '',
          result: formatRadiologyResult(order.report ?? order.findings ?? order.impression ?? ''),
        }];
      });
    } catch (err) {
      logWarn('Could not load radiology orders:', err);
      session.radiologyOrders = [];
    }

    try {
      const vitals = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visitId}&page_size=1`);
      if (vitals.results && vitals.results.length > 0) {
        const v = vitals.results[0];
        session.vitals = {
          temperature: v.temperature || '',
          bloodPressure: v.blood_pressure_systolic && v.blood_pressure_diastolic
            ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}`
            : '',
          heartRate: v.heart_rate || '',
          respiratoryRate: v.respiratory_rate || '',
          oxygenSaturation: v.oxygen_saturation || '',
          weight: v.weight || '',
          height: v.height || '',
          recordedAt: v.recorded_at || '',
        };
      }
    } catch (err) {
      logWarn('Could not load vitals:', err);
    }
  } else {
    session.prescriptions = [];
    session.labOrders = [];
    session.radiologyOrders = [];
  }

  try {
    const physioOrders = await physioService.getOrders({
      consultation_session: sessionId,
      patient: session.patient != null ? String(session.patient) : undefined,
      page_size: 100,
    });
    session.physioOrders = (physioOrders.results || []).map((o: any) => ({
      diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
      priority: o.priority ?? '',
      status: o.status ?? '',
    }));
  } catch (err) {
    logWarn('Could not load physio orders:', err);
    session.physioOrders = [];
  }

  try {
    const diagnosesResult = await consultationService.getDiagnoses({ session: sessionId, page_size: 100 });
    session.diagnoses = (diagnosesResult.results || []).map((d: any) => ({
      id: String(d.id),
      code: d.icd10_code_details?.code ?? '',
      name: (d.icd10_code_details?.description || d.diagnosis_text) ?? '',
      type: d.certainty === 'confirmed' ? 'Primary' : d.certainty === 'probable' ? 'Secondary' : (d.certainty ?? ''),
      notes: d.notes || d.diagnosis_text || '',
    }));
  } catch (err) {
    logWarn('Could not load diagnoses:', err);
    session.diagnoses = [];
  }

  return session as unknown as ConsultationReportSession;
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
