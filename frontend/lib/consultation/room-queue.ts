import { todayApiDateString } from '@/lib/dates';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { normalizeGenderLabel, processVitals } from '@/lib/consultation/room-helpers';
import { compareConsultationQueueEntries, type QueueSortable } from '@/lib/utils/priority';

export function mapQueueItemToPatient(
  item: Record<string, unknown>,
  index: number,
): ConsultationRoomPatient {
  const queuedAt = new Date(String(item.queued_at));
  const waitTimeMs = Date.now() - queuedAt.getTime();
  const waitTime =
    !Number.isNaN(waitTimeMs) && waitTimeMs >= 0 ? Math.floor(waitTimeMs / (1000 * 60)) : 0;
  const patientDetails = item.patient_details as Record<string, unknown> | undefined;

  return {
    id: String(item.patient),
    visitId: item.visit ? String(item.visit) : '',
    queueItemId: Number(item.id),
    patientId: String(patientDetails?.patient_id || item.patient_id || ''),
    name: String(item.patient_name || ''),
    age: Number(item.patient_age ?? patientDetails?.age ?? 0),
    gender: normalizeGenderLabel(item.patient_gender ?? patientDetails?.gender),
    mrn: String((item.patient_id ?? patientDetails?.patient_id) || ''),
    personalNumber: patientDetails?.personal_number
      ? String(patientDetails.personal_number)
      : undefined,
    allergies: [],
    waitTime: waitTime > 0 ? waitTime : 0,
    vitalsCompleted: Boolean(item.latest_vitals),
    visitDate: String(item.visit_date || todayApiDateString()),
    visitTime: item.visit_time
      ? String(item.visit_time).slice(0, 5)
      : new Date().toTimeString().slice(0, 5),
    visitType: String(item.visit_type || 'consultation'),
    queuePosition: index + 1,
    bloodGroup: patientDetails?.blood_group ? String(patientDetails.blood_group) : undefined,
    genotype: patientDetails?.genotype ? String(patientDetails.genotype) : undefined,
    employeeType: patientDetails?.employee_type ? String(patientDetails.employee_type) : undefined,
    division: patientDetails?.division ? String(patientDetails.division) : undefined,
    location: patientDetails?.location ? String(patientDetails.location) : undefined,
    phone: patientDetails?.phone ? String(patientDetails.phone) : undefined,
    email: patientDetails?.email ? String(patientDetails.email) : undefined,
    occupation: patientDetails?.occupation ? String(patientDetails.occupation) : undefined,
    religion: patientDetails?.religion ? String(patientDetails.religion) : undefined,
    tribe: patientDetails?.tribe ? String(patientDetails.tribe) : undefined,
    photo: (patientDetails?.photo as string | null) || null,
    vitals: processVitals(item.latest_vitals as Record<string, unknown> | null),
    clinics: (item.visit_clinics as string[]) || [],
    completedClinics: (item.visit_completed_clinics as string[]) || [],
    visitClinic: String(item.visit_clinic || ''),
  };
}

export function mapQueueItemsToPatients(items: unknown[]): ConsultationRoomPatient[] {
  const sorted = [...(items as QueueSortable[])].sort(compareConsultationQueueEntries);
  return sorted.map((item, index) => mapQueueItemToPatient(item as Record<string, unknown>, index));
}
