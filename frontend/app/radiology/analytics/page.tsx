'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import {
  AnalyticsReportLayout,
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from '@/components/analytics/AnalyticsReportLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { getReadableApiError } from '@/lib/api-client';
import { radiologyService, type RadiologyAnalyticsSummary } from '@/lib/services';
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
import { Activity, BarChart3, ScanLine, Users } from 'lucide-react';

const CHART_COLORS = ['#06b6d4', '#3b82f6', '#10b981', '#8b5cf6', '#ec4899', '#64748b', '#ef4444'];

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
  lines.push(['Day', 'Studies', 'Orders'].map(esc).join(','));
  (d.by_day || []).forEach((row) => lines.push([row.date || '', String(row.studies), String(row.orders)].map(esc).join(',')));
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
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<RadiologyAnalyticsSummary | null>(null);

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
      const res = await radiologyService.getAnalyticsSummary(r.start, r.end);
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
    const csv = radiologyAnalyticsToCsv(data, viewMode, year, startDate, endDate);
    const period = viewMode === 'year' ? year : `${startDate}_to_${endDate}`;
    triggerCsvDownload(`radiology_analytics_${period}.csv`, csv);
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
      studies: d.studies,
      orders: d.orders,
    }));
  }, [data]);

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
              <Stat icon={Activity} label="Studies" value={data.summary.studies_total} />
              <Stat icon={BarChart3} label="Verified" value={data.summary.studies_verified} />
              <Stat icon={BarChart3} label="Reported" value={data.summary.studies_reported} />
              <Stat icon={BarChart3} label="Critical flagged" value={data.summary.studies_marked_critical} />
              <Stat icon={Users} label="Orders" value={data.summary.orders_count} />
              <Stat icon={Users} label="Unique patients" value={data.summary.unique_patients} />
            </div>

            <div className="grid lg:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Order source</CardTitle>
                  <CardDescription>Internal EMR orders vs external manual requests</CardDescription>
                </CardHeader>
                <CardContent className="h-[280px]">
                  {sourceBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={sourceBar}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="orders" name="Orders" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="studies" name="Studies" fill="#f59e0b" radius={[4, 4, 0, 0]} />
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
                <CardContent className="h-[280px]">
                  {externalClinicBar.length === 0 ? (
                    <EmptyChart />
                  ) : (
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={externalClinicBar} layout="vertical" margin={{ left: 24, right: 16 }}>
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={80} tick={{ fontSize: 11 }} />
                        <Tooltip
                          formatter={(v: number, name: string) => [v, name === 'orders' ? 'Orders' : 'Studies']}
                          labelFormatter={(_, items) =>
                            String((items?.[0] as { payload?: { full?: string } })?.payload?.full ?? '')
                          }
                        />
                        <Legend />
                        <Bar dataKey="orders" name="Orders" fill="#0891b2" radius={[0, 4, 4, 0]} />
                        <Bar dataKey="studies" name="Studies" fill="#d97706" radius={[0, 4, 4, 0]} />
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
                        <Bar dataKey="studies" name="Studies" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="orders" name="Orders" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Patients: gender</CardTitle>
                  <CardDescription>Distinct patients with imaging orders in range</CardDescription>
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
                        <Bar dataKey="count" name="Patients" fill="#0891b2" radius={[0, 4, 4, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">NPA-linked vs non-NPA</CardTitle>
                </CardHeader>
                <CardContent className="h-[300px] flex items-center justify-center">
                  {data.npa_staff_linked_vs_non_npa ? (
                    <div className="grid grid-cols-2 gap-6 w-full max-w-md text-center">
                      <div className="rounded-lg border p-4 bg-muted/30">
                        <p className="text-3xl font-bold text-cyan-600">
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#0e7490" radius={[4, 4, 0, 0]} />
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis type="number" tick={{ fontSize: 11 }} />
                        <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 10 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#22d3ee" radius={[0, 4, 4, 0]} />
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={80} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#155e75" radius={[4, 4, 0, 0]} />
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#a5f3fc" radius={[4, 4, 0, 0]} />
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
                        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                        <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                        <YAxis tick={{ fontSize: 11 }} />
                        <Tooltip />
                        <Bar dataKey="count" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
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
                      <Bar dataKey="count" fill="#06b6d4" radius={[0, 4, 4, 0]} />
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
