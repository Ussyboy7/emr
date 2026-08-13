"use client";

import { useCallback, useEffect, useState } from 'react';
import { ClipboardList, FileText, Loader2, Plus, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { apiFetch } from '@/lib/api-client';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { isWardHandoffOrder } from '@/lib/ward-admission-ui';
import { nursingService } from '@/lib/services/nursing-service';
import { formatDisplayDateTime } from '@/lib/dates';
import { toast } from 'sonner';
import type { PatientAdmission } from '@/lib/services/ward-service';
import type { WardNursingOrderRow } from '@/components/ward/WardDoctorOrdersSection';

type Props = {
  admission: PatientAdmission;
  canCompleteInstructions: boolean;
  canCancelInstructions: boolean;
  onOrdersChanged: () => void;
  canAddInstruction: boolean;
  onAddInstruction: () => void;
};

function priorityBadgeClass(priority: string) {
  switch (String(priority || '').toLowerCase()) {
    case 'urgent':
    case 'high': return 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10';
    case 'low': return 'border-slate-400/50 text-muted-foreground bg-slate-500/5';
    default: return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
  }
}

export function InstructionsTab({
  admission,
  canCompleteInstructions,
  canCancelInstructions,
  onOrdersChanged,
  canAddInstruction,
  onAddInstruction,
}: Props) {
  const [orders, setOrders] = useState<WardNursingOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [completeTarget, setCompleteTarget] = useState<WardNursingOrderRow | null>(null);
  const [cancelTarget, setCancelTarget] = useState<WardNursingOrderRow | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadInstructions = useCallback(async () => {
    try {
      const res = await apiFetch<{ results: WardNursingOrderRow[] }>(
        `/nursing/orders/?for_admission=${admission.id}&order_type=ward instruction&ordering=-ordered_at&page_size=${MAX_LIST_PAGE_SIZE}`,
      );
      const rows = (res.results || [])
        .map((r) => ({ ...r, source: 'nursing' as const }))
        .filter((o) => !isWardHandoffOrder(o));
      setOrders(rows);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load instructions');
    } finally {
      setLoading(false);
    }
  }, [admission.id]);

  useEffect(() => {
    setLoading(true);
    void loadInstructions();
  }, [loadInstructions]);

  const runMutation = async (order: WardNursingOrderRow, status: 'completed' | 'cancelled') => {
    setSubmitting(true);
    try {
      await nursingService.updateNursingOrder(order.id, { status });
      toast.success(status === 'completed' ? 'Instruction marked complete' : 'Instruction cancelled');
      setCompleteTarget(null);
      setCancelTarget(null);
      await loadInstructions();
      onOrdersChanged();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to update instruction');
    } finally {
      setSubmitting(false);
    }
  };

  const activeOrders = orders.filter((o) =>
    ['pending', 'in_progress'].includes(String(o.status || '').toLowerCase()),
  );
  const historyOrders = orders.filter((o) =>
    ['completed', 'cancelled'].includes(String(o.status || '').toLowerCase()),
  );

  return (
    <div className="space-y-5">
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="ml-3 text-sm text-muted-foreground">Loading instructions...</p>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Active instructions
              </h3>
              {canAddInstruction && (
                <Button type="button" size="sm" className="h-8 text-xs" onClick={onAddInstruction}>
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add instruction
                </Button>
              )}
            </div>
            {activeOrders.length === 0 ? (
              <div className="rounded-lg border border-dashed p-6 text-center">
                <ClipboardList className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
                <p className="text-sm text-muted-foreground">No active nursing instructions.</p>
              </div>
            ) : (
              activeOrders.map((o) => (
                <div key={o.id} className="rounded-lg border bg-card p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-muted-foreground">{o.order_id}</span>
                      <Badge variant="outline" className={`text-[10px] px-1.5 h-5 ${priorityBadgeClass(o.priority)}`}>
                        {(o.priority || 'medium').charAt(0).toUpperCase() + (o.priority || 'medium').slice(1)}
                      </Badge>
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{o.description}</p>
                    {(o.ordered_by_name || o.ordered_at) && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {o.ordered_by_name ? `Dr. ${o.ordered_by_name}` : ''}
                        {o.ordered_at ? ` · ${formatDisplayDateTime(o.ordered_at)}` : ''}
                      </p>
                    )}
                  </div>
                  {(canCompleteInstructions || canCancelInstructions) && (
                    <div className="flex items-center gap-1 shrink-0">
                      {canCompleteInstructions && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs text-emerald-600 dark:text-emerald-400"
                          onClick={() => setCompleteTarget(o)}
                          disabled={submitting}
                        >
                          Mark done
                        </Button>
                      )}
                      {canCancelInstructions && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-red-600 dark:text-red-400"
                          onClick={() => setCancelTarget(o)}
                          disabled={submitting}
                        >
                          Cancel
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}
          </section>

          {historyOrders.length > 0 && (
            <section className="space-y-2">
              <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Completed / cancelled
              </h3>
              {historyOrders.map((o) => (
                <div key={o.id} className="rounded-lg border border-muted bg-muted/10 p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-[10px] text-muted-foreground">{o.order_id}</span>
                      {String(o.status).toLowerCase() === 'cancelled' ? (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-red-500/40 text-red-600 dark:text-red-400 bg-red-500/5">
                          Cancelled
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/5">
                          Completed
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm mt-1 whitespace-pre-wrap">{o.description}</p>
                  </div>
                </div>
              ))}
            </section>
          )}
        </>
      )}

      {admission.admission_instructions?.trim() && (
        <section className="rounded-lg border bg-muted/20 p-3 space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Instructions at admission
          </h3>
          <Label className="text-[10px] font-normal text-muted-foreground">
            Recorded when the patient was admitted — shown for provenance.
          </Label>
          <p className="text-sm whitespace-pre-wrap">{admission.admission_instructions}</p>
        </section>
      )}

      <AlertDialog open={!!completeTarget} onOpenChange={(open) => !open && setCompleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark instruction complete?</AlertDialogTitle>
            <AlertDialogDescription>
              {completeTarget?.order_id} will be marked as completed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Keep open</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => completeTarget && void runMutation(completeTarget, 'completed')}
              disabled={submitting}
            >
              <RotateCcw className="h-4 w-4 mr-2" />
              Mark complete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!cancelTarget} onOpenChange={(open) => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel instruction?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.order_id} will be cancelled. This cannot be undone from the ward screen.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>Keep instruction</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => cancelTarget && void runMutation(cancelTarget, 'cancelled')}
              disabled={submitting}
            >
              Cancel instruction
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
