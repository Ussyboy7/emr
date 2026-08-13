'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { usePharmacyPageAuth } from '@/hooks/use-pharmacy-page-auth';
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
import { pharmacyService, type PharmacyAnalyticsSummary } from '@/lib/services';
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

import { BarChart3, Package, Pill, Users, RefreshCw, Warehouse } from 'lucide-react';

const CHART_COLORS = {
  primary: "#3b82f6",
  secondary: "#a855f7",
  success: "#10b981",
  warning: "#f59e0b",
  error: "#ef4444",
  info: "#06b6d4",
  muted: "#64748b",
};

interface DispensedItemRow {
  sn: number;
  medication: string;
  unit: string;
  quantity_dispensed: number;
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

function pharmacyAnalyticsToCsv(
  d: PharmacyAnalyticsSummary,
  viewMode: AnalyticsViewMode,
  year: string,
  start: string,
  end: string
) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const lines: string[] = [];
  const periodLabel = viewMode === 'year' ? year : `${start}_to_${end}`;
  lines.push(['Pharmacy analytics', periodLabel].map(esc).join(','));
  lines.push(['Period start', d.period.start].map(esc).join(','));
  lines.push(['Period end', d.period.end].map(esc).join(','));
  lines.push('');
  lines.push(['Dispensing metric', 'Value'].map(esc).join(','));
  Object.entries(d.dispensing).forEach(([k, v]) => {
    if (k !== 'note') lines.push([k, String(v)].map(esc).join(','));
  });
  lines.push([esc('note'), esc(d.dispensing.note)].join(','));
  lines.push('');
  lines.push(['Prescribing metric', 'Value'].map(esc).join(','));
  lines.push(['new_prescriptions', String(d.prescribing.new_prescriptions)].map(esc).join(','));
  Object.entries(d.prescribing.by_status || {}).forEach(([k, v]) =>
    lines.push([`status_${k}`, String(v)].map(esc).join(','))
  );
  lines.push('');
  lines.push(['Day', 'Dispense events', 'Total qty', 'Prescriptions'].map(esc).join(','));
  (d.by_day || []).forEach((row) =>
    lines.push(
      [row.date || '', String(row.dispense_events), String(row.total_quantity), String(row.prescriptions)].map(esc).join(',')
    )
  );
  lines.push('');
  lines.push(['Medication', 'Total quantity', 'Events'].map(esc).join(','));
  (d.top_medications_by_quantity || []).forEach((m) =>
    lines.push([m.name, String(m.total_quantity), String(m.dispense_events)].map(esc).join(','))
  );
  if (d.by_day?.length) {
    lines.push('');
    lines.push(['Day', 'Dispense events', 'Total qty', 'Prescriptions'].map(esc).join(','));
    d.by_day.forEach((row) =>
      lines.push(
        [row.date, String(row.dispense_events), String(row.total_quantity), String(row.prescriptions)].map(esc).join(',')
      )
    );
  }
  if (d.by_week?.length) {
    lines.push('');
    lines.push(['Week', 'Dispense events', 'Total qty', 'Prescriptions'].map(esc).join(','));
    d.by_week.forEach((row) =>
      lines.push(
        [row.week, String(row.dispense_events), String(row.total_quantity), String(row.prescriptions)].map(esc).join(',')
      )
    );
  }
  if (d.by_month?.length) {
    lines.push('');
    lines.push(['Month', 'Dispense events', 'Total qty', 'Prescriptions'].map(esc).join(','));
    d.by_month.forEach((row) =>
      lines.push(
        [row.month, String(row.dispense_events), String(row.total_quantity), String(row.prescriptions)].map(esc).join(',')
      )
    );
  }
  if (d.by_bimonth?.length) {
    lines.push('');
    lines.push(['Bi-Month', 'Dispense events', 'Total qty', 'Prescriptions'].map(esc).join(','));
    d.by_bimonth.forEach((row) =>
      lines.push(
        [row.bimonth, String(row.dispense_events), String(row.total_quantity), String(row.prescriptions)].map(esc).join(',')
      )
    );
  }
  if (d.by_quarter?.length) {
    lines.push('');
    lines.push(['Quarter', 'Dispense events', 'Total qty', 'Prescriptions'].map(esc).join(','));
    d.by_quarter.forEach((row) =>
      lines.push(
        [row.quarter, String(row.dispense_events), String(row.total_quantity), String(row.prescriptions)].map(esc).join(',')
      )
    );
  }
  if (d.by_halfyear?.length) {
    lines.push('');
    lines.push(['Half-Year', 'Dispense events', 'Total qty', 'Prescriptions'].map(esc).join(','));
    d.by_halfyear.forEach((row) =>
      lines.push(
        [row.halfyear, String(row.dispense_events), String(row.total_quantity), String(row.prescriptions)].map(esc).join(',')
      )
    );
  }
  if (d.hod_store) {
    lines.push('');
    lines.push(['HOD Store metric', 'Value'].map(esc).join(','));
    lines.push(['issue_events', String(d.hod_store.issue_events)].map(esc).join(','));
    lines.push(['total_quantity_all_units', String(d.hod_store.total_quantity_all_units)].map(esc).join(','));
    lines.push([esc('note'), esc(d.hod_store.note)].join(','));
    lines.push('');
    lines.push(['Day', 'Issue events', 'Total qty'].map(esc).join(','));
    (d.hod_store.by_day || []).forEach((row) =>
      lines.push([row.date || '', String(row.issue_events), String(row.total_quantity)].map(esc).join(','))
    );
    lines.push('');
    lines.push(['Medication', 'Total quantity', 'Issue events'].map(esc).join(','));
    (d.hod_store.top_medications_by_quantity || []).forEach((m) =>
      lines.push([m.name, String(m.total_quantity), String(m.issue_events)].map(esc).join(','))
    );
  }
  return lines.join('\n');
}

export default function PharmacyAnalyticsPage() {
  const { ready, handleAuthError } = usePharmacyPageAuth();
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const reportRange = useReportDateRange(viewMode, year, startDate, endDate);

  const { handleExportCsv, handleDownloadPdf } = useAnalyticsExportHandlers({
    apiPath: "/pharmacy/analytics/summary/",
    filenameBase: "pharmacy_analytics",
    viewMode,
    year,
    startDate,
    endDate,
    queryStyle: "start",
  });

  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PharmacyAnalyticsSummary | null>(null);
  const [dispensedItems, setDispensedItems] = useState<DispensedItemRow[]>([]);

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
    setLoading(true);
    try {
      const res = await pharmacyService.getAnalyticsSummary(params);
      setData(res);

      const dispensedParams = buildReportPeriodQuery(viewMode, reportRange, 'start_date');
      const url = `/reports/dispensed-prescriptions/?${dispensedParams?.toString() ?? ''}`;

      const dispensedResponse = await apiFetch<{
        dispensed_items: DispensedItemRow[];
      }>(url);
      setDispensedItems(dispensedResponse.dispensed_items || []);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      console.error(e);
      toast.error(getReadableApiError(e));
      setData(null);
      setDispensedItems([]);
    } finally {
      setLoading(false);
    }
  }, [reportRange, viewMode, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    if (canFetchReportPeriod(viewMode, reportRange)) {
      void fetchReport();
    }
  }, [reportRange, fetchReport, ready, viewMode]);

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


  const dayTrend = useMemo(() => {
    if (!data?.by_day?.length) return [];
    return data.by_day.map((d) => ({
      date: d.date?.slice(5) ?? '',
      events: d.dispense_events,
      rx: d.prescriptions,
    }));
  }, [data]);

  const monthConsumption = useMemo(() => {
    if (!data?.by_month?.length) return [];
    return data.by_month.map((row) => ({
      month: row.month ?? '',
      qty: Number(row.total_quantity),
      events: row.dispense_events,
    }));
  }, [data]);

  const topByQty = useMemo(() => {
    if (!data?.top_medications_by_quantity?.length) return [];
    return data.top_medications_by_quantity.slice(0, 15).map((m) => ({
      label: m.name.length > 22 ? `${m.name.slice(0, 22)}…` : m.name,
      full: m.name,
      qty: Number(m.total_quantity),
      events: m.dispense_events,
    }));
  }, [data]);

  const topByEvents = useMemo(() => {
    if (!data?.top_medications_by_events?.length) return [];
    return data.top_medications_by_events.slice(0, 12).map((m) => ({
      name: m.name.length > 18 ? `${m.name.slice(0, 18)}…` : m.name,
      events: m.dispense_events,
    }));
  }, [data]);

  const rxStatusBar = useMemo(() => {
    if (!data?.prescribing?.by_status) return [];
    return Object.entries(data.prescribing.by_status).map(([name, count]) => ({
      name: name.replace(/_/g, ' '),
      count,
    }));
  }, [data]);

  const hodDayTrend = useMemo(() => {
    if (!data?.hod_store?.by_day?.length) return [];
    return data.hod_store.by_day.map((d) => ({
      date: d.date?.slice(5) ?? '',
      events: d.issue_events,
      qty: Number(d.total_quantity),
    }));
  }, [data]);

  const hodTopByQty = useMemo(() => {
    if (!data?.hod_store?.top_medications_by_quantity?.length) return [];
    return data.hod_store.top_medications_by_quantity.slice(0, 12).map((m) => ({
      name: m.name.length > 18 ? `${m.name.slice(0, 18)}…` : m.name,
      qty: Number(m.total_quantity),
      events: m.issue_events,
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
      prescriptions: row.prescriptions,
      events: row.dispense_events,
      quantity: row.total_quantity,
    }));
  }, [data, viewMode]);

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Pharmacy analytics"
        reportDescription="Dispensing activity, HOD store issues, top brands, new prescriptions, and patient mix."
        ReportIcon={Pill}
        reportIconClassName="text-violet-600 dark:text-violet-400"
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
            <p className="text-xs text-muted-foreground">{data.dispensing.note}</p>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Dispense Events</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.dispensing.dispense_events}</p>
                    </div>
                    <Package className="h-10 w-10 text-blue-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-green-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Quantity</p>
                      <p className="text-2xl sm:text-3xl font-bold">{Math.round(data.dispensing.total_quantity_all_units)}</p>
                    </div>
                    <BarChart3 className="h-10 w-10 text-green-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-amber-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Active Prescriptions</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.dispensing.prescriptions_with_activity}</p>
                    </div>
                    <Pill className="h-10 w-10 text-amber-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
              <Card className="border-l-4 border-l-cyan-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Unique Patients</p>
                      <p className="text-2xl sm:text-3xl font-bold">{data.dispensing.unique_patients}</p>
                    </div>
                    <Users className="h-10 w-10 text-cyan-500 opacity-50" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {data.hod_store && (
              <>
                <p className="text-xs text-muted-foreground">{data.hod_store.note}</p>
                <div className="grid gap-4 md:grid-cols-2">
                  <Card className="border-l-4 border-l-violet-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">HOD Issue Events</p>
                          <p className="text-2xl sm:text-3xl font-bold">{data.hod_store.issue_events}</p>
                        </div>
                        <Warehouse className="h-10 w-10 text-violet-500 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                  <Card className="border-l-4 border-l-fuchsia-500">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-muted-foreground">HOD Total Quantity</p>
                          <p className="text-2xl sm:text-3xl font-bold">
                            {Math.round(data.hod_store.total_quantity_all_units)}
                          </p>
                        </div>
                        <BarChart3 className="h-10 w-10 text-fuchsia-500 opacity-50" />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="grid lg:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">HOD issues by day</CardTitle>
                      <CardDescription>Discretionary HOD store issues per day</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                      {hodDayTrend.length === 0 ? (
                        <EmptyChart />
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={hodDayTrend}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                            <YAxis tick={{ fontSize: 11 }} />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="events" name="Issue events" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={{ r: 3 }} />
                            <Line type="monotone" dataKey="qty" name="Total qty" stroke={CHART_COLORS.warning} strokeWidth={2} dot={{ r: 3 }} />
                          </LineChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">Top HOD issues by quantity</CardTitle>
                      <CardDescription>Medications issued from HOD store (not Rx dispensing)</CardDescription>
                    </CardHeader>
                    <CardContent className="h-72">
                      {hodTopByQty.length === 0 ? (
                        <EmptyChart />
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={hodTopByQty} layout="vertical" margin={{ left: 8 }}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis type="number" tick={{ fontSize: 11 }} />
                            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} />
                            <Tooltip />
                            <Bar dataKey="qty" name="Total quantity" fill={CHART_COLORS.secondary} radius={[0, 4, 4, 0]} />
                          </BarChart>
                        </ResponsiveContainer>
                      )}
                    </CardContent>
                  </Card>
                </div>
              </>
            )}

             <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Prescriptions Dispensed by Period</CardTitle>
                  <CardDescription>Number of prescriptions dispensed in the selected period breakdown</CardDescription>
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
                        <Bar dataKey="prescriptions" name="Prescriptions" fill={CHART_COLORS.primary} radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dispensing by day</CardTitle>
                  <CardDescription>Dispense lines and distinct prescriptions per day</CardDescription>
                </CardHeader>
                 <CardContent className="h-72">
                  {dayTrend.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dayTrend}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                         <Line type="monotone" dataKey="events" name="Dispense events" stroke={CHART_COLORS.primary} strokeWidth={2} dot={false} />
                         <Line type="monotone" dataKey="rx" name="Prescriptions" stroke={CHART_COLORS.secondary} strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Drug consumption by month</CardTitle>
                  <CardDescription>Total dispensed quantity per calendar month (mixed units — see note above)</CardDescription>
                </CardHeader>
                 <CardContent className="h-72">
                  {monthConsumption.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={monthConsumption}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="month" tick={{ fontSize: 10 }} />
                        <YAxis yAxisId="qty" tick={{ fontSize: 11 }} />
                        <YAxis yAxisId="events" orientation="right" tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                         <Bar yAxisId="qty" dataKey="qty" name="Total quantity" fill={CHART_COLORS.success} radius={[4, 4, 0, 0]} />
                         <Line
                           yAxisId="events"
                           type="monotone"
                           dataKey="events"
                           name="Dispense events"
                           stroke={CHART_COLORS.primary}
                           strokeWidth={2}
                           dot={{ r: 3 }}
                         />
                      </ComposedChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>



              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patient Attendance by Category</CardTitle>
                  <CardDescription>Breakdown of dispensed medications by patient category</CardDescription>
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
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">3</TableCell>
                        <TableCell className="py-2 font-medium">Employee Dependents</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">4</TableCell>
                        <TableCell className="py-2 font-medium">Retirees</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">5</TableCell>
                        <TableCell className="py-2 font-medium">Retiree Dependents</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="py-2">6</TableCell>
                        <TableCell className="py-2 font-medium">Non-NPA</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0</TableCell>
                        <TableCell className="py-2 text-right">0.0%</TableCell>
                      </TableRow>
                      <TableRow className="font-semibold">
                        <TableCell className="py-2" colSpan={2}>TOTAL</TableCell>
                        <TableCell className="py-2 text-right">{data.patients_by_gender?.male || 0}</TableCell>
                        <TableCell className="py-2 text-right">{data.patients_by_gender?.female || 0}</TableCell>
                        <TableCell className="py-2 text-right">{data.dispensing.unique_patients}</TableCell>
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
                  <CardTitle className="text-base">New prescriptions by status</CardTitle>
                  <CardDescription>Written in period (not cancelled)</CardDescription>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {rxStatusBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={rxStatusBar}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-15} textAnchor="end" height={65} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Top brands by dispense frequency</CardTitle>
                  <CardDescription>Number of dispense lines per medication</CardDescription>
                </CardHeader>
                <CardContent className="h-[260px]">
                  {topByEvents.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topByEvents} layout="vertical" margin={{ left: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 9 }} />
                        <Tooltip />
                        <Bar dataKey="events" fill="#a78bfa" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Top brands by total quantity dispensed</CardTitle>
                <CardDescription>Consumption pattern — units may differ between rows; use for relative ranking</CardDescription>
              </CardHeader>
              <CardContent className="h-[400px]">
                {topByQty.length === 0 ? (
                  <EmptyChart />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={topByQty} layout="vertical" margin={{ left: 8, right: 24 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis type="number" tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 9 }} />
                      <Tooltip
                        formatter={(v: number, name: string) => [v, name === 'qty' ? 'Total quantity' : name]}
                        labelFormatter={(_, items) =>
                          String((items?.[0] as { payload?: { full?: string } })?.payload?.full ?? '')
                        }
                      />
                      <Bar dataKey="qty" name="qty" fill="#5b21b6" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Dispensed Items Table */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Pill className="h-5 w-5" />
                  Dispensed Items
                </CardTitle>
                <CardDescription>Aggregated quantities dispensed by medication</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="text-center py-10">
                    <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground">Loading dispensed items...</p>
                  </div>
                ) : dispensedItems.length === 0 ? (
                  <div className="text-center py-10">
                    <Pill className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">No dispensed items found for this period</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-border">
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">S/N</th>
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">Medication</th>
                          <th className="text-left p-3 text-sm font-medium text-muted-foreground">Unit</th>
                          <th className="text-right p-3 text-sm font-medium text-muted-foreground">Quantity Dispensed</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dispensedItems.map((r) => (
                          <tr key={r.sn} className="border-b border-border hover:bg-muted/30 transition-colors">
                            <td className="p-3 text-foreground">{r.sn}</td>
                            <td className="p-3 font-medium text-foreground">{r.medication}</td>
                            <td className="p-3 text-foreground">{r.unit || "-"}</td>
                            <td className="p-3 text-right font-semibold text-foreground">{r.quantity_dispensed.toLocaleString()}</td>
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
