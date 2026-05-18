"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
  analyticsRangeFromFilters,
} from "@/components/analytics/AnalyticsReportLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Activity, CheckCircle, XCircle, Clock, Calendar } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

interface VisitStatRow {
  period: string;
  period_label: string;
  completed: number;
  cancelled: number;
  in_progress: number;
  scheduled: number;
  total: number;
  male: number;
  female: number;
  employee: number;
  non_employee: number;
  officer: number;
  staff: number;
  emp_dependent: number;
  ret_dependent: number;
  nonnpa: number;
  retiree: number;
}

interface VisitStatSummary {
  completed: number;
  cancelled: number;
  in_progress: number;
  scheduled: number;
  total: number;
  male: number;
  female: number;
  employee: number;
  non_employee: number;
  officer: number;
  staff: number;
  emp_dependent: number;
  ret_dependent: number;
  nonnpa: number;
  retiree: number;
}



const statusStyles: Record<string, { label: string; color: string }> = {
  completed: { label: "Completed", color: "text-emerald-600 dark:text-emerald-400" },
  cancelled: { label: "Cancelled", color: "text-red-600 dark:text-red-400" },
  in_progress: { label: "In Progress", color: "text-amber-600 dark:text-amber-400" },
  scheduled: { label: "Scheduled", color: "text-blue-600 dark:text-blue-400" },
};

export default function VisitStatisticsReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("monthly");
  const [data, setData] = useState<VisitStatRow[]>([]);
  const emptySummary: VisitStatSummary = { completed: 0, cancelled: 0, in_progress: 0, scheduled: 0, total: 0, male: 0, female: 0, employee: 0, non_employee: 0, officer: 0, staff: 0, emp_dependent: 0, ret_dependent: 0, nonnpa: 0, retiree: 0 };
  const [summary, setSummary] = useState<VisitStatSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const setThisMonth = () => setViewMode("monthly");

  const setThisYear = () => setViewMode("annually");

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate);
      if (!range) {
        toast.error("Please select a valid date range");
        setIsLoading(false);
        return;
      }

      const groupBy = viewMode === 'daily' ? 'day' : 
                      viewMode === 'weekly' ? 'week' : 
                      viewMode === 'monthly' || viewMode === 'bimonthly' || viewMode === 'year' ? 'month' :
                      viewMode === 'quarterly' || viewMode === 'half-yearly' || viewMode === 'annually' ? 'month' : 'month';

      let url = `/reports/visit-statistics/?group_by=${groupBy}&start_date=${range.start}&end_date=${range.end}`;
      const response = await apiFetch<{ data: VisitStatRow[]; summary: VisitStatSummary }>(url);
      setData(response.data || []);
      setSummary(response.summary || emptySummary);
    } catch (error: any) {
      console.error("Error fetching visit statistics:", error);
      toast.error(error.message || "Failed to load visit statistics");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate);
    if (range) fetchReport();
  }, [year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }
    const headers = ["Period", "Completed", "Cancelled", "In Progress", "Scheduled", "Total", "Male", "Female", "Officer", "Staff", "Employee", "Emp Dependent", "Ret Dependent", "Non-NPA", "Retiree", "Non-Employee"];
    const rows = data.map(row => [row.period_label, row.completed, row.cancelled, row.in_progress, row.scheduled, row.total, row.male, row.female, row.officer, row.staff, row.employee, row.emp_dependent, row.ret_dependent, row.nonnpa, row.retiree, row.non_employee]);
    const csv = [
      headers.join(","),
      ...rows.map(row => row.join(",")),
      `TOTAL,${summary.completed},${summary.cancelled},${summary.in_progress},${summary.scheduled},${summary.total},${summary.male},${summary.female},${summary.officer},${summary.staff},${summary.employee},${summary.emp_dependent},${summary.ret_dependent},${summary.nonnpa},${summary.retiree},${summary.non_employee}`,
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate);
    const periodLabel = viewMode === 'year' ? year : (range ? `${range.start}_to_${range.end}` : 'custom');
    a.download = `visit_statistics_${periodLabel}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const summaryCards = [
    { key: "completed", label: "Completed", icon: CheckCircle, color: "text-emerald-500", border: "border-l-emerald-500", value: summary.completed },
    { key: "cancelled", label: "Cancelled", icon: XCircle, color: "text-red-500", border: "border-l-red-500", value: summary.cancelled },
    { key: "in_progress", label: "In Progress", icon: Clock, color: "text-amber-500", border: "border-l-amber-500", value: summary.in_progress },
    { key: "scheduled", label: "Scheduled", icon: Calendar, color: "text-blue-500", border: "border-l-blue-500", value: summary.scheduled },
    { key: "total", label: "Total Visits", icon: Activity, color: "text-slate-500", border: "border-l-slate-500", value: summary.total },
  ];

  const demogCards = [
    { key: "male", label: "Male", icon: Activity, color: "text-blue-500", border: "border-l-blue-500", value: summary.male },
    { key: "female", label: "Female", icon: Activity, color: "text-pink-500", border: "border-l-pink-500", value: summary.female },
    { key: "officer", label: "Officer", icon: Activity, color: "text-violet-500", border: "border-l-violet-500", value: summary.officer },
    { key: "staff", label: "Staff", icon: Activity, color: "text-indigo-500", border: "border-l-indigo-500", value: summary.staff },
    { key: "employee", label: "Employee", icon: Activity, color: "text-purple-500", border: "border-l-purple-500", value: summary.employee },
    { key: "emp_dependent", label: "Emp Dependent", icon: Activity, color: "text-cyan-500", border: "border-l-cyan-500", value: summary.emp_dependent },
    { key: "ret_dependent", label: "Ret Dependent", icon: Activity, color: "text-teal-500", border: "border-l-teal-500", value: summary.ret_dependent },
    { key: "nonnpa", label: "Non-NPA", icon: Activity, color: "text-orange-500", border: "border-l-orange-500", value: summary.nonnpa },
    { key: "retiree", label: "Retiree", icon: Activity, color: "text-rose-500", border: "border-l-rose-500", value: summary.retiree },
    { key: "non_employee", label: "Non-Employee", icon: Activity, color: "text-stone-500", border: "border-l-stone-500", value: summary.non_employee },
  ];

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        backLink={{ href: "/medical-records/reports", label: "Back to reports" }}
        reportTitle="Visit Statistics"
        reportDescription="Visit records by status and time period"
        ReportIcon={Activity}
        reportIconClassName="text-purple-500"
        loading={isLoading}
        onRefresh={fetchReport}
        onGenerate={fetchReport}
        exportCsvDisabled={data.length === 0}
        onExportCsv={exportToCSV}
        printDisabled={data.length === 0}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        year={year}
        onYearChange={setYear}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onThisMonth={() => setViewMode("monthly")}
        onThisYear={() => setViewMode("annually")}
        highlightThisMonth={viewMode === "monthly"}
        highlightThisYear={viewMode === "annually"}
        hideQuickButtons
        yearOptions={years}
      >
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          {summaryCards.map((card) => (
            <Card key={card.key} className={`border-l-4 ${card.border}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{card.label}</p>
                    <p className="text-2xl sm:text-3xl font-bold">{card.value.toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {summary.total > 0 ? `${((card.value / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                    </p>
                  </div>
                  <card.icon className={`h-10 w-10 ${card.color} opacity-50`} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Demographic Summary Cards */}
        <div className="grid gap-4 grid-cols-2 sm:grid-cols-5 md:grid-cols-5 lg:grid-cols-10">
          {demogCards.map((card) => (
            <Card key={card.key} className={`border-l-4 ${card.border}`}>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">{card.label}</p>
                <p className="text-lg sm:text-xl font-bold">{card.value.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {summary.total > 0 ? `${((card.value / summary.total) * 100).toFixed(1)}%` : "0%"}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Status Table */}
        <Card>
          <CardHeader>
            <CardTitle>Visit Records</CardTitle>
            <CardDescription>
              {viewMode === 'daily' ? 'Daily' : viewMode === 'weekly' ? 'Weekly' : 'Monthly'} breakdown by status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading visit statistics...</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No visit data found for the selected period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Period</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Completed</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Cancelled</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">In Progress</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Scheduled</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row, i) => (
                      <tr key={row.period} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{row.period_label}</td>
                        <td className={`p-3 text-right ${statusStyles.completed.color}`}>{row.completed.toLocaleString()}</td>
                        <td className={`p-3 text-right ${statusStyles.cancelled.color}`}>{row.cancelled.toLocaleString()}</td>
                        <td className={`p-3 text-right ${statusStyles.in_progress.color}`}>{row.in_progress.toLocaleString()}</td>
                        <td className={`p-3 text-right ${statusStyles.scheduled.color}`}>{row.scheduled.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                      <td className="p-3 text-foreground">TOTAL</td>
                      <td className={`p-3 text-right ${statusStyles.completed.color}`}>{summary.completed.toLocaleString()}</td>
                      <td className={`p-3 text-right ${statusStyles.cancelled.color}`}>{summary.cancelled.toLocaleString()}</td>
                      <td className={`p-3 text-right ${statusStyles.in_progress.color}`}>{summary.in_progress.toLocaleString()}</td>
                      <td className={`p-3 text-right ${statusStyles.scheduled.color}`}>{summary.scheduled.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Demographic Breakdown Table */}
        <Card>
          <CardHeader>
            <CardTitle>Demographic Breakdown</CardTitle>
            <CardDescription>
              {viewMode === 'daily' ? 'Daily' : viewMode === 'weekly' ? 'Weekly' : 'Monthly'} breakdown by patient category
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading demographic breakdown...</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No demographic data found for the selected period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Period</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Officer</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Staff</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Emp Dep</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Ret Dep</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Non-NPA</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Retiree</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Non-Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.period} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 font-medium text-foreground">{row.period_label}</td>
                        <td className="p-3 text-right text-blue-600 dark:text-blue-400">{row.male.toLocaleString()}</td>
                        <td className="p-3 text-right text-pink-600 dark:text-pink-400">{row.female.toLocaleString()}</td>
                        <td className="p-3 text-right text-violet-600 dark:text-violet-400">{row.officer.toLocaleString()}</td>
                        <td className="p-3 text-right text-indigo-600 dark:text-indigo-400">{row.staff.toLocaleString()}</td>
                        <td className="p-3 text-right text-purple-600 dark:text-purple-400">{row.employee.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{row.emp_dependent.toLocaleString()}</td>
                        <td className="p-3 text-right text-teal-600 dark:text-teal-400">{row.ret_dependent.toLocaleString()}</td>
                        <td className="p-3 text-right text-orange-600 dark:text-orange-400">{row.nonnpa.toLocaleString()}</td>
                        <td className="p-3 text-right text-rose-600 dark:text-rose-400">{row.retiree.toLocaleString()}</td>
                        <td className="p-3 text-right text-stone-600 dark:text-stone-400">{row.non_employee.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                      <td className="p-3 text-foreground">TOTAL</td>
                      <td className="p-3 text-right text-blue-600 dark:text-blue-400">{summary.male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{summary.female.toLocaleString()}</td>
                      <td className="p-3 text-right text-violet-600 dark:text-violet-400">{summary.officer.toLocaleString()}</td>
                      <td className="p-3 text-right text-indigo-600 dark:text-indigo-400">{summary.staff.toLocaleString()}</td>
                      <td className="p-3 text-right text-purple-600 dark:text-purple-400">{summary.employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{summary.emp_dependent.toLocaleString()}</td>
                      <td className="p-3 text-right text-teal-600 dark:text-teal-400">{summary.ret_dependent.toLocaleString()}</td>
                      <td className="p-3 text-right text-orange-600 dark:text-orange-400">{summary.nonnpa.toLocaleString()}</td>
                      <td className="p-3 text-right text-rose-600 dark:text-rose-400">{summary.retiree.toLocaleString()}</td>
                      <td className="p-3 text-right text-stone-600 dark:text-stone-400">{summary.non_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}
