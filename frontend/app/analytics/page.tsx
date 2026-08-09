'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from '@/components/analytics/AnalyticsReportLayout';
import { useReportDateRange } from "@/hooks/use-report-date-range";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiFetch, getReadableApiError } from '@/lib/api-client';
import { useAnalyticsExportHandlers } from "@/lib/analytics-export";
import { analyticsService, type ClinicalDashboardData } from '@/lib/services';
import { toast } from 'sonner';
import { endOfMonth, startOfMonth } from 'date-fns';
import { toApiDateString, peekServerTodayMonthPrefix, peekServerTodayYear } from '@/lib/dates';
import { buildReportPeriodQuery, canFetchReportPeriod } from '@/lib/report-period-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Activity, Users, Clock, TrendingUp, Users2, Heart, Stethoscope, Pill, CheckCircle } from 'lucide-react';

const CHART_COLORS = {
  primary: "#3b82f6",
  secondary: "#a855f7",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
  muted: "#64748b",
};

export default function ClinicalAnalyticsPage() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const { handleExportCsv, handleDownloadPdf } = useAnalyticsExportHandlers({
    apiPath: "/analytics/dashboard/",
    filenameBase: "clinical_analytics",
    viewMode,
    year,
    startDate,
    endDate,
    queryStyle: "start_date",
  });

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClinicalDashboardData | null>(null);

  const range = useMemo(
    () => reportRange,
    [reportRange]
  );

  const highlightThisMonth =
    viewMode === 'range' &&
    Boolean(startDate) &&
    startDate.includes(peekServerTodayMonthPrefix());
  const highlightThisYear = viewMode === 'year' && year === peekServerTodayYear();

  const fetchReport = useCallback(async () => {
    const params = buildReportPeriodQuery(viewMode, reportRange, 'start_date');
    if (!params) {
      if (viewMode === 'range') toast.error('Please select start and end dates');
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<ClinicalDashboardData>(`/analytics/dashboard/?${params.toString()}`);
      setData(res);
    } catch (e: unknown) {
      console.error(e);
      toast.error(getReadableApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportRange, viewMode]);

  useEffect(() => {
    if (canFetchReportPeriod(viewMode, reportRange)) {
      void fetchReport();
    }
  }, [reportRange, fetchReport, viewMode]);

  const setThisMonth = () => {
    const n = new Date();
    setStartDate(toApiDateString(startOfMonth(n)));
    setEndDate(toApiDateString(endOfMonth(n)));
    setViewMode('range');
  };

  const setThisYear = () => {
    setYear(new Date().getFullYear().toString());
    setViewMode('year');
  };


  // Prepare chart data
  const visitsTrendData = useMemo(() => {
    if (!data?.visits_trend) return [];
    return data.visits_trend.map(item => ({
      month: item.month,
      totalVisits: item.visits,
      newPatients: item.newPatients ?? 0,
    }));
  }, [data]);

  const clinicDistributionData = useMemo(() => {
    if (!data?.clinic_distribution) return [];
    return Object.entries(data.clinic_distribution).map(([clinic, visits]) => ({
      name: clinic,
      value: visits,
      percentage: data.metrics.total_visits > 0 ? (visits / data.metrics.total_visits * 100).toFixed(1) : '0'
    }));
  }, [data]);

  const weeklyActivityData = useMemo(() => {
    if (!data?.weekly_activity) return [];
    return data.weekly_activity.map(item => ({
      day: item.day,
      patients: item.patients,
      consultations: item.consultations,
      labTests: item.lab_tests,
      prescriptions: item.prescriptions
    }));
  }, [data]);

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Clinical analytics dashboard"
        reportDescription="Cross-cutting performance views: visits, clinics, labs, pharmacy, and consultations."
        ReportIcon={Activity}
        reportIconClassName="text-blue-600 dark:text-blue-400"
        loading={loading}
        onGenerate={fetchReport}
        exportCsvDisabled={!data}
        onExportCsv={handleExportCsv}
        onPrint={handleDownloadPdf}
        printDisabled={!data}
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
        contentClassName="max-w-7xl mx-auto"
      >
        {data && (
          <>
            {/* Summary Cards */}
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Patients</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.metrics.total_patients.toLocaleString()}</p>
                    </div>
                    <Users className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Visits</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.metrics.total_visits.toLocaleString()}</p>
                    </div>
                      <Activity className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Wait Time</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.metrics.avg_wait_time_minutes} min</p>
                    </div>
                    <Clock className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-cyan-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completion Rate</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.metrics.completion_rate_percentage}%</p>
                    </div>
                    <CheckCircle className="h-10 w-10 text-cyan-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Overview Section */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Overview</CardTitle>
                <CardDescription>Key performance indicators across departments</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{data.overview.patients.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Patients</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{data.overview.clinical.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Clinical</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-amber-600">{data.overview.laboratory.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Laboratory</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{data.overview.pharmacy.toLocaleString()}</div>
                    <div className="text-sm text-muted-foreground">Pharmacy</div>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Charts Grid */}
            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">New Patient Registrations</CardTitle>
                  <CardDescription>Monthly patient registrations over time</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={visitsTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Bar dataKey="newPatients" name="New Patients" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patient Demographics</CardTitle>
                  <CardDescription>Distribution by patient category</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={Object.entries(data.patient_demographics_percentages).map(([key, value]) => ({
                          name: key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase()),
                          value,
                          fill: Object.values(CHART_COLORS)[Object.keys(data.patient_demographics_percentages).indexOf(key) % Object.values(CHART_COLORS).length]
                        }))}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}%`}
                      />
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top Diagnoses</CardTitle>
                  <CardDescription>Most common diagnoses this period</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {data.top_diagnoses.slice(0, 10).map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-1 border-b border-border">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-muted-foreground">{index + 1}</span>
                          <span className="text-sm">{item.diagnosis}</span>
                        </div>
                        <span className="text-sm font-medium">{item.cases} cases</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Consultation Metrics</CardTitle>
                  <CardDescription>Session activity and patient timing</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{data.consultation_metrics.completed_sessions}</div>
                      <div className="text-sm text-muted-foreground">Completed Sessions</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{data.consultation_metrics.avg_duration} min</div>
                      <div className="text-sm text-muted-foreground">Avg Duration</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600">{data.consultation_metrics.avg_wait_time} min</div>
                      <div className="text-sm text-muted-foreground">Avg Wait Time</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Test Distribution</CardTitle>
                  <CardDescription>Most requested laboratory tests</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {data.test_distribution.map((item, index) => (
                      <div key={index} className="flex justify-between items-center py-1">
                        <span className="text-sm">{item.test}:</span>
                        <span className="text-sm font-medium">{item.count}</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Lab Performance</CardTitle>
                  <CardDescription>Test completion and turnaround times</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{data.lab_metrics.tests_this_month}</div>
                      <div className="text-sm text-muted-foreground">Tests This Month</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{data.lab_metrics.avg_turnaround_hours} hrs</div>
                      <div className="text-sm text-muted-foreground">Avg Turnaround</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600">{data.lab_metrics.completion_rate}%</div>
                      <div className="text-sm text-muted-foreground">Completion Rate</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dispensing Trend</CardTitle>
                  <CardDescription>Monthly dispensing activity</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={visitsTrendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="totalVisits" name="Dispensed" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                      <Line type="monotone" dataKey="newPatients" name="Pending" stroke={CHART_COLORS.warning} strokeWidth={2} />
                    </ComposedChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Pharmacy Metrics</CardTitle>
                  <CardDescription>Dispensing performance indicators</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-600">{data.pharmacy_metrics.dispensed_this_month}</div>
                      <div className="text-sm text-muted-foreground">Dispensed This Month</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-green-600">{data.pharmacy_metrics.pending_orders}</div>
                      <div className="text-sm text-muted-foreground">Pending Orders</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-amber-600">{data.pharmacy_metrics.avg_wait_time} min</div>
                      <div className="text-sm text-muted-foreground">Avg Wait Time</div>
                    </div>
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

function triggerCsvDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function EmptyChart() {
  return <p className="text-sm text-muted-foreground h-full flex items-center justify-center">No data in this period</p>;
}
