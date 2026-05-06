"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Heart, Timer, Users, Stethoscope, FileText, TestTube, Pill } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, buildQueryString } from "@/lib/api-client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ConsultationAnalytics } from "@/lib/services";

const CHART_COLORS = {
  sessions: "#3b82f6",
  doctors: "#a855f7",
  rooms: "#f59e0b",
  throughput: "#10b981",
  clinical: "#ef4444",
};

export default function ConsultationAnalyticsPage() {
  const [loading, setLoading] = useState(false);
  const [analyticsData, setAnalyticsData] = useState<ConsultationAnalytics | null>(null);
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

  const loadAnalytics = useCallback(async () => {
    const range = analyticsRangeFromFilters(viewMode, year, startDate, endDate);
    if (!range) {
      toast.error("Please select a valid date range");
      return;
    }

    setLoading(true);
    try {
      const qs = buildQueryString({ start: range.start, end: range.end });
      const path = qs
        ? `/consultation/sessions/comprehensive-analytics/?${qs.slice(1)}`
        : "/consultation/sessions/comprehensive-analytics/";
      const data = await apiFetch<ConsultationAnalytics>(path);
      setAnalyticsData(data);
    } catch (error: any) {
      console.error("Error loading analytics:", error);
      toast.error(error?.message || "Failed to load consultation analytics");
      emptyState();
    } finally {
      setLoading(false);
    }
  }, [viewMode, year, startDate, endDate]);

  useEffect(() => {
    const shouldFetch =
      (viewMode === "year" && year) ||
      (viewMode === "range" && startDate && endDate) ||
      ['daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'half-yearly', 'annually'].includes(viewMode);
    if (shouldFetch) {
      void loadAnalytics();
    }
  }, [viewMode, year, startDate, endDate, loadAnalytics]);

  const exportCSV = () => {
    if (!analyticsData) {
      toast.error("No data to export");
      return;
    }

    const csvData = [
      ["Consultation Analytics Report"],
      ["Period", `${analyticsData.period.start_date} to ${analyticsData.period.end_date}`],
      [""],
      ["Session Metrics"],
      ["Total Sessions", analyticsData.session_metrics.total_sessions],
      ["Completed Sessions", analyticsData.session_metrics.completed_sessions],
      ["Active Sessions", analyticsData.session_metrics.active_sessions],
      ["Completion Rate (%)", analyticsData.session_metrics.completion_rate.toFixed(2)],
      ["Average Duration (min)", analyticsData.session_metrics.avg_duration.toFixed(2)],
      ["Median Duration (min)", analyticsData.session_metrics.median_duration.toFixed(2)],
      ["Max Duration (min)", analyticsData.session_metrics.max_duration.toFixed(2)],
      [""],
      ["Clinical Outcomes"],
      ["Prescriptions", analyticsData.clinical_outcomes.prescriptions],
      ["Lab Orders", analyticsData.clinical_outcomes.lab_orders],
      ["Nursing Orders", analyticsData.clinical_outcomes.nursing_orders],
      [""],
      ["Referrals"],
      ["Total Referrals", analyticsData.referrals.total],
      ["Pending Referrals", analyticsData.referrals.pending],
      ["Completed Referrals", analyticsData.referrals.completed],
      [""],
      ["Diagnoses"],
      ["Total Diagnoses", analyticsData.diagnoses.total],
    ];

    // Add diagnoses by certainty
    Object.entries(analyticsData.diagnoses.by_certainty).forEach(([certainty, count]) => {
      csvData.push([`${certainty} Diagnoses`, count]);
    });

    // Add period breakdowns
    if (analyticsData.by_day?.length) {
      csvData.push([""]);
      csvData.push(["Sessions by Day"]);
      csvData.push(["Date", "Sessions", "Completed"]);
      analyticsData.by_day.forEach((row) => {
        csvData.push([row.date || '', row.sessions, row.completed]);
      });
    }
    if (analyticsData.by_week?.length) {
      csvData.push([""]);
      csvData.push(["Sessions by Week"]);
      csvData.push(["Week", "Sessions", "Completed"]);
      analyticsData.by_week.forEach((row) => {
        csvData.push([row.week || '', row.sessions, row.completed]);
      });
    }
    if (analyticsData.by_month?.length) {
      csvData.push([""]);
      csvData.push(["Sessions by Month"]);
      csvData.push(["Month", "Sessions", "Completed"]);
      analyticsData.by_month.forEach((row) => {
        csvData.push([row.month || '', row.sessions, row.completed]);
      });
    }
    if (analyticsData.by_bimonth?.length) {
      csvData.push([""]);
      csvData.push(["Sessions by Bi-Month"]);
      csvData.push(["Bi-Month", "Sessions", "Completed"]);
      analyticsData.by_bimonth.forEach((row) => {
        csvData.push([row.bimonth || '', row.sessions, row.completed]);
      });
    }
    if (analyticsData.by_quarter?.length) {
      csvData.push([""]);
      csvData.push(["Sessions by Quarter"]);
      csvData.push(["Quarter", "Sessions", "Completed"]);
      analyticsData.by_quarter.forEach((row) => {
        csvData.push([row.quarter || '', row.sessions, row.completed]);
      });
    }
    if (analyticsData.by_halfyear?.length) {
      csvData.push([""]);
      csvData.push(["Sessions by Half-Year"]);
      csvData.push(["Half-Year", "Sessions", "Completed"]);
      analyticsData.by_halfyear.forEach((row) => {
        csvData.push([row.halfyear || '', row.sessions, row.completed]);
      });
    }

    const csvContent = csvData.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `consultation-analytics-${analyticsData.period.start_date}-to-${analyticsData.period.end_date}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

  const summaryStats = useMemo(() => {
    if (!analyticsData) return null;

    const metrics = analyticsData.session_metrics;
    const clinical = analyticsData.clinical_outcomes;
    const totalSessions = metrics.total_sessions;

    return {
      totalSessions,
      completedSessions: metrics.completed_sessions,
      avgDuration: metrics.avg_duration,
      completionRate: metrics.completion_rate,
      attendanceRows: analyticsData.patient_demographics.attendance_by_category,
      attendanceTotals: analyticsData.patient_demographics.attendance_totals,
    };
  }, [analyticsData]);

  const sessionDurationChartData = useMemo(() => {
    if (!analyticsData) return [];
    return [
      {
        metric: "Average",
        duration: Number(analyticsData.session_metrics.avg_duration.toFixed(2)),
      },
      {
        metric: "Median",
        duration: Number(analyticsData.session_metrics.median_duration.toFixed(2)),
      },
      {
        metric: "Maximum",
        duration: Number(analyticsData.session_metrics.max_duration.toFixed(2)),
      },
    ];
  }, [analyticsData]);

  const clinicalOutcomesChartData = useMemo(() => {
    if (!analyticsData) return [];
    const clinical = analyticsData.clinical_outcomes;
    return [
      {
        type: "Prescriptions",
        count: clinical.prescriptions,
      },
      {
        type: "Lab Orders",
        count: clinical.lab_orders,
      },
      {
        type: "Nursing Orders",
        count: clinical.nursing_orders,
      },
    ];
  }, [analyticsData]);

  const throughputChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.throughput)
      .map(([hour, count]) => ({
        hour: Number(hour),
        sessions: count,
      }))
      .sort((a, b) => a.hour - b.hour);
  }, [analyticsData]);

  const doctorProductivityChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.doctor_productivity)
      .map(([doctor, stats]) => ({
        doctor: doctor.split(' ')[0], // First name only for chart
        sessions: stats.sessions,
        completed: stats.completed,
        avgDuration: Number(stats.avg_duration.toFixed(2)),
      }))
      .sort((a, b) => b.sessions - a.sessions)
      .slice(0, 10); // Top 10 doctors
  }, [analyticsData]);

  const periodBreakdown = useMemo(() => {
    if (!analyticsData) return [];
    let source: any[] = [];
    let key = '';
    let label = '';
    if (viewMode === 'daily' || viewMode === 'range') {
      source = analyticsData.by_day || [];
      key = 'date';
      label = 'Day';
    } else if (viewMode === 'weekly') {
      source = analyticsData.by_week || [];
      key = 'week';
      label = 'Week';
    } else if (viewMode === 'monthly' || viewMode === 'annually' || viewMode === 'year') {
      source = analyticsData.by_month || [];
      key = 'month';
      label = 'Month';
    } else if (viewMode === 'bimonthly') {
      source = analyticsData.by_bimonth || [];
      key = 'bimonth';
      label = 'Bi-Month';
    } else if (viewMode === 'quarterly') {
      source = analyticsData.by_quarter || [];
      key = 'quarter';
      label = 'Quarter';
    } else if (viewMode === 'half-yearly') {
      source = analyticsData.by_halfyear || [];
      key = 'halfyear';
      label = 'Half-Year';
    }
    return source.map((row) => ({
      period: row[key] ?? '',
      sessions: row.sessions,
      completed: row.completed,
    }));
  }, [analyticsData, viewMode]);

  const years = Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());
  const highlightThisMonth =
    viewMode === "range" &&
    Boolean(startDate) &&
    startDate.includes(new Date().toISOString().slice(0, 7));
  const highlightThisYear = viewMode === "year" && year === new Date().getFullYear().toString();

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Consultation Analytics Report"
        reportDescription="Comprehensive consultation performance metrics and clinical outcomes analysis"
        ReportIcon={Stethoscope}
        reportIconClassName="text-blue-500"
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sessions</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.totalSessions}</p>
                    </div>
                    <Activity className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completed</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.completedSessions}</p>
                    </div>
                    <Users className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Duration</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.avgDuration.toFixed(1)}m</p>
                    </div>
                    <Timer className="h-10 w-10 text-purple-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completion Rate</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.completionRate.toFixed(1)}%</p>
                    </div>
                    <Heart className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>Sessions by Room</CardTitle>
                <p className="text-sm text-muted-foreground">Breakdown of consultation sessions by room</p>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-14">S/N</TableHead>
                      <TableHead>Room</TableHead>
                      <TableHead className="text-right">Sessions</TableHead>
                      <TableHead className="text-right">Completed</TableHead>
                      <TableHead className="text-right">Avg Duration (min)</TableHead>
                      <TableHead className="text-right">%</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(analyticsData.room_utilization).map(([room, stats], index) => (
                      <TableRow key={room}>
                        <TableCell className="py-3">{index + 1}</TableCell>
                        <TableCell className="py-3 font-medium">{room}</TableCell>
                        <TableCell className="py-3 text-right">{stats.sessions}</TableCell>
                        <TableCell className="py-3 text-right">{stats.completed}</TableCell>
                        <TableCell className="py-3 text-right">{stats.avg_duration.toFixed(1)}</TableCell>
                        <TableCell className="py-3 text-right">
                          {summaryStats.totalSessions > 0 ? ((stats.sessions / summaryStats.totalSessions) * 100).toFixed(1) : "0.0"}%
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="font-semibold">
                      <TableCell className="py-3" colSpan={2}>TOTAL</TableCell>
                      <TableCell className="py-3 text-right">{summaryStats.totalSessions}</TableCell>
                      <TableCell className="py-3 text-right">{summaryStats.completedSessions}</TableCell>
                      <TableCell className="py-3 text-right">{summaryStats.avgDuration.toFixed(1)}</TableCell>
                      <TableCell className="py-3 text-right">100.0%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sessions by Period</CardTitle>
                <CardDescription>Number of consultation sessions in the selected period breakdown</CardDescription>
              </CardHeader>
              <CardContent className="h-72">
                {periodBreakdown.length === 0 ? (
                  <div className="flex items-center justify-center h-full text-muted-foreground">
                    No data available for the selected period
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={periodBreakdown}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="sessions" name="Total Sessions" fill={CHART_COLORS.sessions} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" name="Completed Sessions" fill={CHART_COLORS.doctors} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Patient Attendance by Category</CardTitle>
                <p className="text-sm text-muted-foreground">Breakdown of consultation sessions by patient category</p>
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
                  <CardTitle>Session Duration Metrics</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={sessionDurationChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="metric" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="duration" fill={CHART_COLORS.sessions} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Clinical Outcomes</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={clinicalOutcomesChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="type" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS.clinical} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Session Throughput by Hour</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={throughputChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="hour" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="sessions" stroke={CHART_COLORS.throughput} strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Top Doctor Productivity</CardTitle>
                  <p className="text-sm text-muted-foreground">Sessions completed by top performing doctors</p>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={doctorProductivityChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="doctor" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="completed" fill={CHART_COLORS.doctors} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Room Utilization</CardTitle>
                  <p className="text-sm text-muted-foreground">Consultation sessions by room</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(analyticsData.room_utilization).map(([room, stats]) => (
                    <div key={room} className="space-y-2">
                      <div className="flex items-center justify-between text-sm">
                        <span className="font-medium">{room}</span>
                        <span>{stats.completed} / {stats.sessions} sessions</span>
                      </div>
                      <Progress value={(stats.completed / stats.sessions) * 100} className="h-2" />
                      <div className="text-xs text-muted-foreground">
                        Avg duration: {stats.avg_duration.toFixed(1)} min
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Referral Status</CardTitle>
                  <p className="text-sm text-muted-foreground">Referral completion status</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Completed</span>
                      <span>{analyticsData.referrals.completed}</span>
                    </div>
                    <Progress
                      value={analyticsData.referrals.total > 0 ? (analyticsData.referrals.completed / analyticsData.referrals.total) * 100 : 0}
                      className="h-2"
                    />
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">Pending</span>
                      <span>{analyticsData.referrals.pending}</span>
                    </div>
                    <Progress
                      value={analyticsData.referrals.total > 0 ? (analyticsData.referrals.pending / analyticsData.referrals.total) * 100 : 0}
                      className="h-2"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}
