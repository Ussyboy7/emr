"use client";

import { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BadgeCheck,
  ClipboardList,
  FileText,
  History,
  Loader2,
  Pill,
  ScanLine,
  Stethoscope,
  TestTube,
  Thermometer,
} from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { parseAdmissionNotes } from '@/components/ward/ProgressNotesTimeline';
import { isHandoffNoteBody } from '@/lib/ward-admission-ui';
import { formatDisplayDateTime } from '@/lib/dates';
import type { PatientAdmission } from '@/lib/services/ward-service';

type Entry = {
  at: string;
  group: string;
  icon: 'admission' | 'note' | 'handover' | 'order' | 'lab' | 'imaging' | 'physio' | 'vitals' | 'discharge';
  title: string;
  author?: string;
  body?: string;
};

type Props = {
  admission: PatientAdmission;
};

function iconFor(kind: Entry['icon']) {
  switch (kind) {
    case 'admission': return BadgeCheck;
    case 'discharge': return History;
    case 'note': return Stethoscope;
    case 'handover': return ClipboardList;
    case 'order': return Pill;
    case 'lab': return TestTube;
    case 'imaging': return ScanLine;
    case 'physio': return Activity;
    case 'vitals': return Thermometer;
    default: return FileText;
  }
}

export function TimelineTab({ admission }: Props) {
  const [loading, setLoading] = useState(true);

  const entries = useMemo<Entry[]>(() => {
    const list: Entry[] = [];

    // Admission event
    if (admission.admission_date) {
      list.push({
        at: admission.admission_date,
        group: formatDay(admission.admission_date),
        icon: 'admission',
        title: 'Admitted to ward',
        body: [admission.presenting_complaint, admission.admission_diagnosis].filter(Boolean).join(' — '),
      });
    }

    // Progress + handover notes (parsed from admission_notes)
    for (const note of parseAdmissionNotes(admission.admission_notes) || []) {
      const isHandover = note.isSystem && isHandoffNoteBody(note.body);
      const at = note.timestamp || '';
      list.push({
        at,
        group: formatDay(at),
        icon: isHandover ? 'handover' : 'note',
        title: isHandover ? 'Nurse handover' : 'Progress note',
        author: note.author ?? undefined,
        body: note.body,
      });
    }

    // Discharge event
    if (admission.discharge_date && admission.status === 'discharged') {
      list.push({
        at: admission.discharge_date,
        group: formatDay(admission.discharge_date),
        icon: 'discharge',
        title: 'Discharged',
        body: admission.discharge_diagnosis || undefined,
      });
    }

    return list.sort((a, b) => b.at.localeCompare(a.at) || (a.title.length - b.title.length));
  }, [admission]);

  useEffect(() => {
    (async () => {
      try {
        const res = await apiFetch<{ results: any[] }>(
          `/nursing/orders/?for_admission=${admission.id}&ordering=-ordered_at&page_size=${MAX_LIST_PAGE_SIZE}`,
        );
        // fetchObservationVitals is called by WardVitalsHistory; orders are
        // the only extra feed needed here beyond admission data.
        void res;
      } finally {
        setLoading(false);
      }
    })();
  }, [admission.id]);

  const grouped = useMemo(() => {
    const map = new Map<string, Entry[]>();
    for (const e of entries) {
      const key = e.group;
      map.set(key, [...(map.get(key) || []), e]);
    }
    return Array.from(map.entries());
  }, [entries]);

  return (
    <div className="space-y-6">
      {loading && entries.length === 0 ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <p className="ml-3 text-sm text-muted-foreground">Loading timeline...</p>
        </div>
      ) : grouped.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center">
          <History className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">No timeline events yet.</p>
        </div>
      ) : (
        grouped.map(([day, dayEntries]) => (
          <section key={day}>
            <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {day}
            </h3>
            <div className="relative border-l-2 border-muted pl-4 space-y-4">
              {dayEntries.map((e, i) => {
                const Icon = iconFor(e.icon);
                return (
                  <div key={`${e.at}-${i}`} className="relative">
                    <span className="absolute -left-[23px] top-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-muted bg-background">
                      <Icon className="h-2.5 w-2.5 text-foreground/70" />
                    </span>
                    <div className="rounded-lg border bg-card p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-sm font-medium">{e.title}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {formatDisplayDateTime(e.at)}
                          {e.author ? ` · ${e.author}` : ''}
                        </p>
                      </div>
                      {e.body && (
                        <p className="text-sm text-foreground/80 mt-1 whitespace-pre-wrap">{e.body}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

function formatDay(iso: string): string {
  if (!iso) return 'Unknown day';
  return new Date(iso).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
}