"use client";

import { AlertTriangle, ClipboardList, Thermometer } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { WardLatestHandoverCard } from '@/components/ward/WardLatestHandoverCard';
import { WardVitalsHistory } from '@/components/ward/WardVitalsHistory';
import { isEscalatedCondition } from '@/lib/ward-admission-ui';
import type { PatientAdmission } from '@/lib/services/ward-service';

type Props = {
  admission: PatientAdmission;
};

export function ActivitiesTab({ admission }: Props) {
  return (
    <div className="space-y-4">
      {admission.current_condition && isEscalatedCondition(admission.current_condition) && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-orange-600" />
          <div>
            <p className="font-semibold text-xs">Nurse escalation</p>
            <p>{admission.current_condition}</p>
          </div>
        </div>
      )}

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
            <Thermometer className="h-3.5 w-3.5" /> Observation chart
          </h3>
          {admission.current_condition && (
            <Badge variant="outline" className={conditionBadgeClass(admission.current_condition)}>
              {admission.current_condition}
            </Badge>
          )}
        </div>
        <WardVitalsHistory admission={admission} />
      </section>

      <section className="rounded-lg border bg-card p-4 space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground inline-flex items-center gap-1.5">
          <ClipboardList className="h-3.5 w-3.5" /> Handover
        </h3>
        <WardLatestHandoverCard admissionNotes={admission.admission_notes} />
      </section>
    </div>
  );
}

function conditionBadgeClass(condition: string) {
  if (/needs doctor review/i.test(condition))
    return 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10';
  const lc = condition.toLowerCase();
  if (lc.includes('stable') || lc.includes('good') || lc.includes('improving'))
    return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
  if (lc.includes('critical') || lc.includes('serious'))
    return 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10';
  return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
}