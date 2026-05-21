"use client";

import React from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  FileText,
  Printer,
  Stethoscope,
  TestTube,
  ScanLine,
  Pill,
  Activity,
  Loader2,
} from "lucide-react";
import {
  reportFormatters,
  type ConsultationReportSession,
} from "@/lib/consultation-report";
import { getOrganizationServicesHeader } from "@/lib/constants/organization";
import { toast } from "sonner";

const { formatDate, formatTime, formatPriority, vitalLabel, formatVitalDisplay } = reportFormatters;

export interface ConsultationReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ConsultationReportSession | null;
  /** When true, show loading spinner instead of content */
  loading?: boolean;
}

async function openReportPrint(session: ConsultationReportSession) {
  const { printConsultationPdf } = await import('@/lib/consultation/reportPdf');
  try {
    await printConsultationPdf(session.id);
  } catch {
    toast.error('Unable to print consultation report');
  }
}

async function openReportDownload(session: ConsultationReportSession) {
  toast.loading('Generating PDF...', { id: 'report-download' });
  try {
    const { downloadConsultationPdf } = await import('@/lib/consultation/reportPdf');
    await downloadConsultationPdf(session.id, String(session.id));
    toast.success('Report downloaded successfully', { id: 'report-download' });
  } catch {
    toast.error('Unable to download consultation report', { id: 'report-download' });
  }
}

export function ConsultationReportModal({
  open,
  onOpenChange,
  session,
  loading = false,
}: ConsultationReportModalProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.xl}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Consultation Report
          </DialogTitle>
          <DialogDescription>
            {session ? `${formatDate(session.started_at)} • ${formatTime(session.started_at)} • ${session.room_name ?? ''}` : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading consultation report...</span>
          </div>
        ) : session ? (
          <div className="space-y-6 py-4">
            <div className="text-center p-4 border-b">
              <h2 className="text-xl font-bold">CONSULTATION REPORT</h2>
              <p className="text-sm text-muted-foreground">{getOrganizationServicesHeader()}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Patient Name</p>
                <p className="font-medium">{session.patient_name ?? ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Patient ID</p>
                <p className="font-medium">{session.patient_id ?? ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Age / Gender</p>
                <p className="font-medium">
                  {session.patient_age != null && session.patient_age !== ''
                    ? `${session.patient_age} years`
                    : ''}{' '}
                  / {session.patient_gender ?? ''}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">{session.location_clinic_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clinic</p>
                <p className="font-medium">{session.clinic_name ?? ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Doctor</p>
                <p className="font-medium">{session.doctor_name ?? ''}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Room</p>
                <p className="font-medium">{session.room_name ?? ''}</p>
              </div>
              {(() => {
                const dur = session.ended_at && session.started_at
                  ? Math.round((new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60)) + ' min'
                  : session.started_at
                    ? Math.round((Date.now() - new Date(session.started_at).getTime()) / (1000 * 60)) + ' min (ongoing)'
                    : '';
                return dur ? (
                  <div>
                    <p className="text-xs text-muted-foreground">Duration</p>
                    <p className="font-medium">{dur}</p>
                  </div>
                ) : null;
              })()}
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline">
                  {session.status === 'completed' ? 'Completed' : 'In Progress'}
                </Badge>
              </div>
            </div>

            {/* Vitals */}
            {session.vitals && Object.keys(session.vitals).length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-blue-600 dark:text-blue-400">
                  <Activity className="h-4 w-4" />
                  VITAL SIGNS
                </h3>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                  {Object.entries(session.vitals).map(([key, value]) => (
                    <div
                      key={key}
                      className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center border border-blue-200 dark:border-blue-800"
                    >
                      <div className="text-xs text-muted-foreground">{vitalLabel(key)}</div>
                      <div className="font-medium">{formatVitalDisplay(key, value)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Clinical Notes */}
            <div className="space-y-4">
              <h3 className="font-semibold flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <FileText className="h-4 w-4" />
                CLINICAL NOTES
              </h3>
              {session.presentation_complaint && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Presentation Complaint</p>
                  <p className="p-3 bg-muted/50 rounded-lg text-sm">{session.presentation_complaint}</p>
                </div>
              )}
              {session.history_of_presenting_illness && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">History of Present Illness</p>
                  <p className="p-3 bg-muted/50 rounded-lg text-sm">{session.history_of_presenting_illness}</p>
                </div>
              )}
              {session.physical_examination && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Physical Examination</p>
                  <p className="p-3 bg-muted/50 rounded-lg text-sm">{session.physical_examination}</p>
                </div>
              )}
              {session.assessment && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Assessment</p>
                  <p className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm border border-blue-200 dark:border-blue-800">
                    {session.assessment}
                  </p>
                </div>
              )}
              {session.plan && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Treatment Plan</p>
                  <p className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm border border-emerald-200 dark:border-emerald-800 whitespace-pre-line">
                    {session.plan}
                  </p>
                </div>
              )}
            </div>

            {/* Diagnoses */}
            {session.diagnoses && session.diagnoses.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-red-600 dark:text-red-400">
                  <Stethoscope className="h-4 w-4" />
                  DIAGNOSES
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-red-50 dark:bg-red-950/30">
                      <tr>
                        <th className="text-left p-3 font-medium">ICD-10 Code</th>
                        <th className="text-left p-3 font-medium">Diagnosis</th>
                        <th className="text-center p-3 font-medium">Diagnosis Type</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {session.diagnoses.map((diagnosis: any, index: number) => (
                        <tr key={diagnosis.id ?? index} className="hover:bg-muted/50">
                          <td className="p-3 font-mono text-xs">{diagnosis.code}</td>
                          <td className="p-3">
                            <div className="font-medium text-sm">{diagnosis.name}</div>
                            {diagnosis.notes && (
                              <div className="text-xs text-muted-foreground mt-1">{diagnosis.notes}</div>
                            )}
                          </td>
                          <td className="p-3 text-center">
                            <Badge
                              variant="outline"
                              className={`text-xs ${
                                diagnosis.type === "Primary"
                                  ? "bg-red-500/10 text-red-600 border-red-500/30"
                                  : diagnosis.type === "Secondary"
                                    ? "bg-amber-500/10 text-amber-600 border-amber-500/30"
                                    : "bg-blue-500/10 text-blue-600 border-blue-500/30"
                              }`}
                            >
                              {diagnosis.type}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Prescriptions */}
            {session.prescriptions && session.prescriptions.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-violet-600 dark:text-violet-400">
                  <Pill className="h-4 w-4" />
                  PRESCRIPTIONS
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-violet-50 dark:bg-violet-950/30">
                      <tr>
                        <th className="text-left p-3 font-medium">Medication</th>
                        <th className="text-left p-3 font-medium">Dose</th>
                        <th className="text-left p-3 font-medium">Frequency</th>
                        <th className="text-left p-3 font-medium">Duration</th>
                        <th className="text-center p-3 font-medium">Qty</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {session.prescriptions.map((rx: any, index: number) => (
                        <tr key={rx.id ?? index}>
                          <td className="p-3 font-medium">{(rx.medication_name ?? rx.medication) ?? ''}</td>
                          <td className="p-3">{rx.dosage ?? ''}</td>
                          <td className="p-3 text-muted-foreground">{rx.frequency ?? ''}</td>
                          <td className="p-3 text-muted-foreground">{rx.duration ?? ''}</td>
                          <td className="p-3 text-center text-muted-foreground">{rx.quantity ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Laboratory Orders */}
            {session.labOrders && session.labOrders.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-amber-600 dark:text-amber-400">
                  <TestTube className="h-4 w-4" />
                  LABORATORY ORDERS
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-amber-50 dark:bg-amber-950/30">
                      <tr>
                        <th className="text-left p-3 font-medium">Test</th>
                        <th className="text-left p-3 font-medium">Priority</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {session.labOrders.map((lab: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-3 font-medium">{lab.test ?? ''}</td>
                          <td className="p-3">{formatPriority(lab.priority)}</td>
                          <td className="p-3">{lab.status ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Radiology Orders */}
            {session.radiologyOrders && session.radiologyOrders.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-sky-600 dark:text-sky-400">
                  <ScanLine className="h-4 w-4" />
                  RADIOLOGY ORDERS
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-sky-50 dark:bg-sky-950/30">
                      <tr>
                        <th className="text-left p-3 font-medium">Procedure</th>
                        <th className="text-left p-3 font-medium">Priority</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {session.radiologyOrders.map((rad: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-3 font-medium">{rad.procedure ?? ''}</td>
                          <td className="p-3">{formatPriority(rad.priority)}</td>
                          <td className="p-3">{rad.status ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Physiotherapy Orders */}
            {session.physioOrders && session.physioOrders.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                  <Activity className="h-4 w-4" />
                  PHYSIOTHERAPY ORDERS
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-emerald-50 dark:bg-emerald-950/30">
                      <tr>
                        <th className="text-left p-3 font-medium">Diagnosis / Chief Complaint</th>
                        <th className="text-left p-3 font-medium">Priority</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {session.physioOrders.map((p: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-3 font-medium">{p.diagnosis ?? ''}</td>
                          <td className="p-3">{formatPriority(p.priority)}</td>
                          <td className="p-3">{p.status ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Eye Care Orders */}
            {session.eyeOrders && session.eyeOrders.length > 0 && (
              <div>
                <h3 className="font-semibold mb-3 flex items-center gap-2 text-cyan-600 dark:text-cyan-400">
                  <FileText className="h-4 w-4" />
                  EYE CARE ORDERS
                </h3>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-cyan-50 dark:bg-cyan-950/30">
                      <tr>
                        <th className="text-left p-3 font-medium">Diagnosis / Chief Complaint</th>
                        <th className="text-left p-3 font-medium">Priority</th>
                        <th className="text-left p-3 font-medium">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {session.eyeOrders.map((e: any, idx: number) => (
                        <tr key={idx}>
                          <td className="p-3 font-medium">{e.diagnosis || e.chief_complaint || ''}</td>
                          <td className="p-3">{formatPriority(e.priority)}</td>
                          <td className="p-3">{e.status ?? ''}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="border-t pt-4 text-xs text-muted-foreground text-center">
              {getOrganizationServicesHeader()}
            </div>
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button variant="outline" onClick={() => session && openReportPrint(session)} disabled={!session}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={() => session && openReportDownload(session)} disabled={!session}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
