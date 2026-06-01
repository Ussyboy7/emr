"use client";

import React, { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  ArrowLeft,
  Printer,
  Stethoscope,
  Calendar,
  TrendingUp,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

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
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [data, setData] = useState<StaffProductivity | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
      if (!range) {
        toast.error("Please select a valid date range");
        setIsLoading(false);
        return;
      }
      const url = `/reports/staff-productivity/?start_date=${range.start}&end_date=${range.end}`;
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
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    if (range) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode]);

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const periodLabel = useMemo(() => {
    if (viewMode === "year") return String(year);
    if (startDate && endDate) return `${startDate} — ${endDate}`;
    return "selected period";
  }, [viewMode, year, startDate, endDate]);

  const exportToCSV = () => {
    if (!data || data.data.length === 0) {
      toast.error("No data to export");
      return;
    }
    const lines = [
      "Doctor,Specialization,Total Visits,Completed,In Progress,Cancelled,Completion Rate %",
      ...data.data.map((r) =>
        [
          `"${(r.doctor_name || "").replace(/"/g, '""')}"`,
          `"${(r.specialization || "").replace(/"/g, '""')}"`,
          r.total_visits,
          r.completed,
          r.in_progress,
          r.cancelled,
          r.completion_rate,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : "unknown";
    a.download = `staff_productivity_${period}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
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
              <Stethoscope className="h-8 w-8 text-emerald-500" />
              Staff Productivity
            </h1>
            <p className="text-muted-foreground mt-1">
              Medical doctor visit throughput for {periodLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV} disabled={!data}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
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
              <div>
                <Label>View Mode</Label>
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half-yearly">Half-yearly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                    <SelectItem value="year">By Year</SelectItem>
                    <SelectItem value="range">Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {viewMode === "year" ? (
                <div>
                  <Label>Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map((y) => (
                        <SelectItem key={y} value={y}>
                          {y}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : viewMode === "range" ? (
                <>
                  <div>
                    <Label>Start Date</Label>
                    <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                  </div>
                </>
              ) : (
                <div className="col-span-2">
                  <Label>Period</Label>
                  <p className="text-sm text-muted-foreground">
                    {viewMode === "monthly" && "This month"}
                    {viewMode === "quarterly" && "This quarter"}
                    {viewMode === "half-yearly" && "This half-year"}
                    {viewMode === "annually" && "This year"}
                  </p>
                </div>
              )}
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
