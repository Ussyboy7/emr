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
  UserPlus,
  Calendar,
  TrendingUp,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

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
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [data, setData] = useState<NewRegs | null>(null);
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
      const url = `/reports/new-registrations/?start_date=${range.start}&end_date=${range.end}`;
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

  const exportToCSV = () => {
    if (!data) {
      toast.error("No data to export");
      return;
    }
    const lines: string[] = [];
    lines.push("Section,Key,Count");
    lines.push(`Summary,Total new registrations,${data.total}`);
    Object.entries(data.by_category || {}).forEach(([k, v]) => {
      lines.push(`By Category,${CATEGORY_LABELS[k] || k},${v}`);
    });
    lines.push("");
    lines.push("Date,Total,Employee,Retiree,Dependent,Non-NPA");
    dailyTotals.forEach((d) => {
      lines.push(
        `${d.date},${d.total},${d.by_cat.employee || 0},${d.by_cat.retiree || 0},${d.by_cat.dependent || 0},${d.by_cat.nonnpa || 0}`,
      );
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : "unknown";
    a.download = `new_registrations_${period}.csv`;
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
              <UserPlus className="h-8 w-8 text-emerald-500" />
              New Patient Registrations
            </h1>
            <p className="text-muted-foreground mt-1">
              Patients registered in {periodLabel}
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
