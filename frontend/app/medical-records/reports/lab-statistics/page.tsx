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
  FlaskConical,
  Calendar,
  TrendingUp,
  CheckCircle2,
  Clock,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

interface LabStatistics {
  total_orders: number;
  by_priority: Record<string, number>;
  by_status: Record<string, number>;
  tests_completed: number;
  tests_pending: number;
}

const PRIORITY_LABELS: Record<string, string> = {
  routine: "Routine",
  urgent: "Urgent",
  stat: "STAT",
  emergency: "Emergency",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  sample_collected: "Sample collected",
  processing: "Processing",
  results_ready: "Results ready",
  verified: "Verified",
  cancelled: "Cancelled",
  rejected: "Rejected",
};

export default function LabStatisticsReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [data, setData] = useState<LabStatistics | null>(null);
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
      const url = `/reports/lab-statistics/?start_date=${range.start}&end_date=${range.end}`;
      const response = await apiFetch<LabStatistics>(url);
      setData(response);
    } catch (error: any) {
      console.error("Error fetching lab statistics:", error);
      toast.error(error.message || "Failed to load lab statistics");
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
    if (!data) {
      toast.error("No data to export");
      return;
    }
    const lines: string[] = [];
    lines.push("Section,Key,Count");
    lines.push(`Summary,Total orders,${data.total_orders}`);
    lines.push(`Summary,Tests completed,${data.tests_completed}`);
    lines.push(`Summary,Tests pending,${data.tests_pending}`);
    Object.entries(data.by_priority || {}).forEach(([k, v]) => {
      lines.push(`Priority,${PRIORITY_LABELS[k] || k},${v}`);
    });
    Object.entries(data.by_status || {}).forEach(([k, v]) => {
      lines.push(`Status,${STATUS_LABELS[k] || k},${v}`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : "unknown";
    a.download = `lab_statistics_${period}.csv`;
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
              <FlaskConical className="h-8 w-8 text-pink-500" />
              Lab Statistics
            </h1>
            <p className="text-muted-foreground mt-1">
              Lab order volume, priority, and status distribution for {periodLabel}
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
            <CardDescription>Adjust date range for detailed reporting</CardDescription>
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
              <Card className="border-l-4 border-l-pink-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total lab orders</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.total_orders.toLocaleString()}</p>
                    </div>
                    <FlaskConical className="h-10 w-10 text-pink-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Tests completed</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.tests_completed.toLocaleString()}</p>
                    </div>
                    <CheckCircle2 className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Tests pending</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.tests_pending.toLocaleString()}</p>
                    </div>
                    <Clock className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    By priority
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Priority</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.by_priority || {}).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-muted-foreground">No orders in this period</td>
                        </tr>
                      ) : (
                        Object.entries(data.by_priority || {}).map(([k, v]) => (
                          <tr key={k} className="border-b border-border">
                            <td className="p-2">{PRIORITY_LABELS[k] || k}</td>
                            <td className="p-2 text-right">{v.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingUp className="h-4 w-4" />
                    By status
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.by_status || {}).length === 0 ? (
                        <tr>
                          <td colSpan={2} className="p-4 text-center text-muted-foreground">No tests in this period</td>
                        </tr>
                      ) : (
                        Object.entries(data.by_status || {}).map(([k, v]) => (
                          <tr key={k} className="border-b border-border">
                            <td className="p-2">{STATUS_LABELS[k] || k}</td>
                            <td className="p-2 text-right">{v.toLocaleString()}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FlaskConical className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
