"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface Row {
  sn: number;
  code: string;
  description: string;
  diagnosis: string;
  count: number;
  percentage: number;
}

export function ClinicalDiagnosisReportPage({
  title,
  apiPath,
  filenamePrefix,
  icon: Icon,
  iconClass,
}: {
  title: string;
  apiPath: string;
  filenamePrefix: string;
  icon: React.ComponentType<{ className?: string }>;
  iconClass: string;
}) {
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
  const [data, setData] = useState<Row[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: Row[]; summary: { total_diagnosis_lines: number } }>(
        `${apiPath}?${params.toString()}`
      );
      setData(res.data ?? []);
      setTotal(res.summary?.total_diagnosis_lines ?? 0);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      toast.error(e instanceof Error ? e.message : "Failed to load report");
      setData([]);
      setTotal(0);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [year, startDate, endDate, viewMode]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
          <Link href="/medical-records/reports"><ArrowLeft className="h-4 w-4" />Back to reports</Link>
        </Button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Icon className={`h-8 w-8 ${iconClass}`} />
            {title}
          </h1>
          <ReportExportButtons
            apiPath={apiPath}
            buildQuery={() => buildQuery()}
            filenameBase={`${filenamePrefix}_${filenameSuffix}`}
            disabled={total === 0}
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
                <TrendingUp className="h-4 w-4 mr-2" />Generate
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ICD-10 clinical diagnoses</CardTitle>
            <CardDescription>
              Multi-count all ICD-10 diagnoses per completed session. Nursing pool check-ins use last known diagnosis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <RefreshCw className="h-8 w-8 animate-spin mx-auto my-8 text-muted-foreground" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">S/N</th>
                    <th className="text-left p-3">Code</th>
                    <th className="text-left p-3">Description</th>
                    <th className="text-right p-3">Count</th>
                    <th className="text-right p-3">%</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.sn} className="border-b">
                      <td className="p-3">{row.sn}</td>
                      <td className="p-3 font-mono">{row.code}</td>
                      <td className="p-3">{row.description}</td>
                      <td className="p-3 text-right font-semibold">{row.count}</td>
                      <td className="p-3 text-right">{row.percentage.toFixed(1)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
