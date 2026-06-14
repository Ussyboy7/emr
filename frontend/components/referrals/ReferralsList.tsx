"use client";

import React, { type ReactNode } from "react";
import {
  Building2,
  Calendar,
  Eye,
  RefreshCw,
  User,
  UserPlus,
} from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatDisplayDate } from "@/lib/dates";
import {
  type ReferralWithPatient,
  getFacilityTypeBadgeClass,
  getStatusBadgeClass,
  getUrgencyBadgeClass,
  referralStatusLabel,
  toLabel,
} from "@/lib/referrals/referral-helpers";

export interface ReferralsListEmptyState {
  icon?: ReactNode;
  title: string;
  description: string;
}

export interface ReferralsListProps {
  referrals: ReferralWithPatient[];
  isLoading: boolean;
  totalCount: number;
  currentPage: number;
  itemsPerPage: number;
  /** What to render when there are no rows. */
  emptyState: ReferralsListEmptyState;
  /** Click handler for a row (opens the page-specific detail modal). */
  onSelectReferral: (referral: ReferralWithPatient) => void;
}

function formatRange(currentPage: number, itemsPerPage: number, totalCount: number) {
  if (totalCount <= 0) return "Showing 0 referrals";
  const start = Math.min((currentPage - 1) * itemsPerPage + 1, totalCount);
  const end = Math.min(currentPage * itemsPerPage, totalCount);
  return `Showing ${start}\u2013${end} of ${totalCount}`;
}

function FacilityIcon({ type }: { type: ReferralWithPatient["facility_type"] }) {
  if (type === "external") {
    return <Building2 className="h-4 w-4 text-orange-600" />;
  }
  if (type === "specialist") {
    return <UserPlus className="h-4 w-4 text-purple-600" />;
  }
  return <User className="h-4 w-4 text-teal-600" />;
}

function facilityIconBgClass(type: ReferralWithPatient["facility_type"]) {
  if (type === "external") return "bg-orange-100 dark:bg-orange-900/30";
  if (type === "specialist") return "bg-purple-100 dark:bg-purple-900/30";
  return "bg-teal-100 dark:bg-teal-900/30";
}

function urgencyBorderClass(urgency: ReferralWithPatient["urgency"]) {
  if (urgency === "emergency") return "border-l-red-500";
  if (urgency === "urgent") return "border-l-amber-500";
  return "border-l-blue-500";
}

/**
 * Card list of referrals with shared loading / empty / row layouts. Pages own
 * the click handler so they can route the row to the correct detail modal.
 */
export function ReferralsList({
  referrals,
  isLoading,
  totalCount,
  currentPage,
  itemsPerPage,
  emptyState,
  onSelectReferral,
}: ReferralsListProps) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {formatRange(currentPage, itemsPerPage, totalCount)}
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
            <div className="h-12 w-12 mx-auto mb-4 opacity-50 flex items-center justify-center">
              {emptyState.icon}
            </div>
            <p className="font-medium mb-1">{emptyState.title}</p>
            <p className="text-sm">{emptyState.description}</p>
          </CardContent>
        </Card>
      ) : (
        referrals.map((referral) => (
          <Card
            key={referral.id}
            className={`border-l-4 hover:shadow-md transition-shadow ${urgencyBorderClass(referral.urgency)}`}
          >
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-full ${facilityIconBgClass(referral.facility_type)}`}>
                  <FacilityIcon type={referral.facility_type} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <button
                        type="button"
                        onClick={() => onSelectReferral(referral)}
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
                      <Badge
                        variant="outline"
                        className={`text-[10px] px-1.5 py-0 ${getStatusBadgeClass(referral.status)}`}
                      >
                        {referralStatusLabel(referral.status)}
                      </Badge>
                      {referral.urgency !== "routine" && (
                        <Badge
                          variant="outline"
                          className={`text-[10px] px-1.5 py-0 ${getUrgencyBadgeClass(referral.urgency)}`}
                        >
                          {toLabel(referral.urgency)}
                        </Badge>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0"
                      onClick={() => onSelectReferral(referral)}
                    >
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
                      {formatDisplayDate(referral.referred_at)}
                    </span>
                    <span>•</span>
                    <span className="flex items-center gap-1">
                      <User className="h-3 w-3" />
                      {referral.referred_by_name || "Unknown"}
                    </span>
                    {referral.location_clinic_name && (
                      <><span>•</span><span>{referral.location_clinic_name}</span></>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
