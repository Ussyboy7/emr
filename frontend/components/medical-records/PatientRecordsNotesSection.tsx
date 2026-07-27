'use client';

import { useCallback, useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ClipboardList, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { patientService, type PatientRecordsNote } from '@/lib/services/patient-service';
import { formatDisplayDateTime } from '@/lib/dates';

type Props = {
  patientNumericId: number;
};

export function PatientRecordsNotesSection({ patientNumericId }: Props) {
  const [notes, setNotes] = useState<PatientRecordsNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const [saving, setSaving] = useState(false);

  const loadNotes = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await patientService.getRecordsNotes(patientNumericId);
      setNotes(Array.isArray(rows) ? rows : []);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message || 'Failed to load records notes');
      setNotes([]);
    } finally {
      setLoading(false);
    }
  }, [patientNumericId]);

  useEffect(() => {
    void loadNotes();
  }, [loadNotes]);

  const handleSave = async () => {
    const note = draft.trim();
    if (!note || saving) return;
    setSaving(true);
    try {
      const created = await patientService.addRecordsNote(patientNumericId, note.slice(0, 800));
      setNotes((prev) => [created, ...prev]);
      setDraft('');
      setFormOpen(false);
      toast.success('Records note saved');
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save records note');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-lg flex items-center gap-2">
              <ClipboardList className="h-4 w-4" />
              Records notes
            </CardTitle>
            <p className="text-xs text-muted-foreground mt-1">
              Administrative notes for Medical Records — folder refs, ID issues, registration context.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setFormOpen((o) => !o)}
            disabled={saving}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add note
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {formOpen && (
          <div className="rounded-lg border bg-muted/20 p-3 space-y-2">
            <Label className="text-xs text-muted-foreground">New records note</Label>
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value.slice(0, 800))}
              placeholder="e.g. Possible duplicate of E-A1844 — flagged for supervisor review."
              rows={3}
              maxLength={800}
              autoFocus
            />
            <div className="flex items-center justify-between gap-2">
              <p className="text-[11px] text-muted-foreground">{draft.length}/800</p>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFormOpen(false);
                    setDraft('');
                  }}
                  disabled={saving}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || !draft.trim()}
                >
                  {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                  Save note
                </Button>
              </div>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-6 text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 animate-spin mr-2" />
            Loading notes…
          </div>
        ) : notes.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center">
            <p className="text-sm text-muted-foreground">No records notes yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Add a note for folder references or registration context.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {notes.map((n) => (
              <li key={n.id} className="rounded-md border bg-muted/10 px-3 py-2.5 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">
                    {n.recorded_by_name_snapshot || '—'}
                  </span>
                  <span>·</span>
                  <span>{formatDisplayDateTime(n.recorded_at)}</span>
                  {n.source === 'registration' && (
                    <Badge variant="outline" className="text-[10px] h-5 px-1.5">
                      Registration
                    </Badge>
                  )}
                </div>
                <p className="text-sm whitespace-pre-wrap">{n.note}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
