"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ReportViewModeSelect } from "@/components/reports/ReportViewModeSelect";
import { useServerDateAnchor } from "@/components/providers/ServerDateProvider";
import { analyticsPeriodLabel, type AnalyticsViewMode } from "@/lib/dates";

type Props = {
  viewMode: AnalyticsViewMode | string;
  onViewModeChange: (mode: AnalyticsViewMode) => void;
  year: string;
  onYearChange: (year: string) => void;
  startDate: string;
  onStartDateChange: (value: string) => void;
  endDate: string;
  onEndDateChange: (value: string) => void;
  yearOptions?: string[];
};

const defaultYears = () =>
  Array.from({ length: 10 }, (_, i) => (new Date().getFullYear() - i).toString());

export function ReportDateFilterFields({
  viewMode,
  onViewModeChange,
  year,
  onYearChange,
  startDate,
  onStartDateChange,
  endDate,
  onEndDateChange,
  yearOptions = defaultYears(),
}: Props) {
  const serverToday = useServerDateAnchor();
  const periodLabel = analyticsPeriodLabel(
    viewMode as AnalyticsViewMode,
    year,
    startDate,
    endDate,
    serverToday
  );

  return (
    <>
      <div>
        <Label>View Mode</Label>
        <ReportViewModeSelect
          value={viewMode}
          onValueChange={onViewModeChange}
          className="mt-1"
        />
      </div>
      {viewMode === "year" ? (
        <div>
          <Label>Year</Label>
          <Select value={year} onValueChange={onYearChange}>
            <SelectTrigger className="mt-1">
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
      ) : viewMode === "range" ? (
        <>
          <div>
            <Label>Start Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={startDate}
              onChange={(e) => onStartDateChange(e.target.value)}
            />
          </div>
          <div>
            <Label>End Date</Label>
            <Input
              type="date"
              className="mt-1"
              value={endDate}
              onChange={(e) => onEndDateChange(e.target.value)}
            />
          </div>
        </>
      ) : viewMode === "all" ? (
        <div className="col-span-2">
          <Label>Period</Label>
          <p className="text-sm text-muted-foreground mt-1">All time</p>
        </div>
      ) : (
        <div className="col-span-2">
          <Label>Period</Label>
          <p className="text-sm text-muted-foreground mt-1">{periodLabel}</p>
        </div>
      )}
    </>
  );
}
