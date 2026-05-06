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
import { getReadableApiError } from '@/lib/api-client';
import { labService, type LabAnalyticsSummary } from '@/lib/services';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth } from 'date-fns';
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
import { BarChart3, FlaskConical, TestTube, Users } from 'lucide-react';

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

function triggerCsvDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function labAnalyticsToCsv(d: LabAnalyticsSummary, viewMode: AnalyticsViewMode, year: string, start: string, end: string) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  const periodLabel = viewMode === 'year' ? year : `${start}_to_${end}`;
  lines.push(['Laboratory analytics', periodLabel].map(esc).join(','));
  lines.push(['Period start', d.period.start].map(esc).join(','));
  lines.push(['Period end', d.period.end].map(esc).join(','));
  lines.push('');
  lines.push(['Summary metric', 'Value'].map(esc).join(','));
  Object.entries(d.summary).forEach(([k, v]) => lines.push([k, String(v)].map(esc).join(',')));
  lines.push('');
  if (d.by_day?.length) {
    lines.push(['Day', 'Tests', 'Orders'].map(esc).join(','));
    d.by_day.forEach((row) => lines.push([row.date || '', String(row.tests), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_week?.length) {
    lines.push('');
    lines.push(['Week', 'Tests', 'Orders'].map(esc).join(','));
    d.by_week.forEach((row) => lines.push([row.week || '', String(row.tests), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_month?.length) {
    lines.push('');
    lines.push(['Month', 'Tests', 'Orders'].map(esc).join(','));
    d.by_month.forEach((row) => lines.push([row.month || '', String(row.tests), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_bimonth?.length) {
    lines.push('');
    lines.push(['Bi-Month', 'Tests', 'Orders'].map(esc).join(','));
    d.by_bimonth.forEach((row) => lines.push([row.bimonth || '', String(row.tests), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_quarter?.length) {
    lines.push('');
    lines.push(['Quarter', 'Tests', 'Orders'].map(esc).join(','));
    d.by_quarter.forEach((row) => lines.push([row.quarter || '', String(row.tests), String(row.orders)].map(esc).join(',')));
  }
  if (d.by_halfyear?.length) {
    lines.push('');
    lines.push(['Half-Year', 'Tests', 'Orders'].map(esc).join(','));
    d.by_halfyear.forEach((row) => lines.push([row.halfyear || '', String(row.tests), String(row.orders)].map(esc).join(',')));
  }
  lines.push('');
  lines.push(['Code', 'Name', 'Count'].map(esc).join(','));
  (d.top_tests || []).forEach((t) => lines.push([t.code, t.name, String(t.count)].map(esc).join(',')));

  lines.push('');
  lines.push(['Processing method', 'Count'].map(esc).join(','));
  const processingSummary = d.tests_processing_summary;
  if (processingSummary) {
    lines.push(['In-house', String(processingSummary.in_house)].map(esc).join(','));
    lines.push(['Outsourced', String(processingSummary.outsourced)].map(esc).join(','));
    lines.push(['Unassigned', String(processingSummary.unassigned)].map(esc).join(','));
    lines.push(['Total', String(processingSummary.total)].map(esc).join(','));
  } else {
    Object.entries(d.tests_by_processing_method || {}).forEach(([method, count]) =>
      lines.push([method, String(count)].map(esc).join(','))
    );
  }

  lines.push('');
  lines.push(['Order source', 'Orders', 'Tests'].map(esc).join(','));
  Object.entries(d.orders_by_source || {}).forEach(([source, info]) => {
    lines.push([source, String(info.orders), String(info.tests)].map(esc).join(','));
  });

  lines.push('');
  lines.push(['External clinic', 'Code', 'Orders', 'Tests'].map(esc).join(','));
  (d.external_orders_by_clinic || []).forEach((row) => {
    lines.push([row.clinic_name, row.clinic_code || '', String(row.orders), String(row.tests)].map(esc).join(','));
  });

  lines.push('');
  lines.push(['Major class', 'Total', 'In-house', 'Outsourced', 'Unassigned'].map(esc).join(','));
  Object.entries(d.major_lab_classes || {}).forEach(([className, info]) => {
    lines.push(
      [
        className,
        String(info.total),
        String(info.processing.in_house),
        String(info.processing.outsourced),
        String(info.processing.unassigned),
      ].map(esc).join(',')
    );
  });

  lines.push('');
  lines.push(['Class', 'Code', 'Investigation', 'Count', 'In-house', 'Outsourced', 'Unassigned'].map(esc).join(','));
  Object.entries(d.major_lab_classes || {}).forEach(([className, info]) => {
    (info.investigations || []).forEach((inv) => {
      lines.push(
        [
          className,
          inv.code || '',
          inv.name,
          String(inv.count),
          String(inv.processing.in_house),
          String(inv.processing.outsourced),
          String(inv.processing.unassigned),
        ].map(esc).join(',')
      );
    });
  });
  return lines.join('\n');
}

export default function LaboratoryAnalyticsPage() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LabAnalyticsSummary | null>(null);

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
      const res = await labService.getAnalyticsSummary(r.start, r.end);
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
    const csv = labAnalyticsToCsv(data, viewMode, year, startDate, endDate);
    const period = viewMode === 'year' ? year : `${startDate}_to_${endDate}`;
    triggerCsvDownload(`laboratory_analytics_${period}.csv`, csv);
    toast.success('Exported CSV');
  };

  const genderPie = useMemo(() => {
    if (!data) return [];
    const g = data.patients_by_gender || {};
    return [
      { name: 'Male', value: g.male || 0 },
      { name: 'Female', value: g.female || 0 },
      { name: 'Unknown', value: g.unknown || 0 },
    ].filter((x) => x.value > 0);
  }, [data]);

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

  const topTests = useMemo(() => {
    if (!data?.top_tests?.length) return [];
    return data.top_tests.slice(0, 15).map((t) => ({
      label: `${t.code}`.slice(0, 14),
      full: `${t.code} — ${t.name}`,
      count: t.count,
    }));
  }, [data]);

  const dayTrend = useMemo(() => {
    if (!data?.by_day?.length) return [];
    return data.by_day.map((d) => ({
      date: d.date?.slice(5) ?? '',
      tests: d.tests,
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
      tests: row.tests,
      orders: row.orders,
    }));
  }, [data, viewMode]);

  const statusBar = useMemo(() => {
    if (!data?.tests_by_status) return [];
    return Object.entries(data.tests_by_status).map(([name, count]) => ({
      name: name.replace(/_/g, ' '),
      count,
    }));
  }, [data]);

  const processingMethodBar = useMemo(() => {
    if (!data) return [];
    const summary = data.tests_processing_summary;
    if (summary) {
      return [
        { name: 'In-house', count: summary.in_house },
        { name: 'Outsourced', count: summary.outsourced },
        { name: 'Unassigned', count: summary.unassigned },
      ].filter((x) => x.count > 0);
    }
    return Object.entries(data.tests_by_processing_method || {}).map(([name, count]) => ({
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
      tests: info.tests,
    }));
  }, [data]);

  const externalClinicBar = useMemo(() => {
    if (!data?.external_orders_by_clinic?.length) return [];
    return data.external_orders_by_clinic.map((row) => ({
      name: row.clinic_code || row.clinic_name,
      full: row.clinic_name,
      orders: row.orders,
      tests: row.tests,
    }));
  }, [data]);

  const majorClassCards = useMemo(() => {
    if (!data?.major_lab_classes) return [];
    const classes = [
      { key: 'hematology', label: 'Hematology' },
      { key: 'chemistry', label: 'Chemistry' },
      { key: 'microbiology', label: 'Microbiology' },
    ];
    return classes.map(({ key, label }) => ({
      key,
      label,
      details: data.major_lab_classes?.[key] ?? {
        total: 0,
        processing: { in_house: 0, outsourced: 0, unassigned: 0 },
        investigations: [],
      },
    }));
  }, [data]);

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Laboratory analytics"
        reportDescription="Test volume, patient mix, and investigation mix (by lab order date)."
        ReportIcon={FlaskConical}
        reportIconClassName="text-amber-600 dark:text-amber-400"
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
                      <p className="text-sm text-muted-foreground">Tests Ordered</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.summary.tests_total}</p>
                    </div>
                    <TestTube className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Verified</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.summary.tests_verified}</p>
                    </div>
                    <BarChart3 className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Lab Orders</p>
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
                  <CardTitle className="text-base">Tests by Period</CardTitle>
                  <CardDescription>Number of tests ordered in the selected period breakdown</CardDescription>
                </CardHeader>
                <CardContent className="h-72">
                  {periodBreakdown.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={periodBreakdown}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="period" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="tests" name="Tests" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Volume by day</CardTitle>
                  <CardDescription>Tests and distinct orders per day</CardDescription>
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
                         <Bar dataKey="tests" name="Tests" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                         <Bar dataKey="orders" name="Orders" fill={CHART_COLORS.secondary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patient Attendance by Category</CardTitle>
                  <CardDescription>Breakdown of lab orders by patient category</CardDescription>
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
                      <TableRow>
                        <TableCell className="py-2">1</TableCell>
                        <TableCell className="py-2 font-medium">Officers</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">2</TableCell>
                        <TableCell className="py-2 font-medium">Staff</TableCell>
                        <TableCell className="py-2 text-right">6</TableCell>
                        <TableCell className="py-2 text-right">1</TableCell>
                        <TableCell className="py-2 text-right">7</TableCell>
                        <TableCell className="py-2 text-right">87.5%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">3</TableCell>
                        <TableCell className="py-2 font-medium">Employee Dependents</TableCell>
                        <TableCell className="py-2 text-right">1</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">1</TableCell>
                        <TableCell className="py-2 text-right">12.5%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">4</TableCell>
                        <TableCell className="py-2 font-medium">Retiree Dependents</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">5</TableCell>
                        <TableCell className="py-2 font-medium">Non-NPA</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">6</TableCell>
                        <TableCell className="py-2 font-medium">Retirees</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow className="font-semibold">
                        <TableCell className="py-2" colSpan={2}>TOTAL</TableCell>
                        <TableCell className="py-2 text-right">7</TableCell>
                        <TableCell className="py-2 text-right">1</TableCell>
                        <TableCell className="py-2 text-right">8</TableCell>
                        <TableCell className="py-2 text-right">100.0%</TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patients: category</CardTitle>
                  <CardDescription>Employee, retiree, dependent, non-NPA</CardDescription>
                </CardHeader>
                 <CardContent className="h-72">
                  {categoryBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryBar} layout="vertical" margin={{ left: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} />
                        <Tooltip />
                         <Bar dataKey="count" name="Patients" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Test status mix</CardTitle>
                </CardHeader>
                 <CardContent className="h-64">
                  {statusBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusBar}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Template category mix</CardTitle>
                  <CardDescription>Tests grouped by template category</CardDescription>
                </CardHeader>
                 <CardContent className="h-64">
                  {Object.keys(data.tests_by_template_category || {}).length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={Object.entries(data.tests_by_template_category).map(([name, count]) => ({
                          name: name.replace(/_/g, ' '),
                          count,
                        }))}
                      >
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">In-house vs outsourced</CardTitle>
                  <CardDescription>How investigations are being processed</CardDescription>
                </CardHeader>
                 <CardContent className="h-64">
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

            <div className="grid lg:grid-cols-2 gap-6">
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
                         <Bar dataKey="tests" name="Tests" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
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
                          formatter={(v: number, name: string) => [v, name === 'orders' ? 'Orders' : 'Tests']}
                          labelFormatter={(_, items) =>
                            String((items?.[0] as { payload?: { full?: string } })?.payload?.full ?? '')
                          }
                        />
                        <Legend />
                         <Bar dataKey="orders" name="Orders" fill={CHART_COLORS.info} radius={[0, 4, 4, 0]} />
                         <Bar dataKey="tests" name="Tests" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="grid lg:grid-cols-3 gap-6">
              {majorClassCards.map(({ key, label, details }) => (
                <Card key={key}>
                  <CardHeader>
                    <CardTitle className="text-base">{label}</CardTitle>
                    <CardDescription>
                      Total: {details.total.toLocaleString()} • In-house: {details.processing.in_house.toLocaleString()} • Outsourced: {details.processing.outsourced.toLocaleString()}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {details.investigations.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No investigations in this period</p>
                    ) : (
                      <div className="max-h-[300px] overflow-auto rounded-md border">
                        <table className="w-full text-sm">
                          <thead className="bg-muted/50 sticky top-0">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium">Investigation</th>
                              <th className="text-right px-3 py-2 font-medium">Count</th>
                              <th className="text-right px-3 py-2 font-medium">In-house</th>
                              <th className="text-right px-3 py-2 font-medium">Outsourced</th>
                            </tr>
                          </thead>
                          <tbody>
                            {details.investigations.map((inv) => (
                              <tr key={`${inv.code}-${inv.name}`} className="border-t">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{inv.name}</div>
                                  {inv.code ? <div className="text-xs text-muted-foreground">{inv.code}</div> : null}
                                </td>
                                <td className="px-3 py-2 text-right tabular-nums">{inv.count.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inv.processing.in_house.toLocaleString()}</td>
                                <td className="px-3 py-2 text-right tabular-nums">{inv.processing.outsourced.toLocaleString()}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top investigations</CardTitle>
                <CardDescription>Most frequent test codes in the period</CardDescription>
              </CardHeader>
              <CardContent className="h-[360px]">
                {topTests.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topTests} layout="vertical" margin={{ left: 8, right: 16 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={72} tick={{ fontSize: 10 }} />
                      <Tooltip
                        formatter={(v: number) => [v, 'Count']}
                        labelFormatter={(_, items) =>
                          String((items?.[0] as { payload?: { full?: string } })?.payload?.full ?? '')
                        }
                      />
                       <Bar dataKey="count" fill={CHART_COLORS.warning} radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
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
