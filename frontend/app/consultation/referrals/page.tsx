"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StandardPagination } from "@/components/StandardPagination";
import {
  ArrowRight, Building2, Calendar, Clock, Eye,
  RefreshCw, Search, Stethoscope, User, UserPlus,
  AlertTriangle, CheckCircle, XCircle, Clock4, Phone, Mail, Printer
} from "lucide-react";
import { toast } from "sonner";
import { referralService, type Referral, type ResponsibilityFormIssuance } from "@/lib/services/referral-service";
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { useCurrentUser } from "@/hooks/use-current-user";
import { usePathname } from "next/navigation";

interface ReferralWithPatient extends Referral {
  patient_name?: string;
  referred_by_name?: string;
}

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function ReferralsManagementPage() {
  const pathname = usePathname();
  const inMedicalRecords = pathname?.startsWith("/medical-records");
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
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [specialtyFilter, setSpecialtyFilter] = useState<string>('all');
  const [facilityFilter, setFacilityFilter] = useState<string>('all');
  const [urgencyFilter, setUrgencyFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const statusOptions = [
    { value: 'draft', label: 'Draft', color: 'bg-gray-100 text-gray-800' },
    { value: 'submitted_to_records', label: 'Submitted to Records', color: 'bg-blue-100 text-blue-800' },
    { value: 'records_review', label: 'Records Review', color: 'bg-amber-100 text-amber-800' },
    { value: 'returned_for_correction', label: 'Returned', color: 'bg-rose-100 text-rose-800' },
    { value: 'approved_for_forms', label: 'Approved for Forms', color: 'bg-emerald-100 text-emerald-800' },
    { value: 'closed', label: 'Closed', color: 'bg-purple-100 text-purple-800' },
    { value: 'cancelled', label: 'Cancelled', color: 'bg-red-100 text-red-800' }
  ];

  const legacyStatusMap: Record<string, string> = {
    submitted_to_records: "sent",
    records_review: "accepted",
    returned_for_correction: "draft",
    approved_for_forms: "scheduled",
    closed: "completed",
  };

  const isInvalidChoiceError = (error: any) => {
    const msg = String(error?.message || error?.apiMessage || "").toLowerCase();
    return msg.includes("not one of the available choices") || msg.includes("select a valid choice");
  };

  const getReferralsWithStatusFallback = async (params: Parameters<typeof referralService.getReferrals>[0]) => {
    try {
      return await referralService.getReferrals(params);
    } catch (error: any) {
      const requestedStatus = params?.status;
      if (!requestedStatus || !isInvalidChoiceError(error)) throw error;

      const fallbackStatus = legacyStatusMap[requestedStatus];
      if (!fallbackStatus) throw error;

      return referralService.getReferrals({ ...params, status: fallbackStatus });
    }
  };

  const urgencyOptions = [
    { value: 'routine', label: 'Routine', color: 'bg-blue-100 text-blue-800' },
    { value: 'urgent', label: 'Urgent', color: 'bg-amber-100 text-amber-800' },
    { value: 'emergency', label: 'Emergency', color: 'bg-red-100 text-red-800' }
  ];

  const facilityTypes = [
    { value: 'internal', label: 'Internal', color: 'bg-teal-100 text-teal-800' },
    { value: 'external', label: 'External', color: 'bg-orange-100 text-orange-800' },
    { value: 'specialist', label: 'Specialist', color: 'bg-purple-100 text-purple-800' }
  ];

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

  const fetchReferrals = useCallback(async () => {
    setIsLoading(true);
    try {
      const params: any = {};

      if (statusFilter !== 'all') params.status = statusFilter;
      if (specialtyFilter !== 'all') params.specialty = specialtyFilter;
      if (facilityFilter !== 'all') params.facility = facilityFilter;
      if (urgencyFilter !== 'all') params.urgency = urgencyFilter;
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      Object.assign(params, buildDateParams(), {
        page: currentPage,
        page_size: itemsPerPage,
      });

      const response = await getReferralsWithStatusFallback(params);
      setReferrals(response.results || []);
      setTotalCount(response.count || 0);
    } catch (error: any) {
      console.error("Error fetching referrals:", error);

      // Handle authentication errors
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }

      toast.error(error.message || "Failed to load referrals");
    } finally {
      setIsLoading(false);
    }
  }, [
    statusFilter,
    specialtyFilter,
    facilityFilter,
    urgencyFilter,
    debouncedSearchQuery,
    buildDateParams,
    currentPage,
    itemsPerPage,
  ]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const commonParams: any = {};
      if (specialtyFilter !== 'all') commonParams.specialty = specialtyFilter;
      if (facilityFilter !== 'all') commonParams.facility = facilityFilter;
      if (urgencyFilter !== 'all') commonParams.urgency = urgencyFilter;
      if (debouncedSearchQuery.trim()) commonParams.search = debouncedSearchQuery.trim();
      Object.assign(commonParams, buildDateParams(), { page: 1, page_size: 1000 });

      // Use one schema-safe request (no status filter) and derive counts client-side.
      const totalRes = await getReferralsWithStatusFallback({ ...commonParams, status: undefined });
      const rows = totalRes.results || [];
      const submittedStatuses = new Set(['submitted_to_records', 'sent']);
      const reviewStatuses = new Set(['records_review', 'accepted']);
      const approvedStatuses = new Set(['approved_for_forms', 'scheduled']);
      const closedStatuses = new Set(['closed', 'completed']);

      setStats({
        total: totalRes.count || 0,
        submitted: rows.filter((r) => submittedStatuses.has(String(r.status || ''))).length,
        inReview: rows.filter((r) => reviewStatuses.has(String(r.status || ''))).length,
        approved: rows.filter((r) => approvedStatuses.has(String(r.status || ''))).length,
        closed: rows.filter((r) => closedStatuses.has(String(r.status || ''))).length,
      });
    } catch (error) {
      console.error("Error loading referral stats:", error);
    } finally {
      setStatsLoading(false);
    }
  }, [specialtyFilter, facilityFilter, urgencyFilter, debouncedSearchQuery, buildDateParams]);

  useEffect(() => {
    fetchReferrals();
  }, [fetchReferrals]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, specialtyFilter, facilityFilter, urgencyFilter, dateFilter, debouncedSearchQuery]);

  const openReferralDetails = async (referral: ReferralWithPatient) => {
    setSelectedReferral(referral);
    setShowDetailsModal(true);
    setFormsLoading(true);
    try {
      const forms = await referralService.getForms(referral.id);
      setSelectedForms(forms || []);
    } catch {
      setSelectedForms([]);
    } finally {
      setFormsLoading(false);
    }
  };

  const issueResponsibilityForm = async () => {
    if (!selectedReferral) return;
    if (!formPayload.valid_from || !formPayload.valid_to) {
      toast.error("Set valid from/to dates");
      return;
    }
    try {
      setIssuingForm(true);
      await referralService.issueForm(selectedReferral.id, formPayload);
      const updatedForms = await referralService.getForms(selectedReferral.id);
      setSelectedForms(updatedForms || []);
      setFormPayload({ valid_from: "", valid_to: "", notes: "" });
      toast.success("Responsibility form issued");
    } catch (error: any) {
      toast.error(error?.message || "Failed to issue form");
    } finally {
      setIssuingForm(false);
    }
  };

  const handleStatusUpdate = async (referralId: number, newStatus: string, notes?: string) => {
    try {
      if (newStatus === 'records_review') {
        await referralService.startReview(referralId);
      } else if (newStatus === 'approved_for_forms') {
        await referralService.approveForForms(referralId);
      } else if (newStatus === 'returned_for_correction') {
        await referralService.returnForCorrection(referralId, notes);
      } else if (newStatus === 'closed') {
        await referralService.closeReferral(referralId);
      } else {
        const updateData: any = { status: newStatus };
        if (notes) updateData.notes = notes;
        await referralService.updateReferral(referralId, updateData);
      }

      // Update local state
      setReferrals(prev => prev.map(ref =>
        ref.id === referralId
          ? { ...ref, status: newStatus as any, notes: notes || ref.notes }
          : ref
      ));

      toast.success(`Referral status updated to ${newStatus}`);
      setShowDetailsModal(false);
    } catch (error: any) {
      console.error("Error updating referral:", error);

      // Handle authentication errors
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }

      toast.error(error.message || "Failed to update referral");
    }
  };

  const getStatusBadge = (status: string) => {
    const option = statusOptions.find(opt => opt.value === status);
    return option ? option.color : 'bg-gray-100 text-gray-800';
  };

  const getUrgencyBadge = (urgency: string) => {
    const option = urgencyOptions.find(opt => opt.value === urgency);
    return option ? option.color : 'bg-blue-100 text-blue-800';
  };

  const getFacilityTypeBadge = (facilityType: string) => {
    const option = facilityTypes.find(opt => opt.value === facilityType);
    return option ? option.color : 'bg-gray-100 text-gray-800';
  };

  const toLabel = (value?: string) =>
    (value || "")
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase());

  const escapeHtml = (value?: string) =>
    String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");

  const formatPrintDate = (value?: string) => {
    if (!value) return "";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleDateString();
  };

  const buildReferralLetterHtml = (referral: ReferralWithPatient) => {
    const patientName = escapeHtml(referral.patient_name || "____________________________");
    const facility = escapeHtml(referral.facility || "____________________________");
    const specialty = escapeHtml(referral.specialty || "____________________________");
    const reason = escapeHtml(referral.reason || "");
    const summary = escapeHtml(referral.clinical_summary || "");
    const referredBy = escapeHtml(referral.referred_by_name || "____________________________");
    const dateStr = escapeHtml(formatPrintDate(referral.referred_at));
    const referralId = escapeHtml(referral.referral_id || "");
    const urgency = escapeHtml(toLabel(referral.urgency || "routine"));

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Referral Letter - ${referralId}</title>
  <style>
    @page { size: A4; margin: 20mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 14px; line-height: 1.4; }
    h1, h2, h3, p { margin: 0; }
    .top { text-align: center; margin-bottom: 16px; }
    .small { font-size: 12px; color: #333; }
    .section { margin-top: 14px; }
    .label { font-weight: 700; }
    .box { border: 1px solid #ccc; padding: 10px; border-radius: 4px; white-space: pre-wrap; }
    .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; margin-top: 32px; }
    .sig-line { border-top: 1px solid #222; margin-top: 36px; padding-top: 4px; font-size: 12px; }
  </style>
</head>
<body>
  <div class="top">
    <h2>NIGERIAN PORTS AUTHORITY</h2>
    <h3>MEDICAL DEPARTMENT</h3>
    <p><strong>REFERRAL LETTER</strong></p>
  </div>

  <div class="section">
    <p><span class="label">Date:</span> ${dateStr}</p>
    <p><span class="label">Referral ID:</span> ${referralId}</p>
    <p><span class="label">Urgency:</span> ${urgency}</p>
  </div>

  <div class="section">
    <p>To: The Medical Director</p>
    <p>${facility}</p>
  </div>

  <div class="section">
    <p>Please kindly evaluate and manage the patient below:</p>
    <p><span class="label">Patient Name:</span> ${patientName}</p>
    <p><span class="label">Referred Specialty/Unit:</span> ${specialty}</p>
  </div>

  <div class="section">
    <p class="label">Reason for Referral</p>
    <div class="box">${reason || "N/A"}</div>
  </div>

  <div class="section">
    <p class="label">Clinical Summary</p>
    <div class="box">${summary || "N/A"}</div>
  </div>

  <div class="sig-grid">
    <div>
      <div class="sig-line">Referring Doctor: ${referredBy}</div>
    </div>
    <div>
      <div class="sig-line">Medical Records Officer</div>
    </div>
  </div>
</body>
</html>`;
  };

  const buildResponsibilityFormHtml = (
    referral: ReferralWithPatient,
    form?: ResponsibilityFormIssuance
  ) => {
    const dateVal = form?.issue_date || referral.referred_at;
    const d = new Date(dateVal);
    const monthValue = Number.isNaN(d.getTime())
      ? ""
      : d.toLocaleString(undefined, { month: "long", year: "numeric" });
    const dateStr = formatPrintDate(dateVal);
    const patientName = escapeHtml(referral.patient_name || "________________________");
    const facility = escapeHtml(referral.facility || "________________________");
    const dept = "________________";
    const pn = "________________";
    const doctor = escapeHtml(referral.referred_by_name || "________________________");
    const validRange = form
      ? `${escapeHtml(formatPrintDate(form.valid_from))} - ${escapeHtml(formatPrintDate(form.valid_to))}`
      : "";

    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Responsibility Form - ${escapeHtml(referral.referral_id)}</title>
  <style>
    @page { size: A4; margin: 16mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 14px; line-height: 1.35; }
    .center { text-align: center; }
    .title { font-weight: 700; }
    .row { margin-top: 8px; }
    .line { border-bottom: 1px dotted #555; min-width: 140px; display: inline-block; padding: 0 4px; }
    .block { margin-top: 14px; }
    .slip { border-top: 1px dashed #444; margin-top: 18px; padding-top: 16px; }
    .sig-row { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 22px; }
    .sig { border-top: 1px solid #222; margin-top: 30px; padding-top: 4px; font-size: 12px; min-height: 36px; }
    .small { font-size: 12px; }
  </style>
</head>
<body>
  <div class="center">
    <div class="title">NIGERIAN PORTS AUTHORITY</div>
    <div class="title">MEDICAL DEPARTMENT</div>
    <div class="title">RESPONSIBILITY FORM</div>
  </div>

  <div class="row"><strong>Date:</strong> <span class="line">${escapeHtml(dateStr)}</span></div>
  <div class="row"><strong>Month of:</strong> <span class="line">${escapeHtml(monthValue)}</span></div>
  ${validRange ? `<div class="row small"><strong>Validity:</strong> ${validRange}</div>` : ""}

  <div class="block">
    <div>To: The Medical Director</div>
    <div>${facility}</div>
  </div>

  <div class="block">
    <div><strong>NAME:</strong> <span class="line">${patientName}</span> (P.N. <span class="line">${pn}</span>) DEPT. <span class="line">${dept}</span></div>
  </div>

  <div class="block">
    <div>I certify that the above named who is now referred for treatment at the hospital is a bona fide Pensioner/Employee/Spouse/Dependant of the Nigerian Ports Authority.</div>
    <div class="row">The Nigerian Ports Authority hereby accepts responsibility for payment of the hospital bill on his/her behalf.</div>
  </div>

  <div class="sig-row">
    <div>
      <div class="sig">Doctor-in-charge<br/>For: Managing Director NPA.<br/>Name: ${doctor}</div>
    </div>
    <div>
      <div class="sig">Doctor In-Charge<br/>For The Medical Director</div>
    </div>
  </div>

  <div class="slip">
    <div class="small">This portion should be detached and returned to the General Manager, Medical Services.</div>
    <div class="row"><strong>NAME:</strong> <span class="line">${patientName}</span> (P.N. <span class="line">${pn}</span>) DEPT. <span class="line">${dept}</span></div>
    <div class="small row">No bill will be certified for payment without this slip.</div>
    <div class="sig-row">
      <div><div class="sig">Doctor's Name/Signature/Date</div></div>
      <div><div class="sig">Receiving Doctor's Name/Signature/Date</div></div>
    </div>
    <div class="block small">Doctor's Remarks:</div>
    <div style="height:80px; border-bottom:1px dotted #555;"></div>
  </div>
</body>
</html>`;
  };

  const openPrintWindow = (title: string, html: string) => {
    const popup = window.open("", "_blank", "width=900,height=1000");
    if (!popup) {
      toast.error("Allow popups to print documents.");
      return;
    }
    popup.document.open();
    popup.document.write(html);
    popup.document.close();
    popup.document.title = title;
    popup.focus();
    popup.print();
  };

  const printReferralLetter = (referral: ReferralWithPatient) => {
    openPrintWindow(`Referral Letter - ${referral.referral_id}`, buildReferralLetterHtml(referral));
  };

  const printResponsibilityForm = (referral: ReferralWithPatient, form?: ResponsibilityFormIssuance) => {
    openPrintWindow(`Responsibility Form - ${referral.referral_id}`, buildResponsibilityFormHtml(referral, form));
  };

  // Get unique values for filters
  const specialties = useMemo(() => [...new Set(referrals.map(r => r.specialty).filter(Boolean))].sort(), [referrals]);
  const facilities = useMemo(() => [...new Set(referrals.map(r => r.facility).filter(Boolean))].sort(), [referrals]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ArrowRight className="h-8 w-8 text-blue-500" />
              {inMedicalRecords ? "Medical Records Referrals" : "Referrals Management"}
            </h1>
            <p className="text-muted-foreground mt-1">
              {inMedicalRecords
                ? "Review doctor referrals, approve records workflow, and issue monthly responsibility forms"
                : "Track and manage patient referrals to specialists and facilities"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchReferrals} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total</p>
              <p className="text-2xl font-bold text-blue-600">{statsLoading ? "..." : stats.total}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Submitted</p>
              <p className="text-2xl font-bold text-sky-600">{statsLoading ? "..." : stats.submitted}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">In Review</p>
              <p className="text-2xl font-bold text-amber-600">{statsLoading ? "..." : stats.inReview}</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Approved</p>
              <p className="text-2xl font-bold text-emerald-600">{statsLoading ? "..." : stats.approved}</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search referrals..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue placeholder="All Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    {statusOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={specialtyFilter} onValueChange={setSpecialtyFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="All Specialties" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Specialties</SelectItem>
                    {specialties.map(specialty => (
                      <SelectItem key={specialty} value={specialty}>
                        {specialty}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={facilityFilter} onValueChange={setFacilityFilter}>
                  <SelectTrigger className="w-[170px]">
                    <SelectValue placeholder="All Facilities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Facilities</SelectItem>
                    {facilities.map(facility => (
                      <SelectItem key={facility} value={facility}>
                        {facility}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={urgencyFilter} onValueChange={setUrgencyFilter}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="All Urgencies" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Urgencies</SelectItem>
                    {urgencyOptions.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue placeholder="All Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Referrals List */}
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            {totalCount > 0
              ? `Showing ${Math.min((currentPage - 1) * itemsPerPage + 1, totalCount)}–${Math.min(currentPage * itemsPerPage, totalCount)} of ${totalCount} referrals`
              : "Showing 0 referrals"}
          </p>

          {isLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <RefreshCw className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading referrals...</p>
              </CardContent>
            </Card>
          ) : totalCount === 0 ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Stethoscope className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium mb-1">No referrals found</p>
                <p className="text-sm">Try adjusting filters or create a referral in consultation room.</p>
              </CardContent>
            </Card>
          ) : (
            referrals.map((referral) => (
              <Card
                key={referral.id}
                className={`border-l-4 hover:shadow-md transition-shadow ${
                  referral.urgency === 'emergency' ? 'border-l-red-500' :
                  referral.urgency === 'urgent' ? 'border-l-amber-500' :
                  'border-l-blue-500'
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-full ${
                      referral.facility_type === 'external' ? 'bg-orange-100 dark:bg-orange-900/30' :
                      referral.facility_type === 'specialist' ? 'bg-purple-100 dark:bg-purple-900/30' :
                      'bg-teal-100 dark:bg-teal-900/30'
                    }`}>
                      {referral.facility_type === 'external' ? (
                        <Building2 className="h-4 w-4 text-orange-600" />
                      ) : referral.facility_type === 'specialist' ? (
                        <UserPlus className="h-4 w-4 text-purple-600" />
                      ) : (
                        <User className="h-4 w-4 text-teal-600" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + badges + actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <button
                            onClick={() => openReferralDetails(referral)}
                            className="font-semibold text-foreground hover:text-primary transition-colors truncate text-left"
                          >
                            {referral.patient_name || 'Unknown Patient'}
                          </button>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getFacilityTypeBadge(referral.facility_type)}`}>
                            {toLabel(referral.facility_type)}
                          </Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusBadge(referral.status)}`}>
                            {toLabel(referral.status)}
                          </Badge>
                          {referral.urgency !== 'routine' && (
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getUrgencyBadge(referral.urgency)}`}>
                              {toLabel(referral.urgency)}
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => openReferralDetails(referral)}
                            title="View Referral"
                          >
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                        </div>
                      </div>

                      {/* Row 2: compact details */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{referral.referral_id}</span>
                        <span>•</span>
                        <span className="truncate max-w-[220px]">{referral.specialty}</span>
                        <span>•</span>
                        <span className="truncate max-w-[260px]">{referral.facility}</span>
                        <span>•</span>
                        <span className="truncate max-w-[260px]">{referral.reason}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{new Date(referral.referred_at).toLocaleDateString()}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><User className="h-3 w-3" />{referral.referred_by_name || 'Unknown'}</span>
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

        {/* Referral Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRight className="h-5 w-5" />
                Referral Details - {selectedReferral?.referral_id}
              </DialogTitle>
            </DialogHeader>

            {selectedReferral && (
              <div className="space-y-6">
                {/* Status and Actions */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className={getStatusBadge(selectedReferral.status)}>
                      {toLabel(selectedReferral.status)}
                    </Badge>
                    <Badge variant="outline" className={getUrgencyBadge(selectedReferral.urgency)}>
                      {toLabel(selectedReferral.urgency)}
                    </Badge>
                    <Badge variant="outline" className={getFacilityTypeBadge(selectedReferral.facility_type)}>
                      {toLabel(selectedReferral.facility_type)}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button size="sm" variant="outline" onClick={() => printReferralLetter(selectedReferral)}>
                      <Printer className="h-4 w-4 mr-1" />
                      Print Referral Letter
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => printResponsibilityForm(selectedReferral, selectedForms[0])}
                    >
                      <Printer className="h-4 w-4 mr-1" />
                      Print Responsibility Form
                    </Button>
                  </div>

                  {(currentUser?.systemRole === "Medical Records Officer" || currentUser?.systemRole === "System Administrator") && selectedReferral.status !== 'closed' && selectedReferral.status !== 'cancelled' && (
                    <div className="flex gap-2">
                      {selectedReferral.status === 'submitted_to_records' && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusUpdate(selectedReferral.id, 'records_review')}
                          >
                            <CheckCircle className="h-4 w-4 mr-1" />
                            Start Review
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleStatusUpdate(selectedReferral.id, 'returned_for_correction')}
                          >
                            <XCircle className="h-4 w-4 mr-1" />
                            Return
                          </Button>
                        </>
                      )}
                      {selectedReferral.status === 'records_review' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleStatusUpdate(selectedReferral.id, 'approved_for_forms')}
                        >
                          <Clock4 className="h-4 w-4 mr-1" />
                          Approve
                        </Button>
                      )}
                      {selectedReferral.status === 'approved_for_forms' && (
                        <Button
                          size="sm"
                          onClick={() => handleStatusUpdate(selectedReferral.id, 'closed')}
                        >
                          <CheckCircle className="h-4 w-4 mr-1" />
                          Close
                        </Button>
                      )}
                    </div>
                  )}
                </div>

                {/* Referral Information */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="text-sm font-medium">Referral ID</Label>
                    <p className="text-sm">{selectedReferral.referral_id}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Patient</Label>
                    <p className="text-sm">{selectedReferral.patient_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Specialty</Label>
                    <p className="text-sm">{selectedReferral.specialty}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Facility</Label>
                    <p className="text-sm">{selectedReferral.facility}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Referred By</Label>
                    <p className="text-sm">{selectedReferral.referred_by_name || 'Unknown'}</p>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">Date</Label>
                    <p className="text-sm">{new Date(selectedReferral.referred_at).toLocaleString()}</p>
                  </div>
                </div>

                {/* Referral Details */}
                <div className="space-y-4">
                  <div>
                    <Label className="text-sm font-medium">Reason for Referral</Label>
                    <p className="text-sm p-3 bg-muted/50 rounded">{selectedReferral.reason}</p>
                  </div>

                  {selectedReferral.clinical_summary && (
                    <div>
                      <Label className="text-sm font-medium">Clinical Summary</Label>
                      <p className="text-sm p-3 bg-muted/50 rounded">{selectedReferral.clinical_summary}</p>
                    </div>
                  )}

                  {/* Contact Information */}
                  {(selectedReferral.contact_person || selectedReferral.contact_phone || selectedReferral.contact_email) && (
                    <div>
                      <Label className="text-sm font-medium">Contact Information</Label>
                      <div className="p-3 bg-muted/50 rounded space-y-2">
                        {selectedReferral.contact_person && (
                          <div className="flex items-center gap-2 text-sm">
                            <User className="h-4 w-4" />
                            <span>{selectedReferral.contact_person}</span>
                          </div>
                        )}
                        {selectedReferral.contact_phone && (
                          <div className="flex items-center gap-2 text-sm">
                            <Phone className="h-4 w-4" />
                            <span>{selectedReferral.contact_phone}</span>
                          </div>
                        )}
                        {selectedReferral.contact_email && (
                          <div className="flex items-center gap-2 text-sm">
                            <Mail className="h-4 w-4" />
                            <span>{selectedReferral.contact_email}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Responsibility forms */}
                  <div>
                    <Label className="text-sm font-medium">Responsibility Forms</Label>
                    <div className="p-3 bg-muted/40 rounded space-y-3 mt-1">
                      {formsLoading ? (
                        <p className="text-sm text-muted-foreground">Loading forms...</p>
                      ) : selectedForms.length === 0 ? (
                        <p className="text-sm text-muted-foreground">No responsibility form issued yet.</p>
                      ) : (
                        <div className="space-y-2">
                          {selectedForms.map((form) => (
                            <div key={form.id} className="text-sm border rounded p-2 bg-background/70">
                              <div className="flex items-center justify-between gap-2">
                                <span className="font-medium">Form #{form.sequence_number}</span>
                                <Badge variant="outline">{toLabel(form.status)}</Badge>
                              </div>
                              <p className="text-xs text-muted-foreground mt-1">
                                Valid: {form.valid_from} to {form.valid_to}
                              </p>
                              {form.document_file_url && (
                                <a href={form.document_file_url} target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">
                                  Open attached document
                                </a>
                              )}
                              <div className="mt-2">
                                <Button size="sm" variant="outline" onClick={() => printResponsibilityForm(selectedReferral, form)}>
                                  <Printer className="h-3 w-3 mr-1" />
                                  Print this form
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      {(currentUser?.systemRole === "Medical Records Officer" || currentUser?.systemRole === "System Administrator") && selectedReferral.status === "approved_for_forms" && (
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                          <div>
                            <Label className="text-xs">Valid From</Label>
                            <Input
                              type="date"
                              value={formPayload.valid_from}
                              onChange={(e) => setFormPayload((prev) => ({ ...prev, valid_from: e.target.value }))}
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Valid To</Label>
                            <Input
                              type="date"
                              value={formPayload.valid_to}
                              onChange={(e) => setFormPayload((prev) => ({ ...prev, valid_to: e.target.value }))}
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Label className="text-xs">Notes (optional)</Label>
                            <Input
                              value={formPayload.notes}
                              onChange={(e) => setFormPayload((prev) => ({ ...prev, notes: e.target.value }))}
                              placeholder="Monthly issuance note"
                            />
                          </div>
                          <div className="md:col-span-3">
                            <Button size="sm" onClick={issueResponsibilityForm} disabled={issuingForm}>
                              {issuingForm ? "Issuing..." : "Issue New Responsibility Form"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {selectedReferral.notes && (
                    <div>
                      <Label className="text-sm font-medium">Notes</Label>
                      <p className="text-sm p-3 bg-muted/50 rounded">{selectedReferral.notes}</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}