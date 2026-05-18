import { apiFetch } from '@/lib/api-client';

export async function downloadPrescriptionPdf(prescriptionId: number | string, prescriptionLabel: string): Promise<void> {
  const blob = await apiFetch<Blob>(
    `/pharmacy/prescriptions/${prescriptionId}/download/`,
    { responseType: 'blob' },
  );
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `prescription_${prescriptionLabel}.pdf`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export async function printPrescriptionPdf(prescriptionId: number | string): Promise<void> {
  const blob = await apiFetch<Blob>(
    `/pharmacy/prescriptions/${prescriptionId}/download/`,
    { responseType: 'blob' },
  );
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
}
