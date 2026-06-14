"use client";

import { FileSpreadsheet, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { exportReportCsv, exportReportPdf } from "@/lib/report-export";

interface ReportExportButtonsProps {
  apiPath: string;
  /** Query string (without leading ?) or URLSearchParams — same params as JSON fetch */
  buildQuery?: () => string | URLSearchParams | null;
  filenameBase: string;
  disabled?: boolean;
  className?: string;
}

export function ReportExportButtons({
  apiPath,
  buildQuery,
  filenameBase,
  disabled = false,
  className,
}: ReportExportButtonsProps) {
  const query = buildQuery?.() ?? null;

  return (
    <div className={className ?? "flex items-center gap-2"}>
      <Button
        variant="outline"
        type="button"
        disabled={disabled}
        onClick={() => void exportReportCsv(apiPath, query, `${filenameBase}.csv`)}
      >
        <FileSpreadsheet className="h-4 w-4 mr-2" />
        Export CSV
      </Button>
      <Button
        variant="outline"
        type="button"
        disabled={disabled}
        onClick={() => void exportReportPdf(apiPath, query, `${filenameBase}.pdf`)}
      >
        <Printer className="h-4 w-4 mr-2" />
        Print
      </Button>
    </div>
  );
}
