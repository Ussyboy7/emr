"use client";
import { formatDisplayDateTime } from '@/lib/dates';

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  AlertTriangle,
  Calendar,
  FlaskConical,
  TrendingUp,
} from "lucide-react";
  import { toast } from "sonner";
  import { apiFetch } from "@/lib/api-client";
  import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
  import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";

interface CriticalItem {
  id: number;
  patient_id: string;
  patient_name: string;
  test_name: string;
  test_code: string;
  priority: string;
  order_id: string;
  created_at: string | null;
}

interface CriticalLab {
  total: number;
  items: CriticalItem[];
}

const PRIORITY_BADGE: Record<string, string> = {
  high: "border-red-500/50 text-red-600",
  medium: "border-amber-500/50 text-amber-600",
  low: "border-sky-500/50 text-sky-600",
};

export default function CriticalLabReport() {
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
  const [data, setData] = useState<CriticalLab | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const params = buildQuery();
      if (!params) {
        toast.error("Please select a valid date range");
        setIsLoading(false);
        return;
      }
      const url = `/reports/critical-lab/?${params.toString()}`;
      const response = await apiFetch<CriticalLab>(url);
      setData(response);
    } catch (error: any) {
      console.error("Error fetching critical lab results:", error);
      toast.error(error.message || "Failed to load critical lab results");
      setData(null);
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
              <AlertTriangle className="h-8 w-8 text-red-500" />
              Critical Lab Results
            </h1>
            <p className="text-muted-foreground mt-1">
              Verified lab results flagged critical in {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/critical-lab/"
              buildQuery={() => buildQuery()}
              filenameBase={`critical_lab_${filenameSuffix}`}
              disabled={!data}
            />
          </div>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Adjust date range</CardDescription>
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
        ) : data ? (
          <>
            <Card className="border-l-4 border-l-red-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total critical results</p>
                    <p className="text-3xl sm:text-4xl font-bold">{data.total.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {periodLabel} — list capped at 500
                    </p>
                  </div>
                  <AlertTriangle className="h-12 w-12 text-red-500 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Critical results detail</CardTitle>
                <CardDescription>
                  {data.items.length === 0
                    ? "No critical results in this period"
                    : `${data.items.length} result${data.items.length === 1 ? "" : "s"}`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.items.length === 0 ? (
                  <div className="text-center py-12">
                    <FlaskConical className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">No critical results in this period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Created</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Patient</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Test</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Code</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Priority</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Order</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((i) => (
                          <tr key={i.id} className="border-b border-border hover:bg-muted/30">
                            <td className="p-2 text-xs">
                              {i.created_at ? formatDisplayDateTime(i.created_at) : "—"}
                            </td>
                            <td className="p-2">
                              <div className="font-medium">{i.patient_name || "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono">{i.patient_id}</div>
                            </td>
                            <td className="p-2 font-medium">{i.test_name}</td>
                            <td className="p-2 font-mono text-xs">{i.test_code}</td>
                            <td className="p-2">
                              <span
                                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium capitalize ${
                                  PRIORITY_BADGE[i.priority] || PRIORITY_BADGE.medium
                                }`}
                              >
                                {i.priority}
                              </span>
                            </td>
                            <td className="p-2 font-mono text-xs">{i.order_id}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
