'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useStaleRequestGuard } from '@/hooks/use-paginated-list-guard';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import {
  AnalyticsReportLayout,
  type AnalyticsViewMode,
} from '@/components/analytics/AnalyticsReportLayout';
import { useReportDateRange } from "@/hooks/use-report-date-range";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getReadableApiError } from '@/lib/api-client';
import { useAnalyticsExportHandlers } from "@/lib/analytics-export";
import { radiologyService, type RadiologyAnalyticsSummary } from '@/lib/services';
import { toast } from 'sonner';
import { endOfMonth, startOfMonth } from 'date-fns';
import { toApiDateString, peekServerTodayMonthPrefix, peekServerTodayYear } from '@/lib/dates';
import { buildReportPeriodQuery, canFetchReportPeriod } from '@/lib/report-period-query';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { Activity, BarChart3, ScanLine, Users } from 'lucide-react';

const CHART_COLORS = {
  primary: "#3b82f6",
  secondary: "#a855f7",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
  muted: "#64748b",
};

function triggerCsvDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function radiologyAnalyticsToCsv(
  d: RadiologyAnalyticsSummary,
  viewMode: AnalyticsViewMode,
  year: string,
  start: string,
  end: string
) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  const periodLabel = viewMode === 'year' ? year : `${start}_to_${end}`;
  lines.push(['Radiology analytics', periodLabel].map(esc).join(','));
  lines.push(['Period start', d.period.start].map(esc).join(','));
  lines.push(['Period end', d.period.end].map(esc).join(','));
  lines.push('');
  lines.push(['Summary metric', 'Value'].map(esc).join(','));
  Object.entries(d.summary).forEach(([k, v]) => lines.push([k, String(v)].map(esc).join(',')));
  lines.push('');
  if (d.by_day?.length) {
    lines.push(['Day', 'Studies', 'Orders'].map(esc).join(','));
    d.by_day.forEach((row) => lines.push([row.date || '', String(row.studies), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_week?.length) {
    lines.push('');
    lines.push(['Week', 'Studies', 'Orders'].map(esc).join(','));
    d.by_week.forEach((row) => lines.push([row.week || '', String(row.studies), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_month?.length) {
    lines.push('');
    lines.push(['Month', 'Studies', 'Orders'].map(esc).join(','));
    d.by_month.forEach((row) => lines.push([row.month || '', String(row.studies), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_bimonth?.length) {
    lines.push('');
    lines.push(['Bi-Month', 'Studies', 'Orders'].map(esc).join(','));
    d.by_bimonth.forEach((row) => lines.push([row.bimonth || '', String(row.studies), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_quarter?.length) {
    lines.push('');
    lines.push(['Quarter', 'Studies', 'Orders'].map(esc).join(','));
    d.by_quarter.forEach((row) => lines.push([row.quarter || '', String(row.studies), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_halfyear?.length) {
    lines.push('');
    lines.push(['Half-Year', 'Studies', 'Orders'].map(esc).join(','));
    d.by_halfyear.forEach((row) => lines.push([row.halfyear || '', String(row.studies), String(row.orders)].map(esc).join(',')));
  }
  lines.push('');
  lines.push(['Procedure', 'Count'].map(esc).join(','));
  (d.top_procedures || []).forEach((p) => lines.push([p.procedure, String(p.count)].map(esc).join(',')));

  lines.push('');
  lines.push(['Processing method', 'Count'].map(esc).join(','));
  const processingSummary = d.studies_processing_summary;
  if (processingSummary) {
    lines.push(['In-house', String(processingSummary.in_house)].map(esc).join(','));
    lines.push(['Outsourced', String(processingSummary.outsourced)].map(esc).join(','));
    lines.push(['Unassigned', String(processingSummary.unassigned)].map(esc).join(','));
    lines.push(['Total', String(processingSummary.total)].map(esc).join(','));
  } else {
    Object.entries(d.studies_by_processing_method || {}).forEach(([method, count]) =>
      lines.push([method, String(count)].map(esc).join(','))
    );
  }

  lines.push('');
  lines.push(['Order source', 'Orders', 'Studies'].map(esc).join(','));
  Object.entries(d.orders_by_source || {}).forEach(([source, info]) => {
    lines.push([source, String(info.orders), String(info.studies)].map(esc).join(','));
  });

  lines.push('');
  lines.push(['External clinic', 'Code', 'Orders', 'Studies'].map(esc).join(','));
  (d.external_orders_by_clinic || []).forEach((row) => {
    lines.push([row.clinic_name, row.clinic_code || '', String(row.orders), String(row.studies)].map(esc).join(','));
  });

  lines.push('');
  lines.push(['Procedure', 'Total', 'In-house', 'Outsourced', 'Unassigned'].map(esc).join(','));
  (d.procedures_by_processing_method || []).forEach((row) =>
    lines.push(
      [
        row.procedure,
        String(row.total),
        String(row.processing.in_house),
        String(row.processing.outsourced),
        String(row.processing.unassigned),
      ].map(esc).join(',')
    )
  );
  return lines.join('\n');
}

export default function RadiologyAnalyticsPage() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const { handleExportCsv, handleDownloadPdf } = useAnalyticsExportHandlers({
    apiPath: "/radiology/analytics/summary/",
    filenameBase: "radiology_analytics",
    viewMode,
    year,
    startDate,
    endDate,
    queryStyle: "start",
  });

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RadiologyAnalyticsSummary | null>(null);
  const { beginLoad } = useStaleRequestGuard();

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
    const params = buildReportPeriodQuery(viewMode, reportRange, 'start');
    if (!params) {
      if (viewMode === 'range') toast.error('Please select start and end dates');
      return;
    }
    const isStale = beginLoad();
    setLoading(true);
    try {
      const res = await radiologyService.getAnalyticsSummary(params);
      if (isStale()) return;
      setData(res);
    } catch (e: unknown) {
      console.error(e);
      if (!isStale()) {
        toast.error(getReadableApiError(e));
        setData(null);
      }
    } finally {
      if (!isStale()) {
        setLoading(false);
      }
    }
  }, [reportRange, viewMode, beginLoad]);

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


  const categoryBar = useMemo(() => {
    if (!data) return [];
    const c = data.patients_by_category || {};
    return [
      { name: 'Employee', count: c.employee || 0 },
      { name: 'Retiree', count: c.retiree || 0 },
      { name: 'Dependent', count: c.dependent || 0 },
      { name: 'Non-NPA', count: c.nonnpa || 0 },
      { name: 'Other', count: c.other || 0 },
    ].filter((x) => x.count > 0);
  }, [data]);

  const dayTrend = useMemo(() => {
    if (!data?.by_day?.length) return [];
    return data.by_day.map((d) => ({
      date: d.date?.slice(5) ?? '',
      studies: d.studies,
      orders: d.orders,
    }));
  }, [data]);

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
      period: row[key] ?? '',
      studies: row.studies,
      orders: row.orders,
    }));
  }, [data, viewMode]);

  const topProcedures = useMemo(() => {
    if (!data?.top_procedures?.length) return [];
    return data.top_procedures.slice(0, 15).map((p) => ({
      label: p.procedure.length > 20 ? `${p.procedure.slice(0, 20)}…` : p.procedure,
      full: p.procedure,
      count: p.count,
    }));
  }, [data]);

  const modalityBar = useMemo(() => {
    if (!data?.studies_by_modality) return [];
    return Object.entries(data.studies_by_modality).map(([name, count]) => ({ name, count }));
  }, [data]);

  const processingMethodBar = useMemo(() => {
    if (!data) return [];
    const summary = data.studies_processing_summary;
    if (summary) {
      return [
        { name: 'In-house', count: summary.in_house },
        { name: 'Outsourced', count: summary.outsourced },
        { name: 'Unassigned', count: summary.unassigned },
      ].filter((x) => x.count > 0);
    }
    return Object.entries(data.studies_by_processing_method || {}).map(([name, count]) => ({
      name: name === 'in_house' ? 'In-house' : name === 'outsourced' ? 'Outsourced' : name.replace(/_/g, ' '),
      count,
    }));
  }, [data]);

  const sourceBar = useMemo(() => {
    if (!data?.orders_by_source) return [];
    const labelMap: Record<string, string> = {
      internal_emr: 'EMR Orders',
      external_manual: 'External Requests',
    };
    return Object.entries(data.orders_by_source).map(([source, info]) => ({
      name: labelMap[source] || source.replace(/_/g, ' '),
      orders: info.orders,
      studies: info.studies,
    }));
  }, [data]);

  const externalClinicBar = useMemo(() => {
    if (!data?.external_orders_by_clinic?.length) return [];
    return data.external_orders_by_clinic.map((row) => ({
      name: row.clinic_code || row.clinic_name,
      full: row.clinic_name,
      orders: row.orders,
      studies: row.studies,
    }));
  }, [data]);

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Radiology analytics"
        reportDescription="Study volume, modality mix, and patient demographics (by imaging order date)."
        ReportIcon={ScanLine}
        reportIconClassName="text-cyan-600 dark:text-cyan-400"
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
                      <p className="text-sm text-muted-foreground">Studies</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.summary.studies_total}</p>
                    </div>
                    <Activity className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Verified</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.summary.studies_verified}</p>
                    </div>
                    <BarChart3 className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Orders</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.summary.orders_count}</p>
                    </div>
                    <Users className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-cyan-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Unique Patients</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.summary.unique_patients}</p>
                    </div>
                    <Users className="h-10 w-10 text-cyan-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

             <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Studies by Period</CardTitle>
                  <CardDescription>Number of studies ordered in the selected period breakdown</CardDescription>
                </CardHeader>
                <CardContent className="h-64">
                  {periodBreakdown.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="studies" name="Studies" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order source</CardTitle>
                  <CardDescription>Internal EMR orders vs external manual requests</CardDescription>
                </CardHeader>
                 <CardContent className="h-64">
                  {sourceBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sourceBar}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                         <Bar dataKey="orders" name="Orders" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} />
                         <Bar dataKey="studies" name="Studies" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">External requests by clinic</CardTitle>
                  <CardDescription>Manual request volume by originating clinic</CardDescription>
                </CardHeader>
                 <CardContent className="h-64">
                  {externalClinicBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={externalClinicBar} layout="vertical" margin={{ left: 24, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v: number, name: string) => [v, name === 'orders' ? 'Orders' : 'Studies']}
                          labelFormatter={(_, items) =>
                            String((items?.[0] as { payload?: { full?: string } })?.payload?.full ?? '')
                          }
                        />
                        <Legend />
                         <Bar dataKey="orders" name="Orders" fill={CHART_COLORS.info} radius={[0, 4, 4, 0]} />
                         <Bar dataKey="studies" name="Studies" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Volume by day</CardTitle>
                  <CardDescription>Studies and distinct orders per day</CardDescription>
                </CardHeader>
                 <CardContent className="h-72">
                  {dayTrend.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dayTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                         <Bar dataKey="studies" name="Studies" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                         <Bar dataKey="orders" name="Orders" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patient Attendance by Category</CardTitle>
                  <CardDescription>Breakdown of imaging orders by patient category</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-14">S/N</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead className="text-right">Count</TableHead>
                        <TableHead className="text-right">%</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categoryBar.map((row, index) => (
                        <TableRow key={row.name}>
                          <TableCell className="py-2">{index + 1}</TableCell>
                          <TableCell className="py-2 font-medium">{row.name}</TableCell>
                          <TableCell className="py-2 text-right">{row.count}</TableCell>
                          <TableCell className="py-2 text-right">
                            {data.summary.unique_patients > 0 ? ((row.count / data.summary.unique_patients) * 100).toFixed(1) : "0.0"}%
                          </TableCell>
                        </TableRow>
                      ))}
                      <TableRow className="font-semibold">
                        <TableCell className="py-2" colSpan={2}>TOTAL</TableCell>
                        <TableCell className="py-2 text-right">{data.summary.unique_patients}</TableCell>
                        <TableCell className="py-2 text-right">100.0%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Study status</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {Object.keys(data.studies_by_status || {}).length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(data.studies_by_status).map(([name, count]) => ({
                          name: name.replace(/_/g, ' '),
                          count,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                         <Bar dataKey="count" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Modality (where recorded)</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {modalityBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={modalityBar} layout="vertical" margin={{ left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip />
                         <Bar dataKey="count" fill={CHART_COLORS.info} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template category</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {Object.keys(data.studies_by_template_category || {}).length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(data.studies_by_template_category).map(([name, count]) => ({
                          name: name.replace(/_/g, ' '),
                          count,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                         <Bar dataKey="count" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order priority</CardTitle>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {Object.keys(data.orders_by_priority || {}).length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(data.orders_by_priority).map(([name, count]) => ({
                          name,
                          count,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                         <Bar dataKey="count" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">In-house vs outsourced</CardTitle>
                  <CardDescription>How imaging studies are being processed</CardDescription>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {processingMethodBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={processingMethodBar}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                         <Bar dataKey="count" fill={CHART_COLORS.info} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top procedures</CardTitle>
                <CardDescription>Most frequent study procedures in the period</CardDescription>
              </CardHeader>
              <CardContent className="h-[360px]">
                {topProcedures.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topProcedures} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={100} tick={{ fontSize: 9 }} />
                      <Tooltip
                        formatter={(v: number) => [v, 'Count']}
                        labelFormatter={(_, items) =>
                          String((items?.[0] as { payload?: { full?: string } })?.payload?.full ?? '')
                        }
                      />
                       <Bar dataKey="count" fill={CHART_COLORS.info} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Procedure processing breakdown</CardTitle>
                <CardDescription>Track each investigation by in-house vs outsourced routing</CardDescription>
              </CardHeader>
              <CardContent>
                {!data.procedures_by_processing_method || data.procedures_by_processing_method.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No procedure processing data in this period</p>
                ) : (
                  <div className="max-h-[340px] overflow-auto rounded-md border">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2 font-medium">Procedure</th>
                          <th className="text-right px-3 py-2 font-medium">Total</th>
                          <th className="text-right px-3 py-2 font-medium">In-house</th>
                          <th className="text-right px-3 py-2 font-medium">Outsourced</th>
                          <th className="text-right px-3 py-2 font-medium">Unassigned</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.procedures_by_processing_method.map((row) => (
                          <tr key={row.procedure} className="border-t">
                            <td className="px-3 py-2">{row.procedure}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.total.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.processing.in_house.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.processing.outsourced.toLocaleString()}</td>
                            <td className="px-3 py-2 text-right tabular-nums">{row.processing.unassigned.toLocaleString()}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>
          </>
        )}
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}



function EmptyChart() {
  return <p className="text-sm text-muted-foreground h-full flex items-center justify-center">No data in this period</p>;
}
