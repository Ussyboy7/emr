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
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, FileText, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { formatDisplayDateTime } from '@/lib/dates';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
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
    reportSession.patient_name ?? reportSession.order_details?.patient_name ?? 'N/A';
  const patientId =
    reportSession.patient_id ?? reportSession.order_details?.patient_id ?? 'N/A';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.lg}>
        <DialogHeader>
          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                <span className="truncate">Physiotherapy Session Report — {patientName}</span>
              </DialogTitle>
              <DialogDescription>
                {joinDisplayParts([
                  reportSession.id != null ? `PHY-${String(reportSession.id).padStart(6, '0')}` : '',
                  reportSession.session_number != null ? `Session ${reportSession.session_number}` : '',
                ])}
              </DialogDescription>
            </div>
            <div className="flex gap-2 print:hidden shrink-0">
              <Button variant="outline" size="sm" onClick={() => void handleDownloadPdf()} disabled={pdfLoading}>
                {pdfLoading ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
                Download PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => window.print()}>
                <Printer className="h-4 w-4 mr-1" />
                Print
              </Button>
            </div>
          </div>
        </DialogHeader>

        {orderSessions.length > 1 && (
          <div className="space-y-2">
            <Label className="text-sm">Session</Label>
            <Select
              value={String(reportSession.id)}
              onValueChange={(id) => {
                const next = orderSessions.find((s) => String(s.id) === id);
                if (next) setViewingSession(next);
              }}
            >
              <SelectTrigger className="w-full sm:w-[280px]">
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

        <div className="space-y-6">
          <div className="border-b pb-4">
            <h2 className="text-lg font-semibold text-blue-700">PHYSIOTHERAPY SESSION REPORT</h2>
            <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-4">
              <div className="space-y-1 text-sm">
                <p><span className="font-medium">Name:</span> {patientName}</p>
                <p><span className="font-medium">ID:</span> {patientId}</p>
                {reportSession.physiotherapist_name?.trim() && (
                  <p><span className="font-medium">Physiotherapist:</span> {reportSession.physiotherapist_name}</p>
                )}
              </div>
              <div className="space-y-1 text-sm">
                {reportSession.session_number != null && (
                  <p><span className="font-medium">Session:</span> {reportSession.session_number}</p>
                )}
                {reportSession.scheduled_at && (
                  <p><span className="font-medium">Scheduled:</span> {formatDisplayDateTime(reportSession.scheduled_at)}</p>
                )}
                {reportSession.completed_at && (
                  <p><span className="font-medium">Completed:</span> {formatDisplayDateTime(reportSession.completed_at)}</p>
                )}
              </div>
            </div>
            {reportSession.order_details?.diagnosis && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Primary Diagnosis</p>
                <p className="text-sm mt-1">{reportSession.order_details.diagnosis}</p>
              </div>
            )}
          </div>

          <ReportSection title="A. Patient Assessment" tone="teal">
            <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
              {reportSession.presenting_complaint || 'Not documented'}
            </p>
            {(reportSession.pain_level_before != null || reportSession.pain_level_after != null) && (
              <div className="grid grid-cols-2 gap-2 mt-2">
                {reportSession.pain_level_before != null && (
                  <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded border">
                    <p className="text-xs text-muted-foreground">Before</p>
                    <p className="text-xl font-bold text-red-600">{reportSession.pain_level_before}/10</p>
                  </div>
                )}
                {reportSession.pain_level_after != null && (
                  <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded border">
                    <p className="text-xs text-muted-foreground">After</p>
                    <p className="text-xl font-bold text-green-600">{reportSession.pain_level_after}/10</p>
                  </div>
                )}
              </div>
            )}
          </ReportSection>

          <ReportSection title="B. Medical & Social Background" tone="blue">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FieldBlock label="Medical History" value={reportSession.medical_history} />
              <FieldBlock label="Medications" value={reportSession.medications} />
            </div>
          </ReportSection>

          <ReportSection title="E. Clinical Reasoning" tone="orange">
            <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
              {reportSession.clinical_reasoning || reportSession.assessment_findings || 'Not documented'}
            </p>
          </ReportSection>

          <ReportSection title="F. Treatment Plan" tone="red">
            <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
              {reportSession.next_session_plan || reportSession.treatment_performed || 'Not documented'}
            </p>
          </ReportSection>

          {(reportSession.treatment_performed || reportSession.progress_notes) && (
            <ReportSection title="Treatment Performed & Outcomes" tone="indigo">
              {reportSession.treatment_performed && (
                <FieldBlock label="Treatment Performed" value={reportSession.treatment_performed} />
              )}
              {reportSession.progress_notes && (
                <FieldBlock label="Progress Notes" value={reportSession.progress_notes} />
              )}
            </ReportSection>
          )}

          <div className="border-t pt-4 text-xs text-muted-foreground flex justify-between">
            <span>Report generated {formatDisplayDateTime(new Date())}</span>
            {reportSession.id != null && (
              <span>Session ID: PHY-{String(reportSession.id).padStart(6, '0')}</span>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
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
  tone: 'teal' | 'blue' | 'orange' | 'red' | 'indigo';
  children: ReactNode;
}) {
  const colors: Record<string, string> = {
    teal: 'text-teal-700 dark:text-teal-400',
    blue: 'text-blue-700 dark:text-blue-400',
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

function FieldBlock({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="space-y-2">
      <Label className="text-sm font-medium">{label}</Label>
      <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">{value || 'Not documented'}</p>
    </div>
  );
}
