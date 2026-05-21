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
import { Download, FileText, Pill, Printer, Stethoscope } from 'lucide-react';
import { toast } from 'sonner';
import { getOrganizationServicesHeader } from '@/lib/constants/organization';

export interface PrescriptionReportMedicationRow {
  medication_name?: string;
  medication?: { name?: string };
  name?: string;
  dosage?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity?: string | number;
  instructions?: string;
  is_dispensed?: boolean;
  isDispensed?: boolean;
  unit?: string;
}

export interface PrescriptionReportDiagnosisRow {
  code: string;
  name: string;
  type: string;
  notes?: string;
}

export interface PrescriptionReportData {
  id?: string;
  date?: string;
  doctor?: string;
  status?: string;
  medications: PrescriptionReportMedicationRow[];
  /** ICD-10 rows from consultation session / visit (replaces free-text clinical notes on the report). */
  diagnoses?: PrescriptionReportDiagnosisRow[];
  /** Optional pharmacy / dispensing notes when no structured diagnoses are returned. */
  notes?: string;
  /** Optional free-text diagnosis for non-consultation contexts. */
  diagnosis?: string;
  /** Clinic name. */
  clinic?: string;
  location_clinic_name?: string;
  /** Doctor name (separate from 'doctor' for contexts that distinguish ordering doctor). */
  doctor_name?: string;
  /** Display-friendly prescription ID (RX-...). */
  prescription_id?: string;
  /** ISO date when prescribed. */
  prescribed_at?: string;
  /** ISO date when dispensed. */
  dispensed_at?: string;
  /** Name of user who dispensed. */
  dispensed_by_name?: string;
}

export interface PrescriptionReportPatient {
  name: string;
  patientId?: string;
  age?: number | string | null;
  gender?: string;
}

function medLabel(m: PrescriptionReportMedicationRow): string {
  return (
    m.medication_name ||
    m.medication?.name ||
    m.name ||
    ''
  ).trim();
}

function medDose(m: PrescriptionReportMedicationRow): string {
  return String(m.dose ?? m.dosage ?? '').trim();
}

function statusLabel(status: string | undefined): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'dispensed') return 'Dispensed';
  if (s === 'partially_dispensed') return 'Partially Dispensed';
  if (s === 'dispensing') return 'Processing';
  if (s === 'cancelled') return 'Cancelled';
  return 'Pending';
}

function statusBadgeClass(status: string | undefined): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'dispensed') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40';
  }
  if (s === 'partially_dispensed') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40';
  }
  if (s === 'dispensing') {
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/40';
  }
  if (s === 'cancelled') {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/40';
  }
  return 'bg-muted text-muted-foreground border-border';
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDateStr(d: string | undefined): string {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-US', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch { return d; }
}

function formatTimeStr(d: string | undefined): string {
  if (!d) return '';
  try {
    const date = new Date(d);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  } catch { return ''; }
}

function buildPrescriptionReportHTML(
  rx: PrescriptionReportData,
  patient: PrescriptionReportPatient | undefined
): string {
  const rows = (rx.medications || [])
    .map(
      (m) => {
        const dispensed = m.is_dispensed ?? m.isDispensed ?? false;
        return `
    <tr>
      <td>${escapeHtml(medLabel(m))}</td>
      <td>${escapeHtml(medDose(m))}</td>
      <td>${escapeHtml(String(m.frequency ?? '').trim())}</td>
      <td>${escapeHtml(String(m.duration ?? '').trim())}</td>
      <td style="text-align:center">${escapeHtml(m.quantity != null && m.quantity !== '' ? String(m.quantity) + (m.unit ? ' ' + m.unit : '') : '')}</td>
      <td style="text-align:center">${dispensed ? 'Yes' : 'No'}</td>
    </tr>`;
      }
    )
    .join('');

  const ageGenderLine = [patient?.age != null && patient.age !== '' ? `${patient.age} years` : '', patient?.gender || '']
    .filter(Boolean)
    .join(' / ');
  const patientBlock = patient
    ? `
  <div class="section patient-info">
    <table class="meta-table">
      <tr><td><strong>Patient Name</strong></td><td>${escapeHtml(patient.name)}</td>
          <td><strong>Patient ID</strong></td><td>${escapeHtml(String(patient.patientId ?? ''))}</td></tr>
      <tr><td><strong>Age / Gender</strong></td><td>${escapeHtml(ageGenderLine)}</td>
          <td><strong>Location</strong></td><td>${escapeHtml(rx.location_clinic_name ?? '')}</td></tr>
      <tr><td><strong>Clinic</strong></td><td colspan="3">${escapeHtml(String(rx.clinic ?? ''))}</td></tr>
    </table>
  </div>`
    : '';
  const metaPatient = patient ? `, ${escapeHtml(patient.name)}` : '';

  const dx = rx.diagnoses || [];
  let diagnosisBlock = '';
  if (dx.length > 0) {
    diagnosisBlock = `
  <div class="section">
    <h3>DIAGNOSIS (ICD-10)</h3>
    <table>
      <thead>
        <tr><th>ICD-10 Code</th><th>Diagnosis</th><th>Type</th></tr>
      </thead>
      <tbody>
        ${dx
          .map(
            (d) => `
        <tr>
          <td>${escapeHtml(d.code || '')}</td>
          <td>${escapeHtml(d.name || '')}${d.notes?.trim() ? `<br><span style="font-size:10pt;color:#555">${escapeHtml(d.notes)}</span>` : ''}</td>
          <td>${escapeHtml(d.type || '')}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>
  </div>`;
  } else if (rx.diagnosis?.trim()) {
    diagnosisBlock = `
  <div class="section">
    <h3>DIAGNOSIS</h3>
    <p>${escapeHtml(rx.diagnosis).replace(/\n/g, '<br>')}</p>
  </div>`;
  }

  const notesBlock =
    dx.length === 0 && !rx.diagnosis?.trim() && rx.notes?.trim()
      ? `
  <div class="section">
    <h3>NOTES</h3>
    <p>${escapeHtml(rx.notes).replace(/\n/g, '<br>')}</p>
  </div>`
      : '';

  const prescribedStr = rx.prescribed_at || rx.date
    ? `${formatDateStr(rx.prescribed_at || rx.date)} ${formatTimeStr(rx.prescribed_at || rx.date)}`
    : '';
  const dispensedStr = rx.dispensed_at
    ? `${formatDateStr(rx.dispensed_at)} ${formatTimeStr(rx.dispensed_at)}`
    : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prescription${metaPatient}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; font-size: 11pt; }
    .banner { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
    .banner h1 { margin: 0; font-size: 18pt; }
    .banner p { margin: 4px 0 0; font-size: 10pt; color: #444; }
    .section { margin-bottom: 18px; }
    .section h3 { font-size: 11pt; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .meta-table td { border: none; padding: 3px 8px; }
    .meta-table td:first-child, .meta-table td:nth-child(3) { font-weight: 600; white-space: nowrap; }
    .footer { margin-top: 28px; text-align: center; font-size: 9pt; color: #666; border-top: 1px solid #ddd; padding-top: 12px; }
    .ts-grid { display: flex; gap: 16px; margin-top: 12px; }
    .ts-box { border: 1px solid #ccc; border-radius: 4px; padding: 8px 12px; flex: 1; }
    .ts-box .label { font-size: 9pt; color: #666; }
    .ts-box .value { font-weight: 600; }
    @media print {
      html, body { height: auto !important; overflow: visible !important; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="banner">
    <h1>PRESCRIPTION</h1>
    <p>${escapeHtml(getOrganizationServicesHeader())}</p>
  </div>
  ${patientBlock}
  <div class="section">
    <h3>PRESCRIPTION DETAILS</h3>
    <table class="meta-table">
      <tr>
        <td>Ordering Doctor</td><td>${escapeHtml(rx.doctor_name || rx.doctor || '')}</td>
        <td>Prescription ID</td><td>${escapeHtml(rx.prescription_id || rx.id || '')}</td>
      </tr>
      <tr>
        <td>Status</td><td>${escapeHtml(statusLabel(rx.status))}</td>
        <td></td><td></td>
      </tr>
    </table>
  </div>
  ${diagnosisBlock}
  ${notesBlock}
  <div class="section">
    <h3>Medications</h3>
    <table>
      <thead>
        <tr>
          <th>Medication</th>
          <th>Dose</th>
          <th>Frequency</th>
          <th>Duration</th>
          <th style="text-align:center">Qty</th>
          <th style="text-align:center">Dispensed</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="6" style="text-align:center">No medications listed</td></tr>'}</tbody>
    </table>
  </div>
  <div class="ts-grid">
    <div class="ts-box">
      <div class="label">Prescribed</div>
      <div class="value">${escapeHtml(prescribedStr)}</div>
    </div>
    <div class="ts-box">
      <div class="label">Dispensed</div>
      <div class="value">${escapeHtml(dispensedStr)}${rx.dispensed_by_name ? `<br><span style="font-size:9pt;color:#666">by ${escapeHtml(rx.dispensed_by_name)}</span>` : ''}</div>
    </div>
  </div>
  <div class="footer">
    <p>${escapeHtml(getOrganizationServicesHeader())}</p>
    <p>Generated: ${escapeHtml(new Date().toLocaleString())}</p>
  </div>
</body>
</html>`;
}

export interface PrescriptionReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prescription: PrescriptionReportData | null;
  patient?: PrescriptionReportPatient | null;
  /** Numeric database ID for PDF download. Falls back to prescription.id. */
  prescriptionDbId?: string | number | null;
}

export function PrescriptionReportDialog({
  open,
  onOpenChange,
  prescription,
  patient,
  prescriptionDbId,
}: PrescriptionReportDialogProps) {
  const rx = prescription;

  const getPdfId = (): string | null => {
    if (prescriptionDbId != null) return String(prescriptionDbId);
    if (rx?.id) return String(rx.id);
    return null;
  };

  const handlePrint = async () => {
    const id = getPdfId();
    if (!id) {
      toast.error('Prescription ID not available for printing.');
      return;
    }
    try {
      const { printPrescriptionPdf } = await import('@/lib/pharmacy/prescriptionPdf');
      await printPrescriptionPdf(id);
    } catch {
      toast.error('Unable to print prescription');
    }
  };

  const handleDownload = async () => {
    const id = getPdfId();
    if (!id) {
      toast.error('Prescription ID not available for download.');
      return;
    }
    try {
      const label = rx?.prescription_id || rx?.id || 'prescription';
      const { downloadPrescriptionPdf } = await import('@/lib/pharmacy/prescriptionPdf');
      await downloadPrescriptionPdf(id, String(label));
    } catch {
      toast.error('Unable to download prescription');
    }
  };

  const formatDate = (d: string | undefined): string => {
    if (!d) return '';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return d;
      return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      });
    } catch {
      return d;
    }
  };

  const formatTime = (d: string | undefined): string => {
    if (!d) return '';
    try {
      const date = new Date(d);
      if (isNaN(date.getTime())) return '';
      return date.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      });
    } catch {
      return '';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.ml}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-500" />
            Prescription
          </DialogTitle>
          <DialogDescription>
            {rx ? `${rx.prescription_id || rx.id || ''} - ${patient?.name || ''}` : 'Prescription'}
          </DialogDescription>
        </DialogHeader>

        {rx && (
          <div className="space-y-6 py-4">
            <div className="text-center p-4 border-b">
              <h2 className="text-xl font-bold">PRESCRIPTION</h2>
              <p className="text-sm text-muted-foreground">{getOrganizationServicesHeader()}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Patient Name</p>
                <p className="font-medium">{patient?.name || ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Patient ID</p>
                <p className="font-medium">{patient?.patientId ?? ''}</p>
              </div>
              {(() => {
                const ag = patient ? [patient.age != null && patient.age !== '' ? `${patient.age} years` : null, patient.gender || null]
                  .filter(Boolean)
                  .join(' / ') : '';
                return (
                  <div>
                    <p className="text-xs text-muted-foreground">Age / Gender</p>
                    <p className="font-medium">{ag}</p>
                  </div>
                );
              })()}
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">{rx.location_clinic_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clinic</p>
                <p className="font-medium">{rx.clinic || (rx as any)?.visit_details?.clinic || ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                <p className="font-medium">{rx.doctor_name || rx.doctor || ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Prescription ID</p>
                <p className="font-medium">{rx.prescription_id || rx.id || ''}</p>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <span className="text-xs text-muted-foreground">Status</span>
                <Badge variant="outline" className={statusBadgeClass(rx.status)}>
                  {statusLabel(rx.status)}
                </Badge>
              </div>
            </div>

            {(rx.diagnoses && rx.diagnoses.length > 0) ? (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Stethoscope className="h-4 w-4" />
                  DIAGNOSIS (ICD-10)
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-red-50 dark:bg-red-950/30">
                        <th className="text-left p-3 font-medium">ICD-10 Code</th>
                        <th className="text-left p-3 font-medium">Diagnosis</th>
                        <th className="text-center p-3 font-medium">Type</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rx.diagnoses.map((d, i) => (
                        <tr key={`${d.code}-${i}`} className="border-b">
                          <td className="p-3 font-mono text-xs">{d.code || ''}</td>
                          <td className="p-3">
                            <div className="font-medium">{d.name || ''}</div>
                            {d.notes?.trim() ? (
                              <div className="text-xs text-muted-foreground mt-1">{d.notes}</div>
                            ) : null}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                d.type === 'Primary'
                                  ? 'bg-red-500/10 text-red-600 border-red-500/30'
                                  : d.type === 'Secondary'
                                    ? 'bg-amber-500/10 text-amber-600 border-amber-500/30'
                                    : 'bg-blue-500/10 text-blue-600 border-blue-500/30'
                              }`}
                            >
                              {d.type}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : rx.diagnosis?.trim() ? (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Stethoscope className="h-4 w-4" />
                  DIAGNOSIS
                </h3>
                <p className="p-3 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap">{rx.diagnosis}</p>
              </div>
            ) : rx.notes?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">NOTES</h3>
                <p className="p-3 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap">{rx.notes}</p>
              </div>
            ) : null}

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-violet-700 dark:text-violet-300">
                <Pill className="h-4 w-4" />
                Medications
              </h3>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-violet-50 dark:bg-violet-950/30">
                      <th className="text-left p-3 font-medium">Medication</th>
                      <th className="text-left p-3 font-medium">Dose</th>
                      <th className="text-left p-3 font-medium">Frequency</th>
                      <th className="text-left p-3 font-medium">Duration</th>
                      <th className="text-center p-3 font-medium">Qty</th>
                      <th className="text-center p-3 font-medium">Dispensed</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rx.medications.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="p-4 text-center text-muted-foreground">
                          No medications listed
                        </td>
                      </tr>
                    ) : (
                      rx.medications.map((m, i) => {
                        const dispensed = m.is_dispensed ?? m.isDispensed ?? false;
                        return (
                          <tr key={i} className="border-b">
                            <td className="p-3 font-medium">{medLabel(m)}</td>
                            <td className="p-3">{medDose(m)}</td>
                            <td className="p-3 text-muted-foreground">
                              {String(m.frequency ?? '').trim()}
                            </td>
                            <td className="p-3 text-muted-foreground">
                              {String(m.duration ?? '').trim()}
                            </td>
                            <td className="p-3 text-center text-muted-foreground">
                              {m.quantity != null && m.quantity !== '' ? `${String(m.quantity)}${m.unit ? ` ${m.unit}` : ''}` : ''}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant={dispensed ? 'default' : 'outline'} className={dispensed ? 'bg-emerald-600' : ''}>
                                {dispensed ? 'Yes' : 'No'}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Prescribed</p>
                <p className="font-medium">
                  {rx.prescribed_at || rx.date
                    ? `${formatDate(rx.prescribed_at || rx.date)} ${formatTime(rx.prescribed_at || rx.date)}`
                    : ''}
                </p>
              </div>
              <div className="p-3 rounded-lg border">
                <p className="text-xs text-muted-foreground">Dispensed</p>
                <p className="font-medium">
                  {rx.dispensed_at
                    ? `${formatDate(rx.dispensed_at)} ${formatTime(rx.dispensed_at)}`
                    : ''}
                </p>
                {rx.dispensed_by_name && (
                  <p className="text-xs text-muted-foreground mt-1">
                    by {rx.dispensed_by_name}
                  </p>
                )}
              </div>
            </div>

            <div className="border-t pt-4 text-xs text-muted-foreground text-center">
              {getOrganizationServicesHeader()}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={handlePrint} disabled={!rx}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={handleDownload} disabled={!rx}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
