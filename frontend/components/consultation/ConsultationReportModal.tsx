"use client";

import React from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Download,
  Printer,
  User,
  FileText,
  Stethoscope,
  TestTube,
  ScanLine,
  Pill,
  Activity,
  Loader2,
} from "lucide-react";
import {
  buildConsultationReportHTML,
  reportFormatters,
  type ConsultationReportSession,
} from "@/lib/consultation-report";
import { getOrganizationHeader } from "@/lib/constants/organization";
import { toast } from "sonner";

const { formatDate, formatTime, formatPriority, vitalLabel, formatVitalDisplay, formatLabResult, formatRadiologyResult, formatResultWithPending } = reportFormatters;

export interface ConsultationReportModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: ConsultationReportSession | null;
  /** When true, show loading spinner instead of content */
  loading?: boolean;
}

function openReportPrint(session: ConsultationReportSession) {
  const html = buildConsultationReportHTML(session);
  const w = window.open("", "_blank");
  if (w) {
    w.document.write(html);
    w.document.close();
    w.onload = () => {
      w.print();
      w.close();
    };
    toast.success("Consultation report opened for printing");
  } else {
    toast.error("Please allow popups to print the report.");
  }
}

function openReportDownload(session: ConsultationReportSession) {
  toast.loading("Generating report...", { id: "report-download" });
  const html = buildConsultationReportHTML(session);
  const w = window.open("", "_blank");
  if (!w) {
    toast.error("Please allow popups to download the report.", { id: "report-download" });
    return;
  }
  w.document.write(html);
  w.document.close();
  w.onload = () => {
    setTimeout(() => {
      w.print();
      w.close();
      toast.success("Report sent to printer / Save as PDF", { id: "report-download" });
    }, 500);
  };
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
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading consultation report...</span>
          </div>
        ) : session ? (
          <>
            <DialogHeader>
              <div className="flex items-center justify-between">
                <div>
                  <DialogTitle className="flex items-center gap-3">
                    <FileText className="h-5 w-5 text-blue-500" />
                    Consultation Report
                    <Badge variant="outline">{session.id}</Badge>
                  </DialogTitle>
                  <DialogDescription>
                    {formatDate(session.started_at)} • {formatTime(session.started_at)} • {session.room_name ?? ""}
                  </DialogDescription>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => openReportDownload(session)}>
                    <Download className="h-4 w-4 mr-1" />
                    Download
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => openReportPrint(session)}>
                    <Printer className="h-4 w-4 mr-1" />
                    Print
                  </Button>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Patient Info + Consultation Details */}
              <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">PATIENT INFORMATION</h4>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      <span className="font-medium">{session.patient_name ?? ""}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      Patient ID: {session.patient_id ?? ""} • Age: {session.patient_age ?? ""} • Gender: {session.patient_gender ?? ""}
                    </div>
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-muted-foreground mb-2">CONSULTATION DETAILS</h4>
                  <div className="space-y-1 text-sm">
                    <div><strong>Doctor:</strong> {session.doctor_name ?? ""}</div>
                    <div><strong>Clinic:</strong> {session.clinic_name ?? ""}</div>
                    {(() => {
                      const durationText =
                        session.ended_at && session.started_at
                          ? Math.round(
                              (new Date(session.ended_at).getTime() - new Date(session.started_at).getTime()) / (1000 * 60)
                            ) + " min"
                          : session.started_at
                            ? Math.round(
                                (Date.now() - new Date(session.started_at).getTime()) / (1000 * 60)
                              ) + " min (ongoing)"
                            : "";
                      return durationText ? (
                        <div>
                          <strong>Duration:</strong> {durationText}
                        </div>
                      ) : null;
                    })()}
                    <div><strong>Room:</strong> {session.room_name ?? ""}</div>
                  </div>
                </div>
              </div>

              {/* Vitals */}
              {session.vitals && Object.keys(session.vitals).length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-blue-600 mb-2">VITAL SIGNS</h4>
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
                <h4 className="text-sm font-semibold text-amber-600">CLINICAL NOTES</h4>
                {session.presentation_complaint && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Presentation Complaint</label>
                    <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{session.presentation_complaint}</p>
                  </div>
                )}
                {session.history_of_presenting_illness && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">History of Present Illness</label>
                    <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{session.history_of_presenting_illness}</p>
                  </div>
                )}
                {session.physical_examination && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Physical Examination</label>
                    <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{session.physical_examination}</p>
                  </div>
                )}
                {session.assessment && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Assessment</label>
                    <p className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm border border-blue-200 dark:border-blue-800">
                      {session.assessment}
                    </p>
                  </div>
                )}
                {session.plan && (
                  <div>
                    <label className="text-xs font-medium text-muted-foreground">Treatment Plan</label>
                    <p className="mt-1 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm border border-emerald-200 dark:border-emerald-800 whitespace-pre-line">
                      {session.plan}
                    </p>
                  </div>
                )}
              </div>

              {/* Diagnoses */}
              {session.diagnoses && session.diagnoses.length > 0 && (
                <div>
                  <h4 className="text-sm font-semibold text-red-600 mb-2 flex items-center gap-2">
                    <Stethoscope className="h-4 w-4" />
                    DIAGNOSES
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-red-50 dark:bg-red-900/20">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">ICD-10 Code</th>
                          <th className="px-3 py-2 text-left font-medium">Diagnosis</th>
                          <th className="px-3 py-2 text-center font-medium">Diagnosis Type</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {session.diagnoses.map((diagnosis: any, index: number) => (
                          <tr key={diagnosis.id ?? index} className="hover:bg-muted/50">
                            <td className="px-3 py-2 font-mono text-xs">{diagnosis.code}</td>
                            <td className="px-3 py-2">
                              <div className="font-medium text-sm">{diagnosis.name}</div>
                              {diagnosis.notes && (
                                <div className="text-xs text-muted-foreground mt-1">{diagnosis.notes}</div>
                              )}
                            </td>
                            <td className="px-3 py-2 text-center">
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
                  <h4 className="text-sm font-semibold text-violet-600 mb-2 flex items-center gap-2">
                    <Pill className="h-4 w-4" />
                    PRESCRIPTIONS
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-violet-50 dark:bg-violet-900/20">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Medication</th>
                          <th className="px-3 py-2 text-left font-medium">Dose</th>
                          <th className="px-3 py-2 text-left font-medium">Frequency</th>
                          <th className="px-3 py-2 text-left font-medium">Duration</th>
                          <th className="px-3 py-2 text-center font-medium">Qty</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {session.prescriptions.map((rx: any, index: number) => (
                          <tr key={rx.id ?? index}>
                            <td className="px-3 py-2 font-medium">{(rx.medication_name ?? rx.medication) ?? ""}</td>
                            <td className="px-3 py-2">{rx.dosage ?? ""}</td>
                            <td className="px-3 py-2">{rx.frequency ?? ""}</td>
                            <td className="px-3 py-2">{rx.duration ?? ""}</td>
                            <td className="px-3 py-2 text-center">{rx.quantity ?? ""}</td>
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
                  <h4 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-2">
                    <TestTube className="h-4 w-4" />
                    LABORATORY ORDERS
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-amber-50 dark:bg-amber-900/20">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Test</th>
                          <th className="px-3 py-2 text-left font-medium">Priority</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                          <th className="px-3 py-2 text-left font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {session.labOrders.map((lab: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium">{lab.test ?? ""}</td>
                            <td className="px-3 py-2">{formatPriority(lab.priority)}</td>
                            <td className="px-3 py-2">{lab.status ?? ""}</td>
                            <td className="px-3 py-2 whitespace-pre-line break-words max-w-[28rem]">
                              {formatResultWithPending(
                                lab.result ? formatLabResult(lab.result) : "",
                                lab.status,
                                ["verified", "completed", "results_ready"]
                              )}
                            </td>
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
                  <h4 className="text-sm font-semibold text-sky-600 mb-2 flex items-center gap-2">
                    <ScanLine className="h-4 w-4" />
                    RADIOLOGY ORDERS
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-sky-50 dark:bg-sky-900/20">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Procedure</th>
                          <th className="px-3 py-2 text-left font-medium">Priority</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                          <th className="px-3 py-2 text-left font-medium">Result</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {session.radiologyOrders.map((rad: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium">{rad.procedure ?? ""}</td>
                            <td className="px-3 py-2">{formatPriority(rad.priority)}</td>
                            <td className="px-3 py-2">{rad.status ?? ""}</td>
                            <td className="px-3 py-2 whitespace-pre-line break-words max-w-[28rem]">
                              {formatResultWithPending(
                                rad.result ? formatRadiologyResult(rad.result) : "",
                                rad.status,
                                ["verified", "completed", "reported"]
                              )}
                            </td>
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
                  <h4 className="text-sm font-semibold text-emerald-600 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    PHYSIOTHERAPY ORDERS
                  </h4>
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-emerald-50 dark:bg-emerald-900/20">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Diagnosis / Chief Complaint</th>
                          <th className="px-3 py-2 text-left font-medium">Priority</th>
                          <th className="px-3 py-2 text-left font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {session.physioOrders.map((p: any, idx: number) => (
                          <tr key={idx}>
                            <td className="px-3 py-2 font-medium">{p.diagnosis ?? ""}</td>
                            <td className="px-3 py-2">{formatPriority(p.priority)}</td>
                            <td className="px-3 py-2">{p.status ?? ""}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Footer */}
              <div className="border-t pt-4 text-xs text-muted-foreground">
                <div className="flex justify-between">
                  <span>
                    Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
                  </span>
                  <span>Document ID: {session.id}</span>
                </div>
                <div className="mt-2 text-center">{getOrganizationHeader()}</div>
              </div>
            </div>
          </>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
