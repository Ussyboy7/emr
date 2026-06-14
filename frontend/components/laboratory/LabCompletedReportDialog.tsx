'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { openMediaInNewTab } from '@/lib/media-url';
import { Download, Eye, FileText, FlaskConical, Printer } from 'lucide-react';
import {
  displayNameFromLabResultFileUrl,
  downloadOfficialLabReportPdf,
  printOfficialLabReportPdf,
  type CompletedTest,
} from '@/lib/laboratory/completedLabReport';

function getOverallStatusBadge(status: string) {
  switch (status) {
    case 'Critical':
      return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
    case 'Abnormal':
      return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
    default:
      return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
  }
}

function getPdfDisplayName(test: CompletedTest): string | null {
  if (!test.result_file) return null;
  return displayNameFromLabResultFileUrl(test.result_file);
}

function getResultStatusColor(status: string) {
  switch (status) {
    case 'Critical':
      return 'text-rose-600 dark:text-rose-400 font-bold';
    case 'Abnormal':
      return 'text-amber-600 dark:text-amber-400 font-medium';
    default:
      return 'text-foreground';
  }
}

export interface LabCompletedReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  test: CompletedTest | null;
  /** When true, hide lab-only empty-state actions (consultation / read-only contexts). */
  hideLabWorkflowActions?: boolean;
}

export function LabCompletedReportDialog({
  open,
  onOpenChange,
  test,
  hideLabWorkflowActions = false,
}: LabCompletedReportDialogProps) {
  const hasUsableResultFile = Boolean(test?.result_file && test?.result_file_exists !== false);
  const canUseOfficialPdf = Boolean(test?.labResultId);

  const hasRowAttachments = Array.isArray(test?.results) && test.results.some((r) => Boolean(r.attachment?.url));

  const handlePrint = async () => {
    if (!test) return;
    if (!test.labResultId) {
      toast.error('Cannot print: missing result id. Refresh the list and try again.');
      return;
    }
    try {
      await printOfficialLabReportPdf(test.labResultId);
    } catch (error) {
      console.error('Print error:', error);
      toast.error((error as Error)?.message || 'Failed to open print PDF');
    }
  };

  const handleFooterDownload = async () => {
    if (!test) return;
    if (!test.labResultId) {
      toast.error('Cannot download PDF: missing result id. Refresh the list and try again.');
      return;
    }
    try {
      await downloadOfficialLabReportPdf({
        labResultId: test.labResultId,
        patientId: test.patient?.id,
        testCode: test.testCode,
        patientName: test.patient?.name,
      });
    } catch (error) {
      console.error('Error downloading PDF report:', error);
      toast.error('Failed to download PDF report');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-500" />
            Lab Report
          </DialogTitle>
          <DialogDescription>
            {test?.testName} - {test?.patient?.name || 'Unknown'}
          </DialogDescription>
        </DialogHeader>
        {test && (
          <div className="space-y-6 py-4">
            <div className="text-center p-4 border-b">
              <h2 className="text-xl font-bold">LABORATORY REPORT</h2>
              <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Patient Name</p>
                <p className="font-medium">{test.patient?.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age / Gender</p>
                <p className="font-medium">
                  {test.patient?.age != null
                    ? `${test.patient.age} years`
                    : ''}{' '}
                  / {test.patient?.gender}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                <p className="font-medium">{test.doctor?.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clinic</p>
                <p className="font-medium">{test.clinic}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">{test.location_clinic_name || '—'}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-amber-500" />
                Test Results
                {((test.results?.length ?? 0) > 0 || hasUsableResultFile) && (
                  <Badge variant="outline" className={getOverallStatusBadge(test.overallStatus)}>
                    {test.overallStatus}
                  </Badge>
                )}
              </h3>

              {(() => {
                const pdfDisplayName = getPdfDisplayName(test);
                return pdfDisplayName != null && hasUsableResultFile && test.result_file ? (
                  <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex items-start gap-3 min-w-0">
                        <FileText className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-blue-900 dark:text-blue-100">
                            Partner / scanned report (optional)
                          </p>
                          <p className="text-xs text-muted-foreground truncate" title={pdfDisplayName}>
                            {pdfDisplayName}
                          </p>
                          <p className="text-xs text-muted-foreground mt-1">
                            Official PDF below matches the results table.
                          </p>
                        </div>
                      </div>
                      <div className="flex shrink-0 gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (test.result_file) {
                              void openMediaInNewTab(test.result_file).catch((err: unknown) =>
                                toast.error(err instanceof Error ? err.message : 'Failed to open file')
                              );
                            }
                          }}
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>

                      </div>
                    </div>
                  </div>
                ) : null;
              })()}

              {test.results?.length > 0 ? (
                <div className="border rounded-lg overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Parameter</th>
                        <th className="text-left p-3 font-medium">Result</th>
                        <th className="text-left p-3 font-medium">Unit</th>
                        <th className="text-left p-3 font-medium">Reference Range</th>
                        <th className="text-left p-3 font-medium">Status</th>
                        {hasRowAttachments && <th className="text-left p-3 font-medium">File</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {test.results?.map((result, index) => (
                        <tr key={index} className="border-t">
                          <td className="p-3 font-medium">{result.parameter}</td>
                          <td className={`p-3 font-mono ${getResultStatusColor(result.status)}`}>
                            {result.value || '—'}
                          </td>
                          <td className="p-3 text-muted-foreground">{result.unit || '—'}</td>
                          <td className="p-3 text-muted-foreground">{result.normalRange || '—'}</td>
                          <td className="p-3">
                            <Badge variant="outline" className={getResultStatusColor(result.status)}>
                              {result.status}
                            </Badge>
                          </td>
                          {hasRowAttachments && (
                            <td className="p-3">
                              {result.attachment?.url ? (
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2"
                                  onClick={() => {
                                    void openMediaInNewTab(result.attachment!.url).catch((err: unknown) =>
                                      toast.error(err instanceof Error ? err.message : 'Failed to open file')
                                    );
                                  }}
                                >
                                  <Download className="h-3.5 w-3.5 mr-1" />
                                  View
                                </Button>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                hasUsableResultFile && test.result_file ? null : (
                  <div className="p-8 text-center border rounded-lg">
                    <div className="flex flex-col items-center gap-3">
                      <FlaskConical className="h-8 w-8 text-amber-500" />
                      <div>
                        <p className="font-medium text-amber-800 dark:text-amber-200">No Results Available</p>
                        <p className="text-sm text-muted-foreground mt-1">
                          Test results have not been entered or uploaded yet.
                        </p>
                        {!hideLabWorkflowActions && (
                          <div className="flex gap-2 mt-3 justify-center">
                            <Button size="sm" variant="outline" onClick={() => onOpenChange(false)}>
                              Close
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              )}
            </div>

            {test.reportAttachments && test.reportAttachments.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <FileText className="h-4 w-4 text-blue-500" />
                  Attachments
                </h3>
                <div className="space-y-1">
                  {test.reportAttachments.map((att, i) => (
                    <div key={i} className="p-2 rounded bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200/50 dark:border-blue-800/50 flex items-center justify-between">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-blue-400 shrink-0" />
                        <span className="text-xs text-blue-700 dark:text-blue-300 truncate">{att.name}</span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 px-2 text-xs text-blue-600 shrink-0"
                        onClick={() => {
                          void openMediaInNewTab(att.url).catch((err: unknown) =>
                            toast.error(err instanceof Error ? err.message : 'Failed to open file')
                          );
                        }}
                      >
                        <Eye className="h-3 w-3 mr-1" />View
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <p className="text-xs text-muted-foreground">Performed By</p>
                <p className="font-medium">{test.submittedBy}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Verified By</p>
                <p className="font-medium">{test.verifiedBy}</p>
              </div>
            </div>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={!test || !canUseOfficialPdf}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={handleFooterDownload} disabled={!test || !canUseOfficialPdf}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
