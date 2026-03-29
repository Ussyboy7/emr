"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { StandardPagination } from "@/components/StandardPagination";
import {
  Building2,
  Calendar,
  Eye,
  Send,
  Search,
  Stethoscope,
  Plus,
  RefreshCw,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { referralService, type ResponsibilityFormIssuance } from "@/lib/services/referral-service";
import { patientService, type Patient } from "@/lib/services/patient-service";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  type ReferralWithPatient,
  REFERRAL_STATUS_OPTIONS,
  REFERRAL_URGENCY_OPTIONS,
  REFERRAL_FACILITY_TYPE_OPTIONS,
  toLabel,
  referralStatusLabel,
  getStatusBadgeClass,
  getUrgencyBadgeClass,
  getFacilityTypeBadgeClass,
  printReferralLetter as printReferralLetterWindow,
  printResponsibilityForm as printResponsibilityFormWindow,
} from "@/lib/referrals/referral-helpers";
import { ConsultationReferralDetailModal } from "./ConsultationReferralDetailModal";
import { hasOverlappingActiveResponsibilityForm } from "@/components/referrals/responsibility-form-blocks";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ConsultationReferralsPage() {
  const { currentUser } = useCurrentUser();
  const [referrals, setReferrals] = useState<ReferralWithPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    submitted: 0,
    inReview: 0,
    approved: 0,
    closed: 0,
  });
  const [selectedReferral, setSelectedReferral] = useState<ReferralWithPatient | null>(null);
  const [selectedForms, setSelectedForms] = useState<ResponsibilityFormIssuance[]>([]);
  const [formsLoading, setFormsLoading] = useState(false);
  const [issuingForm, setIssuingForm] = useState(false);
  const [formPayload, setFormPayload] = useState({ valid_from: "", valid_to: "", notes: "" });
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    specialty: "",
    facility: "",
    facility_type: "internal" as ReferralWithPatient["facility_type"],
    reason: "",
    clinical_summary: "",
    contact_person: "",
    contact_phone: "",
    urgency: "routine" as ReferralWithPatient["urgency"],
  });
  const [formOverrideReason, setFormOverrideReason] = useState("");
  const [submittingToRecords, setSubmittingToRecords] = useState(false);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [facilityFilter, setFacilityFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const legacyStatusMap: Record<string, string> = {
    submitted_to_records: "sent",
    records_review: "accepted",
    approved_for_forms: "scheduled",
    closed: "completed",
  };

  const consultationStatusOptions = useMemo(
    () => REFERRAL_STATUS_OPTIONS.filter((o) => o.value !== "returned_for_correction"),
    []
  );

  const isInvalidChoiceError = (error: unknown) => {
    const msg = String((error as { message?: string })?.message || (error as { apiMessage?: string })?.apiMessage || "").toLowerCase();
    return msg.includes("not one of the available choices") || msg.includes("select a valid choice");
  };

  const getReferralsWithStatusFallback = async (params: Parameters<typeof referralService.getReferrals>[0]) => {
    try {
      return await referralService.getReferrals(params);
    } catch (error: unknown) {
      const requestedStatus = params?.status;
      if (!requestedStatus || !isInvalidChoiceError(error)) throw error;
      const fallbackStatus = legacyStatusMap[requestedStatus];
      if (!fallbackStatus) throw error;
      return referralService.getReferrals({ ...params, status: fallbackStatus });
    }
  };

  const formatLocalYyyyMmDd = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const buildDateParams = useCallback(() => {
    let date: string | undefined;
    let start_date: string | undefined;
    let end_date: string | undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateFilter === "today") {
      date = formatLocalYyyyMmDd(today);
    } else if (dateFilter === "week") {
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      start_date = formatLocalYyyyMmDd(weekStart);
      end_date = formatLocalYyyyMmDd(today);
    } else if (dateFilter === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      start_date = formatLocalYyyyMmDd(monthStart);
      end_date = formatLocalYyyyMmDd(today);
    }
    return { date, start_date, end_date };
  }, [dateFilter]);

  const listBaseParams = useCallback(() => {
    const params: Parameters<typeof referralService.getReferrals>[0] = {
      exclude_status: "returned_for_correction",
      page: currentPage,
      page_size: itemsPerPage,
    };
    if (statusFilter !== "all") params.status = statusFilter;
    if (specialtyFilter !== "all") params.specialty = specialtyFilter;
    if (facilityFilter !== "all") params.facility = facilityFilter;
    if (urgencyFilter !== "all") params.urgency = urgencyFilter;
    if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
    Object.assign(params, buildDateParams());
    return params;
  }, [
    currentPage,
    itemsPerPage,
    statusFilter,
    specialtyFilter,
    facilityFilter,
    urgencyFilter,
    debouncedSearchQuery,
    buildDateParams,
  ]);

  const fetchReferrals = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await getReferralsWithStatusFallback(listBaseParams());
      setReferrals(response.results || []);
      setTotalCount(response.count || 0);
    } catch (error: unknown) {
      console.error("Error loading referrals:", error);
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }
      toast.error((error as Error)?.message || "Failed to load referrals");
    } finally {
      setIsLoading(false);
    }
  }, [listBaseParams]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const commonParams: Parameters<typeof referralService.getReferrals>[0] = {
        exclude_status: "returned_for_correction",
        page: 1,
        page_size: 1000,
      };
      if (specialtyFilter !== "all") commonParams.specialty = specialtyFilter;
      if (facilityFilter !== "all") commonParams.facility = facilityFilter;
      if (urgencyFilter !== "all") commonParams.urgency = urgencyFilter;
      if (debouncedSearchQuery.trim()) commonParams.search = debouncedSearchQuery.trim();
      Object.assign(commonParams, buildDateParams());
      const totalRes = await getReferralsWithStatusFallback({ ...commonParams, status: undefined });
      const rows = totalRes.results || [];
      const submittedStatuses = new Set(["submitted_to_records", "sent"]);
      const reviewStatuses = new Set(["records_review", "accepted"]);
      const approvedStatuses = new Set(["approved_for_forms", "scheduled"]);
      const closedStatuses = new Set(["closed", "completed"]);
      setStats({
        total: totalRes.count || 0,
        submitted: rows.filter((r) => submittedStatuses.has(String(r.status || ""))).length,
        inReview: rows.filter((r) => reviewStatuses.has(String(r.status || ""))).length,
        approved: rows.filter((r) => approvedStatuses.has(String(r.status || ""))).length,
        closed: rows.filter((r) => closedStatuses.has(String(r.status || ""))).length,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setStatsLoading(false);
    }
  }, [specialtyFilter, facilityFilter, urgencyFilter, debouncedSearchQuery, buildDateParams]);

  useEffect(() => {
    void fetchReferrals();
  }, [fetchReferrals]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, specialtyFilter, facilityFilter, urgencyFilter, dateFilter, debouncedSearchQuery]);

  const uid = currentUser?.id ? Number(currentUser.id) : NaN;
  const isMine = (r: ReferralWithPatient) => {
    if (!Number.isFinite(uid)) return false;
    const rid = r.referred_by != null ? Number(r.referred_by) : NaN;
    const cid = r.created_by != null ? Number(r.created_by) : NaN;
    return uid === rid || uid === cid;
  };

  const openReferralDetails = async (referral: ReferralWithPatient) => {
    setFormOverrideReason("");
    setShowDetailsModal(true);
    setFormsLoading(true);
    try {
      const fresh = await referralService.getReferral(referral.id);
      setSelectedReferral(fresh as ReferralWithPatient);
    } catch {
      setSelectedReferral(referral);
    }
    try {
      const forms = await referralService.getForms(referral.id);
      setSelectedForms(forms || []);
    } catch {
      setSelectedForms([]);
    } finally {
      setFormsLoading(false);
    }
  };

  const openEdit = (r: ReferralWithPatient) => {
    setEditForm({
      specialty: r.specialty || "",
      facility: r.facility || "",
      facility_type: r.facility_type || "internal",
      reason: r.reason || "",
      clinical_summary: r.clinical_summary || "",
      contact_person: r.contact_person || "",
      contact_phone: r.contact_phone || "",
      urgency: r.urgency || "routine",
    });
    setShowEditModal(true);
  };

  const saveEdit = async () => {
    if (!selectedReferral) return;
    setEditSaving(true);
    try {
      const updated = await referralService.updateReferral(selectedReferral.id, {
        specialty: editForm.specialty,
        facility: editForm.facility,
        facility_type: editForm.facility_type,
        reason: editForm.reason,
        clinical_summary: editForm.clinical_summary || undefined,
        contact_person: editForm.contact_person || undefined,
        contact_phone: editForm.contact_phone || undefined,
        urgency: editForm.urgency,
      });
      const merged = { ...selectedReferral, ...updated } as ReferralWithPatient;
      setSelectedReferral(merged);
      setReferrals((prev) => prev.map((x) => (x.id === merged.id ? { ...x, ...merged } : x)));
      setShowEditModal(false);
      toast.success("Referral updated");
      void fetchReferrals();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }
      toast.error((error as Error)?.message || "Failed to update");
    } finally {
      setEditSaving(false);
    }
  };

  const submitToRecords = async () => {
    if (!selectedReferral) return;
    if (selectedForms.length === 0) {
      toast.error("Issue at least one responsibility form before sending to Medical Records for acknowledgement.");
      return;
    }
    setSubmittingToRecords(true);
    try {
      const updated = await referralService.submitToRecords(selectedReferral.id);
      const merged = { ...selectedReferral, ...updated } as ReferralWithPatient;
      setSelectedReferral(merged);
      toast.success("Sent to Medical Records for stamp / acknowledgement");
      void fetchReferrals();
      void loadStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }
      toast.error((error as Error)?.message || "Failed to submit");
    } finally {
      setSubmittingToRecords(false);
    }
  };

  const issueResponsibilityForm = async () => {
    if (!selectedReferral) return;
    if (!formPayload.valid_from || !formPayload.valid_to) {
      toast.error("Set valid from/to dates");
      return;
    }
    const blocking = hasOverlappingActiveResponsibilityForm(
      selectedForms,
      formPayload.valid_from,
      formPayload.valid_to
    );
    if (blocking && !formOverrideReason.trim()) {
      toast.error("Enter an override reason — these dates overlap a current active form.");
      return;
    }
    try {
      setIssuingForm(true);
      await referralService.issueForm(selectedReferral.id, {
        ...formPayload,
        ...(blocking
          ? { override_active: true, override_reason: formOverrideReason.trim() }
          : {}),
      });
      const updatedForms = await referralService.getForms(selectedReferral.id);
      setSelectedForms(updatedForms || []);
      setFormPayload({ valid_from: "", valid_to: "", notes: "" });
      setFormOverrideReason("");
      toast.success("Responsibility form recorded");
      void fetchReferrals();
    } catch (error: unknown) {
      toast.error((error as Error)?.message || "Failed to issue form");
    } finally {
      setIssuingForm(false);
    }
  };

  const specialties = useMemo(
    () => [...new Set(referrals.map((r) => r.specialty).filter(Boolean))].sort(),
    [referrals]
  );
  const facilities = useMemo(
    () => [...new Set(referrals.map((r) => r.facility).filter(Boolean))].sort(),
    [referrals]
  );

  const handlePrintLetter = (r: ReferralWithPatient) => {
    if (!printReferralLetterWindow(r)) toast.error("Allow popups to print.");
  };

  const handlePrintForm = (r: ReferralWithPatient, form?: ResponsibilityFormIssuance) => {
    if (!printResponsibilityFormWindow(r, form)) toast.error("Allow popups to print.");
  };

  const canClinicianIssueForm = (r: ReferralWithPatient) =>
    isMine(r) && r.status !== "closed" && r.status !== "cancelled";

  const canEditClinician = (r: ReferralWithPatient) => isMine(r) && r.status === "draft";

  const canSubmitToRecords = (r: ReferralWithPatient) => isMine(r) && r.status === "draft";

  // Create referral (draft) — Consultation is where letters/forms originate
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [patientQuery, setPatientQuery] = useState("");
  const debouncedPatientQuery = useDebouncedValue(patientQuery, 300);
  const [patientResults, setPatientResults] = useState<Patient[]>([]);
  const [patientLoading, setPatientLoading] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [newReferral, setNewReferral] = useState({
    specialty: "",
    facility: "",
    facility_type: "internal" as ReferralWithPatient["facility_type"],
    urgency: "routine" as ReferralWithPatient["urgency"],
    reason: "",
    clinical_summary: "",
  });

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const q = debouncedPatientQuery.trim();
      if (q.length < 2) {
        setPatientResults([]);
        return;
      }
      setPatientLoading(true);
      try {
        const res = await patientService.getPatients({ search: q, page_size: 8 });
        if (!cancelled) setPatientResults(res.results || []);
      } catch {
        if (!cancelled) setPatientResults([]);
      } finally {
        if (!cancelled) setPatientLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedPatientQuery]);

  const resetCreateReferralForm = () => {
    setPatientQuery("");
    setPatientResults([]);
    setSelectedPatient(null);
    setNewReferral({
      specialty: "",
      facility: "",
      facility_type: "internal",
      urgency: "routine",
      reason: "",
      clinical_summary: "",
    });
  };

  const createReferralDraft = async () => {
    const p = selectedPatient;
    if (!p) {
      toast.error("Select a patient first");
      return;
    }
    if (!newReferral.specialty.trim() || !newReferral.facility.trim() || !newReferral.reason.trim()) {
      toast.error("Specialty, facility, and reason are required");
      return;
    }
    try {
      await referralService.createReferral({
        patient: p.id,
        specialty: newReferral.specialty.trim(),
        facility: newReferral.facility.trim(),
        facility_type: newReferral.facility_type,
        urgency: newReferral.urgency,
        reason: newReferral.reason.trim(),
        clinical_summary: newReferral.clinical_summary.trim() || undefined,
      });
      toast.success("Referral created as draft");
      setCreateDialogOpen(false);
      resetCreateReferralForm();
      void fetchReferrals();
      void loadStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }
      toast.error((error as Error)?.message || "Failed to create referral");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Send className="h-8 w-8 text-emerald-500" />
              Referrals &amp; forms
            </h1>
            <p className="text-muted-foreground mt-1">
              Create the referral letter, issue responsibility forms, then send to Medical Records. Medical Records acknowledges stamps on their own page.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => setCreateDialogOpen(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Create referral
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total (all statuses)</p>
              <p className="text-2xl font-bold text-blue-600">{statsLoading ? "…" : stats.total}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Submitted</p>
              <p className="text-2xl font-bold text-sky-600">{statsLoading ? "…" : stats.submitted}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">In review</p>
              <p className="text-2xl font-bold text-amber-600">{statsLoading ? "…" : stats.inReview}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Records acknowledged</p>
              <p className="text-2xl font-bold text-emerald-600">{statsLoading ? "…" : stats.approved}</p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search referrals…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {consultationStatusOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Specialty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All specialties</SelectItem>
                    {specialties.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={facilityFilter} onValueChange={setFacilityFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="Facility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All facilities</SelectItem>
                    {facilities.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Urgency" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All urgencies</SelectItem>
                    {REFERRAL_URGENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="Period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This week</SelectItem>
                    <SelectItem value="month">This month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {totalCount > 0
              ? `Showing ${Math.min((currentPage - 1) * itemsPerPage + 1, totalCount)}–${Math.min(currentPage * itemsPerPage, totalCount)} of ${totalCount}`
              : "Showing 0 referrals"}
          </p>
          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <RefreshCw className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading…</p>
              </CardContent>
            </Card>
          ) : totalCount === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Stethoscope className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium mb-1">No referrals found</p>
                <p className="text-sm">Create one from an active consultation room, or adjust filters.</p>
              </CardContent>
            </Card>
          ) : (
            referrals.map((referral) => (
              <Card
                key={referral.id}
                className={`border-l-4 hover:shadow-md transition-shadow ${
                  referral.urgency === "emergency"
                    ? "border-l-red-500"
                    : referral.urgency === "urgent"
                      ? "border-l-amber-500"
                      : "border-l-blue-500"
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div
                      className={`p-2 rounded-full ${
                        referral.facility_type === "external"
                          ? "bg-orange-100 dark:bg-orange-900/30"
                          : referral.facility_type === "specialist"
                            ? "bg-purple-100 dark:bg-purple-900/30"
                            : "bg-teal-100 dark:bg-teal-900/30"
                      }`}
                    >
                      {referral.facility_type === "external" ? (
                        <Building2 className="h-4 w-4 text-orange-600" />
                      ) : referral.facility_type === "specialist" ? (
                        <UserPlus className="h-4 w-4 text-purple-600" />
                      ) : (
                        <User className="h-4 w-4 text-teal-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <button
                            type="button"
                            onClick={() => void openReferralDetails(referral)}
                            className="font-semibold text-foreground hover:text-primary transition-colors truncate text-left"
                          >
                            {referral.patient_name ?? ""}
                          </button>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${getFacilityTypeBadgeClass(referral.facility_type)}`}
                          >
                            {toLabel(referral.facility_type)}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusBadgeClass(referral.status)}`}>
                            {referralStatusLabel(referral.status)}
                          </Badge>
                          {referral.urgency !== "routine" && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getUrgencyBadgeClass(referral.urgency)}`}>
                              {toLabel(referral.urgency)}
                            </Badge>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => void openReferralDetails(referral)}>
                          <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                        </Button>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{referral.referral_id}</span>
                        <span>•</span>
                        <span className="truncate max-w-[220px]">{referral.specialty}</span>
                        <span>•</span>
                        <span className="truncate max-w-[260px]">{referral.facility}</span>
                        <span>•</span>
                        <span className="truncate max-w-[260px]">{referral.reason}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {new Date(referral.referred_at).toLocaleDateString()}
                        </span>
                        <span>•</span>
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {referral.referred_by_name || "Unknown"}
                        </span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>

        {!isLoading && totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="referrals"
            />
          </Card>
        )}

        <Dialog open={createDialogOpen} onOpenChange={(open) => { if (!open) setCreateDialogOpen(false); }}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-500" />
                Create referral (draft)
              </DialogTitle>
              <DialogDescription>Search for a patient, then create a draft. Print the letter and issue forms from the row actions.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Patient</Label>
                <Input
                  placeholder="Search by patient id or name…"
                  value={patientQuery}
                  onChange={(e) => setPatientQuery(e.target.value)}
                />
                {patientLoading ? (
                  <p className="text-sm text-muted-foreground">Searching…</p>
                ) : patientResults.length > 0 ? (
                  <div className="max-h-40 overflow-y-auto rounded-md border">
                    {patientResults.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        className={`w-full px-3 py-2 text-left hover:bg-muted/50 ${selectedPatient?.id === p.id ? "bg-muted/50" : ""}`}
                        onClick={() => setSelectedPatient(p)}
                      >
                        <div className="font-medium">{p.full_name || `${p.first_name} ${p.surname}`}</div>
                        <div className="text-xs text-muted-foreground">{p.patient_id}</div>
                      </button>
                    ))}
                  </div>
                ) : debouncedPatientQuery.trim().length >= 2 ? (
                  <p className="text-sm text-muted-foreground">No patients found.</p>
                ) : null}
                {selectedPatient ? (
                  <p className="text-sm text-muted-foreground">
                    Selected: <span className="font-medium">{selectedPatient.full_name || selectedPatient.patient_id}</span>
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Specialty</Label>
                  <Input
                    value={newReferral.specialty}
                    onChange={(e) => setNewReferral((r) => ({ ...r, specialty: e.target.value }))}
                    placeholder="e.g. Oncology"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Facility</Label>
                  <Input
                    value={newReferral.facility}
                    onChange={(e) => setNewReferral((r) => ({ ...r, facility: e.target.value }))}
                    placeholder="Receiving facility"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Facility type</Label>
                  <Select value={newReferral.facility_type} onValueChange={(v) => setNewReferral((r) => ({ ...r, facility_type: v as ReferralWithPatient["facility_type"] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERRAL_FACILITY_TYPE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Urgency</Label>
                  <Select value={newReferral.urgency} onValueChange={(v) => setNewReferral((r) => ({ ...r, urgency: v as ReferralWithPatient["urgency"] }))}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {REFERRAL_URGENCY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea
                  value={newReferral.reason}
                  onChange={(e) => setNewReferral((r) => ({ ...r, reason: e.target.value }))}
                  placeholder="Reason for referral"
                  rows={3}
                />
              </div>

              <div className="space-y-2">
                <Label>Clinical summary (optional)</Label>
                <Textarea
                  value={newReferral.clinical_summary}
                  onChange={(e) => setNewReferral((r) => ({ ...r, clinical_summary: e.target.value }))}
                  rows={3}
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => { setCreateDialogOpen(false); resetCreateReferralForm(); }}>
                Cancel
              </Button>
              <Button
                onClick={() => void createReferralDraft()}
                disabled={!selectedPatient || !newReferral.specialty.trim() || !newReferral.facility.trim() || !newReferral.reason.trim() || patientLoading}
              >
                Create draft
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <ConsultationReferralDetailModal
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
          referral={selectedReferral}
          forms={selectedForms}
          formsLoading={formsLoading}
          formPayload={formPayload}
          onFormPayloadChange={setFormPayload}
          issuingForm={issuingForm}
          canEditClinician={canEditClinician}
          canSubmitToRecords={canSubmitToRecords}
          canClinicianIssueForm={canClinicianIssueForm}
          submittingToRecords={submittingToRecords}
          onPrintLetter={handlePrintLetter}
          onPrintForm={handlePrintForm}
          onIssueForm={() => void issueResponsibilityForm()}
          onEdit={openEdit}
          onSubmitToRecords={() => void submitToRecords()}
          blockingActiveResponsibilityForm={hasOverlappingActiveResponsibilityForm(
            selectedForms,
            formPayload.valid_from,
            formPayload.valid_to
          )}
          formOverrideReason={formOverrideReason}
          onFormOverrideReasonChange={setFormOverrideReason}
        />

        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit referral</DialogTitle>
              <DialogDescription>Only available for your draft referrals.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Specialty</Label>
                <Input value={editForm.specialty} onChange={(e) => setEditForm((f) => ({ ...f, specialty: e.target.value }))} />
              </div>
              <div>
                <Label>Facility</Label>
                <Input value={editForm.facility} onChange={(e) => setEditForm((f) => ({ ...f, facility: e.target.value }))} />
              </div>
              <div>
                <Label>Facility type</Label>
                <Select
                  value={editForm.facility_type}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, facility_type: v as ReferralWithPatient["facility_type"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_FACILITY_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Urgency</Label>
                <Select
                  value={editForm.urgency}
                  onValueChange={(v) => setEditForm((f) => ({ ...f, urgency: v as ReferralWithPatient["urgency"] }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REFERRAL_URGENCY_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Textarea value={editForm.reason} onChange={(e) => setEditForm((f) => ({ ...f, reason: e.target.value }))} rows={3} />
              </div>
              <div>
                <Label>Clinical summary</Label>
                <Textarea
                  value={editForm.clinical_summary}
                  onChange={(e) => setEditForm((f) => ({ ...f, clinical_summary: e.target.value }))}
                  rows={3}
                />
              </div>
              <div>
                <Label>Contact person (optional)</Label>
                <Input value={editForm.contact_person} onChange={(e) => setEditForm((f) => ({ ...f, contact_person: e.target.value }))} />
              </div>
              <div>
                <Label>Contact phone (optional)</Label>
                <Input value={editForm.contact_phone} onChange={(e) => setEditForm((f) => ({ ...f, contact_phone: e.target.value }))} />
              </div>
            </div>
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button onClick={() => void saveEdit()} disabled={editSaving}>
                {editSaving ? "Saving…" : "Save"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
