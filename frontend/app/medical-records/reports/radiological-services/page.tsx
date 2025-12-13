"use client";

import React, { useState, useEffect } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Download, FileSpreadsheet, RefreshCw, ArrowLeft, 
  Stethoscope, Printer
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface ServiceData {
  sn: number;
  category: string;
  count: number;
}

export default function RadiologicalServicesReport() {
  const router = useRouter();
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [data, setData] = useState<ServiceData[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<{ data: ServiceData[]; total: number }>(`/reports/radiological-services/?year=${year}`);
      setData(response.data || []);
      setTotal(response.total || 0);
    } catch (error: any) {
      console.error("Error fetching radiology report:", error);
      toast.error(error.message || "Failed to load radiological services report");
      setData([]);
      setTotal(0);
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

    const headers = ["S/N", "Service Type", "Count"];
    const rows = data.map(row => [row.sn, row.category, row.count]);
    
    const csv = [
      headers.join(','),
      ...rows.map(row => row.join(',')),
      `Total,,${total}`
    ].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `radiological_services_${year}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast.success("Report exported successfully");
  };

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const maxValue = Math.max(...data.map(d => d.count), 1);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
          <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
          <span>/</span>
          <Link href="/medical-records/reports" className="hover:text-primary">Reports</Link>
          <span>/</span>
          <span>Radiological Services</span>
        </div>

        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Stethoscope className="h-8 w-8 text-indigo-500" />
              Radiological Services Report
            </h1>
            <p className="text-muted-foreground mt-1">X-Ray, ECG, Ultrasound, CT Scan, MRI statistics</p>
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

        <Card className="border-l-4 border-l-indigo-500">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Radiological Services</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-indigo-600 dark:text-indigo-400">{total.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground">For the year {year}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Stethoscope className="h-5 w-5" />
              Services Breakdown - {year}
            </CardTitle>
            <CardDescription>Radiological services by type</CardDescription>
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
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Service Type</th>
                      <th className="text-right p-3 text-sm font-medium text-muted-foreground">Count</th>
                      <th className="text-left p-3 text-sm font-medium text-muted-foreground">Distribution</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.map((row) => (
                      <tr key={row.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                        <td className="p-3 text-foreground">{row.sn}</td>
                        <td className="p-3 font-medium text-foreground">{row.category}</td>
                        <td className="p-3 text-right font-semibold text-foreground">{row.count.toLocaleString()}</td>
                        <td className="p-3">
                          <div className="w-full bg-muted rounded-full h-4">
                            <div 
                              className="bg-indigo-600 h-4 rounded-full transition-all duration-300"
                              style={{ width: `${(row.count / maxValue) * 100}%` }}
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                    <tr className="border-t-2 border-border bg-indigo-50 dark:bg-indigo-900/20 font-bold">
                      <td colSpan={2} className="p-3 text-foreground">Total</td>
                      <td className="p-3 text-right text-indigo-600 dark:text-indigo-400">{total.toLocaleString()}</td>
                      <td className="p-3"></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="text-center py-12">
                <Stethoscope className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No data available</p>
                <p className="text-sm text-muted-foreground">No radiological services found for this year</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}

