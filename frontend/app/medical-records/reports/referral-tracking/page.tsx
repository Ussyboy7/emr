"use client";

import React, { useState, useEffect } from "react";
import { formatDisplayDate } from "@/lib/dates";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  TrendingUp,
  Users,
  Calendar,
  ArrowRight,
  FileText,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import { referralStatusLabel } from "@/lib/referrals/referral-helpers";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";

interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  percentage: number;
}

interface ReferralSummary {
  total_referrals: number;
  distinct_patients: number;
  new_referrals: number;
  follow_ups: number;
  completed: number;
  cancelled: number;
  internal: number;
  external: number;
  specialist: number;
  total: number;
}

interface ReferralRow {
  referral_id: string;
  patient__patient_id: string;
  patient__first_name?: string;
  patient__surname?: string;
  patient_name?: string;
  status: string;
  status_label?: string;
  facility_type: string;
  facility_type_label?: string;
  specialty?: string;
  facility?: string;
  referred_at?: string;
}

const emptySummary: ReferralSummary = {
  total_referrals: 0,
  distinct_patients: 0,
  new_referrals: 0,
  follow_ups: 0,
  completed: 0,
  cancelled: 0,
  internal: 0,
  external: 0,
  specialist: 0,
  total: 0,
};

function normalizeSummary(raw?: Partial<ReferralSummary> | null): ReferralSummary {
  const total = raw?.total_referrals ?? raw?.total ?? 0;
  return {
    total_referrals: total,
    distinct_patients: raw?.distinct_patients ?? 0,
    new_referrals: raw?.new_referrals ?? 0,
    follow_ups: raw?.follow_ups ?? 0,
    completed: raw?.completed ?? 0,
    cancelled: raw?.cancelled ?? 0,
    internal: raw?.internal ?? 0,
    external: raw?.external ?? 0,
    specialist: raw?.specialist ?? 0,
    total,
  };
}

export default function ReferralTrackingReport() {
  const {
    year,
    setYear,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    viewMode,
    setViewMode,
    periodLabel,
    canFetch,
    buildQuery,
    filenameSuffix,
    years,
  } = useMrReportPeriod("all");

  const [summary, setSummary] = useState<ReferralSummary>(emptySummary);
  const [statusBreakdown, setStatusBreakdown] = useState<BreakdownRow[]>([]);
  const [facilityBreakdown, setFacilityBreakdown] = useState<BreakdownRow[]>([]);
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const isAllTime = viewMode === "all";
  const hasData = summary.total > 0;

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{
        summary: ReferralSummary;
        status_breakdown?: BreakdownRow[];
        facility_breakdown?: BreakdownRow[];
        data: ReferralRow[];
      }>(`/reports/referral-tracking/?${params.toString()}`);

      setSummary(normalizeSummary(response.summary));
      setStatusBreakdown(response.status_breakdown ?? []);
      setFacilityBreakdown(response.facility_breakdown ?? []);
      setReferrals(response.data ?? []);
    } catch (error: unknown) {
      console.error("Error fetching referral report:", error);
      toast.error(error instanceof Error ? error.message : "Failed to load referral tracking report");
      setSummary(emptySummary);
      setStatusBreakdown([]);
      setFacilityBreakdown([]);
      setReferrals([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (canFetch) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="mb-2 print:hidden">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 px-2" asChild>
            <Link href="/medical-records/reports">
              <ArrowLeft className="h-4 w-4" />
              Back to reports
            </Link>
          </Button>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Users className="h-8 w-8 text-blue-500" />
              Referral Tracking Report
            </h1>
            <p className="text-muted-foreground mt-1">New referrals and follow-ups — {periodLabel}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/referral-tracking/"
              buildQuery={() => buildQuery()}
              filenameBase={`referral_tracking_${filenameSuffix}`}
              disabled={!hasData}
            />
          </div>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>
              Referrals placed in the period; workflow buckets exclude cancelled referrals.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <ReportDateFilterFields
                viewMode={viewMode}
                onViewModeChange={setViewMode}
                year={year}
                onYearChange={setYear}
                startDate={startDate}
                onStartDateChange={setStartDate}
                endDate={endDate}
                onEndDateChange={setEndDate}
                yearOptions={years}
              />
              <div className="flex items-end">
                <Button onClick={fetchReport} className="w-full" disabled={isLoading}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isLoading ? "Loading..." : "Generate Report"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading report data...</p>
            </CardContent>
          </Card>
        ) : hasData ? (
          <>
            <div className={`grid gap-4 ${isAllTime ? "md:grid-cols-2" : "md:grid-cols-4"}`}>
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Total referrals
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                    {summary.total.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">Referral records in period</p>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Distinct patients
                  </p>
                  <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">
                    {summary.distinct_patients.toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {isAllTime
                      ? `${summary.new_referrals.toLocaleString()} new · ${summary.follow_ups.toLocaleString()} in workflow`
                      : "Patients referred in period"}
                  </p>
                </CardContent>
              </Card>
              {!isAllTime && (
                <>
                  <Card className="border-l-4 border-l-sky-500">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <ArrowRight className="h-4 w-4" />
                        New referrals
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold text-sky-600 dark:text-sky-400">
                        {summary.new_referrals.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">Draft or submitted to records</p>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-green-500">
                    <CardContent className="p-4">
                      <p className="text-sm text-muted-foreground flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4" />
                        Completed
                      </p>
                      <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                        {summary.completed.toLocaleString()}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {summary.follow_ups.toLocaleString()} still in workflow
                      </p>
                    </CardContent>
                  </Card>
                </>
              )}
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileText className="h-4 w-4 text-blue-500" />
                    By status
                  </CardTitle>
                  <CardDescription>Workflow status for referrals — {periodLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Referrals</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {statusBreakdown.map((row) => (
                        <tr key={row.key} className="border-b border-border">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{row.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{summary.total.toLocaleString()}</td>
                        <td className="p-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-orange-500" />
                    By facility type
                  </CardTitle>
                  <CardDescription>Where patients were referred — {periodLabel}</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Facility type</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Referrals</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {facilityBreakdown.map((row) => (
                        <tr key={row.key} className="border-b border-border">
                          <td className="p-2">{row.label}</td>
                          <td className="p-2 text-right">{row.count.toLocaleString()}</td>
                          <td className="p-2 text-right">{row.percentage.toFixed(1)}%</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 border-border bg-muted/50 font-bold">
                        <td className="p-2">Total</td>
                        <td className="p-2 text-right">{summary.total.toLocaleString()}</td>
                        <td className="p-2 text-right">100.0%</td>
                      </tr>
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Referral details — {periodLabel}</CardTitle>
                <CardDescription>List of referred patients and where they were sent</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">S/N</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Patient</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Specialty</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Facility</th>
                        <th className="text-left p-2 font-medium text-muted-foreground">Referred at</th>
                      </tr>
                    </thead>
                    <tbody>
                      {referrals.map((r, idx) => {
                        const patientName =
                          r.patient_name ||
                          [r.patient__first_name, r.patient__surname].filter(Boolean).join(" ") ||
                          r.patient__patient_id;
                        return (
                          <tr key={`${r.referral_id}-${idx}`} className="border-b border-border">
                            <td className="p-2">{idx + 1}</td>
                            <td className="p-2 font-medium">{patientName}</td>
                            <td className="p-2">{r.status_label || referralStatusLabel(r.status)}</td>
                            <td className="p-2">{r.specialty || "—"}</td>
                            <td className="p-2">{r.facility || "—"}</td>
                            <td className="p-2">{r.referred_at ? formatDisplayDate(r.referred_at) : "—"}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
              <p className="text-sm text-muted-foreground">No referral records found for {periodLabel}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
