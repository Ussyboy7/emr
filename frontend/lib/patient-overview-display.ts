import {
  formatDisplayDate,
  formatDisplayTime,
  toApiDateFromInstant,
} from '@/lib/dates';
import { buildOrderedLabResultViewRows } from '@/lib/laboratory/template-utils';
import { getVisitServiceClinicsDisplay } from '@/lib/utils/clinic-utils';
import type { PatientHistoryData } from '@/lib/clinical-overview-utils';

/** Display-shaped visit row for PatientOverviewModal / Timeline. */
export function mapHistoryVisitsForOverviewDisplay(
  history: Pick<PatientHistoryData, 'visits' | 'consultations'>,
  numericPatientId: number | string,
) {
  const transformedVisits = (history.visits || []).map((visit: any) => ({
    id: visit.id.toString(),
    numericId: visit.id,
    visitId: visit.visit_id || visit.id.toString(),
    patientId: visit.patient?.toString() || String(numericPatientId),
    date: visit.date || toApiDateFromInstant(visit.created_at) || '',
    time: formatDisplayTime(visit.created_at),
    type: visit.visit_type || 'OPD',
    department: visit.department || '',
    doctor: visit.doctor_name || 'Unknown',
    diagnosis: visit.diagnosis || '',
    status: visit.status || 'completed',
    clinic: visit.clinic?.name || '',
    notes: visit.clinical_notes || '',
    source: 'visit' as const,
  }));

  let combinedVisits: any[] = [...transformedVisits];
  const consultationsList = history.consultations || [];

  if (consultationsList.length) {
    const transformedSessions = consultationsList.map((session: any) => {
      const rawDate = session.started_at || '';
      let date = '';
      let time = '';
      if (rawDate) {
        const parsed = new Date(rawDate);
        if (!Number.isNaN(parsed.getTime())) {
          date = formatDisplayDate(rawDate);
          time = formatDisplayTime(rawDate);
          if (date === '—') date = '';
        }
      }
      return {
        date,
        time,
        id: `session-${session.id}`,
        numericId: session.id,
        visitId: session.session_id || session.id.toString(),
        patientId: String(numericPatientId),
        type: 'Consultation',
        department: 'Consultation',
        doctor: session.doctor?.name || session.doctor_name || 'Unknown',
        diagnosis: session.assessment || '',
        status: session.status || 'completed',
        clinic: getVisitServiceClinicsDisplay({
          clinic: session.clinic_name,
          clinics: session.visit_clinics,
        }),
        notes: session.notes || '',
        source: 'consultation' as const,
      };
    });

    combinedVisits = [...transformedVisits, ...transformedSessions];
    combinedVisits.sort(
      (a, b) =>
        new Date(`${b.date} ${b.time}`).getTime() - new Date(`${a.date} ${a.time}`).getTime(),
    );
  }

  return combinedVisits;
}

export function mapHistoryVitalsForOverviewDisplay(vitalsList: any[]) {
  return (vitalsList || []).map((vital: any) => ({
    id: vital.id.toString(),
    date: formatDisplayDate(vital.recorded_at),
    time: formatDisplayTime(vital.recorded_at),
    bp:
      vital.blood_pressure_systolic && vital.blood_pressure_diastolic
        ? `${vital.blood_pressure_systolic}/${vital.blood_pressure_diastolic}`
        : '-',
    pulse: vital.heart_rate?.toString() || '-',
    temp: vital.temperature?.toString() || '-',
    spo2: vital.oxygen_saturation?.toString() || '-',
    weight: vital.weight?.toString() || '-',
    height: vital.height?.toString() || '-',
    bmi: vital.bmi?.toString() || '-',
    painScale:
      vital.pain_scale != null && vital.pain_scale !== '' ? String(vital.pain_scale) : '',
    bloodSugar:
      vital.blood_sugar != null && vital.blood_sugar !== '' ? String(vital.blood_sugar) : '',
    randomBloodSugar:
      vital.random_blood_sugar != null && vital.random_blood_sugar !== ''
        ? String(vital.random_blood_sugar)
        : '',
    notes: vital.notes || '',
    recordedBy:
      vital.recorded_by_name ||
      (vital.recorded_by != null ? String(vital.recorded_by) : '') ||
      'Unknown',
  }));
}

export function mapHistoryLabResultsForOverviewDisplay(labTestsList: any[]) {
  return (labTestsList || []).map((test: any) => {
    const results = test.results || {};
    const nr = test.template_normal_range || test.normal_range;
    const orderedRows = buildOrderedLabResultViewRows(results as Record<string, any>, nr);
    const formattedResults =
      orderedRows
        .map((r) => {
          const range = r.normalRange?.trim() || '';
          return `${r.parameter}: ${r.value}${r.unit ? ` ${r.unit}` : ''}${range ? ` (${range})` : ''}`;
        })
        .join(', ') || 'Pending';

    const overallStatus = test.overall_status;
    let healthStatus = test.status === 'verified' ? 'Completed' : 'Pending';
    if (overallStatus) {
      const s = String(overallStatus).toLowerCase();
      if (s === 'normal') healthStatus = 'Normal';
      else if (s === 'abnormal') healthStatus = 'Abnormal';
      else if (s === 'critical') healthStatus = 'Critical';
      else healthStatus = 'Completed';
    }

    const workflowStatus =
      test.status === 'verified'
        ? 'Verified'
        : test.status === 'results_ready'
          ? 'Results Ready'
          : 'Pending';

    const orderDetails = test.order_details || {};
    return {
      id: String(test.id),
      test: test.name || test.code || 'Unknown Test',
      category: test.sample_type || 'General',
      date: formatDisplayDate(test.verified_at || orderDetails.ordered_at || test.created_at),
      result: formattedResults,
      unit: '',
      range: '',
      status: workflowStatus,
      overallStatus: healthStatus,
      orderedBy: orderDetails.doctor_name || 'Unknown',
      verifiedBy: test.processed_by_name || test.verified_by_name || 'Pending',
      notes: test.notes || '',
      _raw: test,
    };
  });
}

export function mapHistoryImagingForOverviewDisplay(imagingOrdersList: any[]) {
  return (imagingOrdersList || []).map((item: any) => {
    const study = item.study_details || {};
    return {
      id: String(item.id),
      studyId: item.order_id ? `${item.order_id}-${study.id ?? item.id}` : `IMG-${item.id}`,
      type: study.modality || study.procedure || 'Unknown',
      description: study.body_part || study.procedure || '',
      date: formatDisplayDate(
        study.verified_at || study.reported_at || study.created_at || item.created_at,
      ),
      status: study.status || 'pending',
      orderedBy: item.order_details?.doctor_name || 'Unknown',
      result: study.report || study.findings || 'Pending',
      report: study.report || '',
      _rawOrder: item,
      _rawStudy: study,
    };
  });
}

export function mapHistoryPrescriptionsForOverviewDisplay(prescriptionsList: any[]) {
  return (prescriptionsList || []).map((rx: any) => ({
    id: rx.id.toString(),
    prescriptionId: rx.prescription_id || `RX-${rx.id}`,
    date: formatDisplayDate(rx.prescribed_at),
    doctor: rx.doctor_name || 'Unknown',
    status: rx.status || 'pending',
    diagnosis: rx.diagnosis || '',
    notes: rx.notes || '',
    medications: (rx.medications || []).map((med: any) => ({
      name: med.medication_name || '',
      dosage: med.dosage || '',
      frequency: med.frequency || '',
      duration: med.duration || '',
      quantity: med.quantity || 0,
      unit: med.unit || '',
      instructions: med.instructions || '',
      isDispensed: med.is_dispensed || false,
    })),
  }));
}

export function mapHistoryConsultationsForOverviewDisplay(consultationsList: any[]) {
  return (consultationsList || []).map((session: any) => ({
    id: session.id?.toString() || String(session.id),
    date: (() => {
      const rawDate = session.started_at || '';
      if (!rawDate) return '';
      const parsed = new Date(rawDate);
      if (Number.isNaN(parsed.getTime())) return '';
      const d = formatDisplayDate(rawDate);
      return d === '—' ? '' : d;
    })(),
    doctor: session.doctor?.name || session.doctor_name || 'Unknown',
    clinic: getVisitServiceClinicsDisplay({
      clinic: session.clinic_name,
      clinics: session.visit_clinics,
    }),
    room: session.room?.name || '',
    status: session.status || 'completed',
    notes: session.notes || '',
    diagnoses: session.diagnoses || [],
  }));
}
