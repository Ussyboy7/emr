'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import {
  AnalyticsReportLayout,
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from '@/components/analytics/AnalyticsReportLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getReadableApiError } from '@/lib/api-client';
import { pharmacyService, type PharmacyAnalyticsSummary } from '@/lib/services';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
import type { LucideIcon } from 'lucide-react';
import { BarChart3, Package, Pill, Users } from 'lucide-react';

const CHART_COLORS = ['#7c3aed', '#3b82f6', '#10b981', '#f59e0b', '#ec4899', '#64748b', '#ef4444'];

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
  return lines.join('\n');
}

export default function PharmacyAnalyticsPage() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<PharmacyAnalyticsSummary | null>(null);

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
      const res = await pharmacyService.getAnalyticsSummary(r.start, r.end);
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
    if (viewMode === 'year' && year) {
      void fetchReport();
    } else if (viewMode === 'range' && startDate && endDate) {
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
    const csv = pharmacyAnalyticsToCsv(data, viewMode, year, startDate, endDate);
    const period = viewMode === 'year' ? year : `${startDate}_to_${endDate}`;
    triggerCsvDownload(`pharmacy_analytics_${period}.csv`, csv);
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

  const dayTrend = useMemo(() => {
    if (!data?.by_day?.length) return [];
    return data.by_day.map((d) => ({
      date: d.date?.slice(5) ?? '',
      events: d.dispense_events,
      rx: d.prescriptions,
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

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Pharmacy analytics"
        reportDescription="Dispensing activity, top brands, new prescriptions, and patient mix."
        ReportIcon={Pill}
        reportIconClassName="text-violet-600 dark:text-violet-400"
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
            <p className="text-xs text-muted-foreground">{data.dispensing.note}</p>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat icon={Package} label="Dispense events" value={data.dispensing.dispense_events} />
              <Stat icon={BarChart3} label="Total qty (mixed units)" value={Math.round(data.dispensing.total_quantity_all_units)} />
              <Stat icon={Pill} label="Rx with dispensing" value={data.dispensing.prescriptions_with_activity} />
              <Stat icon={Users} label="Patients (dispensed)" value={data.dispensing.unique_patients} />
              <Stat icon={Pill} label="New prescriptions" value={data.prescribing.new_prescriptions} />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Dispensing by day</CardTitle>
                  <CardDescription>Dispense lines and distinct prescriptions per day</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {dayTrend.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={dayTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Line type="monotone" dataKey="events" name="Dispense events" stroke="#7c3aed" strokeWidth={2} dot={false} />
                        <Line type="monotone" dataKey="rx" name="Prescriptions" stroke="#94a3b8" strokeWidth={2} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patients (dispensed): gender</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {genderPie.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={genderPie} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label>
                          {genderPie.map((_, i) => (
                            <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patients: category</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {categoryBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={categoryBar} layout="vertical" margin={{ left: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#6d28d9" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">NPA-linked vs non-NPA</CardTitle>
                  <CardDescription>Among patients with at least one dispense in range</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center">
                  {data.npa_staff_linked_vs_non_npa ? (
                    <div className="grid grid-cols-2 gap-6 w-full max-w-md text-center">
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-3xl font-bold text-violet-600">
                          {data.npa_staff_linked_vs_non_npa.npa_staff_linked}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">NPA-linked</p>
                      </div>
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-3xl font-bold text-slate-600 dark:text-slate-300">
                          {data.npa_staff_linked_vs_non_npa.non_npa}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Non-NPA</p>
                      </div>
                    </div>
                  ) : (
                    <EmptyChart />
                  )}
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
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
          </>
        )}
      </AnalyticsReportLayout>
    </DashboardLayout>
  );
}

function Stat({ icon: Icon, label, value }: { icon: LucideIcon; label: string; value: number }) {
  return (
    <Card>
      <CardContent className="p-4 flex flex-col gap-1">
        <Icon className="h-4 w-4 text-muted-foreground" />
        <p className="text-2xl font-bold tabular-nums">{value.toLocaleString()}</p>
        <p className="text-xs text-muted-foreground leading-tight">{label}</p>
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return <p className="text-sm text-muted-foreground h-full flex items-center justify-center">No data in this period</p>;
}
