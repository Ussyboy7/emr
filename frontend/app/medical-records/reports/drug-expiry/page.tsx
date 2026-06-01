"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Download,
  FileSpreadsheet,
  RefreshCw,
  ArrowLeft,
  Printer,
  Pill,
  AlertTriangle,
  AlertOctagon,
  Calendar,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface ExpiryItem {
  id: number;
  medication_name: string;
  generic_name: string;
  batch_number: string;
  quantity: number;
  unit: string;
  expiry_date: string;
  days_to_expiry: number;
  bucket: string;
}

interface DrugExpiry {
  days_window: number;
  cutoff_date: string;
  summary: {
    "0_30": number;
    "31_60": number;
    "61_90": number;
    "90_plus": number;
    already_expired: number;
  };
  items: ExpiryItem[];
}

const BUCKET_LABELS: Record<string, string> = {
  "0_30": "0–30 days",
  "31_60": "31–60 days",
  "61_90": "61–90 days",
  "90_plus": "90+ days",
};

const BUCKET_COLORS: Record<string, string> = {
  "0_30": "border-l-red-500",
  "31_60": "border-l-orange-500",
  "61_90": "border-l-amber-500",
  "90_plus": "border-l-sky-500",
};

export default function DrugExpiryReport() {
  const [days, setDays] = useState("90");
  const [data, setData] = useState<DrugExpiry | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const d = parseInt(days, 10);
      if (Number.isNaN(d) || d < 1 || d > 730) {
        toast.error("Enter a window between 1 and 730 days");
        setIsLoading(false);
        return;
      }
      const response = await apiFetch<DrugExpiry>(`/reports/drug-expiry/?days=${d}`);
      setData(response);
    } catch (error: any) {
      console.error("Error fetching drug expiry:", error);
      toast.error(error.message || "Failed to load drug expiry");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportToCSV = () => {
    if (!data || data.items.length === 0) {
      toast.error("No data to export");
      return;
    }
    const lines = [
      "Medication,Generic,Batch,Quantity,Unit,Expiry Date,Days To Expiry,Bucket",
      ...data.items.map((i) =>
        [
          `"${(i.medication_name || "").replace(/"/g, '""')}"`,
          `"${(i.generic_name || "").replace(/"/g, '""')}"`,
          `"${(i.batch_number || "").replace(/"/g, '""')}"`,
          i.quantity,
          i.unit,
          i.expiry_date,
          i.days_to_expiry,
          BUCKET_LABELS[i.bucket] || i.bucket,
        ].join(","),
      ),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `drug_expiry_${data.cutoff_date}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

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
              <Pill className="h-8 w-8 text-rose-500" />
              Drug Expiry Watch
            </h1>
            <p className="text-muted-foreground mt-1">
              Inventory batches approaching expiry in the next {days} days
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

        <Card className="print:hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Calendar className="h-5 w-5" />
              Window
            </CardTitle>
            <CardDescription>Look ahead N days from today (1–730)</CardDescription>
          </CardHeader>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <Label>Days to look ahead</Label>
                <Input
                  type="number"
                  min={1}
                  max={730}
                  value={days}
                  onChange={(e) => setDays(e.target.value)}
                />
              </div>
              <Button onClick={fetchReport} disabled={isLoading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                {isLoading ? "Loading..." : "Apply"}
              </Button>
            </div>
          </CardContent>
        </Card>

        {isLoading ? (
          <Card>
            <CardContent className="py-12 text-center">
              <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading report data...</p>
            </CardContent>
          </Card>
        ) : data ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {Object.entries(BUCKET_LABELS).map(([key, label]) => (
                <Card key={key} className={`border-l-4 ${BUCKET_COLORS[key]}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">{label}</p>
                        <p className="text-2xl sm:text-3xl font-bold">{(data.summary as any)[key]?.toLocaleString() || 0}</p>
                      </div>
                      <AlertTriangle className="h-10 w-10 text-rose-500 opacity-50" />
                    </div>
                  </CardContent>
                </Card>
              ))}
              <Card className="border-l-4 border-l-slate-700">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Already expired</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.summary.already_expired.toLocaleString()}</p>
                    </div>
                    <AlertOctagon className="h-10 w-10 text-slate-700 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  Upcoming expiries — cutoff {data.cutoff_date}
                </CardTitle>
                <CardDescription>
                  {data.items.length === 0
                    ? "No inventory expiring in the selected window"
                    : `${data.items.length} batch${data.items.length === 1 ? "" : "es"} (capped at 500 for display)`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {data.items.length === 0 ? (
                  <div className="text-center py-12">
                    <Pill className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-lg font-medium mb-1">No expiring batches</p>
                    <p className="text-sm text-muted-foreground">All clear for the next {days} days</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-2 font-medium text-muted-foreground">Medication</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Generic</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Batch</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Qty</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Expiry</th>
                          <th className="text-right p-2 font-medium text-muted-foreground">Days</th>
                          <th className="text-left p-2 font-medium text-muted-foreground">Window</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.items.map((i) => (
                          <tr key={i.id} className="border-b border-border hover:bg-muted/30">
                            <td className="p-2 font-medium">{i.medication_name}</td>
                            <td className="p-2 text-muted-foreground">{i.generic_name || "—"}</td>
                            <td className="p-2 font-mono text-xs">{i.batch_number}</td>
                            <td className="p-2 text-right">{i.quantity.toLocaleString()}</td>
                            <td className="p-2">{i.expiry_date}</td>
                            <td className={`p-2 text-right font-semibold ${i.days_to_expiry <= 30 ? "text-red-600" : i.days_to_expiry <= 60 ? "text-orange-600" : ""}`}>
                              {i.days_to_expiry}
                            </td>
                            <td className="p-2 text-muted-foreground">{BUCKET_LABELS[i.bucket]}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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
