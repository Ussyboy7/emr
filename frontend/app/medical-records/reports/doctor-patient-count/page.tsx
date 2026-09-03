"use client";

import React, { useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import { ReportSearchField } from "@/components/reports/ReportSearchField";
import { RefreshCw, ArrowLeft, TrendingUp, Stethoscope, Users, Calendar, Activity } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
import Link from "next/link";
import { useMrReportPeriod, useMrReportAutoFetch } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface DoctorRow {
  sn: number;
  doctor_id: number;
  doctor_name: string;
  rooms?: string[];
  room_display?: string;
  sessions: number;
  patients: number;
  percentage?: number;
}

interface DoctorSummary {
  total_sessions: number;
  distinct_patients: number;
  doctor_count: number;
  grand_total: number;
}

const emptySummary: DoctorSummary = {
  total_sessions: 0,
  distinct_patients: 0,
  doctor_count: 0,
  grand_total: 0,
};

export default function DoctorPatientCountReport() {
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

  const [data, setData] = useState<DoctorRow[]>([]);
  const [summary, setSummary] = useState<DoctorSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(false);
  const [search, setSearch] = useState("");

  const searchExtra = () => {
    const queryExtra: Record<string, string> = {};
    const term = search.trim();
    if (term) queryExtra.search = term;
    return queryExtra;
  };

  const fetchReport = async () => {
    const params = buildQuery(searchExtra());
    if (!params) {
      toast.error("Please select a valid date range");
      return;
    }

    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: DoctorRow[]; summary: DoctorSummary }>(
        `/reports/doctor-patient-count/?${params.toString()}`
      );
      setData(response.data ?? []);
      setSummary(response.summary ?? emptySummary);
    } catch (error: unknown) {
      console.error("Error fetching doctor patient count:", error);
      if (handleAuthError(error)) return;
      toast.error(error instanceof Error ? error.message : "Failed to load doctor patient count");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useMrReportAutoFetch(ready, canFetch, fetchReport, [year, startDate, endDate, viewMode, search]);

  const hasData = (summary.grand_total ?? 0) > 0;

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
              <Stethoscope className="h-8 w-8 text-teal-500" />
              Doctor Patient Count
            </h1>
            <p className="text-muted-foreground mt-1">
              Completed consultations and distinct patients per doctor — {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/doctor-patient-count/"
              buildQuery={() => buildQuery(searchExtra())}
              filenameBase={`doctor_patient_count_${filenameSuffix}`}
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
              Completed consultation sessions grouped by attending doctor.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
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
              <ReportSearchField value={search} onChange={setSearch} placeholder="Search doctor name…" />
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
          <Card className="border-l-4 border-l-teal-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Doctors
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-teal-600 dark:text-teal-400">
                {(summary.doctor_count ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Doctors with completed sessions in period
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Activity className="h-4 w-4" />
                Consultations
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                {(summary.total_sessions ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Completed consultation sessions
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Users className="h-4 w-4" />
                Distinct patients
              </p>
              <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                {(summary.distinct_patients ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Unique patients seen across all doctors
              </p>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Patients per doctor — {periodLabel}
            </CardTitle>
            <CardDescription>
              Distinct patients each doctor attended in completed consultations. % is share of
              completed sessions.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : hasData ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Doctor</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">Room(s)</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Sessions</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Patients</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.doctor_id} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 text-foreground">{row.doctor_name}</td>
                        <td className="p-3 text-foreground">{row.room_display ?? "—"}</td>
                        <td className="p-3 text-right text-foreground">{(row.sessions ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{(row.patients ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">
                          {(row.percentage ?? 0).toFixed(1)}%
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={3} className="p-3 text-foreground">
                        TOTAL
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.total_sessions ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">
                        {(summary.distinct_patients ?? 0).toLocaleString()}
                      </td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Stethoscope className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">
                  No completed consultations found for {periodLabel}
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
