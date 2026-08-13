"use client";

import { useState } from 'react';
import { FileText, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ProgressNotesTimeline } from '@/components/ward/ProgressNotesTimeline';
import { WardHandoverNotesSection } from '@/components/ward/WardHandoverNotesSection';
import { wardService } from '@/lib/services/ward-service';
import { buildNurseObservationNotePayload } from '@/lib/ward-admission-ui';
import { formatDisplayDateTime } from '@/lib/dates';
import { toast } from 'sonner';
import type { PatientAdmission } from '@/lib/services/ward-service';
import type { User } from '@/lib/npa-structure';

type Props = {
  admission: PatientAdmission;
  currentUser: User | null;
  /** Doctors may append progress notes. Nurses get the handover log instead. */
  canWriteProgressNotes: boolean;
  /** Nurses may add handover log entries. */
  canWriteHandover: boolean;
  onNotesChanged: (fresh: PatientAdmission) => void;
};

export function NotesTab({
  admission,
  currentUser,
  canWriteProgressNotes,
  canWriteHandover,
  onNotesChanged,
}: Props) {
  const [progressNote, setProgressNote] = useState('');
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingHandover, setIsSavingHandover] = useState(false);

  const handleSaveProgressNote = async () => {
    if (!progressNote.trim()) {
      toast.error('Please enter a progress note');
      return;
    }
    setIsSavingNote(true);
    try {
      const timestamp = formatDisplayDateTime(new Date());
      const authorName = currentUser?.name || currentUser?.username || 'Unknown';
      const newNote = `[${timestamp} — Dr. ${authorName}]\n${progressNote.trim()}`;
      const existing = admission.admission_notes?.trim();
      const combined = existing ? `${newNote}\n\n---\n\n${existing}` : newNote;

      const updated = await wardService.updateAdmission(admission.id, { admission_notes: combined });
      toast.success('Progress note saved');
      setProgressNote('');
      onNotesChanged(updated);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save progress note');
    } finally {
      setIsSavingNote(false);
    }
  };

  const handleSaveHandoverNote = async (body: string) => {
    setIsSavingHandover(true);
    try {
      const authorName = currentUser?.name || currentUser?.username || 'Nurse';
      const timestamp = formatDisplayDateTime(new Date());
      const notesPayload = buildNurseObservationNotePayload({
        authorName,
        timestamp,
        bodyLines: [body],
        existingNotes: admission.admission_notes,
      });
      const updated = await wardService.updateAdmission(admission.id, {
        admission_notes: notesPayload,
      });
      toast.success('Handover note saved');
      onNotesChanged(updated);
    } catch (error: any) {
      toast.error(error.message || 'Failed to save handover note');
      throw error;
    } finally {
      setIsSavingHandover(false);
    }
  };

  return (
    <div className="space-y-6">
      {admission.admission_notes ? (
        <section>
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            Clinical progress notes
          </h3>
          <ProgressNotesTimeline notes={admission.admission_notes} excludeHandoff />
        </section>
      ) : (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <FileText className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No clinical progress notes yet.</p>
        </div>
      )}

      {canWriteProgressNotes && admission.status === 'admitted' && (
        <section className="rounded-lg border bg-card p-3 space-y-2">
          <Label className="text-sm font-medium">Clinical progress note</Label>
          <Textarea
            value={progressNote}
            onChange={(e) => setProgressNote(e.target.value)}
            placeholder="Clinical findings, progress and plan…"
            rows={4}
            className="resize-y"
          />
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => void handleSaveProgressNote()}
              disabled={isSavingNote || !progressNote.trim()}
            >
              {isSavingNote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
              Save progress note
            </Button>
          </div>
        </section>
      )}

      <WardHandoverNotesSection
        admissionNotes={admission.admission_notes}
        canAdd={canWriteHandover}
        onAddNote={handleSaveHandoverNote}
        isSaving={isSavingHandover}
      />
    </div>
  );
}
