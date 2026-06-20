'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from '@/components/analytics/AnalyticsReportLayout';
import { useReportDateRange } from '@/hooks/use-report-date-range';
import { useEyecarePageAuth } from '@/hooks/use-eyecare-page-auth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getReadableApiError } from '@/lib/api-client';
import { useAnalyticsExportHandlers } from '@/lib/analytics-export';
import { eyecareService, type EyecareAnalyticsSummary } from '@/lib/services';
import { toast } from 'sonner';
import { endOfMonth, startOfMonth } from 'date-fns';
import { toApiDateString, peekServerTodayMonthPrefix, peekServerTodayYear } from '@/lib/dates';
import { buildReportPeriodQuery, canFetchReportPeriod } from '@/lib/report-period-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Eye, Users, Clock, TrendingUp } from 'lucide-react';

export default function EyecareAnalyticsPage() {
  const { ready, handleAuthError } = useEyecarePageAuth();
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const { handleExportCsv, handleDownloadPdf } = useAnalyticsExportHandlers({
    apiPath: '/eyecare/analytics/summary/',
    filenameBase: 'eyecare_analytics',
    viewMode,
    year,
    startDate,
    endDate,
    queryStyle: 'start_date',
  });

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<EyecareAnalyticsSummary | null>(null);

  const range = useMemo(() => reportRange, [reportRange]);

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
      const res = await eyecareService.getAnalyticsSummary(params);
      setData(res);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      console.error(e);
      toast.error(getReadableApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [reportRange, viewMode, handleAuthError]);

  useEffect(() => {
    if (!ready || !canFetchReportPeriod(viewMode, reportRange)) return;
    void fetchReport();
  }, [ready, reportRange, fetchReport, viewMode]);

  const periodBreakdown = useMemo(() => {
    if (!data) return [];
    let source: Array<Record<string, unknown>> = [];
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
    } else if (viewMode === 'monthly' || viewMode === 'annually' || viewMode === 'year') {
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
      period: String(row[key] ?? ''),
      sessions: Number(row.sessions || 0),
      completed: Number(row.completed || 0),
    }));
  }, [data, viewMode]);

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

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center min-h-[40vh] text-muted-foreground">Loading…</div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Eyecare analytics"
        reportDescription="Session activity, patient demographics, and treatment outcomes."
        ReportIcon={Eye}
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
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Sessions</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.session_metrics.total_sessions}</p>
                    </div>
                    <Eye className="h-10 w-10 text-blue-500 opacity-50" />
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
                <CardDescription>Number of eyecare sessions in the selected period breakdown</CardDescription>
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
                <CardDescription>Breakdown of eyecare sessions by patient category</CardDescription>
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
