"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, BedDouble, TrendingUp, Calendar } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface Row {
  sn: number;
  category: string;
  male: number;
  female: number;
  total: number;
  percentage: number;
}

interface Summary {
  total_admission_events: number;
  distinct_patients: number;
  total_male: number;
  total_female: number;
}

export default function ObservationAdmissionsReport() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const period = useMrReportPeriod("monthly");
  const [data, setData] = useState<Row[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    const params = period.buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: Row[]; summary: Summary }>(
        `/reports/observation-admissions/?${params.toString()}`
      );
      setData(res.data ?? []);
      setSummary(res.summary ?? null);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      toast.error(e instanceof Error ? e.message : "Failed to load report");
      setData([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, period.canFetch, fetchReport, [
    period.year,
    period.startDate,
    period.endDate,
    period.viewMode,
  ]);

  const total = summary?.total_admission_events ?? 0;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
          <Link href="/medical-records/reports"><ArrowLeft className="h-4 w-4" />Back to reports</Link>
        </Button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-3">
              <BedDouble className="h-8 w-8 text-amber-500" />
              Patients Placed on Observation
            </h1>
            <p className="text-muted-foreground">Admission events — {period.periodLabel}</p>
          </div>
          <ReportExportButtons
            apiPath="/reports/observation-admissions/"
            buildQuery={() => period.buildQuery()}
            filenameBase={`observation_admissions_${period.filenameSuffix}`}
            disabled={total === 0}
          />
        </div>

        <Card>
          <CardContent className="p-4 grid md:grid-cols-4 gap-4">
            <ReportDateFilterFields
              viewMode={period.viewMode}
              onViewModeChange={period.setViewMode}
              year={period.year}
              onYearChange={period.setYear}
              startDate={period.startDate}
              onStartDateChange={period.setStartDate}
              endDate={period.endDate}
              onEndDateChange={period.setEndDate}
              yearOptions={period.years}
            />
            <div className="flex items-end">
              <Button onClick={fetchReport} className="w-full" disabled={isLoading}>
                <TrendingUp className="h-4 w-4 mr-2" />
                Generate
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-4">
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Admission events</p><p className="text-2xl font-bold">{total}</p></CardContent></Card>
          <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Distinct patients</p><p className="text-2xl font-bold">{summary?.distinct_patients ?? 0}</p></CardContent></Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>By patient category</CardTitle>
            <CardDescription>Each observation admission counted as one event</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <RefreshCw className="h-8 w-8 animate-spin mx-auto my-8 text-muted-foreground" />
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3">S/N</th>
                    <th className="text-left p-3">Category</th>
                    <th className="text-right p-3">Male</th>
                    <th className="text-right p-3">Female</th>
                    <th className="text-right p-3">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((row) => (
                    <tr key={row.sn} className="border-b">
                      <td className="p-3">{row.sn}</td>
                      <td className="p-3 font-medium">{row.category}</td>
                      <td className="p-3 text-right">{row.male}</td>
                      <td className="p-3 text-right">{row.female}</td>
                      <td className="p-3 text-right font-semibold">{row.total}</td>
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
