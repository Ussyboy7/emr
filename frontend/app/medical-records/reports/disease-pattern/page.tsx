"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  TrendingUp, Printer, Activity
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DiseaseData {
  sn: number;
  diagnosis: string;
  employee: number;
  non_employee: number;
  total: number;
}

export default function DiseasePatternReport() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [data, setData] = useState<DiseaseData[]>([]);
  const [summary, setSummary] = useState({ total_employee: 0, total_non_employee: 0, grand_total: 0 });
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: DiseaseData[]; summary: typeof summary }>(`/reports/disease-pattern/?year=${year}`);
      setData(response.data || []);
      setSummary(response.summary || { total_employee: 0, total_non_employee: 0, grand_total: 0 });
    } catch (error: any) {
      console.error("Error fetching disease pattern:", error);
      toast.error(error.message || "Failed to load disease pattern report");
      setData([]);
      setSummary({ total_employee: 0, total_non_employee: 0, grand_total: 0 });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [year]);

  const exportToCSV = () => {
    if (data.length === 0) {
      toast.error("No data to export");
      return;
    }

    const headers = ["S/N", "Diagnosis", "Employee", "Non-Employee", "Total"];
    const rows = data.map(row => [row.sn, row.diagnosis, row.employee, row.non_employee, row.total]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `TOTAL,,${summary.total_employee},${summary.total_non_employee},${summary.grand_total}`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `disease_pattern_${year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const maxValue = Math.max(...data.map(d => d.total), 1);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
          <span>/</span>
          <Link href="/medical-records/reports" className="hover:text-primary">Reports</Link>
          <span>/</span>
          <span>Disease Pattern</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Activity className="h-8 w-8 text-red-500" />
              Disease Pattern Report
            </h1>
            <p className="text-muted-foreground mt-1">Top diagnoses and disease trends</p>
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Employee Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{summary.total_employee.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Non-Employee Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-green-600 dark:text-green-400">{summary.total_non_employee.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Total Cases</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{summary.grand_total.toLocaleString()}</div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Top Diagnoses - {year}
            </CardTitle>
            <CardDescription>Top 15 diagnoses by frequency</CardDescription>
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
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Diagnosis</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Non-Employee</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Total</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.diagnosis}</td>
                        <td className="p-3 text-right text-foreground">{row.employee.toLocaleString()}</td>
                        <td className="p-3 text-right text-foreground">{row.non_employee.toLocaleString()}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.total.toLocaleString()}</td>
                        <td className="p-3">
                          <div className="w-full bg-muted rounded-full h-3">
                            <div 
                              className="bg-red-600 h-3 rounded-full transition-all"
                              style={{ width: `${(row.total / maxValue) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-blue-50 dark:bg-blue-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">TOTAL</td>
                      <td className="p-3 text-right text-foreground">{summary.total_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.total_non_employee.toLocaleString()}</td>
                      <td className="p-3 text-right text-foreground">{summary.grand_total.toLocaleString()}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No diagnosis records found for this year</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

