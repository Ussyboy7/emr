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
import { getOrganizationHeader } from '@/lib/constants/organization';

export interface PrescriptionReportMedicationRow {
  medication_name?: string;
  medication?: { name?: string };
  name?: string;
  dosage?: string;
  dose?: string;
  frequency?: string;
  duration?: string;
  quantity?: string | number;
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
  return 'bg-muted text-muted-foreground border-border';
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPrescriptionReportHTML(
  rx: PrescriptionReportData,
  patient: PrescriptionReportPatient | undefined
): string {
  const rows = (rx.medications || [])
    .map(
      (m) => `
    <tr>
      <td>${escapeHtml(medLabel(m))}</td>
      <td>${escapeHtml(medDose(m))}</td>
      <td>${escapeHtml(String(m.frequency ?? '').trim())}</td>
      <td>${escapeHtml(String(m.duration ?? '').trim())}</td>
      <td>${escapeHtml(m.quantity != null && m.quantity !== '' ? String(m.quantity) : '')}</td>
    </tr>`
    )
    .join('');

  const ageGenderLine = [patient?.age != null && patient.age !== '' ? `${patient.age} years` : '', patient?.gender || '']
    .filter(Boolean)
    .join(' / ');
  const patientBlock = patient
    ? `
  <div class="section">
    <h3>PATIENT INFORMATION</h3>
    <p><strong>Name:</strong> ${escapeHtml(patient.name)}</p>
    ${patient.patientId ? `<p><strong>Patient ID:</strong> ${escapeHtml(String(patient.patientId))}</p>` : ''}
    ${ageGenderLine ? `<p><strong>Age / Gender:</strong> ${escapeHtml(ageGenderLine)}</p>` : ''}
  </div>`
    : '';

  const dx = rx.diagnoses || [];
  const diagnosisBlock =
    dx.length > 0
      ? `
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
  </div>`
      : '';

  const notesBlock =
    dx.length === 0 && rx.notes?.trim()
      ? `
  <div class="section">
    <h3>NOTES</h3>
    <p>${escapeHtml(rx.notes).replace(/\n/g, '<br>')}</p>
  </div>`
      : '';

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Prescription Report</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 24px; color: #111; font-size: 12pt; }
    .banner { text-align: center; border-bottom: 2px solid #333; padding-bottom: 12px; margin-bottom: 20px; }
    .banner h1 { margin: 0; font-size: 18pt; }
    .banner p { margin: 4px 0 0; font-size: 10pt; color: #444; }
    .section { margin-bottom: 18px; }
    .section h3 { font-size: 11pt; color: #333; border-bottom: 1px solid #ccc; padding-bottom: 4px; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th, td { border: 1px solid #ccc; padding: 8px; text-align: left; }
    th { background: #f5f5f5; font-weight: 600; }
    .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 16px; font-size: 11pt; }
    .footer { margin-top: 28px; text-align: center; font-size: 9pt; color: #666; border-top: 1px solid #ddd; padding-top: 12px; }
    @media print {
      html, body { height: auto !important; overflow: visible !important; margin: 0; }
    }
  </style>
</head>
<body>
  <div class="banner">
    <h1>PRESCRIPTION REPORT</h1>
    <p>Nigerian Ports Authority Medical Services</p>
  </div>
  ${patientBlock}
  <div class="section">
    <h3>PRESCRIPTION DETAILS</h3>
    <div class="meta">
      ${rx.date ? `<div><strong>Date prescribed:</strong> ${escapeHtml(rx.date)}</div>` : ''}
      ${rx.doctor ? `<div><strong>Prescribing doctor:</strong> ${escapeHtml(rx.doctor)}</div>` : ''}
      <div><strong>Status:</strong> ${escapeHtml(statusLabel(rx.status))}</div>
    </div>
  </div>
  ${diagnosisBlock}
  ${notesBlock}
  <div class="section">
    <h3>PRESCRIPTIONS</h3>
    <table>
      <thead>
        <tr>
          <th>Medication</th>
          <th>Dose</th>
          <th>Frequency</th>
          <th>Duration</th>
          <th>Qty</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="5">No medications listed</td></tr>'}</tbody>
    </table>
  </div>
  <div class="footer">
    <p>${escapeHtml(getOrganizationHeader())}</p>
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
}

export function PrescriptionReportDialog({
  open,
  onOpenChange,
  prescription,
  patient,
}: PrescriptionReportDialogProps) {
  const handlePrint = () => {
    if (!prescription) return;
    const html = buildPrescriptionReportHTML(prescription, patient ?? undefined);
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Please allow popups to print.');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      w.print();
      w.close();
    };
    toast.success('Prescription report sent to printer');
  };

  const handleDownload = () => {
    if (!prescription) return;
    const html = buildPrescriptionReportHTML(prescription, patient ?? undefined);
    const w = window.open('', '_blank');
    if (!w) {
      toast.error('Please allow popups to save as PDF.');
      return;
    }
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      setTimeout(() => {
        w.print();
        w.close();
        toast.success('Use Print → Save as PDF in the dialog');
      }, 400);
    };
  };

  const rx = prescription;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.ml}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-violet-500" />
            Prescription Report
          </DialogTitle>
          <DialogDescription>
            {prescription?.date ? `${prescription.date}` : 'Prescription'}
            {prescription?.doctor ? ` • ${prescription.doctor}` : ''}
          </DialogDescription>
        </DialogHeader>

        {rx && (
          <div className="space-y-6 py-4">
            <div className="text-center p-4 border-b">
              <h2 className="text-xl font-bold">PRESCRIPTION REPORT</h2>
              <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
            </div>

            {patient && (
              <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                <div>
                  <p className="text-xs text-muted-foreground">Patient Name</p>
                  <p className="font-medium">{patient.name}</p>
                </div>
                {patient.patientId != null && String(patient.patientId).trim() !== '' && (
                  <div>
                    <p className="text-xs text-muted-foreground">Patient ID</p>
                    <p className="font-medium">{patient.patientId}</p>
                  </div>
                )}
                {(() => {
                  const ag = [patient.age != null && patient.age !== '' ? `${patient.age} years` : null, patient.gender || null]
                    .filter(Boolean)
                    .join(' / ');
                  return ag ? (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Age / Gender</p>
                      <p className="font-medium">{ag}</p>
                    </div>
                  ) : null;
                })()}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
              {rx.date && (
                <div>
                  <p className="text-xs text-muted-foreground">Date prescribed</p>
                  <p className="font-medium">{rx.date}</p>
                </div>
              )}
              {rx.doctor && (
                <div>
                  <p className="text-xs text-muted-foreground">Prescribing doctor</p>
                  <p className="font-medium">{rx.doctor}</p>
                </div>
              )}
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
            ) : rx.notes?.trim() ? (
              <div>
                <h3 className="text-sm font-semibold text-muted-foreground mb-2">NOTES</h3>
                <p className="p-3 rounded-lg bg-muted/50 border text-sm whitespace-pre-wrap">{rx.notes}</p>
              </div>
            ) : null}

            <div>
              <h3 className="font-semibold mb-3 flex items-center gap-2 text-violet-700 dark:text-violet-300">
                <Pill className="h-4 w-4" />
                PRESCRIPTIONS
              </h3>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-violet-50 dark:bg-violet-950/30">
                      <th className="text-left p-3 font-medium">Medication</th>
                      <th className="text-left p-3 font-medium">Dose</th>
                      <th className="text-left p-3 font-medium">Frequency</th>
                      <th className="text-left p-3 font-medium">Duration</th>
                      <th className="text-left p-3 font-medium">Qty</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rx.medications.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-muted-foreground">
                          No medications listed
                        </td>
                      </tr>
                    ) : (
                      rx.medications.map((m, i) => (
                        <tr key={i} className="border-b">
                          <td className="p-3 font-medium">{medLabel(m)}</td>
                          <td className="p-3">{medDose(m)}</td>
                          <td className="p-3 text-muted-foreground">
                            {String(m.frequency ?? '').trim()}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {String(m.duration ?? '').trim()}
                          </td>
                          <td className="p-3 text-muted-foreground">
                            {m.quantity != null && m.quantity !== '' ? String(m.quantity) : ''}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="border-t pt-4 text-xs text-muted-foreground text-center">
              {getOrganizationHeader()}
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
