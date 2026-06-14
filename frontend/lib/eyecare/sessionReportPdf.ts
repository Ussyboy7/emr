import { apiFetch } from '@/lib/api-client';

async function fetchEyeSessionPdfBlob(sessionId: number | string): Promise<Blob> {
  return apiFetch<Blob>(
    `/eyecare/sessions/${sessionId}/session_report_pdf/`,
    { responseType: 'blob' },
  );
}

export async function downloadEyeSessionPdf(
  sessionId: number | string,
  label: string,
): Promise<void> {
  const blob = await fetchEyeSessionPdfBlob(sessionId);
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `eye_session_${label}.pdf`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function printEyeSessionPdf(sessionId: number | string): Promise<void> {
  const blob = await fetchEyeSessionPdfBlob(sessionId);
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked — allow pop-ups to open the report PDF.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
