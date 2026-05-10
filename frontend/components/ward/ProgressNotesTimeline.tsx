'use client';

/**
 * ProgressNotesTimeline
 * ---------------------
 * Renders a patient's admission progress notes as a clean, scannable
 * timeline instead of a single ``whitespace-pre-wrap`` text dump.
 *
 * Notes are persisted on ``PatientAdmission.admission_notes`` as a single
 * string where new notes are *prepended* using this pattern (see
 * ``handleSaveProgressNote`` in ``app/consultation/wards/page.tsx``)::
 *
 *     [10 May 2026, 06:38 — Dr. admin]
 *     <body...>
 *
 *     ---
 *
 *     [9 May 2026, 18:02 — N. Suleiman]
 *     <body...>
 *
 *     ---
 *
 *     Admitted to MALE-MED. Vitals — BP: ...
 *
 * The very last entry can also be a *system / on-admission* note that has
 * no ``[header]`` line. The parser handles both shapes.
 */
import { FileText, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export interface ProgressNoteEntry {
  /** Raw header inside the brackets ("10 May 2026, 06:38 — Dr. admin"). */
  header: string | null;
  timestamp: string | null;
  author: string | null;
  /** ``true`` if the entry has no [header] — i.e. system/auto note. */
  isSystem: boolean;
  body: string;
}

/**
 * Split the prepended ``admission_notes`` text into individual entries.
 *
 * Splitting rules:
 *   1. Entries are separated by a line containing only ``---`` surrounded
 *      by blank lines (``\n\n---\n\n``). We're permissive on whitespace
 *      so old notes saved with slightly different separators still parse.
 *   2. Each entry that starts with ``[…]`` has its header lifted out and
 *      split on the em-dash (or hyphen-dash fallback) into
 *      ``timestamp — author``.
 *   3. Untagged entries are surfaced as ``isSystem: true`` so the UI can
 *      label them (e.g. the auto-written "Admitted to …" line).
 */
export function parseAdmissionNotes(notes: string | null | undefined): ProgressNoteEntry[] {
  if (!notes || !notes.trim()) return [];

  const chunks = notes
    .split(/\n+\s*---\s*\n+/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  return chunks.map<ProgressNoteEntry>((chunk) => {
    const headerMatch = chunk.match(/^\[([^\]]+)\]\s*([\s\S]*)$/);
    if (!headerMatch) {
      return {
        header: null,
        timestamp: null,
        author: null,
        isSystem: true,
        body: chunk,
      };
    }

    const headerInner = headerMatch[1].trim();
    const body = headerMatch[2].trim();

    // The header is "<timestamp> — <author>". We split on em-dash first
    // (the Save-Note flow prepends this), then fall back to a regular
    // hyphen so older notes still parse.
    const split = headerInner.split(/\s+—\s+|\s+-\s+/);
    const timestamp = split[0]?.trim() || null;
    const author = split.slice(1).join(' — ').trim() || null;

    return {
      header: headerInner,
      timestamp,
      author,
      isSystem: false,
      body,
    };
  });
}

interface ProgressNotesTimelineProps {
  /** Raw ``admission_notes`` string from the API. */
  notes: string | null | undefined;
  /**
   * Optional empty state — used when the parent already conditionally
   * renders the timeline. Defaults to a small muted line.
   */
  emptyState?: React.ReactNode;
  /** Add the section heading "Previous notes" above the list. */
  showHeading?: boolean;
}

export function ProgressNotesTimeline({
  notes,
  emptyState,
  showHeading = false,
}: ProgressNotesTimelineProps) {
  const entries = parseAdmissionNotes(notes);

  if (entries.length === 0) {
    return (
      <>
        {emptyState ?? (
          <p className="text-sm text-muted-foreground italic">No progress notes recorded yet.</p>
        )}
      </>
    );
  }

  return (
    <div className="space-y-3">
      {showHeading && (
        <div className="flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Previous notes
          </h3>
          <span className="text-[11px] text-muted-foreground">
            {entries.length} entr{entries.length === 1 ? 'y' : 'ies'}
          </span>
        </div>
      )}

      <ol className="space-y-2.5">
        {entries.map((entry, idx) => (
          <li
            key={idx}
            className={`rounded-md border bg-card p-3 ${
              entry.isSystem ? 'border-dashed border-muted-foreground/30 bg-muted/40' : 'border-border'
            }`}
          >
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-1.5 text-xs min-w-0">
                {entry.isSystem
                  ? <FileText className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
                  : <User className="h-3.5 w-3.5 text-blue-500 flex-shrink-0" />
                }
                <span className="font-medium text-foreground truncate">
                  {entry.author ?? 'System'}
                </span>
                {entry.timestamp && (
                  <>
                    <span className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground truncate">{entry.timestamp}</span>
                  </>
                )}
              </div>
              {entry.isSystem && (
                <Badge
                  variant="outline"
                  className="text-[10px] h-5 px-1.5 border-muted-foreground/40 text-muted-foreground bg-transparent flex-shrink-0"
                >
                  System
                </Badge>
              )}
            </div>
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
              {entry.body}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}
