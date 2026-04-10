"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  ArrowRight, Printer, TrendingUp, Users, Calendar, Activity, FileText
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
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

interface ReferralRow {
  referral_id: string;
  patient__patient_id: string;
  patient__first_name?: string;
  patient__surname?: string;
  status: string;
  facility_type: string;
  specialty?: string;
  facility?: string;
  referred_at?: string;
}

export default function ReferralTrackingReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<"year" | "range">("year");
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
  const [referrals, setReferrals] = useState<ReferralRow[]>([]);

  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(firstDay.toISOString().split("T")[0]);
    setEndDate(lastDay.toISOString().split("T")[0]);
    setViewMode("range");
  };

  const setThisYear = () => {
    setYear(new Date().getFullYear().toString());
    setViewMode("year");
  };

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      let url = "/reports/referral-tracking/?";
      if (viewMode === "year") {
        url += `year=${year}`;
      } else if (startDate && endDate) {
        url += `start_date=${startDate}&end_date=${endDate}`;
      } else {
        toast.error("Please select both start and end dates");
        setIsLoading(false);
        return;
      }

      const response = await apiFetch<{ summary: ReferralSummary; data: any[] }>(url);
      setSummary(response.summary || summary);
      setReferrals((response.data || []) as ReferralRow[]);
    } catch (error: any) {
      console.error("Error fetching referral report:", error);
      toast.error(error.message || "Failed to load referral tracking report");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "year" && year) fetchReport();
    if (viewMode === "range" && startDate && endDate) fetchReport();
  }, [year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    const period = viewMode === "year" ? year : `${startDate}_to_${endDate}`;
    const lines = [
      "REFERRAL TRACKING REPORT",
      `Period: ${period}`,
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

    if (referrals.length > 0) {
      lines.push("", "Referral Details");
      lines.push("S/N,Patient ID,Patient Name,Status,Facility Type,Specialty,Facility,Referred At");
      referrals.forEach((r, idx) => {
        const patientName = [r.patient__first_name, r.patient__surname].filter(Boolean).join(" ");
        lines.push(
          `${idx + 1},${r.patient__patient_id},${patientName},${r.status},${r.facility_type},${r.specialty || ""},${r.facility || ""},${r.referred_at || ""}`
        );
      });
    }
    
    const csv = lines.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `referral_tracking_${period}.csv`;
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
              <Users className="h-8 w-8 text-blue-500" />
              Referral Tracking Report
            </h1>
            <p className="text-muted-foreground mt-1">New referrals and follow-ups to retainership hospitals</p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
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

        {/* Quick Filter Buttons */}
        <div className="flex gap-2 print:hidden">
          <Button 
            variant={viewMode === "range" && startDate.includes(new Date().toISOString().slice(0,7)) ? "default" : "outline"}
            onClick={setThisMonth}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Month
          </Button>
          <Button 
            variant={viewMode === "year" && year === new Date().getFullYear().toString() ? "default" : "outline"}
            onClick={setThisYear}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Year
          </Button>
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
                <Select value={viewMode} onValueChange={(value: "year" | "range") => setViewMode(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="year">By Year</SelectItem>
                    <SelectItem value="range">Date Range</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {viewMode === "year" ? (
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
              ) : (
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
                  <p className="text-sm text-muted-foreground">New Referrals</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.new_referrals.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.new_referrals / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <ArrowRight className="h-10 w-10 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Follow-ups</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.follow_ups.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.follow_ups / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <ArrowRight className="h-10 w-10 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.completed.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.completed / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <FileText className="h-10 w-10 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Referrals</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total referral records for selected period</p>
                </div>
                <Users className="h-10 w-10 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-sky-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Internal</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.internal.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.internal / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Activity className="h-10 w-10 text-sky-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">External</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.external.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.external / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Activity className="h-10 w-10 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Specialist</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.specialist.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.specialist / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Activity className="h-10 w-10 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Referral Details Table */}
        <Card className="mt-2">
          <CardHeader>
            <CardTitle>Referral Details - {periodLabel}</CardTitle>
            <CardDescription>List of referred patients and where they were sent</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-10">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading referrals...</p>
              </div>
            ) : referrals.length === 0 ? (
              <div className="text-center py-10">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-muted-foreground">No referral records found for this period</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Patient</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Status</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Specialty</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Facility</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Referred At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {referrals.map((r, idx) => {
                      const patientName = [r.patient__first_name, r.patient__surname].filter(Boolean).join(" ") || r.patient__patient_id;
                      const referredAt = r.referred_at ? new Date(r.referred_at).toLocaleDateString() : "";
                      const facilityDisplay = r.facility || "-";
                      return (
                        <tr key={`${r.referral_id}-${idx}`} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-foreground">{idx + 1}</td>
                          <td className="p-3 font-medium text-foreground">{patientName}</td>
                          <td className="p-3 text-foreground">{r.status}</td>
                          <td className="p-3 text-foreground">{r.specialty || "-"}</td>
                          <td className="p-3 text-foreground">{facilityDisplay}</td>
                          <td className="p-3 text-foreground">{referredAt}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

