'use client';

import { ClipboardList } from 'lucide-react';
import { getLatestNurseHandoverEntry } from '@/lib/ward-handover-notes';

type Props = {
  admissionNotes: string | null | undefined;
};

export function WardLatestHandoverCard({ admissionNotes }: Props) {
  const latest = getLatestNurseHandoverEntry(admissionNotes);

  if (!latest) return null;

  return (
    <section className="rounded-lg border border-blue-200/80 dark:border-blue-900/50 bg-blue-50/60 dark:bg-blue-950/20 p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-blue-900 dark:text-blue-100">
        <ClipboardList className="h-3.5 w-3.5 shrink-0" />
        Latest handover
        {latest.timestamp && (
          <span className="font-normal text-blue-800/80 dark:text-blue-200/80 truncate">
            · {latest.timestamp}
            {latest.author ? ` — ${latest.author}` : ''}
          </span>
        )}
      </div>
      <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed line-clamp-4">
        {latest.body}
      </p>
      <p className="text-[10px] text-muted-foreground">
        Full history in the handover log below.
      </p>
    </section>
  );
}
