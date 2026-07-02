"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { RefreshCw, ArrowLeft, TrendingUp, GitCompare } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface PeriodCell {
  male: number;
  female: number;
  employee: number;
  non_employee: number;
  total: number;
}

interface ComparedRow {
  sn: number;
  code: string;
  description: string;
  diagnosis: string;
  periods: Record<string, PeriodCell>;
}

export default function DiseasePatternComparedReport() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const period = useMrReportPeriod("monthly");
  const [data, setData] = useState<ComparedRow[]>([]);
  const [labels, setLabels] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const fetchReport = async () => {
    const params = period.buildQuery({ periods: "3" });
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }
    setIsLoading(true);
    try {
      const res = await apiFetch<{ data: ComparedRow[]; period_labels: string[] }>(
        `/reports/disease-pattern-compared/?${params.toString()}`
      );
      setData(res.data ?? []);
      setLabels(res.period_labels ?? []);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      toast.error(e instanceof Error ? e.message : "Failed to load report");
      setData([]);
      setLabels([]);
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

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        <Button variant="ghost" size="sm" className="-ml-2 gap-2" asChild>
          <Link href="/medical-records/reports"><ArrowLeft className="h-4 w-4" />Back to reports</Link>
        </Button>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <GitCompare className="h-8 w-8 text-red-500" />
            Disease Pattern Compared
          </h1>
          <ReportExportButtons
            apiPath="/reports/disease-pattern-compared/"
            buildQuery={() => period.buildQuery({ periods: "3" })}
            filenameBase={`disease_pattern_compared_${period.filenameSuffix}`}
            disabled={data.length === 0}
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
                <TrendingUp className="h-4 w-4 mr-2" />Generate
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>ICD-10 diagnoses across 3 periods</CardTitle>
            <CardDescription>Ending at {period.periodLabel}</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <RefreshCw className="h-8 w-8 animate-spin mx-auto my-8 text-muted-foreground" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-3">S/N</th>
                      <th className="text-left p-3">Code</th>
                      <th className="text-left p-3">Description</th>
                      {labels.map((label) => (
                        <th key={label} className="text-right p-3">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b">
                        <td className="p-3">{row.sn}</td>
                        <td className="p-3 font-mono">{row.code}</td>
                        <td className="p-3">{row.description}</td>
                        {labels.map((label) => (
                          <td key={label} className="p-3 text-right">
                            {row.periods[label]?.total ?? 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
