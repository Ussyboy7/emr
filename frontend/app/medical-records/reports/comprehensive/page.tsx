"use client";

import React, { useCallback, useEffect, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, Layers, TrendingUp, FileText } from "lucide-react";
import { toast } from "sonner";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";
import {
  fetchBundledMrReport,
  type BundledReportSection,
} from "@/lib/fetch-bundled-mr-report";

export default function ComprehensiveReport() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const {
    buildQuery,
    canFetch,
    year,
    startDate,
    endDate,
    viewMode,
    setViewMode,
    setYear,
    setStartDate,
    setEndDate,
    years,
    periodLabel,
    filenameSuffix,
  } = useMrReportPeriod("monthly");
  const [sections, setSections] = useState<BundledReportSection[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchReport = useCallback(async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }
    setIsLoading(true);
    setFetchError(null);
    try {
      const bundle = await fetchBundledMrReport(params);
      setSections(bundle);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      const message = e instanceof Error ? e.message : "Failed to load comprehensive report";
      setFetchError(message);
      setSections([]);
      toast.error(message);
    } finally {
      setIsLoading(false);
    }
  }, [buildQuery, handleAuthError]);

  useEffect(() => {
    if (!ready || !canFetch) return;
    void fetchReport();
  }, [ready, canFetch, year, startDate, endDate, viewMode, fetchReport]);

  const hasSections = sections.length > 0;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
          <Link href="/medical-records/reports"><ArrowLeft className="h-4 w-4" />Back to reports</Link>
        </Button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <Layers className="h-8 w-8 text-teal-600" />
              Comprehensive Report
            </h1>
            <p className="text-muted-foreground">
              All medical records sections in one bundle — {periodLabel}
            </p>
          </div>
          <ReportExportButtons
            apiPath="/reports/comprehensive/"
            buildQuery={() => buildQuery()}
            filenameBase={`comprehensive_${filenameSuffix}`}
            disabled={!hasSections || isLoading}
          />
        </div>

        <Card>
          <CardContent className="p-4 grid md:grid-cols-4 gap-4">
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
              <Button onClick={() => void fetchReport()} className="w-full" disabled={isLoading}>
                <TrendingUp className="h-4 w-4 mr-2" />Generate report
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center py-12 space-y-3">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              Building all sections — this may take a minute for large periods.
            </p>
          </div>
        ) : fetchError ? (
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-destructive font-medium">{fetchError}</p>
            </CardContent>
          </Card>
        ) : !hasSections ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              No bundled sections returned for {periodLabel}.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {sections.map((section) => {
              const summary = section.report?.summary as Record<string, number> | undefined;
              const total =
                summary?.grand_total ??
                summary?.total_admission_events ??
                summary?.total_diagnosis_lines ??
                summary?.total_referrals ??
                summary?.total ??
                (Array.isArray(section.report?.data) ? section.report.data.length : 0);
              return (
                <Card key={section.key}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      {section.title}
                    </CardTitle>
                    {section.report?.error && (
                      <CardDescription className="text-destructive">{section.report.error}</CardDescription>
                    )}
                  </CardHeader>
                  <CardContent>
                    <p className="text-2xl font-bold">{section.report?.error ? "—" : total}</p>
                    <p className="text-xs text-muted-foreground mt-1">Primary total for section</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
