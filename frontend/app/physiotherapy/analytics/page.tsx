'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import {
  AnalyticsReportLayout,
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from '@/components/analytics/AnalyticsReportLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { apiFetch, getReadableApiError } from '@/lib/api-client';
import { physioService, type PhysiotherapyAnalyticsSummary } from '@/lib/services';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth } from 'date-fns';
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

import { Activity, Users, Clock, TrendingUp } from 'lucide-react';

const CHART_COLORS = {
  primary: "#3b82f6",
  secondary: "#a855f7",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
  muted: "#64748b",
};

function toYmd(d: Date) {
  return format(d, 'yyyy-MM-dd');
}

function physiotherapyAnalyticsToCsv(
  d: PhysiotherapyAnalyticsSummary,
  viewMode: AnalyticsViewMode,
  year: string,
  start: string,
  end: string
) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  const periodLabel = viewMode === 'year' ? year : `${start}_to_${end}`;
  lines.push(['Physiotherapy analytics', periodLabel].map(esc).join(','));
  lines.push(['Period start', d.period.start_date].map(esc).join(','));
  lines.push(['Period end', d.period.end_date].map(esc).join(','));
  lines.push('');
  lines.push(['Session metric', 'Value'].map(esc).join(','));
  lines.push(['total_sessions', String(d.session_metrics.total_sessions)].map(esc).join(','));
  lines.push(['completed_sessions', String(d.session_metrics.completed_sessions)].map(esc).join(','));
  lines.push(['avg_duration', String(d.session_metrics.avg_duration)].map(esc).join(','));
  lines.push(['completion_rate', String(d.session_metrics.completion_rate)].map(esc).join(','));
  lines.push('');
  lines.push(['Category', 'Male', 'Female', 'Total', 'Percentage'].map(esc).join(','));
  d.patient_demographics.attendance_by_category.forEach((row) =>
    lines.push(
      [row.label, String(row.male), String(row.female), String(row.total), String(row.percentage)].map(esc).join(',')
    )
  );
  return lines.join('\n');
}

export default function PhysiotherapyAnalyticsPage() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PhysiotherapyAnalyticsSummary | null>(null);

  const range = useMemo(
    () => analyticsRangeFromFilters(viewMode, year, startDate, endDate),
    [viewMode, year, startDate, endDate]
  );

  const highlightThisMonth =
    viewMode === 'range' &&
    Boolean(startDate) &&
    startDate.includes(new Date().toISOString().slice(0, 7));
  const highlightThisYear = viewMode === 'year' && year === new Date().getFullYear().toString();

  const fetchReport = useCallback(async () => {
    const r = analyticsRangeFromFilters(viewMode, year, startDate, endDate);
    if (!r) {
      if (viewMode === 'range') toast.error('Please select start and end dates');
      return;
    }
    setLoading(true);
    try {
      const res = await physioService.getAnalyticsSummary({ start_date: r.start, end_date: r.end });
      setData(res);
    } catch (e: unknown) {
      console.error(e);
      toast.error(getReadableApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [viewMode, year, startDate, endDate]);

  useEffect(() => {
    const shouldFetch =
      (viewMode === 'year' && year) ||
      (viewMode === 'range' && startDate && endDate) ||
      ['daily', 'weekly', 'monthly', 'bimonthly', 'quarterly', 'half-yearly', 'annually'].includes(viewMode);
    if (shouldFetch) {
      void fetchReport();
    }
  }, [viewMode, year, startDate, endDate, fetchReport]);

  const periodBreakdown = useMemo(() => {
    if (!data) return [];
    let source: any[] = [];
    let key = '';
    let label = '';
    if (viewMode === 'daily' || viewMode === 'range') {
      source = data.by_day || [];
      key = 'date';
      label = 'Day';
    } else if (viewMode === 'weekly') {
      source = data.by_week || [];
      key = 'week';
      label = 'Week';
    } else if (viewMode === 'monthly' || viewMode === 'bimonthly' || viewMode === 'annually' || viewMode === 'year') {
      source = data.by_month || [];
      key = 'month';
      label = 'Month';
    } else if (viewMode === 'bimonthly') {
      source = data.by_bimonth || [];
      key = 'bimonth';
      label = 'Bi-Month';
    } else if (viewMode === 'quarterly') {
      source = data.by_quarter || [];
      key = 'quarter';
      label = 'Quarter';
    } else if (viewMode === 'half-yearly') {
      source = data.by_halfyear || [];
      key = 'halfyear';
      label = 'Half-Year';
    }
    return source.map((row) => ({
      period: row[key] ?? '',
      sessions: row.sessions || 0,
      completed: row.completed || 0,
    }));
  }, [data, viewMode]);

  const setThisMonth = () => {
    const n = new Date();
    setStartDate(toYmd(startOfMonth(n)));
    setEndDate(toYmd(endOfMonth(n)));
    setViewMode('range');
  };

  const setThisYear = () => {
    setYear(new Date().getFullYear().toString());
    setViewMode('year');
  };

  const exportCsv = () => {
    if (!data || !range) {
      toast.error('No data to export');
      return;
    }
    const csv = physiotherapyAnalyticsToCsv(data, viewMode, year, startDate, endDate);
    const period = viewMode === 'year' ? year : `${startDate}_to_${endDate}`;
    triggerCsvDownload(`physiotherapy_analytics_${period}.csv`, csv);
    toast.success('Exported CSV');
  };

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Physiotherapy analytics"
        reportDescription="Session activity, patient demographics, and treatment outcomes."
        ReportIcon={Activity}
        reportIconClassName="text-emerald-600 dark:text-emerald-400"
        loading={loading}
        onRefresh={fetchReport}
        onGenerate={fetchReport}
        exportCsvDisabled={!data}
        onExportCsv={exportCsv}
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sessions</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.session_metrics.total_sessions}</p>
                    </div>
                    <Activity className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completed Sessions</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.session_metrics.completed_sessions}</p>
                    </div>
                      <TrendingUp className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Avg Duration (min)</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.session_metrics.avg_duration.toFixed(1)}</p>
                    </div>
                    <Clock className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-cyan-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Completion Rate (%)</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.session_metrics.completion_rate.toFixed(1)}</p>
                    </div>
                    <Users className="h-10 w-10 text-cyan-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Sessions by Period</CardTitle>
                <CardDescription>Number of physiotherapy sessions in the selected period breakdown</CardDescription>
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
                      <Bar dataKey="sessions" name="Total Sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="completed" name="Completed Sessions" fill="#a855f7" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Patient Attendance by Category</CardTitle>
                <CardDescription>Breakdown of physiotherapy sessions by patient category</CardDescription>
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
                      {data.patient_demographics.attendance_by_category.map((row) => (
                        <TableRow key={row.key}>
                          <TableCell className="py-2">{row.sn}</TableCell>
                          <TableCell className="py-2 font-medium">{row.label}</TableCell>
                          <TableCell className="py-2 text-right">{row.male}</TableCell>
                          <TableCell className="py-2 text-right">{row.female}</TableCell>
                          <TableCell className="py-2 text-right">{row.total}</TableCell>
                          <TableCell className="py-2 text-right">{row.percentage.toFixed(1)}%</TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell className="py-2" colSpan={2}>TOTAL</TableCell>
                        <TableCell className="py-2 text-right">{data.patient_demographics.attendance_totals.male}</TableCell>
                        <TableCell className="py-2 text-right">{data.patient_demographics.attendance_totals.female}</TableCell>
                        <TableCell className="py-2 text-right">{data.patient_demographics.attendance_totals.total}</TableCell>
                        <TableCell className="py-2 text-right">100.0%</TableCell>
                      </TableRow>
                    </TableBody>
                </Table>
              </CardContent>
            </Card>
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