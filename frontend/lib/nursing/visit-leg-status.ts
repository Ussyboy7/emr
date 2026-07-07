import {
  clinicMatches,
  getVisitServiceClinicsList,
} from '@/lib/utils/clinic-utils';

export type VisitLegState = 'pending' | 'routed' | 'in_progress' | 'completed';

export interface OrderLegSummary {
  leg_state: VisitLegState;
  order_id?: number;
  status?: string;
}

export interface ConsultationLegContext {
  visitClinics: string[];
  completedClinics: string[];
  queueRoomName?: string;
  openSession?: { room_name: string; doctor_name?: string };
  opdClinicNames?: string[];
}

export function isPhysioServiceClinic(clinic: string, opdClinicNames?: string[]): boolean {
  return clinicMatches(clinic, 'Physiotherapy', opdClinicNames);
}

export function isEyeServiceClinic(clinic: string, opdClinicNames?: string[]): boolean {
  return clinicMatches(clinic, 'Eye Clinic', opdClinicNames);
}

export function isConsultationServiceClinic(clinic: string, opdClinicNames?: string[]): boolean {
  return !isPhysioServiceClinic(clinic, opdClinicNames) && !isEyeServiceClinic(clinic, opdClinicNames);
}

export function consultationClinicsOnVisit(
  visit: { clinic?: string; clinics?: string[] },
  opdClinicNames?: string[],
): string[] {
  return getVisitServiceClinicsList(visit).filter((c) => isConsultationServiceClinic(c, opdClinicNames));
}

export function normalizeOrderLegState(raw?: string): VisitLegState {
  if (raw === 'routed' || raw === 'in_progress' || raw === 'completed') return raw;
  return 'pending';
}

export function getConsultationLegState(ctx: ConsultationLegContext): VisitLegState {
  const consultClinics = consultationClinicsOnVisit(
    { clinic: ctx.visitClinics[0], clinics: ctx.visitClinics },
    ctx.opdClinicNames,
  );
  if (consultClinics.length === 0) return 'pending';
  const done = new Set(ctx.completedClinics || []);
  if (consultClinics.every((c) => done.has(c))) return 'completed';
  if (ctx.openSession) return 'in_progress';
  if (ctx.queueRoomName) return 'routed';
  return 'pending';
}

export function legNeedsRoutingAction(state: VisitLegState): boolean {
  return state === 'pending';
}

export function legShowsRoutedOrDone(state: VisitLegState): boolean {
  return state !== 'pending';
}

export function legLabel(state: VisitLegState, roomName?: string): string {
  switch (state) {
    case 'completed':
      return 'Done';
    case 'in_progress':
      return roomName ? `In ${roomName}` : 'In consult';
    case 'routed':
      return roomName ? `Sent ${roomName}` : 'Sent';
    default:
      return 'pending';
  }
}
