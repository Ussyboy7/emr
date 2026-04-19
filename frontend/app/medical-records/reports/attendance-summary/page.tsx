"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RefreshCw, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";

interface AttendanceData {
  sn: number;
  category: string;
  employee: number;
  non_employee: number;
  male: number;
  female: number;
  total: number;
  percentage: number;
}

interface AttendanceSummary {
  total_employee: number;
  total_non_employee: number;
  total_male: number;
  total_female: number;
  grand_total: number;
  new_registrations: number;
  first_time_patients: number;
  returning_patients: number;
  total_unique_patients_seen: number;
  total_visits: number;
}

export default function AttendanceSummaryReport() {
  const [data, setData] = useState<AttendanceData[]>([]);
  const emptySummary: AttendanceSummary = {
    total_employee: 0,
    total_non_employee: 0,
    total_male: 0,
    total_female: 0,
    grand_total: 0,
    new_registrations: 0,
    first_time_patients: 0,
    returning_patients: 0,
    total_unique_patients_seen: 0,
    total_visits: 0,
  };
  const [summary, setSummary] = useState<AttendanceSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);
  
  // Filters
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("year");
  
  // Quick filters
  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
    setViewMode("range");
  };
  
  const setThisYear = () => {
    setYear(new Date().getFullYear().toString());
    setViewMode("year");
  };

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      let url = '/reports/attendance-summary/?';
      
      if (viewMode === 'year') {
        url += `year=${year}`;
      } else {
        if (startDate && endDate) {
          url += `start_date=${startDate}&end_date=${endDate}`;
        } else {
          toast.error("Please select both start and end dates");
          setIsLoading(false);
          return;
        }
      }

      const response = await apiFetch<{ data: AttendanceData[]; summary: AttendanceSummary }>(url);
      setData(response.data || []);
      setSummary(response.summary || emptySummary);
    } catch (error: any) {
      console.error("Error fetching report:", error);
      toast.error(error.message || "Failed to load attendance report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Fetch when active filter values change
    if (viewMode === 'year' && year) {
      fetchReport();
    } else if (viewMode === 'range' && startDate && endDate) {
      fetchReport();
    }
  }, [startDate, endDate, year, viewMode]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["S/N", "Category", "Male", "Female", "Total", "%"];
    const rows = data.map(row => [
      row.sn,
      row.category,
      row.male,
      row.female,
      row.total,
      `${row.percentage}%`
    ]);
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `TOTAL,,${summary.total_male},${summary.total_female},${summary.grand_total},100%`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const period = viewMode === 'year' ? year : `${startDate}_to_${endDate}`;
    a.download = `attendance_summary_${period}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const highlightThisMonth =
    viewMode === "range" &&
    Boolean(startDate) &&
    startDate.includes(new Date().toISOString().slice(0, 7));
  const highlightThisYear = viewMode === "year" && year === new Date().getFullYear().toString();

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        backLink={{ href: "/medical-records/reports", label: "Back to reports" }}
        reportTitle="Attendance Summary Report"
        reportDescription="Patient attendance by category"
        ReportIcon={Users}
        reportIconClassName="text-blue-500"
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
        onThisMonth={setThisMonth}
        onThisYear={setThisYear}
        highlightThisMonth={highlightThisMonth}
        highlightThisYear={highlightThisYear}
        yearOptions={years}
      >
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Employee</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_employee / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Non-Employee</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_non_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_non_employee / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Male</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_male.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_male / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-cyan-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-pink-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Female</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_female.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_female / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-pink-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">New Registrations</p>
              <p className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">{summary.new_registrations.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">New patient records created in selected period (not attendance count)</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-slate-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Returning Patients</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-700 dark:text-slate-300">{summary.returning_patients.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Seen this period with prior visit history</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Total Visit Records</p>
              <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">{summary.total_visits.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Includes repeat visits by the same patient</p>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle>Attendance by Category</CardTitle>
            <CardDescription>Breakdown of patient attendance by category</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading attendance data...</p>
              </div>
            ) : data.length === 0 ? (
              <div className="text-center py-12">
                <Users className="h-8 w-8 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No attendance data found for the selected period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Category</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.category}</td>
                        <td className="p-3 text-right text-foreground">{row.male.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.female.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                      <td className="p-3 text-foreground" colSpan={2}>TOTAL</td>
                      <td className="p-3 text-right text-foreground">{summary.total_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.grand_total.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
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
