'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { LucideIcon } from 'lucide-react';
import {
  Activity,
  ArrowLeft,
  Calendar,
  FileSpreadsheet,
  Printer,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useServerDateAnchor } from '@/components/providers/ServerDateProvider';
import {
  analyticsPeriodLabel,
  analyticsRangeFromFilters,
  type AnalyticsViewMode,
} from '@/lib/dates';
import { ReportViewModeSelect } from '@/components/reports/ReportViewModeSelect';

export type { AnalyticsViewMode };
export { analyticsRangeFromFilters };

export interface AnalyticsReportLayoutProps {
  /** Primary page title (module or report name) */
  reportTitle: string;
  reportDescription: string;
  ReportIcon?: LucideIcon;
  reportIconClassName?: string;

  loading: boolean;
  onGenerate: () => void;
  exportCsvDisabled?: boolean;
  onExportCsv?: () => void;
  printDisabled?: boolean;
  onPrint?: () => void;

  viewMode: AnalyticsViewMode;
  onViewModeChange: (mode: AnalyticsViewMode) => void;
  year: string;
  onYearChange: (y: string) => void;
  startDate: string;
  onStartDateChange: (s: string) => void;
  endDate: string;
  onEndDateChange: (s: string) => void;
  onThisMonth: () => void;
  onThisYear: () => void;
  highlightThisMonth?: boolean;
  highlightThisYear?: boolean;

  /** Hide the "This Month" / "This Year" quick buttons (replaced by view mode dropdown) */
  hideQuickButtons?: boolean;
  /** Defaults to last 10 calendar years including current */
  yearOptions?: string[];

  backLink?: { href: string; label: string };

  children: React.ReactNode;
  /** Applied to the wrapper around {children} (e.g. print margins) */
  contentClassName?: string;
}

const DEFAULT_YEARS = () =>
  Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

export function AnalyticsReportLayout({
  reportTitle,
  reportDescription,
  ReportIcon,
  reportIconClassName = 'text-indigo-500',
  loading,
  onGenerate,
  exportCsvDisabled = true,
  onExportCsv,
  printDisabled = false,
  onPrint,
  viewMode,
  onViewModeChange,
  year,
  onYearChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  onThisMonth,
  onThisYear,
  highlightThisMonth = false,
  highlightThisYear = false,
  yearOptions = DEFAULT_YEARS(),
  backLink,
  children,
  contentClassName = '',
  hideQuickButtons = false,
}: AnalyticsReportLayoutProps) {
  const Icon = ReportIcon ?? Activity;
  const serverToday = useServerDateAnchor();

  const periodLabel = useMemo(
    () => analyticsPeriodLabel(viewMode, year, startDate, endDate, serverToday),
    [viewMode, year, startDate, endDate, serverToday]
  );

  const handlePrint = () => {
    if (onPrint) onPrint();
    else window.print();
  };

  return (
    <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
      {backLink && (
        <div className="mb-2">
          <Button variant="ghost" size="sm" className="-ml-2 gap-2 px-2" asChild>
            <Link href={backLink.href}>
              <ArrowLeft className="h-4 w-4" />
              {backLink.label}
            </Link>
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
            <Icon className={`h-8 w-8 sm:h-9 sm:w-9 shrink-0 ${reportIconClassName}`} />
            {reportTitle}
          </h1>
          <p className="text-muted-foreground mt-1">{reportDescription}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {onExportCsv && (
            <Button variant="outline" onClick={onExportCsv} disabled={exportCsvDisabled} type="button">
              <FileSpreadsheet className="h-4 w-4 mr-2" />
              Export CSV
            </Button>
          )}
          <Button variant="outline" onClick={handlePrint} disabled={printDisabled} type="button">
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      {!hideQuickButtons && (
        <div className="flex flex-wrap gap-2 print:hidden">
          <Button
            type="button"
            variant={highlightThisMonth ? 'default' : 'outline'}
            onClick={onThisMonth}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Month
          </Button>
          <Button
            type="button"
            variant={highlightThisYear ? 'default' : 'outline'}
            onClick={onThisYear}
            className="flex items-center gap-2"
          >
            <Calendar className="h-4 w-4" />
            This Year
          </Button>
        </div>
      )}

      {/* Filters card */}
      <Card className="print:hidden">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Calendar className="h-5 w-5" />
            Filters
          </CardTitle>
          <CardDescription>Adjust date range for detailed reporting</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label>View mode</Label>
              <ReportViewModeSelect value={viewMode} onValueChange={onViewModeChange} />
            </div>

            {viewMode === 'year' ? (
              <div className="space-y-2">
                <Label>Year</Label>
                <Select value={year} onValueChange={onYearChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : viewMode === 'range' ? (
              <>
                <div className="space-y-2">
                  <Label>Start date</Label>
                  <Input type="date" value={startDate} onChange={(e) => onStartDateChange(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End date</Label>
                  <Input type="date" value={endDate} onChange={(e) => onEndDateChange(e.target.value)} />
                </div>
              </>
            ) : viewMode === 'all' ? (
              <div className="space-y-2 col-span-2">
                <Label>Period</Label>
                <p className="text-sm font-medium text-foreground">All time</p>
              </div>
            ) : (
              <div className="space-y-2 col-span-2">
                <Label>Period</Label>
                <p className="text-sm font-medium text-foreground">{periodLabel}</p>
              </div>
            )}

            <div className="flex items-end">
              <Button type="button" onClick={onGenerate} className="w-full" disabled={loading}>
                <TrendingUp className="h-4 w-4 mr-2" />
                {loading ? 'Loading…' : 'Generate report'}
              </Button>
            </div>
          </div>
          {viewMode === 'year' || viewMode === 'range' ? (
            <p className="text-sm text-muted-foreground mt-3">{periodLabel}</p>
          ) : null}
        </CardContent>
      </Card>

      <div className={`space-y-6 print:space-y-4 ${contentClassName}`}>{children}</div>
    </div>
  );
}
