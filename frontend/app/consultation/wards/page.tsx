"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { WardDoctorOrdersSection } from '@/components/ward/WardDoctorOrdersSection';
import {
  userCanAddWardDoctorOrders,
  userCanEditCancelWardOrders,
} from '@/lib/ward-order-permissions';
import { useWardAdmissionDateParams } from '@/hooks/use-ward-admission-date-params';
import { WARD_ACTIVE_STATUS_IN } from '@/lib/ward/ward-admission-list-params';
import { ProgressNotesTimeline } from '@/components/ward/ProgressNotesTimeline';
import { PatientHistoryTabs } from '@/components/patient-history/PatientHistoryTabs';
import { WardAdmissionDocumentsMenu } from '@/components/ward/WardAdmissionDocumentsMenu';
import { WardLatestHandoverCard } from '@/components/ward/WardLatestHandoverCard';
import { WardVitalsHistory } from '@/components/ward/WardVitalsHistory';
import {
  type WardDoctorDetailsTab,
  isEscalatedCondition,
  resolveWardHandoffInstructions,
} from '@/lib/ward-admission-ui';
import {
  Users, Search, Eye, AlertTriangle, CheckCircle,
  Bed, Loader2, FileText, Send, History,
  TestTube, ScanLine, Activity, ArrowUpRight,
} from 'lucide-react';
import { LabOrderModal, type LabOrderSubmitInput } from '@/components/consultation/orders/LabOrderModal';
import { RadiologyOrderModal, type RadiologyOrderSubmitInput } from '@/components/consultation/orders/RadiologyOrderModal';
import { PhysioOrderModal, type PhysioOrderSubmitInput } from '@/components/consultation/orders/PhysioOrderModal';
import { NewEyeOrderModal } from '@/components/eyecare/NewEyeOrderModal';
import { WardCreateReferralDialog } from '@/components/ward/WardCreateReferralDialog';
import { useWardOrders } from '@/hooks/use-ward-orders';
import { FacilityPartnerSelect, type FacilityPartnerSelectValue } from '@/components/referrals/FacilityPartnerSelect';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { resolvePatientPhoto } from '@/lib/patient-photo';
import { toast } from 'sonner';
import { formatDisplayDateMedium, formatDisplayDateTime } from '@/lib/dates';
import { wardService, type Ward, type PatientAdmission, type WardAssignment } from '@/lib/services/ward-service';
import { useConsultationPageAuth } from '@/hooks/use-consultation-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ResetFiltersButton } from '@/components/shared/ResetFiltersButton';
import { useServerToday } from '@/hooks/use-server-today';
import { MODAL_SIZES, modalNoOverflow } from '@/components/ui/modal-sizes';
import { useRouter } from 'next/navigation';

const formatAdmissionTypeLabel = (type?: string | null): string | null => {
  if (!type) return null;
  const labels: Record<string, string> = {
    observation: 'Observation',
    daycare_observation: 'Day care',
    emergency: 'Emergency',
    elective: 'Elective',
    transfer: 'Transfer',
    readmission: 'Readmission',
  };
  return labels[type] || type.replace(/_/g, ' ');
};

export default function WardRoundsPage() {
  const { ready, currentUser, handleAuthError } = useConsultationPageAuth();
  const serverToday = useServerToday();
  const [wards, setWards] = useState<Ward[]>([]);
  const [admissions, setAdmissions] = useState<PatientAdmission[]>([]);
  const [assignments, setAssignments] = useState<WardAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [admissionsPage, setAdmissionsPage] = useState(1);
  const [admissionsPageSize, setAdmissionsPageSize] = useState(25);
  const [admissionsTotal, setAdmissionsTotal] = useState(0);
  const [kpiAdmittedTotal, setKpiAdmittedTotal] = useState(0);
  const [kpiPendingDischargeTotal, setKpiPendingDischargeTotal] = useState(0);
  const [kpiEscalatedTotal, setKpiEscalatedTotal] = useState(0);
  const [kpiUnassignedBedTotal, setKpiUnassignedBedTotal] = useState(0);

  // Filters
  const [selectedWard, setSelectedWard] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  // Client-side filter — escalated patients are detected via current_condition
  // text rather than a backend `status`, so a dedicated toggle keeps the API
  // filters simple and the stat-card click-through accurate.
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [unassignedBedOnly, setUnassignedBedOnly] = useState(false);
  // Default tab the admission details dialog should open on. Lets us deep-link
  // from per-row quick actions (View / Orders / Notes) without juggling refs.
  const [detailsTab, setDetailsTab] = useState<WardDoctorDetailsTab>('overview');

  // Progress note form
  const [progressNote, setProgressNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);

  // Dialog states
  const [showAdmissionDetails, setShowAdmissionDetails] = useState(false);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<PatientAdmission | null>(null);

  // Discharge form
  const [dischargeData, setDischargeData] = useState({
    discharge_type: 'regular',
    discharge_diagnosis: '',
    discharge_notes: '',
    follow_up_instructions: '',
  });
  const [dischargeErrors, setDischargeErrors] = useState<{
    discharge_diagnosis?: string;
    referral_facility?: string;
    referral_specialty?: string;
    referral_reason?: string;
  }>({});

  // Optional external-care referral block, expanded when discharge_type
  // is "transfer" or the doctor explicitly enables it.
  const [referralEnabled, setReferralEnabled] = useState(false);
  const [referralFacility, setReferralFacility] = useState<FacilityPartnerSelectValue>({
    partnerId: null,
    facility: '',
    facility_type: 'external',
  });
  const [referralForm, setReferralForm] = useState({
    specialty: '',
    reason: '',
    clinical_summary: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'emergency',
    contact_person: '',
    contact_phone: '',
    notes: '',
  });
  const [isSubmittingDischarge, setIsSubmittingDischarge] = useState(false);
  const [dischargeStep, setDischargeStep] = useState<1 | 2>(1);

  // Edit / cancel for the linked external referral, separate from the
  // initiate-discharge state pieces so opening one dialog doesn't clobber
  // the other. Only relevant while an admission is `pending_discharge`.
  const [editReferralOpen, setEditReferralOpen] = useState(false);
  const [editReferralFacility, setEditReferralFacility] = useState<FacilityPartnerSelectValue>({
    partnerId: null,
    facility: '',
    facility_type: 'external',
  });
  const [editReferralForm, setEditReferralForm] = useState({
    specialty: '',
    reason: '',
    clinical_summary: '',
    urgency: 'routine' as 'routine' | 'urgent' | 'emergency',
    contact_person: '',
    contact_phone: '',
    notes: '',
  });
  const [isSavingReferralEdit, setIsSavingReferralEdit] = useState(false);
  const [cancelReferralOpen, setCancelReferralOpen] = useState(false);
  const [cancelReferralReason, setCancelReferralReason] = useState('');
  const [isCancellingReferral, setIsCancellingReferral] = useState(false);

  // Full order suite (lab / imaging / physio / eye / referral) open state.
  // Prescriptions are created inside WardDoctorOrdersSection with its own flow.
  const [labOrderOpen, setLabOrderOpen] = useState(false);
  const [radiologyOrderOpen, setRadiologyOrderOpen] = useState(false);
  const [physioOrderOpen, setPhysioOrderOpen] = useState(false);
  const [eyeOrderOpen, setEyeOrderOpen] = useState(false);
  const [referralOrderOpen, setReferralOrderOpen] = useState(false);

  const resetDischargeForm = () => {
    setDischargeData({
      discharge_type: 'regular',
      discharge_diagnosis: '',
      discharge_notes: '',
      follow_up_instructions: '',
    });
    setReferralEnabled(false);
    setReferralFacility({ partnerId: null, facility: '', facility_type: 'external' });
    setReferralForm({
      specialty: '',
      reason: '',
      clinical_summary: '',
      urgency: 'routine',
      contact_person: '',
      contact_phone: '',
      notes: '',
    });
    setDischargeErrors({});
    setDischargeStep(1);
  };

  const buildDateParams = useWardAdmissionDateParams({
    dateFilter,
    dateRange,
    serverToday,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    try {
      const wardsResponse = await wardService.getWards();
      setWards(wardsResponse.results || []);
    } catch (error: unknown) {
      console.error('Error fetching wards:', error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : 'Unable to load wards.');
    }

    const dateParams = buildDateParams();
    const kpiBase = {
      ...dateParams,
      ...(selectedWard !== 'all' ? { ward: parseInt(selectedWard, 10) } : {}),
      ...(typeFilter !== 'all' ? { admission_type: typeFilter } : {}),
      ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
    };

    try {
      const stats = await wardService.getAdmissionListStats(kpiBase);
      setKpiAdmittedTotal(stats.admitted ?? 0);
      setKpiPendingDischargeTotal(stats.pending_discharge ?? 0);
      setKpiEscalatedTotal(stats.escalated ?? 0);
      setKpiUnassignedBedTotal(stats.unassigned_bed ?? 0);
    } catch (error: unknown) {
      console.error('Error fetching admission KPI counts:', error);
      if (handleAuthError(error)) return;
      setKpiAdmittedTotal(0);
      setKpiPendingDischargeTotal(0);
      setKpiEscalatedTotal(0);
      setKpiUnassignedBedTotal(0);
    }

    try {
      const ACTIVE_STATUSES = WARD_ACTIVE_STATUS_IN;
      const listParams = {
        ...dateParams,
        page: admissionsPage,
        page_size: admissionsPageSize,
        ...(statusFilter !== 'all'
          ? { status: statusFilter }
          : { status_in: ACTIVE_STATUSES }),
        ...(selectedWard !== 'all' ? { ward: parseInt(selectedWard, 10) } : {}),
        ...(typeFilter !== 'all' ? { admission_type: typeFilter } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
        ...(escalatedOnly ? { escalated: 1 } : {}),
        ...(unassignedBedOnly ? { unassigned_bed: 1 } : {}),
      };
      const admissionsResponse = await wardService.getAdmissions(listParams);
      const loaded = admissionsResponse.results || [];
      setAdmissions(loaded);
      setAdmissionsTotal(admissionsResponse.count ?? loaded.length);

      try {
        if (!loaded.length) {
          setAssignments([]);
        } else {
          const ar = await wardService.getActiveAssignmentsForAdmissions(
            loaded.map((a) => a.id),
          );
          setAssignments(ar.results || []);
        }
      } catch (e: unknown) {
        console.error('Error fetching assignments for admissions:', e);
        setAssignments([]);
      }
    } catch (error: unknown) {
      console.error('Error fetching ward data:', error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : 'Unable to load ward data.');
      setAdmissions([]);
      setAdmissionsTotal(0);
      setAssignments([]);
    } finally {
      setIsLoading(false);
    }
  }, [
    statusFilter,
    selectedWard,
    typeFilter,
    buildDateParams,
    debouncedSearch,
    admissionsPage,
    admissionsPageSize,
    handleAuthError,
    escalatedOnly,
    unassignedBedOnly,
  ]);

  useEffect(() => {
    setAdmissionsPage(1);
  }, [statusFilter, selectedWard, typeFilter, dateFilter, dateRange.from, dateRange.to, debouncedSearch, escalatedOnly, unassignedBedOnly]);

  // Full order suite — admission-scoped orchestration (Task 7). Every creator
  // stamps the selected admission's patient/visit/admission and toasts on
  // success/failure. Payloads intentionally never carry consultation_session.
  const reloadWardData = useCallback(() => {
    void fetchData();
  }, [fetchData]);

  const wardOrders = useWardOrders({
    admission: selectedAdmission,
    visitId: selectedAdmission?.visit,
    patientId: selectedAdmission?.patient,
    onChanged: reloadWardData,
  });

  const handleWardLabOrder = async (payload: LabOrderSubmitInput) => {
    if (!selectedAdmission) return;
    await wardOrders.createLab({
      priority: payload.priority,
      clinical_notes: payload.clinicalNotes || undefined,
      tests_data: payload.templates.map((t) => ({
        name: t.name,
        code:
          t.code ||
          t.name
            .substring(0, 24)
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_")
            .replace(/^_|_$/g, "") ||
          "LAB",
        sample_type: t.sample_type || "Blood",
        template: t.id,
        status: "pending",
        notes: payload.clinicalNotes || "",
      })),
    } as any);
  };

  const handleWardRadiologyOrder = async (payload: RadiologyOrderSubmitInput) => {
    if (!selectedAdmission) return;
    await wardOrders.createRadiology({
      priority: payload.priority,
      clinical_notes: payload.clinicalIndication?.trim() || undefined,
      provisional_diagnosis: payload.provisionalDiagnosis?.trim() || undefined,
      lmp: payload.lmp || undefined,
      studies_data: payload.templates.map((t) => ({
        procedure: t.name,
        body_part: t.body_part || "",
        modality: t.modality || "X-Ray",
        template: t.id,
        status: "pending",
      })),
    } as any);
  };

  const handleWardPhysioOrder = async (payload: PhysioOrderSubmitInput) => {
    if (!selectedAdmission) return;
    await wardOrders.createPhysio({
      history_clinical_findings: payload.historyClinicalFindings || undefined,
      diagnosis: payload.diagnosis.trim(),
      drug_history: payload.drugHistory || undefined,
      special_instructions: payload.specialInstructions || undefined,
      priority: payload.priority,
      referral_source: 'doctor',
    } as any);
  };

  useEffect(() => {
    if (!ready) return;
    void fetchData();
  }, [ready, fetchData]);

  const handleViewAdmission = (
    admission: PatientAdmission,
    initialTab?: WardDoctorDetailsTab,
  ) => {
    setSelectedAdmission(admission);
    setDetailsTab(initialTab ?? 'overview');
    setShowAdmissionDetails(true);
  };

  const router = useRouter();
  const openCareSession = (admissionId: number) => {
    router.push(`/wards/admissions/${admissionId}`);
  };

  const downloadBlob = (blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);
  const handleDownloadSummary = async (admission: PatientAdmission) => {
    setIsDownloadingSummary(true);
    try {
      const blob = await wardService.fetchAdmissionSummaryPdf(admission.id);
      downloadBlob(blob, `admission_summary_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download admission summary');
    } finally {
      setIsDownloadingSummary(false);
    }
  };

  const [isDownloadingSlip, setIsDownloadingSlip] = useState(false);
  const handleDownloadSlip = async (admission: PatientAdmission) => {
    setIsDownloadingSlip(true);
    try {
      const blob = await wardService.fetchDischargeSlipPdf(admission.id);
      downloadBlob(blob, `discharge_slip_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download discharge slip');
    } finally {
      setIsDownloadingSlip(false);
    }
  };

  const [isDownloadingReferralLetter, setIsDownloadingReferralLetter] = useState(false);
  const handleDownloadReferralLetter = async (admission: PatientAdmission) => {
    setIsDownloadingReferralLetter(true);
    try {
      const blob = await wardService.fetchReferralLetterPdf(admission.id);
      downloadBlob(blob, `referral_letter_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download referral letter');
    } finally {
      setIsDownloadingReferralLetter(false);
    }
  };

  // Responsibility form button is context-driven. Auto is sent so the
  // backend picks Transfer / DAMA / General based on admission state.
  const [isDownloadingResponsibility, setIsDownloadingResponsibility] = useState(false);
  const handleDownloadResponsibilityForm = async (
    admission: PatientAdmission,
    formType: 'transfer' | 'dama' | 'general' | 'auto' = 'auto',
  ) => {
    setIsDownloadingResponsibility(true);
    try {
      const blob = await wardService.fetchResponsibilityFormPdf(admission.id, formType);
      downloadBlob(blob, `responsibility_form_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to download responsibility form');
    } finally {
      setIsDownloadingResponsibility(false);
    }
  };

  /**
   * Decide which responsibility-form label / variant fits an admission:
   *   - linked external referral OR transfer discharge → "Transfer responsibility"
   *   - AMA discharge                                   → "DAMA form"
   *   - anything else                                   → "Discharge ack."
   * Returns null when the form isn't applicable yet (e.g. still admitted
   * with no plan).
   */
  const getResponsibilityFormVariant = (admission: PatientAdmission): {
    label: string;
    formType: 'transfer' | 'dama' | 'general';
  } | null => {
    const hasReferral = Boolean(admission.escort);
    const dt = admission.discharge_type || '';
    if (dt === 'against_medical_advice') return { label: 'DAMA form', formType: 'dama' };
    if (dt === 'transfer' || hasReferral) return { label: 'Transfer responsibility', formType: 'transfer' };
    if (admission.status === 'discharged' || admission.status === 'pending_discharge') {
      return { label: 'Discharge ack.', formType: 'general' };
    }
    return null;
  };

  const handleInitiateDischarge = async () => {
    if (!selectedAdmission) return;
    const errors: typeof dischargeErrors = {};
    if (!dischargeData.discharge_diagnosis.trim()) {
      errors.discharge_diagnosis = 'Discharge diagnosis is required.';
    }
    if (referralEnabled) {
      if (!referralFacility.facility.trim()) {
        errors.referral_facility = 'Receiving facility is required.';
      }
      if (!referralForm.specialty.trim()) {
        errors.referral_specialty = 'Referral specialty is required.';
      }
      if (!referralForm.reason.trim()) {
        errors.referral_reason = 'Referral reason is required.';
      }
    }
    setDischargeErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.error('Please correct the highlighted fields.');
      return;
    }
    setIsSubmittingDischarge(true);
    try {
      await wardService.initiateDischarge(selectedAdmission.id, {
        discharge_type: dischargeData.discharge_type,
        discharge_diagnosis: dischargeData.discharge_diagnosis,
        discharge_notes: dischargeData.discharge_notes || undefined,
        follow_up_instructions: dischargeData.follow_up_instructions || undefined,
        referral: referralEnabled
          ? {
              facility_partner: referralFacility.partnerId,
              facility: referralFacility.facility,
              facility_type: referralFacility.facility_type,
              specialty: referralForm.specialty,
              reason: referralForm.reason,
              clinical_summary: referralForm.clinical_summary || undefined,
              urgency: referralForm.urgency,
              contact_person: referralForm.contact_person || undefined,
              contact_phone: referralForm.contact_phone || undefined,
              notes: referralForm.notes || undefined,
            }
          : undefined,
      });
      toast.success(
        referralEnabled
          ? 'Discharge initiated and external referral created — nursing will arrange escort and confirm departure'
          : 'Discharge initiated — nursing will complete when patient leaves',
        { duration: 5000 },
      );
      setShowDischargeDialog(false);
      setSelectedAdmission(null);
      resetDischargeForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to initiate discharge');
    } finally {
      setIsSubmittingDischarge(false);
    }
  };

  /**
   * Open the Edit Referral dialog pre-filled from the embedded escort. We
   * snapshot the current values into local state so the dialog feels
   * independent — closing without saving leaves the admission untouched.
   */
  const openEditReferral = (admission: PatientAdmission) => {
    const e = admission.escort;
    if (!e) {
      toast.error('No referral linked to this admission.');
      return;
    }
    setEditReferralFacility({
      partnerId: e.referral_facility_partner ?? null,
      facility: e.facility_name_snapshot || e.facility_name || '',
      facility_type: ((e.referral_facility_type as 'internal' | 'external' | 'specialist' | undefined) || 'external'),
    });
    setEditReferralForm({
      specialty: e.referral_specialty || '',
      reason: e.referral_reason || '',
      clinical_summary: e.referral_clinical_summary || '',
      urgency: ((e.referral_urgency as 'routine' | 'urgent' | 'emergency' | null) || 'routine') as 'routine' | 'urgent' | 'emergency',
      contact_person: e.referral_contact_person || '',
      contact_phone: e.referral_contact_phone || '',
      notes: e.referral_notes || '',
    });
    setEditReferralOpen(true);
  };

  const handleSaveReferralEdit = async () => {
    if (!selectedAdmission) return;
    if (!editReferralFacility.facility.trim() && !editReferralFacility.partnerId) {
      toast.error('Please pick or type the receiving facility');
      return;
    }
    if (!editReferralForm.specialty.trim()) {
      toast.error('Referral specialty is required');
      return;
    }
    if (!editReferralForm.reason.trim()) {
      toast.error('Referral reason is required');
      return;
    }
    setIsSavingReferralEdit(true);
    try {
      const updated = await wardService.updateAdmissionReferral(selectedAdmission.id, {
        facility_partner: editReferralFacility.partnerId,
        facility: editReferralFacility.facility,
        facility_type: editReferralFacility.facility_type,
        specialty: editReferralForm.specialty,
        reason: editReferralForm.reason,
        clinical_summary: editReferralForm.clinical_summary || undefined,
        urgency: editReferralForm.urgency,
        contact_person: editReferralForm.contact_person || '',
        contact_phone: editReferralForm.contact_phone || '',
        notes: editReferralForm.notes || '',
      });
      toast.success('Referral updated');
      setSelectedAdmission(updated);
      setEditReferralOpen(false);
      fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to update referral');
    } finally {
      setIsSavingReferralEdit(false);
    }
  };

  const handleCancelReferral = async () => {
    if (!selectedAdmission) return;
    setIsCancellingReferral(true);
    try {
      const updated = await wardService.cancelAdmissionReferral(
        selectedAdmission.id,
        cancelReferralReason.trim() || undefined,
      );
      toast.success('External referral cancelled — discharge will proceed without transfer');
      setSelectedAdmission(updated);
      setCancelReferralOpen(false);
      setCancelReferralReason('');
      fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to cancel referral');
    } finally {
      setIsCancellingReferral(false);
    }
  };

  const handleSaveProgressNote = async () => {
    if (!selectedAdmission) return;
    if (!progressNote.trim()) {
      toast.error('Please enter a progress note');
      return;
    }
    setIsSavingNote(true);
    try {
      const timestamp = formatDisplayDateTime(new Date());
      const authorName = currentUser?.name || currentUser?.username || 'Unknown';
      const newNote = `[${timestamp} — Dr. ${authorName}]\n${progressNote.trim()}`;
      const existing = selectedAdmission.admission_notes?.trim();
      const combined = existing ? `${newNote}\n\n---\n\n${existing}` : newNote;

      await wardService.updateAdmission(selectedAdmission.id, { admission_notes: combined });
      toast.success('Progress note saved');
      setProgressNote('');
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save progress note');
    } finally {
      setIsSavingNote(false);
    }
  };

  const getPatientAssignments = (admissionId: number) =>
    assignments.filter(a => a.admission === admissionId && a.is_active);

  const applyKpiFilter = useCallback((filter: 'admitted' | 'pending_discharge' | 'escalated' | 'unassigned_bed') => {
    if (filter === 'admitted') {
      setStatusFilter('admitted');
      setEscalatedOnly(false);
      setUnassignedBedOnly(false);
      return;
    }
    if (filter === 'pending_discharge') {
      setStatusFilter('pending_discharge');
      setEscalatedOnly(false);
      setUnassignedBedOnly(false);
      return;
    }
    if (filter === 'escalated') {
      setStatusFilter('admitted');
      setEscalatedOnly(true);
      setUnassignedBedOnly(false);
      return;
    }
    setStatusFilter('admitted');
    setEscalatedOnly(false);
    setUnassignedBedOnly(true);
  }, []);

  const kpiCardsActive = useMemo(() => ({
    admitted: statusFilter === 'admitted' && !escalatedOnly && !unassignedBedOnly,
    pending_discharge: statusFilter === 'pending_discharge',
    escalated: escalatedOnly,
    unassigned_bed: unassignedBedOnly,
  }), [statusFilter, escalatedOnly, unassignedBedOnly]);

  const activeFilterCount =
    (selectedWard !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (dateRange.from || dateRange.to ? 1 : 0) +
    (escalatedOnly ? 1 : 0) +
    (unassignedBedOnly ? 1 : 0) +
    (searchQuery ? 1 : 0);

  const getStatusColor = (status: string, condition?: string) => {
    if (condition && /needs doctor review/i.test(condition)) return 'border-l-orange-500';
    switch (status) {
      case 'admitted': return 'border-l-blue-500';
      case 'pending_discharge': return 'border-l-amber-500';
      case 'discharged': return 'border-l-green-500';
      case 'transferred': return 'border-l-purple-500';
      default: return 'border-l-muted';
    }
  };

  const getAvatarStyle = (status: string) => {
    switch (status) {
      case 'admitted': return { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-600 dark:text-blue-400' };
      case 'pending_discharge': return { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-600 dark:text-amber-400' };
      case 'discharged': return { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-600 dark:text-green-400' };
      case 'transferred': return { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' };
      default: return { bg: 'bg-muted', text: 'text-muted-foreground' };
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'admitted': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
      case 'pending_discharge': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
      case 'discharged': return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
      case 'transferred': return 'border-purple-500/50 text-purple-600 dark:text-purple-400 bg-purple-500/10';
      default: return 'border-muted-foreground/50 text-muted-foreground';
    }
  };

  const formatStatus = (status: string) => {
    if (status === 'pending_discharge') return 'Pending Discharge';
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const getConditionBadgeClass = (condition: string) => {
    if (/needs doctor review/i.test(condition))
      return 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10';
    const lc = condition.toLowerCase();
    if (lc.includes('stable') || lc.includes('good') || lc.includes('improving'))
      return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
    if (lc.includes('critical') || lc.includes('serious'))
      return 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10';
    return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
  };

  const initials = (name: string) =>
    name.split(' ').filter(Boolean).map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Ward Rounds</h1>
          <p className="text-muted-foreground mt-1">Review patients, write orders, record progress notes, and manage discharges</p>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            { key: 'admitted' as const, label: 'On ward', value: kpiAdmittedTotal, icon: Users, color: 'text-blue-500', bg: 'bg-blue-500/10', ring: 'ring-blue-500' },
            { key: 'pending_discharge' as const, label: 'Pending discharge', value: kpiPendingDischargeTotal, icon: CheckCircle, color: 'text-amber-500', bg: 'bg-amber-500/10', ring: 'ring-amber-500' },
            { key: 'escalated' as const, label: 'Escalated', value: kpiEscalatedTotal, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10', ring: 'ring-orange-500' },
            { key: 'unassigned_bed' as const, label: 'No bed assigned', value: kpiUnassignedBedTotal, icon: Bed, color: 'text-violet-500', bg: 'bg-violet-500/10', ring: 'ring-violet-500' },
          ]).map((stat) => (
            <Card
              key={stat.key}
              onClick={() => applyKpiFilter(stat.key)}
              className={`cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
                kpiCardsActive[stat.key] ? `ring-2 ring-offset-1 ${stat.ring}` : ''
              }`}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); applyKpiFilter(stat.key); } }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            {wards.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground mr-1">Ward:</span>
                <button type="button" onClick={() => setSelectedWard('all')} className={`px-3 py-1.5 rounded-md transition-colors ${selectedWard === 'all' ? 'bg-teal-600 text-white' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}>All</button>
                {wards.map((ward) => (
                  <button key={ward.id} type="button" onClick={() => setSelectedWard(ward.id.toString())} className={`px-3 py-1.5 rounded-md transition-colors ${selectedWard === ward.id.toString() ? 'bg-teal-600 text-white' : 'bg-muted hover:bg-muted/80 text-muted-foreground'}`}>{ward.name}</button>
                ))}
              </div>
            )}
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <CustomDateRangeButton onClick={() => setIsDateRangeOpen(true)} />
                <Select value={dateFilter} onValueChange={(v) => { setDateFilter(v); setDateRange({ from: '', to: '' }); }}>
                  <SelectTrigger className="w-[130px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => { setStatusFilter(v); setEscalatedOnly(false); setUnassignedBedOnly(false); }}
                >
                  <SelectTrigger className="w-[170px]"><SelectValue placeholder="All Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="admitted">Admitted</SelectItem>
                    <SelectItem value="pending_discharge">Pending Discharge</SelectItem>
                    <SelectItem value="discharged">Discharged</SelectItem>
                    <SelectItem value="transferred">Transferred</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={typeFilter} onValueChange={setTypeFilter}>
                  <SelectTrigger className="w-[160px]"><SelectValue placeholder="All Types" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="observation">Observation</SelectItem>
                    <SelectItem value="daycare_observation">Day care</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="elective">Elective</SelectItem>
                    <SelectItem value="transfer">Transfer</SelectItem>
                    <SelectItem value="readmission">Readmission</SelectItem>
                  </SelectContent>
                </Select>
                <ResetFiltersButton
                  label={activeFilterCount > 0 ? `Reset filters (${activeFilterCount})` : 'Reset filters'}
                  onClick={() => {
                    setSelectedWard('all');
                    setStatusFilter('all');
                    setTypeFilter('all');
                    setDateFilter('all');
                    setDateRange({ from: '', to: '' });
                    setSearchQuery('');
                    setEscalatedOnly(false);
                    setUnassignedBedOnly(false);
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateRangeOpen}
          onOpenChange={setIsDateRangeOpen}
          description="Apply a custom admission date range to narrow down the patient list."
          label="Admission Date Range"
          value={dateRange}
          onChange={(range) => { setDateRange(range); setDateFilter('all'); }}
          onClear={() => { setDateRange({ from: '', to: '' }); setIsDateRangeOpen(false); }}
        />

        {/* Patient List */}
        {isLoading ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading patients...</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="flex items-center justify-between px-1 gap-2 flex-wrap">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{admissions.length}</span>
                {admissionsTotal > admissions.length ? (
                  <> of <span className="font-medium text-foreground">{admissionsTotal}</span></>
                ) : null}
                {' '}patient{admissions.length !== 1 ? 's' : ''}
              </p>
            </div>

            <div className="space-y-2">
              {admissions.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-1">No patients found</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
                  </CardContent>
                </Card>
              ) : (
                admissions.map((admission) => {
                  const typeLabel = formatAdmissionTypeLabel(admission.admission_type);
                  const patientAssignments = getPatientAssignments(admission.id);
                  const avatar = getAvatarStyle(admission.status);
                  return (
                    <Card
                      key={admission.id}
                      className={`border-l-4 ${getStatusColor(admission.status, admission.current_condition)} hover:shadow-md transition-shadow`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <PatientAvatar name={admission.patient_name} photoUrl={resolvePatientPhoto(admission)} size="sm" />

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-semibold text-foreground truncate">{admission.patient_name}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusBadgeClass(admission.status)}`}>
                                  {formatStatus(admission.status)}
                                </Badge>
                                {typeLabel && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-teal-500/50 text-teal-700 dark:text-teal-300 bg-teal-500/10">
                                    {typeLabel}
                                  </Badge>
                                )}
                                {admission.current_condition && (
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getConditionBadgeClass(admission.current_condition)}`}>
                                    {admission.current_condition}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <Button
                                  size="icon"
                                  variant="outline"
                                  className="h-7 w-7"
                                   onClick={() => handleViewAdmission(admission)}
                                  title="View patient details"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {admission.status === 'pending_discharge' && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                                    Awaiting nurse
                                  </Badge>
                                )}
                              </div>
                            </div>

                            {/* Row 2 — bullets unified with the rest of the
                                ward tooling (admission dialog uses ·). */}
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                              <span className="font-mono">{admission.admission_id}</span>
                              <span>·</span>
                              <span>{admission.ward_name}</span>
                              <span>·</span>
                              {admission.bed_number
                                ? <span>Bed {admission.bed_number}</span>
                                : <span className="text-amber-500 dark:text-amber-400">No bed</span>
                              }
                              <span>·</span>
                              <span>
                                {formatDisplayDateMedium(admission.admission_date)}
                              </span>
                              <span>·</span>
                              <span>
                                {admission.length_of_stay === 0
                                  ? 'Same day'
                                  : `${admission.length_of_stay} day${admission.length_of_stay === 1 ? '' : 's'}`}
                              </span>
                              {patientAssignments.length > 0 && (
                                <>
                                  <span>·</span>
                                  <span title={patientAssignments.map(a => a.nurse_name).join(', ')}>
                                    {patientAssignments.slice(0, 2).map(a => a.nurse_name).join(', ')}
                                    {patientAssignments.length > 2 ? ` +${patientAssignments.length - 2}` : ''}
                                  </span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })
              )}
            </div>

            {admissionsTotal > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={admissionsPage}
                  totalItems={admissionsTotal}
                  itemsPerPage={admissionsPageSize}
                  onPageChange={setAdmissionsPage}
                  onItemsPerPageChange={setAdmissionsPageSize}
                  itemName="admissions"
                  pageSizeOptions={[25, 50, 100]}
                />
              </Card>
            )}
          </>
        )}

        {/* Admission Details Dialog */}
        {selectedAdmission && (
          <Dialog open={showAdmissionDetails} onOpenChange={(open) => {
            setShowAdmissionDetails(open);
            if (!open) {
              setLabOrderOpen(false);
              setRadiologyOrderOpen(false);
              setPhysioOrderOpen(false);
              setEyeOrderOpen(false);
              setReferralOrderOpen(false);
            }
          }}>
            <DialogContent className={`${modalNoOverflow('xl')} max-h-[92vh] flex flex-col gap-0 p-0`}>
              <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <PatientAvatar
                      name={selectedAdmission.patient_name}
                      photoUrl={resolvePatientPhoto(selectedAdmission)}
                      size="md"
                      className="shrink-0 hidden sm:flex"
                    />
                    <div className="min-w-0">
                      <DialogTitle className="flex items-center gap-2 text-lg flex-wrap">
                        {selectedAdmission.patient_name}
                        <Badge variant="outline" className={`${getStatusBadgeClass(selectedAdmission.status)} font-normal text-[10px]`}>
                          {formatStatus(selectedAdmission.status)}
                        </Badge>
                        {formatAdmissionTypeLabel(selectedAdmission.admission_type) && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                            {formatAdmissionTypeLabel(selectedAdmission.admission_type)}
                          </Badge>
                        )}
                      </DialogTitle>
                      <DialogDescription asChild>
                        <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm mt-1">
                          <span className="font-mono text-xs">{selectedAdmission.admission_id}</span>
                          <span>·</span>
                          <span>{selectedAdmission.ward_name}</span>
                          {selectedAdmission.bed_number && (<><span>·</span><span>Bed {selectedAdmission.bed_number}</span></>)}
                          <span>·</span>
                          <span>
                            {selectedAdmission.length_of_stay === 0
                              ? 'Same day'
                              : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}
                          </span>
                          {selectedAdmission.admitting_doctor_name && (
                            <><span>·</span><span>Dr {selectedAdmission.admitting_doctor_name}</span></>
                          )}
                          <span>·</span>
                          <span>
                            Nurse: {getPatientAssignments(selectedAdmission.id).length > 0
                              ? getPatientAssignments(selectedAdmission.id).map((a) => a.nurse_name).join(', ')
                              : 'Unassigned'}
                          </span>
                          {selectedAdmission.current_condition && isEscalatedCondition(selectedAdmission.current_condition) && (
                            <>
                              <span>·</span>
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getConditionBadgeClass(selectedAdmission.current_condition)}`}>
                                ⚠️ {selectedAdmission.current_condition}
                              </Badge>
                            </>
                          )}
                        </div>
                      </DialogDescription>
                    </div>
                  </div>
                  <WardAdmissionDocumentsMenu
                    admission={selectedAdmission}
                    isDownloadingSummary={isDownloadingSummary}
                    isDownloadingSlip={isDownloadingSlip}
                    isDownloadingReferralLetter={isDownloadingReferralLetter}
                    isDownloadingResponsibility={isDownloadingResponsibility}
                    onDownloadSummary={() => void handleDownloadSummary(selectedAdmission)}
                    onDownloadSlip={() => void handleDownloadSlip(selectedAdmission)}
                    onDownloadReferralLetter={() => void handleDownloadReferralLetter(selectedAdmission)}
                    onDownloadResponsibility={(formType) => void handleDownloadResponsibilityForm(selectedAdmission, formType)}
                    getResponsibilityFormVariant={getResponsibilityFormVariant}
                  />
                </div>
              </DialogHeader>
              {/* Quick snapshot — full record lives on the Care Session page */}
              <div className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2 space-y-4">
                {selectedAdmission.current_condition && isEscalatedCondition(selectedAdmission.current_condition) && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-orange-600" />
                    <div>
                      <p className="font-semibold text-xs">Nurse escalation</p>
                      <p>{selectedAdmission.current_condition}</p>
                    </div>
                  </div>
                )}

                <section className="rounded-lg border bg-muted/20 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-xs font-semibold">Clinical snapshot</h3>
                    {selectedAdmission.current_condition && !isEscalatedCondition(selectedAdmission.current_condition) && (
                      <Badge variant="outline" className={getConditionBadgeClass(selectedAdmission.current_condition)}>
                        {selectedAdmission.current_condition}
                      </Badge>
                    )}
                  </div>
                  <div className="space-y-1.5 text-sm">
                    <p><span className="text-muted-foreground">Diagnosis · </span>{selectedAdmission.admission_diagnosis || '—'}</p>
                    {selectedAdmission.presenting_complaint && (
                      <p><span className="text-muted-foreground">Complaint · </span>{selectedAdmission.presenting_complaint}</p>
                    )}
                    {(() => {
                      const latestInstruction = resolveWardHandoffInstructions({
                        admissionNotes: selectedAdmission.admission_notes,
                        orderDescription: null,
                      });
                      const instructionText = latestInstruction || selectedAdmission.admission_instructions;
                      return instructionText?.trim() ? (
                        <p><span className="text-muted-foreground">Instructions · </span><span className="whitespace-pre-wrap">{instructionText}</span></p>
                      ) : null;
                    })()}
                  </div>
                </section>

                {/* Quick facts */}
                <section className="rounded-lg border bg-card p-3 space-y-2">
                  <h3 className="text-xs font-semibold">Admission details</h3>
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {selectedAdmission.ward_name && (
                      <div>
                        <p className="text-muted-foreground text-xs">Ward</p>
                        <p className="font-medium">{selectedAdmission.ward_name}{selectedAdmission.bed_number ? ` · Bed ${selectedAdmission.bed_number}` : ''}</p>
                      </div>
                    )}
                    <div>
                      <p className="text-muted-foreground text-xs">Stay</p>
                      <p className="font-medium">{selectedAdmission.length_of_stay === 0 ? 'Same day' : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}</p>
                    </div>
                    {selectedAdmission.admitting_doctor_name && (
                      <div>
                        <p className="text-muted-foreground text-xs">Admitting doctor</p>
                        <p className="font-medium">Dr {selectedAdmission.admitting_doctor_name}</p>
                      </div>
                    )}
                    {selectedAdmission.admission_type && (
                      <div>
                        <p className="text-muted-foreground text-xs">Type</p>
                        <p className="font-medium capitalize">{selectedAdmission.admission_type.replace(/_/g, ' ')}</p>
                      </div>
                    )}
                  </div>
                </section>

                <WardLatestHandoverCard admissionNotes={selectedAdmission.admission_notes} />

                {/* Doctor quick actions — order suite + discharge stay here; the
                    full clinical record lives on the Care Session page. */}
                {(userCanAddWardDoctorOrders(currentUser) && selectedAdmission.status === 'admitted') && (
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mr-1">
                      Quick order
                    </span>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setLabOrderOpen(true)}>
                      <TestTube className="h-3 w-3 mr-1 text-amber-500" /> Lab
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setRadiologyOrderOpen(true)}>
                      <ScanLine className="h-3 w-3 mr-1 text-indigo-500" /> Imaging
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setPhysioOrderOpen(true)}>
                      <Activity className="h-3 w-3 mr-1 text-emerald-500" /> Physio
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setEyeOrderOpen(true)}>
                      <Eye className="h-3 w-3 mr-1 text-cyan-600" /> Eye
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setReferralOrderOpen(true)}>
                      <Send className="h-3 w-3 mr-1 text-teal-500" /> Referral
                    </Button>
                    {selectedAdmission.status === 'admitted' && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 px-2 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                        onClick={() => {
                          resetDischargeForm();
                          setShowDischargeDialog(true);
                        }}
                      >
                        <CheckCircle className="h-3 w-3 mr-1" /> Discharge
                      </Button>
                    )}
                  </div>
                )}

                <Button
                  size="sm"
                  className="w-full h-9"
                  onClick={() => openCareSession(selectedAdmission.id)}
                >
                  Open full session
                  <ArrowUpRight className="h-4 w-4 ml-1" />
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}

        {/* Discharge Dialog */}
        {selectedAdmission && (
          <Dialog open={showDischargeDialog} onOpenChange={(open) => {
            setShowDischargeDialog(open);
            if (!open) resetDischargeForm();
          }}>
            <DialogContent className={`${modalNoOverflow('md')} max-h-[92vh] flex flex-col gap-0 p-0`}>
              <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-1">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle className="h-5 w-5 text-amber-500" />
                  Initiate Discharge
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="text-muted-foreground text-sm space-y-1">
                    <span>
                      <span className="font-medium text-foreground">{selectedAdmission.patient_name}</span>
                      {' · '}
                      <span className="font-mono text-xs">{selectedAdmission.admission_id}</span>
                      {' · '}
                      {selectedAdmission.length_of_stay === 0 ? 'Same day' : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}
                    </span>
                    <span className="block text-amber-600 dark:text-amber-400 font-medium">
                      Nursing staff will complete discharge once the patient has physically left.
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 px-5 py-4 overflow-y-auto flex-1 min-h-0">
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
                  <span>
                    Step {dischargeStep} of 2
                    {dischargeStep === 1 ? ' · Clinical discharge details' : ' · Referral & review'}
                  </span>
                </div>
                {dischargeStep === 1 && (
                  <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Discharge Type</Label>
                    <Select
                      value={dischargeData.discharge_type}
                      onValueChange={(v) => {
                        setDischargeData({ ...dischargeData, discharge_type: v });
                        // Auto-expand the referral block when the doctor
                        // signals a transfer; keep it expanded if they
                        // already opened it manually.
                        if (v === 'transfer') setReferralEnabled(true);
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="regular">Regular Discharge</SelectItem>
                        <SelectItem value="against_medical_advice">Against Medical Advice</SelectItem>
                        <SelectItem value="transfer">Transfer to Another Facility</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Discharge Diagnosis <span className="text-red-500">*</span></Label>
                    <Input
                      value={dischargeData.discharge_diagnosis}
                      onChange={(e) => {
                        setDischargeData({ ...dischargeData, discharge_diagnosis: e.target.value });
                        if (dischargeErrors.discharge_diagnosis) {
                          setDischargeErrors((prev) => ({ ...prev, discharge_diagnosis: undefined }));
                        }
                      }}
                      placeholder="Final diagnosis"
                    />
                    {dischargeErrors.discharge_diagnosis && (
                      <p className="text-xs text-red-600">{dischargeErrors.discharge_diagnosis}</p>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Discharge Notes</Label>
                  <Textarea
                    value={dischargeData.discharge_notes}
                    onChange={(e) => setDischargeData({ ...dischargeData, discharge_notes: e.target.value })}
                    placeholder="Clinical notes for discharge"
                    rows={3}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Follow-up Instructions</Label>
                  <Textarea
                    value={dischargeData.follow_up_instructions}
                    onChange={(e) => setDischargeData({ ...dischargeData, follow_up_instructions: e.target.value })}
                    placeholder="Instructions for follow-up care"
                    rows={2}
                  />
                </div>
                  </>
                )}

                {/* External-care referral toggle */}
                {dischargeStep === 2 && (
                  <>
                <div className="rounded-md border bg-muted/30 px-3 py-3 space-y-2">
                  <label className="flex items-start gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4"
                      checked={referralEnabled}
                      onChange={(e) => setReferralEnabled(e.target.checked)}
                    />
                    <span className="text-sm">
                      <span className="font-medium">Refer to external facility for continued care</span>
                      <span className="block text-xs text-muted-foreground">
                        Creates a referral linked to this admission. The escorting nurse will pick it up at sign-out and confirm handover by phone after the patient arrives.
                      </span>
                    </span>
                  </label>
                </div>

                {referralEnabled && (
                  <div className="space-y-3 rounded-md border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20 p-3">
                    <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                      <Send className="h-3.5 w-3.5" />
                      External referral details
                    </div>

                    <FacilityPartnerSelect
                      value={referralFacility}
                      onChange={(next) => {
                        setReferralFacility(next);
                        if (dischargeErrors.referral_facility) {
                          setDischargeErrors((prev) => ({ ...prev, referral_facility: undefined }));
                        }
                      }}
                      disabled={isSubmittingDischarge}
                    />
                    {dischargeErrors.referral_facility && (
                      <p className="text-xs text-red-600">{dischargeErrors.referral_facility}</p>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Specialty / Department <span className="text-red-500">*</span></Label>
                        <Input
                          value={referralForm.specialty}
                          onChange={(e) => {
                            setReferralForm({ ...referralForm, specialty: e.target.value });
                            if (dischargeErrors.referral_specialty) {
                              setDischargeErrors((prev) => ({ ...prev, referral_specialty: undefined }));
                            }
                          }}
                          placeholder="e.g. Cardiology"
                          disabled={isSubmittingDischarge}
                        />
                        {dischargeErrors.referral_specialty && (
                          <p className="text-xs text-red-600">{dischargeErrors.referral_specialty}</p>
                        )}
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Urgency</Label>
                        <Select
                          value={referralForm.urgency}
                          onValueChange={(v: 'routine' | 'urgent' | 'emergency') => setReferralForm({ ...referralForm, urgency: v })}
                        >
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="routine">Routine</SelectItem>
                            <SelectItem value="urgent">Urgent</SelectItem>
                            <SelectItem value="emergency">Emergency</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Reason for referral <span className="text-red-500">*</span></Label>
                      <Textarea
                        value={referralForm.reason}
                        onChange={(e) => {
                          setReferralForm({ ...referralForm, reason: e.target.value });
                          if (dischargeErrors.referral_reason) {
                            setDischargeErrors((prev) => ({ ...prev, referral_reason: undefined }));
                          }
                        }}
                        placeholder="Why are you referring this patient?"
                        rows={2}
                        disabled={isSubmittingDischarge}
                      />
                      {dischargeErrors.referral_reason && (
                        <p className="text-xs text-red-600">{dischargeErrors.referral_reason}</p>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Clinical summary</Label>
                      <Textarea
                        value={referralForm.clinical_summary}
                        onChange={(e) => setReferralForm({ ...referralForm, clinical_summary: e.target.value })}
                        placeholder="Defaults to discharge summary if blank."
                        rows={3}
                        disabled={isSubmittingDischarge}
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Receiving contact person</Label>
                        <Input
                          value={referralForm.contact_person}
                          onChange={(e) => setReferralForm({ ...referralForm, contact_person: e.target.value })}
                          placeholder="Name of doctor / coordinator"
                          disabled={isSubmittingDischarge}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Receiving phone</Label>
                        <Input
                          value={referralForm.contact_phone}
                          onChange={(e) => setReferralForm({ ...referralForm, contact_phone: e.target.value })}
                          placeholder="Phone number"
                          disabled={isSubmittingDischarge}
                        />
                      </div>
                    </div>

                    <p className="text-[11px] text-muted-foreground">
                      Records will acknowledge the printed referral letter separately. The patient may leave before that paperwork stamp — nursing handles the physical handover and arrival confirmation.
                    </p>
                  </div>
                )}
                  </>
                )}
              </div>
              <DialogFooter className="px-5 py-4 border-t shrink-0 gap-2 sm:justify-end flex-col-reverse sm:flex-row">
                <Button variant="outline" onClick={() => setShowDischargeDialog(false)} disabled={isSubmittingDischarge}>Cancel</Button>
                {dischargeStep === 1 ? (
                  <Button
                    type="button"
                    onClick={() => {
                      if (!dischargeData.discharge_diagnosis.trim()) {
                        setDischargeErrors((prev) => ({ ...prev, discharge_diagnosis: 'Discharge diagnosis is required.' }));
                        return;
                      }
                      setDischargeErrors((prev) => ({ ...prev, discharge_diagnosis: undefined }));
                      setDischargeStep(2);
                    }}
                  >
                    Next: Referral & Review
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setDischargeStep(1)} disabled={isSubmittingDischarge}>
                    Back
                  </Button>
                )}
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleInitiateDischarge} disabled={isSubmittingDischarge || dischargeStep === 1}>
                  {isSubmittingDischarge ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                  {referralEnabled ? 'Initiate Discharge & Refer' : 'Initiate Discharge'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Edit referral — only opened when discharge is still pending and
            arrival hasn't been confirmed (the buttons that open this are
            already gated on those conditions). */}
        <Dialog
          open={editReferralOpen}
          onOpenChange={(open) => { setEditReferralOpen(open); if (!open) setIsSavingReferralEdit(false); }}
        >
          <DialogContent className={`${modalNoOverflow('md')} flex flex-col p-0`}>
            <DialogHeader className="px-5 pt-5 pb-3 border-b border-border shrink-0">
              <DialogTitle className="flex items-center gap-2 text-lg">
                <Send className="h-5 w-5 text-cyan-600" />
                Edit external referral
              </DialogTitle>
              {selectedAdmission?.escort?.referral_id_display && (
                <DialogDescription>
                  {selectedAdmission.escort.referral_id_display} · changes apply only while the patient is still on the ward
                </DialogDescription>
              )}
            </DialogHeader>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div>
                <Label className="text-xs">Receiving facility *</Label>
                <FacilityPartnerSelect
                  value={editReferralFacility}
                  onChange={setEditReferralFacility}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Specialty *</Label>
                  <Input
                    value={editReferralForm.specialty}
                    onChange={(e) => setEditReferralForm({ ...editReferralForm, specialty: e.target.value })}
                    placeholder="e.g. Cardiology"
                  />
                </div>
                <div>
                  <Label className="text-xs">Urgency</Label>
                  <Select
                    value={editReferralForm.urgency}
                    onValueChange={(v: 'routine' | 'urgent' | 'emergency') => setEditReferralForm({ ...editReferralForm, urgency: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="routine">Routine</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="emergency">Emergency</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label className="text-xs">Reason for referral *</Label>
                <Textarea
                  rows={2}
                  value={editReferralForm.reason}
                  onChange={(e) => setEditReferralForm({ ...editReferralForm, reason: e.target.value })}
                />
              </div>
              <div>
                <Label className="text-xs">Clinical summary</Label>
                <Textarea
                  rows={3}
                  value={editReferralForm.clinical_summary}
                  onChange={(e) => setEditReferralForm({ ...editReferralForm, clinical_summary: e.target.value })}
                  placeholder="Brief clinical context for the receiving team"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Contact person</Label>
                  <Input
                    value={editReferralForm.contact_person}
                    onChange={(e) => setEditReferralForm({ ...editReferralForm, contact_person: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Contact phone</Label>
                  <Input
                    value={editReferralForm.contact_phone}
                    onChange={(e) => setEditReferralForm({ ...editReferralForm, contact_phone: e.target.value })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Notes</Label>
                <Textarea
                  rows={2}
                  value={editReferralForm.notes}
                  onChange={(e) => setEditReferralForm({ ...editReferralForm, notes: e.target.value })}
                />
              </div>
            </div>
            <DialogFooter className="px-5 py-4 border-t border-border shrink-0">
              <Button variant="outline" onClick={() => setEditReferralOpen(false)} disabled={isSavingReferralEdit}>Close</Button>
              <Button onClick={handleSaveReferralEdit} disabled={isSavingReferralEdit}>
                {isSavingReferralEdit ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle className="h-4 w-4 mr-2" />}
                Save changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Confirm cancel referral */}
        <Dialog
          open={cancelReferralOpen}
          onOpenChange={(open) => { setCancelReferralOpen(open); if (!open) setIsCancellingReferral(false); }}
        >
          <DialogContent className={MODAL_SIZES.xs}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2 text-lg">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                Cancel external referral?
              </DialogTitle>
              <DialogDescription>
                The referral will be marked cancelled and the escort entry removed.
                Discharge stays initiated — the nurse will sign the patient out without a transfer.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label className="text-xs">Reason (optional, recorded on the referral)</Label>
              <Textarea
                rows={3}
                value={cancelReferralReason}
                onChange={(e) => setCancelReferralReason(e.target.value)}
                placeholder="e.g. Patient improved, no longer needs transfer"
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setCancelReferralOpen(false)} disabled={isCancellingReferral}>Keep referral</Button>
              <Button variant="destructive" onClick={handleCancelReferral} disabled={isCancellingReferral}>
                {isCancellingReferral ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Cancel referral
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Full order suite modals — wired to admission-stamped useWardOrders
            creators. Lab/imaging/physio submit through create*; the eye modal
            creates internally (onSuccess reloads); the referral dialog calls
            createReferral. */}
        {selectedAdmission && (
          <>
            <LabOrderModal
              open={labOrderOpen}
              onOpenChange={setLabOrderOpen}
              onSubmit={handleWardLabOrder}
            />
            <RadiologyOrderModal
              open={radiologyOrderOpen}
              onOpenChange={setRadiologyOrderOpen}
              onSubmit={handleWardRadiologyOrder}
            />
            <PhysioOrderModal
              open={physioOrderOpen}
              onOpenChange={setPhysioOrderOpen}
              onSubmit={handleWardPhysioOrder}
            />
            <NewEyeOrderModal
              open={eyeOrderOpen}
              onOpenChange={setEyeOrderOpen}
              onSuccess={reloadWardData}
              admissionId={selectedAdmission.id}
              visitId={selectedAdmission.visit}
            />
            <WardCreateReferralDialog
              open={referralOrderOpen}
              onOpenChange={setReferralOrderOpen}
              admission={selectedAdmission}
              onSubmit={wardOrders.createReferral}
            />
          </>
        )}

      </div>
    </DashboardLayout>
  );
}
