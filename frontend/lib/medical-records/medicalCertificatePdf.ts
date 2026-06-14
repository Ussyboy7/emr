import { apiFetch } from '@/lib/api-client';

export async function downloadMedicalCertificatePdf(
  certificateId: number | string,
  certificateNumber: string,
): Promise<void> {
  const blob = await apiFetch<Blob>(
    `/medical-certificates/${certificateId}/pdf/`,
    { responseType: 'blob' },
  );
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `medical_certificate_${certificateNumber}.pdf`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function printMedicalCertificatePdf(certificateId: number | string): Promise<void> {
  const blob = await apiFetch<Blob>(
    `/medical-certificates/${certificateId}/pdf/`,
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(blob);
  const opened = window.open(url, '_blank');
  if (!opened) {
    URL.revokeObjectURL(url);
    throw new Error('Pop-up blocked — allow pop-ups to open the certificate PDF.');
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
