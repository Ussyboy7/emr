import type { ConsultationSession } from '@/lib/services';
import type { RoomPresenceStatus } from '@/lib/consultation/room-presence';
import type { RoomDoctorPresence, RoomActiveSessionSummary } from '@/lib/consultation/room-presence';

export interface ConsultationRoomPatient {
  id: string;
  visitId: string;
  queueItemId?: number;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  mrn: string;
  personalNumber?: string;
  allergies: string[];
  waitTime: number;
  vitalsCompleted: boolean;
  visitDate: string;
  visitTime: string;
  visitType?: string;
  queuePosition?: number;
  bloodGroup?: string;
  genotype?: string;
  employeeType?: string;
  division?: string;
  location?: string;
  phone?: string;
  email?: string;
  occupation?: string;
  religion?: string;
  tribe?: string;
  photo?: string | null;
  vitals?: {
    temperature: string;
    bloodPressure: string;
    heartRate: string;
    respiratoryRate: string;
    oxygenSaturation: string;
    weight: string;
    height: string;
    bmi?: string;
    painScale?: string;
    bloodSugar?: string;
    randomBloodSugar?: string;
    notes?: string;
    recordedAt: string;
  };
  clinics?: string[];
  completedClinics?: string[];
  visitClinic?: string;
}

export interface ConsultationRoomInfo {
  id: string;
  name: string;
  clinic?: string;
  status: 'available' | 'occupied';
  currentPatient?: string;
  startTime?: string;
  doctor?: string;
  doctors?: RoomDoctorPresence[];
  colleaguesInConsult?: Array<{
    sessionId: number;
    doctorName: string;
    patientName: string;
  }>;
  specialtyFocus?: string;
  presenceStatus?: RoomPresenceStatus;
  acceptingPatients?: boolean;
  totalConsultationsToday: number;
  averageConsultationTime: number;
  queue: { patient_id: string; position: number }[];
}

export interface WardAdmissionRow {
  id: number;
  admission_id: string;
  ward_name: string;
  bed_number?: string;
  admission_date: string;
  admission_type: string;
  status: string;
  admission_diagnosis?: string;
  length_of_stay?: number;
  location_clinic_name?: string;
}

export interface RoomVitalsData {
  id: string;
  date: string;
  time: string;
  systolic: number;
  diastolic: number;
  heartRate: number;
  temperature: number;
  respiratoryRate: number;
  oxygenSaturation: number;
  weight?: number;
  height?: number;
  bmi?: number;
  painScale?: number;
  bloodSugar?: number;
  randomBloodSugar?: number;
  recordedBy?: string;
  recordedAt?: string;
  bloodPressure?: string;
  notes?: string;
}

export interface RoomLabTemplate {
  id: number;
  name: string;
  code?: string;
  sample_type?: string;
  description?: string;
  tests: Array<{
    id: number;
    name: string;
    unit?: string;
    reference_range?: string;
  }>;
}

export interface ExtendedConsultationSession extends ConsultationSession {
  date?: string;
  time?: string;
  clinic?: string;
  name?: string;
  patientId?: string;
  age?: number;
  gender?: string;
  doctorSpecialty?: string;
  duration?: number;
  vitals?: unknown[];
  diagnoses?: unknown[];
  prescriptions?: unknown[];
  labOrders?: unknown[];
  radiologyOrders?: unknown[];
  physioOrders?: unknown[];
  nursingOrders?: unknown[];
  followUp?: unknown;
  outcome?: string;
}

/** @deprecated Use ConsultationRoomPatient */
export type Patient = ConsultationRoomPatient;

/** @deprecated Use ConsultationRoomInfo */
export type ConsultationRoom = ConsultationRoomInfo;

/** @deprecated Use WardAdmissionRow */
export type WardAdmission = WardAdmissionRow;

/** @deprecated Use RoomVitalsData */
export type VitalsData = RoomVitalsData;

/** @deprecated Use RoomLabTemplate */
export type LabTemplate = RoomLabTemplate;
