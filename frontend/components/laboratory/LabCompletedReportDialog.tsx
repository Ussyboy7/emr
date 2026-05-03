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
import { apiFetch } from '@/lib/api-client';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  FlaskConical,
} from 'lucide-react';
import {
  displayNameFromLabResultFileUrl,
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

function formatDateTime(isoString: string) {
  const date = new Date(isoString);
  return {
    date: date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
    time: date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
  };
}

function downloadResultFile(url: string, filename: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

function formatTestNameWithCode(name: string, code: string) {
  const testName = String(name || '').trim();
  const testCode = String(code || '').trim();
  if (!testName) return testCode;
  if (!testCode) return testName;
  const alreadyHasCodeSuffix = new RegExp(`\\(${testCode.replace(/[.*+?^${}()|[\\]\\\\]/g, '\\\\$&')}\\)\\s*$`, 'i').test(testName);
  return alreadyHasCodeSuffix ? testName : `${testName} (${testCode})`;
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

  // Hide Unit and Normal Range columns if all results have empty unit and normalRange doesn't contain '-' (qualitative tests)
  const hideUnitNormalColumns = test?.results.every(r =>
    !r.unit?.trim() && (!r.normalRange?.trim() || !r.normalRange.includes('-'))
  ) ?? false;
  const hasRowAttachments = test?.results.some((r) => Boolean(r.attachment?.url)) ?? false;

  const handlePrint = async () => {
    if (!test) return;
    toast.info(`Printing result for ${test.patient.name}...`);

    // Always print the same backend-generated report used for downloads.
    try {
      let printUrl: string | null = null;
      let revokeAfterPrint = false;

      if (hasUsableResultFile && test.result_file) {
        printUrl = test.result_file;
      } else {
        const blob = await apiFetch<Blob>(
          `/laboratory/verification/${test.id}/download_report/`,
          { responseType: 'blob' }
        );
        printUrl = URL.createObjectURL(blob);
        revokeAfterPrint = true;
      }

      const printWindow = window.open(printUrl, '_blank');
      if (!printWindow) {
        if (revokeAfterPrint && printUrl) URL.revokeObjectURL(printUrl);
        toast.error('Failed to open print window. Please allow popups.');
        return;
      }

      // Give browser time to load PDF before printing.
      setTimeout(() => {
        try {
          printWindow.focus();
          printWindow.print();
        } finally {
          if (revokeAfterPrint && printUrl) URL.revokeObjectURL(printUrl);
        }
      }, 700);
    } catch (error) {
      console.error('Print error:', error);
      toast.error((error as Error)?.message || 'Failed to print lab report');
    }
  };

  const generatePrintContent = () => {
    if (!test) return '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Lab Report - ${test.patient.name}</title>
        <style>
          body { font-family: Arial, sans-serif; margin: 20px; }
          .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 10px; margin-bottom: 20px; }
          .section { margin-bottom: 20px; }
          .section h3 { border-bottom: 1px solid #ccc; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-top: 10px; }
          th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
          th { background-color: #f5f5f5; }
          .status-normal { color: #22c55e; }
          .status-abnormal { color: #f59e0b; }
          .status-critical { color: #ef4444; font-weight: bold; }
          @media print { body { margin: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>LABORATORY TEST RESULT REPORT</h1>
          <h2>Nigerian Ports Authority Medical Services</h2>
        </div>

        <div class="section">
          <h3>Patient Information</h3>
          <table>
            <tr><td><strong>Name:</strong></td><td>${test.patient.name}</td></tr>
            <tr><td><strong>ID:</strong></td><td>${test.patient.id}</td></tr>
            <tr><td><strong>Age/Gender:</strong></td><td>${test.patient.age} years / ${test.patient.gender}</td></tr>
          </table>
        </div>

        <div class="section">
          <h3>Test Information</h3>
          <table>
            <tr><td><strong>Test Name:</strong></td><td>${test.testName}</td></tr>
            <tr><td><strong>Test Code:</strong></td><td>${test.testCode}</td></tr>
            <tr><td><strong>Order ID:</strong></td><td>${test.orderId}</td></tr>
            <tr><td><strong>Ordering Doctor:</strong></td><td>${test.doctor?.name || 'N/A'}</td></tr>
            <tr><td><strong>Clinic:</strong></td><td>${test.clinic || 'N/A'}</td></tr>
            <tr><td><strong>Overall Status:</strong></td><td><span class="status-${test.overallStatus.toLowerCase()}">${test.overallStatus}</span></td></tr>
          </table>
        </div>

        ${test.results && test.results.length > 0 ? `
        <div class="section">
          <h3>Test Results</h3>
          <table>
            <thead>
              <tr>
                <th>Parameter</th>
                <th>Result</th>
                <th>Unit</th>
                <th>Normal Range</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              ${test.results.map(result => `
                <tr>
                  <td>${result.parameter}</td>
                  <td>${result.value}</td>
                  <td>${result.unit || ''}</td>
                  <td>${result.normalRange || ''}</td>
                  <td><span class="status-${result.status.toLowerCase()}">${result.status}</span></td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>
        ` : ''}

        <div class="section">
          <h3>Timing Information</h3>
          <table>
            <tr><td><strong>Ordered:</strong></td><td>${formatDateTime(test.orderedAt)}</td></tr>
            <tr><td><strong>Completed:</strong></td><td>${formatDateTime(test.completedAt)}</td></tr>
            <tr><td><strong>Verified:</strong></td><td>${formatDateTime(test.verifiedAt)}</td></tr>
            ${test.submittedBy ? `<tr><td><strong>Submitted By:</strong></td><td>${test.submittedBy}</td></tr>` : ''}
            ${test.verifiedBy ? `<tr><td><strong>Verified By:</strong></td><td>${test.verifiedBy}</td></tr>` : ''}
          </table>
        </div>
      </body>
      </html>
    `;
  };

  const handleFooterDownload = () => {
    if (!test) return;

    // If there's an uploaded PDF file, download it
    if (hasUsableResultFile && test.result_file) {
      const name = displayNameFromLabResultFileUrl(test.result_file);
      downloadResultFile(test.result_file, name);
      toast.success(`Downloaded result for ${test.patient.name}`);
      return;
    }

    // Otherwise, generate and download a PDF report
    generateAndDownloadPDFReport();
  };

  const generateAndDownloadPDFReport = async () => {
    if (!test) return;

    try {
      const blob = await apiFetch<Blob>(
        `/laboratory/verification/${test.id}/download_report/`,
        { responseType: 'blob' }
      );
      const filename = `lab_report_${test.patient.id}_${test.testCode}_${test.id}.pdf`;

      // Create and download the file
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      toast.success(`Downloaded lab report for ${test.patient.name}`);
    } catch (error) {
      console.error('PDF generation error:', error);
      toast.error((error as Error)?.message || 'Failed to generate PDF report');
    }
  };

  const pdfDisplayName =
    hasUsableResultFile && test?.result_file != null
      ? displayNameFromLabResultFileUrl(test.result_file)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-emerald-500" />
            Lab Report
          </DialogTitle>
          <DialogDescription>
            {test?.testName} - {test?.patient.name}
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
                <p className="font-medium">{test.patient.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age / Gender</p>
                <p className="font-medium">
                  {test.patient.age !== null && test.patient.age !== undefined
                    ? `${test.patient.age} years`
                    : ''}{' '}
                  / {test.patient.gender}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                <p className="font-medium">{test.doctor.name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Order ID</p>
                <p className="font-medium">{test.orderId}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Test Name</p>
                <p className="font-medium">{formatTestNameWithCode(test.testName, test.testCode)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clinic</p>
                <p className="font-medium">{test.clinic}</p>
              </div>
            </div>

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2">
                <FlaskConical className="h-4 w-4 text-amber-500" />
                Test Results
                {(test.results.length > 0 || hasUsableResultFile) && (
                  <Badge variant="outline" className={getOverallStatusBadge(test.overallStatus)}>
                    {test.overallStatus}
                  </Badge>
                )}
              </h3>

              {test.results.length > 0 ? (
                <>
                  {pdfDisplayName != null && hasUsableResultFile && test.result_file && (
                    <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
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
                            onClick={() => window.open(test.result_file!, '_blank')}
                            className="text-blue-800 border-blue-300"
                          >
                            <Eye className="h-3.5 w-3.5 mr-1" />
                            View
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              test.result_file && downloadResultFile(test.result_file, pdfDisplayName)
                            }
                            className="text-blue-800 border-blue-300"
                          >
                            <Download className="h-3.5 w-3.5 mr-1" />
                            Download
                          </Button>
                        </div>
                      </div>
                    </div>
                  )}



                   <div className="overflow-x-auto border rounded-lg">
                     <table className="w-full text-sm">
                       <thead>
                         <tr className="border-b bg-muted/50">
                           <th className="text-left p-3 font-medium">Parameter</th>
                           <th className="text-left p-3 font-medium">Result</th>
                           {!hideUnitNormalColumns && (
                             <th className="text-left p-3 font-medium">Unit</th>
                           )}
                           {!hideUnitNormalColumns && (
                             <th className="text-left p-3 font-medium">Normal Range</th>
                           )}
                           {hasRowAttachments && (
                             <th className="text-left p-3 font-medium">File</th>
                           )}
                           <th className="text-left p-3 font-medium">Status</th>
                         </tr>
                       </thead>
                       <tbody>
                         {test.results.map((r) => (
                           <tr key={r.parameter} className="border-b">
                             <td className="p-3 font-medium">{r.parameter}</td>
                             <td className={`p-3 ${getResultStatusColor(r.status)}`}>{r.value || 'Pending'}</td>
                             {!hideUnitNormalColumns && (
                               <td className="p-3 text-muted-foreground">{r.unit}</td>
                             )}
                             {!hideUnitNormalColumns && (
                               <td className="p-3 text-muted-foreground">{r.normalRange}</td>
                             )}
                             {hasRowAttachments && (
                               <td className="p-3">
                                 {r.attachment?.url ? (
                                   <Button
                                     variant="outline"
                                     size="sm"
                                     onClick={() => window.open(r.attachment!.url, '_blank')}
                                     className="h-7"
                                   >
                                     <FileText className="h-3.5 w-3.5 mr-1" />
                                     View
                                   </Button>
                                 ) : (
                                   <span className="text-muted-foreground">—</span>
                                 )}
                               </td>
                             )}
                             <td className="p-3">
                               {r.status === 'Normal' ? (
                                 <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                               ) : (
                                 <AlertTriangle
                                   className={`h-4 w-4 ${r.status === 'Critical' ? 'text-rose-500' : 'text-amber-500'}`}
                                 />
                               )}
                             </td>
                           </tr>
                         ))}
                       </tbody>
                     </table>
                   </div>
                </>
              ) : hasUsableResultFile && test.result_file && pdfDisplayName != null ? (
                <div className="space-y-4">
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-900 dark:text-amber-100">
                      {formatTestNameWithCode(test.testName, test.testCode)}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">Status: {test.overallStatus}</p>
                  </div>
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
                          onClick={() => window.open(test.result_file!, '_blank')}
                          className="text-blue-800 border-blue-300"
                        >
                          <Eye className="h-3.5 w-3.5 mr-1" />
                          View
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadResultFile(test.result_file!, pdfDisplayName)}
                          className="text-blue-800 border-blue-300"
                        >
                          <Download className="h-3.5 w-3.5 mr-1" />
                          Download
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
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
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              window.location.href = `/laboratory/orders?test=${test.id}`;
                            }}
                          >
                            Re-enter Results
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              toast.info('Please contact laboratory staff to resolve this issue.');
                            }}
                          >
                            Report Issue
                          </Button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Ordered</p>
                <p className="font-medium">
                  {formatDateTime(test.orderedAt).date} {formatDateTime(test.orderedAt).time}
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="font-medium">
                  {formatDateTime(test.completedAt).date} {formatDateTime(test.completedAt).time}
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Verified</p>
                <p className="font-medium">
                  {formatDateTime(test.verifiedAt).date} {formatDateTime(test.verifiedAt).time}
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Turnaround Time</p>
                <p className="font-medium">{test.turnaroundTime}</p>
              </div>
            </div>

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
          <Button onClick={handleFooterDownload} disabled={!test}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
