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
import { useRouter } from "next/navigation";
import Link from "next/link";

interface LabMonthlyData {
  sn: number;
  month: string;
  officers: number;
  staff: number;
  dependents: number;
  retirees: number;
  non_npa: number;
  total: number;
}

export default function LaboratoryAttendanceReport() {
  const router = useRouter();
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

    const headers = ["S/N", "Month", "Officers", "Staff", "Employee Dependents", "Pensioners/Spouse", "Non-NPA", "Total"];
    const rows = data.map(row => [
      row.sn, row.month, row.officers, row.staff, row.dependents, row.retirees, row.non_npa, row.total
    ]);
    
    const categoryTotals = data.reduce((acc, row) => ({
      officers: acc.officers + row.officers,
      staff: acc.staff + row.staff,
      dependents: acc.dependents + row.dependents,
      retirees: acc.retirees + row.retirees,
      non_npa: acc.non_npa + row.non_npa
    }), { officers: 0, staff: 0, dependents: 0, retirees: 0, non_npa: 0 });
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `TOTAL ATTENDANCE,,${categoryTotals.officers},${categoryTotals.staff},${categoryTotals.dependents},${categoryTotals.retirees},${categoryTotals.non_npa},${total}`
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
    staff: acc.staff + row.staff,
    dependents: acc.dependents + row.dependents,
    retirees: acc.retirees + row.retirees,
    non_npa: acc.non_npa + row.non_npa
  }), { officers: 0, staff: 0, dependents: 0, retirees: 0, non_npa: 0 });

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
          <span>/</span>
          <Link href="/medical-records/reports" className="hover:text-primary">Reports</Link>
          <span>/</span>
          <span>Laboratory Attendance</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
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
              <CardTitle className="text-xs font-medium text-muted-foreground">Officers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{categoryTotals.officers.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{categoryTotals.staff.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Dependents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{categoryTotals.dependents.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Retirees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{categoryTotals.retirees.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-pink-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-pink-600 dark:text-pink-400">{total.toLocaleString()}</div>
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
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Officers</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Staff</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Dependents</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Retirees/Spouse</th>
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
                        <td className="p-3 text-right text-foreground">{row.non_npa.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-pink-50 dark:bg-pink-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL ATTENDANCE</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.officers.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.staff.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.dependents.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.retirees.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{categoryTotals.non_npa.toLocaleString()}</td>
                      <td className="p-3 text-right text-pink-600 dark:text-pink-400">{total.toLocaleString()}</td>
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

