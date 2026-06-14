'use client';

import { useEffect, useState } from 'react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Download, Eye, FileText, Loader2, Printer } from 'lucide-react';
import { toast } from 'sonner';
import { formatDisplayDate } from '@/lib/dates';
import { reportFormatters } from '@/lib/consultation-report';
import { getOrganizationServicesHeader } from '@/lib/constants/organization';
import { downloadEyeSessionPdf, printEyeSessionPdf } from '@/lib/eyecare/sessionReportPdf';
import { EyeSessionReportView } from '@/components/eyecare/EyeSessionReportView';
import { eyeCareService, type EyeSession } from '@/lib/services/eye-care-service';

const { formatDate, formatTime, formatPriority } = reportFormatters;

export interface EyeSessionReportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: number;
  /** When an order has multiple completed sessions, open this one first. */
  initialSessionId?: number;
}

function completedSessions(sessions: EyeSession[]): EyeSession[] {
  return sessions.filter((s) => s.status === 'completed');
}

function pickPreferredSession(sessions: EyeSession[]): EyeSession | null {
  const completed = completedSessions(sessions);
  if (!completed.length) return null;
  return [...completed].sort((a, b) => (b.session_number ?? 0) - (a.session_number ?? 0))[0];
}

function sessionStatusLabel(status: string | undefined): string {
  if (!status) return '—';
  return status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function sessionDurationMinutes(session: EyeSession): string {
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

export function EyeSessionReportDialog({
  open,
  onOpenChange,
  orderId,
  initialSessionId,
}: EyeSessionReportDialogProps) {
  const [loading, setLoading] = useState(false);
  const [orderSessions, setOrderSessions] = useState<EyeSession[]>([]);
  const [viewingSession, setViewingSession] = useState<EyeSession | null>(null);

  useEffect(() => {
    if (!open || !orderId) {
      setOrderSessions([]);
      setViewingSession(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    (async () => {
      try {
        const response = await eyeCareService.getSessions({
          order: orderId,
          page_size: 50,
          status: 'completed',
        });
        const sessions = completedSessions(response?.results ?? []);
        const preferred =
          (initialSessionId != null
            ? sessions.find((s) => s.id === initialSessionId)
            : null) ?? pickPreferredSession(sessions);
        if (cancelled) return;
        if (!preferred) {
          toast.error('No completed eye session for this order yet.');
          onOpenChange(false);
          return;
        }
        const fresh = await eyeCareService.getSession(preferred.id);
        if (cancelled) return;
        setOrderSessions(sessions);
        setViewingSession(fresh);
      } catch {
        if (!cancelled) {
          toast.error('Failed to load eye session report');
          onOpenChange(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, orderId, initialSessionId, onOpenChange]);

  const session = viewingSession;
  const order = session?.order_details;
  const reportTimestamp = session?.completed_at;

  const openReportPrint = async (target: EyeSession) => {
    try {
      await printEyeSessionPdf(target.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Unable to print eye session report');
    }
  };

  const openReportDownload = async (target: EyeSession) => {
    const label = target.order_details?.patient_id ?? String(target.id);
    toast.loading('Generating PDF...', { id: 'eye-report-download' });
    try {
      await downloadEyeSessionPdf(target.id, label);
      toast.success('Report downloaded successfully', { id: 'eye-report-download' });
    } catch {
      toast.error('Unable to download report', { id: 'eye-report-download' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={MODAL_SIZES.xl}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Eye Session Report
          </DialogTitle>
          <DialogDescription>
            {session && reportTimestamp
              ? `${formatDate(reportTimestamp)} • ${formatTime(reportTimestamp)} • ${order?.location_clinic_name || '—'}`
              : ''}
          </DialogDescription>
        </DialogHeader>

        {orderSessions.length > 1 && session && (
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <span className="text-sm text-muted-foreground">View session:</span>
            <Select
              value={String(session.id)}
              onValueChange={async (id) => {
                const next = orderSessions.find((s) => s.id === Number(id));
                if (!next) return;
                const fresh = await eyeCareService.getSession(next.id);
                setViewingSession(fresh);
              }}
            >
              <SelectTrigger className="w-[220px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {orderSessions.map((s) => (
                  <SelectItem key={s.id} value={String(s.id)}>
                    Session {s.session_number}
                    {s.completed_at ? ` · ${formatDisplayDate(s.completed_at)}` : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <span className="ml-2 text-muted-foreground">Loading report...</span>
          </div>
        ) : session ? (
          <div className="space-y-6 py-4 max-h-[65vh] overflow-y-auto">
            <div className="text-center p-4 border-b">
              <h2 className="text-xl font-bold flex items-center justify-center gap-2">
                <Eye className="h-5 w-5 text-cyan-600" />
                EYE SESSION REPORT
              </h2>
              <p className="text-sm text-muted-foreground">{getOrganizationServicesHeader()}</p>
            </div>

            <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
              <div>
                <p className="text-xs text-muted-foreground">Patient Name</p>
                <p className="font-medium">{session.patient_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Patient ID</p>
                <p className="font-medium">{session.patient_id || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Location</p>
                <p className="font-medium">{order?.location_clinic_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Session</p>
                <p className="font-medium">{session.session_number ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Clinician</p>
                <p className="font-medium">{order?.ordered_by_name || '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Priority</p>
                <p className="font-medium">{order?.priority ? formatPriority(order.priority) : '—'}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Scheduled</p>
                <p className="font-medium">
                  {session.scheduled_at ? formatDate(session.scheduled_at) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Completed</p>
                <p className="font-medium">
                  {session.completed_at ? formatDate(session.completed_at) : '—'}
                </p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Duration</p>
                <p className="font-medium">{sessionDurationMinutes(session)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Status</p>
                <Badge variant="outline">{sessionStatusLabel(session.status)}</Badge>
              </div>
            </div>

            <EyeSessionReportView reportSession={session} />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
          <Button
            variant="outline"
            onClick={() => session && void openReportPrint(session)}
            disabled={!session}
          >
            <Printer className="h-4 w-4 mr-2" />
            Print
          </Button>
          <Button onClick={() => session && void openReportDownload(session)} disabled={!session}>
            <Download className="h-4 w-4 mr-2" />
            Download PDF
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
