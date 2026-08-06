"use client";
import { todayApiDateString, toApiDateFromInstant } from "@/lib/dates";

import { useCallback, useEffect, useMemo, useRef, useState, use } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Button } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { AlertTriangle, ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  roomService,
  patientService,
  physioService,
  referralService,
  consultationService,
  appointmentService,
  wardService,
  type RadiologyReport as ServiceRadiologyReport,
  type PhysioSession,
} from '@/lib/services';
import type { Patient as ApiPatient } from '@/lib/services/patient-service';

import type {
  Patient,
  ConsultationRoom,
  WardAdmission,
  VitalsData,
  ExtendedConsultationSession,
} from '@/lib/consultation/room-types';
import type { RoomPresenceStatus } from '@/lib/consultation/room-presence';
import { isDoctorCheckedIntoRoom, ROOM_PRESENCE_HEARTBEAT_MS, doctorDisplayName } from '@/lib/consultation/room-presence';
import {
  debugConsultationRoom,
  formatRoomTime as formatTime,
  joinPresentationComplaintLines,
  parsePresentationComplaintValue,
} from '@/lib/consultation/room-helpers';
import { useConsultationRoomPatientOverview } from '@/hooks/use-consultation-room-patient-overview';
import { useConsultationRoomQueue } from '@/hooks/use-consultation-room-queue';
import { useConsultationRoomSession } from '@/hooks/use-consultation-room-session';
import { useConsultationRoomOrders } from '@/hooks/use-consultation-room-orders';
import { ConsultationRoomQueueDialog } from '@/components/consultation/room/ConsultationRoomQueueDialog';
import { ConsultationRoomIdleView } from '@/components/consultation/room/ConsultationRoomIdleView';
import { ConsultationRoomActiveHeader } from '@/components/consultation/room/ConsultationRoomActiveHeader';
import { ConsultationRoomNotesTab } from '@/components/consultation/room/ConsultationRoomNotesTab';
import { ConsultationRoomHistoryTab } from '@/components/consultation/room/ConsultationRoomHistoryTab';
import { ConsultationRoomSessionTabList } from '@/components/consultation/room/ConsultationRoomSessionTabList';
import { ConsultationRoomAnnualCheckupTab } from '@/components/consultation/room/ConsultationRoomAnnualCheckupTab';
import { ConsultationRoomPrescriptionsTab } from '@/components/consultation/room/ConsultationRoomPrescriptionsTab';
import { ConsultationRoomLabTab } from '@/components/consultation/room/ConsultationRoomLabTab';
import { ConsultationRoomPhysioTab } from '@/components/consultation/room/ConsultationRoomPhysioTab';
import { ConsultationRoomEyecareTab } from '@/components/consultation/room/ConsultationRoomEyecareTab';
import { ConsultationRoomNursingTab } from '@/components/consultation/room/ConsultationRoomNursingTab';
import { ConsultationRoomRadiologyTab } from '@/components/consultation/room/ConsultationRoomRadiologyTab';
import { ConsultationRoomReferralTab } from '@/components/consultation/room/ConsultationRoomReferralTab';
import { ConsultationRoomOrderDialogs } from '@/components/consultation/room/ConsultationRoomOrderDialogs';
import { ConsultationRoomSessionDialogs } from '@/components/consultation/room/ConsultationRoomSessionDialogs';
import { ConsultationRoomWardAdmissionDialog } from '@/components/consultation/room/ConsultationRoomWardAdmissionDialog';
import { ConsultationRoomReportDialogs } from '@/components/consultation/room/ConsultationRoomReportDialogs';
import { ConsultationRoomEditMedicalHistoryDialog } from '@/components/consultation/room/ConsultationRoomEditMedicalHistoryDialog';
import { ConsultationRoomDischargeDialog } from '@/components/consultation/room/ConsultationRoomDischargeDialog';
import { ConsultationRoomPhysioOrderViewDialog } from '@/components/consultation/room/ConsultationRoomPhysioOrderViewDialog';
import { ConsultationRoomTailDialogs } from '@/components/consultation/room/ConsultationRoomTailDialogs';
import { mapQueueItemsToPatients } from '@/lib/consultation/room-queue';
import { apiFetch } from '@/lib/api-client';
import { fetchAllPaginatedResults } from '@/lib/fetch-paginated-results';
import { useConsultationPageAuth } from '@/hooks/use-consultation-page-auth';
import {
  getVisitServiceClinicsDisplay,
  getVisitServiceClinicsList,
  normalizeClinicName,
} from '@/lib/utils/clinic-utils';
import { useOutpatientClinicTypes } from '@/hooks/use-outpatient-clinic-types';
import {
  getPresentingComplaintOptions,
  type PresentingComplaintCategory,
} from '@/lib/constants/presenting-complaints';
import { type ReferralWithPatient } from '@/lib/referrals/referral-helpers';
import {
  transformApiRowToCompletedTest,
  type CompletedTest as CompletedLabReportTest,
} from '@/lib/laboratory/completedLabReport';
import type { PrescriptionReportData } from '@/components/pharmacy/PrescriptionReportDialog';
import {
  transformApiRadiologyReportToCompleted,
  type CompletedRadiologyReport,
} from '@/lib/radiology/completedRadiologyReport';
import {
  loadConsultationReportSession,
  type ConsultationReportSession,
} from '@/lib/consultation-report';
import type { PatientHistoryData } from '@/lib/clinical-overview-utils';

interface LabTestResult {
  id: number;
  test_name?: string;
  result?: string;
  unit?: string;
  reference_range?: string;
  status?: string;
  completed_at?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  criticalValue?: boolean;
  date?: string;
  category?: string;
  test?: string;
  specimenType?: string;
  orderedBy?: string;
  collectedAt?: string;
  reportedAt?: string;
  performedBy?: string;
  verifiedBy?: string;
  parameters?: any[];
  interpretation?: string;
  clinicalNotes?: string;
  resultFile?: {
    name: string;
    url: string;
    type: string;
  } | null;
  hasManualResults?: boolean;
  hasUploadedFile?: boolean;
}

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;
  const { ready, currentUser, handleAuthError } = useConsultationPageAuth();
  const { names: opdClinicNames, types: opdClinicTypes } = useOutpatientClinicTypes();

  const [room, setRoom] = useState<ConsultationRoom | null>(null);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("notes");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [dischargeData, setDischargeData] = useState({
    discharge_type: 'regular',
    discharge_diagnosis: '',
    discharge_notes: '',
    discharge_summary: '',
    follow_up_instructions: '',
  });
  const [showWardAdmissionDetail, setShowWardAdmissionDetail] = useState(false);
  const [selectedWardAdmission, setSelectedWardAdmission] = useState<WardAdmission | null>(null);
  const [isEnding, setIsEnding] = useState(false);
  const {
    patients,
    setPatients,
    pausedSessions,
    pausedSessionsSorted,
    pausedSessionsTotalCount,
    pausedSessionsListIncomplete,
    pausedSessionsUnknownTotal,
    loadPausedSessions,
    refreshQueueData,
    findPausedSessionsForPatient,
    roomQueueDialogEntries,
    roomQueueWaitingCount,
    showRoomPatientsDialog,
    setShowRoomPatientsDialog,
    roomPatientsDialogTab,
    setRoomPatientsDialogTab,
    loadingRoomPatientsDialog,
    openRoomPatientsDialog,
  } = useConsultationRoomQueue(roomId, currentPatient);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [medicalNotes, setMedicalNotes] = useState({ presentationComplaint: "", historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
  const [presentingComplaintLibrary, setPresentingComplaintLibrary] = useState<PresentingComplaintCategory[]>([]);
  const [presentationComplaintSearch, setPresentationComplaintSearch] = useState("");
  const presentingComplaintOptions = useMemo(
    () => getPresentingComplaintOptions(presentingComplaintLibrary),
    [presentingComplaintLibrary]
  );
  const presentingComplaintOptionSet = useMemo(
    () => new Set(presentingComplaintOptions.map((option) => option.normalizedLabel)),
    [presentingComplaintOptions]
  );
  const presentingComplaintLabelMap = useMemo(
    () => new Map(presentingComplaintOptions.map((option) => [option.normalizedLabel, option.label])),
    [presentingComplaintOptions]
  );
  const parsedPresentationComplaint = useMemo(
    () =>
      parsePresentationComplaintValue(
        medicalNotes.presentationComplaint,
        presentingComplaintLabelMap,
        presentingComplaintOptionSet
      ),
    [medicalNotes.presentationComplaint, presentingComplaintLabelMap, presentingComplaintOptionSet]
  );
  const selectedPresentingComplaintSet = useMemo(
    () => new Set(parsedPresentationComplaint.selected.map((item) => item.trim().toLowerCase())),
    [parsedPresentationComplaint.selected]
  );
  const filteredPresentationComplaintGroups = useMemo(() => {
    const query = presentationComplaintSearch.trim().toLowerCase();
    return presentingComplaintLibrary.map((group) => ({
      category: group.category,
      complaints: group.complaints.filter((complaint) =>
        query.length === 0 ? true : complaint.toLowerCase().includes(query)
      ),
    })).filter((group) => group.complaints.length > 0);
  }, [presentingComplaintLibrary, presentationComplaintSearch]);
  const togglePresentationComplaintSelection = useCallback(
    (complaint: string) => {
      const normalizedComplaint = complaint.trim().toLowerCase();
      if (!normalizedComplaint) return;

      setMedicalNotes((prev) => {
        const parsed = parsePresentationComplaintValue(
          prev.presentationComplaint,
          presentingComplaintLabelMap,
          presentingComplaintOptionSet
        );
        const selectedSet = new Set(parsed.selected.map((item) => item.trim().toLowerCase()));

        if (selectedSet.has(normalizedComplaint)) {
          selectedSet.delete(normalizedComplaint);
        } else {
          selectedSet.add(normalizedComplaint);
        }

        const selectedInLibraryOrder = presentingComplaintOptions
          .filter((option) => selectedSet.has(option.normalizedLabel))
          .map((option) => option.label);

        return {
          ...prev,
          presentationComplaint: joinPresentationComplaintLines(
            selectedInLibraryOrder,
            parsed.customText
          ),
        };
      });
    },
    [presentingComplaintLabelMap, presentingComplaintOptionSet, presentingComplaintOptions]
  );
  const [medicalHistory, setMedicalHistory] = useState({
    allergies: [] as string[],
    diagnoses: [] as Array<{ code?: string; name: string; status: string; diagnosedDate?: string; treatingDoctor?: string }>,
    surgicalHistory: [] as Array<{ procedure: string; date: string; hospital: string }>,
    familyHistory: [] as Array<{ relation: string; condition: string }>,
    socialHistory: {
      smoking: '',
      alcohol: '',
      exercise: '',
      occupation: '',
    },
  });
  const [showEditMedicalHistory, setShowEditMedicalHistory] = useState(false);
  const [loadingMedicalHistory, setLoadingMedicalHistory] = useState(false);
  const [wardAdmissions, setWardAdmissions] = useState<WardAdmission[]>([]);
  const [patientHistorySnapshot, setPatientHistorySnapshot] = useState<PatientHistoryData | null>(null);
  const { applyPatientOverview, loadPatientOverview } = useConsultationRoomPatientOverview({
    setWardAdmissions,
    setPatientHistorySnapshot,
    setMedicalHistory,
    setCurrentPatient,
  });

  // Function to open physio order dialog and load sessions
  const openPhysioOrderDialog = async (order: any) => {
    setSelectedPhysioOrder(order);
    setIsPhysioOrderDialogOpen(true);
    setLoadingPhysioSessions(true);

    try {
      const sessionsResponse = await physioService.getSessions({ order: order.id });
      setPhysioOrderSessions(sessionsResponse.results || []);
    } catch (err: any) {
      console.error('Failed to load physio sessions:', err);
      toast.error('Failed to load session details');
      setPhysioOrderSessions([]);
    } finally {
      setLoadingPhysioSessions(false);
    }
  };



  // Session restore keeps enriched session metadata for notes-tab saves.
  const [, setSelectedSession] = useState<ExtendedConsultationSession | null>(null);
  const [consultationReportSession, setConsultationReportSession] = useState<ConsultationReportSession | null>(null);
  const [isConsultationReportLoading, setIsConsultationReportLoading] = useState(false);

  // Lab result viewer (same standard report as Laboratory → Completed Tests)
  const [selectedCompletedLabTest, setSelectedCompletedLabTest] = useState<CompletedLabReportTest | null>(null);
  const [showLabResultViewer, setShowLabResultViewer] = useState(false);
  const [selectedCompletedRadiologyReport, setSelectedCompletedRadiologyReport] =
    useState<CompletedRadiologyReport | null>(null);
  const [showRadiologyReportViewer, setShowRadiologyReportViewer] = useState(false);

  const [selectedPrescription, setSelectedPrescription] = useState<PrescriptionReportData | null>(null);
  const [showPrescriptionViewer, setShowPrescriptionViewer] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const loadPresentingComplaintLibrary = async () => {
      try {
        const categories = await consultationService.getPresentingComplaintLibrary();
        if (cancelled) return;

        const mappedLibrary: PresentingComplaintCategory[] = categories
          .map((category) => ({
            category: category.name,
            complaints: (category.complaints || []).map((complaint) => complaint.label).filter(Boolean),
          }))
          .filter((entry) => entry.category.trim().length > 0);

        setPresentingComplaintLibrary(mappedLibrary);
      } catch (error) {
        console.error('Failed to load presenting complaints library:', error);
        setPresentingComplaintLibrary([]);
      }
    };

    loadPresentingComplaintLibrary();
    return () => {
      cancelled = true;
    };
  }, []);

  const ordersRef = useRef<ReturnType<typeof useConsultationRoomOrders> | null>(null);

  // Reset consultation workspace (notes, orders, history) — session timing cleared by session hook.
  const clearSessionWorkspace = useCallback(() => {
    setMedicalNotes({ presentationComplaint: "", historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
    ordersRef.current?.resetOrderWorkspace();
    setFollowUpRequired(false);
    setFollowUpDate("");
    setFollowUpReason("");
    setMedicalHistory({
      allergies: [],
      diagnoses: [],
      surgicalHistory: [],
      familyHistory: [],
      socialHistory: { smoking: '', alcohol: '', exercise: '', occupation: '' },
    });
    setWardAdmissions([]);
    setPatientHistorySnapshot(null);
  }, []);

  const resetFollowUpFields = useCallback(() => {
    setFollowUpRequired(false);
    setFollowUpDate("");
    setFollowUpReason("");
  }, []);

  const [historyReloadToken, setHistoryReloadToken] = useState(0);

  const {
    sessionActive,
    setSessionActive,
    sessionId,
    setSessionId,
    sessionStartTime,
    setSessionStartTime,
    sessionBaseActiveSeconds,
    setSessionBaseActiveSeconds,
    sessionDuration,
    setSessionDuration,
    isStartingSession,
    isResumingPausedSession,
    endingPausedSessionId,
    pausedDuplicateStartDialog,
    setPausedDuplicateStartDialog,
    isEndingPausedForNewStart,
    showSwitchPatientDialog,
    setShowSwitchPatientDialog,
    pendingSwitchPatient,
    setPendingSwitchPatient,
    clearSessionState,
    resetSessionTiming,
    restoreActiveSession,
    handleResumePausedSession,
    handleStartSession,
    confirmSwitchPatientStart,
    handleQueuePatientAction,
    handleEndPausedSession,
    handlePausedDuplicateResume,
    handlePausedDuplicateEndAndStart,
  } = useConsultationRoomSession({
    roomId,
    loading,
    currentPatient,
    setCurrentPatient,
    setActiveTab,
    clearSessionWorkspace,
    setMedicalNotes,
    setSelectedSession: (session) => setSelectedSession(session as ExtendedConsultationSession),
    setDiagnoses: (value) => ordersRef.current?.setDiagnoses(value),
    setPrescriptions: (prescriptions) => ordersRef.current?.setPrescriptions(prescriptions),
    setLabOrders: (orders) => ordersRef.current?.setLabOrders(orders),
    setNursingOrders: (orders) => ordersRef.current?.setNursingOrders(orders),
    setRadiologyOrders: (orders) => ordersRef.current?.setRadiologyOrders(orders),
    setPhysioOrders: (orders) => ordersRef.current?.setPhysioOrders(orders),
    applyPatientOverview,
    loadPatientOverview,
    loadPausedSessions,
    refreshQueueData,
    showRoomPatientsDialog,
    setShowRoomPatientsDialog,
    pausedSessionsCount: pausedSessions.length,
    resetFollowUpFields,
  });

  const bumpReferralHistory = useCallback(() => {
    setHistoryReloadToken((n) => n + 1);
  }, []);

  const orders = useConsultationRoomOrders({
    currentPatient,
    sessionId,
    activeTab,
    opdClinicNames,
    onReferralCreated: bumpReferralHistory,
    medicalNotesAssessment: medicalNotes.assessment,
    loadPatientOverview,
  });
  ordersRef.current = orders;

  const {
    diagnoses,
    setDiagnoses,
    prescriptions,
    setPrescriptions,
    labOrders,
    setLabOrders,
    nursingOrders,
    setNursingOrders,
    radiologyOrders,
    setRadiologyOrders,
    physioOrders,
    setPhysioOrders,
    physioOrdersFromApi,
    eyeOrders,
    setEyeOrders,
    eyeOrdersFromApi,
    draftObservationCount,
    orderDialogsWorkspace,
    loadWards,
    openAddPrescriptionModal,
    sendPrescriptionsToPharmacy,
    cancelSentPrescription,
    sendLabOrdersToLab,
    editLabOrder,
    sendNursingOrdersToNursing,
    editNursingOrder,
    sendRadiologyOrders,
    editRadiologyOrder,
    sendPhysioOrders,
    editPhysioOrder,
    sendEyeOrders,
    editEyeOrder,
    setShowAddDiagnosis,
    setShowPrescriptionRefill,
    setShowAddLabOrder,
    setShowAddPhysio,
    setShowAddEye,
    setShowAddNursingOrder,
    setShowAddRadiology,
    setShowAddReferral,
    editPrescription,
  } = orders;

  // Vitals detail modal state
  const [selectedVital, setSelectedVital] = useState<VitalsData | null>(null);
  const [isVitalsDetailModalOpen, setIsVitalsDetailModalOpen] = useState(false);

  const viewVitalsDetails = (vital: VitalsData) => {
    setSelectedVital(vital);
    setIsVitalsDetailModalOpen(true);
  };

  // Physio dialog state
  const [selectedPhysioOrder, setSelectedPhysioOrder] = useState<any>(null);
  const [isPhysioOrderDialogOpen, setIsPhysioOrderDialogOpen] = useState(false);
  const [physioOrderSessions, setPhysioOrderSessions] = useState<PhysioSession[]>([]);
  const [loadingPhysioSessions, setLoadingPhysioSessions] = useState(false);

  // Eye dialog state
  const [certDialogOpen, setCertDialogOpen] = useState(false);
  const [certificatePatient, setCertificatePatient] = useState<ApiPatient | null>(null);
  const [sessionReferrals, setSessionReferrals] = useState<ReferralWithPatient[]>([]);
  const [sessionReferralsLoading, setSessionReferralsLoading] = useState(false);
  const [referralViewOpen, setReferralViewOpen] = useState(false);
  const [referralViewId, setReferralViewId] = useState<number | undefined>();
  const [referralViewRefreshKey, setReferralViewRefreshKey] = useState(0);

  const openReferralView = useCallback((id: number) => {
    setReferralViewId(id);
    setReferralViewRefreshKey((k) => k + 1);
    setReferralViewOpen(true);
  }, []);

  const loadSessionReferrals = useCallback(async () => {
    if (!currentPatient?.id) {
      setSessionReferrals([]);
      return;
    }
    const pid = parseInt(String(currentPatient.id), 10);
    if (!Number.isFinite(pid)) return;
    setSessionReferralsLoading(true);
    try {
      const res = await referralService.getReferrals({ patient: String(pid), page_size: 50 });
      setSessionReferrals((res.results || []) as ReferralWithPatient[]);
    } catch {
      setSessionReferrals([]);
    } finally {
      setSessionReferralsLoading(false);
    }
  }, [currentPatient?.id]);

  useEffect(() => {
    void loadSessionReferrals();
  }, [loadSessionReferrals, historyReloadToken]);

  

  useEffect(() => {
    if (historyReloadToken === 0) return;
    const pid = currentPatient?.id ? Number(currentPatient.id) : 0;
    if (!pid) return;
    void loadPatientOverview(pid);
  }, [historyReloadToken, currentPatient?.id, loadPatientOverview]);
  const [eyeSessionReportOpen, setEyeSessionReportOpen] = useState(false);
  const [eyeSessionReportOrderId, setEyeSessionReportOrderId] = useState<number | undefined>(undefined);

  const [isMarkingLeft, setIsMarkingLeft] = useState(false);
  const [presenceStatus, setPresenceStatus] = useState<RoomPresenceStatus>('away');
  const [acceptingPatients, setAcceptingPatients] = useState(false);
  const [isUpdatingPresence, setIsUpdatingPresence] = useState(false);
  const [showLeftWorkflowDialog, setShowLeftWorkflowDialog] = useState(false);
  const [leftWorkflowReason, setLeftWorkflowReason] = useState('Patient left before being seen');
  const [leftWorkflowTarget, setLeftWorkflowTarget] = useState<{ kind: 'queue'; patient: Patient } | { kind: 'session' } | null>(null);

  const loadRoomData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Convert roomId to integer (it might be a string from URL)
      const numericRoomId = parseInt(roomId);
      if (isNaN(numericRoomId)) {
        setError('Invalid room ID');
        setLoading(false);
        return;
      }
      
      // Load room details (check in when opening the room directly)
      let roomData = await roomService.getRoom(numericRoomId);
      const currentDoctorId = currentUser?.id ? Number(currentUser.id) : null;
      if (currentDoctorId && !isDoctorCheckedIntoRoom(roomData, currentDoctorId)) {
        try {
          roomData = await roomService.checkIn(numericRoomId);
        } catch (checkInErr) {
          console.error('Room check-in failed:', checkInErr);
          if (handleAuthError(checkInErr)) return;
          toast.error(
            checkInErr instanceof Error
              ? checkInErr.message
              : 'Failed to enter consultation room',
          );
        }
      }
      setPresenceStatus((roomData.my_presence_status || roomData.presence_status || 'away') as RoomPresenceStatus);
      setAcceptingPatients(roomData.my_accepting_patients ?? roomData.accepting_patients === true);
      
      // Load queue items for this room - single optimized API call
      const queueItems = await fetchAllPaginatedResults((page, pageSize) =>
        consultationService.getQueue({
          room: numericRoomId,
          is_active: true,
          page,
          page_size: pageSize,
        })
      );
      const validPatients = mapQueueItemsToPatients(queueItems);

        const todayStr = todayApiDateString();
        const completedSessions = await fetchAllPaginatedResults((page, pageSize) =>
          consultationService.getSessions({
            room: numericRoomId,
            status: 'completed',
            start_date: todayStr,
            end_date: todayStr,
            page,
            page_size: pageSize,
          })
        ).catch(() => [] as Awaited<ReturnType<typeof consultationService.getSessions>>['results']);
        const completedCount = completedSessions.length;
        const durations = completedSessions
          .map((s: any) => {
            if (!s.started_at || !s.ended_at) return null;
            return Math.floor((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 60000);
          })
          .filter((d: number | null): d is number => d !== null && d > 0);
        const avgTime = durations.length > 0 ? Math.round(durations.reduce((a: number, b: number) => a + b, 0) / durations.length) : 0;

        const colleaguesInConsult = (roomData.active_sessions ?? [])
          .filter((session) => session.doctor_id !== currentDoctorId)
          .map((session) => ({
            sessionId: session.id,
            doctorName: session.doctor_name || 'Doctor',
            patientName: session.patient_name,
          }));

        const transformedRoom: ConsultationRoom = {
          id: String(roomData.id),
          name: roomData.name,
          clinic: roomData.clinic_name || undefined,
          status: roomData.status?.toLowerCase() === 'active' ? 'available' as const : 'occupied' as const,
          currentPatient: validPatients.length > 0 ? validPatients[0].name : undefined,
          startTime: undefined,
          doctor: doctorDisplayName(roomData) || roomData.current_doctor_name || undefined,
          doctors: roomData.doctors,
          colleaguesInConsult,
          presenceStatus: (roomData.my_presence_status || roomData.presence_status || 'away') as RoomPresenceStatus,
          acceptingPatients: roomData.my_accepting_patients ?? roomData.accepting_patients === true,
          specialtyFocus: roomData.specialty || '',
          totalConsultationsToday: completedCount,
          averageConsultationTime: avgTime,
          queue: validPatients.map((patient, index) => ({
            patient_id: patient.id,
            position: index + 1,
          })),
        };
        
        setRoom(transformedRoom);
        setPatients(validPatients);
        await loadPausedSessions();

        
        // Restore this doctor's active session in the room (shared queue — claim on start).
        const mySession = (roomData.active_sessions ?? []).find(
          (session) => session.doctor_id === currentDoctorId,
        ) ?? roomData.active_session;
        if (mySession?.id) {
          const restored = await restoreActiveSession(mySession.id, { silent: true });
          if (!restored) {
            console.warn('Failed to restore active session, clearing state');
          }
        }
      } catch (err) {
        console.error('Error loading room data:', err);
        if (handleAuthError(err)) return;
        setError('Failed to load consultation room. Please try again.');
      } finally {
        setLoading(false);
      }
    };
  
  const handleToggleAccepting = useCallback(async (accepting: boolean) => {
    const numericRoomId = parseInt(roomId, 10);
    if (Number.isNaN(numericRoomId)) return;
    setIsUpdatingPresence(true);
    try {
      const updated = await roomService.setAccepting(numericRoomId, accepting);
      setPresenceStatus((updated.my_presence_status || updated.presence_status || 'away') as RoomPresenceStatus);
      setAcceptingPatients(updated.my_accepting_patients ?? updated.accepting_patients === true);
      setRoom((prev) =>
        prev
          ? {
              ...prev,
              doctor: updated.current_doctor_name || prev.doctor,
              presenceStatus: (updated.presence_status || 'away') as RoomPresenceStatus,
              acceptingPatients: updated.accepting_patients === true,
            }
          : prev,
      );
      toast.success(accepting ? 'Now accepting patients' : 'Not accepting new patients');
    } catch (err) {
      console.error('Failed to update room availability:', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to update availability');
    } finally {
      setIsUpdatingPresence(false);
    }
  }, [roomId, handleAuthError]);

  const handleExitRoom = useCallback(async () => {
    const numericRoomId = parseInt(roomId, 10);
    if (!Number.isNaN(numericRoomId)) {
      try {
        await roomService.checkOut(numericRoomId);
      } catch (err) {
        console.error('Room check-out failed:', err);
      }
    }
    router.push('/consultation/start');
  }, [roomId, router]);

  useEffect(() => {
    if (!ready) return;
    void loadRoomData();
  }, [roomId, ready, currentUser?.id]);

  // Keep doctor presence alive while in the room (auto-away after backend stale timeout).
  useEffect(() => {
    const numericRoomId = parseInt(roomId, 10);
    if (Number.isNaN(numericRoomId)) return;
    if (presenceStatus === 'away') return;

    const sendHeartbeat = () => {
      void roomService.heartbeat(numericRoomId).then((updated) => {
        setPresenceStatus((updated.my_presence_status || updated.presence_status || 'away') as RoomPresenceStatus);
        setAcceptingPatients(updated.my_accepting_patients ?? updated.accepting_patients === true);
      }).catch((err) => {
        console.error('Room heartbeat failed:', err);
      });
    };

    sendHeartbeat();
    const intervalId = window.setInterval(sendHeartbeat, ROOM_PRESENCE_HEARTBEAT_MS);
    return () => window.clearInterval(intervalId);
  }, [roomId, presenceStatus]);

  // Auto-refresh queue while waiting (no active consultation patient)
  useEffect(() => {
    const numericRoomId = parseInt(roomId, 10);
    if (Number.isNaN(numericRoomId)) return;
    if (sessionActive && currentPatient) return;

    const intervalMs = 15000;
    const id = window.setInterval(() => {
      void refreshQueueData({ silent: true });
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [roomId, sessionActive, currentPatient, refreshQueueData]);

  // Auto-save medical notes every 30 seconds
  useEffect(() => {
    if (!sessionActive || !sessionId) return;

    const autoSave = async () => {
      try {
        await consultationService.updateSession(sessionId, {
          history_of_presenting_illness: medicalNotes.historyOfPresentIllness || '',
          physical_examination: medicalNotes.physicalExamination || '',
          assessment: medicalNotes.assessment || '',
          plan: medicalNotes.plan || '',
        });
        debugConsultationRoom('Auto-saved medical notes');
      } catch (err) {
        console.error('Auto-save failed:', err);
      }
    };

    if (
      medicalNotes.historyOfPresentIllness ||
      medicalNotes.physicalExamination ||
      medicalNotes.assessment ||
      medicalNotes.plan
    ) {
      void autoSave();
    }

    const interval = setInterval(autoSave, 30000);
    return () => clearInterval(interval);
  }, [sessionActive, sessionId, medicalNotes]);

  // Generate consultation session PDF
  const generateSessionPDF = async () => {
    if (!currentPatient || !sessionId) return null;
    
    try {
      // Load fresh session data from database to ensure we have latest info
      const freshSession = await consultationService.getSession(sessionId);

    const sessionData = {
      id: freshSession.session_id || sessionId,
      date: freshSession.started_at ? toApiDateFromInstant(freshSession.started_at) : todayApiDateString(),
      time: freshSession.started_at ? `${formatTime(freshSession.started_at)} - ${freshSession.ended_at ? formatTime(freshSession.ended_at) : formatTime(new Date().toISOString())}` : '',
      duration: `${Math.round((Number((freshSession as any).active_duration_seconds ?? 0) || 0) / 60) || sessionDuration} min`,
      clinic: getVisitServiceClinicsDisplay({
        clinic: (freshSession as any).clinic_name,
        clinics: (freshSession as any).visit_clinics,
      }),
      room: freshSession.room_name || room?.name || '',
      doctor: freshSession.doctor_name || '',
      doctorSpecialty: room?.specialtyFocus || '',
      patient: {
        name: currentPatient.name,
        patientId: currentPatient.patientId,
        age: currentPatient.age,
        gender: currentPatient.gender
      },
      vitals: currentPatient.vitals,
      medicalNotes: medicalNotes,
      prescriptions: prescriptions,
      labOrders: labOrders,
      nursingOrders: nursingOrders,
      referrals: sessionReferrals,
      radiologyOrders: radiologyOrders,
      followUp: followUpRequired ? { date: followUpDate, reason: followUpReason } : null,
      pdfGenerated: true,
      pdfUrl: `/documents/consultation-${sessionId}.pdf`
    };
    
    // In a real implementation, this would call an API to generate the PDF
    // For now, we'll simulate PDF generation
    debugConsultationRoom('Generating PDF for session:', sessionData);
    return sessionData;
    } catch (error) {
      console.error('Error generating session PDF:', error);
      return null;
    }
  };

  const handleIssueCertificate = useCallback(async () => {
    if (!currentPatient?.id) {
      toast.error('No patient in session.');
      return;
    }
    const patientPk = Number(currentPatient.id);
    if (!Number.isFinite(patientPk) || patientPk <= 0) {
      toast.error('Patient record is not available.');
      return;
    }
    try {
      const apiPatient = await patientService.getPatient(patientPk);
      setCertificatePatient(apiPatient);
      setCertDialogOpen(true);
    } catch {
      toast.error('Failed to load patient for certificate.');
    }
  }, [currentPatient?.id]);

  const viewSessionDetails = async (session: { id: number }) => {
    setIsConsultationReportLoading(true);
    setConsultationReportSession(null);
    try {
      const reportSession = await loadConsultationReportSession(Number(session.id));
      setConsultationReportSession(reportSession);
    } catch {
      toast.error('Failed to load consultation report.');
    } finally {
      setIsConsultationReportLoading(false);
    }
  };

  // View lab result details (shared Lab Report dialog with Laboratory → Completed Tests)
  const viewLabResultDetails = (labResult: LabTestResult) => {
    setSelectedCompletedLabTest(transformApiRowToCompletedTest(labResult as any, 'tests'));
    setShowLabResultViewer(true);
  };

  // View imaging report (shared Radiology Report dialog with Radiology → Completed Studies)
  const viewImagingReportDetails = (img: ServiceRadiologyReport) => {
    setSelectedCompletedRadiologyReport(transformApiRadiologyReportToCompleted(img as any));
    setShowRadiologyReportViewer(true);
  };

  // View prescription details
  const viewPrescriptionDetails = (prescription: any) => {
    setSelectedPrescription(prescription);
    setShowPrescriptionViewer(true);
  };

  const confirmEndSession = async () => {
    setIsEnding(true);
    
    try {
      if (!sessionId) {
        throw new Error('No active session to end');
      }

      if (followUpRequired && !followUpDate) {
        throw new Error('Please select a follow-up date before ending the session.');
      }

      // Step 1: Deactivate queue item if patient was in queue
      // Now safe with the new conditional unique constraint
      if (currentPatient?.id) {
        try {
          debugConsultationRoom('Attempting to deactivate queue item for patient:', currentPatient.id);
          const queueData = await consultationService.getQueue({
            room: parseInt(roomId),
            patient: typeof currentPatient.id === 'string' ? parseInt(currentPatient.id) : currentPatient.id,
            is_active: true,
          });
          
          if (queueData.results && queueData.results.length > 0) {
            const queueItem = queueData.results[0];
            debugConsultationRoom('Found queue item to deactivate:', {
              id: queueItem.id,
              patient: queueItem.patient,
              room: queueItem.room,
              is_active: queueItem.is_active,
            });
            
            try {
              debugConsultationRoom('Sending POST request to call/deactivate queue item:', `/consultation/queue/${queueItem.id}/call/`);
              await apiFetch(`/consultation/queue/${queueItem.id}/call/`, {
                method: 'POST',
              });
              debugConsultationRoom('Queue item deactivated successfully');
            } catch (deactivateErr: any) {
              // Log but don't fail - queue deactivation is not critical
              console.warn('Could not deactivate queue item (non-critical):', {
                queueItemId: queueItem.id,
                error: deactivateErr?.message,
              });
            }
          } else {
            debugConsultationRoom('No active queue items found for patient');
          }
        } catch (err) {
          console.error('Error fetching queue items:', err);
          // Don't fail the entire process if queue lookup fails
        }
      }

      // Step 2: Ensure at least one diagnosis is present before ending session
      try {
        if (!sessionId) throw new Error('Session ID is required');
        const hasDiagnosis = await consultationService.sessionHasDiagnosis(sessionId);
        if (!hasDiagnosis) {
          throw new Error('Please add at least one ICD-10 diagnosis before ending the session.');
        }
      } catch (err: any) {
        if (err?.message?.includes('Please add at least one ICD-10 diagnosis')) {
          throw err;
        }
        console.error('Error validating diagnosis before ending session:', err);
        throw new Error('Unable to verify diagnosis. Please try again.');
      }

      // Step 3: Create follow-up appointment (after diagnosis check; reason optional — empty reason skipped creation before)
      if (followUpRequired && followUpDate && currentPatient && sessionId) {
        const trimmedReason = (followUpReason || '').trim();
        const reasonForAppt = trimmedReason || 'Follow-up visit';
        try {
          const patientId = typeof currentPatient.id === 'string' ? parseInt(currentPatient.id, 10) : currentPatient.id;
          const followUpClinicNames = getVisitServiceClinicsList({
            clinic: currentPatient.visitClinic,
            clinics: currentPatient.clinics,
          })
            .map((c) => normalizeClinicName(c, opdClinicNames))
            .filter((c): c is string => Boolean(c));
          if (followUpClinicNames.length === 0) {
            toast.warning('Follow-up appointment was not saved (no service clinics on this visit).');
          } else {
            const followUpClinicId = opdClinicTypes.find((t) => t.name === followUpClinicNames[0])?.id;
            if (!followUpClinicId) {
              toast.warning('Follow-up appointment was not saved (unknown service clinic).');
            } else {
              await appointmentService.createAppointment({
                patient: patientId,
                appointment_type: 'follow_up',
                clinic: followUpClinicId,
                appointment_date: followUpDate,
                appointment_time: '09:00:00',
                duration_minutes: 30,
                reason: reasonForAppt,
                notes: `Follow-up from consultation session ${sessionId}. Reason: ${reasonForAppt}`,
              });
              debugConsultationRoom('Follow-up appointment created');
              toast.success('Follow-up appointment saved', {
                description: `${reasonForAppt} — ${followUpDate}. View it under Medical Records → Appointments.`,
              });
            }
          }
        } catch (apptError: any) {
          const msg = apptError?.message || 'Could not create follow-up appointment';
          console.warn('Could not create follow-up appointment:', msg);
          toast.error('Follow-up appointment was not saved (session will still end)', {
            description: msg,
          });
        }
      }

      // Step 4: If there's a draft observation admission order, send it before ending session
      if (draftObservationCount > 0) {
        await sendNursingOrdersToNursing({ silentIfNoDraft: true });
      }

      // Step 5: End the session using the dedicated endpoint
      try {
        if (!sessionId) throw new Error('Session ID is required');
        debugConsultationRoom('Ending session with ID:', sessionId);
        await consultationService.endSession(sessionId);
        debugConsultationRoom('Session ended successfully');
      } catch (err: any) {
        console.error('Error ending session:', {
          sessionId,
          error: err,
          message: err?.message,
          response: err?.response,
          status: err?.status,
        });
        // Provide more helpful error message
        let errorMessage = 'Failed to end session';
        if (err?.message?.includes('404')) {
          errorMessage = 'Session not found - it may have already been completed';
        } else if (err?.message?.includes('400')) {
          errorMessage = 'Invalid session state - session may already be completed';
        }
        throw new Error(errorMessage);
      }
      
      // Generate PDF for the session
      const sessionPDF = await generateSessionPDF();
      if (sessionPDF) {
        toast.success("Consultation report generated", {
          description: `Session ${sessionPDF.id} saved to patient history`,
          action: {
            label: "View",
            onClick: () => {
              // Open session details in a new view or download
              // For now, navigate to consultation history where the session can be viewed
              window.open(`/consultation/history?session=${sessionPDF.id}`, '_blank');
            }
          }
        });
      }
      
      if (draftObservationCount > 0) {
        toast.success("Session ended and patient handed off to Nursing Observation Queue");
      } else {
        toast.success("Consultation session completed successfully");
      }
      setPatients((prev) => prev.filter((p) => p.id !== currentPatient?.id));
      if (room) {
        setRoom({ ...room, totalConsultationsToday: room.totalConsultationsToday + 1, averageConsultationTime: Math.round((room.averageConsultationTime * room.totalConsultationsToday + sessionDuration) / (room.totalConsultationsToday + 1)) });
      }
      clearSessionState();
      setShowEndDialog(false);
      await loadPausedSessions();
    } catch (err: any) {
      console.error('Error ending session:', err);
      toast.error(err.message || 'Failed to end session properly');
    } finally {
      setIsEnding(false);
    }
  };

  const handleMarkQueuePatientLeft = async (patient: Patient) => {
    if (!window.confirm(`Mark ${patient.name} as left?\n\nThey will be removed from the active queue.`)) return;
    setIsMarkingLeft(true);
    try {
      if (!patient.queueItemId) throw new Error('Queue row not found for this patient');
      await consultationService.markQueuePatientLeft(patient.queueItemId, {
        reason: 'Patient left before being seen',
      });
      toast.success(`${patient.name} marked as left`);
      await refreshQueueData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to mark patient as left');
    } finally {
      setIsMarkingLeft(false);
    }
  };

  const handleEndSessionNotSeen = async () => {
    if (!sessionId || !currentPatient) {
      toast.error('No active session to end');
      return;
    }
    setLeftWorkflowTarget({ kind: 'session' });
    setLeftWorkflowReason('Patient left during consultation');
    setShowLeftWorkflowDialog(true);
  };

  const confirmLeftWorkflowAction = async () => {
    if (!leftWorkflowTarget) return;
    setIsMarkingLeft(true);
    try {
      if (leftWorkflowTarget.kind === 'queue') {
        const patient = leftWorkflowTarget.patient;
        if (!patient.queueItemId) throw new Error('Queue row not found for this patient');
        await consultationService.markQueuePatientLeft(patient.queueItemId, {
          reason: leftWorkflowReason.trim(),
        });
        toast.success(`${patient.name} marked as left`);
        await refreshQueueData();
      } else {
        if (!sessionId) throw new Error('No active session to end');
        await consultationService.endSessionNotSeen(sessionId, {
          reason: leftWorkflowReason.trim(),
        });
        toast.success('Session ended as not seen');
        resetSessionTiming();
        setCurrentPatient(null);
        await refreshQueueData();
      }
      setShowLeftWorkflowDialog(false);
      setLeftWorkflowTarget(null);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to complete action');
    } finally {
      setIsMarkingLeft(false);
    }
  };


  const confirmDischargePatient = async () => {
    if (!currentPatient) return;

    try {
      const activeAdmission = wardAdmissions.find((admission) => admission.status === 'admitted');
      if (!activeAdmission) {
        toast.error('No active admission found');
        return;
      }

      await apiFetch(`/admissions/${activeAdmission.id}/discharge/`, {
        method: 'POST',
        body: JSON.stringify({
          discharge_type: dischargeData.discharge_type,
          discharge_doctor: currentUser?.id ? Number(currentUser.id) : undefined,
          discharge_diagnosis: dischargeData.discharge_diagnosis,
          discharge_notes: dischargeData.discharge_notes,
          discharge_summary: dischargeData.discharge_summary,
          follow_up_instructions: dischargeData.follow_up_instructions,
        }),
      });

      toast.success('Patient discharged successfully');
      setShowDischargeDialog(false);
      setDischargeData({
        discharge_type: 'regular',
        discharge_diagnosis: '',
        discharge_notes: '',
        discharge_summary: '',
        follow_up_instructions: '',
      });

      const updatedAdmissions = await wardService.getAdmissions({ patient: Number(currentPatient.id) });
      setWardAdmissions(updatedAdmissions?.results || []);
    } catch (error: any) {
      console.error('Error discharging patient:', error);
      toast.error(error.message || 'Failed to discharge patient');
    }
  };



  if (loading) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading consultation room...</p>
          </div>
        </div>
      </DashboardLayout>
    ); 
  }
  
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-600 mb-2">Error Loading Room</h2>
            <p className="text-muted-foreground mb-4">{error || 'Unknown error'}</p>
            <Button onClick={() => router.push("/consultation/start")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to Room Selection
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  if (!room) { 
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Room Not Found</h2>
            <p className="text-muted-foreground mb-4">The consultation room could not be found.</p>
            <Button onClick={() => router.push("/consultation/start")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to Room Selection
            </Button>
          </div>
        </div>
      </DashboardLayout>
    ); 
  }


  const roomQueueDialog = (
    <ConsultationRoomQueueDialog
      open={showRoomPatientsDialog}
      onOpenChange={setShowRoomPatientsDialog}
      roomName={room?.name}
      tab={roomPatientsDialogTab}
      onTabChange={setRoomPatientsDialogTab}
      loading={loadingRoomPatientsDialog}
      patients={patients}
      roomQueueWaitingCount={roomQueueWaitingCount}
      roomQueueDialogEntries={roomQueueDialogEntries}
      pausedSessionsSorted={pausedSessionsSorted}
      pausedSessionsTotalCount={pausedSessionsTotalCount}
      pausedSessionsListIncomplete={pausedSessionsListIncomplete}
      pausedSessionsUnknownTotal={pausedSessionsUnknownTotal}
      isStartingSession={isStartingSession}
      isResumingPausedSession={isResumingPausedSession}
      isMarkingLeft={isMarkingLeft}
      endingPausedSessionId={endingPausedSessionId}
      onQueuePatientAction={handleQueuePatientAction}
      onMarkPatientLeft={handleMarkQueuePatientLeft}
      onResumePausedSession={handleResumePausedSession}
      onEndPausedSession={handleEndPausedSession}
    />
  );

  if (!sessionActive || !currentPatient) {
    return (
      <DashboardLayout>
        <ConsultationRoomIdleView
          room={room}
          patients={patients}
          pausedSessionCount={pausedSessions.length}
          roomQueueWaitingCount={roomQueueWaitingCount}
          isStartingSession={isStartingSession}
          isResumingPausedSession={isResumingPausedSession}
          isMarkingLeft={isMarkingLeft}
          presenceStatus={presenceStatus}
          acceptingPatients={acceptingPatients}
          isUpdatingPresence={isUpdatingPresence}
          findPausedSessionsForPatient={findPausedSessionsForPatient}
          onOpenQueueDialog={openRoomPatientsDialog}
          onQueuePatientAction={handleQueuePatientAction}
          onMarkPatientLeft={handleMarkQueuePatientLeft}
          onToggleAccepting={handleToggleAccepting}
          onExitRoom={handleExitRoom}
        />
        {roomQueueDialog}
      </DashboardLayout>
    );
  }

  // Active Session View
  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {currentPatient && (
          <ConsultationRoomActiveHeader
            room={room}
            patient={currentPatient}
            sessionDuration={sessionDuration}
            roomQueueWaitingCount={roomQueueWaitingCount}
            pausedSessionCount={pausedSessions.length}
            isMarkingLeft={isMarkingLeft}
            wardAdmissions={wardAdmissions}
            onOpenQueueDialog={() => openRoomPatientsDialog('waiting')}
            onEndSessionNotSeen={handleEndSessionNotSeen}
            onShowEndDialog={() => setShowEndDialog(true)}
            onShowDischargeDialog={() => setShowDischargeDialog(true)}
          />
        )}

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <ConsultationRoomSessionTabList patient={currentPatient} />


          <ConsultationRoomAnnualCheckupTab
            patient={currentPatient}
            sessionId={sessionId}
            capabilities={currentUser?.capabilities}
            isSuperuser={currentUser?.isSuperuser}
            onNavigateTab={setActiveTab}
            onPatientRecordUpdated={({ bloodGroup, genotype }) => {
              setCurrentPatient((prev) =>
                prev
                  ? {
                      ...prev,
                      bloodGroup: bloodGroup ?? prev.bloodGroup,
                      genotype: genotype ?? prev.genotype,
                    }
                  : prev
              );
            }}
          />

          <ConsultationRoomNotesTab
            medicalNotes={medicalNotes}
            onMedicalNotesChange={setMedicalNotes}
            presentationComplaintSearch={presentationComplaintSearch}
            onPresentationComplaintSearchChange={setPresentationComplaintSearch}
            presentingComplaintLibrary={presentingComplaintLibrary}
            filteredPresentationComplaintGroups={filteredPresentationComplaintGroups}
            selectedPresentingComplaintSet={selectedPresentingComplaintSet}
            onTogglePresentationComplaint={togglePresentationComplaintSelection}
            diagnoses={diagnoses}
            onDiagnosesChange={setDiagnoses}
            onShowAddDiagnosis={() => setShowAddDiagnosis(true)}
            sessionId={sessionId}
            currentPatient={currentPatient}
            onSessionUpdated={(session) => setSelectedSession(session as ExtendedConsultationSession)}
          />

          <ConsultationRoomPrescriptionsTab
            prescriptions={prescriptions}
            currentPatient={currentPatient}
            onAddPrescription={() => openAddPrescriptionModal()}
            onShowRefill={() => setShowPrescriptionRefill(true)}
            onSendToPharmacy={sendPrescriptionsToPharmacy}
            onEditPrescription={editPrescription}
            onRemovePrescription={(index) => setPrescriptions(prescriptions.filter((_, i) => i !== index))}
            onCancelSentPrescription={cancelSentPrescription}
          />


          <ConsultationRoomLabTab
            labOrders={labOrders}
            onShowAddLabOrder={() => setShowAddLabOrder(true)}
            onSendToLab={sendLabOrdersToLab}
            onEditLabOrder={editLabOrder}
            onRemoveLabOrder={(index) => setLabOrders(labOrders.filter((_, i) => i !== index))}
          />


          <ConsultationRoomPhysioTab
            physioOrders={physioOrders}
            physioOrdersFromApi={physioOrdersFromApi}
            onShowAddPhysio={() => setShowAddPhysio(true)}
            onSendToPhysio={sendPhysioOrders}
            onEditPhysioOrder={editPhysioOrder}
            onRemovePhysioOrder={(index) => setPhysioOrders((prev) => prev.filter((_, i) => i !== index))}
          />


          <ConsultationRoomEyecareTab
            eyeOrders={eyeOrders}
            eyeOrdersFromApi={eyeOrdersFromApi}
            onShowAddEyeOrder={() => setShowAddEye(true)}
            onSendToEye={sendEyeOrders}
            onEditEyeOrder={editEyeOrder}
            onRemoveEyeOrder={(index) => setEyeOrders((prev) => prev.filter((_, i) => i !== index))}
          />


          <ConsultationRoomNursingTab
            nursingOrders={nursingOrders}
            currentPatient={currentPatient}
            draftObservationCount={draftObservationCount}
            onShowAddNursingOrder={() => {
              loadWards();
              setShowAddNursingOrder(true);
            }}
            onSendToNursing={() => void sendNursingOrdersToNursing()}
            onEditNursingOrder={editNursingOrder}
            onRemoveNursingOrder={(orderId) => setNursingOrders(nursingOrders.filter((o) => o.id !== orderId))}
          />


          <ConsultationRoomRadiologyTab
            radiologyOrders={radiologyOrders}
            onShowAddRadiology={() => setShowAddRadiology(true)}
            onSendToRadiology={sendRadiologyOrders}
            onEditRadiologyOrder={editRadiologyOrder}
            onRemoveRadiologyOrder={(orderId) => setRadiologyOrders(radiologyOrders.filter((o) => o.id !== orderId))}
          />


          <ConsultationRoomReferralTab
            sessionReferrals={sessionReferrals}
            sessionReferralsLoading={sessionReferralsLoading}
            onShowAddReferral={() => setShowAddReferral(true)}
            onOpenReferralView={openReferralView}
            onReferralUpdated={bumpReferralHistory}
          />


          <ConsultationRoomHistoryTab
            currentPatient={currentPatient}
            patientHistorySnapshot={patientHistorySnapshot}
            historyReloadToken={historyReloadToken}
            onViewConsultation={viewSessionDetails}
            onViewLab={viewLabResultDetails}
            onViewImaging={viewImagingReportDetails}
            onViewPrescription={viewPrescriptionDetails}
            onViewVital={viewVitalsDetails}
            onViewPhysio={openPhysioOrderDialog}
            onViewEyeOrder={(o) => {
              setEyeSessionReportOrderId(o.id);
              setEyeSessionReportOpen(true);
            }}
            onViewWard={(a) => {
              setSelectedWardAdmission(a as WardAdmission);
              setShowWardAdmissionDetail(true);
            }}
            onIssueCertificate={() => {
              void handleIssueCertificate();
            }}
            onViewReferral={(r) => r?.id != null && openReferralView(Number(r.id))}
            onReferralUpdated={bumpReferralHistory}
            onEditMedicalHistory={() => setShowEditMedicalHistory(true)}
          />

        </Tabs>
        <ConsultationRoomOrderDialogs workspace={orderDialogsWorkspace} />
        {roomQueueDialog}
        <ConsultationRoomSessionDialogs
          showEndDialog={showEndDialog}
          setShowEndDialog={setShowEndDialog}
          isEnding={isEnding}
          confirmEndSession={confirmEndSession}
          draftObservationCount={draftObservationCount}
          currentPatient={currentPatient}
          followUpRequired={followUpRequired}
          setFollowUpRequired={setFollowUpRequired}
          followUpDate={followUpDate}
          setFollowUpDate={setFollowUpDate}
          followUpReason={followUpReason}
          setFollowUpReason={setFollowUpReason}
          sessionDuration={sessionDuration}
          room={room}
          prescriptions={prescriptions}
          labOrders={labOrders}
          radiologyOrders={radiologyOrders}
          nursingOrders={nursingOrders}
          sessionReferrals={sessionReferrals}
          showSwitchPatientDialog={showSwitchPatientDialog}
          setShowSwitchPatientDialog={setShowSwitchPatientDialog}
          pendingSwitchPatient={pendingSwitchPatient}
          setPendingSwitchPatient={setPendingSwitchPatient}
          confirmSwitchPatientStart={confirmSwitchPatientStart}
          pausedDuplicateStartDialog={pausedDuplicateStartDialog}
          setPausedDuplicateStartDialog={setPausedDuplicateStartDialog}
          isEndingPausedForNewStart={isEndingPausedForNewStart}
          isResumingPausedSession={isResumingPausedSession}
          handlePausedDuplicateEndAndStart={handlePausedDuplicateEndAndStart}
          handlePausedDuplicateResume={handlePausedDuplicateResume}
          showLeftWorkflowDialog={showLeftWorkflowDialog}
          setShowLeftWorkflowDialog={setShowLeftWorkflowDialog}
          leftWorkflowTarget={leftWorkflowTarget}
          setLeftWorkflowTarget={setLeftWorkflowTarget}
          leftWorkflowReason={leftWorkflowReason}
          setLeftWorkflowReason={setLeftWorkflowReason}
          isMarkingLeft={isMarkingLeft}
          confirmLeftWorkflowAction={confirmLeftWorkflowAction}
        />

        <ConsultationRoomWardAdmissionDialog
          open={showWardAdmissionDetail}
          onOpenChange={setShowWardAdmissionDetail}
          selectedWardAdmission={selectedWardAdmission}
        />

        <ConsultationRoomReportDialogs
          consultationReportSession={consultationReportSession}
          setConsultationReportSession={setConsultationReportSession}
          isConsultationReportLoading={isConsultationReportLoading}
          showLabResultViewer={showLabResultViewer}
          setShowLabResultViewer={setShowLabResultViewer}
          selectedCompletedLabTest={selectedCompletedLabTest}
          setSelectedCompletedLabTest={setSelectedCompletedLabTest}
          showRadiologyReportViewer={showRadiologyReportViewer}
          setShowRadiologyReportViewer={setShowRadiologyReportViewer}
          selectedCompletedRadiologyReport={selectedCompletedRadiologyReport}
          setSelectedCompletedRadiologyReport={setSelectedCompletedRadiologyReport}
          showPrescriptionViewer={showPrescriptionViewer}
          setShowPrescriptionViewer={setShowPrescriptionViewer}
          selectedPrescription={selectedPrescription}
          setSelectedPrescription={setSelectedPrescription}
          currentPatient={currentPatient}
          isVitalsDetailModalOpen={isVitalsDetailModalOpen}
          setIsVitalsDetailModalOpen={setIsVitalsDetailModalOpen}
          selectedVital={selectedVital}
        />

        <ConsultationRoomEditMedicalHistoryDialog
          open={showEditMedicalHistory}
          onOpenChange={setShowEditMedicalHistory}
          currentPatient={currentPatient}
          medicalHistory={medicalHistory}
          setMedicalHistory={setMedicalHistory}
          loadingMedicalHistory={loadingMedicalHistory}
          setLoadingMedicalHistory={setLoadingMedicalHistory}
        />
      </div>

      <ConsultationRoomDischargeDialog
        open={showDischargeDialog}
        onOpenChange={setShowDischargeDialog}
        currentPatient={currentPatient}
        dischargeData={dischargeData}
        setDischargeData={setDischargeData}
        onConfirmDischarge={confirmDischargePatient}
      />

      <ConsultationRoomPhysioOrderViewDialog
        open={isPhysioOrderDialogOpen}
        onOpenChange={setIsPhysioOrderDialogOpen}
        selectedPhysioOrder={selectedPhysioOrder}
        physioOrderSessions={physioOrderSessions}
        loadingPhysioSessions={loadingPhysioSessions}
      />

      <ConsultationRoomTailDialogs
        eyeSessionReportOpen={eyeSessionReportOpen}
        setEyeSessionReportOpen={setEyeSessionReportOpen}
        eyeSessionReportOrderId={eyeSessionReportOrderId}
        referralViewOpen={referralViewOpen}
        setReferralViewOpen={setReferralViewOpen}
        referralViewId={referralViewId}
        referralViewRefreshKey={referralViewRefreshKey}
        bumpReferralHistory={bumpReferralHistory}
        certDialogOpen={certDialogOpen}
        setCertDialogOpen={setCertDialogOpen}
        certificatePatient={certificatePatient}
        setCertificatePatient={setCertificatePatient}
        setHistoryReloadToken={setHistoryReloadToken}
      />

    </DashboardLayout>
  );
}
