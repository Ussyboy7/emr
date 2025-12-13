"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  ArrowRight, Printer
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ReferralSummary {
  new_referrals: number;
  follow_ups: number;
  completed: number;
  internal: number;
  external: number;
  specialist: number;
  total: number;
}

export default function ReferralTrackingReport() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [summary, setSummary] = useState<ReferralSummary>({
    new_referrals: 0,
    follow_ups: 0,
    completed: 0,
    internal: 0,
    external: 0,
    specialist: 0,
    total: 0
  });
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{ summary: ReferralSummary; data: any[] }>(`/reports/referral-tracking/?year=${year}`);
      setSummary(response.summary || summary);
    } catch (error: any) {
      console.error("Error fetching referral report:", error);
      toast.error(error.message || "Failed to load referral tracking report");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [year]);

  const exportToCSV = () => {
    const lines = [
      "REFERRAL TRACKING REPORT",
      `Year: ${year}`,
      "",
      "Summary",
      "Metric,Count",
      `New Referrals,${summary.new_referrals}`,
      `Follow-ups,${summary.follow_ups}`,
      `Completed,${summary.completed}`,
      `Internal,${summary.internal}`,
      `External,${summary.external}`,
      `Specialist,${summary.specialist}`,
      `Total,${summary.total}`
    ];
    
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referral_tracking_${year}.csv`;
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
          <span>Referral Tracking</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ArrowRight className="h-8 w-8 text-blue-500" />
              Referral Tracking Report
            </h1>
            <p className="text-muted-foreground mt-1">New referrals and follow-ups to retainership hospitals</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={fetchReport} disabled={isLoading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button variant="outline" onClick={exportToCSV}>
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
            <Button variant="outline" onClick={() => window.print()}>
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

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">New Referrals</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{summary.new_referrals.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Follow-ups</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{summary.follow_ups.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{summary.completed.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Internal</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.internal.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">External</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.external.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Specialist</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{summary.specialist.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <Card className="border-l-4 border-l-blue-500">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowRight className="h-5 w-5" />
              Total Referrals - {year}
            </CardTitle>
            <CardDescription>Summary of all referral activities</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-8">
              <div className="text-5xl font-bold text-blue-600 dark:text-blue-400">{summary.total.toLocaleString()}</div>
              <p className="text-muted-foreground mt-2">Total referrals for {year}</p>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

