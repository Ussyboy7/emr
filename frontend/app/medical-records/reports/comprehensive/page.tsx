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
  BarChart3, Printer, Users, Activity, TestTube, 
  Pill, TrendingUp, Calendar
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";
import { analyticsRangeFromFilters } from "@/components/analytics/AnalyticsReportLayout";

interface ComprehensiveData {
  year: string;
  overview: {
    total_visits: number;
    total_prescriptions: number;
    dispensed_prescriptions: number;
    total_lab_tests: number;
    total_nursing_orders: number;
    injections: number;
    dressing: number;
  };
  summary: {
    total_employee: number;
    total_non_employee: number;
    total_male: number;
    total_female: number;
    grand_total: number;
  };
  category_breakdown: Array<{ sn: number; category: string; male: number; female: number; total: number; percentage: number }>;
  monthly_trend: Array<{ month: string; count: number }>;
}

export default function ComprehensiveReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<string>("monthly");
  const [reportData, setReportData] = useState<ComprehensiveData | null>(null);
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
      const url = `/reports/comprehensive/?start_date=${range.start}&end_date=${range.end}`;
      const response = await apiFetch<ComprehensiveData>(url);
      setReportData(response);
    } catch (error: any) {
      console.error("Error fetching comprehensive report:", error);
      toast.error(error.message || "Failed to load comprehensive report");
      setReportData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    if (range) fetchReport();
  }, [year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (!reportData) {
      toast.error("No data to export");
      return;
    }

    const lines = [
      "NPA HEALTH SERVICES - COMPREHENSIVE REPORT",
      `Year: ${year}`,
      "",
      "OVERVIEW METRICS",
      "Metric,Count",
      `Total Visits,${reportData.overview.total_visits}`,
      `Total Prescriptions,${reportData.overview.total_prescriptions}`,
      `Dispensed Prescriptions,${reportData.overview.dispensed_prescriptions}`,
      `Total Lab Tests,${reportData.overview.total_lab_tests}`,
      `Total Nursing Orders,${reportData.overview.total_nursing_orders}`,
      `Injections,${reportData.overview.injections}`,
      `Dressing,${reportData.overview.dressing}`,
      "",
      "CATEGORY BREAKDOWN",
      "Category,Male,Female,Total,%",
      ...reportData.category_breakdown.map((row) => `${row.category},${row.male},${row.female},${row.total},${row.percentage}%`),
      `TOTAL,${reportData.summary.total_male},${reportData.summary.total_female},${reportData.summary.grand_total},100.0%`,
      "",
      "MONTHLY TREND",
      "Month,Visits",
      ...reportData.monthly_trend.map(m => `${m.month},${m.count}`)
    ];
    
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const range = analyticsRangeFromFilters(viewMode as any, year, startDate, endDate);
    const period = range ? `${range.start}_to_${range.end}` : 'unknown';
    a.download = `comprehensive_report_${period}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Comprehensive report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const maxMonthlyVisits = reportData ? Math.max(...reportData.monthly_trend.map(m => m.count), 1) : 1;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
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
              <BarChart3 className="h-8 w-8 text-gray-500" />
              Comprehensive Report
            </h1>
            <p className="text-muted-foreground mt-1">All metrics and analytics in one view</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV} disabled={!reportData}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!reportData}>
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
          <CardContent className="p-4">
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

        {isLoading ? (
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
            <p className="text-muted-foreground">Loading comprehensive report...</p>
          </div>
        ) : reportData ? (
          <>
            {/* Overview Metrics */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Overview Metrics</h2>
              <div className="grid gap-4 md:grid-cols-4">
                <Card className="border-l-4 border-l-blue-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      Total Visits
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{reportData.overview.total_visits.toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-purple-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Pill className="h-4 w-4" />
                      Prescriptions
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">{reportData.overview.total_prescriptions.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">{reportData.overview.dispensed_prescriptions} dispensed</p>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-pink-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <TestTube className="h-4 w-4" />
                      Lab Tests
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold text-pink-600 dark:text-pink-400">{reportData.overview.total_lab_tests.toLocaleString()}</div>
                  </CardContent>
                </Card>
                <Card className="border-l-4 border-l-green-500">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      Nursing Orders
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">{reportData.overview.total_nursing_orders.toLocaleString()}</div>
                    <p className="text-xs text-muted-foreground">
                      {reportData.overview.injections} injections, {reportData.overview.dressing} dressing
                    </p>
                  </CardContent>
                </Card>
              </div>
            </div>

            {/* Category Breakdown */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Patient Category Breakdown</h2>
              <Card>
                <CardContent className="p-6">
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
                        {reportData.category_breakdown.map((row) => (
                          <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="p-3 text-foreground">{row.sn}</td>
                            <td className="p-3 font-medium text-foreground">{row.category}</td>
                            <td className="p-3 text-right text-foreground">{row.male.toLocaleString()}</td>
                            <td className="p-3 text-right text-foreground">{row.female.toLocaleString()}</td>
                            <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                            <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                          </tr>
                        ))}
                        <tr className="border-t-2 border-border bg-muted/50 font-semibold">
                          <td className="p-3 text-foreground" colSpan={2}>TOTAL</td>
                          <td className="p-3 text-right text-foreground">{reportData.summary.total_male.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{reportData.summary.total_female.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{reportData.summary.grand_total.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">100.0%</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Monthly Trend */}
            <div>
              <h2 className="text-2xl font-bold mb-4">Monthly Visit Trend</h2>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5" />
                    Visits by Month - {year}
                  </CardTitle>
                  <CardDescription>Monthly patient visit distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {reportData.monthly_trend.map((month, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-20 text-sm font-medium text-foreground">{month.month}</div>
                        <div className="flex-1">
                          <div className="w-full bg-muted rounded-full h-6 relative">
                            <div 
                              className="bg-blue-600 h-6 rounded-full transition-all flex items-center justify-end pr-2"
                              style={{ width: `${(month.count / maxMonthlyVisits) * 100}%` }}
                            >
                              {month.count > 0 && (
                                <span className="text-xs font-semibold text-white">
                                  {month.count}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                        <div className="w-20 text-right text-sm font-semibold text-foreground">{month.count.toLocaleString()}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <BarChart3 className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
              <p className="text-sm text-muted-foreground">Unable to load comprehensive report</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
