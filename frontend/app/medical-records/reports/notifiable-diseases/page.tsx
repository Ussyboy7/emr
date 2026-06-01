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
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

interface NotifiableItem {
  id: number;
  patient_id: string;
  patient_name: string;
  icd10_code: string;
  icd10_description: string;
  disease_label: string;
  status: string;
  certainty: string;
  diagnosed_by: string;
  diagnosed_at: string | null;
}

interface NotifiableDiseases {
  total: number;
  items: NotifiableItem[];
}

export default function NotifiableDiseasesReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [data, setData] = useState<NotifiableDiseases | null>(null);
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
      const url = `/reports/notifiable-diseases/?start_date=${range.start}&end_date=${range.end}`;
      const response = await apiFetch<NotifiableDiseases>(url);
      setData(response);
    } catch (error: any) {
      console.error("Error fetching notifiable diseases:", error);
      toast.error(error.message || "Failed to load notifiable diseases");
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

  // Aggregate by disease label for a summary block
  const byDisease = useMemo(() => {
    if (!data) return [] as { disease: string; count: number }[];
    const map: Record<string, number> = {};
    for (const i of data.items) {
      map[i.disease_label] = (map[i.disease_label] || 0) + 1;
    }
    return Object.entries(map)
      .map(([disease, count]) => ({ disease, count }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  const exportToCSV = () => {
    if (!data || data.items.length === 0) {
      toast.error("No data to export");
      return;
    }
    const lines = [
      "Diagnosed At,Patient ID,Patient Name,ICD-10 Code,Description,Disease,Status,Certainty,Diagnosed By",
      ...data.items.map((i) =>
        [
          i.diagnosed_at || "",
          i.patient_id,
          `"${(i.patient_name || "").replace(/"/g, '""')}"`,
          i.icd10_code,
          `"${(i.icd10_description || "").replace(/"/g, '""')}"`,
          i.disease_label,
          i.status,
          i.certainty,
          `"${(i.diagnosed_by || "").replace(/"/g, '""')}"`,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : "unknown";
    a.download = `notifiable_diseases_${period}.csv`;
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
              Notifiable Diseases
            </h1>
            <p className="text-muted-foreground mt-1">
              Diagnoses matching Nigeria NCDC immediately-notifiable disease categories — {periodLabel}
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
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total notifiable cases</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.total.toLocaleString()}</p>
                    </div>
                    <AlertTriangle className="h-10 w-10 text-red-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Distinct diseases</p>
                      <p className="text-2xl sm:text-3xl font-bold">{byDisease.length.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground mt-1">In the result window</p>
                    </div>
                    <Activity className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-violet-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Top disease</p>
                      <p className="text-2xl font-bold truncate">{byDisease[0]?.disease || "—"}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        {byDisease[0]?.count || 0} case{byDisease[0]?.count === 1 ? "" : "s"}
                      </p>
                    </div>
                    <Activity className="h-10 w-10 text-violet-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {byDisease.length > 0 && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By disease</CardTitle>
                  <CardDescription>Aggregated from the result set (max 500 cases)</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                    {byDisease.map((d) => (
                      <div
                        key={d.disease}
                        className="flex items-center justify-between border border-border rounded-md px-3 py-2"
                      >
                        <span className="text-sm truncate">{d.disease}</span>
                        <span className="text-sm font-bold ml-2">{d.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Case detail</CardTitle>
                <CardDescription>
                  {data.items.length === 0
                    ? "No notifiable cases in this period"
                    : `${data.items.length} case${data.items.length === 1 ? "" : "s"} (capped at 500)`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.items.length === 0 ? (
                  <div className="text-center py-12">
                    <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">No notifiable cases in this period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Diagnosed</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Patient</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Disease</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">ICD-10</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Status</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">By</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((i) => (
                          <tr key={i.id} className="border-b border-border hover:bg-muted/30">
                            <td className="p-2 text-xs">
                              {i.diagnosed_at ? new Date(i.diagnosed_at).toLocaleDateString() : "—"}
                            </td>
                            <td className="p-2">
                              <div className="font-medium">{i.patient_name || "—"}</div>
                              <div className="text-xs text-muted-foreground font-mono">{i.patient_id}</div>
                            </td>
                            <td className="p-2 font-medium">{i.disease_label}</td>
                            <td className="p-2 font-mono text-xs">
                              <div>{i.icd10_code}</div>
                              <div className="text-muted-foreground truncate max-w-[200px]" title={i.icd10_description}>
                                {i.icd10_description}
                              </div>
                            </td>
                            <td className="p-2 capitalize">{i.status}</td>
                            <td className="p-2 text-muted-foreground text-xs">{i.diagnosed_by || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-900">
              <CardContent className="p-4 text-sm text-amber-900 dark:text-amber-200">
                <p className="font-semibold mb-1">Public health reporting</p>
                <p>
                  These cases match ICD-10 prefixes from the Nigeria NCDC immediately-notifiable list
                  (Cholera, Yellow fever, Lassa, Ebola, Meningococcal disease, Anthrax, Plague,
                  Tuberculosis, Polio, Dengue, Measles, Monkeypox, COVID-19, viral hepatitis, malaria).
                  Confirm and report per your local disease surveillance protocol.
                </p>
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
