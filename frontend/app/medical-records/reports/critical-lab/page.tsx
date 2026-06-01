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
  AlertTriangle,
  Calendar,
  FlaskConical,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

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
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [data, setData] = useState<CriticalLab | null>(null);
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
      const url = `/reports/critical-lab/?start_date=${range.start}&end_date=${range.end}`;
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
    if (!data || data.items.length === 0) {
      toast.error("No data to export");
      return;
    }
    const lines = [
      "Created At,Patient ID,Patient Name,Test,Test Code,Priority,Order ID",
      ...data.items.map((i) =>
        [
          i.created_at || "",
          i.patient_id,
          `"${(i.patient_name || "").replace(/"/g, '""')}"`,
          `"${(i.test_name || "").replace(/"/g, '""')}"`,
          i.test_code,
          i.priority,
          i.order_id,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : "unknown";
    a.download = `critical_lab_${period}.csv`;
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
              <AlertTriangle className="h-8 w-8 text-red-500" />
              Critical Lab Results
            </h1>
            <p className="text-muted-foreground mt-1">
              Verified lab results flagged critical in {periodLabel}
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
                              {i.created_at ? new Date(i.created_at).toLocaleString() : "—"}
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
