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
  Users,
  Activity,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch } from "@/lib/api-client";
import Link from "next/link";

interface Demographics {
  total_patients: number;
  by_category: Record<string, number>;
  by_gender: Record<string, number>;
  by_age_group: Record<string, number>;
  by_blood_group: Record<string, number>;
}

const CATEGORY_LABELS: Record<string, string> = {
  employee: "Employee",
  retiree: "Retiree",
  dependent: "Dependent",
  nonnpa: "Non-NPA",
};

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
};

const AGE_LABELS: Record<string, string> = {
  "0-18": "0–18",
  "19-35": "19–35",
  "36-50": "36–50",
  "51-65": "51–65",
  "65+": "65+",
};

export default function PatientDemographicsReport() {
  const [data, setData] = useState<Demographics | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchReport = async () => {
    setIsLoading(true);
    try {
      const response = await apiFetch<Demographics>("/reports/patient-demographics/");
      setData(response);
    } catch (error: any) {
      console.error("Error fetching patient demographics:", error);
      toast.error(error.message || "Failed to load patient demographics");
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
    const lines: string[] = [];
    lines.push("Section,Key,Count");
    lines.push(`Summary,Total patients,${data.total_patients}`);
    Object.entries(data.by_category || {}).forEach(([k, v]) => {
      lines.push(`Category,${CATEGORY_LABELS[k] || k},${v}`);
    });
    Object.entries(data.by_gender || {}).forEach(([k, v]) => {
      lines.push(`Gender,${GENDER_LABELS[k] || k},${v}`);
    });
    Object.entries(data.by_age_group || {}).forEach(([k, v]) => {
      lines.push(`Age Group,${AGE_LABELS[k] || k},${v}`);
    });
    Object.entries(data.by_blood_group || {}).forEach(([k, v]) => {
      lines.push(`Blood Group,${k || "Unknown"},${v}`);
    });

    const blob = new Blob([lines.join("\n")], { type: "text/csv" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `patient_demographics_${new Date().toISOString().slice(0, 10)}.csv`;
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
              <Users className="h-8 w-8 text-blue-500" />
              Patient Demographics
            </h1>
            <p className="text-muted-foreground mt-1">
              Active patient register distribution by category, gender, age, and blood group
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
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total active patients</p>
                    <p className="text-3xl sm:text-4xl font-bold">{data.total_patients.toLocaleString()}</p>
                  </div>
                  <Users className="h-12 w-12 text-blue-500 opacity-50" />
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-4 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By category</CardTitle>
                  <CardDescription>Patient register mix</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Category</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.by_category || {}).map(([k, v]) => (
                        <tr key={k} className="border-b border-border">
                          <td className="p-2">{CATEGORY_LABELS[k] || k}</td>
                          <td className="p-2 text-right">{v.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            {data.total_patients > 0 ? ((v / data.total_patients) * 100).toFixed(1) : "0.0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By gender</CardTitle>
                  <CardDescription>Self-reported gender distribution</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Gender</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.by_gender || {}).map(([k, v]) => (
                        <tr key={k} className="border-b border-border">
                          <td className="p-2">{GENDER_LABELS[k] || k}</td>
                          <td className="p-2 text-right">{v.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            {data.total_patients > 0 ? ((v / data.total_patients) * 100).toFixed(1) : "0.0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By age group</CardTitle>
                  <CardDescription>Age bands (years)</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Age</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.by_age_group || {}).map(([k, v]) => (
                        <tr key={k} className="border-b border-border">
                          <td className="p-2">{AGE_LABELS[k] || k}</td>
                          <td className="p-2 text-right">{v.toLocaleString()}</td>
                          <td className="p-2 text-right">
                            {data.total_patients > 0 ? ((v / data.total_patients) * 100).toFixed(1) : "0.0"}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">By blood group</CardTitle>
                  <CardDescription>Recorded blood groups</CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-border">
                        <th className="text-left p-2 font-medium text-muted-foreground">Blood group</th>
                        <th className="text-right p-2 font-medium text-muted-foreground">Count</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(data.by_blood_group || {}).map(([k, v]) => (
                        <tr key={k || "unknown"} className="border-b border-border">
                          <td className="p-2">{k || "Not recorded"}</td>
                          <td className="p-2 text-right">{v.toLocaleString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </div>
          </>
        ) : (
          <Card>
            <CardContent className="py-12 text-center">
              <Activity className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-lg font-medium mb-1">No data available</p>
              <p className="text-sm text-muted-foreground">Unable to load patient demographics</p>
            </CardContent>
          </Card>
        )}
      </div>
    </DashboardLayout>
  );
}
