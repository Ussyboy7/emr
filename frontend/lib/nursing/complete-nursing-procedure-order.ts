import { formatDisplayDate } from '@/lib/dates';
import { apiFetch } from '@/lib/api-client';
import { visitService } from '@/lib/services';
import { completeNursingProcedureVisit } from '@/lib/nursing/nursing-repeat-procedure';
import { formatCompletedProcedureDescription } from '@/lib/nursing/procedure-description';
import {
  getInjectionSiteOptions,
  injectionSiteNeedsLaterality,
  type InjectionPerformForm,
} from '@/lib/nursing/injection-site-options';
import type { NursingProcedureItem } from '@/lib/nursing/nursing-procedure-queue';

const DRESSING_INTERVENTION_MAP: Record<string, string> = {
  Dressing: 'dressing',
  Suturing: 'sutures',
  'Suture removal': 'suture_removal',
  'Incision and drainage': 'i_and_d',
};

export type DressingPerformForm = {
  dressingType: string;
  woundCondition: string;
  observations: string;
};

export type MedicationPerformForm = {
  site: string;
  administeredTime: string;
  notes: string;
};

function formatAdministrationNote(timeHm: string): string {
  const t = (timeHm || '').trim();
  if (!t) return '';
  return `Time of administration: ${t} on ${formatDisplayDate(new Date())}`;
}

export function validateInjectionPerformForm(
  procedure: NursingProcedureItem,
  form: InjectionPerformForm,
): string | null {
  const opts = getInjectionSiteOptions(procedure.details.route);
  if (!form.site || !opts.some((o) => o.value === form.site)) {
    return 'Select a valid injection site for the ordered route.';
  }
  if (!form.administeredTime.trim()) return 'Enter the time of administration.';
  if (injectionSiteNeedsLaterality(form.site) && !form.laterality) {
    return 'Select left or right for this injection site.';
  }
  if (form.immediateReaction === 'yes' && !form.reactionDetail.trim()) {
    return 'Describe the immediate reaction, or set immediate reaction to None.';
  }
  return null;
}

export async function completeNursingProcedureOrder(params: {
  procedure: NursingProcedureItem;
  currentUserId?: number;
  injectionForm?: InjectionPerformForm;
  dressingForm?: DressingPerformForm;
  medicationForm?: MedicationPerformForm;
  wardAdmissionNotes?: string;
  wards?: Array<{ id: number; ward_code?: string; name?: string }>;
}): Promise<void> {
  const {
    procedure,
    currentUserId,
    injectionForm,
    dressingForm,
    medicationForm,
    wardAdmissionNotes,
    wards = [],
  } = params;

  const orderId = parseInt(procedure.id, 10);
  if (!Number.isFinite(orderId)) {
    throw new Error('Invalid order ID');
  }

  if (procedure.type === 'injection' && injectionForm) {
    const err = validateInjectionPerformForm(procedure, injectionForm);
    if (err) throw new Error(err);
  }

  if (procedure.type === 'medication' && medicationForm && !medicationForm.administeredTime.trim()) {
    throw new Error('Enter the time of administration.');
  }

  const typeMap: Record<string, string> = {
    injection: 'injection',
    dressing: 'dressing',
    medication: 'medication',
    ward_admission: 'ward_admission',
  };

  let patientDbId = procedure.patientDbId;
  if (!patientDbId) {
    const patientsResponse = await apiFetch<{ results: Array<{ id: number; patient_id: string }> }>(
      `/patients/?search=${encodeURIComponent(procedure.patientId)}`,
    );
    const exact = (patientsResponse.results || []).find((p) => p.patient_id === procedure.patientId);
    if (!exact) throw new Error('Patient not found. Cannot complete procedure.');
    patientDbId = exact.id;
  }

  let description = '';
  let notes = '';

  if (procedure.type === 'injection' && injectionForm) {
    description = formatCompletedProcedureDescription(
      'injection',
      procedure.details,
      procedure.description,
    );
    notes =
      [
        formatAdministrationNote(injectionForm.administeredTime),
        injectionSiteNeedsLaterality(injectionForm.site) &&
          injectionForm.laterality &&
          `Laterality: ${injectionForm.laterality}`,
        injectionForm.site && `Site: ${injectionForm.site}`,
        injectionForm.immediateReaction === 'yes'
          ? `Immediate reaction: ${injectionForm.reactionDetail.trim()}`
          : 'Immediate reaction: none',
        injectionForm.notes && `Notes: ${injectionForm.notes}`,
      ]
        .filter(Boolean)
        .join(' | ') || injectionForm.notes;
  } else if (procedure.type === 'dressing' && dressingForm) {
    description = formatCompletedProcedureDescription(
      'dressing',
      procedure.details,
      procedure.description,
    );
    notes =
      [
        dressingForm.dressingType && `Type: ${dressingForm.dressingType}`,
        dressingForm.woundCondition && `Condition: ${dressingForm.woundCondition}`,
        dressingForm.observations && `Observations: ${dressingForm.observations}`,
      ]
        .filter(Boolean)
        .join(' | ') || dressingForm.observations;
  } else if (procedure.type === 'ward_admission') {
    const wardName = procedure.ward || 'Female Medical Ward';
    description = `Observation Admission: Admitted to ${wardName}`;
    notes = wardAdmissionNotes || 'Patient admitted to ward';

    if (!procedure.admissionId) {
      const byCode = wards.find(
        (w) => String(w.ward_code || '').toLowerCase() === String(wardName || '').toLowerCase(),
      );
      const byName = wards.find(
        (w) => String(w.name || '').toLowerCase() === String(wardName || '').toLowerCase(),
      );
      const wardId = byCode?.id ?? byName?.id ?? wards[0]?.id;
      if (!wardId) throw new Error('No active ward found for admission. Please configure wards first.');

      let visitId: number | undefined = procedure.visitId;
      if (!visitId && procedure.consultationSessionId) {
        try {
          const session = await apiFetch<{ visit?: number }>(
            `/consultation/sessions/${procedure.consultationSessionId}/`,
          );
          if (typeof session?.visit === 'number' && Number.isFinite(session.visit)) {
            visitId = session.visit;
          }
        } catch {
          /* optional */
        }
      }
      if (!visitId) {
        const activeVisit = await visitService.resolveVisit({
          patient: patientDbId,
          status: 'in_progress',
        });
        if (activeVisit?.id) visitId = activeVisit.id;
      }
      if (!visitId) {
        const latestVisit = await visitService.resolveVisit({
          patient: patientDbId,
          ordering: '-date,-time',
        });
        if (latestVisit?.id) visitId = latestVisit.id;
      }
      if (!visitId) throw new Error('Patient has no visit record. Cannot create observation admission.');

      await apiFetch('/admissions/', {
        method: 'POST',
        body: JSON.stringify({
          patient: patientDbId,
          visit: visitId,
          ward: wardId,
          admission_type: 'observation',
          admitting_doctor: null,
          admission_diagnosis:
            procedure.details.admissionDiagnosis ||
            wardAdmissionNotes ||
            `Observation admission ordered by ${procedure.orderedBy}`,
          presenting_complaint:
            procedure.details.presentingComplaint ||
            procedure.details.admissionDiagnosis ||
            wardAdmissionNotes ||
            `Observation admission ordered by ${procedure.orderedBy}`,
          admission_notes: `Admitted to ${wardName}. ${wardAdmissionNotes || ''}`.trim(),
          created_by: currentUserId,
        }),
      });
    }
  } else if (procedure.type === 'medication' && medicationForm) {
    description = formatCompletedProcedureDescription(
      'medication',
      procedure.details,
      procedure.description,
    );
    notes =
      [
        medicationForm.administeredTime && `Administered at: ${medicationForm.administeredTime}`,
        medicationForm.site && `Site: ${medicationForm.site}`,
        medicationForm.notes && `Notes: ${medicationForm.notes}`,
      ]
        .filter(Boolean)
        .join(' | ') || medicationForm.notes;
  }

  const performedSite =
    procedure.type === 'ward_admission'
      ? ''
      : procedure.type === 'injection' && injectionForm
        ? injectionSiteNeedsLaterality(injectionForm.site) && injectionForm.laterality
          ? `${injectionForm.laterality} — ${injectionForm.site}`
          : injectionForm.site
        : procedure.type === 'dressing'
          ? procedure.details.woundLocation || ''
          : medicationForm?.site || '';

  await apiFetch('/nursing/procedures/', {
    method: 'POST',
    body: JSON.stringify({
      patient: patientDbId,
      nursing_order: orderId,
      visit: procedure.visitId ?? null,
      procedure_type: typeMap[procedure.type] || 'other',
      description,
      site: performedSite,
      notes,
      performed_by: currentUserId ?? null,
      medication_name:
        procedure.type === 'injection'
          ? (procedure.details.medication || '').slice(0, 200)
          : procedure.type === 'dressing'
            ? (procedure.details.woundType || '').slice(0, 200)
            : procedure.type === 'medication'
              ? (procedure.details.medication || '').slice(0, 200)
              : '',
      dosage:
        procedure.type === 'injection' || procedure.type === 'medication'
          ? (procedure.details.dosage || '').slice(0, 200)
          : '',
      route:
        procedure.type === 'injection' || procedure.type === 'medication'
          ? (procedure.details.route || '').slice(0, 100)
          : '',
      wound_intervention:
        procedure.type === 'dressing' && dressingForm
          ? DRESSING_INTERVENTION_MAP[dressingForm.dressingType] || ''
          : '',
    }),
  });

  await apiFetch(`/nursing/orders/${orderId}/`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'completed' }),
  });

  if (procedure.createdNursingVisit && procedure.visitId) {
    try {
      await completeNursingProcedureVisit(procedure.visitId);
    } catch {
      /* non-blocking */
    }
  }
}
