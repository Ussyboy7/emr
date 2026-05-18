"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  FileText, Printer, Calendar, Users, TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

interface GOPCategoryData {
  sn: number;
  category: string;
  male: number;
  female: number;
  total: number;
  percentage: number;
}

interface GOPSummary {
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

export default function GOPAttendanceReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [data, setData] = useState<GOPCategoryData[]>([]);
  const emptySummary: GOPSummary = {
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
  const [summary, setSummary] = useState<GOPSummary>(emptySummary);
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
      const url = `/reports/gop-attendance/?start_date=${range.start}&end_date=${range.end}`;
      const response = await apiFetch<{ data: GOPCategoryData[]; summary: GOPSummary }>(url);
      setData(response.data || []);
      setSummary(response.summary || emptySummary);
    } catch (error: any) {
      console.error("Error fetching GOPD report:", error);
      toast.error(error.message || "Failed to load GOPD attendance report");
      setData([]);
      setSummary(emptySummary);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    if (range) fetchReport();
  }, [year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["S/N", "Category", "Male", "Female", "Total", "%"];
    const rows = data.map(row => [
      row.sn, row.category, row.male, row.female, row.total, `${row.percentage}%`
    ]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `TOTAL,,${summary.total_male},${summary.total_female},${summary.grand_total},100.0%`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : 'unknown';
    a.download = `gopd_attendance_${period}.csv`;
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
              <FileText className="h-8 w-8 text-blue-500" />
              GOPD Attendance Report
            </h1>
            <p className="text-muted-foreground mt-1">GOPD attendance statistics</p>
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

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Filters
            </CardTitle>
            <CardDescription>Adjust date range for detailed reporting</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>View Mode</Label>
                <Select value={viewMode} onValueChange={setViewMode}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="daily">Daily</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="bimonthly">Bi-monthly</SelectItem>
                    <SelectItem value="quarterly">Quarterly</SelectItem>
                    <SelectItem value="half-yearly">Half-yearly</SelectItem>
                    <SelectItem value="annually">Annually</SelectItem>
                    <SelectItem value="year">By Year</SelectItem>
                    <SelectItem value="range">Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {viewMode === 'year' ? (
                <div>
                  <Label>Year</Label>
                  <Select value={year} onValueChange={setYear}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {years.map(y => (
                        <SelectItem key={y} value={y}>{y}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ) : viewMode === 'range' ? (
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
                    {viewMode === 'daily' && 'Today'}
                    {viewMode === 'weekly' && 'This week'}
                    {viewMode === 'monthly' && 'This month'}
                    {viewMode === 'bimonthly' && 'Last 2 months'}
                    {viewMode === 'quarterly' && 'This quarter'}
                    {viewMode === 'half-yearly' && 'This half-year'}
                    {viewMode === 'annually' && 'This year'}
                  </p>
                </div>
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

        <div className="grid gap-4 md:grid-cols-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Employee</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_employee / summary.grand_total) * 100).toFixed(1)}%` : "0%"} of total
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
                  <p className="text-sm text-muted-foreground">Total Non-Employee</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_non_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_non_employee / summary.grand_total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Male</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_male.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_male / summary.grand_total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-cyan-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-pink-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Female</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_female.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_female / summary.grand_total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-pink-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-5">
          <Card className="border-l-4 border-l-indigo-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">First-time GOPD</CardTitle>
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
              <CardTitle className="text-xs font-medium text-muted-foreground">Returning GOPD</CardTitle>
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
              <CardTitle className="text-xs font-medium text-muted-foreground">Total Visit Records</CardTitle>
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
              GOPD attendance by category
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
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL ATTENDANCE</td>
                      <td className="p-3 text-right text-foreground">{summary.total_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.grand_total.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No GOPD attendance records found for this year</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
