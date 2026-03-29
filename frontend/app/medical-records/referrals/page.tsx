"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { StandardPagination } from "@/components/StandardPagination";
import {
  Building2,
  Calendar,
  Eye,
  FileText,
  RefreshCw,
  Search,
  User,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { referralService, type ResponsibilityFormIssuance } from "@/lib/services/referral-service";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";
import { useCurrentUser } from "@/hooks/use-current-user";
import {
  type ReferralWithPatient,
  REFERRAL_STATUS_OPTIONS_NO_DRAFT,
  REFERRAL_URGENCY_OPTIONS,
  toLabel,
  referralStatusLabel,
  getStatusBadgeClass,
  getUrgencyBadgeClass,
  getFacilityTypeBadgeClass,
  printReferralLetter as printReferralLetterWindow,
  printResponsibilityForm as printResponsibilityFormWindow,
} from "@/lib/referrals/referral-helpers";
import { MedicalRecordsReferralDetailModal } from "./MedicalRecordsReferralDetailModal";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function MedicalRecordsReferralsPage() {
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
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [acknowledgingFormId, setAcknowledgingFormId] = useState<number | null>(null);
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

  const recordsQueueStatusOptions = useMemo(
    () => REFERRAL_STATUS_OPTIONS_NO_DRAFT.filter((o) => o.value !== "returned_for_correction"),
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
      exclude_draft: true,
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
        exclude_draft: true,
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

  const openReferralDetails = async (referral: ReferralWithPatient) => {
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

  const handleRecordsAction = async (
    fn: () => Promise<unknown>,
    successMsg: string,
    nextStatus?: string
  ) => {
    if (!selectedReferral) return;
    try {
      await fn();
      toast.success(successMsg);
      if (nextStatus) {
        setSelectedReferral((r) => (r ? { ...r, status: nextStatus as ReferralWithPatient["status"] } : r));
      }
      setShowDetailsModal(false);
      void fetchReferrals();
      void loadStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }
      toast.error((error as Error)?.message || "Action failed");
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

  const isRecordsUser = Boolean(
    currentUser?.systemRole === "Medical Records Officer" || currentUser?.isSuperuser
  );

  const handlePrintLetter = (r: ReferralWithPatient) => {
    if (!printReferralLetterWindow(r)) toast.error("Allow popups to print.");
  };

  const handlePrintForm = (r: ReferralWithPatient, form?: ResponsibilityFormIssuance) => {
    if (!printResponsibilityFormWindow(r, form)) toast.error("Allow popups to print.");
  };

  const acknowledgeFormStamp = async (form: ResponsibilityFormIssuance) => {
    if (!selectedReferral) return;
    setAcknowledgingFormId(form.id);
    try {
      await referralService.acknowledgeResponsibilityForm(selectedReferral.id, form.id);
      const fresh = await referralService.getReferral(selectedReferral.id);
      setSelectedReferral(fresh as ReferralWithPatient);
      const formsList = await referralService.getForms(selectedReferral.id);
      setSelectedForms(formsList || []);
      if (fresh.status === "approved_for_forms" || fresh.status === "scheduled") {
        toast.success(`Form #${form.sequence_number} stamped — referral marked Records acknowledged`);
      } else {
        toast.success(`Responsibility form #${form.sequence_number} stamp recorded`);
      }
      void fetchReferrals();
      void loadStats();
    } catch (error: unknown) {
      if (isAuthenticationError(error)) {
        setAuthError(error);
        return;
      }
      toast.error((error as Error)?.message || "Failed to acknowledge form");
    } finally {
      setAcknowledgingFormId(null);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <FileText className="h-8 w-8 text-blue-500" />
              Referral acknowledgement (Medical Records)
            </h1>
            <p className="text-muted-foreground mt-1">
              Stamp each responsibility form row. When every current issuance is stamped, the referral becomes Records acknowledged automatically.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">In queue (excl. draft)</p>
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
                    {recordsQueueStatusOptions.map((o) => (
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
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium mb-1">No referrals in queue</p>
                <p className="text-sm">Nothing submitted to records yet, or adjust filters.</p>
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

        <MedicalRecordsReferralDetailModal
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
          referral={selectedReferral}
          forms={selectedForms}
          formsLoading={formsLoading}
          isRecordsUser={isRecordsUser}
          onPrintLetter={handlePrintLetter}
          onPrintForm={handlePrintForm}
          onAcknowledgeForm={(form) => void acknowledgeFormStamp(form)}
          acknowledgingFormId={acknowledgingFormId}
          onCloseReferral={() =>
            void handleRecordsAction(
              () => referralService.closeReferral(selectedReferral!.id),
              "Referral closed",
              "closed"
            )
          }
        />
      </div>
    </DashboardLayout>
  );
}
