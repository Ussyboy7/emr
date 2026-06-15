import {
  formatDisplayTime,
  toApiDateFromInstant,
} from '@/lib/dates';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import type { PatientHistoryData } from '@/lib/clinical-overview-utils';
import { mapClinicalOverviewToPatientHistory } from '@/lib/clinical-overview-utils';
import {
  consultationService,
  patientService,
  visitService,
  type ConsultationSession,
} from '@/lib/services';
import { getVisitServiceClinicsDisplay } from '@/lib/utils/clinic-utils';
import type { LucideIcon } from 'lucide-react';
import {
  CheckCircle2,
  ClipboardList,
  Heart,
  Pill,
  ScanLine,
  Stethoscope,
  TestTube,
} from 'lucide-react';

export interface VisitJourneyRawVisit {
  id: number;
  visit_id?: string;
  patient: number;
  date?: string;
  time?: string;
  visit_type?: string;
  clinic?: string;
  clinics?: string[];
  location_clinic_name?: string;
  doctor_name?: string;
  clinical_notes?: string;
  status?: string;
  created_at?: string;
  updated_at?: string;
  ended_at?: string;
}

export interface VisitJourneyDisplayVisit {
  id: string;
  numericId?: number;
  patientId: string;
  date: string;
  time: string;
  type: string;
  department: string;
  location_clinic_name?: string;
  doctor: string;
  status: string;
  notes?: string;
}

export interface VisitJourneyPatient {
  id: string;
  name: string;
}

export type VisitJourneyEventStatus = 'completed' | 'in_progress' | 'pending';

export interface VisitJourneyEvent {
  id: string;
  step: number;
  title: string;
  description: string;
  module: string;
  location?: string;
  status: VisitJourneyEventStatus;
  timestamp?: string;
  staff?: string;
  icon: LucideIcon;
  color: string;
  details?: unknown;
}

type TimestampedRecord = {
  visit?: number;
  ordered_at?: string;
  prescribed_at?: string;
  started_at?: string;
};

type LabOrderRecord = TimestampedRecord & {
  tests?: Array<{
    status?: string;
    verified_at?: string;
    processed_at?: string;
    updated_at?: string;
    verified_by?: string;
    processed_by?: string;
  }>;
  doctor_name?: string;
  doctor?: { name?: string };
};

type PrescriptionRecord = TimestampedRecord & {
  items?: Array<{ status?: string; dispensed_at?: string; updated_at?: string; dispensed_by?: string }>;
  medications?: Array<{ status?: string; dispensed_at?: string; updated_at?: string; dispensed_by?: string }>;
  doctor_name?: string;
  doctor?: { name?: string };
};

type RadiologyOrderRecord = TimestampedRecord & {
  studies?: Array<{
    status?: string;
    reported_at?: string;
    updated_at?: string;
    reported_by?: string;
  }>;
  doctor_name?: string;
  doctor?: { name?: string };
};

type VitalRecord = {
  date?: string;
  recorded_at?: string;
  blood_pressure_systolic?: number | string;
  blood_pressure_diastolic?: number | string;
  temperature?: number | string;
  recorded_by_name?: string;
};

function doctorName(record: { doctor_name?: string; doctor?: { name?: string } }): string | undefined {
  return record.doctor_name || record.doctor?.name;
}

function matchesVisitScope(
  record: TimestampedRecord,
  rawVisit: VisitJourneyRawVisit,
  isConsultationSession: boolean,
  dateField: 'ordered_at' | 'prescribed_at' | 'started_at',
): boolean {
  if (isConsultationSession) {
    const iso = record[dateField] || record.started_at;
    const recordDate = iso ? toApiDateFromInstant(iso) : '';
    return recordDate === rawVisit.date;
  }
  return record.visit === rawVisit.id;
}

function filterForVisit<T extends TimestampedRecord>(
  records: T[],
  rawVisit: VisitJourneyRawVisit,
  isConsultationSession: boolean,
  dateField: 'ordered_at' | 'prescribed_at' | 'started_at',
): T[] {
  return records.filter((record) => matchesVisitScope(record, rawVisit, isConsultationSession, dateField));
}

export function buildVisitJourneyEvents(input: {
  rawVisit: VisitJourneyRawVisit;
  history: PatientHistoryData;
  radiologyOrders?: RadiologyOrderRecord[];
  sessions: ConsultationSession[];
  isConsultationSession: boolean;
}): VisitJourneyEvent[] {
  const { rawVisit, history, radiologyOrders = [], sessions, isConsultationSession } = input;
  const journeyEvents: VisitJourneyEvent[] = [];
  let step = 1;

  journeyEvents.push({
    id: 'visit-created',
    step: step++,
    title: 'Visit Created',
    description: `Visit ${rawVisit.visit_id || rawVisit.id} created`,
    module: 'Medical Records',
    location: 'Reception',
    status: 'completed',
    timestamp: rawVisit.created_at || rawVisit.date,
    icon: ClipboardList,
    color: 'bg-blue-500',
  });

  if (rawVisit.status === 'completed' || rawVisit.status === 'in_progress') {
    journeyEvents.push({
      id: 'sent-nursing',
      step: step++,
      title: 'Sent to Nursing Pool',
      description: 'Patient forwarded to nursing for vitals',
      module: 'Nursing',
      location: 'Nursing Pool',
      status: 'completed',
      timestamp: rawVisit.updated_at,
      icon: Heart,
      color: 'bg-pink-500',
    });
  }

  const visitVitals = (history.vitals as VitalRecord[]).filter((v) => {
    const vitalDate = v.date || (v.recorded_at ? toApiDateFromInstant(v.recorded_at) : '');
    return vitalDate === rawVisit.date;
  });
  if (visitVitals.length > 0) {
    const latestVitals = visitVitals[visitVitals.length - 1];
    const bp =
      latestVitals.blood_pressure_systolic && latestVitals.blood_pressure_diastolic
        ? `${latestVitals.blood_pressure_systolic}/${latestVitals.blood_pressure_diastolic}`
        : '-';
    const temp = latestVitals.temperature || '-';
    journeyEvents.push({
      id: 'vitals-recorded',
      step: step++,
      title: 'Vitals Recorded',
      description: `BP: ${bp} | Temp: ${temp}°C`,
      module: 'Nursing',
      location: 'Nursing Pool',
      status: 'completed',
      timestamp: latestVitals.recorded_at,
      staff: latestVitals.recorded_by_name || 'Nurse',
      icon: Heart,
      color: 'bg-red-500',
    });
  }

  const visitSessions = sessions.filter((s) => {
    if (isConsultationSession) {
      return s.id === rawVisit.id;
    }
    const sessionDate = s.started_at ? toApiDateFromInstant(s.started_at) : '';
    return sessionDate === rawVisit.date || s.visit === rawVisit.id;
  });
  if (visitSessions.length > 0) {
    const session = visitSessions[0];
    journeyEvents.push({
      id: 'consultation-started',
      step: step++,
      title: 'Consultation Started',
      description: 'Consultation session initiated',
      module: 'Consultation',
      location: session.room_name || undefined,
      status: 'completed',
      timestamp: session.started_at,
      staff: session.doctor_name,
      icon: Stethoscope,
      color: 'bg-purple-500',
      details: session,
    });

    if (session.status === 'completed' && session.ended_at) {
      journeyEvents.push({
        id: 'consultation-completed',
        step: step++,
        title: 'Consultation Completed',
        description: 'Consultation session ended',
        module: 'Consultation',
        location: session.room_name || undefined,
        status: 'completed',
        timestamp: session.ended_at,
        staff: session.doctor_name,
        icon: CheckCircle2,
        color: 'bg-emerald-500',
        details: session,
      });
    }
  }

  const visitLabOrders = filterForVisit(
    history.labResults as LabOrderRecord[],
    rawVisit,
    isConsultationSession,
    'ordered_at',
  );
  if (visitLabOrders.length > 0) {
    const testCount = visitLabOrders.reduce(
      (count, order) => count + (order.tests?.length || 0),
      0,
    );
    journeyEvents.push({
      id: 'lab-orders',
      step: step++,
      title: 'Lab Tests Ordered',
      description: `${testCount} test${testCount !== 1 ? 's' : ''} ordered`,
      module: 'Laboratory',
      location: 'Laboratory',
      status: 'completed',
      timestamp: visitLabOrders[0].ordered_at,
      staff: doctorName(visitLabOrders[0]),
      icon: TestTube,
      color: 'bg-amber-500',
      details: visitLabOrders,
    });

    const completedTests = visitLabOrders.flatMap((order) =>
      (order.tests || []).filter(
        (test) => test.status === 'results_ready' || test.status === 'verified',
      ),
    );
    if (completedTests.length > 0) {
      const latestResult = completedTests.reduce<{
        timestamp?: Date;
        verified_at?: string;
        processed_at?: string;
        verified_by?: string;
        processed_by?: string;
      }>((latest, test) => {
        const testTime = new Date(test.verified_at || test.processed_at || test.updated_at || 0);
        const latestTime = latest.timestamp ? new Date(latest.timestamp) : new Date('1970-01-01');
        return testTime > latestTime ? { ...test, timestamp: testTime } : latest;
      }, {});

      journeyEvents.push({
        id: 'lab-results-completed',
        step: step++,
        title: 'Lab Results Completed',
        description: `${completedTests.length} test${completedTests.length !== 1 ? 's' : ''} completed`,
        module: 'Laboratory',
        location: 'Laboratory',
        status: 'completed',
        timestamp:
          latestResult.timestamp?.toISOString() ||
          latestResult.verified_at ||
          latestResult.processed_at,
        staff: latestResult.verified_by || latestResult.processed_by || 'Lab Technician',
        icon: TestTube,
        color: 'bg-blue-500',
        details: completedTests,
      });
    }
  }

  const visitPrescriptions = filterForVisit(
    history.prescriptions as PrescriptionRecord[],
    rawVisit,
    isConsultationSession,
    'prescribed_at',
  );
  if (visitPrescriptions.length > 0) {
    const itemCount = visitPrescriptions.reduce(
      (count, rx) => count + (rx.items?.length || rx.medications?.length || 0),
      0,
    );
    journeyEvents.push({
      id: 'prescriptions',
      step: step++,
      title: 'Prescriptions Created',
      description: `${itemCount} medication${itemCount !== 1 ? 's' : ''} prescribed`,
      module: 'Pharmacy',
      location: 'Pharmacy',
      status: 'completed',
      timestamp: visitPrescriptions[0].prescribed_at,
      staff: doctorName(visitPrescriptions[0]),
      icon: Pill,
      color: 'bg-green-500',
      details: visitPrescriptions,
    });

    const dispensedItems = visitPrescriptions.flatMap((rx) =>
      (rx.items || rx.medications || []).filter(
        (item) => item.status === 'dispensed' || Boolean(item.dispensed_at),
      ),
    );
    if (dispensedItems.length > 0) {
      const latestDispense = dispensedItems.reduce<{
        timestamp?: Date;
        dispensed_at?: string;
        updated_at?: string;
        dispensed_by?: string;
      }>((latest, item) => {
        const dispenseTime = new Date(item.dispensed_at || item.updated_at || 0);
        const latestTime = latest.timestamp ? new Date(latest.timestamp) : new Date('1970-01-01');
        return dispenseTime > latestTime ? { ...item, timestamp: dispenseTime } : latest;
      }, {});

      journeyEvents.push({
        id: 'prescriptions-dispensed',
        step: step++,
        title: 'Prescriptions Dispensed',
        description: `${dispensedItems.length} medication${dispensedItems.length !== 1 ? 's' : ''} dispensed`,
        module: 'Pharmacy',
        location: 'Pharmacy',
        status: 'completed',
        timestamp:
          latestDispense.timestamp?.toISOString() ||
          latestDispense.dispensed_at ||
          latestDispense.updated_at,
        staff: latestDispense.dispensed_by || 'Pharmacist',
        icon: Pill,
        color: 'bg-emerald-500',
        details: dispensedItems,
      });
    }
  }

  const visitRadiologyOrders = filterForVisit(
    radiologyOrders,
    rawVisit,
    isConsultationSession,
    'ordered_at',
  );
  if (visitRadiologyOrders.length > 0) {
    const studyCount = visitRadiologyOrders.reduce(
      (count, order) => count + (order.studies?.length || 0),
      0,
    );
    journeyEvents.push({
      id: 'radiology-orders',
      step: step++,
      title: 'Radiology Studies Ordered',
      description: `${studyCount} stud${studyCount !== 1 ? 'ies' : 'y'} ordered`,
      module: 'Radiology',
      location: 'Radiology',
      status: 'completed',
      timestamp: visitRadiologyOrders[0].ordered_at,
      staff: doctorName(visitRadiologyOrders[0]),
      icon: ScanLine,
      color: 'bg-indigo-500',
      details: visitRadiologyOrders,
    });

    const completedStudies = visitRadiologyOrders.flatMap((order) =>
      (order.studies || []).filter(
        (study) => study.status === 'reported' || study.status === 'completed',
      ),
    );
    if (completedStudies.length > 0) {
      const latestReport = completedStudies.reduce<{
        timestamp?: Date;
        reported_at?: string;
        updated_at?: string;
        reported_by?: string;
      }>((latest, study) => {
        const studyTime = new Date(study.reported_at || study.updated_at || 0);
        const latestTime = latest.timestamp ? new Date(latest.timestamp) : new Date('1970-01-01');
        return studyTime > latestTime ? { ...study, timestamp: studyTime } : latest;
      }, {});

      journeyEvents.push({
        id: 'radiology-reports-completed',
        step: step++,
        title: 'Radiology Reports Completed',
        description: `${completedStudies.length} report${completedStudies.length !== 1 ? 's' : ''} completed`,
        module: 'Radiology',
        location: 'Radiology',
        status: 'completed',
        timestamp:
          latestReport.timestamp?.toISOString() ||
          latestReport.reported_at ||
          latestReport.updated_at,
        staff: latestReport.reported_by || 'Radiologist',
        icon: ScanLine,
        color: 'bg-teal-500',
        details: completedStudies,
      });
    }
  }

  if (rawVisit.status === 'completed') {
    journeyEvents.push({
      id: 'visit-completed',
      step: step++,
      title: 'Visit Completed',
      description: 'Patient visit concluded',
      module: 'Medical Records',
      location:
        getVisitServiceClinicsDisplay({
          clinic: rawVisit.clinic,
          clinics: rawVisit.clinics,
        }) || undefined,
      status: 'completed',
      timestamp: rawVisit.updated_at,
      icon: CheckCircle2,
      color: 'bg-emerald-500',
    });
  }

  if (rawVisit.status !== 'completed' && journeyEvents.length > 0) {
    const lastEvent = journeyEvents[journeyEvents.length - 1];
    if (lastEvent.id === 'visit-created') {
      journeyEvents.push({
        id: 'next-nursing',
        step: step++,
        title: 'Awaiting Nursing',
        description: 'Waiting to be sent to nursing pool',
        module: 'Nursing',
        status: 'pending',
        icon: Heart,
        color: 'bg-gray-400',
      });
    } else if (lastEvent.id === 'vitals-recorded') {
      journeyEvents.push({
        id: 'next-consultation',
        step: step++,
        title: 'Awaiting Consultation',
        description: 'Waiting for consultation',
        module: 'Consultation',
        status: 'pending',
        icon: Stethoscope,
        color: 'bg-gray-400',
      });
    }
  }

  return journeyEvents;
}

export function toVisitJourneyDisplayVisit(rawVisit: VisitJourneyRawVisit): VisitJourneyDisplayVisit {
  return {
    id: rawVisit.visit_id || String(rawVisit.id),
    numericId: rawVisit.id,
    patientId: String(rawVisit.patient),
    date: rawVisit.date || '',
    time: rawVisit.time || '',
    type: rawVisit.visit_type || 'consultation',
    department: rawVisit.clinic || '',
    location_clinic_name: rawVisit.location_clinic_name,
    doctor: rawVisit.doctor_name || 'Doctor',
    status: rawVisit.status || 'scheduled',
    notes: rawVisit.clinical_notes || '',
  };
}

export async function resolveVisitJourneyRawVisit(
  idToUse: string | number,
): Promise<{ rawVisit: VisitJourneyRawVisit; isConsultationSession: boolean }> {
  let isConsultationSession = false;

  if (typeof idToUse === 'string' && idToUse.startsWith('session-')) {
    const sessionId = idToUse.replace('session-', '');
    const numericSessionId = Number(sessionId);
    if (!Number.isNaN(numericSessionId) && numericSessionId > 0) {
      const sessionData = await consultationService.getSession(numericSessionId);
      isConsultationSession = true;
      return {
        isConsultationSession,
        rawVisit: {
          id: sessionData.id,
          visit_id: `session-${sessionData.id}`,
          patient: sessionData.patient,
          date: toApiDateFromInstant(sessionData.started_at),
          time: formatDisplayTime(sessionData.started_at),
          visit_type: 'Consultation',
          clinic: getVisitServiceClinicsDisplay({
            clinic: sessionData.clinic_name,
            clinics: (sessionData as ConsultationSession & { visit_clinics?: string[] }).visit_clinics,
          }),
          doctor_name:
            sessionData.doctor_name ||
            (typeof sessionData.doctor === 'object' && sessionData.doctor
              ? (sessionData.doctor as { name?: string }).name
              : undefined) ||
            '',
          clinical_notes: sessionData.notes || '',
          status: sessionData.status,
          created_at: sessionData.started_at,
          ended_at: sessionData.ended_at,
        },
      };
    }
  }

  const numericId = Number(idToUse);
  let rawVisit: VisitJourneyRawVisit;
  if (!Number.isNaN(numericId) && numericId > 0) {
    rawVisit = (await visitService.getVisit(numericId)) as VisitJourneyRawVisit;
  } else {
    const visitsResult = await visitService.getVisits({
      search: String(idToUse),
      page_size: MAX_LIST_PAGE_SIZE,
    });
    const foundVisit = visitsResult.results.find(
      (v) => (v.visit_id || String(v.id)) === idToUse,
    );
    if (!foundVisit) {
      throw new Error(`Visit with ID "${idToUse}" not found`);
    }
    rawVisit = (await visitService.getVisit(foundVisit.id)) as VisitJourneyRawVisit;
  }

  return { rawVisit, isConsultationSession };
}

export async function loadVisitJourneyData(idToUse: string | number): Promise<{
  visit: VisitJourneyDisplayVisit;
  patient: VisitJourneyPatient | null;
  journey: VisitJourneyEvent[];
}> {
  const { rawVisit, isConsultationSession } = await resolveVisitJourneyRawVisit(idToUse);

  const [patientDataResult, overview, sessionsResult] = await Promise.all([
    patientService.getPatient(rawVisit.patient).catch(() => null),
    patientService.getClinicalOverview(rawVisit.patient).catch(() => null),
    consultationService
      .getSessions({ patient: rawVisit.patient })
      .catch(() => ({ results: [] as ConsultationSession[] })),
  ]);

  const history: PatientHistoryData = overview
    ? mapClinicalOverviewToPatientHistory(overview)
    : {
        consultations: [],
        labResults: [],
        imagingOrders: [],
        prescriptions: [],
        vitals: [],
        physioOrders: [],
        eyeOrders: [],
        wardAdmissions: [],
        certificates: [],
        referrals: [],
        medicalHistory: null,
        visits: [],
        annualCheckups: [],
      };

  const patient: VisitJourneyPatient | null = patientDataResult
    ? {
        id: patientDataResult.patient_id || '',
        name: patientDataResult.full_name ?? '',
      }
    : null;

  const journey = buildVisitJourneyEvents({
    rawVisit,
    history,
    radiologyOrders: (overview?.radiology_orders?.results || []) as RadiologyOrderRecord[],
    sessions: sessionsResult.results || [],
    isConsultationSession,
  });

  return {
    visit: toVisitJourneyDisplayVisit(rawVisit),
    patient,
    journey,
  };
}
