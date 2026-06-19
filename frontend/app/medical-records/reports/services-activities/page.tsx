"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  ArrowLeft,
  Activity,
  Syringe,
  FileText,
  Calendar,
  TrendingUp,
  Users,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface ServiceData {
  sn: number;
  category: string;
  count: number;
  male: number;
  female: number;
  percentage: number;
}

interface ServicesSummary {
  total: number;
  total_male: number;
  total_female: number;
}

const emptySummary: ServicesSummary = { total: 0, total_male: 0, total_female: 0 };

export default function ServicesActivitiesReport() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
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

  const [data, setData] = useState<ServiceData[]>([]);
  const [summary, setSummary] = useState<ServicesSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    const params = buildQuery();
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: ServiceData[]; summary: ServicesSummary }>(
        `/reports/services-activities/?${params.toString()}`
      );
      setData(response.data);
      setSummary(response.summary);
    } catch (error: unknown) {
      console.error("Error fetching services report:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load services report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (canFetch) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode]);

  const totalMaleEvents = data.reduce((sum, row) => sum + row.male, 0);
  const totalFemaleEvents = data.reduce((sum, row) => sum + row.female, 0);
  const distinctPatients = summary.total_male + summary.total_female;
  const malePatientPct =
    distinctPatients > 0 ? ((summary.total_male / distinctPatients) * 100).toFixed(1) : "0";
  const femalePatientPct =
    distinctPatients > 0 ? ((summary.total_female / distinctPatients) * 100).toFixed(1) : "0";

  const getIconForService = (category: string) => {
    if (category.includes("Injection")) return Syringe;
    if (category.includes("Dressing")) return Activity;
    if (category.includes("Sick Leave")) return FileText;
    return Activity;
  };

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
              <Activity className="h-8 w-8 text-orange-500" />
              Services & Activities Report
            </h1>
            <p className="text-muted-foreground mt-1">Nursing procedures and activities — {periodLabel}</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/services-activities/"
              buildQuery={buildQuery}
              filenameBase={`services_activities_${filenameSuffix}`}
              disabled={data.length === 0}
            />
          </div>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Adjust date range for detailed reporting</CardDescription>
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

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Services</p>
                  <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">
                    {summary.total.toLocaleString()}
                  </p>
                </div>
                <Activity className="h-10 w-10 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Male Patients</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_male.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">{malePatientPct}% of patients</p>
                </div>
                <Users className="h-10 w-10 text-cyan-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-pink-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Female Patients</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_female.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">{femalePatientPct}% of patients</p>
                </div>
                <Users className="h-10 w-10 text-pink-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Services & Activities — {periodLabel}
            </CardTitle>
            <CardDescription>
              Same procedure rules as Nursing → Procedures History. Medications are excluded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Category</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => {
                      const Icon = getIconForService(row.category);
                      return (
                        <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-foreground">{row.sn}</td>
                          <td className="p-3 font-medium text-foreground flex items-center gap-2">
                            <Icon className="h-4 w-4 text-orange-500" />
                            {row.category}
                          </td>
                          <td className="p-3 text-right font-semibold text-foreground">{row.count.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{row.male.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{row.female.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL</td>
                      <td className="p-3 text-right text-foreground">{summary.total.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{totalMaleEvents.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{totalFemaleEvents.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No services or activities found for {periodLabel}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
