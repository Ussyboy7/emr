'use client';

import { type ReactNode, useEffect, useState } from 'react';
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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Activity, Download, FileText, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { formatDisplayDate, formatDisplayDateTime } from '@/lib/dates';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { getOrganizationServicesHeader } from '@/lib/constants/organization';
import { physioService, type PhysioSession } from '@/lib/services';

export interface PhysioSessionReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  session: PhysioSession | null;
  handleAuthError?: (error: unknown) => boolean;
}

function sessionLabel(session: PhysioSession): string {
  return joinDisplayParts([
    session.session_number != null ? `Session ${session.session_number}` : '',
    session.status?.replace(/_/g, ' '),
  ]);
}

function sessionDurationMinutes(session: PhysioSession): string {
  if (session.duration_minutes != null && session.duration_minutes > 0) {
    return `${session.duration_minutes} min`;
  }
  if (session.started_at && session.completed_at) {
    const mins = Math.round(
      (new Date(session.completed_at).getTime() - new Date(session.started_at).getTime()) / 60000,
    );
    return mins > 0 ? `${mins} min` : '—';
  }
  return '—';
}

function listItems(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (item == null) return '';
      if (typeof item === 'object') {
        const obj = item as Record<string, unknown>;
        return String(
          obj.name ?? obj.exercise ?? obj.description ?? obj.recommendation ?? obj.instruction ?? '',
        );
      }
      return String(item);
    })
    .filter((s) => s.trim());
}

interface ReportField {
  label: string;
  key: keyof PhysioSession;
  list?: boolean;
  suffix?: string;
}

interface ReportSection {
  title: string;
  tone: string;
  fields: ReportField[];
}

const sections: ReportSection[] = [
  {
    title: 'A. Patient Assessment',
    tone: 'teal',
    fields: [
      { label: 'Chief Complaint', key: 'presenting_complaint' },
      { label: 'Pain Level Before', key: 'pain_level_before', suffix: '/10' },
      { label: 'Pain Level After', key: 'pain_level_after', suffix: '/10' },
    ],
  },
  {
    title: 'B. Medical & Social Background',
    tone: 'blue',
    fields: [
      { label: 'Medical History', key: 'medical_history' },
      { label: 'Surgical History', key: 'surgical_history' },
      { label: 'Medications', key: 'medications' },
      { label: 'Allergies', key: 'allergies' },
      { label: 'Social History', key: 'social_history' },
      { label: 'Previous Treatments', key: 'previous_treatments' },
    ],
  },
  {
    title: 'C. Physical Examination',
    tone: 'cyan',
    fields: [
      { label: 'Posture & Gait', key: 'posture_gait' },
      { label: 'Range of Motion', key: 'range_of_motion' },
      { label: 'Muscle Strength', key: 'muscle_strength' },
      { label: 'Sensation', key: 'sensation' },
      { label: 'Reflexes', key: 'reflexes' },
      { label: 'Balance & Coordination', key: 'balance_coordination' },
      { label: 'Special Tests', key: 'special_tests' },
    ],
  },
  {
    title: 'D. Functional Evaluation',
    tone: 'violet',
    fields: [
      { label: 'Functional Assessment', key: 'functional_assessment' },
      { label: 'Functional Limitations', key: 'functional_limitations' },
      { label: 'Functional Goals', key: 'functional_goals' },
      { label: 'Assistive Devices', key: 'assistive_devices' },
    ],
  },
  {
    title: 'E. Clinical Reasoning',
    tone: 'orange',
    fields: [
      { label: 'Assessment Findings', key: 'assessment_findings' },
      { label: 'Diagnosis Impression', key: 'diagnosis_impression' },
      { label: 'Prognosis', key: 'prognosis' },
      { label: 'Clinical Reasoning', key: 'clinical_reasoning' },
    ],
  },
  {
    title: 'F. Treatment Plan',
    tone: 'red',
    fields: [
      { label: 'Treatment Performed', key: 'treatment_performed' },
      { label: 'Exercises Prescribed', key: 'exercises_prescribed', list: true },
      { label: 'Equipment Used', key: 'equipment_used', list: true },
      { label: 'Patient Education', key: 'patient_education' },
      { label: 'Next Session Plan', key: 'next_session_plan' },
    ],
  },
  {
    title: 'G. Session & Continuity',
    tone: 'indigo',
    fields: [
      { label: 'Session Notes', key: 'session_notes' },
      { label: 'Progress Notes', key: 'progress_notes' },
      { label: 'Recommendations', key: 'recommendations', list: true },
      { label: 'Follow-up Instructions', key: 'follow_up_instructions' },
    ],
  },
];

function hasContent(session: PhysioSession, fields: ReportField[]): boolean {
  return fields.some((f) => {
    const value = session[f.key];
    if (f.list) return listItems(value).length > 0;
    return value != null && String(value).trim() !== '';
  });
}

export function PhysioSessionReportDialog({
  open,
  onOpenChange,
  session,
  handleAuthError,
}: PhysioSessionReportDialogProps) {
  const [orderSessions, setOrderSessions] = useState<PhysioSession[]>([]);
  const [viewingSession, setViewingSession] = useState<PhysioSession | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);

  useEffect(() => {
    if (!open || !session) {
      setOrderSessions([]);
      setViewingSession(null);
      return;
    }

    const orderId = session.order ?? session.order_details?.id;
    if (!orderId) {
      setOrderSessions([session]);
      setViewingSession(session);
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await physioService.getSessions({ order: orderId, page_size: 50 });
        const list = res?.results ?? [];
        const merged = list.some((s) => s.id === session.id) ? list : [session, ...list];
        const sorted = [...merged].sort((a, b) => (a.session_number ?? 0) - (b.session_number ?? 0));
        if (!cancelled) {
          setOrderSessions(sorted);
          setViewingSession(session);
        }
      } catch (err: unknown) {
        if (!cancelled) {
          if (handleAuthError?.(err)) return;
          toast.error('Failed to load sessions for this order');
          setOrderSessions([session]);
          setViewingSession(session);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, session, handleAuthError]);

  const reportSession = viewingSession ?? session;

  const handleDownloadPdf = async () => {
    if (!reportSession?.id) return;
    setPdfLoading(true);
    try {
      const blob = await physioService.downloadSessionReport(reportSession.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `physio-session-${reportSession.id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success('PDF download started');
    } catch (err: unknown) {
      if (handleAuthError?.(err)) return;
      toast.error(err instanceof Error ? err.message : 'Failed to download PDF');
    } finally {
      setPdfLoading(false);
    }
  };

  if (!reportSession) return null;

  const patientName =
    reportSession.patient_name ?? reportSession.order_details?.patient_name ?? '—';
  const patientId =
    reportSession.patient_id ?? reportSession.order_details?.patient_id ?? '—';
  const order = reportSession.order_details;
  const generatedAt = reportSession.completed_at ?? reportSession.scheduled_at;
  const statusLabel = (s?: string) =>
    s ? s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '—';
  const priorityLabel = order?.priority
    ? String(order.priority).replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    : '—';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.xl}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Physiotherapy Session Report
          </DialogTitle>
          <DialogDescription>
            {joinDisplayParts([
              reportSession.id != null ? `PHY-${String(reportSession.id).padStart(6, '0')}` : '',
              reportSession.session_number != null ? `Session ${reportSession.session_number}` : '',
              generatedAt ? formatDisplayDateTime(generatedAt) : '',
            ])}
          </DialogDescription>
        </DialogHeader>

        {orderSessions.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-sm text-muted-foreground">View session:</span>
            <Select
              value={String(reportSession.id)}
              onValueChange={(id) => {
                const next = orderSessions.find((s) => String(s.id) === id);
                if (next) setViewingSession(next);
              }}
            >
              <SelectTrigger className="w-[240px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orderSessions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    {sessionLabel(s)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-6 py-4 max-h-[65vh] overflow-y-auto">
          <div className="text-center p-4 border-b">
            <h2 className="text-xl font-bold flex items-center justify-center gap-2">
              <Activity className="h-5 w-5 text-teal-600" />
              PHYSIOTHERAPY SESSION REPORT
            </h2>
            <p className="text-sm text-muted-foreground">{getOrganizationServicesHeader()}</p>
          </div>

          <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
            <div>
              <p className="text-xs text-muted-foreground">Patient Name</p>
              <p className="font-medium">{patientName}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Patient ID</p>
              <p className="font-medium">{patientId}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Location</p>
              <p className="font-medium">{order?.location_clinic_name || '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Session</p>
              <p className="font-medium">{reportSession.session_number ?? '—'}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Physiotherapist</p>
              <p className="font-medium">
                {reportSession.physiotherapist_name || order?.ordered_by_name || '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Priority</p>
              <p className="font-medium">{priorityLabel}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Scheduled</p>
              <p className="font-medium">
                {reportSession.scheduled_at ? formatDisplayDate(reportSession.scheduled_at) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Completed</p>
              <p className="font-medium">
                {reportSession.completed_at ? formatDisplayDate(reportSession.completed_at) : '—'}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Duration</p>
              <p className="font-medium">{sessionDurationMinutes(reportSession)}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Status</p>
              <Badge variant="outline">{statusLabel(reportSession.status)}</Badge>
            </div>
          </div>

          {order?.diagnosis && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Primary Diagnosis
              </p>
              <p className="text-sm mt-1">{order.diagnosis}</p>
            </div>
          )}

          {sections.map((section) => {
            if (!hasContent(reportSession, section.fields)) return null;
            return (
              <ReportSection key={section.title} title={section.title} tone={section.tone}>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {section.fields.map((field) => {
                    const value = reportSession[field.key];
                    if (field.list) {
                      const items = listItems(value);
                      if (items.length === 0) return null;
                      return (
                        <FieldBlock key={field.key} label={field.label}>
                          <ul className="list-disc pl-5 space-y-0.5 text-sm">
                            {items.map((item, i) => (
                              <li key={i}>{item}</li>
                            ))}
                          </ul>
                        </FieldBlock>
                      );
                    }
                    if (value == null || String(value).trim() === '') return null;
                    return (
                      <FieldBlock key={field.key} label={field.label}>
                        <p className="text-sm whitespace-pre-wrap">
                          {String(value)}
                          {field.suffix ? ` ${field.suffix}` : ''}
                        </p>
                      </FieldBlock>
                    );
                  })}
                </div>
              </ReportSection>
            );
          })}

          <div className="border-t pt-4 text-xs text-muted-foreground flex justify-between">
            <span>
              Report generated {generatedAt ? formatDisplayDateTime(generatedAt) : '—'}
            </span>
            {reportSession.id != null && (
              <span>Session ID: PHY-{String(reportSession.id).padStart(6, '0')}</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" onClick={() => void handleDownloadPdf()} disabled={pdfLoading || !reportSession.id}>
            {pdfLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Download PDF
          </Button>
          <Button variant="outline" onClick={() => window.print()} disabled={!reportSession}>
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportSection({
  title,
  tone,
  children,
}: {
  title: string;
  tone: string;
  children: ReactNode;
}) {
  const colors: Record<string, string> = {
    teal: 'text-teal-700 dark:text-teal-400',
    blue: 'text-blue-700 dark:text-blue-400',
    cyan: 'text-cyan-700 dark:text-cyan-400',
    violet: 'text-violet-700 dark:text-violet-400',
    orange: 'text-orange-700 dark:text-orange-400',
    red: 'text-red-700 dark:text-red-400',
    indigo: 'text-indigo-700 dark:text-indigo-400',
  };
  return (
    <div className="space-y-3">
      <h3 className={`text-lg font-semibold border-b pb-2 ${colors[tone]}`}>{title}</h3>
      {children}
    </div>
  );
}

function FieldBlock({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <div className="bg-muted/50 p-3 rounded border min-h-[48px]">{children}</div>
    </div>
  );
}
