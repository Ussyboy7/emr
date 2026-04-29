'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Download, Eye, FileText, Printer, ScanLine } from 'lucide-react';
import {
  sanitizeRadiologyReportFileName,
  type CompletedRadiologyReport,
} from '@/lib/radiology/completedRadiologyReport';
import {
  downloadRadiologyReportFile,
  openRadiologyReportUrl,
  printRadiologyReport,
} from '@/lib/radiology/radiologyReportActions';

function formatDateTime(isoString: string) {
  const date = new Date(isoString);
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

export interface RadiologyCompletedReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  report: CompletedRadiologyReport | null;
}

export function RadiologyCompletedReportDialog({
  open,
  onOpenChange,
  report,
}: RadiologyCompletedReportDialogProps) {
  const pdfDisplayName =
    report?.reportFile != null
      ? sanitizeRadiologyReportFileName(report.reportFile.name)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.ml}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-500" />
            Radiology Report
          </DialogTitle>
          <DialogDescription>
            {report?.studyName} - {report?.patient.name}
          </DialogDescription>
        </DialogHeader>
        {report && (
          <div className="space-y-6 py-4">
            <div className="text-center p-4 border-b">
              <h2 className="text-xl font-bold">RADIOLOGY REPORT</h2>
              <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Patient Name</p>
                <p className="font-medium">{report.patient.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age / Gender</p>
                <p className="font-medium">
                  {report.patient.age !== null && report.patient.age !== undefined
                    ? `${report.patient.age} years`
                    : ''}{' '}
                  / {report.patient.gender}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                <p className="font-medium">{report.doctor.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Order ID</p>
                <p className="font-medium">{report.orderId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Study Name</p>
                <p className="font-medium">{report.studyName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Category</p>
                <p className="font-medium">{report.category}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <ScanLine className="h-4 w-4 text-cyan-500" />
                Study Details
                <Badge
                  variant="outline"
                  className={
                    report.overallStatus === 'Critical'
                      ? 'border-rose-500 text-rose-700'
                      : 'border-emerald-500 text-emerald-700'
                  }
                >
                  {report.overallStatus}
                </Badge>
              </h3>

              <div className="p-3 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 mb-4">
                <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200">{report.studyName}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Category: {report.category} | Status: {report.overallStatus}
                </p>
              </div>

              {pdfDisplayName != null && report.reportFile && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3 min-w-0">
                      <FileText className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-blue-900 dark:text-blue-100">Report PDF</p>
                        <p className="text-xs text-muted-foreground truncate" title={pdfDisplayName}>
                          {pdfDisplayName}
                        </p>
                      </div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => openRadiologyReportUrl(report.reportFile!.url)}
                        className="text-blue-800 border-blue-300"
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" />
                        View
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => downloadRadiologyReportFile(report)}
                        className="text-blue-800 border-blue-300"
                      >
                        <Download className="h-3.5 w-3.5 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {report.report && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-amber-500" />
                  Report Content
                </h3>
                <div className="space-y-3 p-4 rounded-lg bg-muted/50 border">
                  {report.customReports && report.customReports.length > 0 ? (
                    report.customReports.map((row, idx) => (
                      <div key={row.id || idx} className="rounded border bg-background/70 p-3 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">{row.procedure || `Custom study ${idx + 1}`}</p>
                          {row.critical && <Badge className="bg-rose-500 text-white">Critical</Badge>}
                        </div>
                        {row.report && <p className="text-sm whitespace-pre-wrap">{row.report}</p>}
                        {row.recommendations && (
                          <p className="text-sm">
                            <span className="text-muted-foreground">Recommendations:</span> {row.recommendations}
                          </p>
                        )}
                        {row.attachment?.url && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openRadiologyReportUrl(row.attachment!.url)}
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View file
                          </Button>
                        )}
                      </div>
                    ))
                  ) : (
                    <div>
                      <p className="text-xs text-muted-foreground font-medium mb-1">Report</p>
                      <p className="text-sm whitespace-pre-wrap">{report.report}</p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Ordered</p>
                <p className="font-medium">
                  {report.orderedAt
                    ? `${formatDateTime(report.orderedAt).date} ${formatDateTime(report.orderedAt).time}`
                    : 'Unknown'}
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="font-medium">
                  {report.completedAt
                    ? `${formatDateTime(report.completedAt).date} ${formatDateTime(report.completedAt).time}`
                    : 'Unknown'}
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Verified</p>
                <p className="font-medium">
                  {report.verifiedAt
                    ? `${formatDateTime(report.verifiedAt).date} ${formatDateTime(report.verifiedAt).time}`
                    : 'Unknown'}
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Turnaround Time</p>
                <p className="font-medium">{report.turnaroundTime}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Reported By</p>
                <p className="font-medium">{report.reportedBy}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Verified By</p>
                <p className="font-medium">{report.verifiedBy}</p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => report && printRadiologyReport(report)} disabled={!report}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={() => report && downloadRadiologyReportFile(report)} disabled={!report}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
