import { toast } from 'sonner';
import type { CompletedRadiologyReport } from './completedRadiologyReport';
import { openMediaInNewTab } from '@/lib/media-url';
import { logError } from '../client-logger';

export async function openRadiologyReportUrl(url: string) {
  try {
    await openMediaInNewTab(url);
  } catch (e) {
    logError('Open report failed:', e);
    toast.error(e instanceof Error ? e.message : 'Failed to open report');
  }
}

export async function downloadRadiologyReportFile(report: CompletedRadiologyReport) {
  if (!report.reportFile) {
    toast.error('No report file available for download');
    return;
  }
  try {
    await openMediaInNewTab(report.reportFile.url);
    toast.success('Report opened');
  } catch (e) {
    logError('Download failed:', e);
    toast.error('Failed to download report. Please try again.');
  }
}

export async function printRadiologyReport(report: CompletedRadiologyReport) {
  if (report.reportFile?.url) {
    await openRadiologyReportUrl(report.reportFile.url);
  }
}
