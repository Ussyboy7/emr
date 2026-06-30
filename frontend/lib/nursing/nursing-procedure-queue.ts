import { resolvePatientPhoto } from '@/lib/patient-photo';
import { parseProcedureDetails } from '@/lib/nursing/procedure-description';

export type NursingProcedureType = 'injection' | 'dressing' | 'medication' | 'ward_admission';

export type NursingProcedurePriority = 'Emergency' | 'High' | 'Medium' | 'Low';

export type NursingProcedureDetails = {
  medication?: string;
  dosage?: string;
  route?: string;
  frequency?: string;
  woundType?: string;
  woundLocation?: string;
  instructions?: string;
  admissionDiagnosis?: string;
  admissionDiagnosesList?: string[];
  presentingComplaint?: string;
};

/** Normalized nursing-order row for perform-complete (Procedures queue + Ward Care). */
export type NursingProcedureItem = {
  id: string;
  patientDbId?: number;
  visitId?: number;
  consultationSessionId?: number;
  admissionId?: number;
  createdNursingVisit?: boolean;
  type: NursingProcedureType;
  status: 'pending' | 'completed';
  patientName: string;
  patientPhoto?: string | null;
  patientId: string;
  personalNumber: string;
  age: number;
  gender: string;
  ward: string;
  orderedAt: string;
  completedAt?: string;
  orderedBy: string;
  priority: NursingProcedurePriority;
  allergies: string[];
  description?: string;
  details: NursingProcedureDetails;
};

const TYPE_MAP: Record<string, NursingProcedureType> = {
  injection: 'injection',
  dressing: 'dressing',
  wound_care: 'dressing',
  medication: 'medication',
  'iv infusion': 'injection',
  'ward admission': 'ward_admission',
  'observation admission': 'ward_admission',
  ward_admission: 'ward_admission',
  observation_admission: 'ward_admission',
};

const PRIORITY_MAP: Record<string, NursingProcedurePriority> = {
  urgent: 'Emergency',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

export function isPerformableWardOrderType(orderType: string): boolean {
  const t = String(orderType || '').toLowerCase();
  return (
    t === 'injection' ||
    t === 'dressing' ||
    t.includes('wound') ||
    t === 'iv infusion'
  );
}

export function nursingOrderToProcedure(order: Record<string, unknown>): NursingProcedureItem {
  const procedureType = TYPE_MAP[String(order.order_type || '').toLowerCase()] || 'medication';
  const priority = PRIORITY_MAP[String(order.priority || '').toLowerCase()] || 'Medium';

  const allergies = Array.isArray(order.patient_allergies)
    ? order.patient_allergies.map((a) => String(a))
    : [];

  const description = String(order.description || '');
  let parsedWard = '';
  let details: NursingProcedureDetails = {};

  if (procedureType === 'ward_admission') {
    const wardMatch = description.match(/to\s+([^.,;]+)/i);
    if (wardMatch?.[1]) parsedWard = wardMatch[1].trim();

    const diagnosesBlockMatch = description.match(/Diagnoses:\s*([\s\S]+?)\s*Presenting complaint:\s*/i);
    if (diagnosesBlockMatch?.[1]) {
      const diagnosisLines = diagnosesBlockMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean);
      if (diagnosisLines.length > 0) {
        details.admissionDiagnosesList = diagnosisLines;
        details.admissionDiagnosis = diagnosisLines[0];
      }
    }
    const diagPcMatch = description.match(/Presenting complaint:\s*(.+?)(?:\.\s*Instructions:|\.\s*$|$)/i);
    if (diagPcMatch) {
      const pc = diagPcMatch[1].trim();
      details.presentingComplaint = pc && pc.toLowerCase() !== 'n/a' ? pc : undefined;
    }
    if (!details.admissionDiagnosis) {
      const legacyDiagPcMatch = description.match(/Diagnosis:\s*(.+?)\.\s*Presenting complaint:\s*(.+?)(?:\s*\.|$)/i);
      if (legacyDiagPcMatch) {
        const diag = legacyDiagPcMatch[1].trim();
        const pc = legacyDiagPcMatch[2].trim();
        details.admissionDiagnosis = diag && diag.toLowerCase() !== 'n/a' ? diag : undefined;
        details.presentingComplaint = pc && pc.toLowerCase() !== 'n/a' ? pc : undefined;
      }
    }
  } else {
    details = parseProcedureDetails(
      procedureType,
      description,
      String(order.frequency || ''),
    );
  }

  const visitRaw = order.visit;
  const visitId =
    typeof visitRaw === 'number'
      ? visitRaw
      : visitRaw && typeof visitRaw === 'object' && (visitRaw as { id?: unknown }).id != null
        ? Number((visitRaw as { id: unknown }).id)
        : undefined;

  const patientRaw = order.patient;
  const patientDbId =
    typeof patientRaw === 'number'
      ? patientRaw
      : patientRaw && typeof patientRaw === 'object' && (patientRaw as { id?: unknown }).id != null
        ? Number((patientRaw as { id: unknown }).id)
        : undefined;

  const sessionRaw = order.consultation_session;
  const consultationSessionId =
    typeof sessionRaw === 'number'
      ? sessionRaw
      : sessionRaw && typeof sessionRaw === 'object' && (sessionRaw as { id?: unknown }).id != null
        ? Number((sessionRaw as { id: unknown }).id)
        : undefined;

  const admissionRaw = order.admission;
  const admissionId =
    typeof admissionRaw === 'number'
      ? admissionRaw
      : admissionRaw && typeof admissionRaw === 'object' && (admissionRaw as { id?: unknown }).id != null
        ? Number((admissionRaw as { id: unknown }).id)
        : undefined;

  return {
    id: String(order.id),
    patientDbId: patientDbId != null && Number.isFinite(patientDbId) ? patientDbId : undefined,
    visitId: visitId != null && Number.isFinite(visitId) ? visitId : undefined,
    consultationSessionId:
      consultationSessionId != null && Number.isFinite(consultationSessionId)
        ? consultationSessionId
        : undefined,
    admissionId: admissionId != null && Number.isFinite(admissionId) ? admissionId : undefined,
    type: procedureType,
    status: order.status === 'completed' ? 'completed' : 'pending',
    patientName: String(order.patient_name ?? ''),
    patientPhoto: resolvePatientPhoto(order),
    patientId: String(order.patient_patient_id ?? ''),
    personalNumber: String(order.patient_personal_number ?? ''),
    age: typeof order.patient_age === 'number' ? order.patient_age : 0,
    gender: String(order.patient_gender ?? ''),
    ward: parsedWard,
    orderedAt: String(order.ordered_at ?? ''),
    completedAt:
      typeof order.completed_at === 'string'
        ? order.completed_at
        : typeof order.updated_at === 'string'
          ? order.updated_at
          : undefined,
    orderedBy: String(order.ordered_by_name || 'Unknown'),
    priority,
    allergies,
    details,
    description,
  };
}
