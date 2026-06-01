"use client";

import React, { useEffect, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  ArrowLeft,
  Printer,
  FlaskConical,
  Activity,
  Timer,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface LabPerformance {
  tests_this_month: number;
  completed_tests: number;
  completion_rate: number;
  avg_turnaround_hours: number;
  critical_values: number;
}

export default function LabPerformanceReport() {
  const [data, setData] = useState<LabPerformance | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<LabPerformance>("/reports/lab-performance/");
      setData(response);
    } catch (error: any) {
      console.error("Error fetching lab performance:", error);
      toast.error(error.message || "Failed to load lab performance");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const exportToCSV = () => {
    if (!data) {
      toast.error("No data to export");
      return;
    }
    const lines: string[] = [
      "Metric,Value",
      `Tests this month,${data.tests_this_month}`,
      `Completed tests,${data.completed_tests}`,
      `Completion rate (%),${data.completion_rate}`,
      `Avg turnaround (hours),${data.avg_turnaround_hours}`,
      `Critical values,${data.critical_values}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `lab_performance_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

  const monthName = new Date().toLocaleString("default", { month: "long", year: "numeric" });

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
              <FlaskConical className="h-8 w-8 text-amber-500" />
              Lab Performance
            </h1>
            <p className="text-muted-foreground mt-1">
              Monthly snapshot — {monthName}
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV} disabled={!data}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()} disabled={!data}>
              <Printer className="h-4 w-4 mr-2" />
              Print
            </Button>
          </div>
        </div>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading report data...</p>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Tests this month</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.tests_this_month.toLocaleString()}</p>
                    </div>
                    <FlaskConical className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.completed_tests.toLocaleString()}</p>
                    </div>
                    <CheckCircle2 className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-sky-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completion rate</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.completion_rate.toFixed(1)}%</p>
                    </div>
                    <Activity className="h-10 w-10 text-sky-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-indigo-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg turnaround</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.avg_turnaround_hours.toFixed(1)} h</p>
                    </div>
                    <Timer className="h-10 w-10 text-indigo-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Critical values</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.critical_values.toLocaleString()}</p>
                    </div>
                    <AlertTriangle className="h-10 w-10 text-red-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
                <CardDescription>How these metrics are calculated</CardDescription>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>• <strong>Completion rate</strong> = verified tests / total tests ordered this month.</p>
                <p>• <strong>Avg turnaround</strong> = mean hours from order placement to result verification (sampled, last 100 verified).</p>
                <p>• <strong>Critical values</strong> = verified tests this month whose notes mention the word &quot;critical&quot;.</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <FlaskConical className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
