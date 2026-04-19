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
  const printWindow = window.open('', '_blank');
  if (!printWindow) return;

  const safeReport = (report.report || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const printContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <title>Radiology Report - ${report.patientName}</title>
          <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .header { text-align: center; border-bottom: 2px solid #333; padding-bottom: 20px; margin-bottom: 30px; }
            .logo { font-size: 24px; font-weight: bold; color: #2563eb; }
            .report-title { font-size: 18px; margin: 10px 0; }
            .patient-info { margin: 20px 0; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .info-item { margin: 5px 0; }
            .label { font-weight: bold; }
            .timeline { margin: 20px 0; background: #f8f9fa; padding: 15px; border-radius: 5px; }
            .timeline-item { margin: 5px 0; }
            .signatures { margin: 30px 0; }
            .signature-item { margin: 15px 0; border-top: 1px solid #ddd; padding-top: 10px; }
            @media print {
              html, body { height: auto !important; overflow: visible !important; margin: 0; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="logo">Nigerian Ports Authority</div>
            <div class="logo">Medical Services</div>
            <div class="report-title">RADIOLOGY REPORT</div>
          </div>

          <div class="patient-info">
            <h3>Patient Information</h3>
            <div class="info-grid">
              <div class="info-item"><span class="label">Patient Name:</span> ${report.patientName}</div>
              <div class="info-item"><span class="label">Patient ID:</span> ${report.patientId}</div>
              <div class="info-item"><span class="label">Age/Gender:</span> ${report.age}y ${report.gender}</div>
              <div class="info-item"><span class="label">Study:</span> ${report.studyType}</div>
            </div>
          </div>

          <div class="timeline">
            <h3>Study Timeline</h3>
            <div class="timeline-item"><span class="label">Ordered:</span> ${report.orderedAt}</div>
            <div class="timeline-item"><span class="label">Completed:</span> ${report.completedAt}</div>
            <div class="timeline-item"><span class="label">Verified:</span> ${report.verifiedAt}</div>
            <div class="timeline-item"><span class="label">Turnaround Time:</span> ${report.turnaroundTime}</div>
          </div>

          ${
            report.report
              ? `
          <div class="patient-info" style="margin-top: 20px;">
            <h3>Report Content</h3>
            <div style="margin: 10px 0;"><div class="label">Report:</div><div style="white-space: pre-wrap;">${safeReport}</div></div>
          </div>
          `
              : ''
          }

          <div class="signatures">
            <h3>Signatures</h3>
            <div class="signature-item">
              <div><span class="label">Ordering Doctor:</span> ${report.orderingDoctor}</div>
              <div><span class="label">Reported By:</span> ${report.reportedBy}</div>
              <div><span class="label">Verified By:</span> ${report.verifiedBy}</div>
            </div>
          </div>
        </body>
      </html>
    `;

  printWindow.document.write(printContent);
  printWindow.document.close();
  printWindow.print();
}
