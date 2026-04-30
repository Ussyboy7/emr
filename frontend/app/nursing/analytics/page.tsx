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
import { visitService, type NursingPoolAnalyticsResponse } from '@/lib/services';
import { toast } from 'sonner';
import { endOfMonth, format, startOfMonth } from 'date-fns';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { LucideIcon } from 'lucide-react';
import {
  ClipboardCheck,
  DoorOpen,
  Eye,
  GitBranch,
  Heart,
  Thermometer,
  Users,
  Activity,
} from 'lucide-react';

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

function analyticsToCsv(
  payload: NursingPoolAnalyticsResponse,
  viewMode: AnalyticsViewMode,
  year: string,
  start: string,
  end: string
) {
  const esc = (s: string) => `"${String(s).replace(/"/g, '""')}"`;
  const m = payload.summary;
  const periodLabel = viewMode === 'year' ? year : `${start}_to_${end}`;
  const lines: string[] = [];
  lines.push(['Nursing pool analytics', periodLabel].map(esc).join(','));
  lines.push(['Period start', payload.period?.start ?? ''].map(esc).join(','));
  lines.push(['Period end', payload.period?.end ?? ''].map(esc).join(','));
  lines.push('');
  lines.push(['Metric', 'Value'].map(esc).join(','));
  Object.entries(m).forEach(([k, v]) => lines.push([k, String(v)].map(esc).join(',')));
  lines.push('');
  lines.push(
    [
      'date',
      'total',
      'pending_vitals',
      'vitals_incomplete',
      'ready_for_consultation',
      'sent_to_room_aligned',
      'sent_to_room_by_queue_date',
      'multi_clinic',
      'checked_in_physio',
      'checked_in_eye',
    ]
      .map(esc)
      .join(',')
  );
  (payload.by_day || []).forEach((row) =>
    lines.push(
      [
        row.date,
        String(row.total),
        String(row.pending_vitals),
        String(row.vitals_incomplete),
        String(row.ready_for_consultation),
        String(row.sent_to_room_aligned),
        String(row.sent_to_room_by_queue_date),
        String(row.multi_clinic),
        String(row.checked_in_physio),
        String(row.checked_in_eye),
      ]
        .map(esc)
        .join(',')
    )
  );
  return lines.join('\n');
}

export default function NursingAnalyticsPage() {
  const [viewMode, setViewMode] = useState<AnalyticsViewMode>('year');
  const [year, setYear] = useState(() => new Date().getFullYear().toString());
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<NursingPoolAnalyticsResponse | null>(null);
  const [resolvedRange, setResolvedRange] = useState<{ start: string; end: string } | null>(null);

  const highlightThisMonth =
    viewMode === 'range' &&
    startDate === toYmd(startOfMonth(new Date())) &&
    endDate === toYmd(endOfMonth(new Date()));

  const highlightThisYear =
    viewMode === 'year' && year === new Date().getFullYear().toString();

  const setThisMonth = () => {
    const now = new Date();
    setViewMode('range');
    setStartDate(toYmd(startOfMonth(now)));
    setEndDate(toYmd(endOfMonth(now)));
  };

  const setThisYear = () => {
    setViewMode('year');
    setYear(new Date().getFullYear().toString());
  };

  const fetchReport = useCallback(async () => {
    const r = analyticsRangeFromFilters(viewMode, year, startDate, endDate);
    if (!r) {
      if (viewMode === 'range') toast.error('Please select start and end dates');
      return;
    }
    setLoading(true);
    try {
      const params = {
        status: 'in_progress' as const,
        nursing_pool: 1 as const,
        start_date: r.start,
        end_date: r.end,
      };
      const report = await visitService.getNursingPoolAnalytics(params);
      setData(report);
      setResolvedRange(r);
    } catch (e: unknown) {
      console.error(e);
      toast.error(getReadableApiError(e) || 'Failed to load nursing analytics');
      setData(null);
      setResolvedRange(null);
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

  const summary = data?.summary;

  const barData = useMemo(() => {
    if (!summary) return [];
    return [
      { name: 'Pending vitals', value: summary.pending_vitals },
      { name: 'Vitals incomplete', value: summary.vitals_incomplete },
      { name: 'Ready', value: summary.ready_for_consultation },
      { name: 'Room (visit day)', value: summary.sent_to_room_aligned },
      { name: 'Room (queue day)', value: summary.sent_to_room_by_queue_date },
    ];
  }, [summary]);

  const trendData = useMemo(() => {
    if (!data?.by_day?.length) return [];
    return data.by_day.map((row) => ({
      ...row,
      shortDate: row.date.slice(5),
    }));
  }, [data]);

  const exportCsv = () => {
    if (!data || !resolvedRange) return;
    const csv = analyticsToCsv(data, viewMode, year, startDate, endDate);
    const slug =
      viewMode === 'year' ? year : `${startDate.replace(/-/g, '')}_${endDate.replace(/-/g, '')}`;
    triggerCsvDownload(`nursing_pool_analytics_${slug}.csv`, csv);
  };

  return (
    <DashboardLayout>
      <AnalyticsReportLayout
        reportTitle="Nursing analytics"
        reportDescription="Nursing pool workload by visit date, with daily trends, vitals segments, room queue (aligned vs queue-date), and Eye / Physio legs."
        ReportIcon={Heart}
        reportIconClassName="text-rose-500 dark:text-rose-400"
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
        backLink={{ href: '/nursing', label: 'Nursing home' }}
        contentClassName="max-w-7xl mx-auto"
      >
        {summary && resolvedRange && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat icon={Users} label="In nursing pool" value={summary.total} />
              <Stat icon={Thermometer} label="Pending vitals" value={summary.pending_vitals} />
              <Stat icon={Activity} label="Vitals incomplete" value={summary.vitals_incomplete} />
              <Stat icon={ClipboardCheck} label="Ready" value={summary.ready_for_consultation} />
              <Stat icon={DoorOpen} label="Sent to rm (visit day)" value={summary.sent_to_room_aligned} />
              <Stat icon={DoorOpen} label="Sent to rm (queue day)" value={summary.sent_to_room_by_queue_date} />
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
              <Stat icon={GitBranch} label="Multi-clinic visits" value={summary.multi_clinic_visits} />
              <Stat icon={Users} label="Single-clinic" value={summary.single_clinic_visits} />
              <Stat icon={Eye} label="Eye on route" value={summary.visits_with_eye_clinic} />
              <Stat icon={Eye} label="Eye checked in" value={summary.eye_checked_in} />
              <Stat icon={Activity} label="Physio on route" value={summary.visits_with_physiotherapy} />
              <Stat icon={Activity} label="Physio checked in" value={summary.physio_checked_in} />
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Volume by segment</CardTitle>
                <CardDescription>
                  Segments can overlap (for example ready and an active room queue). Use{' '}
                  <strong>Room (visit day)</strong> for counts aligned to the same visit-date window as the pool.
                </CardDescription>
              </CardHeader>
              <CardContent className="h-[340px]">
                {barData.every((r) => r.value === 0) ? (
                  <EmptyChart message="No visits in pool for this period" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={barData} margin={{ top: 8, right: 8, left: 0, bottom: 48 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} angle={-20} textAnchor="end" height={70} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ fontSize: 12 }}
                        formatter={(v: number) => [v.toLocaleString(), 'Count']}
                      />
                      <Bar dataKey="value" fill="rgb(244 63 94)" radius={[4, 4, 0, 0]} name="Visits" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Trends by visit day</CardTitle>
                <CardDescription>Pool size and key segments per calendar day (visit date).</CardDescription>
              </CardHeader>
              <CardContent className="h-[360px]">
                {trendData.length === 0 ? (
                  <EmptyChart message="No daily rows (empty pool for this range)" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="shortDate" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} allowDecimals={false} />
                      <Tooltip contentStyle={{ fontSize: 12 }} />
                      <Legend wrapperStyle={{ fontSize: 12 }} />
                      <Line type="monotone" dataKey="total" name="In pool" stroke="#f43f5e" dot={false} strokeWidth={2} />
                      <Line
                        type="monotone"
                        dataKey="sent_to_room_aligned"
                        name="Room (visit day)"
                        stroke="#8b5cf6"
                        dot={false}
                        strokeWidth={2}
                      />
                      <Line type="monotone" dataKey="pending_vitals" name="Pending vitals" stroke="#f59e0b" dot={false} />
                      <Line
                        type="monotone"
                        dataKey="vitals_incomplete"
                        name="Vitals incomplete"
                        stroke="#0ea5e9"
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Definitions</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground space-y-2">
                <p>
                  <strong className="text-foreground">In nursing pool</strong> — In-progress visits in the selected date
                  range (by visit date), excluding visits that already have a completed consultation.
                </p>
                <p>
                  <strong className="text-foreground">Sent to room (visit day)</strong> — Same pool window, plus an
                  active consultation queue row on that visit (no filter on <code className="text-xs bg-muted px-1 rounded">queued_at</code>
                  ). Matches reporting to visit date.
                </p>
                <p>
                  <strong className="text-foreground">Sent to room (queue day)</strong> — Legacy dashboard semantics:
                  active queue rows whose <code className="text-xs bg-muted px-1 rounded">queued_at</code> date falls in
                  the requested range (can differ from visit day).
                </p>
                <p>
                  <strong className="text-foreground">Eye / Physio</strong> — “On route” uses visit clinic lines (multi-clinic
                  JSON). “Checked in” counts open eye orders or physio orders linked to those visits (same rules as the pool queue
                  check-in APIs).
                </p>
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

function EmptyChart({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground h-full flex items-center justify-center">{message}</p>;
}
