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
import type { LucideIcon } from 'lucide-react';
import { BarChart3, FlaskConical, TestTube, Users } from 'lucide-react';

const CHART_COLORS = ['#f59e0b', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#64748b', '#ef4444'];

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
  lines.push(['Day', 'Tests', 'Orders'].map(esc).join(','));
  (d.by_day || []).forEach((row) => lines.push([row.date || '', String(row.tests), String(row.orders)].map(esc).join(',')));
  lines.push('');
  lines.push(['Code', 'Name', 'Count'].map(esc).join(','));
  (d.top_tests || []).forEach((t) => lines.push([t.code, t.name, String(t.count)].map(esc).join(',')));
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

  const statusBar = useMemo(() => {
    if (!data?.tests_by_status) return [];
    return Object.entries(data.tests_by_status).map(([name, count]) => ({
      name: name.replace(/_/g, ' '),
      count,
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
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat icon={TestTube} label="Tests ordered" value={data.summary.tests_total} />
              <Stat icon={BarChart3} label="Verified" value={data.summary.tests_verified} />
              <Stat icon={BarChart3} label="Results ready" value={data.summary.tests_results_ready} />
              <Stat icon={BarChart3} label="Rejected" value={data.summary.tests_rejected} />
              <Stat icon={Users} label="Lab orders" value={data.summary.orders_count} />
              <Stat icon={Users} label="Unique patients" value={data.summary.unique_patients} />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Volume by day</CardTitle>
                  <CardDescription>Tests and distinct orders per day</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px]">
                  {dayTrend.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={dayTrend}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="tests" name="Tests" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="orders" name="Orders" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patients: gender</CardTitle>
                  <CardDescription>Distinct patients with lab orders in range</CardDescription>
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
                  <CardDescription>Employee, retiree, dependent, non-NPA</CardDescription>
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
                        <Bar dataKey="count" name="Patients" fill="#ea580c" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">NPA-linked vs non-NPA</CardTitle>
                  <CardDescription>Staff-linked (incl. dependents) vs external patients</CardDescription>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center">
                  {data.npa_staff_linked_vs_non_npa ? (
                    <div className="grid grid-cols-2 gap-6 w-full max-w-md text-center">
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-3xl font-bold text-amber-600">
                          {data.npa_staff_linked_vs_non_npa.npa_staff_linked}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">NPA-linked patients</p>
                      </div>
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-3xl font-bold text-slate-600 dark:text-slate-300">
                          {data.npa_staff_linked_vs_non_npa.non_npa}
                        </p>
                        <p className="text-xs text-muted-foreground mt-1">Non-NPA patients</p>
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
                  <CardTitle className="text-base">Test status mix</CardTitle>
                </CardHeader>
                <CardContent className="h-[280px]">
                  {statusBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={statusBar}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-25} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#f97316" radius={[4, 4, 0, 0]} />
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
                <CardContent className="h-[280px]">
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#ca8a04" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
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
                      <Bar dataKey="count" fill="#d97706" radius={[0, 4, 4, 0]} />
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
