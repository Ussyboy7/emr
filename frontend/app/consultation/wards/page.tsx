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
import {
  WardDoctorOrdersSection,
  userCanAddWardDoctorOrders,
  userCanEditCancelWardOrders,
} from '@/components/ward/WardDoctorOrdersSection';
import { ProgressNotesTimeline } from '@/components/ward/ProgressNotesTimeline';
import {
  Building2, Users, Search, Eye, AlertTriangle, CheckCircle,
  Bed, Activity, RefreshCw, Loader2, FileText, User,
  Send, Download, FileCheck,
} from 'lucide-react';
import { FacilityPartnerSelect, type FacilityPartnerSelectValue } from '@/components/referrals/FacilityPartnerSelect';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { toast } from 'sonner';
import { formatDisplayDateMedium, formatDisplayDateTime, localWeekToTodayBounds } from '@/lib/dates';
import { wardService, type Ward, type PatientAdmission, type WardAssignment } from '@/lib/services/ward-service';
import { useConsultationPageAuth } from '@/hooks/use-consultation-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { ResetFiltersButton } from '@/components/shared/ResetFiltersButton';
import { useServerToday } from '@/hooks/use-server-today';
import { formatLocalYmd } from '@/lib/laboratory/constants';

export default function WardOverviewPage() {
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
  // Default tab the admission details dialog should open on. Lets us deep-link
  // from per-row quick actions (View / Orders / Notes) without juggling refs.
  const [detailsInitialTab, setDetailsInitialTab] = useState<'clinical' | 'orders' | 'progress'>('clinical');

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
  };

  const buildDateParams = useCallback(() => {
    // Anchor "today" on the server's calendar so ward filters align with the
    // rest of the app.
    const today = serverToday ? new Date(`${serverToday}T00:00:00`) : new Date();
    const todayYmd = serverToday || formatLocalYmd(today);
    if (dateRange.from || dateRange.to) {
      return {
        admission_date_after: dateRange.from || undefined,
        admission_date_before: dateRange.to || undefined,
      };
    }
    if (dateFilter === 'today') return { admission_date: todayYmd };
    if (dateFilter === 'week') {
      const { start, end } = localWeekToTodayBounds(serverToday || undefined);
      return { admission_date_after: start, admission_date_before: end };
    }
    if (dateFilter === 'month') {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { admission_date_after: formatLocalYmd(start), admission_date_before: todayYmd };
    }
    return {};
  }, [dateFilter, dateRange.from, dateRange.to, serverToday]);

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
    } catch (error: unknown) {
      console.error('Error fetching admission KPI counts:', error);
      if (handleAuthError(error)) return;
      setKpiAdmittedTotal(0);
      setKpiPendingDischargeTotal(0);
    }

    try {
      const listParams = {
        ...dateParams,
        page: admissionsPage,
        page_size: admissionsPageSize,
        ...(statusFilter !== 'all' ? { status: statusFilter } : {}),
        ...(selectedWard !== 'all' ? { ward: parseInt(selectedWard, 10) } : {}),
        ...(typeFilter !== 'all' ? { admission_type: typeFilter } : {}),
        ...(debouncedSearch.trim() ? { search: debouncedSearch.trim() } : {}),
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
  ]);

  useEffect(() => {
    setAdmissionsPage(1);
  }, [statusFilter, selectedWard, typeFilter, dateFilter, dateRange.from, dateRange.to, debouncedSearch]);

  useEffect(() => {
    if (!ready) return;
    void fetchData();
  }, [ready, fetchData]);

  const handleViewAdmission = (
    admission: PatientAdmission,
    initialTab: 'clinical' | 'orders' | 'progress' = 'clinical',
  ) => {
    setSelectedAdmission(admission);
    setDetailsInitialTab(initialTab);
    setShowAdmissionDetails(true);
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
    if (!dischargeData.discharge_diagnosis.trim()) {
      toast.error('Discharge diagnosis is required');
      return;
    }
    // If the discharge is a transfer and the doctor expanded the referral
    // block, validate the referral fields up front for a tighter UX.
    if (referralEnabled) {
      if (!referralFacility.facility.trim()) {
        toast.error('Please pick or type the receiving facility');
        return;
      }
      if (!referralForm.specialty.trim()) {
        toast.error('Referral specialty is required');
        return;
      }
      if (!referralForm.reason.trim()) {
        toast.error('Referral reason is required');
        return;
      }
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

  const wardStats = useMemo(() => {
    const totalCapacity = wards.reduce((sum, w) => sum + w.total_beds, 0);
    const totalOccupied = wards.reduce((sum, w) => sum + w.occupied_beds, 0);
    const criticalPatients = admissions.filter(a =>
      (a.status === 'admitted' || a.status === 'pending_discharge') &&
      /critical|serious|needs doctor review/i.test(a.current_condition || '')
    ).length;
    return {
      totalCapacity,
      totalAdmissions: kpiAdmittedTotal,
      criticalPatients,
      pendingDischarge: kpiPendingDischargeTotal,
      occupancyRate: totalCapacity > 0 ? Math.round((totalOccupied / totalCapacity) * 100) : 0,
    };
  }, [wards, admissions, kpiAdmittedTotal, kpiPendingDischargeTotal]);

  const isEscalated = (admission: PatientAdmission) =>
    /critical|serious|needs doctor review/i.test(admission.current_condition || '');

  const filteredAdmissions = admissions.filter(admission => {
    if (escalatedOnly && !isEscalated(admission)) return false;
    return true;
  });

  const activeFilterCount =
    (selectedWard !== 'all' ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (typeFilter !== 'all' ? 1 : 0) +
    (dateFilter !== 'all' ? 1 : 0) +
    (dateRange.from || dateRange.to ? 1 : 0) +
    (escalatedOnly ? 1 : 0) +
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

        {/* Stats — clicking a card applies that card's filter so the list
            below narrows immediately. The Total Capacity card has no
            corresponding patient filter, so it stays decorative. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {([
            {
              label: 'Total Capacity', value: wardStats.totalCapacity, icon: Bed,
              color: 'text-blue-500', bg: 'bg-blue-500/10', onClick: undefined,
              isActive: false,
            },
            {
              label: 'Admitted Patients', value: wardStats.totalAdmissions, icon: Users,
              color: 'text-green-500', bg: 'bg-green-500/10',
              onClick: () => { setStatusFilter('admitted'); setEscalatedOnly(false); },
              isActive: statusFilter === 'admitted' && !escalatedOnly,
            },
            {
              label: 'Pending Discharge', value: wardStats.pendingDischarge, icon: CheckCircle,
              color: 'text-amber-500', bg: 'bg-amber-500/10',
              onClick: () => { setStatusFilter('pending_discharge'); setEscalatedOnly(false); },
              isActive: statusFilter === 'pending_discharge',
            },
            {
              label: 'Critical / Escalated', value: wardStats.criticalPatients, icon: AlertTriangle,
              color: 'text-red-500', bg: 'bg-red-500/10',
              onClick: () => { setEscalatedOnly((v) => !v); },
              isActive: escalatedOnly,
            },
          ] as const).map((stat, i) => {
            const interactive = !!stat.onClick;
            return (
              <Card
                key={i}
                onClick={stat.onClick}
                className={`${interactive ? 'cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5' : ''} ${stat.isActive ? `ring-2 ring-offset-1 ${stat.color.replace('text-', 'ring-')}` : ''}`}
                role={interactive ? 'button' : undefined}
                tabIndex={interactive ? 0 : undefined}
                onKeyDown={interactive ? (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); stat.onClick?.(); } } : undefined}
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

        {/* Ward Capacity Cards */}
        {!isLoading && wards.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="p-8 text-center">
              <Building2 className="h-12 w-12 text-muted-foreground/50 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-muted-foreground mb-2">No Wards Configured</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Please contact your system administrator to configure hospital wards.
              </p>
              <Button variant="outline" onClick={fetchData} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Try Again
              </Button>
            </CardContent>
          </Card>
        ) : wards.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {wards.map((ward) => {
              const pct = ward.total_beds > 0 ? Math.round((ward.occupied_beds / ward.total_beds) * 100) : 0;
              const isFull = pct >= 90;
              const hasAvailability = ward.available_beds > 0;
              const isActive = selectedWard === ward.id.toString();
              return (
                <Card
                  key={ward.id}
                  onClick={() => setSelectedWard(isActive ? 'all' : ward.id.toString())}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      setSelectedWard(isActive ? 'all' : ward.id.toString());
                    }
                  }}
                  className={`cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 ${
                    isActive ? 'ring-2 ring-blue-500 ring-offset-1' :
                    isFull ? 'border-red-200 dark:border-red-800' :
                    hasAvailability ? 'border-green-200 dark:border-green-800' :
                    'border-yellow-200 dark:border-yellow-800'
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <Building2 className={`h-4 w-4 ${hasAvailability ? 'text-green-500' : 'text-red-500'}`} />
                      <p className="font-medium text-sm truncate">{ward.name}</p>
                    </div>
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-2xl font-bold">{ward.occupied_beds}/{ward.total_beds}</span>
                      <span className={`text-sm font-medium px-2 py-0.5 rounded-full ${
                        isFull ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                        hasAvailability ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                        'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                      }`}>{pct}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mb-2">{ward.available_beds} beds available</p>
                    <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-1.5">
                      <div
                        className={`h-1.5 rounded-full transition-all ${isFull ? 'bg-red-500' : pct > 70 ? 'bg-yellow-500' : 'bg-green-500'}`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : null}

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
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
                <Select value={selectedWard} onValueChange={setSelectedWard}>
                  <SelectTrigger className="w-[180px]"><SelectValue placeholder="All Wards" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Wards</SelectItem>
                    {wards.map(w => (
                      <SelectItem key={w.id} value={w.id.toString()}>{w.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
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
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="elective">Elective</SelectItem>
                    <SelectItem value="regular">Regular</SelectItem>
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
                {escalatedOnly ? 'Escalated only · ' : ''}
                Showing <span className="font-medium text-foreground">{filteredAdmissions.length}</span>
                {!escalatedOnly && admissionsTotal > filteredAdmissions.length ? (
                  <> of <span className="font-medium text-foreground">{admissionsTotal}</span></>
                ) : null}
                {' '}patient{filteredAdmissions.length !== 1 ? 's' : ''}
              </p>
              {!escalatedOnly && filteredAdmissions.some(a => /needs doctor review/i.test(a.current_condition || '')) && (
                <button
                  type="button"
                  onClick={() => setEscalatedOnly(true)}
                  className="inline-flex"
                  title="Filter list to escalated patients"
                >
                  <Badge className="bg-orange-500/10 text-orange-600 border-orange-500/50 text-xs hover:bg-orange-500/20 cursor-pointer">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    {filteredAdmissions.filter(a => /needs doctor review/i.test(a.current_condition || '')).length} need{filteredAdmissions.filter(a => /needs doctor review/i.test(a.current_condition || '')).length === 1 ? 's' : ''} review
                  </Badge>
                </button>
              )}
            </div>

            <div className="space-y-2">
              {filteredAdmissions.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center">
                    <Search className="mx-auto h-12 w-12 text-muted-foreground mb-4" />
                    <p className="text-lg font-medium mb-1">No patients found</p>
                    <p className="text-sm text-muted-foreground">Try adjusting your search or filter criteria</p>
                  </CardContent>
                </Card>
              ) : (
                filteredAdmissions.map((admission) => {
                  const patientAssignments = getPatientAssignments(admission.id);
                  const avatar = getAvatarStyle(admission.status);
                  return (
                    <Card
                      key={admission.id}
                      className={`border-l-4 ${getStatusColor(admission.status, admission.current_condition)} hover:shadow-md transition-shadow`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {/* Avatar */}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatar.bg}`}>
                            <span className={`font-semibold text-xs ${avatar.text}`}>{initials(admission.patient_name)}</span>
                          </div>

                          {/* Info */}
                          <div className="flex-1 min-w-0">
                            {/* Row 1 */}
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap min-w-0">
                                <span className="font-semibold text-foreground truncate">{admission.patient_name}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getStatusBadgeClass(admission.status)}`}>
                                  {formatStatus(admission.status)}
                                </Badge>
                                {admission.current_condition && (
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 h-5 ${getConditionBadgeClass(admission.current_condition)}`}>
                                    {admission.current_condition}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {/* One entry to the patient details dialog — its
                                    Clinical / Orders / Progress Notes tabs handle
                                    the rest. Keeping separate row buttons for
                                    each tab was clutter. */}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => handleViewAdmission(admission, 'clinical')}
                                  title="View details (Clinical · Orders · Progress notes)"
                                >
                                  <Eye className="h-3.5 w-3.5" />
                                </Button>
                                {admission.status === 'admitted' && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
                                    onClick={() => { setSelectedAdmission(admission); setShowDischargeDialog(true); }}
                                    title="Initiate Discharge"
                                  >
                                    <CheckCircle className="h-3 w-3 mr-1" />Discharge
                                  </Button>
                                )}
                                {admission.status === 'pending_discharge' && (
                                  <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10 animate-pulse">
                                    Awaiting nurse
                                  </Badge>
                                )}
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-7 w-7"
                                  onClick={() => handleDownloadSummary(admission)}
                                  disabled={isDownloadingSummary}
                                  title={
                                    admission.status === 'discharged'
                                      ? 'Download admission summary (PDF)'
                                      : 'Download interim admission summary (PDF)'
                                  }
                                >
                                  {isDownloadingSummary
                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    : <Download className="h-3.5 w-3.5" />
                                  }
                                </Button>
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

            {!escalatedOnly && admissionsTotal > 0 && (
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
          <Dialog open={showAdmissionDetails} onOpenChange={setShowAdmissionDetails}>
            <DialogContent className="w-[95vw] sm:max-w-[920px] lg:max-w-[1000px] max-h-[92vh] flex flex-col gap-0 overflow-hidden p-0">
              <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-2">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <DialogTitle className="flex items-center gap-2 text-lg">
                    <User className="h-5 w-5 text-blue-500 shrink-0" />
                    {selectedAdmission.patient_name}
                  </DialogTitle>
                  {/* Header keeps just the status pill — PDF actions live in
                      the dialog footer with the Close button (consistent with
                      the rest of the EMR's modals). */}
                  <Badge variant="outline" className={`${getStatusBadgeClass(selectedAdmission.status)} font-normal`}>
                    {formatStatus(selectedAdmission.status)}
                  </Badge>
                </div>
                {/* asChild + div: DialogDescription defaults to <p> — Badges are <div>s and cannot nest inside <p>. */}
                <DialogDescription asChild>
                  <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                    <span className="font-mono text-xs">{selectedAdmission.admission_id}</span>
                    <span className="text-muted-foreground">·</span>
                    <span>{selectedAdmission.ward_name}</span>
                    {selectedAdmission.location_clinic_name && (<><span className="text-muted-foreground">·</span><span>{selectedAdmission.location_clinic_name}</span></>)}
                    {selectedAdmission.bed_number ? (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <span>Bed {selectedAdmission.bed_number}</span>
                      </>
                    ) : null}
                    {selectedAdmission.current_condition && (
                      <>
                        <span className="text-muted-foreground">·</span>
                        <Badge variant="outline" className={`text-[10px] capitalize px-1.5 py-0 h-5 ${getConditionBadgeClass(selectedAdmission.current_condition)}`}>
                          {selectedAdmission.current_condition}
                        </Badge>
                      </>
                    )}
                  </div>
                </DialogDescription>
              </DialogHeader>
              <Tabs defaultValue={detailsInitialTab} key={`${selectedAdmission.id}-${detailsInitialTab}`} className="flex-1 min-h-0 flex flex-col">
                <TabsList className="mx-5 mt-3 grid grid-cols-3 h-9 shrink-0">
                  <TabsTrigger value="clinical" className="text-xs">Clinical</TabsTrigger>
                  <TabsTrigger value="orders" className="text-xs">Orders</TabsTrigger>
                  <TabsTrigger value="progress" className="text-xs">
                    <FileText className="h-3 w-3 mr-1 hidden sm:inline" />
                    Progress Notes
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="clinical" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2 space-y-4">
                  {/* Nurse escalation alert — shown at top so doctor sees it immediately */}
                  {selectedAdmission.current_condition && (
                    <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm ${
                      /needs doctor review/i.test(selectedAdmission.current_condition)
                        ? 'bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-400'
                        : 'bg-blue-50 dark:bg-blue-950/30 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-400'
                    }`}>
                      <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-medium text-xs uppercase tracking-wide mb-0.5">Nurse Report — Current Condition</p>
                        <p>{selectedAdmission.current_condition}</p>
                      </div>
                    </div>
                  )}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">Admission Date</Label>
                      <p className="font-medium text-sm">
                        {formatDisplayDateMedium(selectedAdmission.admission_date)}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Length of Stay</Label>
                      <p className="font-medium text-sm">
                        {selectedAdmission.length_of_stay === 0
                          ? 'Same day'
                          : `${selectedAdmission.length_of_stay} day${selectedAdmission.length_of_stay === 1 ? '' : 's'}`}
                      </p>
                    </div>
                    {selectedAdmission.admitting_doctor_name && (
                      <div>
                        <Label className="text-muted-foreground text-xs">Admitting Doctor</Label>
                        <p className="font-medium text-sm">{selectedAdmission.admitting_doctor_name}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-muted-foreground text-xs">Status</Label>
                      <Badge variant="outline" className={`text-xs mt-0.5 ${getStatusBadgeClass(selectedAdmission.status)}`}>
                        {formatStatus(selectedAdmission.status)}
                      </Badge>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">Location</Label>
                      <p className="font-medium text-sm mt-0.5">{selectedAdmission.location_clinic_name || '—'}</p>
                    </div>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-xs">Admission Diagnosis</Label>
                    <p className="text-sm bg-muted p-3 rounded mt-1">{selectedAdmission.admission_diagnosis}</p>
                  </div>
                  {selectedAdmission.presenting_complaint && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Presenting Complaint</Label>
                      <p className="text-sm bg-muted p-3 rounded mt-1">{selectedAdmission.presenting_complaint}</p>
                    </div>
                  )}

                  {/* Discharge plan — surfaces what the doctor configured in the
                      Initiate Discharge dialog, plus any linked external referral,
                      so it's visible without re-opening the discharge form. */}
                  {(selectedAdmission.status === 'pending_discharge' || selectedAdmission.status === 'discharged') && (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
                        <Label className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400 font-semibold">
                          Discharge Plan
                        </Label>
                        {selectedAdmission.status === 'pending_discharge' && (
                          <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                            Awaiting nurse sign-out
                          </Badge>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {selectedAdmission.discharge_type && (
                          <div>
                            <Label className="text-muted-foreground text-xs">Discharge type</Label>
                            <p className="font-medium capitalize">{selectedAdmission.discharge_type.replace(/_/g, ' ')}</p>
                          </div>
                        )}
                        {selectedAdmission.discharge_date && (
                          <div>
                            <Label className="text-muted-foreground text-xs">
                              {selectedAdmission.status === 'discharged' ? 'Discharged on' : 'Initiated on'}
                            </Label>
                            <p className="font-medium">
                              {formatDisplayDateTime(selectedAdmission.discharge_date)}
                            </p>
                          </div>
                        )}
                      </div>
                      {selectedAdmission.discharge_diagnosis && (
                        <div>
                          <Label className="text-muted-foreground text-xs">Final diagnosis</Label>
                          <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1">{selectedAdmission.discharge_diagnosis}</p>
                        </div>
                      )}
                      {selectedAdmission.discharge_summary && (
                        <div>
                          <Label className="text-muted-foreground text-xs">Discharge summary</Label>
                          <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1 whitespace-pre-wrap">{selectedAdmission.discharge_summary}</p>
                        </div>
                      )}
                      {selectedAdmission.follow_up_instructions && (
                        <div>
                          <Label className="text-muted-foreground text-xs">Follow-up instructions</Label>
                          <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1 whitespace-pre-wrap">{selectedAdmission.follow_up_instructions}</p>
                        </div>
                      )}

                      {/* External referral / escort */}
                      {selectedAdmission.escort && (
                        <div className="mt-2 rounded-md border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-3 space-y-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <Send className="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-400" />
                            <Label className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-400 font-semibold">
                              External Referral Linked
                            </Label>
                            {selectedAdmission.escort.referral_id_display && (
                              <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-mono">
                                {selectedAdmission.escort.referral_id_display}
                              </Badge>
                            )}
                            {selectedAdmission.escort.referral_urgency && (
                              <Badge variant="outline" className={`text-[10px] px-1.5 h-5 ${
                                selectedAdmission.escort.referral_urgency === 'emergency'
                                  ? 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10'
                                  : selectedAdmission.escort.referral_urgency === 'urgent'
                                  ? 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10'
                                  : 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10'
                              }`}>
                                {selectedAdmission.escort.referral_urgency}
                              </Badge>
                            )}
                            {selectedAdmission.escort.is_arrival_confirmed ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                                Arrival confirmed
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                                Arrival pending
                              </Badge>
                            )}
                            {/* Edit / Cancel — only while still pending nurse sign-out
                                AND arrival not yet confirmed. After patient leaves the
                                ward, changes belong in the consultation referrals
                                module (the backend rejects them anyway). */}
                            {selectedAdmission.status === 'pending_discharge'
                              && !selectedAdmission.escort.is_arrival_confirmed && (
                              <div className="ml-auto flex items-center gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-cyan-700 dark:text-cyan-300 hover:bg-cyan-100 dark:hover:bg-cyan-900/40"
                                  onClick={() => openEditReferral(selectedAdmission)}
                                >
                                  Edit
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs text-red-700 dark:text-red-300 hover:bg-red-100 dark:hover:bg-red-900/40"
                                  onClick={() => { setCancelReferralReason(''); setCancelReferralOpen(true); }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            )}
                          </div>
                          <div className="grid grid-cols-2 gap-2 text-sm">
                            <div>
                              <Label className="text-muted-foreground text-xs">Receiving facility</Label>
                              <p className="font-medium text-sm">
                                {selectedAdmission.escort.facility_name_snapshot || selectedAdmission.escort.facility_name || '—'}
                              </p>
                            </div>
                            {selectedAdmission.escort.transport_mode && (
                              <div>
                                <Label className="text-muted-foreground text-xs">Transport</Label>
                                <p className="font-medium text-sm capitalize">{selectedAdmission.escort.transport_mode.replace(/_/g, ' ')}</p>
                              </div>
                            )}
                            {selectedAdmission.escort.primary_nurse_name && (
                              <div>
                                <Label className="text-muted-foreground text-xs">Primary escort nurse</Label>
                                <p className="font-medium text-sm">{selectedAdmission.escort.primary_nurse_name}</p>
                              </div>
                            )}
                            {selectedAdmission.escort.additional_nurse_names && selectedAdmission.escort.additional_nurse_names.length > 0 && (
                              <div>
                                <Label className="text-muted-foreground text-xs">Additional escorts</Label>
                                <p className="font-medium text-sm">{selectedAdmission.escort.additional_nurse_names.join(', ')}</p>
                              </div>
                            )}
                            {selectedAdmission.escort.departure_at && (
                              <div>
                                <Label className="text-muted-foreground text-xs">Departed</Label>
                                <p className="font-medium text-sm">
                                  {formatDisplayDateTime(selectedAdmission.escort.departure_at)}
                                </p>
                              </div>
                            )}
                            {selectedAdmission.escort.arrival_confirmed_at && (
                              <div>
                                <Label className="text-muted-foreground text-xs">Arrived</Label>
                                <p className="font-medium text-sm">
                                  {formatDisplayDateTime(selectedAdmission.escort.arrival_confirmed_at)}
                                  {selectedAdmission.escort.arrival_call_outcome && (
                                    <span className="text-muted-foreground ml-1 capitalize">· {selectedAdmission.escort.arrival_call_outcome.replace(/_/g, ' ')}</span>
                                  )}
                                </p>
                              </div>
                            )}
                          </div>
                          {selectedAdmission.escort.handover_summary && (
                            <div>
                              <Label className="text-muted-foreground text-xs">Handover summary</Label>
                              <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1 whitespace-pre-wrap">
                                {selectedAdmission.escort.handover_summary}
                              </p>
                            </div>
                          )}
                          {selectedAdmission.escort.arrival_notes && (
                            <div>
                              <Label className="text-muted-foreground text-xs">Arrival notes</Label>
                              <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1 whitespace-pre-wrap">
                                {selectedAdmission.escort.arrival_notes}
                              </p>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </TabsContent>
                <TabsContent value="orders" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2">
                  <WardDoctorOrdersSection
                    admission={selectedAdmission}
                    allowAddOrders={!!currentUser?.isSuperuser || userCanAddWardDoctorOrders(currentUser?.systemRole)}
                    allowEditCancelOrders={!!currentUser?.isSuperuser || userCanEditCancelWardOrders(currentUser?.systemRole)}
                    currentUserId={currentUser?.id != null ? Number(currentUser.id) : undefined}
                  />
                </TabsContent>

                <TabsContent value="progress" className="flex-1 min-h-0 overflow-y-auto px-5 py-4 mt-2 space-y-5">
                  {/* Write new note — only while the patient is still
                      admitted. Once discharged the note feed is read-only. */}
                  {selectedAdmission.status === 'admitted' && (
                    <section className="rounded-lg border bg-card p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <Label className="text-sm font-medium">Write progress note</Label>
                        <span className="text-[11px] text-muted-foreground">
                          Stamped with your name & timestamp
                        </span>
                      </div>
                      <Textarea
                        value={progressNote}
                        onChange={(e) => setProgressNote(e.target.value)}
                        placeholder="Daily ward round note — patient progress, clinical findings, plan..."
                        rows={4}
                        className="resize-y"
                      />
                      <div className="flex justify-end">
                        <Button
                          size="sm"
                          onClick={handleSaveProgressNote}
                          disabled={isSavingNote || !progressNote.trim()}
                        >
                          {isSavingNote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                          Save note
                        </Button>
                      </div>
                    </section>
                  )}

                  {/* Existing notes — render as a timeline of cards rather
                      than a single text dump. The timeline component owns
                      parsing of the prepended note format. */}
                  {selectedAdmission.admission_notes ? (
                    <ProgressNotesTimeline
                      notes={selectedAdmission.admission_notes}
                      showHeading
                    />
                  ) : (
                    !selectedAdmission.current_condition && (
                      <div className="rounded-lg border border-dashed p-6 text-center">
                        <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                        <p className="text-sm text-muted-foreground">No progress notes recorded yet.</p>
                        {selectedAdmission.status === 'admitted' && (
                          <p className="text-xs text-muted-foreground/70 mt-1">
                            Use the box above to write the first ward round note.
                          </p>
                        )}
                      </div>
                    )
                  )}
                </TabsContent>
              </Tabs>
              <DialogFooter className="px-5 py-3 border-t shrink-0 gap-2 sm:justify-between flex-col-reverse sm:flex-row sm:items-center">
                <div className="flex items-center gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs"
                    onClick={() => handleDownloadSummary(selectedAdmission)}
                    disabled={isDownloadingSummary}
                    title={
                      selectedAdmission.status === 'discharged'
                        ? 'Download full chart-copy admission summary (PDF)'
                        : 'Download interim admission summary (PDF)'
                    }
                  >
                    {isDownloadingSummary
                      ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      : <Download className="h-3.5 w-3.5 mr-1.5" />
                    }
                    {selectedAdmission.status === 'discharged' ? 'Summary PDF' : 'Interim PDF'}
                  </Button>
                  {(selectedAdmission.status === 'discharged' || selectedAdmission.status === 'pending_discharge') && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => handleDownloadSlip(selectedAdmission)}
                      disabled={isDownloadingSlip}
                      title="Download patient discharge slip (one-page handout)"
                    >
                      {isDownloadingSlip
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <FileText className="h-3.5 w-3.5 mr-1.5" />
                      }
                      Patient Slip
                    </Button>
                  )}
                  {/* Referral Letter — only when an external referral is
                      linked (escort exists). Doctors print this to hand to
                      the receiving facility / send with the escort. */}
                  {selectedAdmission.escort && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 text-xs"
                      onClick={() => handleDownloadReferralLetter(selectedAdmission)}
                      disabled={isDownloadingReferralLetter}
                      title="Download formal referral letter for the receiving facility (PDF)"
                    >
                      {isDownloadingReferralLetter
                        ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                        : <Send className="h-3.5 w-3.5 mr-1.5" />
                      }
                      Referral Letter
                    </Button>
                  )}
                  {/* Responsibility form — context-driven label/variant.
                      Skipped when the admission state can't yet support a
                      meaningful form (still admitted, no discharge plan). */}
                  {(() => {
                    const v = getResponsibilityFormVariant(selectedAdmission);
                    if (!v) return null;
                    return (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-8 text-xs"
                        onClick={() => handleDownloadResponsibilityForm(selectedAdmission, v.formType)}
                        disabled={isDownloadingResponsibility}
                        title={`Download ${v.label.toLowerCase()} for patient / guardian signature (PDF)`}
                      >
                        {isDownloadingResponsibility
                          ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          : <FileCheck className="h-3.5 w-3.5 mr-1.5" />
                        }
                        {v.label}
                      </Button>
                    );
                  })()}
                </div>
                <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => setShowAdmissionDetails(false)}>
                  Close
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        )}

        {/* Discharge Dialog */}
        {selectedAdmission && (
          <Dialog open={showDischargeDialog} onOpenChange={(open) => {
            setShowDischargeDialog(open);
            if (!open) resetDischargeForm();
          }}>
            <DialogContent className="w-[95vw] sm:max-w-[640px] max-h-[92vh] flex flex-col gap-0 overflow-hidden p-0">
              <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-1">
                <DialogTitle className="flex items-center gap-2 text-lg">
                  <CheckCircle className="h-5 w-5 text-amber-500" />
                  Initiate Discharge — Step 1 of 2
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
                      onChange={(e) => setDischargeData({ ...dischargeData, discharge_diagnosis: e.target.value })}
                      placeholder="Final diagnosis"
                    />
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

                {/* External-care referral toggle */}
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
                      onChange={setReferralFacility}
                      disabled={isSubmittingDischarge}
                    />

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Specialty / Department <span className="text-red-500">*</span></Label>
                        <Input
                          value={referralForm.specialty}
                          onChange={(e) => setReferralForm({ ...referralForm, specialty: e.target.value })}
                          placeholder="e.g. Cardiology"
                          disabled={isSubmittingDischarge}
                        />
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
                        onChange={(e) => setReferralForm({ ...referralForm, reason: e.target.value })}
                        placeholder="Why are you referring this patient?"
                        rows={2}
                        disabled={isSubmittingDischarge}
                      />
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
              </div>
              <DialogFooter className="px-5 py-4 border-t shrink-0 gap-2 sm:justify-end flex-col-reverse sm:flex-row">
                <Button variant="outline" onClick={() => setShowDischargeDialog(false)} disabled={isSubmittingDischarge}>Cancel</Button>
                <Button className="bg-amber-600 hover:bg-amber-700 text-white" onClick={handleInitiateDischarge} disabled={isSubmittingDischarge}>
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
          <DialogContent className="w-[95vw] sm:max-w-[640px] max-h-[90vh] flex flex-col p-0">
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
          <DialogContent className="w-[95vw] sm:max-w-[480px]">
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

      </div>
    </DashboardLayout>
  );
}
