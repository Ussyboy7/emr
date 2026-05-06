"use client";

import React, { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import {
  AnalyticsReportLayout,
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from "@/components/analytics/AnalyticsReportLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Activity, Heart, Timer, Users } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, buildQueryString } from "@/lib/api-client";
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { nursingService, type NursingAnalyticsSummary } from '@/lib/services';

type ComprehensiveAnalytics = NursingAnalyticsSummary;

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
      const data = await nursingService.getAnalyticsSummary(range.start, range.end);
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
    const shouldFetch =
      (viewMode === "year" && year) ||
      (viewMode === "range" && startDate && endDate) ||
      ['daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'half-yearly', 'annually'].includes(viewMode);
    if (shouldFetch) {
      void loadAnalytics();
    }
  }, [viewMode, year, startDate, endDate]);

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
      orders: row.orders,
      completed: row.completed,
    }));
  }, [analyticsData, viewMode]);

  const exportCSV = () => {
    if (!analyticsData) {
      toast.error("No data to export");
      return;
    }

    const csvData = [
      ["Nursing Analytics Report"],
      ["Period", `${analyticsData.period.start} to ${analyticsData.period.end}`],
      [""],
      ["Summary"],
      ["Total Orders", analyticsData.summary.total_orders],
      ["Completed Orders", analyticsData.summary.completed_orders],
      ["Pending Orders", analyticsData.summary.pending_orders],
      ["Unique Patients", analyticsData.summary.unique_patients],
      [""],
      ["Orders by Status"],
    ].concat(
      Object.entries(analyticsData.orders_by_status).map(([status, count]) => [status, count])
    ).concat([
      [""],
      ["Orders by Priority"],
    ]).concat(
      Object.entries(analyticsData.orders_by_priority).map(([priority, count]) => [priority, count])
    ).concat([
      [""],
      ["Orders by Type"],
    ]).concat(
      Object.entries(analyticsData.orders_by_type).map(([type, count]) => [type, count])
    ).concat([
      [""],
      ["Orders by Day"],
      ["Date", "Orders", "Completed"],
    ]).concat(
      (analyticsData.by_day || []).map((row) => [row.date || '', row.orders, row.completed])
    ).concat([
      [""],
      ["Orders by Week"],
      ["Week", "Orders", "Completed"],
    ]).concat(
      (analyticsData.by_week || []).map((row) => [row.week || '', row.orders, row.completed])
    ).concat([
      [""],
      ["Orders by Month"],
      ["Month", "Orders", "Completed"],
    ]).concat(
      (analyticsData.by_month || []).map((row) => [row.month || '', row.orders, row.completed])
    ).concat([
      [""],
      ["Orders by Bi-Month"],
      ["Bi-Month", "Orders", "Completed"],
    ]).concat(
      (analyticsData.by_bimonth || []).map((row) => [row.bimonth || '', row.orders, row.completed])
    ).concat([
      [""],
      ["Orders by Quarter"],
      ["Quarter", "Orders", "Completed"],
    ]).concat(
      (analyticsData.by_quarter || []).map((row) => [row.quarter || '', row.orders, row.completed])
    ).concat([
      [""],
      ["Orders by Half-Year"],
      ["Half-Year", "Orders", "Completed"],
    ]).concat(
      (analyticsData.by_halfyear || []).map((row) => [row.halfyear || '', row.orders, row.completed])
    );

    const csvContent = csvData.map((row) => row.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `nursing-analytics-${analyticsData.period.start}-to-${analyticsData.period.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Report exported successfully");
  };

  const summaryStats = useMemo(() => {
    if (!analyticsData) return null;

    const totalOrders = analyticsData.summary.total_orders;
    const uniquePatients = analyticsData.summary.unique_patients;

    // Use patient demographics for attendance
    const attendanceRows = Object.entries(analyticsData.patients_by_category).map(([key, count]) => ({
      sn: Object.keys(analyticsData.patients_by_category).indexOf(key) + 1,
      key,
      label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
      male: 0, // Simplified - not breaking down by gender for now
      female: 0,
      total: Number(count || 0),
      percentage: uniquePatients > 0 ? ((count / uniquePatients) * 100) : 0,
    }));

    const attendanceTotals = {
      male: analyticsData.patients_by_gender.male || 0,
      female: analyticsData.patients_by_gender.female || 0,
      total: uniquePatients,
    };

    return {
      totalOrders,
      completedOrders: analyticsData.summary.completed_orders,
      pendingOrders: analyticsData.summary.pending_orders,
      uniquePatients,
      vitalsCompletedCount: analyticsData.summary.completed_orders, // Use completed orders as proxy
      attendanceRows,
      attendanceTotals,
    };
  }, [analyticsData]);

  const statusChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.orders_by_status).map(([status, count]) => ({
      name: status.replace(/_/g, " "),
      count: Number(count || 0),
    }));
  }, [analyticsData]);

  const priorityChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.orders_by_priority).map(([priority, count]) => ({
      name: priority,
      count: Number(count || 0),
    }));
  }, [analyticsData]);

  const typeChartData = useMemo(() => {
    if (!analyticsData) return [];
    return Object.entries(analyticsData.orders_by_type).map(([type, count]) => ({
      name: type.replace(/_/g, " "),
      count: Number(count || 0),
    }));
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
                      <p className="text-sm text-muted-foreground">Total Orders</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.totalOrders}</p>
                    </div>
                    <Activity className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completed Orders</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.completedOrders}</p>
                    </div>
                    <Users className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Orders</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.pendingOrders}</p>
                    </div>
                    <Timer className="h-10 w-10 text-purple-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Unique Patients</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.uniquePatients}</p>
                    </div>
                    <Heart className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Pending Orders</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.pendingOrders}</p>
                    </div>
                    <Timer className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-purple-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Orders Completed</p>
                      <p className="text-2xl sm:text-3xl font-bold">{summaryStats.completedOrders}</p>
                    </div>
                    <Heart className="h-10 w-10 text-purple-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completion Rate</p>
                      <p className="text-2xl sm:text-3xl font-bold">
                        {summaryStats.totalOrders > 0
                          ? ((summaryStats.completedOrders / summaryStats.totalOrders) * 100).toFixed(1)
                          : "0.0"}%
                      </p>
                    </div>
                    <Timer className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Orders by Period</CardTitle>
                <CardDescription>Number of nursing orders in the selected period breakdown</CardDescription>
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
                      <Bar dataKey="orders" name="Total Orders" fill={CHART_COLORS.category} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" name="Completed Orders" fill={CHART_COLORS.vitals} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

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
                  <CardTitle>Order Types Distribution</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {Object.entries(analyticsData.orders_by_type).map(([type, count]) => {
                    const total = analyticsData.summary.total_orders;
                    const percentage = total > 0 ? (count / total) * 100 : 0;
                    return (
                      <div key={type} className="space-y-2">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium capitalize">{type.replace(/_/g, " ")}</span>
                          <span>{count} ({percentage.toFixed(1)}%)</span>
                        </div>
                        <Progress value={percentage} className="h-2" />
                      </div>
                    );
                  })}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Orders by Priority</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priorityChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS.category} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Orders by Status</CardTitle>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={statusChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 12 }} />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS.vitals} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Orders by Priority</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={priorityChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS.wait} radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Orders by Type</CardTitle>
                </CardHeader>
                <CardContent className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={typeChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="count" fill={CHART_COLORS.throughput} radius={[4, 4, 0, 0]} />
                    </BarChart>
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
