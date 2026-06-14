"use client";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AnalyticsViewMode } from "@/lib/dates";
import { REPORT_VIEW_MODE_OPTIONS } from "@/lib/report-period-query";

type Props = {
  value: AnalyticsViewMode | string;
  onValueChange: (mode: AnalyticsViewMode) => void;
  className?: string;
};

export function ReportViewModeSelect({ value, onValueChange, className }: Props) {
  return (
    <Select value={value} onValueChange={(v) => onValueChange(v as AnalyticsViewMode)}>
      <SelectTrigger className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {REPORT_VIEW_MODE_OPTIONS.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
