"use client";
import { formatDisplayDateTime } from '@/lib/dates';

/**
 * Merge History tab for the patient overview modal.
 *
 * Shows all merge-audit rows where the patient is the winner or loser,
 * and (for admin users) lets the admin un-merge the latest one.
 *
 * Fetches the data on mount via `patientService.getMergeAudit()` and
 * exposes an "Un-merge" button for rows where the patient is the winner
 * and `has_repointed_rows` is true.
 */
import { useEffect, useState, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, GitMerge, GitMergeIcon, Undo2, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { patientService } from '@/lib/services';
import { useCurrentUser } from '@/hooks/use-current-user';
import { isSystemAdminUser } from '@/lib/patient-permissions';

export interface MergeAuditRow {
  id: number;
  winner_id: number;
  winner_patient_id: string;
  loser_id: number;
  loser_patient_id: string;
  merged_at: string;
  merged_by: string | null;
  reason: string;
  has_repointed_rows: boolean;
  counters: Record<string, number>;
}

interface MergeHistoryTabProps {
  /** The numeric DB id of the patient this modal is for. */
  patientNumericId: number;
  /** Optional callback after a successful un-merge (e.g. refresh parent). */
  onUnmerged?: () => void;
}

function formatCounters(counters: Record<string, number> | undefined): string {
  if (!counters) return '';
  const entries = Object.entries(counters).filter(([, v]) => v > 0);
  if (entries.length === 0) return 'No clinical rows re-pointed';
  return entries
    .map(([k, v]) => `${k.replace(/_repointed$/, '').replace(/_/g, ' ')}: ${v}`)
    .join(', ');
}

function formatDateTime(iso: string): string {
  if (!iso) return '—';
  try {
    return formatDisplayDateTime(iso);
  } catch {
    return iso;
  }
}

export function MergeHistoryTab({ patientNumericId, onUnmerged }: MergeHistoryTabProps) {
  const { currentUser } = useCurrentUser();
  const [rows, setRows] = useState<MergeAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [unmerging, setUnmerging] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);

  const admin = isSystemAdminUser(currentUser);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await patientService.getMergeAudit(patientNumericId);
      setRows(data || []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load merge history.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [patientNumericId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleUnmerge(auditId: number) {
    setUnmerging(auditId);
    try {
      const result = await patientService.unmergePatient(patientNumericId, auditId);
      toast.success(
        `Un-merged. Loser restored as ${result.loser_patient_id}.`,
      );
      setConfirming(null);
      await load();
      onUnmerged?.();
    } catch (e: any) {
      toast.error(e?.message || 'Un-merge failed.');
    } finally {
      setUnmerging(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <span className="ml-3 text-sm text-muted-foreground">Loading merge history…</span>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center space-y-3">
          <GitMerge className="h-10 w-10 text-muted-foreground mx-auto" />
          <div>
            <p className="font-medium">No merge history</p>
            <p className="text-sm text-muted-foreground">
              This patient has not been involved in a merge.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Merge History</h3>
        <p className="text-sm text-muted-foreground">
          Every merge this patient was part of (as winner or loser).{' '}
          {admin
            ? 'You can un-merge the most recent merge from here.'
            : 'Only admin users can un-merge.'}
        </p>
      </div>

      <div className="space-y-3">
        {rows.map((row) => {
          const isWinner = row.winner_id === patientNumericId;
          const isLegacy = !row.has_repointed_rows;
          const isConfirming = confirming === row.id;
          return (
            <Card key={row.id}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <CardTitle className="text-base flex items-center gap-2">
                      <GitMergeIcon className="h-4 w-4 text-amber-500" />
                      Merge #{row.id}
                      {row.reason?.startsWith('UNMERGED:') ? (
                        <Badge variant="secondary" className="text-xs">Un-merge</Badge>
                      ) : null}
                    </CardTitle>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <p>
                        {row.loser_patient_id} → {row.winner_patient_id}
                      </p>
                      <p>
                        {formatDateTime(row.merged_at)} · by {row.merged_by || '—'}
                      </p>
                    </div>
                  </div>
                  <Badge variant={isWinner ? 'default' : 'outline'}>
                    {isWinner ? 'Winner' : 'Loser'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Reason</p>
                  <p className="text-sm whitespace-pre-wrap">{row.reason || '—'}</p>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground">Re-pointed</p>
                  <p className="text-xs font-mono text-muted-foreground">
                    {formatCounters(row.counters)}
                  </p>
                </div>

                {/* Un-merge action: only for admin, only when this patient is
                    the winner, and only when the audit row was created by
                    the new code path (has_repointed_rows). */}
                {admin && isWinner && !row.reason?.startsWith('UNMERGED:') ? (
                  <div className="pt-2 border-t">
                    {!isLegacy ? (
                      isConfirming ? (
                        <div className="flex items-center gap-2 flex-wrap">
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0" />
                          <p className="text-xs flex-1 min-w-0">
                            Reverse this merge? Clinical FKs will be re-pointed back and the loser will be re-activated.
                          </p>
                          <Button
                            size="sm"
                            variant="destructive"
                            onClick={() => handleUnmerge(row.id)}
                            disabled={unmerging === row.id}
                          >
                            {unmerging === row.id ? (
                              <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                            ) : (
                              <Undo2 className="h-3 w-3 mr-1" />
                            )}
                            Confirm un-merge
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setConfirming(null)}
                            disabled={unmerging === row.id}
                          >
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setConfirming(row.id)}
                        >
                          <Undo2 className="h-3 w-3 mr-1" />
                          Un-merge this record
                        </Button>
                      )
                    ) : (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <AlertTriangle className="h-3 w-3" />
                        <span>
                          Cannot auto-un-merge: this merge was created before un-merge support. Contact a developer.
                        </span>
                      </div>
                    )}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
