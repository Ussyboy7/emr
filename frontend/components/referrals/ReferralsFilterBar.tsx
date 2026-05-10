"use client";

import React from "react";
import { Search } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { REFERRAL_URGENCY_OPTIONS } from "@/lib/referrals/referral-helpers";
import type { ReferralsDateFilter } from "@/lib/referrals/use-referrals-queue";

export interface ReferralsFilterBarStatusOption {
  value: string;
  label: string;
}

export interface ReferralsFilterBarProps {
  searchQuery: string;
  onSearchQueryChange: (value: string) => void;

  statusFilter: string;
  onStatusFilterChange: (value: string) => void;
  statusOptions: readonly ReferralsFilterBarStatusOption[];

  specialtyFilter: string;
  onSpecialtyFilterChange: (value: string) => void;
  specialties: readonly string[];

  facilityFilter: string;
  onFacilityFilterChange: (value: string) => void;
  facilities: readonly string[];

  urgencyFilter: string;
  onUrgencyFilterChange: (value: string) => void;

  dateFilter: ReferralsDateFilter;
  onDateFilterChange: (value: ReferralsDateFilter) => void;

  /** Customise the search box placeholder per page. */
  searchPlaceholder?: string;
}

/**
 * Search + status / specialty / facility / urgency / date-period filters
 * shared between the Consultation and Medical Records referral queue pages.
 */
export function ReferralsFilterBar({
  searchQuery,
  onSearchQueryChange,
  statusFilter,
  onStatusFilterChange,
  statusOptions,
  specialtyFilter,
  onSpecialtyFilterChange,
  specialties,
  facilityFilter,
  onFacilityFilterChange,
  facilities,
  urgencyFilter,
  onUrgencyFilterChange,
  dateFilter,
  onDateFilterChange,
  searchPlaceholder = "Search referrals…",
}: ReferralsFilterBarProps) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="relative flex-1 min-w-[min(100%,16rem)]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder={searchPlaceholder}
              value={searchQuery}
              onChange={(e) => onSearchQueryChange(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Select value={statusFilter} onValueChange={onStatusFilterChange}>
              <SelectTrigger className="w-[170px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {statusOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={specialtyFilter} onValueChange={onSpecialtyFilterChange}>
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
            <Select value={facilityFilter} onValueChange={onFacilityFilterChange}>
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
            <Select value={urgencyFilter} onValueChange={onUrgencyFilterChange}>
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
            <Select
              value={dateFilter}
              onValueChange={(value) => onDateFilterChange(value as ReferralsDateFilter)}
            >
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
  );
}
