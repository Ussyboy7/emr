'use client';

import { useEffect, useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { AlertTriangle, ChevronDown, Eye, History, Loader2 } from 'lucide-react';
import { formatDisplayDate } from '@/lib/dates';
import { pharmacyService, type Prescription as ApiPrescription } from '@/lib/services';
import {
  PrescriptionReportDialog,
  type PrescriptionReportDiagnosisRow,
  type PrescriptionReportPatient,
} from '@/components/pharmacy/PrescriptionReportDialog';
import { cn } from '@/lib/utils';

const RECENT_DAYS = 7;

function humanizeStatus(status: string | undefined): string {
  const s = String(status ?? '').trim();
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusBadgeClass(status: string | undefined): string {
  const s = String(status ?? '').toLowerCase();
  if (s === 'dispensed') {
    return 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/40';
  }
  if (s === 'partially_dispensed') {
    return 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/40';
  }
  if (s === 'dispensing') {
    return 'bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/40';
  }
  if (s === 'cancelled') {
    return 'bg-rose-500/10 text-rose-700 dark:text-rose-400 border-rose-500/40';
  }
  return 'bg-muted text-muted-foreground border-border';
}

function daysAgo(iso: string | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (Date.now() - t) / (1000 * 60 * 60 * 24);
}

function isDispensedLike(status: string | undefined): boolean {
  const s = String(status ?? '').toLowerCase();
  return s === 'dispensed' || s === 'partially_dispensed';
}

export interface PharmacyPatientPrescriptionHistoryProps {
  patientDbId: number | string | null | undefined;
  currentPrescriptionId?: string | number | null;
  patient: PrescriptionReportPatient | null;
  /** Max rows to fetch (API page size). */
  pageSize?: number;
}

/**
 * Secondary patient prescription history for pharmacy dispense/view.
 * Collapsed by default so the current RX stays primary; View opens PrescriptionReportDialog.
 */
export function PharmacyPatientPrescriptionHistory({
  patientDbId,
  currentPrescriptionId,
  patient,
  pageSize = 20,
}: PharmacyPatientPrescriptionHistoryProps) {
  const [rows, setRows] = useState<ApiPrescription[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);
  const [viewRx, setViewRx] = useState<ApiPrescription | null>(null);

  const currentIdStr =
    currentPrescriptionId != null && currentPrescriptionId !== ''
      ? String(currentPrescriptionId)
      : null;

  useEffect(() => {
    if (patientDbId == null || patientDbId === '') {
      setRows([]);
      setError(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);
    setOpen(false);

    void (async () => {
      try {
        const res = await pharmacyService.getPrescriptions({
          patient: String(patientDbId),
          page: 1,
          page_size: pageSize,
          date_preset: 'all',
        });
        if (cancelled) return;
        setRows(Array.isArray(res.results) ? res.results : []);
      } catch (e: unknown) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : 'Failed to load prescription history';
        setError(msg);
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [patientDbId, pageSize]);

  const priorRows = useMemo(
    () => rows.filter((rx) => !(currentIdStr && String(rx.id) === currentIdStr)),
    [rows, currentIdStr],
  );

  const recentOtherDispenses = useMemo(
    () =>
      priorRows.filter((rx) => {
        if (!isDispensedLike(rx.status)) return false;
        const age = daysAgo(rx.dispensed_at || rx.prescribed_at);
        return age != null && age <= RECENT_DAYS;
      }),
    [priorRows],
  );

  const openReport = (rx: ApiPrescription) => {
    setViewRx(rx);
    setViewOpen(true);
  };

  if (patientDbId == null || patientDbId === '') {
    return null;
  }

  const hasAlert = recentOtherDispenses.length > 0;
  const summaryCount = loading ? null : priorRows.length;

  return (
    <>
      <Collapsible open={open} onOpenChange={setOpen} className="rounded-lg border bg-muted/20">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors',
              'hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              hasAlert && !open && 'bg-amber-50/80 dark:bg-amber-950/25',
            )}
          >
            <History
              className={cn(
                'h-4 w-4 shrink-0',
                hasAlert ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground',
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="text-sm font-medium">Prior prescriptions</span>
                {loading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
                ) : summaryCount != null ? (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-normal">
                    {summaryCount}
                  </Badge>
                ) : null}
                {hasAlert ? (
                  <Badge
                    variant="outline"
                    className="text-[10px] px-1.5 py-0 gap-1 border-amber-400/60 text-amber-800 dark:text-amber-300 bg-amber-100/50 dark:bg-amber-900/30"
                  >
                    <AlertTriangle className="h-3 w-3" />
                    {recentOtherDispenses.length} in last {RECENT_DAYS}d
                  </Badge>
                ) : null}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {hasAlert
                  ? 'Check recent dispenses before releasing medicines'
                  : 'Optional — expand to review this patient’s other RXs'}
              </p>
            </div>
            <ChevronDown
              className={cn(
                'h-4 w-4 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-180',
              )}
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t px-3 py-2.5 space-y-2">
            {hasAlert ? (
              <p className="text-xs text-amber-900 dark:text-amber-200 flex gap-1.5">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                {recentOtherDispenses.length} other prescription
                {recentOtherDispenses.length === 1 ? '' : 's'} dispensed or partially dispensed in
                the last {RECENT_DAYS} days.
              </p>
            ) : null}

            {error ? (
              <p className="text-sm text-destructive py-1">{error}</p>
            ) : priorRows.length === 0 && !loading ? (
              <p className="text-sm text-muted-foreground py-2 text-center">
                No prior prescriptions for this patient
              </p>
            ) : (
              <ul className="max-h-48 overflow-y-auto divide-y rounded-md border bg-background">
                {priorRows.map((rx) => {
                  const age = daysAgo(rx.dispensed_at || rx.prescribed_at);
                  const recentDispense =
                    isDispensedLike(rx.status) && age != null && age <= RECENT_DAYS;
                  const dateLabel = formatDisplayDate(rx.prescribed_at || rx.created_at || '');
                  return (
                    <li
                      key={rx.id}
                      className={cn(
                        'flex items-center gap-2 px-2.5 py-2',
                        recentDispense && 'bg-amber-50/60 dark:bg-amber-950/20',
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-sm font-medium truncate">
                            {rx.prescription_id || `RX-${rx.id}`}
                          </span>
                          <Badge
                            variant="outline"
                            className={cn('text-[10px] px-1.5 py-0', statusBadgeClass(rx.status))}
                          >
                            {humanizeStatus(rx.status)}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {dateLabel === '—' ? '—' : dateLabel}
                          {rx.doctor_name ? ` · ${rx.doctor_name}` : ''}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="shrink-0 h-8"
                        onClick={() => openReport(rx)}
                      >
                        <Eye className="h-4 w-4 mr-1" />
                        View
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </CollapsibleContent>
      </Collapsible>

      <PrescriptionReportDialog
        open={viewOpen}
        onOpenChange={(o) => {
          setViewOpen(o);
          if (!o) setViewRx(null);
        }}
        prescription={
          viewRx
            ? {
                id: String(viewRx.id),
                date: viewRx.prescribed_at,
                doctor: viewRx.doctor_name || '',
                status: viewRx.status,
                medications: (viewRx.medications || []).map((m) => ({
                  medication_name: m.medication_name,
                  name: m.medication_name,
                  dosage: m.dosage || m.dose,
                  dose: m.dose || m.dosage,
                  frequency: m.frequency,
                  duration: m.duration,
                  quantity: m.quantity,
                  instructions: m.instructions,
                  is_dispensed: m.is_dispensed,
                  unit: m.unit,
                })),
                clinic:
                  viewRx.clinic ||
                  (viewRx as { visit_details?: { clinic?: string } }).visit_details?.clinic ||
                  '',
                doctor_name: viewRx.doctor_name || '',
                prescription_id: viewRx.prescription_id || String(viewRx.id),
                prescribed_at: viewRx.prescribed_at,
                dispensed_at: viewRx.dispensed_at,
                dispensed_by_name: viewRx.dispensed_by_name || '',
                diagnoses: (viewRx as { icd10_diagnoses?: PrescriptionReportDiagnosisRow[] })
                  .icd10_diagnoses,
                notes: viewRx.notes,
                diagnosis: viewRx.diagnosis,
                location_clinic_name: (viewRx as { location_clinic_name?: string })
                  .location_clinic_name,
              }
            : null
        }
        prescriptionDbId={viewRx?.id ?? null}
        patient={
          viewRx && patient
            ? {
                name:
                  patient.name ||
                  viewRx.patient_name ||
                  (viewRx.patient_details as { name?: string } | undefined)?.name ||
                  '',
                patientId:
                  patient.patientId ||
                  (viewRx.patient_details as { patient_id?: string } | undefined)?.patient_id ||
                  '',
                age:
                  patient.age ??
                  (viewRx.patient_details as { age?: number } | undefined)?.age ??
                  null,
                gender:
                  patient.gender ||
                  (viewRx.patient_details as { gender?: string } | undefined)?.gender ||
                  '',
              }
            : patient
        }
      />
    </>
  );
}
