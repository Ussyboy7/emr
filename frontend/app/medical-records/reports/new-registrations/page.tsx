"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ReportDateFilterFields } from "@/components/reports/ReportDateFilterFields";
import {
  RefreshCw,
  ArrowLeft,
  UserPlus,
  Calendar,
  TrendingUp,
  Users,
  } from "lucide-react";
  import { toast } from "sonner";
  import { apiFetch } from "@/lib/api-client";
  import { ReportExportButtons } from "@/components/reports/ReportExportButtons";
  import Link from "next/link";
import { useMrReportPeriod } from "@/hooks/use-mr-report-period";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";

interface DailyRow {
  date: string;
  category: string;
  count: number;
}

interface NewRegs {
  total: number;
  by_category: Record<string, number>;
  daily_data: DailyRow[];
  start_date: string | null;
  end_date: string | null;
}

const CATEGORY_LABELS: Record<string, string> = {
  employee: "Employee",
  retiree: "Retiree",
  dependent: "Dependent",
  nonnpa: "Non-NPA",
};

export default function NewRegistrationsReport() {
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
  const [data, setData] = useState<NewRegs | null>(null);
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
      const url = `/reports/new-registrations/?${params.toString()}`;
      const response = await apiFetch<NewRegs>(url);
      setData(response);
    } catch (error: any) {
      console.error("Error fetching new registrations:", error);
      toast.error(error.message || "Failed to load new registrations");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    if (canFetch) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode]);

  // Group daily_data by date for table view
  const dailyTotals = useMemo(() => {
    if (!data) return [] as { date: string; total: number; by_cat: Record<string, number> }[];
    const map: Record<string, { total: number; by_cat: Record<string, number> }> = {};
    for (const row of data.daily_data) {
      if (!map[row.date]) {
        map[row.date] = { total: 0, by_cat: {} };
      }
      map[row.date].total += row.count;
      map[row.date].by_cat[row.category] = (map[row.date].by_cat[row.category] || 0) + row.count;
    }
    return Object.entries(map)
      .map(([date, v]) => ({ date, total: v.total, by_cat: v.by_cat }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [data]);


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
              <UserPlus className="h-8 w-8 text-emerald-500" />
              New Patient Registrations
            </h1>
            <p className="text-muted-foreground mt-1">
              Patients registered in {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <ReportExportButtons
              apiPath="/reports/new-registrations/"
              buildQuery={() => buildQuery()}
              filenameBase={`new_registrations_${filenameSuffix}`}
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total new</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.total.toLocaleString()}</p>
                    </div>
                    <UserPlus className="h-10 w-10 text-emerald-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              {Object.entries(data.by_category || {}).map(([k, v]) => (
                <Card key={k} className="border-l-4 border-l-sky-500">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{CATEGORY_LABELS[k] || k}</p>
                        <p className="text-2xl sm:text-3xl font-bold">{v.toLocaleString()}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {data.total > 0 ? ((v / data.total) * 100).toFixed(1) : "0.0"}% of total
                        </p>
                      </div>
                      <Users className="h-10 w-10 text-sky-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <TrendingUp className="h-4 w-4" />
                  Daily breakdown — {periodLabel}
                </CardTitle>
                <CardDescription>
                  {dailyTotals.length} days with new registrations
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dailyTotals.length === 0 ? (
                  <div className="text-center py-12">
                    <UserPlus className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">No new registrations in this period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Date</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Employee</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Retiree</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Dependent</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Non-NPA</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dailyTotals.map((d) => (
                          <tr key={d.date} className="border-b border-border hover:bg-muted/30">
                            <td className="p-2 font-medium">{d.date}</td>
                            <td className="p-2 text-right">{(d.by_cat.employee || 0).toLocaleString()}</td>
                            <td className="p-2 text-right">{(d.by_cat.retiree || 0).toLocaleString()}</td>
                            <td className="p-2 text-right">{(d.by_cat.dependent || 0).toLocaleString()}</td>
                            <td className="p-2 text-right">{(d.by_cat.nonnpa || 0).toLocaleString()}</td>
                            <td className="p-2 text-right font-semibold">{d.total.toLocaleString()}</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/50 font-bold">
                          <td className="p-2">TOTAL</td>
                          <td className="p-2 text-right">{(data.by_category.employee || 0).toLocaleString()}</td>
                          <td className="p-2 text-right">{(data.by_category.retiree || 0).toLocaleString()}</td>
                          <td className="p-2 text-right">{(data.by_category.dependent || 0).toLocaleString()}</td>
                          <td className="p-2 text-right">{(data.by_category.nonnpa || 0).toLocaleString()}</td>
                          <td className="p-2 text-right">{data.total.toLocaleString()}</td>
                        </tr>
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
              <UserPlus className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
