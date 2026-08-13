'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronRight } from 'lucide-react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { VitalsDetailModal } from '@/components/shared/VitalsDetailModal';
import { ConsultationReportModal } from '@/components/consultation/ConsultationReportModal';
import { EyeSessionReportDialog } from '@/components/eyecare/EyeSessionReportDialog';
import { PhysioSessionReportDialog } from '@/components/physiotherapy/PhysioSessionReportDialog';
import { loadConsultationReportSession, type ConsultationReportSession } from '@/lib/consultation-report';
import { physioService, type PhysioSession } from '@/lib/services/physio-service';
import type { VisitClinicalSummary } from '@/lib/services/visit-service';

const SUMMARY_PAGE_SIZES = [5, 10, 25];
const DEFAULT_PAGE_SIZE = 5;

interface SectionPagerState {
  page: number;
  perPage: number;
}

interface VisitSummaryModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  summary: VisitClinicalSummary | null;
  loading?: boolean;
}

interface SectionRecord {
  results: Array<Record<string, unknown>>;
  count: number;
}

const sections: Array<[keyof VisitClinicalSummary, string]> = [
  ['consultations', 'Consultation'],
  ['physio_orders', 'Physiotherapy'],
  ['eye_orders', 'Eye Clinic'],
  ['lab_results', 'Laboratory Results'],
  ['radiology_orders', 'Radiology Orders'],
  ['radiology_reports', 'Radiology Reports'],
  ['prescriptions', 'Prescriptions'],
  ['vitals', 'Vitals'],
  ['referrals', 'Referrals'],
  ['ward_admissions', 'Ward Admissions'],
];

function recordLabel(record: Record<string, unknown>): string {
  return String(
    record.diagnosis || record.procedure || record.test_name || record.order_number ||
      record.prescription_id || record.session_id || record.status || 'Clinical record',
  );
}

function humanizeField(key: string): string {
  return (key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()));
}

function fieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

function RecordDetailDialog({
  open,
  onClose,
  label,
  record,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  record: Record<string, unknown>;
}) {
  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>{recordLabel(record)}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {Object.entries(record).map(([key, value]) => {
            const display = fieldValue(value);
            if (!display) return null;
            return (
              <div key={key} className="border-b pb-2">
                <p className="text-xs text-muted-foreground">{humanizeField(key)}</p>
                <p className="text-sm break-words">{display}</p>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function VisitSummaryModal({ open, onOpenChange, summary, loading }: VisitSummaryModalProps) {
  const [pagers, setPagers] = useState<Record<string, SectionPagerState>>({});
  const [activeRecord, setActiveRecord] = useState<{ label: string; record: Record<string, unknown> } | null>(null);
  const [activeVital, setActiveVital] = useState<Record<string, unknown> | null>(null);
  const [activeEyeOrderId, setActiveEyeOrderId] = useState<number | null>(null);
  const [activePhysioSession, setActivePhysioSession] = useState<PhysioSession | null>(null);
  const [consultationSession, setConsultationSession] = useState<ConsultationReportSession | null>(null);
  const [consultationLoading, setConsultationLoading] = useState(false);

  const setSectionPage = (key: string, page: number) => {
    setPagers((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { page: 1, perPage: DEFAULT_PAGE_SIZE }), page } }));
  };

  const setSectionPerPage = (key: string, perPage: number) => {
    setPagers((prev) => ({ ...prev, [key]: { ...(prev[key] ?? { page: 1, perPage: DEFAULT_PAGE_SIZE }), perPage, page: 1 } }));
  };

  const pagerFor = (key: string): SectionPagerState => pagers[key] ?? { page: 1, perPage: DEFAULT_PAGE_SIZE };

  const openRecord = async (key: string, label: string, record: Record<string, unknown>) => {
    if (key === 'consultations') {
      const sessionId = Number(record.id);
      if (!Number.isFinite(sessionId)) return;
      setConsultationLoading(true);
      setConsultationSession(null);
      try {
        setConsultationSession(await loadConsultationReportSession(sessionId));
      } catch {
        setConsultationSession(null);
      } finally {
        setConsultationLoading(false);
      }
      return;
    }
    if (key === 'eye_orders') {
      const orderId = Number(record.id);
      if (!Number.isFinite(orderId)) return;
      setActiveEyeOrderId(orderId);
      return;
    }
    if (key === 'physio_orders') {
      const orderId = Number(record.id);
      if (!Number.isFinite(orderId)) return;
      try {
        const res = await physioService.getSessions({ order: orderId, page_size: 50 });
        const sessions = res?.results ?? [];
        const preferred =
          sessions.find((s) => s.status === 'completed') ?? sessions[0];
        if (preferred) {
          setActivePhysioSession(preferred);
          return;
        }
      } catch {
        // fall through to generic detail below
      }
    }
    if (key === 'vitals') {
      setActiveVital(record);
      return;
    }
    setActiveRecord({ label, record });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Visit Clinical Summary</DialogTitle>
          <DialogDescription>
            All clinical records linked to this visit across its selected clinic legs.
          </DialogDescription>
        </DialogHeader>

        {loading && <p className="py-8 text-center text-sm text-muted-foreground">Loading visit summary...</p>}
        {!loading && summary && (
          <div className="space-y-5">
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{summary.visit.patient_name}</span>
                <Badge variant="outline">{summary.visit.visit_type}</Badge>
                <Badge variant="outline">{summary.visit.status}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-2">
                {(summary.visit.clinics || []).map((clinic) => (
                  <Badge key={clinic} variant="secondary">
                    {clinic}{summary.visit.completed_clinics?.includes(clinic) ? ' ✓' : ' pending'}
                  </Badge>
                ))}
              </div>
            </div>

            {summary.clinical_notes && (
              <div className="rounded-lg border p-4">
                <h3 className="mb-2 text-sm font-semibold">Clinical Notes</h3>
                <p className="whitespace-pre-wrap text-sm text-muted-foreground">{summary.clinical_notes}</p>
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              {sections.map(([key, label]) => {
                const section = summary[key] as SectionRecord;
                if (!section || section.results.length === 0) return null;
                const pager = pagerFor(key);
                const results = section.results;
                const needsPagination = results.length > DEFAULT_PAGE_SIZE;
                const start = needsPagination ? (pager.page - 1) * pager.perPage : 0;
                const pageItems = needsPagination
                  ? results.slice(start, start + pager.perPage)
                  : results;
                return (
                  <div key={key} className="rounded-lg border p-4">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <h3 className="text-sm font-semibold">{label}</h3>
                      <Badge variant="outline">{section.count}</Badge>
                    </div>
                    <ul className="space-y-1 text-sm text-muted-foreground">
                      {pageItems.map((record, index) => (
                        <li key={`${key}-${start + index}`}>
                          <Button
                            variant="ghost"
                            className="w-full justify-start gap-1 px-2 py-1 h-auto text-left font-normal"
                            title="View record"
                            onClick={() => void openRecord(key, label, record)}
                          >
                            <span className="truncate flex-1">{recordLabel(record)}</span>
                            <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                    {needsPagination && (
                      <StandardPagination
                        currentPage={pager.page}
                        totalItems={results.length}
                        itemsPerPage={pager.perPage}
                        onPageChange={(page) => setSectionPage(key, page)}
                        onItemsPerPageChange={(perPage) => setSectionPerPage(key, perPage)}
                        itemName="records"
                        pageSizeOptions={SUMMARY_PAGE_SIZES}
                      />
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </DialogContent>

      <RecordDetailDialog
        open={activeRecord !== null}
        onClose={() => setActiveRecord(null)}
        label={activeRecord?.label ?? ''}
        record={activeRecord?.record ?? {}}
      />

      <VitalsDetailModal
        isOpen={activeVital !== null}
        onClose={() => setActiveVital(null)}
        vitals={
          activeVital
            ? {
                id: String(activeVital.id ?? ''),
                recordedAt: activeVital.recorded_at as string,
                recordedBy: activeVital.recorded_by_name as string,
                temperature: activeVital.temperature as string,
                heartRate: activeVital.heart_rate as string | number,
                bloodPressureSystolic: activeVital.blood_pressure_systolic as string,
                bloodPressureDiastolic: activeVital.blood_pressure_diastolic as string,
                respiratoryRate: activeVital.respiratory_rate as string,
                oxygenSaturation: activeVital.oxygen_saturation as string,
                weight: activeVital.weight as string,
                height: activeVital.height as string,
                bmi: activeVital.bmi as string,
                painScale: activeVital.pain_scale as string,
                bloodSugar: activeVital.blood_sugar as string,
                randomBloodSugar: activeVital.random_blood_sugar as string,
                notes: activeVital.notes as string,
              }
            : null
        }
        patientName={summary?.visit.patient_name}
        patientId={summary?.visit.patient_id}
        readonly
      />

      <EyeSessionReportDialog
        open={activeEyeOrderId !== null}
        onOpenChange={(openNow) => {
          if (!openNow) setActiveEyeOrderId(null);
        }}
        orderId={activeEyeOrderId ?? undefined}
      />

      <PhysioSessionReportDialog
        open={activePhysioSession !== null}
        onOpenChange={(openNow) => {
          if (!openNow) setActivePhysioSession(null);
        }}
        session={activePhysioSession}
      />

      <ConsultationReportModal
        open={consultationSession !== null || consultationLoading}
        onOpenChange={(openNow) => {
          if (!openNow) setConsultationSession(null);
        }}
        session={consultationSession}
        loading={consultationLoading}
      />
    </Dialog>
  );
}
