"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  Calendar, Printer, Users, TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

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
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
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
      const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
      if (!range) {
        toast.error("Please select a valid date range");
        setIsLoading(false);
        return;
      }
      const url = `/reports/weekend-duty/?start_date=${range.start}&end_date=${range.end}`;

      const response = await apiFetch<{ summary: WeekendSummary; monthly_data: MonthlyData[] }>(url);
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
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    if (range) fetchReport();
  }, [year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (monthlyData.length === 0) {
      toast.error("No data to export");
      return;
    }

    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : year;
    const lines = [
      "WEEKEND CALL DUTY REPORT",
      `Period: ${period}`,
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
    a.download = `weekend_duty_${period}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const periodLabel = viewMode === "year" ? year : `${startDate} to ${endDate}`;

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
              <Calendar className="h-8 w-8 text-purple-500" />
              Weekend Call Duty Report
            </h1>
            <p className="text-muted-foreground mt-1">Weekend and after-hours attendance statistics</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
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

        {/* Filters */}
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
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
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
                <div>
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

        <div className="grid gap-4 md:grid-cols-5">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Officers</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.officers.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.officers / summary.total) * 100).toFixed(1)}%` : "0%"} of total
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
                  <p className="text-sm text-muted-foreground">Staff</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.staff.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.staff / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Dependents</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.dependents.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.dependents / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Retirees</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.retirees.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.retirees / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-rose-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Weekend Visits</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total weekend visits in selected period</p>
                </div>
                <Users className="h-10 w-10 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Monthly Weekend Attendance - {periodLabel}
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
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL WEEKEND VISITS</td>
                      <td className="p-3 text-right text-foreground">{summary.total.toLocaleString()}</td>
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
