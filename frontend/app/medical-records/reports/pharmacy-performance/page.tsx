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
  Pill,
  Timer,
  Package,
  AlertTriangle,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface PharmacyPerformance {
  dispensed_this_month: number;
  pending_prescriptions: number;
  avg_wait_minutes: number;
  low_stock_items: number;
}

export default function PharmacyPerformanceReport() {
  const [data, setData] = useState<PharmacyPerformance | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<PharmacyPerformance>("/reports/pharmacy-performance/");
      setData(response);
    } catch (error: any) {
      console.error("Error fetching pharmacy performance:", error);
      toast.error(error.message || "Failed to load pharmacy performance");
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
      `Dispensed this month,${data.dispensed_this_month}`,
      `Pending prescriptions,${data.pending_prescriptions}`,
      `Avg wait (minutes),${data.avg_wait_minutes}`,
      `Low stock items,${data.low_stock_items}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pharmacy_performance_${new Date().toISOString().slice(0, 10)}.csv`;
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
              <Pill className="h-8 w-8 text-violet-500" />
              Pharmacy Performance
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
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-violet-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Dispensed this month</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.dispensed_this_month.toLocaleString()}</p>
                    </div>
                    <CheckCircle2 className="h-10 w-10 text-violet-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending prescriptions</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.pending_prescriptions.toLocaleString()}</p>
                    </div>
                    <Package className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-sky-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg wait time</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.avg_wait_minutes.toFixed(1)} min</p>
                    </div>
                    <Timer className="h-10 w-10 text-sky-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-red-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Low stock items</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.low_stock_items.toLocaleString()}</p>
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
                <p>• <strong>Dispensed this month</strong> = prescriptions with status <em>dispensed</em> this calendar month.</p>
                <p>• <strong>Pending prescriptions</strong> = total prescriptions currently in <em>pending</em> state (queue backlog).</p>
                <p>• <strong>Avg wait time</strong> = mean minutes from prescription creation to dispensing (sampled, last 100).</p>
                <p>• <strong>Low stock items</strong> = inventory lines where quantity is at or below their configured min-stock threshold.</p>
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Pill className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
