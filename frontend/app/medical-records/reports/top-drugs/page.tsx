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
  Pill,
  TrendingUp,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

interface TopDrugRow {
  sn: number;
  drug_name: string;
  total_quantity: number;
  prescription_count: number;
  percentage: number;
}

interface TopDrugs {
  total_lines: number;
  limit: number;
  data: TopDrugRow[];
}

export default function TopDrugsReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [limit, setLimit] = useState("20");
  const [data, setData] = useState<TopDrugs | null>(null);
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
      const lim = parseInt(limit, 10);
      if (Number.isNaN(lim) || lim < 1 || lim > 200) {
        toast.error("Limit must be between 1 and 200");
        setIsLoading(false);
        return;
      }
      const url = `/reports/top-drugs/?start_date=${range.start}&end_date=${range.end}&limit=${lim}`;
      const response = await apiFetch<TopDrugs>(url);
      setData(response);
    } catch (error: any) {
      console.error("Error fetching top drugs:", error);
      toast.error(error.message || "Failed to load top prescribed drugs");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    if (range) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year, startDate, endDate, viewMode, limit]);

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
      "S/N,Drug Name,Total Quantity,Prescription Count,% of Lines",
      ...data.data.map((r) =>
        [
          r.sn,
          `"${(r.drug_name || "").replace(/"/g, '""')}"`,
          r.total_quantity,
          r.prescription_count,
          `${r.percentage}%`,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : "unknown";
    a.download = `top_drugs_${period}.csv`;
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
              <Pill className="h-8 w-8 text-violet-500" />
              Top Prescribed Drugs
            </h1>
            <p className="text-muted-foreground mt-1">
              Most-prescribed medications in {periodLabel}
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
            <CardDescription>Adjust date range and result limit</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div>
                <Label>View Mode</Label>
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
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
                    {viewMode === "annually" && "This year"}
                  </p>
                </div>
              )}
              <div>
                <Label>Top N</Label>
                <Input
                  type="number"
                  min={1}
                  max={200}
                  value={limit}
                  onChange={(e) => setLimit(e.target.value)}
                />
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
              <Card className="border-l-4 border-l-violet-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total prescription lines</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.total_lines.toLocaleString()}</p>
                    </div>
                    <Pill className="h-10 w-10 text-violet-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-sky-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Unique drugs in top N</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.data.length.toLocaleString()}</p>
                    </div>
                    <TrendingUp className="h-10 w-10 text-sky-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-emerald-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Top drug share</p>
                      <p className="text-2xl sm:text-3xl font-bold">
                        {data.data.length > 0 ? `${data.data[0].percentage}%` : "—"}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1 truncate">
                        {data.data[0]?.drug_name || ""}
                      </p>
                    </div>
                    <Pill className="h-10 w-10 text-emerald-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top {data.data.length} drugs — {periodLabel}</CardTitle>
                <CardDescription>
                  Sorted by distinct prescription count, then total quantity
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.data.length === 0 ? (
                  <div className="text-center py-12">
                    <Pill className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">No prescriptions in this period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">S/N</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Drug</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Total Qty</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Prescriptions</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">% of lines</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.data.map((r) => (
                          <tr key={r.sn} className="border-b border-border hover:bg-muted/30">
                            <td className="p-2">{r.sn}</td>
                            <td className="p-2 font-medium">{r.drug_name}</td>
                            <td className="p-2 text-right">{r.total_quantity.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.prescription_count.toLocaleString()}</td>
                            <td className="p-2 text-right">{r.percentage.toFixed(1)}%</td>
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
              <Pill className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
