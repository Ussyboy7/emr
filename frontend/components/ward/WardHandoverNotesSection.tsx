'use client';

import { useState } from 'react';
import { ClipboardList, Loader2, Plus, Thermometer } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  ProgressNotesTimeline,
  parseAdmissionNotes,
  sanitizeNursingNoteBody,
} from '@/components/ward/ProgressNotesTimeline';
import { isHandoffNoteBody } from '@/lib/ward-admission-ui';

type Props = {
  admissionNotes: string | null | undefined;
  canAdd: boolean;
  onAddNote: (body: string) => Promise<void>;
  isSaving?: boolean;
};

export function WardHandoverNotesSection({
  admissionNotes,
  canAdd,
  onAddNote,
  isSaving = false,
}: Props) {
  const [formOpen, setFormOpen] = useState(false);
  const [draft, setDraft] = useState('');

  const hasLogEntries =
    !!admissionNotes &&
    parseAdmissionNotes(admissionNotes).some((e) => {
      const body = sanitizeNursingNoteBody(e.body);
      return body.length > 0 && !(e.isSystem && isHandoffNoteBody(e.body));
    });

  const handleSubmit = async () => {
    const body = draft.trim();
    if (!body || isSaving) return;
    await onAddNote(body);
    setDraft('');
    setFormOpen(false);
  };

  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <ClipboardList className="h-3.5 w-3.5" />
            Handover &amp; nursing log
          </h3>
          <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
            For the next nurse — IV status, family updates, pending tasks, overnight events.
          </p>
        </div>
        {canAdd && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 shrink-0"
            onClick={() => setFormOpen((o) => !o)}
            disabled={isSaving}
          >
            <Plus className="h-3.5 w-3.5 mr-1" />
            Add note
          </Button>
        )}
      </div>

      {formOpen && canAdd && (
        <div className="rounded-lg border border-border/80 bg-muted/20 p-3 space-y-2">
          <Label className="text-xs text-muted-foreground">Handover note</Label>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="For the next nurse — IV status, family update, pending tasks, overnight events…"
            rows={3}
            className="resize-y min-h-[5rem]"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setFormOpen(false);
                setDraft('');
              }}
              disabled={isSaving}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSubmit()}
              disabled={isSaving || !draft.trim()}
            >
              {isSaving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Save handover
            </Button>
          </div>
        </div>
      )}

      {hasLogEntries ? (
        <ProgressNotesTimeline notes={admissionNotes} excludeHandoff />
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <Thermometer className="h-10 w-10 mx-auto mb-3 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">No handover notes yet</p>
          {canAdd && (
            <p className="text-xs text-muted-foreground mt-1">
              Click <span className="font-medium text-foreground">Add note</span> to leave a message for the next nurse.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
