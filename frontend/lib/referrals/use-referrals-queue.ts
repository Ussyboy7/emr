"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginatedListGuard, useResetPageOnFilterChange } from "@/hooks/use-paginated-list-guard";
import { isAuthenticationError } from "@/lib/auth-errors";
import { referralService } from "@/lib/services/referral-service";
import type { ReferralWithPatient } from "@/lib/referrals/referral-helpers";
import { localWeekToTodayBounds, toApiDateString } from "@/lib/dates";

type ReferralListParams = Parameters<typeof referralService.getReferrals>[0];

/** Pre-migration status codes stored in DB — map to current API filter values. */
const LEGACY_TO_API_STATUS: Record<string, string> = {
  sent: "submitted_to_records",
  accepted: "records_review",
  scheduled: "approved_for_forms",
  completed: "closed",
};

const SUBMITTED_STATUSES = ["submitted_to_records"] as const;
const REVIEW_STATUSES = ["records_review"] as const;
const APPROVED_STATUSES = ["approved_for_forms"] as const;

function normalizeReferralStatusForApi(status: string): string {
  return LEGACY_TO_API_STATUS[status] ?? status;
}

/** Normalize status query params to current Referral.STATUS_CHOICES before calling the API. */
async function getReferralsWithStatusFallback(params: ReferralListParams) {
  const status = params?.status;
  if (!status) {
    return referralService.getReferrals(params);
  }
  return referralService.getReferrals({
    ...params,
    status: normalizeReferralStatusForApi(status),
  });
}

export type ReferralsDateFilter = "all" | "today" | "week" | "month";

export interface ReferralsQueueStats {
  total: number;
  submitted: number;
  inReview: number;
  approved: number;
}

export interface UseReferralsQueueOptions {
  /** Set true on the Medical Records queue to hide draft rows. */
  excludeDraft?: boolean;
}

export interface UseReferralsQueueResult {
  // data
  referrals: ReferralWithPatient[];
  isLoading: boolean;
  statsLoading: boolean;
  totalCount: number;
  stats: ReferralsQueueStats;

  // pagination
  currentPage: number;
  setCurrentPage: (page: number) => void;
  itemsPerPage: number;
  setItemsPerPage: (count: number) => void;

  // filters
  statusFilter: string;
  setStatusFilter: (value: string) => void;
  specialtyFilter: string;
  setSpecialtyFilter: (value: string) => void;
  facilityFilter: string;
  setFacilityFilter: (value: string) => void;
  urgencyFilter: string;
  setUrgencyFilter: (value: string) => void;
  searchQuery: string;
  setSearchQuery: (value: string) => void;
  dateFilter: ReferralsDateFilter;
  setDateFilter: (value: ReferralsDateFilter) => void;

  // derived
  specialties: string[];
  facilities: string[];

  // actions
  refetch: () => Promise<void>;
  refetchStats: () => Promise<void>;
}

/**
 * Owns the referral queue state shared between the Consultation and Medical
 * Records pages: filters, debounced search, pagination, list fetch, KPI stats,
 * and the auth-error redirect plumbing.
 *
 * Pages stay responsible for their own detail modals, mutations, and
 * page-specific UI; they call `refetch` / `refetchStats` after their actions.
 */
export function useReferralsQueue(
  options: UseReferralsQueueOptions = {}
): UseReferralsQueueResult {
  const { excludeDraft = false } = options;

  const [referrals, setReferrals] = useState<ReferralWithPatient[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState<ReferralsQueueStats>({
    total: 0,
    submitted: 0,
    inReview: 0,
    approved: 0,
  });

  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [currentPage, setCurrentPage] = useState(1);
  const { currentPageRef, resetToFirstPage, beginLoad } = usePaginatedListGuard(currentPage);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [facilityFilter, setFacilityFilter] = useState<string>("all");
  const [urgencyFilter, setUrgencyFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [dateFilter, setDateFilter] = useState<ReferralsDateFilter>("all");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);

  const buildDateParams = useCallback(() => {
    let date: string | undefined;
    let start_date: string | undefined;
    let end_date: string | undefined;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    if (dateFilter === "today") {
      date = toApiDateString(today);
    } else if (dateFilter === "week") {
      const { start, end } = localWeekToTodayBounds();
      start_date = start;
      end_date = end;
    } else if (dateFilter === "month") {
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      start_date = toApiDateString(monthStart);
      end_date = toApiDateString(today);
    }
    return { date, start_date, end_date };
  }, [dateFilter]);

  const baseFilterParams = useCallback((): ReferralListParams => {
    const params: ReferralListParams = {
      exclude_status: "returned_for_correction",
    };
    if (excludeDraft) params.exclude_draft = true;
    if (specialtyFilter !== "all") params.specialty = specialtyFilter;
    if (facilityFilter !== "all") params.facility = facilityFilter;
    if (urgencyFilter !== "all") params.urgency = urgencyFilter;
    if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
    Object.assign(params, buildDateParams());
    return params;
  }, [
    excludeDraft,
    specialtyFilter,
    facilityFilter,
    urgencyFilter,
    debouncedSearchQuery,
    buildDateParams,
  ]);

  const fetchReferrals = useCallback(async () => {
    const isStale = beginLoad();
    setIsLoading(true);
    try {
      const params: ReferralListParams = {
        ...baseFilterParams(),
        page: currentPageRef.current,
        page_size: itemsPerPage,
      };
      if (statusFilter !== "all") params.status = statusFilter;
      const response = await getReferralsWithStatusFallback(params);
      if (isStale()) return;
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
  }, [baseFilterParams, itemsPerPage, statusFilter, beginLoad, currentPageRef]);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const stats = await referralService.getListStats({
        ...baseFilterParams(),
        exclude_draft: true,
      });
      setStats({
        total: stats.total,
        submitted: stats.submitted,
        inReview: stats.inReview,
        approved: stats.approved,
      });
    } catch (error) {
      console.error(error);
    } finally {
      setStatsLoading(false);
    }
  }, [baseFilterParams]);

  useEffect(() => {
    void fetchReferrals();
  }, [fetchReferrals, currentPage]);

  useEffect(() => {
    void loadStats();
  }, [loadStats]);

  useResetPageOnFilterChange(resetToFirstPage, setCurrentPage, [
    statusFilter,
    specialtyFilter,
    facilityFilter,
    urgencyFilter,
    dateFilter,
    debouncedSearchQuery,
    itemsPerPage,
  ]);

  const specialties = useMemo(
    () => [...new Set(referrals.map((r) => r.specialty).filter(Boolean))].sort(),
    [referrals]
  );
  const facilities = useMemo(
    () => [...new Set(referrals.map((r) => r.facility).filter(Boolean))].sort(),
    [referrals]
  );

  return {
    referrals,
    isLoading,
    statsLoading,
    totalCount,
    stats,

    currentPage,
    setCurrentPage,
    itemsPerPage,
    setItemsPerPage,

    statusFilter,
    setStatusFilter,
    specialtyFilter,
    setSpecialtyFilter,
    facilityFilter,
    setFacilityFilter,
    urgencyFilter,
    setUrgencyFilter,
    searchQuery,
    setSearchQuery,
    dateFilter,
    setDateFilter,

    specialties,
    facilities,

    refetch: fetchReferrals,
    refetchStats: loadStats,
  };
}
