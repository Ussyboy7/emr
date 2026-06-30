'use client';

import { useCallback, useEffect, useState } from 'react';
import { Eye, Heart, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { VitalsDetailModal } from '@/components/shared/VitalsDetailModal';
import {
  wardService,
  type AdmissionObservationVital,
  type PatientAdmission,
} from '@/lib/services/ward-service';
import { formatDisplayDateMedium, formatDisplayTime } from '@/lib/dates';
import { isObservationAdmission } from '@/lib/ward-admission-ui';
import {
  formatObservationBp,
  formatObservationCell,
  nurseNotesFromObservationVital,
  observationVitalToDetail,
  parseSpo2FromObservationNotes,
  truncateObservationNote,
} from '@/lib/observation-vitals-display';

type Props = {
  admission: PatientAdmission;
  refreshKey?: number;
};

export function WardVitalsHistory({ admission, refreshKey = 0 }: Props) {
  const [vitals, setVitals] = useState<AdmissionObservationVital[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedVital, setSelectedVital] = useState<AdmissionObservationVital | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await wardService.getObservationVitals({ admission: admission.id });
      const rows = (res.results || []).slice().sort(
        (a, b) => new Date(b.recorded_at).getTime() - new Date(a.recorded_at).getTime(),
      );
      setVitals(rows);
    } catch {
      setVitals([]);
    } finally {
      setLoading(false);
    }
  }, [admission.id]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const showGlucose = !isObservationAdmission(admission);
  const wardName = admission.ward_name;

  const openDetail = (v: AdmissionObservationVital) => {
    setSelectedVital(v);
    setDetailOpen(true);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading vitals…
      </div>
    );
  }

  if (vitals.length === 0) {
    return null;
  }

  return (
    <section className="space-y-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
        <Heart className="h-3.5 w-3.5 text-rose-500" />
        Vitals history
        <span className="font-normal normal-case">
          ({vitals.length} reading{vitals.length === 1 ? '' : 's'})
        </span>
      </h3>

      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Time</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Temp</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">Pulse</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">RR</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">BP</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">SpO2</th>
              {showGlucose && (
                <>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">FBS</th>
                  <th className="px-3 py-2 text-left font-medium whitespace-nowrap">RBS</th>
                </>
              )}
              <th className="px-3 py-2 text-left font-medium min-w-[120px]">Notes</th>
              <th className="px-3 py-2 text-left font-medium whitespace-nowrap">By</th>
              <th className="px-3 py-2 text-center font-medium whitespace-nowrap">View</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {vitals.map((v) => {
              const spo2 = parseSpo2FromObservationNotes(v.notes);
              const notePreview = nurseNotesFromObservationVital(v.notes);
              const recorded = new Date(v.recorded_at);

              return (
                <tr key={v.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted-foreground">
                    <span className="block font-medium text-foreground">{formatDisplayTime(recorded)}</span>
                    <span className="text-[10px]">{formatDisplayDateMedium(v.recorded_at)}</span>
                  </td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                    {formatObservationCell(v.temperature_c, '°C')}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                    {formatObservationCell(v.pulse)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                    {formatObservationCell(v.respiratory_rate)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                    {formatObservationBp(v.bp_systolic, v.bp_diastolic)}
                  </td>
                  <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                    {spo2 ? `${spo2}%` : '—'}
                  </td>
                  {showGlucose && (
                    <>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                        {formatObservationCell(v.fbs_mmol)}
                      </td>
                      <td className="px-3 py-2.5 tabular-nums whitespace-nowrap">
                        {formatObservationCell(v.rbs_mmol)}
                      </td>
                    </>
                  )}
                  <td className="px-3 py-2.5 text-xs text-muted-foreground max-w-[200px]">
                    <span className="line-clamp-2" title={notePreview || undefined}>
                      {truncateObservationNote(notePreview)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-xs whitespace-nowrap">
                    {v.recorded_by_name || '—'}
                  </td>
                  <td className="px-3 py-2.5 text-center">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => openDetail(v)}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <VitalsDetailModal
        vitals={selectedVital ? observationVitalToDetail(selectedVital, wardName) : null}
        patientName={admission.patient_name}
        patientId={admission.admission_id}
        isOpen={detailOpen}
        onClose={() => {
          setDetailOpen(false);
          setSelectedVital(null);
        }}
        readonly
      />
    </section>
  );
}
