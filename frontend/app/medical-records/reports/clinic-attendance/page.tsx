"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  Building, Printer, Calendar 
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { useOutpatientClinicTypes } from "@/lib/hooks/use-outpatient-clinic-types";

interface CategoryData {
  sn: number;
  category: string;
  male: number;
  female: number;
  total: number;
  percentage: number;
}

interface ClinicAttendanceSummary {
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

export default function ClinicAttendanceReport() {
  const { types: opdClinicTypes, names: opdClinicNames } = useOutpatientClinicTypes();
  const [selectedClinic, setSelectedClinic] = useState("");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<"year" | "range">("year");
  const [data, setData] = useState<CategoryData[]>([]);
  const emptySummary: ClinicAttendanceSummary = {
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
  const [summary, setSummary] = useState<ClinicAttendanceSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const toNumber = (value: unknown, fallback = 0): number => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : fallback;
    }
    return fallback;
  };

  const normalizeCategoryRows = (rows: any[]): CategoryData[] => {
    if (!Array.isArray(rows)) return [];
    return rows.map((row: any, index: number) => {
      const male = toNumber(row?.male, 0);
      const female = toNumber(row?.female, 0);
      const total = toNumber(row?.total, male + female);
      const percentage = toNumber(row?.percentage, 0);
      return {
        sn: toNumber(row?.sn, index + 1),
        // Backward-compatible: old payload used "month"; new payload uses "category".
        category: String(row?.category || row?.month || `Row ${index + 1}`),
        male,
        female,
        total,
        percentage,
      };
    });
  };

  const normalizeSummary = (raw: Partial<ClinicAttendanceSummary> | undefined): ClinicAttendanceSummary => {
    if (!raw) return emptySummary;
    return {
      total_employee: toNumber(raw.total_employee, 0),
      total_non_employee: toNumber(raw.total_non_employee, 0),
      total_male: toNumber(raw.total_male, 0),
      total_female: toNumber(raw.total_female, 0),
      grand_total: toNumber(raw.grand_total, 0),
      new_registrations: toNumber(raw.new_registrations, 0),
      first_time_patients: toNumber(raw.first_time_patients, 0),
      returning_patients: toNumber(raw.returning_patients, 0),
      total_unique_patients_seen: toNumber(raw.total_unique_patients_seen, 0),
      total_visits: toNumber(raw.total_visits, 0),
    };
  };

  useEffect(() => {
    if (opdClinicTypes.length === 0) return;
    const names = opdClinicTypes.map((t) => t.name);
    setSelectedClinic((prev) => {
      if (prev && names.includes(prev)) return prev;
      return names[0];
    });
  }, [opdClinicTypes]);

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
    if (!selectedClinic) return;
    setIsLoading(true);
    try {
      let url = `/reports/clinic-attendance/?clinic_type=${encodeURIComponent(selectedClinic)}`;
      
      if (viewMode === 'year') {
        url += `&year=${year}`;
      } else if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }

      const response = await apiFetch<{ data: any[]; summary: Partial<ClinicAttendanceSummary> }>(url);
      setData(normalizeCategoryRows(response.data || []));
      setSummary(normalizeSummary(response.summary));
    } catch (error: any) {
      console.error("Error fetching clinic report:", error);
      toast.error(error.message || "Failed to load clinic report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setThisMonth();
  }, []);

  useEffect(() => {
    if (!selectedClinic) return;
    if ((viewMode === 'range' && startDate && endDate) || viewMode === 'year') {
      fetchReport();
    }
  }, [selectedClinic, year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["S/N", "Category", "Male", "Female", "Total", "%"];
    const rows = data.map(row => [row.sn, row.category, row.male, row.female, row.total, `${row.percentage}%`]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `TOTAL,,${summary.total_male},${summary.total_female},${summary.grand_total},100.0%`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedClinic}_clinic_${year}.csv`;
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
              <Building className="h-8 w-8 text-green-500" />
              Clinic Attendance Report
            </h1>
            <p className="text-muted-foreground mt-1">Specialized clinic attendance by category</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
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
            variant={viewMode === "range" && startDate.includes(new Date().toISOString().slice(0,7)) ? "default" : "outline"}
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
              <Building className="h-5 w-5" />
              Clinic & Date Filters
            </CardTitle>
            <CardDescription>Select clinic and time period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Clinic Type</Label>
                <Select value={selectedClinic} onValueChange={setSelectedClinic}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {opdClinicNames.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>View Mode</Label>
                <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">By Year</SelectItem>
                    <SelectItem value="range">Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {viewMode === 'year' ? (
                <div>
                  <Label>Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : (
                <>
                  <div>
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Employee</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{summary.total_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_employee / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Building className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Non-Employee</p>
                  <p className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">{summary.total_non_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_non_employee / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Building className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-l-4 border-l-indigo-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">First-Time to Clinic</p>
              <p className="text-2xl sm:text-3xl font-bold text-indigo-600 dark:text-indigo-400">{summary.first_time_patients.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Earliest visit to this clinic in period</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">New Registrations</p>
              <p className="text-2xl sm:text-3xl font-bold text-cyan-600 dark:text-cyan-400">{summary.new_registrations.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Patients seen here who were newly registered</p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-slate-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground">Returning to Clinic</p>
              <p className="text-2xl sm:text-3xl font-bold text-slate-700 dark:text-slate-300">{summary.returning_patients.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground mt-1">Seen here with prior clinic history</p>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Attendance by Category - {selectedClinic} Clinic
            </CardTitle>
            <CardDescription>Breakdown by patient category</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : data.length > 0 ? (
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
                    <tr className="border-t-2 border-border bg-green-50 dark:bg-green-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">Total</td>
                      <td className="p-3 text-right text-foreground">{summary.total_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-green-600 dark:text-green-400">{summary.grand_total.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Building className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No clinic records found for this period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
