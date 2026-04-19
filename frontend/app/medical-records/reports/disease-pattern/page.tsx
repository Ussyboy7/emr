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
  TrendingUp,
  Printer,
  Activity,
  Users,
  Calendar,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface DiseaseData {
  sn: number;
  diagnosis: string;
  code?: string;
  description?: string;
  employee: number;
  non_employee: number;
  male: number;
  female: number;
  gender_other: number;
  total: number;
}

const emptySummary = {
  total_employee: 0,
  total_non_employee: 0,
  grand_total: 0,
  total_male: 0,
  total_female: 0,
  total_gender_other: 0,
};

type SummaryState = typeof emptySummary;

export default function DiseasePatternReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<"year" | "range">("year");
  const [data, setData] = useState<DiseaseData[]>([]);
  const [summary, setSummary] = useState<SummaryState>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const periodLabel = useMemo(() => {
    if (viewMode === "year") return String(year);
    if (startDate && endDate) return `${startDate} — ${endDate}`;
    return "selected period";
  }, [viewMode, year, startDate, endDate]);

  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(firstDay.toISOString().split("T")[0]);
    setEndDate(lastDay.toISOString().split("T")[0]);
    setViewMode("range");
  };

  const setThisYear = () => {
    setYear(new Date().getFullYear().toString());
    setViewMode("year");
  };

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      let url = "/reports/disease-pattern/?";
      if (viewMode === "year") {
        url += `year=${year}`;
      } else if (startDate && endDate) {
        url += `start_date=${startDate}&end_date=${endDate}`;
      } else {
        toast.error("Please select both start and end dates");
        setIsLoading(false);
        return;
      }

      const response = await apiFetch<{ data: DiseaseData[]; summary: Partial<SummaryState> }>(url);
      setData(response.data || []);
      setSummary({ ...emptySummary, ...(response.summary || {}) });
    } catch (error: any) {
      console.error("Error fetching disease pattern:", error);
      toast.error(error.message || "Failed to load disease pattern report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "year" && year) {
      fetchReport();
    } else if (viewMode === "range" && startDate && endDate) {
      fetchReport();
    }
  }, [year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = [
      "S/N",
      "ICD-10 Diagnosis",
      "Employee",
      "Non-Employee",
      "Male",
      "Female",
      "Other gender",
      "Total",
    ];
    const rows = data.map((row) => [
      row.sn,
      `"${String(row.diagnosis).replace(/"/g, '""')}"`,
      row.employee,
      row.non_employee,
      row.male ?? 0,
      row.female ?? 0,
      row.gender_other ?? 0,
      row.total,
    ]);

    const csv = [
      headers.join(","),
      ...rows.map((row) => row.join(",")),
      [
        "TOTAL",
        "",
        summary.total_employee,
        summary.total_non_employee,
        summary.total_male,
        summary.total_female,
        summary.total_gender_other,
        summary.grand_total,
      ].join(","),
    ].join("\n");

    const blob = new Blob([csv], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const period = viewMode === "year" ? year : `${startDate}_to_${endDate}`;
    a.download = `disease_pattern_${period}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);

    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

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
              <Activity className="h-8 w-8 text-red-500" />
              Disease Pattern Report
            </h1>
            <p className="text-muted-foreground mt-1">
              Top ICD-10 diagnoses with employee / non-employee and male / female / other gender counts
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV} disabled={data.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={data.length === 0}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        <div className="flex gap-2 print:hidden">
          <Button
            variant={
              viewMode === "range" && startDate.includes(new Date().toISOString().slice(0, 7))
                ? "default"
                : "outline"
            }
            onClick={setThisMonth}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Month
          </Button>
          <Button
            variant={viewMode === "year" && year === new Date().getFullYear().toString() ? "default" : "outline"}
            onClick={setThisYear}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Year
          </Button>
        </div>

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Adjust date range for detailed reporting</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>View Mode</Label>
                <Select value={viewMode} onValueChange={(value: "year" | "range") => setViewMode(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              ) : (
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
              )}
              <div className="flex items-end">
                <Button onClick={fetchReport} className="w-full" disabled={isLoading}>
                  <TrendingUp className="h-4 w-4 mr-2" />
                  {isLoading ? "Loading..." : "Generate Report"}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Employee cases</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0
                      ? `${((summary.total_employee / summary.grand_total) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of total (category)
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
                  <p className="text-sm text-muted-foreground">Non-employee cases</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_non_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0
                      ? `${((summary.total_non_employee / summary.grand_total) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of total (category)
                  </p>
                </div>
                <Users className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total diagnosis lines</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.grand_total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Sum of counts in selected period</p>
                </div>
                <Activity className="h-10 w-10 text-rose-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Male (gender)</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_male.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0
                      ? `${((summary.total_male / summary.grand_total) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of total lines
                  </p>
                </div>
                <Users className="h-10 w-10 text-sky-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-fuchsia-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Female (gender)</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_female.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0
                      ? `${((summary.total_female / summary.grand_total) * 100).toFixed(1)}%`
                      : "0%"}{" "}
                    of total lines
                  </p>
                </div>
                <Users className="h-10 w-10 text-fuchsia-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Other / unknown gender</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_gender_other.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Residual vs male+female on same lines</p>
                </div>
                <Users className="h-10 w-10 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              ICD-10 diagnoses — {periodLabel}
            </CardTitle>
            <CardDescription>Diagnosis frequency from completed consultations (structured ICD-10)</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 font-medium text-muted-foreground">ICD-10 diagnosis</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Employee</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Non-emp.</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Other</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.diagnosis}</td>
                        <td className="p-3 text-right text-foreground">{(row.employee ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{(row.non_employee ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{(row.male ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{(row.female ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{(row.gender_other ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">
                          {summary.grand_total > 0
                            ? `${((row.total / summary.grand_total) * 100).toFixed(1)}%`
                            : "0.0%"}
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">
                        TOTAL
                      </td>
                      <td className="p-3 text-right text-foreground">{summary.total_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_non_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_gender_other.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.grand_total.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No diagnosis records found for this period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
