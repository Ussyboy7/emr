"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  Stethoscope,
  Calendar,
  TrendingUp,
  Activity,
  } from "lucide-react";
  import { toast } from "sonner";
  import { apiFetch } from "@/lib/api-client";
  import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
  import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";

interface StaffRow {
  doctor_id: number;
  doctor_name: string;
  specialization: string;
  total_visits: number;
  completed: number;
  in_progress: number;
  cancelled: number;
  completion_rate: number;
}

interface StaffProductivity {
  total_visits: number;
  staff_count: number;
  data: StaffRow[];
}

export default function StaffProductivityReport() {
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
  const [data, setData] = useState<StaffProductivity | null>(null);
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
      const url = `/reports/staff-productivity/?${params.toString()}`;
      const response = await apiFetch<StaffProductivity>(url);
      setData(response);
    } catch (error: any) {
      console.error("Error fetching staff productivity:", error);
      toast.error(error.message || "Failed to load staff productivity");
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
              <Stethoscope className="h-8 w-8 text-emerald-500" />
              Staff Productivity
            </h1>
            <p className="text-muted-foreground mt-1">
              Medical doctor visit throughput for {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/staff-productivity/"
              buildQuery={() => buildQuery()}
              filenameBase={`staff_productivity_${filenameSuffix}`}
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total visits</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.total_visits.toLocaleString()}</p>
                    </div>
                    <Activity className="h-10 w-10 text-emerald-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-sky-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active doctors</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.staff_count.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">With ≥1 visit in period</p>
                    </div>
                    <Stethoscope className="h-10 w-10 text-sky-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-violet-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg visits / doctor</p>
                      <p className="text-2xl sm:text-3xl font-bold">
                        {data.staff_count > 0
                          ? (data.total_visits / data.staff_count).toFixed(1)
                          : "0.0"}
                      </p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-violet-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Doctor productivity — {periodLabel}</CardTitle>
                <CardDescription>
                  Sorted by total visits, descending
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.data.length === 0 ? (
                  <div className="text-center py-12">
                    <Stethoscope className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">No visits in this period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Doctor</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Specialization</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Total</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Completed</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">In progress</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Cancelled</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Completion %</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.data.map((r) => (
                          <tr key={r.doctor_id} className="border-b border-border hover:bg-muted/30">
                            <td className="p-2 font-medium">{r.doctor_name}</td>
                            <td className="p-2 text-muted-foreground">{r.specialization || "—"}</td>
                            <td className="p-2 text-right font-semibold">{r.total_visits.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.completed.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.in_progress.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.cancelled.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.completion_rate.toFixed(1)}%</td>
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
              <Stethoscope className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
