import { apiFetch } from '@/lib/api-client';

export async function downloadConsultationPdf(sessionId: number | string, sessionLabel: string): Promise<void> {
  const blob = await apiFetch<Blob>(
    `/consultation/sessions/${sessionId}/report/`,
    { responseType: 'blob' },
  );
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `consultation_report_${sessionLabel}.pdf`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function printConsultationPdf(sessionId: number | string): Promise<void> {
  const blob = await apiFetch<Blob>(
    `/consultation/sessions/${sessionId}/report/`,
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
