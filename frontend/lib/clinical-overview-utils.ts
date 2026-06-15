import { toApiDateFromInstant } from '@/lib/dates';
import type { AnnualCheckup } from '@/lib/services';

export interface PatientHistoryData {
  consultations: any[];
  labResults: any[];
  imagingOrders: any[];
  prescriptions: any[];
  vitals: any[];
  physioOrders: any[];
  eyeOrders: any[];
  wardAdmissions: any[];
  certificates: any[];
  referrals: any[];
  medicalHistory: any;
  visits: any[];
  annualCheckups: AnnualCheckup[];
}

export type ClinicalOverviewPayload = {
  consultations?: { results: unknown[]; count: number };
  lab_results?: { results: unknown[]; count: number };
  radiology_reports?: { results: unknown[]; count: number };
  radiology_orders?: { results: unknown[]; count: number };
  prescriptions?: { results: unknown[]; count: number };
  vitals?: { results: unknown[]; count: number };
  physio_orders?: { results: unknown[]; count: number };
  eye_orders?: { results: unknown[]; count: number };
  ward_admissions?: { results: unknown[]; count: number };
  certificates?: { results: unknown[]; count: number };
  referrals?: { results: unknown[]; count: number };
  visits: unknown[];
  annual_checkups?: { results: unknown[]; count: number };
  medical_history: unknown;
};

export function mapImagingOrdersFromOverview(orders: any[]): any[] {
  const imagingItems = (orders || []).flatMap((order: any) => {
    const studies = Array.isArray(order.studies) ? order.studies : [];
    return studies.map((study: any) => ({
      id: study?.id ?? `${order.id}-${study?.procedure ?? 'study'}`,
      order: order.id,
      order_id: order.order_id,
      patient: order.patient,
      patient_name: order.patient_name,
      patient_details: order.patient_details,
      created_at: study?.created_at ?? order.ordered_at,
      overall_status: null,
      priority: order.priority,
      location_clinic_name: study?.location_clinic_name ?? order.location_clinic_name,
      order_details: {
        id: order.id,
        order_id: order.order_id,
        doctor: order.doctor,
        doctor_name: order.doctor_name,
        doctor_specialty: order.doctor_details?.specialty ?? '',
        doctor_details: order.doctor_details,
        clinic: order.clinic,
        clinical_notes: order.clinical_notes,
        patient_details: order.patient_details,
      },
      study_details: study,
    }));
  });
  imagingItems.sort((a: any, b: any) => {
    const aDate = new Date(
      a?.study_details?.verified_at ||
        a?.study_details?.reported_at ||
        a?.study_details?.created_at ||
        a?.created_at ||
        0,
    ).getTime();
    const bDate = new Date(
      b?.study_details?.verified_at ||
        b?.study_details?.reported_at ||
        b?.study_details?.created_at ||
        b?.created_at ||
        0,
    ).getTime();
    return bDate - aDate;
  });
  return imagingItems;
}

export function mapClinicalOverviewToPatientHistory(
  overview: ClinicalOverviewPayload,
): PatientHistoryData {
  const consultationRows = overview.consultations?.results || [];

  let combinedVisits: any[] = Array.isArray(overview.visits) ? [...overview.visits] : [];
  combinedVisits.sort((a, b) => {
    const dateA = toApiDateFromInstant(a.date);
    const dateB = toApiDateFromInstant(b.date);
    const timeA = String(a.time || '00:00:00');
    const timeB = String(b.time || '00:00:00');
    const ta = new Date(`${dateA}T${timeA}`).getTime();
    const tb = new Date(`${dateB}T${timeB}`).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  const refList = [...(overview.referrals?.results || [])] as Array<{ referred_at?: string }>;
  refList.sort((a, b) => {
    const ta = new Date(a.referred_at || 0).getTime();
    const tb = new Date(b.referred_at || 0).getTime();
    return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
  });

  return {
    consultations: consultationRows,
    labResults: overview.lab_results?.results || [],
    imagingOrders: mapImagingOrdersFromOverview(overview.radiology_orders?.results || []),
    prescriptions: overview.prescriptions?.results || [],
    vitals: overview.vitals?.results || [],
    physioOrders: overview.physio_orders?.results || [],
    eyeOrders: overview.eye_orders?.results || [],
    wardAdmissions: overview.ward_admissions?.results || [],
    certificates: overview.certificates?.results || [],
    referrals: refList,
    medicalHistory: overview.medical_history,
    visits: combinedVisits,
    annualCheckups: (overview.annual_checkups?.results || []) as AnnualCheckup[],
  };
}

export function medicalHistoryFormFromRecord(record: any | null | undefined) {
  const empty = {
    allergies: [] as string[],
    diagnoses: [] as Array<{
      code?: string;
      name: string;
      status: string;
      diagnosedDate?: string;
      treatingDoctor?: string;
    }>,
    surgicalHistory: [] as Array<{ procedure: string; date: string; hospital: string }>,
    familyHistory: [] as Array<{ relation: string; condition: string }>,
    socialHistory: { smoking: '', alcohol: '', exercise: '', occupation: '' },
  };
  if (!record) return empty;
  return {
    allergies: Array.isArray(record.allergies) ? record.allergies : [],
    diagnoses: Array.isArray(record.diagnoses) ? record.diagnoses : [],
    surgicalHistory: Array.isArray(record.surgical_history) ? record.surgical_history : [],
    familyHistory: Array.isArray(record.family_history) ? record.family_history : [],
    socialHistory: {
      smoking: record.social_history?.smoking || '',
      alcohol: record.social_history?.alcohol || '',
      exercise: record.social_history?.exercise || '',
      occupation: record.social_history?.occupation || '',
    },
  };
}
