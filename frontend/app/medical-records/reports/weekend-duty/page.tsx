"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  Calendar, Printer
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface WeekendSummary {
  officers: number;
  staff: number;
  dependents: number;
  retirees: number;
  non_npa: number;
  total: number;
}

interface MonthlyData {
  sn: number;
  month: string;
  count: number;
}

export default function WeekendDutyReport() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [summary, setSummary] = useState<WeekendSummary>({
    officers: 0,
    staff: 0,
    dependents: 0,
    retirees: 0,
    non_npa: 0,
    total: 0
  });
  const [monthlyData, setMonthlyData] = useState<MonthlyData[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{ summary: WeekendSummary; monthly_data: MonthlyData[] }>(`/reports/weekend-duty/?year=${year}`);
      setSummary(response.summary || summary);
      setMonthlyData(response.monthly_data || []);
    } catch (error: any) {
      console.error("Error fetching weekend duty report:", error);
      toast.error(error.message || "Failed to load weekend duty report");
      setSummary({ officers: 0, staff: 0, dependents: 0, retirees: 0, non_npa: 0, total: 0 });
      setMonthlyData([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [year]);

  const exportToCSV = () => {
    if (monthlyData.length === 0) {
      toast.error("No data to export");
      return;
    }

    const lines = [
      "WEEKEND CALL DUTY REPORT",
      `Year: ${year}`,
      "",
      "Summary",
      "Category,Count",
      `Officers,${summary.officers}`,
      `Staff,${summary.staff}`,
      `Dependents,${summary.dependents}`,
      `Retirees,${summary.retirees}`,
      `Non-NPA,${summary.non_npa}`,
      `Total,${summary.total}`,
      "",
      "Monthly Breakdown",
      "Month,Count",
      ...monthlyData.map(m => `${m.month},${m.count}`)
    ];
    
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `weekend_duty_${year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
          <span>/</span>
          <Link href="/medical-records/reports" className="hover:text-primary">Reports</Link>
          <span>/</span>
          <span>Weekend Call Duty</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Calendar className="h-8 w-8 text-purple-500" />
              Weekend Call Duty Report
            </h1>
            <p className="text-muted-foreground mt-1">Weekend and after-hours attendance statistics</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV} disabled={monthlyData.length === 0}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={monthlyData.length === 0}>
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

        <div className="grid gap-4 md:grid-cols-5">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Officers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.officers.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Staff</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.staff.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Dependents</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.dependents.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Retirees</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.retirees.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">Total</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-purple-600 dark:text-purple-400">{summary.total.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Monthly Weekend Attendance - {year}
            </CardTitle>
            <CardDescription>Weekend visits breakdown by month</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : monthlyData.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Month</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Weekend Visits</th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.month}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.count.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-purple-50 dark:bg-purple-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL WEEKEND VISITS</td>
                      <td className="p-3 text-right text-purple-600 dark:text-purple-400">{summary.total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Calendar className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No weekend visits found for this year</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

