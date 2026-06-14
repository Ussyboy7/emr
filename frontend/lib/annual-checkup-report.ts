/**
 * Load annual check-up report data for the shared consultation report modal.
 */
import { apiFetch } from '@/lib/api-client';
import { consultationService } from '@/lib/services/consultation-service';
import { visitService } from '@/lib/services/visit-service';
import type { AnnualCheckup } from '@/lib/services/annual-checkup-service';
import {
  loadConsultationReportSession,
  summarizeLabTestForConsultationReport,
  type ConsultationReportSession,
} from '@/lib/consultation-report';

async function enrichVisitScopedSession(
  session: ConsultationReportSession,
  visitId: number,
  patientId: number,
  sessionId?: number
): Promise<ConsultationReportSession> {
  if (sessionId) {
    const [patient, bundle] = await Promise.all([
      apiFetch<Record<string, unknown>>(`/patients/${patientId}/`).catch(() => null),
      consultationService.getSessionWorkspaceBundle(sessionId),
    ]);
    if (patient) {
      session.patient_name = String(patient.full_name ?? session.patient_name ?? '');
      session.patient_id = String(patient.patient_id ?? session.patient_id ?? patientId);
      session.patient_age = (patient.age as number | string) ?? session.patient_age;
      session.patient_gender = String(patient.gender ?? session.patient_gender ?? '');
    }
    const labOrders = bundle.lab_orders;
    const radiologyOrders = bundle.radiology_orders;
    const vitals = bundle.vitals;
    const physioOrders = bundle.physio_orders;
    const eyeOrdersResult = bundle.eye_orders;
    return applyVisitScopedOrders(session, labOrders, radiologyOrders, vitals, physioOrders, eyeOrdersResult);
  }

  const [patient, bundle] = await Promise.all([
    apiFetch<Record<string, unknown>>(`/patients/${patientId}/`).catch(() => null),
    visitService.getVisitWorkspaceBundle(visitId).catch(() => null),
  ]);

  if (patient) {
    session.patient_name = String(patient.full_name ?? session.patient_name ?? '');
    session.patient_id = String(patient.patient_id ?? session.patient_id ?? patientId);
    session.patient_age = (patient.age as number | string) ?? session.patient_age;
    session.patient_gender = String(patient.gender ?? session.patient_gender ?? '');
  }
  if (!bundle) {
    return session;
  }

  const labOrders = bundle.lab_orders;
  const radiologyOrders = bundle.radiology_orders;
  const vitals = bundle.vitals;
  const physioOrders = bundle.physio_orders;
  const eyeOrdersResult = bundle.eye_orders;

  return applyVisitScopedOrders(session, labOrders, radiologyOrders, vitals, physioOrders, eyeOrdersResult);
}

function applyVisitScopedOrders(
  session: ConsultationReportSession,
  labOrders: { results: any[] },
  radiologyOrders: { results: any[] },
  vitals: { results: any[] },
  physioOrders: { results: any[] },
  eyeOrdersResult: { results: any[] },
): ConsultationReportSession {
  const labOrderRows = labOrders.results || [];
  session.labOrders = labOrderRows.flatMap((order: any) => {
    const tests = order.tests || [];
    if (!tests.length) return [];
    return tests.map((t: any) => ({
      test: (t.name || t.test_name || t.template_name || '').trim(),
      priority: order.priority ?? '',
      status: t.status ?? order.status ?? '',
      result: summarizeLabTestForConsultationReport(t),
    }));
  });

  session.radiologyOrders = (radiologyOrders.results || []).flatMap((order: any) => {
    const studies = order.studies || [];
    if (studies.length) {
      return studies.map((s: any) => ({
        procedure: (s.procedure ?? order.procedure_name ?? order.procedure ?? '').toString().trim(),
        priority: order.priority ?? '',
        status: s.status ?? order.status ?? '',
        result: String(s.report ?? s.findings ?? s.impression ?? s.results ?? '').trim(),
      }));
    }
    const proc = (order.procedure_name ?? order.procedure ?? '').toString().trim();
    if (!proc) return [];
    return [
      {
        procedure: proc,
        priority: order.priority ?? '',
        status: order.status ?? '',
        result: String(order.report ?? order.findings ?? order.impression ?? '').trim(),
      },
    ];
  });

  const vitalsResults = vitals.results || [];
  if (vitalsResults.length > 0) {
    const v = vitalsResults[0];
    session.vitals = {
      temperature: v.temperature || '',
      bloodPressure:
        v.blood_pressure_systolic && v.blood_pressure_diastolic
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

  session.physioOrders = (physioOrders.results || []).map((o: any) => ({
    diagnosis: (o.diagnosis ?? o.chief_complaint ?? '').toString().trim(),
    priority: o.priority ?? '',
    status: o.status ?? '',
  }));

  session.eyeOrders = (eyeOrdersResult.results || []).map((o: any) => ({
    chief_complaint: o.chief_complaint ?? '',
    diagnosis: o.diagnosis ?? '',
    priority: o.priority ?? '',
    status: o.status ?? '',
  }));

  return session;
}

/** Load full report payload for an annual check-up (reuses consultation report modal). */
export async function loadAnnualCheckupReportSession(
  checkup: AnnualCheckup
): Promise<ConsultationReportSession> {
  const visitId = checkup.visit;
  const patientId = checkup.patient;

  try {
    const session = await consultationService.resolveSessionForVisit({
      visit: visitId,
      patient: patientId,
    });
    if (session?.id) {
      const loaded = await loadConsultationReportSession(session.id);
      return {
        ...loaded,
        visit_type: 'annual_checkup',
        visit: visitId,
        annual_checkup_id: checkup.id,
        doctor_name: loaded.doctor_name || checkup.signed_off_by_name || undefined,
      };
    }
  } catch {
    // fall through to visit-scoped load
  }

  const base: ConsultationReportSession = {
    id: checkup.id,
    patient: patientId,
    patient_name: checkup.patient_name,
    patient_id: checkup.patient_id,
    visit: visitId,
    visit_type: 'annual_checkup',
    annual_checkup_id: checkup.id,
    doctor_name: checkup.signed_off_by_name || undefined,
    started_at: checkup.visit_date,
    ended_at: checkup.signed_off_at || undefined,
    status: checkup.status === 'completed' ? 'completed' : 'in_progress',
    assessment: checkup.fitness_outcome_display || undefined,
    plan: checkup.outcome_notes || undefined,
  };

  return enrichVisitScopedSession(base, visitId, patientId);
}
