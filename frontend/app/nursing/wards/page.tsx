"use client";

import { useState, useEffect, useCallback, useMemo } from 'react';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import Link from 'next/link';
import { formatDisplayDateMedium, formatDisplayDateTime } from '@/lib/dates';
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
import { StandardPagination } from '@/components/shared/StandardPagination';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { resolvePatientPhoto } from '@/lib/patient-photo';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Building2, Users, Search, Eye, CheckCircle, AlertTriangle,
  Bed as BedIcon, Loader2,
  PhoneCall, Send, MapPin,
} from 'lucide-react';
import { adminService, type User as StaffUser } from '@/lib/services/admin-service';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { toast } from 'sonner';
import {
  wardService,
  type Ward,
  type PatientAdmission,
  type WardAssignment,
  type Bed,
  type AdmissionEscort,
} from '@/lib/services/ward-service';
import { useCurrentUser } from '@/hooks/use-current-user';
import { ResetFiltersButton } from '@/components/shared/ResetFiltersButton';
import { WardDoctorOrdersSection } from '@/components/ward/WardDoctorOrdersSection';
import { userCanPerformWardOrders } from '@/lib/ward-order-permissions';
import { useWardAdmissionDateParams } from '@/hooks/use-ward-admission-date-params';
import { WARD_ACTIVE_STATUS_IN } from '@/lib/ward/ward-admission-list-params';
import { WardVitalsHistory } from '@/components/ward/WardVitalsHistory';
import { WardLatestHandoverCard } from '@/components/ward/WardLatestHandoverCard';
import { WardHandoverNotesSection } from '@/components/ward/WardHandoverNotesSection';
import {
  WardQuickObservationForm,
  emptyWardObservationForm,
  type WardObservationFormData,
} from '@/components/ward/WardQuickObservationForm';
import { WardAdmissionDocumentsMenu } from '@/components/ward/WardAdmissionDocumentsMenu';
import {
  type WardDetailsTab,
  buildNurseObservationNotePayload,
  isObservationAdmission,
  isEscalatedCondition,
} from '@/lib/ward-admission-ui';
import {
  hasAnyVitalsEntry,
  parseOptionalInt,
} from '@/lib/vitals-entry-form';
import { useServerToday } from '@/hooks/use-server-today';
import { useNursingPageAuth } from '@/hooks/use-nursing-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { fetchAllPaginatedResults } from '@/lib/fetch-paginated-results';
import { MODAL_SIZES, modalNoOverflow } from '@/components/ui/modal-sizes';

// Single source of truth for condition severity on rows/badges.
type ConditionSeverity = 'escalated' | 'critical' | 'guarded' | 'stable' | 'unknown';

const conditionSeverity = (condition?: string | null): ConditionSeverity => {
  if (!condition) return 'unknown';
  const c = condition.toLowerCase();
  if (/needs doctor review|escalat/.test(c)) return 'escalated';
  if (/critical|severe/.test(c)) return 'critical';
  if (/deteriorat|guarded|urgent/.test(c)) return 'guarded';
  if (/stable|improv/.test(c)) return 'stable';
  return 'unknown';
};

const SEVERITY_AVATAR: Record<ConditionSeverity, { bg: string; text: string }> = {
  escalated: { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-600 dark:text-orange-400' },
  critical:  { bg: 'bg-red-100 dark:bg-red-900/30',       text: 'text-red-600 dark:text-red-400' },
  guarded:   { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-600 dark:text-amber-400' },
  stable:    { bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-600 dark:text-green-400' },
  unknown:   { bg: 'bg-blue-100 dark:bg-blue-900/30',     text: 'text-blue-600 dark:text-blue-400' },
};

const SEVERITY_BADGE: Record<ConditionSeverity, string> = {
  escalated: 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10',
  critical:  'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10',
  guarded:   'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10',
  stable:    'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10',
  unknown:   'border-muted-foreground/50 text-muted-foreground',
};

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

export default function WardCarePage() {
  const { currentUser } = useCurrentUser();
  const { ready, handleAuthError } = useNursingPageAuth();
  const serverToday = useServerToday();

  const [wards, setWards] = useState<Ward[]>([]);
  const [admissions, setAdmissions] = useState<PatientAdmission[]>([]);
  const [admissionsTotal, setAdmissionsTotal] = useState(0);
  const [allAssignments, setAllAssignments] = useState<WardAssignment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [admissionsPage, setAdmissionsPage] = useState(1);
  const [admissionsPageSize, setAdmissionsPageSize] = useState(25);
  /** KPI scope = date / ward / admission-type filters only (not status search). */
  const [kpiAdmittedTotal, setKpiAdmittedTotal] = useState(0);
  const [kpiPendingDischargeTotal, setKpiPendingDischargeTotal] = useState(0);
  const [kpiEscalatedTotal, setKpiEscalatedTotal] = useState(0);
  const [kpiUnassignedBedTotal, setKpiUnassignedBedTotal] = useState(0);

  // Filters
  const [selectedWard, setSelectedWard] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [escalatedOnly, setEscalatedOnly] = useState(false);
  const [unassignedBedOnly, setUnassignedBedOnly] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  const [isDateRangeOpen, setIsDateRangeOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  // Dialog states
  const [showAdmissionDetails, setShowAdmissionDetails] = useState(false);
  const [detailsTab, setDetailsTab] = useState<WardDetailsTab>('overview');
  const [showAssignBedDialog, setShowAssignBedDialog] = useState(false);
  const [showCompleteDischargeDialog, setShowCompleteDischargeDialog] = useState(false);
  const [showRemoveBedDialog, setShowRemoveBedDialog] = useState(false);
  const [bedRemovalTarget, setBedRemovalTarget] = useState<PatientAdmission | null>(null);
  const [isRemovingBed, setIsRemovingBed] = useState(false);
  const [selectedAdmission, setSelectedAdmission] = useState<PatientAdmission | null>(null);
  const [availableBeds, setAvailableBeds] = useState<Bed[]>([]);
  const [isAssigningBed, setIsAssigningBed] = useState(false);
  const [isCompletingDischarge, setIsCompletingDischarge] = useState(false);

  // Complete Discharge form (Step 2)
  const NURSE_ROLE_HINTS = ['nurse', 'midwife', 'nursing officer'];
  const [exitForm, setExitForm] = useState({
    nurse_exit_summary: '',
    discharged_with: '' as PatientAdmission['discharged_with'] | '',
    companion_name: '',
    companion_relationship: '',
    companion_phone: '',
    handover_summary: '',
    transport_mode: '',
    additional_nurse_ids: [] as number[],
  });
  const [exitChecklist, setExitChecklist] = useState({
    physically_left: false,
    bed_ready: false,
    belongings_collected: false,
    documents_given: false,
  });
  const [completeDischargeStep, setCompleteDischargeStep] = useState<1 | 2>(1);
  const [nurseDirectory, setNurseDirectory] = useState<StaffUser[]>([]);
  const [nurseDirectoryLoading, setNurseDirectoryLoading] = useState(false);

  // Confirm-arrival dialog (after escort returns)
  const [showArrivalDialog, setShowArrivalDialog] = useState(false);
  const [arrivalEscort, setArrivalEscort] = useState<AdmissionEscort | null>(null);
  const [arrivalForm, setArrivalForm] = useState({
    arrival_call_outcome: 'answered' as 'answered' | 'voicemail' | 'handover_in_person',
    arrival_notes: '',
  });
  const [isConfirmingArrival, setIsConfirmingArrival] = useState(false);

  // Pending escort queue ("patients leaving with us")
  const [pendingEscorts, setPendingEscorts] = useState<AdmissionEscort[]>([]);

  const loadNurseDirectory = useCallback(async () => {
    if (nurseDirectory.length || nurseDirectoryLoading) return;
    setNurseDirectoryLoading(true);
    try {
      const allUsers = await fetchAllPaginatedResults((page, page_size) =>
        adminService.getUsers({ is_active: true, page, page_size })
      );
      const filtered = allUsers.filter((u) => {
        const role = (u.system_role || '').toLowerCase();
        return NURSE_ROLE_HINTS.some((hint) => role.includes(hint));
      });
      setNurseDirectory(filtered);
    } catch (err) {
      console.error('Failed to load nurse directory', err);
      if (handleAuthError(err)) return;
      toast.error('Failed to load nurse directory');
    } finally {
      setNurseDirectoryLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nurseDirectory.length, nurseDirectoryLoading, handleAuthError]);

  // Observation form
  const [observationData, setObservationData] = useState<WardObservationFormData>(emptyWardObservationForm());
  const [isSavingObservation, setIsSavingObservation] = useState(false);
  const [isSavingHandover, setIsSavingHandover] = useState(false);
  const [chartRefreshKey, setChartRefreshKey] = useState(0);
  const [notesRefreshKey, setNotesRefreshKey] = useState(0);

  const getPatientAssignments = (admissionId: number) =>
    allAssignments.filter(a => a.admission === admissionId && a.is_active);

  const buildDateParams = useWardAdmissionDateParams({
    dateFilter,
    dateRange,
    serverToday,
  });

  const fetchData = useCallback(async () => {
    setIsLoading(true);

    try {
      const wardsResponse = await wardService.getWards({ page_size: MAX_LIST_PAGE_SIZE });
      setWards(wardsResponse.results || []);
    } catch (error: unknown) {
      console.error('Error fetching wards:', error);
      if (handleAuthError(error)) return;
      const msg = error instanceof Error ? error.message : 'Failed to load wards';
      toast.error(msg);
    }

    const dateParams = buildDateParams();

    const kpiBase = {
      ...dateParams,
      ...(selectedWard !== 'all' ? { ward: parseInt(selectedWard, 10) } : {}),
      ...(typeFilter !== 'all' ? { admission_type: typeFilter } : {}),
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
          setAllAssignments([]);
        } else {
          const ar = await wardService.getActiveAssignmentsForAdmissions(
            loaded.map((a) => a.id),
          );
          setAllAssignments(ar.results || []);
        }
      } catch (e: unknown) {
        console.error('Error fetching assignments for admissions:', e);
        setAllAssignments([]);
      }
    } catch (error: unknown) {
      console.error('Error fetching admissions:', error);
      if (handleAuthError(error)) return;
      const msg = error instanceof Error ? error.message : 'Failed to load admissions';
      toast.error(msg);
      setAdmissions([]);
      setAdmissionsTotal(0);
      setAllAssignments([]);
    }

    setIsLoading(false);
  }, [
    buildDateParams,
    statusFilter,
    selectedWard,
    typeFilter,
    admissionsPage,
    admissionsPageSize,
    debouncedSearch,
    escalatedOnly,
    unassignedBedOnly,
    handleAuthError,
  ]);

  useEffect(() => {
    setAdmissionsPage(1);
  }, [statusFilter, selectedWard, typeFilter, dateFilter, dateRange.from, dateRange.to, debouncedSearch, escalatedOnly, unassignedBedOnly]);

  useEffect(() => {
    if (!ready) return;
    fetchData();
  }, [ready, fetchData]);

  // Pending-escort queue ("patients leaving with us") — refresh after the
  // admissions list reloads so the badge reflects ward state.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      try {
        const res = await wardService.getAdmissionEscorts({ status: 'pending', page_size: 50 });
        if (!cancelled) setPendingEscorts(res.results || []);
      } catch (err) {
        if (cancelled) return;
        if (handleAuthError(err)) return;
        console.error('Failed to load pending escorts:', err);
        setPendingEscorts([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [admissions, handleAuthError]);

  const handleViewAdmission = (
    admission: PatientAdmission,
    tab?: WardDetailsTab,
  ) => {
    setSelectedAdmission(admission);
    setDetailsTab(tab ?? 'overview');
    setObservationData(emptyWardObservationForm());
    setShowAdmissionDetails(true);
  };

  const handleSaveObservation = async () => {
    if (!selectedAdmission) return;
    const v = observationData.vitals;
    if (
      !observationData.current_condition &&
      !observationData.vitals_notes.trim() &&
      !observationData.escalate &&
      !hasAnyVitalsEntry(v)
    ) {
      toast.error('Please enter a condition, vitals, or escalation');
      return;
    }
    const pulseInt = parseOptionalInt(v.pulse);
    const hasNumericVitals =
      v.temperature.trim() !== '' ||
      pulseInt != null ||
      v.bloodPressureSystolic.trim() !== '' ||
      v.bloodPressureDiastolic.trim() !== '' ||
      v.respiratoryRate.trim() !== '';
    const hasVitalsReading = hasNumericVitals || v.oxygenSaturation.trim() !== '';

    if (observationData.vitals_notes.trim() && !hasVitalsReading) {
      toast.error('Enter vitals to save a vitals note');
      return;
    }

    setIsSavingObservation(true);
    try {
      const vitalsNoteLines = [
        observationData.vitals_notes.trim(),
        observationData.escalate ? '⚠️ ESCALATED — Needs Doctor Review' : '',
      ].filter(Boolean);

      const condition = observationData.escalate
        ? 'Needs Doctor Review'
        : observationData.current_condition || selectedAdmission.current_condition;

      if (hasVitalsReading) {
        const vitalNoteParts: string[] = [];
        if (v.oxygenSaturation.trim()) vitalNoteParts.push(`SpO2 ${v.oxygenSaturation}%`);
        if (vitalsNoteLines.length) vitalNoteParts.push(...vitalsNoteLines);
        try {
          await wardService.createObservationVital({
            admission: selectedAdmission.id,
            temperature_c: v.temperature || undefined,
            pulse: pulseInt,
            respiratory_rate: parseOptionalInt(v.respiratoryRate),
            bp_systolic: parseOptionalInt(v.bloodPressureSystolic),
            bp_diastolic: parseOptionalInt(v.bloodPressureDiastolic),
            notes: vitalNoteParts.length ? vitalNoteParts.join('\n\n') : undefined,
          });
        } catch (chartErr) {
          // eslint-disable-next-line no-console
          console.warn('Failed to write observation vital row', chartErr);
        }
      }

      if (condition) {
        await wardService.updateAdmission(selectedAdmission.id, {
          current_condition: condition,
        });
      }

      const fresh = await wardService.getAdmission(selectedAdmission.id);

      if (observationData.escalate) {
        toast.warning('Patient escalated — doctor has been flagged for review', { duration: 5000 });
      } else {
        toast.success('Observation recorded successfully');
      }

      setObservationData(emptyWardObservationForm());
      setSelectedAdmission(fresh);
      setChartRefreshKey((k) => k + 1);
      setNotesRefreshKey((k) => k + 1);
      setAdmissions((prev) => prev.map((a) => (a.id === fresh.id ? fresh : a)));
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to save observation');
    } finally {
      setIsSavingObservation(false);
    }
  };

  const handleSaveHandoverNote = async (body: string) => {
    if (!selectedAdmission) return;
    const text = body.trim();
    if (!text) return;

    setIsSavingHandover(true);
    try {
      const authorName = currentUser?.name || currentUser?.username || 'Nurse';
      const timestamp = formatDisplayDateTime(new Date());
      const notesPayload = buildNurseObservationNotePayload({
        authorName,
        timestamp,
        bodyLines: [text],
        existingNotes: selectedAdmission.admission_notes,
      });

      await wardService.updateAdmission(selectedAdmission.id, {
        admission_notes: notesPayload,
      });

      const fresh = await wardService.getAdmission(selectedAdmission.id);
      setSelectedAdmission(fresh);
      setNotesRefreshKey((k) => k + 1);
      setAdmissions((prev) => prev.map((a) => (a.id === fresh.id ? fresh : a)));
      toast.success('Handover note saved');
    } catch (error: any) {
      toast.error(error.message || 'Failed to save handover note');
      throw error;
    } finally {
      setIsSavingHandover(false);
    }
  };

  const handleAssignBed = async (admission: PatientAdmission) => {
    setSelectedAdmission(admission);
    setShowAssignBedDialog(true);
    try {
      // Fetch every bed in the ward so the dialog can show occupied / maintenance
      // / reserved beds (disabled, with a status pill) instead of pretending a
      // ward with only one bed has "no available beds". Wards rarely have more
      // than 50 beds, so 200 is a safe ceiling.
      const bedsResponse = await wardService.getBeds({ ward: admission.ward, page_size: MAX_LIST_PAGE_SIZE });
      const sorted = (bedsResponse.results || []).slice().sort((a, b) => {
        const an = parseInt(a.bed_number, 10);
        const bn = parseInt(b.bed_number, 10);
        if (Number.isFinite(an) && Number.isFinite(bn) && an !== bn) return an - bn;
        return a.bed_number.localeCompare(b.bed_number);
      });
      setAvailableBeds(sorted);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error('Failed to load beds for this ward');
      setAvailableBeds([]);
    }
  };

  const handleBedAssignment = async (bedId: number) => {
    if (!selectedAdmission) return;
    setIsAssigningBed(true);
    try {
      const isChange = !!selectedAdmission.bed;
      const updated = await wardService.assignBedToAdmission(selectedAdmission.id, bedId);
      setAdmissions(prev => prev.map(a => a.id === updated.id ? updated : a));
      toast.success(isChange ? 'Bed changed successfully' : `Bed ${updated.bed_number} assigned`);
      setShowAssignBedDialog(false);
      setSelectedAdmission(null);
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to assign bed');
    } finally {
      setIsAssigningBed(false);
    }
  };

  const requestRemoveFromBed = (admission: PatientAdmission) => {
    setBedRemovalTarget(admission);
    setShowRemoveBedDialog(true);
  };

  const confirmRemoveFromBed = async () => {
    if (!bedRemovalTarget) return;
    setIsRemovingBed(true);
    try {
      const updated = await wardService.assignBedToAdmission(bedRemovalTarget.id, null);
      setAdmissions(prev => prev.map(a => a.id === updated.id ? updated : a));
      toast.success(`${bedRemovalTarget.patient_name} removed from bed — bed is now available`);
      setShowRemoveBedDialog(false);
      setBedRemovalTarget(null);
      fetchData();
    } catch (error: any) {
      toast.error(error?.message || 'Failed to remove patient from bed');
    } finally {
      setIsRemovingBed(false);
    }
  };

  const resetExitForm = () => {
    setExitForm({
      nurse_exit_summary: '',
      discharged_with: '',
      companion_name: '',
      companion_relationship: '',
      companion_phone: '',
      handover_summary: '',
      transport_mode: '',
      additional_nurse_ids: [],
    });
    setExitChecklist({
      physically_left: false,
      bed_ready: false,
      belongings_collected: false,
      documents_given: false,
    });
    setCompleteDischargeStep(1);
  };

  const handleCompleteDischarge = async () => {
    if (!selectedAdmission) return;
    if (!exitForm.nurse_exit_summary.trim()) {
      toast.error('Exit observation summary is required before confirming discharge');
      return;
    }
    if (!exitChecklist.physically_left) {
      toast.error('Confirm the patient has physically left before completing discharge');
      return;
    }

    const hasEscort = !!selectedAdmission.escort;
    if (hasEscort && !exitForm.transport_mode) {
      toast.error('Pick a transport mode for the escort');
      return;
    }

    setIsCompletingDischarge(true);
    try {
      await wardService.completeDischarge(selectedAdmission.id, {
        nurse_exit_summary: exitForm.nurse_exit_summary,
        discharged_with: exitForm.discharged_with || undefined,
        companion_name: exitForm.companion_name || undefined,
        companion_relationship: exitForm.companion_relationship || undefined,
        companion_phone: exitForm.companion_phone || undefined,
        escort: hasEscort
          ? {
              primary_nurse: currentUser?.id ? Number(currentUser.id) : undefined,
              additional_nurses: exitForm.additional_nurse_ids,
              transport_mode: exitForm.transport_mode || undefined,
              handover_summary: exitForm.handover_summary || undefined,
            }
          : undefined,
      });
      toast.success(
        hasEscort
          ? `${selectedAdmission.patient_name} signed out — escort logged. Phone back once the receiving facility takes over.`
          : `${selectedAdmission.patient_name} discharged — bed is now available`,
        { duration: 5000 },
      );
      setShowCompleteDischargeDialog(false);
      setSelectedAdmission(null);
      resetExitForm();
      fetchData();
    } catch (error: any) {
      toast.error(error.message || 'Failed to complete discharge');
    } finally {
      setIsCompletingDischarge(false);
    }
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
   * Same context rules as the doctor's page so the nurse sees the same
   * label / variant for any given admission. Returns null if the form
   * isn't relevant yet (e.g. still admitted with no discharge plan).
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

  const handleConfirmArrival = async () => {
    if (!arrivalEscort) return;
    setIsConfirmingArrival(true);
    try {
      await wardService.confirmAdmissionEscortArrival(arrivalEscort.id, {
        arrival_call_outcome: arrivalForm.arrival_call_outcome,
        arrival_notes: arrivalForm.arrival_notes || undefined,
      });
      toast.success('Handover confirmed — escort log closed');
      setShowArrivalDialog(false);
      setArrivalEscort(null);
      setArrivalForm({ arrival_call_outcome: 'answered', arrival_notes: '' });
      // Refresh the pending-escorts list
      try {
        const res = await wardService.getAdmissionEscorts({ status: 'pending', page_size: 50 });
        setPendingEscorts(res.results || []);
      } catch {
        // queue refresh failure is non-blocking
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to confirm arrival');
    } finally {
      setIsConfirmingArrival(false);
    }
  };

  /** Badges above the list — scoped to the current result page. */
  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (selectedWard !== 'all') n++;
    if (statusFilter !== 'all') n++;
    if (typeFilter !== 'all') n++;
    if (dateFilter !== 'all') n++;
    if (dateRange.from || dateRange.to) n++;
    if (searchQuery.trim()) n++;
    if (escalatedOnly) n++;
    if (unassignedBedOnly) n++;
    return n;
  }, [selectedWard, statusFilter, typeFilter, dateFilter, dateRange.from, dateRange.to, searchQuery, escalatedOnly, unassignedBedOnly]);

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

  // Row accent: terminal statuses (discharged/transferred/pending_discharge)
  // win because they're unambiguous; admitted patients are coloured by the
  // clinical severity of their current condition.
  const getRowBorder = (admission: PatientAdmission): string => {
    switch (admission.status) {
      case 'discharged': return 'border-l-green-500';
      case 'transferred': return 'border-l-purple-500';
      case 'pending_discharge': return 'border-l-amber-500';
      default: {
        const sev = conditionSeverity(admission.current_condition);
        switch (sev) {
          case 'escalated': return 'border-l-orange-500';
          case 'critical':  return 'border-l-red-500';
          case 'guarded':   return 'border-l-amber-500';
          case 'stable':    return 'border-l-green-500';
          default:          return 'border-l-blue-500';
        }
      }
    }
  };

  // Avatar colour — same hierarchy as row border so the two visuals always
  // agree. Useful at-a-glance triage signal in long lists.
  const getAvatarStyle = (admission: PatientAdmission): { bg: string; text: string } => {
    switch (admission.status) {
      case 'discharged':       return { bg: 'bg-green-100 dark:bg-green-900/30',   text: 'text-green-600 dark:text-green-400' };
      case 'transferred':      return { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-600 dark:text-purple-400' };
      case 'pending_discharge':return { bg: 'bg-amber-100 dark:bg-amber-900/30',   text: 'text-amber-600 dark:text-amber-400' };
      default:                 return SEVERITY_AVATAR[conditionSeverity(admission.current_condition)];
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

  const getConditionBadgeClass = (condition: string) =>
    SEVERITY_BADGE[conditionSeverity(condition)];

  // Strip honorifics so "Mr Yaro Muhammad Musa" → "YM" (not "MY"). Done
  // here rather than at the row to avoid recomputing on every render.
  const HONORIFICS = new Set([
    'mr', 'mrs', 'ms', 'miss', 'mst', 'master', 'dr', 'prof', 'rev', 'fr', 'sr', 'jr',
  ]);
  const initials = (name: string) => {
    const tokens = name
      .split(/\s+/)
      .map((t) => t.replace(/\.$/, '')) // drop trailing dot ("Mr.")
      .filter(Boolean)
      .filter((t) => !HONORIFICS.has(t.toLowerCase()));
    if (tokens.length === 0) return name.slice(0, 2).toUpperCase();
    return tokens.map((t) => t[0]!).join('').slice(0, 2).toUpperCase();
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">

        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Ward Care</h1>
            <p className="text-muted-foreground mt-1">Record observations, execute doctor orders, and manage patient care</p>
          </div>
        </div>

        {/* KPIs — four actionable counts aligned with Procedures / Requests pages */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            {
              key: 'admitted' as const,
              label: 'On ward',
              value: kpiAdmittedTotal,
              icon: Users,
              color: 'text-blue-500',
              bg: 'bg-blue-500/10',
              ring: 'ring-blue-500',
            },
            {
              key: 'pending_discharge' as const,
              label: 'Pending discharge',
              value: kpiPendingDischargeTotal,
              icon: CheckCircle,
              color: 'text-amber-500',
              bg: 'bg-amber-500/10',
              ring: 'ring-amber-500',
            },
            {
              key: 'escalated' as const,
              label: 'Escalated',
              value: kpiEscalatedTotal,
              icon: AlertTriangle,
              color: 'text-orange-500',
              bg: 'bg-orange-500/10',
              ring: 'ring-orange-500',
            },
            {
              key: 'unassigned_bed' as const,
              label: 'No bed assigned',
              value: kpiUnassignedBedTotal,
              icon: BedIcon,
              color: 'text-violet-500',
              bg: 'bg-violet-500/10',
              ring: 'ring-violet-500',
            },
          ]).map((stat) => {
            const isActive = kpiCardsActive[stat.key];
            return (
              <Card
                key={stat.key}
                onClick={() => applyKpiFilter(stat.key)}
                className={`cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
                  isActive ? `ring-2 ring-offset-1 ${stat.ring}` : ''
                }`}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    applyKpiFilter(stat.key);
                  }
                }}
                title={`Filter list to ${stat.label.toLowerCase()}`}
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
            );
          })}
        </div>

        {/* Filters */}
        {!isLoading && wards.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-6 text-center">
              <Building2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="text-sm font-medium text-muted-foreground mb-2">No wards configured</p>
              <p className="text-xs text-muted-foreground mb-3">
                Add wards under{' '}
                <Link href="/admin/clinics" className="text-teal-600 underline font-medium">
                  Administration → Facilities &amp; Departments
                </Link>
              </p>
              <Button variant="outline" size="sm" onClick={fetchData}>Try again</Button>
            </CardContent>
          </Card>
        ) : null}

        <Card>
          <CardContent className="p-4 space-y-3">
            {wards.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-xs text-muted-foreground mr-1">Ward:</span>
                <button
                  type="button"
                  onClick={() => setSelectedWard('all')}
                  className={`px-3 py-1.5 rounded-md transition-colors ${
                    selectedWard === 'all'
                      ? 'bg-teal-600 text-white'
                      : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                  }`}
                >
                  All
                </button>
                {wards.map((ward) => (
                  <button
                    key={ward.id}
                    type="button"
                    onClick={() => setSelectedWard(ward.id.toString())}
                    className={`px-3 py-1.5 rounded-md transition-colors ${
                      selectedWard === ward.id.toString()
                        ? 'bg-teal-600 text-white'
                        : 'bg-muted hover:bg-muted/80 text-muted-foreground'
                    }`}
                  >
                    {ward.name}
                  </button>
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
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setEscalatedOnly(false);
                    setUnassignedBedOnly(false);
                  }}
                >
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
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
                  label="Reset filters"
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

        {/* Patient list — server-paginated; client search narrows the current page only */}
        <div className="space-y-4">
          {isLoading ? (
            <Card>
              <CardContent className="p-12 text-center">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading patients...</p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Action badges only — totals/page indicator are owned by
                  the StandardPagination footer below the list, and the
                  KPI cards above show the scoped counts. Keeping a third
                  copy of the same numbers here was just clutter. The
                  search-narrowing hint stays because it's a state the
                  pagination footer can't show. */}
              {(searchQuery.trim() || activeFilterCount > 0) && (
                <div className="flex items-center justify-between px-1 flex-wrap gap-2">
                  <p className="text-xs text-muted-foreground">
                    {searchQuery.trim() && (
                      <>
                        Search narrowed page to{' '}
                        <span className="font-medium text-foreground">{admissionsTotal}</span>
                        {' '}of{' '}
                        <span className="font-medium text-foreground">{admissions.length}</span>
                      </>
                    )}
                    {searchQuery.trim() && activeFilterCount > 0 && ' · '}
                    {activeFilterCount > 0 && (
                      <>
                        <span className="text-foreground">{activeFilterCount}</span>
                        {' '}filter{activeFilterCount === 1 ? '' : 's'} active
                      </>
                    )}
                  </p>
                </div>
              )}

              {pendingEscorts.length > 0 && (
                <Card id="escort-queue" className="border-amber-300/60 dark:border-amber-700/60 bg-amber-50/30 dark:bg-amber-950/10">
                  <CardContent className="p-3 sm:p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Send className="h-4 w-4 text-amber-600" />
                        Patients leaving with us
                        <Badge variant="outline" className="text-xs">{pendingEscorts.length}</Badge>
                      </div>
                      <p className="text-[11px] text-muted-foreground">
                        Phone back when you've handed over so the escort log closes.
                      </p>
                    </div>
                    <div className="space-y-2">
                      {pendingEscorts.slice(0, 6).map((esc) => {
                        const facility = esc.facility_name_snapshot || esc.facility_name || '—';
                        const departed = esc.departure_at
                          ? formatDisplayDateTime(esc.departure_at)
                          : '—';
                        return (
                          <div
                            key={esc.id}
                            className="rounded-md border bg-background p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                          >
                            <div className="text-sm space-y-0.5 min-w-0">
                              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="font-medium truncate">{esc.patient_name || 'Unknown patient'}</span>
                                {esc.admission_display_id && (
                                  <span className="font-mono text-[11px] text-muted-foreground">
                                    {esc.admission_display_id}
                                  </span>
                                )}
                                {esc.referral_urgency && esc.referral_urgency !== 'routine' && (
                                  <Badge
                                    variant="outline"
                                    className={`text-[10px] capitalize px-1.5 py-0 h-5 ${
                                      esc.referral_urgency === 'emergency'
                                        ? 'border-red-500/50 text-red-600 bg-red-500/10'
                                        : 'border-orange-500/50 text-orange-600 bg-orange-500/10'
                                    }`}
                                  >
                                    {esc.referral_urgency}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                                <span className="font-mono text-[11px]">{esc.referral_id_display || `Escort #${esc.id}`}</span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1">
                                  <MapPin className="h-3 w-3" /> {facility}
                                </span>
                              </div>
                              <div className="text-[11px] text-muted-foreground">
                                Primary: {esc.primary_nurse_name || '—'}
                                {esc.additional_nurse_names?.length
                                  ? ` · +${esc.additional_nurse_names.length} more`
                                  : ''}
                                {' · '}Departed: {departed}
                              </div>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              className="border-amber-500/50 text-amber-700 hover:bg-amber-50 dark:text-amber-300"
                              onClick={() => {
                                setArrivalEscort(esc);
                                setArrivalForm({ arrival_call_outcome: 'answered', arrival_notes: '' });
                                setShowArrivalDialog(true);
                              }}
                            >
                              <PhoneCall className="h-3.5 w-3.5 mr-1" />
                              Confirm arrival
                            </Button>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              )}

              <div className="space-y-2">
                {admissions.length === 0 ? (
                  <Card>
                    <CardContent className="py-12 text-center">
                      <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                      <p className="text-lg font-medium mb-1">No patients found</p>
                      <p className="text-sm text-muted-foreground">
                        {activeFilterCount > 0 || searchQuery.trim()
                          ? `Adjust filters or search — ${admissionsTotal} admission${admissionsTotal === 1 ? '' : 's'} match the current list filters.`
                          : 'No admissions to display.'}
                      </p>
                    </CardContent>
                  </Card>
                ) : (
                  admissions.map((admission) => {
                    const isEscalated = conditionSeverity(admission.current_condition) === 'escalated';
                    const typeLabel = formatAdmissionTypeLabel(admission.admission_type);
                    return (
                      <Card
                        key={admission.id}
                        className={`border-l-4 ${getRowBorder(admission)} hover:shadow-md transition-shadow ${admission.status === 'discharged' ? 'opacity-80' : ''}`}
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
                                      {isEscalated ? '⚠️ ' : ''}{admission.current_condition}
                                    </Badge>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 flex-shrink-0">
                                  <Button
                                    size="icon"
                                    variant="outline"
                                    className="h-7 w-7"
                                    onClick={() => handleViewAdmission(admission)}
                                    title="View patient care"
                                  >
                                    <Eye className="h-3.5 w-3.5" />
                                  </Button>
                                  {admission.status === 'pending_discharge' && (
                                    <Button
                                      size="sm"
                                      className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                                      onClick={() => {
                                        setSelectedAdmission(admission);
                                        resetExitForm();
                                        setShowCompleteDischargeDialog(true);
                                        if (admission.escort) {
                                          void loadNurseDirectory();
                                        }
                                      }}
                                      title="Complete Discharge — confirm patient has left"
                                    >
                                      <CheckCircle className="h-3 w-3 mr-1" />Complete
                                    </Button>
                                  )}
                                </div>
                              </div>

                              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                                <span>{admission.admission_id}</span>
                                <span>•</span>
                                <span>{admission.ward_name}</span>
                                <span>•</span>
                                {admission.bed_number
                                  ? <span>Bed {admission.bed_number}</span>
                                  : <span className="text-amber-500 dark:text-amber-400">No bed</span>
                                }
                                <span>•</span>
                                <span>
                                  {formatDisplayDateMedium(admission.admission_date)}
                                </span>
                                <span>•</span>
                                <span>
                                  {admission.length_of_stay === 0
                                    ? 'Same day'
                                    : `${admission.length_of_stay} day${admission.length_of_stay === 1 ? '' : 's'}`}
                                </span>
                                {admission.admitting_doctor_name && (
                                  <><span>•</span><span>{admission.admitting_doctor_name}</span></>
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
        </div>

        {/* Admission Details Dialog */}
        {selectedAdmission && (
          <Dialog open={showAdmissionDetails} onOpenChange={setShowAdmissionDetails}>
            {/*
              Wider on lg+ so Doctor's Orders (a full clinical workspace) has
              breathing room. Internal flex column + min-h-0 keeps the tab body
              scrollable without overflowing the header.
            */}
            <DialogContent className={`${modalNoOverflow('lg')} max-h-[90vh] flex flex-col p-0 gap-0`}>
              <DialogHeader className="p-5 pb-3 border-b shrink-0">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <PatientAvatar
                      name={selectedAdmission.patient_name}
                      photoUrl={resolvePatientPhoto(selectedAdmission)}
                      size="md"
                      className="shrink-0 hidden sm:flex"
                    />
                    <div className="min-w-0">
                      <DialogTitle className="text-base sm:text-lg flex items-center gap-2 flex-wrap">
                        <span className="truncate">{selectedAdmission.patient_name}</span>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusBadgeClass(selectedAdmission.status)}`}>
                          {formatStatus(selectedAdmission.status)}
                        </Badge>
                        {formatAdmissionTypeLabel(selectedAdmission.admission_type) && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                            {formatAdmissionTypeLabel(selectedAdmission.admission_type)}
                          </Badge>
                        )}
                        {selectedAdmission.current_condition && isEscalatedCondition(selectedAdmission.current_condition) && (
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getConditionBadgeClass(selectedAdmission.current_condition)}`}>
                            ⚠️ {selectedAdmission.current_condition}
                          </Badge>
                        )}
                      </DialogTitle>
                      <DialogDescription className="mt-1 flex items-center gap-2 flex-wrap text-xs">
                        <span className="font-mono">{selectedAdmission.admission_id}</span>
                        <span>·</span>
                        <span>{selectedAdmission.ward_name}</span>
                        {selectedAdmission.bed_number && (<><span>·</span><span>Bed {selectedAdmission.bed_number}</span></>)}
                        <span>·</span>
                        <span>
                          {selectedAdmission.length_of_stay === 0
                            ? 'Same day'
                            : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}
                        </span>
                        {selectedAdmission.admitting_doctor_name && (<><span>·</span><span>Dr {selectedAdmission.admitting_doctor_name}</span></>)}
                        <span>·</span>
                        <span>
                          Nurse: {getPatientAssignments(selectedAdmission.id).length > 0
                            ? getPatientAssignments(selectedAdmission.id).map((a) => a.nurse_name).join(', ')
                            : 'Unassigned'}
                        </span>
                      </DialogDescription>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {selectedAdmission.status === 'admitted' && (
                      <>
                        <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => handleAssignBed(selectedAdmission)}>
                          <BedIcon className="h-3.5 w-3.5 mr-1" />
                          {selectedAdmission.bed_number ? 'Change bed' : 'Assign bed'}
                        </Button>
                        {selectedAdmission.bed_number && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => requestRemoveFromBed(selectedAdmission)}
                          >
                            Remove bed
                          </Button>
                        )}
                      </>
                    )}
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
                </div>
              </DialogHeader>

              <Tabs value={detailsTab} onValueChange={(v) => setDetailsTab(v as WardDetailsTab)} className="w-full flex-1 min-h-0 flex flex-col">
                <div className="px-5 pt-3">
                  <TabsList className="grid w-full grid-cols-3 h-9">
                    <TabsTrigger value="overview" className="text-xs">Care</TabsTrigger>
                    <TabsTrigger value="orders" className="text-xs">Tasks</TabsTrigger>
                    <TabsTrigger value="nursing" className="text-xs">Timeline</TabsTrigger>
                  </TabsList>
                </div>

                <TabsContent value="overview" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2 space-y-4">
                  {selectedAdmission.current_condition && isEscalatedCondition(selectedAdmission.current_condition) && (
                    <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700">
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-orange-600" />
                      <div>
                        <p className="text-xs font-semibold text-orange-800 dark:text-orange-200">Needs doctor review</p>
                        <p className="text-orange-700 dark:text-orange-300">{selectedAdmission.current_condition}</p>
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
                      {selectedAdmission.admission_instructions?.trim() && (
                        <p><span className="text-muted-foreground">Instructions · </span><span className="whitespace-pre-wrap">{selectedAdmission.admission_instructions}</span></p>
                      )}
                    </div>
                  </section>

                  <WardLatestHandoverCard
                    key={`handover-${notesRefreshKey}`}
                    admissionNotes={selectedAdmission.admission_notes}
                  />

                  {selectedAdmission.status === 'admitted' && (
                    <WardQuickObservationForm
                      admission={selectedAdmission}
                      value={observationData}
                      onChange={setObservationData}
                      onSubmit={() => void handleSaveObservation()}
                      isSaving={isSavingObservation}
                    />
                  )}
                </TabsContent>

                <TabsContent value="orders" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2">
                  <WardDoctorOrdersSection
                    admission={selectedAdmission}
                    allowAddOrders={false}
                    allowEditCancelOrders={false}
                    allowPerformOrders={
                      !!currentUser?.isSuperuser ||
                      userCanPerformWardOrders(currentUser)
                    }
                    showRoutingInfo={false}
                    historyDisplay="hidden"
                    excludeHandoffFromList
                    currentUserId={currentUser?.id != null ? Number(currentUser.id) : undefined}
                  />
                </TabsContent>

                <TabsContent value="nursing" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2 space-y-5">
                  <WardHandoverNotesSection
                    key={notesRefreshKey}
                    admissionNotes={selectedAdmission.admission_notes}
                    canAdd={selectedAdmission.status === 'admitted'}
                    onAddNote={handleSaveHandoverNote}
                    isSaving={isSavingHandover}
                  />

                  <WardVitalsHistory
                    admission={selectedAdmission}
                    refreshKey={chartRefreshKey}
                  />

                  <WardDoctorOrdersSection
                    admission={selectedAdmission}
                    allowAddOrders={false}
                    allowEditCancelOrders={false}
                    showRoutingInfo={false}
                    historyDisplay="history-only"
                    excludeHandoffFromList
                  />
                </TabsContent>
              </Tabs>
            </DialogContent>
          </Dialog>
        )}

        {/* Complete Discharge Dialog (Step 2) */}
        {selectedAdmission && (() => {
          const escort = selectedAdmission.escort;
          const facilityLabel = escort?.facility_name_snapshot || escort?.facility_name || '';
          const TRANSPORT_OPTIONS: Array<{ value: string; label: string }> = [
            { value: 'hospital_ambulance', label: 'Hospital ambulance' },
            { value: 'private_vehicle', label: 'Private vehicle' },
            { value: 'family_vehicle', label: 'Family vehicle' },
            { value: 'partner_facility_transport', label: 'Receiving facility transport' },
            { value: 'other', label: 'Other' },
          ];
          const checklistComplete =
            exitChecklist.physically_left &&
            exitChecklist.bed_ready &&
            exitChecklist.belongings_collected &&
            exitChecklist.documents_given;
          return (
          <Dialog open={showCompleteDischargeDialog} onOpenChange={(open) => {
            setShowCompleteDischargeDialog(open);
            if (!open) {
              setSelectedAdmission(null);
              resetExitForm();
            }
          }}>
            <DialogContent className={`${modalNoOverflow('ml')} max-h-[92vh] flex flex-col gap-0 p-0`}>
              <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-1">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle className="h-5 w-5 text-green-500" />
                  Complete Discharge — Step 2 of 2
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="text-muted-foreground text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="font-medium text-foreground">{selectedAdmission.patient_name}</span>
                    <span>·</span>
                    <span className="font-mono text-xs">{selectedAdmission.admission_id}</span>
                    <span>·</span>
                    <span>{selectedAdmission.ward_name}</span>
                    {selectedAdmission.bed_number && (
                      <>
                        <span>·</span>
                        <span>Bed {selectedAdmission.bed_number}</span>
                      </>
                    )}
                    {escort && (
                      <Badge variant="outline" className="text-[10px] border-amber-500/50 text-amber-700 dark:text-amber-400 bg-amber-500/10">
                        <Send className="h-3 w-3 mr-1" /> Escort to {facilityLabel || 'external facility'}
                      </Badge>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="px-5 py-4 overflow-y-auto flex-1 min-h-0 space-y-4">
                <div className="rounded-md border bg-muted/30 px-3 py-2 text-xs text-muted-foreground flex items-center justify-between gap-2">
                  <span>
                    Step {completeDischargeStep} of 2
                    {completeDischargeStep === 1 ? ' · Exit details' : ' · Final checklist'}
                  </span>
                </div>
                {completeDischargeStep === 1 && (
                  <>
                {/* Doctor-set context */}
                {(selectedAdmission.discharge_diagnosis || selectedAdmission.discharge_summary) && (
                  <div className="rounded-md border bg-muted/30 p-3 space-y-2 text-sm">
                    <div className="text-xs font-medium text-muted-foreground">Set by discharging doctor</div>
                    {selectedAdmission.discharge_diagnosis && (
                      <div>
                        <span className="text-muted-foreground">Diagnosis: </span>
                        <span>{selectedAdmission.discharge_diagnosis}</span>
                      </div>
                    )}
                    {selectedAdmission.discharge_summary && (
                      <div>
                        <span className="text-muted-foreground">Summary: </span>
                        <span className="whitespace-pre-wrap">{selectedAdmission.discharge_summary}</span>
                      </div>
                    )}
                    {selectedAdmission.follow_up_instructions && (
                      <div>
                        <span className="text-muted-foreground">Follow-up: </span>
                        <span className="whitespace-pre-wrap">{selectedAdmission.follow_up_instructions}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Required nurse exit summary */}
                <div className="space-y-1.5">
                  <Label htmlFor="nurse-exit-summary">
                    Exit observation summary <span className="text-red-500">*</span>
                  </Label>
                  <Textarea
                    id="nurse-exit-summary"
                    value={exitForm.nurse_exit_summary}
                    onChange={(e) => setExitForm({ ...exitForm, nurse_exit_summary: e.target.value })}
                    placeholder="Last shift's condition at handoff: vitals, lines/drains, mood, education given, valuables returned, medications taken with patient…"
                    rows={4}
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Required. This is the nursing record of how the patient left the ward.
                  </p>
                </div>

                {/* Companion / discharged with */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Discharged with</Label>
                    <Select
                      value={exitForm.discharged_with || ''}
                      onValueChange={(v) => setExitForm({ ...exitForm, discharged_with: v as PatientAdmission['discharged_with'] })}
                    >
                      <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="self">Self / unaccompanied</SelectItem>
                        <SelectItem value="family">Family / next of kin</SelectItem>
                        <SelectItem value="escort_to_external">Escorted to external facility</SelectItem>
                        <SelectItem value="transferred">Transferred internally</SelectItem>
                        <SelectItem value="mortuary">Mortuary</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Companion name</Label>
                    <Input
                      value={exitForm.companion_name}
                      onChange={(e) => setExitForm({ ...exitForm, companion_name: e.target.value })}
                      placeholder="Person collecting patient (optional)"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Relationship</Label>
                    <Input
                      value={exitForm.companion_relationship}
                      onChange={(e) => setExitForm({ ...exitForm, companion_relationship: e.target.value })}
                      placeholder="e.g. Spouse, son"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Companion phone</Label>
                    <Input
                      value={exitForm.companion_phone}
                      onChange={(e) => setExitForm({ ...exitForm, companion_phone: e.target.value })}
                      placeholder="Phone number"
                    />
                  </div>
                </div>

                {/* Escort block — only when an external referral is attached */}
                {escort && (
                  <div className="space-y-3 rounded-md border border-amber-300/60 dark:border-amber-700/60 bg-amber-50/40 dark:bg-amber-950/20 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-2 text-xs font-medium text-amber-700 dark:text-amber-300">
                        <Send className="h-3.5 w-3.5" />
                        External escort handover
                      </div>
                      {escort.referral_id_display && (
                        <Badge variant="outline" className="font-mono text-[10px] px-1.5 py-0 h-5">
                          {escort.referral_id_display}
                        </Badge>
                      )}
                    </div>

                    <div className="text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3 inline mr-1" />
                      Receiving facility: <span className="font-medium text-foreground">{facilityLabel || '—'}</span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Transport mode <span className="text-red-500">*</span></Label>
                        <Select
                          value={exitForm.transport_mode}
                          onValueChange={(v) => setExitForm({ ...exitForm, transport_mode: v })}
                        >
                          <SelectTrigger><SelectValue placeholder="Pick transport..." /></SelectTrigger>
                          <SelectContent>
                            {TRANSPORT_OPTIONS.map((t) => (
                              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-xs">Primary escort nurse</Label>
                        <Input
                          value={currentUser?.name || 'You'}
                          readOnly
                          disabled
                          className="bg-muted"
                        />
                        <p className="text-[10px] text-muted-foreground">Recorded as the signed-in nurse.</p>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Additional escorts (optional)</Label>
                      {nurseDirectoryLoading ? (
                        <div className="text-xs text-muted-foreground inline-flex items-center gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" /> Loading nurse roster…
                        </div>
                      ) : nurseDirectory.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No additional nurses configured.</p>
                      ) : (
                        <div className="max-h-32 overflow-y-auto rounded border bg-background p-2 space-y-1">
                          {nurseDirectory
                            .filter((u) => u.id !== Number(currentUser?.id))
                            .map((u) => {
                              const checked = exitForm.additional_nurse_ids.includes(u.id);
                              const fullName = `${u.first_name || ''} ${u.last_name || ''}`.trim() || u.username;
                              return (
                                <label key={u.id} className="flex items-center gap-2 text-xs cursor-pointer">
                                  <Checkbox
                                    checked={checked}
                                    onCheckedChange={(value) => {
                                      const next = new Set(exitForm.additional_nurse_ids);
                                      if (value === true) next.add(u.id);
                                      else next.delete(u.id);
                                      // Cap to 2 additional escorts (3 total) per workflow agreement.
                                      if (next.size > 2) {
                                        toast.error('Up to 2 additional escorts');
                                        return;
                                      }
                                      setExitForm({ ...exitForm, additional_nurse_ids: Array.from(next) });
                                    }}
                                  />
                                  <span>{fullName}</span>
                                  <span className="text-muted-foreground">· {u.system_role}</span>
                                </label>
                              );
                            })}
                        </div>
                      )}
                    </div>

                    <div className="space-y-1.5">
                      <Label className="text-xs">Handover summary</Label>
                      <Textarea
                        value={exitForm.handover_summary}
                        onChange={(e) => setExitForm({ ...exitForm, handover_summary: e.target.value })}
                        placeholder="What you'll communicate to the receiving nurse: condition, last drugs given, ongoing concerns, ETA…"
                        rows={3}
                      />
                    </div>

                    <p className="text-[11px] text-amber-700 dark:text-amber-400">
                      After the patient arrives and you've handed over, return to the ward and use “Confirm arrival” on the escort log to close the loop.
                    </p>
                  </div>
                )}
                  </>
                )}

                {/* Checklist */}
                {completeDischargeStep === 2 && (
                <div className="rounded-md border bg-green-50/30 dark:bg-green-950/20 p-3 space-y-2">
                  <p className="text-xs font-medium text-green-700 dark:text-green-300">
                    Confirm before sign-out
                  </p>
                  <div className="space-y-1.5 text-sm">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={exitChecklist.physically_left}
                        onCheckedChange={(v) => setExitChecklist({ ...exitChecklist, physically_left: v === true })}
                        className="mt-0.5"
                      />
                      <span>Patient has physically left the ward <span className="text-red-500">*</span></span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={exitChecklist.bed_ready}
                        onCheckedChange={(v) => setExitChecklist({ ...exitChecklist, bed_ready: v === true })}
                        className="mt-0.5"
                      />
                      <span>Bed linen changed / bed ready</span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={exitChecklist.belongings_collected}
                        onCheckedChange={(v) => setExitChecklist({ ...exitChecklist, belongings_collected: v === true })}
                        className="mt-0.5"
                      />
                      <span>Belongings / valuables returned</span>
                    </label>
                    <label className="flex items-start gap-2 cursor-pointer">
                      <Checkbox
                        checked={exitChecklist.documents_given}
                        onCheckedChange={(v) => setExitChecklist({ ...exitChecklist, documents_given: v === true })}
                        className="mt-0.5"
                      />
                      <span>Discharge documents given to patient / family</span>
                    </label>
                  </div>
                  {!checklistComplete && (
                    <p className="text-[11px] text-muted-foreground">
                      Tip: complete all items, but only “patient left” is enforced — the rest are tracked for handover.
                    </p>
                  )}
                </div>
                )}
              </div>
              <DialogFooter className="px-5 py-4 border-t shrink-0 gap-2 sm:justify-end flex-col-reverse sm:flex-row">
                <Button variant="outline" onClick={() => setShowCompleteDischargeDialog(false)} disabled={isCompletingDischarge}>
                  Cancel
                </Button>
                {completeDischargeStep === 1 ? (
                  <Button
                    type="button"
                    onClick={() => {
                      if (!exitForm.nurse_exit_summary.trim()) {
                        toast.error('Exit observation summary is required before continuing');
                        return;
                      }
                      setCompleteDischargeStep(2);
                    }}
                  >
                    Next: Checklist
                  </Button>
                ) : (
                  <Button type="button" variant="outline" onClick={() => setCompleteDischargeStep(1)} disabled={isCompletingDischarge}>
                    Back
                  </Button>
                )}
                <Button
                  className="bg-green-600 hover:bg-green-700 text-white"
                  onClick={handleCompleteDischarge}
                  disabled={isCompletingDischarge || completeDischargeStep === 1 || !exitForm.nurse_exit_summary.trim() || !exitChecklist.physically_left}
                >
                  {isCompletingDischarge
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <CheckCircle className="h-4 w-4 mr-2" />
                  }
                  {escort ? 'Sign out & log escort' : 'Confirm — Patient Has Left'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          );
        })()}

        {/* Confirm Arrival / Handover Dialog */}
        {arrivalEscort && (
          <Dialog open={showArrivalDialog} onOpenChange={(open) => {
            setShowArrivalDialog(open);
            if (!open) setArrivalEscort(null);
          }}>
            <DialogContent className={MODAL_SIZES.sm2}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <PhoneCall className="h-5 w-5 text-amber-500" />
                  Confirm arrival & handover
                </DialogTitle>
                <DialogDescription asChild>
                  <div className="text-muted-foreground text-sm space-y-1">
                    {arrivalEscort.patient_name && (
                      <span className="block">
                        <span className="font-medium text-foreground">{arrivalEscort.patient_name}</span>
                        {arrivalEscort.admission_display_id && (
                          <>
                            <span> · </span>
                            <span className="font-mono text-xs">{arrivalEscort.admission_display_id}</span>
                          </>
                        )}
                      </span>
                    )}
                    <span className="block">
                      <span className="font-mono text-xs">{arrivalEscort.referral_id_display || `Escort #${arrivalEscort.id}`}</span>
                      <span> · </span>
                      <span>{arrivalEscort.facility_name_snapshot || arrivalEscort.facility_name || '—'}</span>
                    </span>
                    <span className="block text-[11px]">
                      Log how you reached the receiving facility. This closes the escort log.
                    </span>
                  </div>
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Outcome</Label>
                  <Select
                    value={arrivalForm.arrival_call_outcome}
                    onValueChange={(v) => setArrivalForm({ ...arrivalForm, arrival_call_outcome: v as 'answered' | 'voicemail' | 'handover_in_person' })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="answered">Answered — handover confirmed by phone</SelectItem>
                      <SelectItem value="handover_in_person">Handed over in person</SelectItem>
                      <SelectItem value="voicemail">Voicemail / no answer (will retry)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Notes</Label>
                  <Textarea
                    value={arrivalForm.arrival_notes}
                    onChange={(e) => setArrivalForm({ ...arrivalForm, arrival_notes: e.target.value })}
                    rows={3}
                    placeholder="Receiving nurse / doctor name, time of handover, concerns…"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowArrivalDialog(false)} disabled={isConfirmingArrival}>Cancel</Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={handleConfirmArrival}
                  disabled={isConfirmingArrival}
                >
                  {isConfirmingArrival
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <CheckCircle className="h-4 w-4 mr-2" />
                  }
                  Close escort log
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Assign Bed Dialog */}
        {selectedAdmission && (
          <Dialog open={showAssignBedDialog} onOpenChange={setShowAssignBedDialog}>
            <DialogContent className={MODAL_SIZES.sm2}>
              <DialogHeader>
                <DialogTitle>
                  {selectedAdmission.bed_number ? 'Change Bed' : 'Assign Bed'}: {selectedAdmission.patient_name}
                </DialogTitle>
                <DialogDescription>
                  {selectedAdmission.bed_number
                    ? `Currently in Bed ${selectedAdmission.bed_number} — select a different bed in ${selectedAdmission.ward_name}`
                    : `Select an available bed in ${selectedAdmission.ward_name}`}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                {(() => {
                  const currentBedId = selectedAdmission.bed ?? null;
                  const pickable = availableBeds.filter(
                    (b) => b.status === 'available' && b.id !== currentBedId,
                  );
                  if (availableBeds.length === 0) {
                    return (
                      <div className="text-center py-8 text-muted-foreground">
                        <BedIcon className="h-12 w-12 mx-auto mb-4 opacity-50" />
                        <p className="font-medium">No beds configured for this ward</p>
                        <p className="text-xs mt-1">Ask an administrator to add beds in <span className="font-medium">Admin → Wards</span>.</p>
                      </div>
                    );
                  }
                  if (pickable.length === 0) {
                    return (
                      <div className="text-center py-6 text-muted-foreground">
                        <BedIcon className="h-10 w-10 mx-auto mb-3 opacity-50" />
                        <p className="font-medium">No other beds are available right now</p>
                        <p className="text-xs mt-1">All other beds are occupied, reserved, or under maintenance. The full list is shown below for context.</p>
                      </div>
                    );
                  }
                  return null;
                })()}

                {availableBeds.length > 0 && (
                  <div className="grid grid-cols-3 gap-2">
                    {availableBeds.map((bed) => {
                      const isCurrent = selectedAdmission.bed === bed.id;
                      const isAvailable = bed.status === 'available' && !isCurrent;
                      // Visual: green ring on pickable, muted on non-pickable.
                      const statusTint =
                        isCurrent ? 'border-blue-500/60 bg-blue-500/5' :
                        bed.status === 'available' ? 'border-emerald-500/60 hover:bg-emerald-500/10' :
                        bed.status === 'occupied' ? 'border-rose-500/40 bg-rose-500/5' :
                        bed.status === 'maintenance' ? 'border-amber-500/40 bg-amber-500/5' :
                        bed.status === 'reserved' ? 'border-violet-500/40 bg-violet-500/5' :
                        'border-muted bg-muted/30';
                      const statusLabel =
                        isCurrent ? 'Current' :
                        bed.status === 'available' ? 'Available' :
                        bed.status === 'occupied' ? 'Occupied' :
                        bed.status === 'maintenance' ? 'Maintenance' :
                        bed.status === 'reserved' ? 'Reserved' :
                        bed.status === 'out_of_service' ? 'Out of service' :
                        bed.status;
                      return (
                        <button
                          key={bed.id}
                          type="button"
                          disabled={!isAvailable || isAssigningBed}
                          onClick={() => handleBedAssignment(bed.id)}
                          title={
                            isCurrent
                              ? 'Patient is already in this bed'
                              : isAvailable
                                ? `Assign Bed ${bed.bed_number}`
                                : `Bed ${bed.bed_number} — ${statusLabel}${bed.current_patient_name ? ` · ${bed.current_patient_name}` : ''}`
                          }
                          className={`relative h-20 rounded-md border text-left px-2.5 py-2 transition-colors ${statusTint} ${
                            !isAvailable ? 'cursor-not-allowed opacity-70' : 'hover:shadow-sm'
                          } disabled:cursor-not-allowed`}
                        >
                          <div className="flex items-center gap-1.5">
                            {isAssigningBed ? (
                              <Loader2 className="h-4 w-4 animate-spin shrink-0" />
                            ) : (
                              <BedIcon className="h-4 w-4 shrink-0" />
                            )}
                            <span className="text-sm font-semibold">Bed {bed.bed_number}</span>
                          </div>
                          <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                            {statusLabel}
                          </div>
                          {bed.current_patient_name && !isCurrent && (
                            <div className="text-[10px] text-muted-foreground truncate mt-0.5" title={bed.current_patient_name}>
                              {bed.current_patient_name}
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {availableBeds.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground pt-1">
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-emerald-500/60" /> Available</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-blue-500/60" /> Current</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-rose-500/40" /> Occupied</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-amber-500/40" /> Maintenance</span>
                    <span className="inline-flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-violet-500/40" /> Reserved</span>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAssignBedDialog(false)}>Cancel</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Remove from Bed confirmation — frees the bed for the next patient */}
        {bedRemovalTarget && (
          <Dialog
            open={showRemoveBedDialog}
            onOpenChange={(open) => {
              if (isRemovingBed) return;
              setShowRemoveBedDialog(open);
              if (!open) setBedRemovalTarget(null);
            }}
          >
            <DialogContent className={MODAL_SIZES.sm2}>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Remove patient from bed?
                </DialogTitle>
                <DialogDescription>
                  {bedRemovalTarget.patient_name} · {bedRemovalTarget.ward_name}
                  {bedRemovalTarget.bed_number && ` · Bed ${bedRemovalTarget.bed_number}`}
                </DialogDescription>
              </DialogHeader>
              <div className="py-2 space-y-3">
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 space-y-1">
                  <p className="text-sm text-amber-800 dark:text-amber-300">
                    The patient will remain admitted but will no longer occupy
                    {bedRemovalTarget.bed_number ? ` Bed ${bedRemovalTarget.bed_number}` : ' this bed'}.
                    The bed becomes available for another admission immediately.
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">
                  Use this when a patient is being moved, the bed needs cleaning, or the assignment was made in error.
                </p>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setShowRemoveBedDialog(false)}
                  disabled={isRemovingBed}
                >
                  Cancel
                </Button>
                <Button
                  className="bg-amber-600 hover:bg-amber-700 text-white"
                  onClick={confirmRemoveFromBed}
                  disabled={isRemovingBed}
                >
                  {isRemovingBed
                    ? <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    : <BedIcon className="h-4 w-4 mr-2" />
                  }
                  Remove from bed
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

      </div>
    </DashboardLayout>
  );
}
