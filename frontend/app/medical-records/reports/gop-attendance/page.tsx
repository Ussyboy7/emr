"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  FileText, Printer
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface GOPMonthlyData {
  sn: number;
  month: string;
  officers: number;
  staff: number;
  dependents: number;
  retirees: number;
  police: number;
  non_npa: number;
  total: number;
}

interface GOPLifecycleSummary {
  new_registrations: number;
  first_time_patients: number;
  returning_patients: number;
  total_unique_patients_seen: number;
  total_visits: number;
}

export default function GOPAttendanceReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [data, setData] = useState<GOPMonthlyData[]>([]);
  const [totals, setTotals] = useState({ officers: 0, staff: 0, dependents: 0, retirees: 0, police: 0, non_npa: 0 });
  const [grandTotal, setGrandTotal] = useState(0);
  const emptySummary: GOPLifecycleSummary = {
    new_registrations: 0,
    first_time_patients: 0,
    returning_patients: 0,
    total_unique_patients_seen: 0,
    total_visits: 0,
  };
  const [summary, setSummary] = useState<GOPLifecycleSummary>(emptySummary);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: GOPMonthlyData[]; totals: typeof totals; grand_total: number; summary: GOPLifecycleSummary }>(`/reports/gop-attendance/?year=${year}`);
      setData(response.data || []);
      setTotals(response.totals || { officers: 0, staff: 0, dependents: 0, retirees: 0, police: 0, non_npa: 0 });
      setGrandTotal(response.grand_total || 0);
      setSummary(response.summary || emptySummary);
    } catch (error: any) {
      console.error("Error fetching G.O.P report:", error);
      toast.error(error.message || "Failed to load G.O.P attendance report");
      setData([]);
      setTotals({ officers: 0, staff: 0, dependents: 0, retirees: 0, police: 0, non_npa: 0 });
      setGrandTotal(0);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [year]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["S/N", "Month", "Officers", "Staff", "Employee Dependents", "Retiree Dependents", "Police", "Non-NPA", "Total"];
    const rows = data.map(row => [
      row.sn, row.month, row.officers, row.staff, row.dependents, row.retirees, row.police, row.non_npa, row.total
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `Total Attendance,,${totals.officers},${totals.staff},${totals.dependents},${totals.retirees},${totals.police},${totals.non_npa},${grandTotal}`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gop_attendance_${year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="mb-2">
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
              <FileText className="h-8 w-8 text-blue-500" />
              G.O.P Attendance Report
            </h1>
            <p className="text-muted-foreground mt-1">General Outpatient attendance statistics</p>
          </div>
          <div className="flex items-center gap-2">
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

        <Card>
          <CardContent className="p-4">
            <div className="w-48">
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
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-6">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Officers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totals.officers.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totals.staff.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Dependents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totals.dependents.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Retirees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totals.retirees.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Police</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{totals.police.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-blue-600 dark:text-blue-400">{grandTotal.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">First-Time GOP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{summary.first_time_patients.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">New Registrations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{summary.new_registrations.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-slate-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Returning GOP</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-300">{summary.returning_patients.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Unique Patients</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">{summary.total_unique_patients_seen.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Visits</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{summary.total_visits.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Monthly G.O.P Attendance - {year}
            </CardTitle>
            <CardDescription>General outpatient attendance by category</CardDescription>
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
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Month</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Officers</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Staff</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Employee Dependents</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Retiree Dependents</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Police</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Non-NPA</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.month}</td>
                        <td className="p-3 text-right text-foreground">{row.officers.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.staff.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.dependents.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.retirees.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.police.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.non_npa.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-blue-50 dark:bg-blue-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL ATTENDANCE</td>
                      <td className="p-3 text-right text-foreground">{totals.officers.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{totals.staff.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{totals.dependents.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{totals.retirees.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{totals.police.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{totals.non_npa.toLocaleString()}</td>
                      <td className="p-3 text-right text-blue-600 dark:text-blue-400">{grandTotal.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No G.O.P attendance records found for this year</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
