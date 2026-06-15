import { apiFetch } from '@/lib/api-client';
import {
  debugConsultationRoom,
  processVitals,
} from '@/lib/consultation/room-helpers';
import { consultationSessionRoomId } from '@/lib/consultation/room-paused-sessions';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import type { ClinicalOverviewPayload } from '@/lib/clinical-overview-utils';
import {
  enrichSessionDisplayFromWorkspaceBundle,
  transformBundleToRoomEditableOrders,
} from '@/lib/consultation/workspace-bundle-enrichment';
import {
  consultationService,
  patientService,
  type ConsultationSession,
  type Diagnosis,
  type Visit,
} from '@/lib/services';
import { safeAsync } from '@/lib/utils/error-handling';
import { toast } from 'sonner';

export type SessionMedicalNotes = {
  presentationComplaint: string;
  historyOfPresentIllness: string;
  physicalExamination: string;
  assessment: string;
  plan: string;
};

export type SessionTimingState = {
  sessionId: number;
  sessionBaseActiveSeconds: number;
  sessionStartTime: Date;
  sessionDuration: number;
};

export type RoomSessionRestoreWorkspace = {
  clearSessionState: () => void;
  setCurrentPatient: (patient: ConsultationRoomPatient) => void;
  setActiveTab: (tab: string) => void;
  setSessionActive: (active: boolean) => void;
  applySessionTiming: (timing: SessionTimingState) => void;
  setMedicalNotes: (notes: SessionMedicalNotes) => void;
  setSelectedSession: (session: unknown) => void;
  setDiagnoses: (diagnoses: Diagnosis[]) => void;
  setPrescriptions: (prescriptions: any[]) => void;
  setLabOrders: (orders: any[]) => void;
  setNursingOrders: (orders: any[]) => void;
  setRadiologyOrders: (orders: any[]) => void;
  setPhysioOrders: (orders: any[]) => void;
  applyPatientOverview: (overview: ClinicalOverviewPayload) => void;
  loadPatientOverview: (patientId: number) => void;
};

function sessionTimingFromRecord(session: ConsultationSession): SessionTimingState {
  const baseSeconds = Number((session as { active_seconds?: number }).active_seconds ?? 0);
  const resumedAt = (session as { last_resumed_at?: string }).last_resumed_at
    ? new Date((session as { last_resumed_at: string }).last_resumed_at)
    : new Date(session.started_at);
  const now = new Date();
  const elapsedSinceResume = Math.max(0, Math.floor((now.getTime() - resumedAt.getTime()) / 1000));
  const minutes = Math.floor(
    ((Number.isFinite(baseSeconds) && baseSeconds > 0 ? baseSeconds : 0) + elapsedSinceResume) / 60,
  );
  return {
    sessionId: session.id,
    sessionBaseActiveSeconds:
      Number.isFinite(baseSeconds) && baseSeconds > 0 ? baseSeconds : 0,
    sessionStartTime: resumedAt,
    sessionDuration: minutes,
  };
}

function medicalNotesFromSession(session: ConsultationSession): SessionMedicalNotes {
  return {
    presentationComplaint: session.presentation_complaint || '',
    historyOfPresentIllness: session.history_of_presenting_illness || '',
    physicalExamination: session.physical_examination || '',
    assessment: session.assessment || '',
    plan: session.plan || '',
  };
}

export async function restoreConsultationRoomSession(
  roomId: string,
  sessionId: number,
  workspace: RoomSessionRestoreWorkspace,
  options: { silent?: boolean; minimal?: boolean } = {},
): Promise<boolean> {
  try {
    const session: ConsultationSession = await consultationService.getSession(sessionId);

    const currentRoomId = Number.parseInt(roomId, 10);
    const status = String(session.status || '').toLowerCase();
    const sessionRoomId = consultationSessionRoomId(session);
    const isSameRoom = Number.isFinite(currentRoomId) ? sessionRoomId === currentRoomId : true;

    if (status !== 'active' || !isSameRoom) {
      if (!options.silent) {
        console.warn(`Session ${sessionId} is no longer active or in wrong room`);
      }
      workspace.clearSessionState();
      return false;
    }

    const sessionPatientId =
      typeof session.patient === 'number'
        ? session.patient
        : parseInt(String(session.patient), 10);

    let visitData: Visit | null = null;
    if (session.visit) {
      try {
        visitData = await apiFetch<Visit>(`/visits/${session.visit}/`);
        if (visitData?.clinical_notes && !session.presentation_complaint) {
          session.presentation_complaint = visitData.clinical_notes;
        }
      } catch (visitErr) {
        console.warn('Could not load visit data:', visitErr);
      }
    }

    const built = await patientService.buildConsultationPatient(sessionPatientId, {
      visitId: session.visit,
      visitType:
        visitData?.visit_type ||
        (session as { visit_type?: string }).visit_type ||
        undefined,
      clinics: visitData?.clinics,
      completedClinics: visitData?.completed_clinics,
      visitClinic: visitData?.clinic,
      visitDate: visitData?.date,
      visitTime: visitData?.time ? String(visitData.time).slice(0, 5) : undefined,
    });

    const vitalsData = await safeAsync(
      () => patientService.resolveVital({ patient: sessionPatientId, ordering: '-recorded_at' }),
      null,
      {
        operation: 'restorePatientVitals',
        patientId: String(sessionPatientId),
        component: 'ConsultationRoom',
      },
    );

    if (vitalsData) {
      built.vitals = processVitals(vitalsData);
      built.vitalsCompleted = true;
    }

    const restoredPatient = built as unknown as ConsultationRoomPatient;

    workspace.setCurrentPatient(restoredPatient);
    if (restoredPatient.visitType === 'annual_checkup') {
      workspace.setActiveTab('annual_checkup');
    }
    workspace.setSessionActive(true);
    workspace.applySessionTiming(sessionTimingFromRecord(session));

    if (options.minimal) {
      workspace.setMedicalNotes(medicalNotesFromSession(session));
      workspace.setSelectedSession({ ...session });
      workspace.setDiagnoses([]);
      workspace.setPrescriptions([]);
      workspace.setLabOrders([]);
      workspace.setNursingOrders([]);
      workspace.setRadiologyOrders([]);
      workspace.setPhysioOrders([]);
      const pid =
        typeof session.patient === 'number'
          ? session.patient
          : parseInt(String(session.patient), 10);
      if (!Number.isNaN(pid)) {
        void workspace.loadPatientOverview(pid);
      }
      if (!options.silent) {
        toast.success(`Session ready — ${restoredPatient.name || 'patient'}`);
      }
      debugConsultationRoom('Session restored (minimal)');
      return true;
    }

    const [bundle, overview] = await Promise.all([
      consultationService.getSessionWorkspaceBundle(session.id),
      patientService.getClinicalOverview(sessionPatientId).catch(() => null),
    ]);

    if (overview) {
      workspace.applyPatientOverview(overview);
    }

    const enrichedDisplay = enrichSessionDisplayFromWorkspaceBundle(bundle);
    const enrichedSession: Record<string, unknown> = { ...session, ...enrichedDisplay };

    const diagnosesList = bundle.diagnoses.results || [];
    workspace.setDiagnoses(diagnosesList);
    enrichedSession.diagnoses = enrichedDisplay.diagnoses;

    workspace.setSelectedSession(enrichedSession);

    workspace.setMedicalNotes(medicalNotesFromSession(session));

    if (session.visit) {
      const editable = transformBundleToRoomEditableOrders(bundle);
      workspace.setPrescriptions(editable.prescriptions);
      workspace.setLabOrders(editable.labOrders);
      workspace.setRadiologyOrders(editable.radiologyOrders);
      workspace.setNursingOrders(editable.nursingOrders);
    }

    toast.success(`Restored active session with ${restoredPatient.name}`);
    debugConsultationRoom('Session restored successfully');
    return true;
  } catch (err) {
    console.error('Error restoring active session:', err);
    toast.error('Failed to restore active session. You may need to start a new session.');
    return false;
  }
}
