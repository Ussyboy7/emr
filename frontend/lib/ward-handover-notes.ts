import {
  parseAdmissionNotes,
  sanitizeNursingNoteBody,
  type ProgressNoteEntry,
} from '@/components/ward/ProgressNotesTimeline';
import { isHandoffNoteBody } from '@/lib/ward-admission-ui';

export type HandoverNoteEntry = ProgressNoteEntry & { body: string };

/** Nurse handover entries from admission_notes (notes saved without vitals). */
export function getNurseHandoverEntries(
  notes: string | null | undefined,
): HandoverNoteEntry[] {
  return parseAdmissionNotes(notes)
    .filter((e) => !(e.isSystem && isHandoffNoteBody(e.body)))
    .map((e) => ({ ...e, body: sanitizeNursingNoteBody(e.body) }))
    .filter((e) => e.body.length > 0 && !e.isSystem && isNurseHandoverAuthor(e.author));
}

export function isNurseHandoverAuthor(author: string | null | undefined): boolean {
  if (!author?.trim()) return false;
  return /^N\.\s/i.test(author.trim());
}

/** Most recent nurse handover note (for pinned card at shift change). */
export function getLatestNurseHandoverEntry(
  notes: string | null | undefined,
): HandoverNoteEntry | null {
  return getNurseHandoverEntries(notes)[0] ?? null;
}
