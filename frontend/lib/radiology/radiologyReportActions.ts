import { toast } from 'sonner';
import type { CompletedRadiologyReport } from './completedRadiologyReport';
import { logError } from '../client-logger';

export function openRadiologyReportUrl(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function downloadRadiologyReportFile(report: CompletedRadiologyReport) {
  if (!report.reportFile) {
    toast.error('No report file available for download');
    return;
  }
  try {
    const link = document.createElement('a');
    link.href = report.reportFile.url;
    link.download = `radiology_report_${report.patientName.replace(/\s+/g, '_')}_${report.id}.pdf`;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('Report download started');
  } catch (e) {
    logError('Download failed:', e);
    toast.error('Failed to download report. Please try again.');
  }
}

export function printRadiologyReport(report: CompletedRadiologyReport) {
  if (report.reportFile?.url) {
    window.open(report.reportFile.url, '_blank');
  }
}
