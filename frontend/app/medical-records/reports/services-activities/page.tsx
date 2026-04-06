"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  Activity, Syringe, FileText, Printer, Calendar, TrendingUp, Users
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface ServiceData {
  sn: number;
  category: string;
  count: number;
  male: number;
  female: number;
  percentage: number;
}

interface ServicesSummary {
  total: number;
  total_male: number;
  total_female: number;
}

interface MedicalCertificateSickLeave {
  certificates_issued: number;
  total_sick_leave_days: number;
  male: number;
  female: number;
}

export default function ServicesActivitiesReport() {
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<"year" | "range">("year");
  const [data, setData] = useState<ServiceData[]>([]);
  const [summary, setSummary] = useState<ServicesSummary>({
    total: 0,
    total_male: 0,
    total_female: 0,
  });
  const [certificateSickLeave, setCertificateSickLeave] = useState<MedicalCertificateSickLeave | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
      let url = "/reports/services-activities/?";
      if (viewMode === "year") {
        url += `year=${year}`;
      } else if (startDate && endDate) {
        url += `start_date=${startDate}&end_date=${endDate}`;
      } else {
        toast.error("Please select both start and end dates");
        setIsLoading(false);
        return;
      }
      const response = await apiFetch<{
        data: ServiceData[];
        summary: ServicesSummary;
        medical_certificate_sick_leave?: MedicalCertificateSickLeave;
      }>(url);
      setData(response.data || []);
      setSummary(response.summary || { total: 0, total_male: 0, total_female: 0 });
      setCertificateSickLeave(response.medical_certificate_sick_leave ?? null);
    } catch (error: any) {
      console.error("Error fetching services report:", error);
      toast.error(error.message || "Failed to load services report");
      setData([]);
      setSummary({ total: 0, total_male: 0, total_female: 0 });
      setCertificateSickLeave(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "year" && year) fetchReport();
    if (viewMode === "range" && startDate && endDate) fetchReport();
  }, [year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["S/N", "Category", "Total", "Male", "Female", "%"];
    const rows = data.map(row => [row.sn, row.category, row.count, row.male, row.female, `${row.percentage}%`]);
    
    const certLines: string[] = [];
    if (certificateSickLeave) {
      certLines.push("");
      certLines.push("Medical certificates (illness / sick leave)");
      certLines.push(
        ["Certificates issued", certificateSickLeave.certificates_issued].join(","),
      );
      certLines.push(
        ["Total calendar sick leave days", certificateSickLeave.total_sick_leave_days].join(","),
      );
      certLines.push(
        ["Male patients", certificateSickLeave.male, "Female patients", certificateSickLeave.female].join(","),
      );
    }

    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `TOTAL,,${summary.total},${summary.total_male},${summary.total_female},100.0%`,
      ...certLines,
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const period = viewMode === "year" ? year : `${startDate}_to_${endDate}`;
    a.download = `services_activities_${period}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

  const getIconForService = (category: string) => {
    if (category.includes('Injection')) return Syringe;
    if (category.includes('Dressing')) return Activity;
    if (category.includes('Sick Leave')) return FileText;
    return Activity;
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="mb-2">
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
              <Activity className="h-8 w-8 text-orange-500" />
              Services & Activities Report
            </h1>
            <p className="text-muted-foreground mt-1">Injections, Dressing, Sick Leave, Referrals, Observations</p>
          </div>
          <div className="flex items-center gap-2">
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

        <div className="flex gap-2">
          <Button
            variant={viewMode === "range" && startDate.includes(new Date().toISOString().slice(0, 7)) ? "default" : "outline"}
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

        <Card>
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
                <Select value={viewMode} onValueChange={(value: "year" | "range") => setViewMode(value)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
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
                    <SelectTrigger><SelectValue /></SelectTrigger>
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

        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-orange-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Services</p>
                  <p className="text-2xl sm:text-3xl font-bold text-orange-600 dark:text-orange-400">{summary.total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Includes all recorded service activities</p>
                </div>
                <Activity className="h-10 w-10 text-orange-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-cyan-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Male Patients</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_male.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.total_male / summary.total) * 100).toFixed(1)}%` : "0%"} of total
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
                  <p className="text-sm text-muted-foreground">Female Patients</p>
                  <p className="text-2xl sm:text-3xl font-bold">{summary.total_female.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.total > 0 ? `${((summary.total_female / summary.total) * 100).toFixed(1)}%` : "0%"} of total
                  </p>
                </div>
                <Users className="h-10 w-10 text-pink-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {certificateSickLeave && (
          <Card className="border-l-4 border-l-teal-500">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-5 w-5 text-teal-600" />
                Medical certificates (illness / sick leave)
              </CardTitle>
              <CardDescription>
                Persisted certificates in the period — total calendar days summed from the sick leave days field.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 text-sm">
              <div>
                <p className="text-muted-foreground">Certificates issued</p>
                <p className="text-xl font-semibold">{certificateSickLeave.certificates_issued.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Total sick leave days</p>
                <p className="text-xl font-semibold">{certificateSickLeave.total_sick_leave_days.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Male patients</p>
                <p className="text-xl font-semibold">{certificateSickLeave.male.toLocaleString()}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Female patients</p>
                <p className="text-xl font-semibold">{certificateSickLeave.female.toLocaleString()}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Data Table */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Services & Activities - {viewMode === "year" ? year : `${startDate} to ${endDate}`}
            </CardTitle>
            <CardDescription>
              Breakdown of services and activities performed. “Sick leave” rows are nursing orders; certificate totals are shown above.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                <p className="text-muted-foreground">Loading report data...</p>
              </div>
            ) : data.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Category</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Male</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Female</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">%</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => {
                      const Icon = getIconForService(row.category);
                      return (
                        <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                          <td className="p-3 text-foreground">{row.sn}</td>
                          <td className="p-3 font-medium text-foreground flex items-center gap-2">
                            <Icon className="h-4 w-4 text-orange-500" />
                            {row.category}
                          </td>
                          <td className="p-3 text-right font-semibold text-foreground">{row.count.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{row.male.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{row.female.toLocaleString()}</td>
                          <td className="p-3 text-right text-foreground">{row.percentage.toFixed(1)}%</td>
                        </tr>
                      );
                    })}
                    <tr className="border-t-2 border-border bg-muted/50 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL</td>
                      <td className="p-3 text-right text-foreground">{summary.total.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_male.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_female.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">100.0%</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No services or activities found for this year</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

