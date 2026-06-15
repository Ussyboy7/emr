/**
 * Load annual check-up report data for the shared consultation report modal.
 */
import { apiFetch } from '@/lib/api-client';
import { patientService, consultationService } from '@/lib/services';
import { visitService } from '@/lib/services/visit-service';
import type { AnnualCheckup } from '@/lib/services/annual-checkup-service';
import {
  applyBundleToReportSession,
  loadConsultationReportSession,
  type ConsultationReportSession,
} from '@/lib/consultation-report';

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

  const [patient, bundle] = await Promise.all([
    apiFetch<Record<string, unknown>>(`/patients/${patientId}/`).catch(() => null),
    visitService.getVisitWorkspaceBundle(visitId).catch(() => null),
  ]);

  if (patient) {
    base.patient_name = String(patient.full_name ?? base.patient_name ?? '');
    base.patient_id = String(patient.patient_id ?? base.patient_id ?? patientId);
    base.patient_age = (patient.age as number | string) ?? base.patient_age;
    base.patient_gender = String(patient.gender ?? base.patient_gender ?? '');
  }

  if (!bundle) {
    return base;
  }

  let vitalsRows = bundle.vitals?.results || [];
  if (!vitalsRows.length) {
    const vital = await patientService.resolveVital({ visit: visitId }).catch(() => null);
    vitalsRows = vital ? [vital] : [];
  }

  return applyBundleToReportSession(base, bundle, vitalsRows);
}
