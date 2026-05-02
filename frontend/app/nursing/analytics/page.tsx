"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Heart, Timer, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, buildQueryString } from "@/lib/api-client";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface ComprehensiveAnalytics {
  patient_flow: {
    summary: {
      total_visits: number;
      completed_flows: number;
      vitals_completion_rate: number;
      average_processing_time: number;
      average_vitals_time: number;
      average_room_wait: number;
    };
    bottlenecks: {
      pool_delays: { count: number; average_delay: number };
      vitals_delays: { count: number; average_delay: number };
      room_assignment_delays: { count: number; average_delay: number };
    };
    throughput: Record<string, number>;
    peak_hours: Array<[number, number]>;
    category_analysis: Record<string, { count: number; avg_time: number; total_time: number }>;
    attendance_by_category: Array<{
      sn: number;
      key: string;
      label: string;
      male: number;
      female: number;
      total: number;
      percentage: number;
    }>;
    attendance_totals: {
      male: number;
      female: number;
      total: number;
    };
  };
  vitals_quality: {
    summary: {
      total_visits: number;
      fully_completed_visits: number;
      total_vitals_recorded: number;
      overall_completion_rate: number;
      average_vitals_per_visit: number;
    };
    completion_by_vital: Record<string, { completed: number; completion_rate: number }>;
  };
  wait_times: {
    summary: {
      total_waited: number;
      average_wait_time: number;
      median_wait_time: number;
      max_wait_time: number;
    };
    distribution: Record<string, number>;
  };
  period: {
    start_date: string;
    end_date: string;
  };
}

const CHART_COLORS = {
  category: "#3b82f6",
  vitals: "#a855f7",
  wait: "#f59e0b",
  throughput: "#10b981",
};

export default function NursingAnalyticsPage() {
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<ComprehensiveAnalytics | null>(null);
  const [year, setYear] = useState(new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>("year");

  const emptyState = () => setAnalyticsData(null);

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

  const loadAnalytics = async () => {
    const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate);
    if (!range) {
      toast.error("Please select a valid date range");
      return;
    }

    setLoading(true);
    try {
      const qs = buildQueryString({ start: range.start, end: range.end });
      const path = qs
        ? `/visits/nursing-comprehensive-analytics/?${qs.slice(1)}`
        : "/visits/nursing-comprehensive-analytics/";
      const data = await apiFetch<ComprehensiveAnalytics>(path);
      setAnalyticsData(data);
    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast.error(error?.message || "Failed to load nursing analytics");
      emptyState();
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === "year" && year) {
      void loadAnalytics();
    } else if (viewMode === "range" && startDate && endDate) {
      void loadAnalytics();
    }
  }, [viewMode, year, startDate, endDate]);

  const exportCSV = () => {
    if (!analyticsData) {
      toast.error("No data to export");
      return;
    }

    const csvData = [
      ["Nursing Analytics Report"],
      ["Period", `${analyticsData.period.start_date} to ${analyticsData.period.end_date}`],
      [""],
      ["Patient Flow Metrics"],
      ["Total Visits", analyticsData.patient_flow.summary.total_visits],
      ["Completed Flows", analyticsData.patient_flow.summary.completed_flows],
      ["Vitals Completion Rate (%)", analyticsData.patient_flow.summary.vitals_completion_rate.toFixed(2)],
      ["Average Processing Time (min)", analyticsData.patient_flow.summary.average_processing_time.toFixed(2)],
      [""],
      ["Vitals Quality Metrics"],
      ["Overall Completion Rate (%)", analyticsData.vitals_quality.summary.overall_completion_rate.toFixed(2)],
      ["Total Vitals Recorded", analyticsData.vitals_quality.summary.total_vitals_recorded],
      ["Average Vitals per Visit", analyticsData.vitals_quality.summary.average_vitals_per_visit.toFixed(2)],
      [""],
      ["Wait Time Metrics"],
      ["Average Wait Time (min)", analyticsData.wait_times.summary.average_wait_time.toFixed(2)],
      ["Median Wait Time (min)", analyticsData.wait_times.summary.median_wait_time.toFixed(2)],
      ["Max Wait Time (min)", analyticsData.wait_times.summary.max_wait_time.toFixed(2)],
    ];

    const csvContent = csvData.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nursing-analytics-${analyticsData.period.start_date}-to-${analyticsData.period.end_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

  const summaryStats = useMemo(() => {
    if (!analyticsData) return null;

    const flow = analyticsData.patient_flow;
    const vitals = analyticsData.vitals_quality;
    const wait = analyticsData.wait_times;
    const totalPatients = flow.summary.total_visits;

    return {
      totalPatients,
      avgProcessingTime: flow.summary.average_processing_time,
      vitalsCompletedCount: vitals.summary.fully_completed_visits,
      avgWaitTime: wait.summary.average_wait_time,
      processingCategories: Object.entries(flow.category_analysis).map(([category, stats]) => ({
        name: category,
        count: stats.count,
        percentage: totalPatients > 0 ? (stats.count / totalPatients) * 100 : 0,
        avgTime: stats.avg_time,
      })),
      attendanceRows: flow.attendance_by_category,
      attendanceTotals: flow.attendance_totals,
    };
  }, [analyticsData]);

  const categoryChartData = useMemo(() => {
    if (!summaryStats) return [];
    return summaryStats.processingCategories.map((c) => ({
      category: c.name.replace(/_/g, " "),
      patients: c.count,
      avgTime: Number(c.avgTime.toFixed(2)),
    }));
  }, [summaryStats]);

  const vitalsChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.vitals_quality.completion_by_vital).map(([key, value]) => ({
      vital: key.replace(/_/g, " "),
      completionRate: Number(value.completion_rate.toFixed(2)),
    }));
  }, [analyticsData]);

  const waitDistributionChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.wait_times.distribution).map(([range, count]) => ({
      range,
      patients: count,
    }));
  }, [analyticsData]);

  const throughputChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.patient_flow.throughput)
      .map(([hour, count]) => ({
        hour: Number(hour),
        patients: count,
      }))
      .sort((a, b) => a.hour - b.hour);
  }, [analyticsData]);

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const highlightThisMonth =
    viewMode === "range" &&
    Boolean(startDate) &&
    startDate.includes(new Date().toISOString().slice(0, 7));
  const highlightThisYear = viewMode === "year" && year === new Date().getFullYear().toString();

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Nursing Analytics Report"
        reportDescription="Comprehensive nursing performance metrics and patient flow analysis"
        ReportIcon={Activity}
        reportIconClassName="text-violet-500"
        loading={loading}
        onRefresh={loadAnalytics}
        onGenerate={loadAnalytics}
        exportCsvDisabled={!analyticsData}
        onExportCsv={exportCSV}
        printDisabled={!analyticsData}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        year={year}
        onYearChange={setYear}
        startDate={startDate}
        onStartDateChange={setStartDate}
        endDate={endDate}
        onEndDateChange={setEndDate}
        onThisMonth={setThisMonth}
        onThisYear={setThisYear}
        highlightThisMonth={highlightThisMonth}
        highlightThisYear={highlightThisYear}
        yearOptions={years}
      >
        {analyticsData && summaryStats && (
          <>
            <div className="grid gap-4 md:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Patients</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.totalPatients}</p>
                    </div>
                    <Users className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Processing Time</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.avgProcessingTime.toFixed(1)}m</p>
                    </div>
                    <Timer className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Vitals Completed</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.vitalsCompletedCount}</p>
                    </div>
                    <Heart className="h-10 w-10 text-purple-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Wait Time</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.avgWaitTime.toFixed(1)}m</p>
                    </div>
                    <Timer className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Vitals Taken by Category</CardTitle>
                <p className="text-sm text-muted-foreground">Breakdown of visits with nursing vitals by category</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">S/N</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead className="text-right">Male</TableHead>
                      <TableHead className="text-right">Female</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryStats.attendanceRows.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell className="py-3">{row.sn}</TableCell>
                        <TableCell className="py-3 font-medium">{row.label}</TableCell>
                        <TableCell className="py-3 text-right">{row.male}</TableCell>
                        <TableCell className="py-3 text-right">{row.female}</TableCell>
                        <TableCell className="py-3 text-right">{row.total}</TableCell>
                        <TableCell className="py-3 text-right">{row.percentage.toFixed(1)}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell className="py-3" colSpan={2}>TOTAL</TableCell>
                      <TableCell className="py-3 text-right">{summaryStats.attendanceTotals.male}</TableCell>
                      <TableCell className="py-3 text-right">{summaryStats.attendanceTotals.female}</TableCell>
                      <TableCell className="py-3 text-right">{summaryStats.attendanceTotals.total}</TableCell>
                      <TableCell className="py-3 text-right">
                        {summaryStats.attendanceTotals.total > 0 ? "100.0%" : "0.0%"}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Vitals Completion by Type</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(analyticsData.vitals_quality.completion_by_vital).map(([vital, stats]) => (
                    <div key={vital} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium capitalize">{vital.replace(/_/g, " ")}</span>
                        <span>{stats.completion_rate.toFixed(1)}%</span>
                      </div>
                      <Progress value={stats.completion_rate} className="h-2" />
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Category Avg Processing Time</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={categoryChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="category" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="avgTime" fill={CHART_COLORS.category} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Vitals Completion Rates</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={vitalsChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="vital" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="completionRate" fill={CHART_COLORS.vitals} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Wait Time Distribution Chart</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={waitDistributionChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="range" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="patients" fill={CHART_COLORS.wait} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Wait Time Distribution</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {Object.entries(analyticsData.wait_times.distribution).map(([range, count]) => {
                  const total = analyticsData.wait_times.summary.total_waited;
                  const percentage = total > 0 ? (count / total) * 100 : 0;
                  return (
                    <div key={range} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{range}</span>
                        <span>
                          {count} patient{count === 1 ? "" : "s"} ({percentage.toFixed(1)}%)
                        </span>
                      </div>
                      <Progress value={percentage} className="h-2" />
                    </div>
                  );
                })}
              </CardContent>
            </Card>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Throughput by Hour</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={throughputChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="patients" stroke={CHART_COLORS.throughput} strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}
