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
  Building, TrendingUp, Printer, Calendar 
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface MonthlyData {
  sn: number;
  month: string;
  employee: number;
  non_employee: number;
  total: number;
}

export default function ClinicAttendanceReport() {
  const router = useRouter();
  const [selectedClinic, setSelectedClinic] = useState("Diamond");
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<"year" | "range">("year");
  const [data, setData] = useState<MonthlyData[]>([]);
  const [summary, setSummary] = useState({ total_employee: 0, total_non_employee: 0, grand_total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const clinics = [
    { value: "Diamond", label: "Diamond Club Clinic" },
    { value: "Sickle Cell", label: "Sickle Cell Clinic" },
    { value: "Healthron", label: "Healthron Clinic" },
    { value: "Ophthalmology", label: "Ophthalmology (Eye) Clinic" },
    { value: "Physiotherapy", label: "Physiotherapy Clinic" }
  ];

  const setThisMonth = () => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    setStartDate(firstDay.toISOString().split('T')[0]);
    setEndDate(lastDay.toISOString().split('T')[0]);
    setViewMode("range");
  };
  
  const setThisYear = () => {
    setYear(new Date().getFullYear().toString());
    setViewMode("year");
  };

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      let url = `/reports/clinic-attendance/?clinic_type=${selectedClinic}`;
      
      if (viewMode === 'year') {
        url += `&year=${year}`;
      } else if (startDate && endDate) {
        url += `&start_date=${startDate}&end_date=${endDate}`;
      }

      const response = await apiFetch<{ data: MonthlyData[]; summary: typeof summary }>(url);
      setData(response.data || []);
      setSummary(response.summary || { total_employee: 0, total_non_employee: 0, grand_total: 0 });
    } catch (error: any) {
      console.error("Error fetching clinic report:", error);
      toast.error(error.message || "Failed to load clinic report");
      setData([]);
      setSummary({ total_employee: 0, total_non_employee: 0, grand_total: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setThisMonth();
  }, []);

  useEffect(() => {
    if ((viewMode === 'range' && startDate && endDate) || viewMode === 'year') {
      fetchReport();
    }
  }, [selectedClinic, year, startDate, endDate, viewMode]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["S/N", "Month", "Employee", "Non-Employee", "Total"];
    const rows = data.map(row => [row.sn, row.month, row.employee, row.non_employee, row.total]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `Total,${summary.total_employee},${summary.total_non_employee},${summary.grand_total}`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedClinic}_clinic_${year}.csv`;
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
          <span>Clinic Attendance</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Building className="h-8 w-8 text-green-500" />
              Clinic Attendance Report
            </h1>
            <p className="text-muted-foreground mt-1">Specialized clinic attendance by category</p>
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

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Clinic & Date Filters
            </CardTitle>
            <CardDescription>Select clinic and time period</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div>
                <Label>Clinic Type</Label>
                <Select value={selectedClinic} onValueChange={setSelectedClinic}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {clinics.map(clinic => (
                      <SelectItem key={clinic.value} value={clinic.value}>
                        {clinic.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>View Mode</Label>
                <Select value={viewMode} onValueChange={(value: any) => setViewMode(value)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
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
              ) : (
                <>
                  <div>
                    <Label>Start Date</Label>
                    <Input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>End Date</Label>
                    <Input
                      type="date"
                      value={endDate}
                      onChange={(e) => setEndDate(e.target.value)}
                    />
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Employee</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{summary.total_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_employee / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Building className="h-10 w-10 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-green-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Non-Employee</p>
                  <p className="text-3xl font-bold text-green-600 dark:text-green-400">{summary.total_non_employee.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {summary.grand_total > 0 ? `${((summary.total_non_employee / summary.grand_total) * 100).toFixed(1)}%` : '0%'} of total
                  </p>
                </div>
                <Building className="h-10 w-10 text-green-500" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Grand Total</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{summary.grand_total.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground mt-1">Total attendance</p>
                </div>
                <TrendingUp className="h-10 w-10 text-purple-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Building className="h-5 w-5" />
              Monthly Breakdown - {selectedClinic} Clinic
            </CardTitle>
            <CardDescription>Attendance distribution by month</CardDescription>
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
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Month</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Non-Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.month}</td>
                        <td className="p-3 text-right text-foreground">{row.employee.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.non_employee.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-green-50 dark:bg-green-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">Total</td>
                      <td className="p-3 text-right text-foreground">{summary.total_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_non_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-green-600 dark:text-green-400">{summary.grand_total.toLocaleString()}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Building className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No clinic records found for this period</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

