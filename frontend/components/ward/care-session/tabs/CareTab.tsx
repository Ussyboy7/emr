"use client";

import { AlertTriangle, ClipboardList, Thermometer } from 'lucide-react';
import { WardLatestHandoverCard } from '@/components/ward/WardLatestHandoverCard';
import { WardVitalsHistory } from '@/components/ward/WardVitalsHistory';
import { WardQuickObservationForm, type WardObservationFormData } from '@/components/ward/WardQuickObservationForm';
import { isEscalatedCondition } from '@/lib/ward-admission-ui';
import type { PatientAdmission } from '@/lib/services/ward-service';

type Props = {
  admission: PatientAdmission;
  nursingMode?: boolean;
  observationData?: WardObservationFormData;
  onObservationChange?: (next: WardObservationFormData) => void;
  onSaveObservation?: () => void;
  isSavingObservation?: boolean;
  observationRefreshKey?: number;
};

export function CareTab({ admission, nursingMode = false, observationData, onObservationChange, onSaveObservation, isSavingObservation = false, observationRefreshKey = 0 }: Props) {
  return (
    <div className="space-y-4">
      {admission.current_condition && isEscalatedCondition(admission.current_condition) && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-300 bg-orange-50 px-3 py-2.5 text-sm text-orange-700 dark:border-orange-700 dark:bg-orange-950/30 dark:text-orange-300">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
          <div>
            <p className="text-xs font-semibold">Nurse escalation</p>
            <p>{admission.current_condition}</p>
          </div>
        </div>
      )}

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <Thermometer className="h-3.5 w-3.5" /> Observation chart
        </h2>
        <WardVitalsHistory admission={admission} refreshKey={observationRefreshKey} />
        {nursingMode && admission.status === 'admitted' && observationData && onObservationChange && onSaveObservation && (
          <WardQuickObservationForm admission={admission} value={observationData} onChange={onObservationChange} onSubmit={onSaveObservation} isSaving={isSavingObservation} />
        )}
      </section>

      <section className="space-y-3 rounded-lg border bg-card p-4">
        <h2 className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          <ClipboardList className="h-3.5 w-3.5" /> Handover
        </h2>
        <WardLatestHandoverCard admissionNotes={admission.admission_notes} />
      </section>
    </div>
  );
}
