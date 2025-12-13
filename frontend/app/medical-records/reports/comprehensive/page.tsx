"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  BarChart3, Printer, Users, Activity, TestTube, 
  Pill, Syringe, TrendingUp
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

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
  category_breakdown: {
    Officers: number;
    Staff: number;
    "Employee Dependents": number;
    "Retiree Dependents": number;
    "Non-NPA": number;
  };
  monthly_trend: Array<{ month: string; count: number }>;
}

export default function ComprehensiveReport() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [reportData, setReportData] = useState<ComprehensiveData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<ComprehensiveData>(`/reports/comprehensive/?year=${year}`);
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
    fetchReport();
  }, [year]);

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
      "Category,Count",
      ...Object.entries(reportData.category_breakdown).map(([key, value]) => `${key},${value}`),
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
    a.download = `comprehensive_report_${year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Comprehensive report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const maxMonthlyVisits = reportData ? Math.max(...reportData.monthly_trend.map(m => m.count), 1) : 1;

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
          <span>/</span>
          <Link href="/medical-records/reports" className="hover:text-primary">Reports</Link>
          <span>/</span>
          <span>Comprehensive Report</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <BarChart3 className="h-8 w-8 text-gray-500" />
              Comprehensive Report
            </h1>
            <p className="text-muted-foreground mt-1">All metrics and analytics in one view</p>
          </div>
          <div className="flex items-center gap-2">
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
                    <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{reportData.overview.total_visits.toLocaleString()}</div>
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
                    <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{reportData.overview.total_prescriptions.toLocaleString()}</div>
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
                    <div className="text-3xl font-bold text-pink-600 dark:text-pink-400">{reportData.overview.total_lab_tests.toLocaleString()}</div>
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
                    <div className="text-3xl font-bold text-green-600 dark:text-green-400">{reportData.overview.total_nursing_orders.toLocaleString()}</div>
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
                  <div className="grid gap-6 md:grid-cols-5">
                    {Object.entries(reportData.category_breakdown).map(([category, count]) => (
                      <div key={category} className="text-center">
                        <div className="text-3xl font-bold text-blue-600 dark:text-blue-400 mb-2">{count.toLocaleString()}</div>
                        <div className="text-sm text-muted-foreground">{category}</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          {reportData.overview.total_visits > 0 
                            ? `${((count / reportData.overview.total_visits) * 100).toFixed(1)}%`
                            : '0%'
                          }
                        </div>
                      </div>
                    ))}
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

