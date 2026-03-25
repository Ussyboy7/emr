"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  TestTube, Printer
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface LabMonthlyData {
  sn: number;
  month: string;
  officers: number;
  officers_male: number;
  officers_female: number;
  staff: number;
  staff_male: number;
  staff_female: number;
  dependents: number;
  dependents_male: number;
  dependents_female: number;
  retirees: number;
  retirees_male: number;
  retirees_female: number;
  non_npa: number;
  non_npa_male: number;
  non_npa_female: number;
  total: number;
  total_male: number;
  total_female: number;
}

export default function LaboratoryAttendanceReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [data, setData] = useState<LabMonthlyData[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: LabMonthlyData[]; total: number }>(`/reports/laboratory-attendance/?year=${year}`);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch (error: any) {
      console.error("Error fetching lab report:", error);
      toast.error(error.message || "Failed to load laboratory report");
      setData([]);
      setTotal(0);
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

    const headers = ["S/N", "Month", "Officers", "Officers(M)", "Officers(F)", "Staff", "Staff(M)", "Staff(F)", "Dependents", "Dependents(M)", "Dependents(F)", "Retirees", "Retirees(M)", "Retirees(F)", "Non-NPA", "Non-NPA(M)", "Non-NPA(F)", "Total", "Male", "Female"];
    const rows = data.map(row => [
      row.sn, row.month, 
      row.officers, row.officers_male, row.officers_female,
      row.staff, row.staff_male, row.staff_female,
      row.dependents, row.dependents_male, row.dependents_female,
      row.retirees, row.retirees_male, row.retirees_female,
      row.non_npa, row.non_npa_male, row.non_npa_female,
      row.total, row.total_male, row.total_female
    ]);
    
    const categoryTotals = data.reduce((acc, row) => ({
      officers: acc.officers + row.officers,
      officers_male: acc.officers_male + row.officers_male,
      officers_female: acc.officers_female + row.officers_female,
      staff: acc.staff + row.staff,
      staff_male: acc.staff_male + row.staff_male,
      staff_female: acc.staff_female + row.staff_female,
      dependents: acc.dependents + row.dependents,
      dependents_male: acc.dependents_male + row.dependents_male,
      dependents_female: acc.dependents_female + row.dependents_female,
      retirees: acc.retirees + row.retirees,
      retirees_male: acc.retirees_male + row.retirees_male,
      retirees_female: acc.retirees_female + row.retirees_female,
      non_npa: acc.non_npa + row.non_npa,
      non_npa_male: acc.non_npa_male + row.non_npa_male,
      non_npa_female: acc.non_npa_female + row.non_npa_female,
      total_male: acc.total_male + row.total_male,
      total_female: acc.total_female + row.total_female
    }), { 
      officers: 0, officers_male: 0, officers_female: 0,
      staff: 0, staff_male: 0, staff_female: 0,
      dependents: 0, dependents_male: 0, dependents_female: 0,
      retirees: 0, retirees_male: 0, retirees_female: 0,
      non_npa: 0, non_npa_male: 0, non_npa_female: 0,
      total_male: 0, total_female: 0
    });
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `TOTAL ATTENDANCE,,${categoryTotals.officers},${categoryTotals.officers_male},${categoryTotals.officers_female},${categoryTotals.staff},${categoryTotals.staff_male},${categoryTotals.staff_female},${categoryTotals.dependents},${categoryTotals.dependents_male},${categoryTotals.dependents_female},${categoryTotals.retirees},${categoryTotals.retirees_male},${categoryTotals.retirees_female},${categoryTotals.non_npa},${categoryTotals.non_npa_male},${categoryTotals.non_npa_female},${total},${categoryTotals.total_male},${categoryTotals.total_female}`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `laboratory_attendance_${year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const categoryTotals = data.reduce((acc, row) => ({
    officers: acc.officers + row.officers,
    officers_male: acc.officers_male + row.officers_male,
    officers_female: acc.officers_female + row.officers_female,
    staff: acc.staff + row.staff,
    staff_male: acc.staff_male + row.staff_male,
    staff_female: acc.staff_female + row.staff_female,
    dependents: acc.dependents + row.dependents,
    dependents_male: acc.dependents_male + row.dependents_male,
    dependents_female: acc.dependents_female + row.dependents_female,
    retirees: acc.retirees + row.retirees,
    retirees_male: acc.retirees_male + row.retirees_male,
    retirees_female: acc.retirees_female + row.retirees_female,
    non_npa: acc.non_npa + row.non_npa,
    non_npa_male: acc.non_npa_male + row.non_npa_male,
    non_npa_female: acc.non_npa_female + row.non_npa_female,
    total_male: acc.total_male + row.total_male,
    total_female: acc.total_female + row.total_female
  }), { 
    officers: 0, officers_male: 0, officers_female: 0,
    staff: 0, staff_male: 0, staff_female: 0,
    dependents: 0, dependents_male: 0, dependents_female: 0,
    retirees: 0, retirees_male: 0, retirees_female: 0,
    non_npa: 0, non_npa_male: 0, non_npa_female: 0,
    total_male: 0, total_female: 0
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
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
              <TestTube className="h-8 w-8 text-pink-500" />
              Laboratory Attendance Report
            </h1>
            <p className="text-muted-foreground mt-1">Lab services by patient category</p>
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

        {/* Filters */}
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

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Male Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-cyan-600 dark:text-cyan-400">{categoryTotals.total_male.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Female Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">{categoryTotals.total_female.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TestTube className="h-5 w-5" />
              Monthly Laboratory Attendance - {year}
            </CardTitle>
            <CardDescription>Lab services breakdown by patient category</CardDescription>
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
                      <th className="text-center p-3 text-sm font-medium text-muted-foreground" colSpan={3}>Officers</th>
                      <th className="text-center p-3 text-sm font-medium text-muted-foreground" colSpan={3}>Staff</th>
                      <th className="text-center p-3 text-sm font-medium text-muted-foreground" colSpan={3}>Dependents</th>
                      <th className="text-center p-3 text-sm font-medium text-muted-foreground" colSpan={3}>Retirees</th>
                      <th className="text-center p-3 text-sm font-medium text-muted-foreground" colSpan={3}>Non-NPA</th>
                      <th className="text-center p-3 text-sm font-medium text-muted-foreground" colSpan={3}>Total</th>
                    </tr>
                    <tr className="border-b border-border bg-muted/50">
                      <th className="text-left p-2 text-xs font-medium text-muted-foreground"></th>
                      <th className="text-left p-2 text-xs font-medium text-muted-foreground"></th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">T</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">M</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">F</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">T</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">M</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">F</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">T</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">M</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">F</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">T</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">M</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">F</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">T</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">M</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">F</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">T</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">M</th>
                      <th className="text-right p-2 text-xs font-medium text-muted-foreground">F</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.month}</td>
                        <td className="p-3 text-right text-foreground">{row.officers.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{row.officers_male.toLocaleString()}</td>
                        <td className="p-3 text-right text-pink-600 dark:text-pink-400">{row.officers_female.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.staff.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{row.staff_male.toLocaleString()}</td>
                        <td className="p-3 text-right text-pink-600 dark:text-pink-400">{row.staff_female.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.dependents.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{row.dependents_male.toLocaleString()}</td>
                        <td className="p-3 text-right text-pink-600 dark:text-pink-400">{row.dependents_female.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.retirees.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{row.retirees_male.toLocaleString()}</td>
                        <td className="p-3 text-right text-pink-600 dark:text-pink-400">{row.retirees_female.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.non_npa.toLocaleString()}</td>
                        <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{row.non_npa_male.toLocaleString()}</td>
                        <td className="p-3 text-right text-pink-600 dark:text-pink-400">{row.non_npa_female.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-cyan-600 dark:text-cyan-400">{row.total_male.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-pink-600 dark:text-pink-400">{row.total_female.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-pink-50 dark:bg-pink-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL ATTENDANCE</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.officers.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{categoryTotals.officers_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{categoryTotals.officers_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.staff.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{categoryTotals.staff_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{categoryTotals.staff_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.dependents.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{categoryTotals.dependents_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{categoryTotals.dependents_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.retirees.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{categoryTotals.retirees_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{categoryTotals.retirees_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.non_npa.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{categoryTotals.non_npa_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{categoryTotals.non_npa_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{total.toLocaleString()}</td>
                      <td className="p-3 text-right text-cyan-600 dark:text-cyan-400">{categoryTotals.total_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{categoryTotals.total_female.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <TestTube className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No laboratory records found for this year</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

