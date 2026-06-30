'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Activity, Plus, ChevronDown } from 'lucide-react';
import {
  wardService,
  type PatientAdmission,
  type AdmissionObservationVital,
  type AdmissionTreatmentRow,
} from '@/lib/services/ward-service';
import { useCurrentUser } from '@/hooks/use-current-user';
import { formatDisplayDateMedium, formatDisplayTime } from '@/lib/dates';

// Strips honorifics (Dr, Prof, Mr/Mrs/Ms/Miss) then takes the first letter of
// each remaining word. Caps at 4 characters so a name like "Mary Jane Smith"
// gives "MJS" without runaway initials. Returns '' for missing names.
const getInitials = (fullName?: string | null, max = 4): string => {
  if (!fullName) return '';
  const parts = fullName
    .replace(/\b(?:dr|prof|mr|mrs|ms|miss)\.?\b/gi, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return parts.slice(0, max).map((p) => p[0]?.toUpperCase() || '').join('');
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: PatientAdmission | null;
  /** When true, renders chart body only (for embedding in admission details tabs). */
  embedded?: boolean;
  /** Hide inpatient treatment sheet (e.g. observation / day care). */
  hideTreatmentSheet?: boolean;
  /** Embedded in nursing tab: history table only, hide empty state & entry form. */
  historyOnly?: boolean;
};

// Reference ranges for adult ward patients. Cells colour-code when a recorded
// value falls outside these. Kept loose intentionally (we're flagging, not
// diagnosing) — closer-to-normal ranges would generate too much noise.
const NORMAL_TEMP_LOW = 36;
const NORMAL_TEMP_HIGH = 37.5;
const NORMAL_PULSE_LOW = 60;
const NORMAL_PULSE_HIGH = 100;
const NORMAL_BP_SYS_LOW = 90;
const NORMAL_BP_SYS_HIGH = 140;
const NORMAL_BP_DIA_LOW = 60;
const NORMAL_BP_DIA_HIGH = 90;

const numWarnClass = (value: number | null | undefined, low: number, high: number) => {
  if (value == null || !Number.isFinite(value)) return '';
  if (value < low) return 'text-blue-600 dark:text-blue-400 font-medium';
  if (value > high) return 'text-orange-600 dark:text-orange-400 font-medium';
  return '';
};

const isSameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

const dayLabel = (d: Date) => {
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (isSameDay(d, today)) return 'Today';
  if (isSameDay(d, yesterday)) return 'Yesterday';
  return formatDisplayDateMedium(d);
};

const timeLabel = (d: Date) => formatDisplayTime(d);

export function ObservationChartDialog({
  open,
  onOpenChange,
  admission,
  embedded = false,
  hideTreatmentSheet = false,
  historyOnly = false,
}: Props) {
  const { currentUser } = useCurrentUser();
  const [vitals, setVitals] = useState<AdmissionObservationVital[]>([]);
  const [treatments, setTreatments] = useState<AdmissionTreatmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingVital, setSavingVital] = useState(false);
  const [savingTreat, setSavingTreat] = useState(false);
  const [showVitalForm, setShowVitalForm] = useState(false);
  const [showTreatForm, setShowTreatForm] = useState(false);
  const [vitalForm, setVitalForm] = useState({
    temp: '',
    pulse: '',
    rr: '',
    bps: '',
    bpd: '',
    fbs: '',
    rbs: '',
    notes: '',
  });
  const [treatForm, setTreatForm] = useState({
    drug_name: '',
    dosage: '',
    route: '',
    time_adm: '',
    time_done: '',
    reaction: '',
    ni: '',
    di: '',
  });

  // Group vitals into day buckets so a sticky day header separates spammy
  // sequential entries (e.g. eight readings within five minutes during testing).
  const vitalsByDay = useMemo(() => {
    const groups: Array<{ key: string; label: string; rows: AdmissionObservationVital[] }> = [];
    for (const v of vitals) {
      const d = new Date(v.recorded_at);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) {
        last.rows.push(v);
      } else {
        groups.push({ key, label: dayLabel(d), rows: [v] });
      }
    }
    return groups;
  }, [vitals]);

  const load = useCallback(async () => {
    if (!admission?.id) return;
    setLoading(true);
    try {
      const [vRes, tRes] = await Promise.all([
        wardService.getObservationVitals({ admission: admission.id }),
        wardService.getTreatmentSheetRows({ admission: admission.id }),
      ]);
      setVitals(vRes.results ?? []);
      setTreatments(tRes.results ?? []);
    } catch (e: any) {
      toast.error(e?.message || 'Failed to load observation chart');
      setVitals([]);
      setTreatments([]);
    } finally {
      setLoading(false);
    }
  }, [admission?.id]);

  useEffect(() => {
    if (open && admission?.id) void load();
  }, [open, admission?.id, load]);

  // Pre-fill nurse / doctor initials from the logged-in user and the
  // admitting doctor on file. Nurses can still edit if a colleague is
  // recording on their behalf, but the common case (you are the nurse
  // administering the drug) is now zero-typing.
  const nurseInitials = useMemo(() => getInitials(currentUser?.name), [currentUser?.name]);
  const doctorInitials = useMemo(
    () => getInitials(admission?.admitting_doctor_name),
    [admission?.admitting_doctor_name],
  );

  useEffect(() => {
    if (!open) return;
    setTreatForm((prev) => ({
      ...prev,
      ni: prev.ni || nurseInitials,
      di: prev.di || doctorInitials,
    }));
  }, [open, nurseInitials, doctorInitials]);

  const handleAddVital = async () => {
    if (!admission?.id) return;
    setSavingVital(true);
    try {
      await wardService.createObservationVital({
        admission: admission.id,
        temperature_c: vitalForm.temp || undefined,
        pulse: vitalForm.pulse ? parseInt(vitalForm.pulse, 10) : undefined,
        respiratory_rate: vitalForm.rr ? parseInt(vitalForm.rr, 10) : undefined,
        bp_systolic: vitalForm.bps ? parseInt(vitalForm.bps, 10) : undefined,
        bp_diastolic: vitalForm.bpd ? parseInt(vitalForm.bpd, 10) : undefined,
        fbs_mmol: vitalForm.fbs || undefined,
        rbs_mmol: vitalForm.rbs || undefined,
        notes: vitalForm.notes || undefined,
      });
      toast.success('Vitals row saved');
      setVitalForm({ temp: '', pulse: '', rr: '', bps: '', bpd: '', fbs: '', rbs: '', notes: '' });
      setShowVitalForm(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save vitals');
    } finally {
      setSavingVital(false);
    }
  };

  const handleAddTreatment = async () => {
    if (!admission?.id) return;
    if (!treatForm.drug_name.trim()) {
      toast.error('Drug name is required');
      return;
    }
    setSavingTreat(true);
    try {
      await wardService.createTreatmentSheetRow({
        admission: admission.id,
        drug_name: treatForm.drug_name.trim(),
        dosage: treatForm.dosage,
        route: treatForm.route,
        time_administered: treatForm.time_adm || undefined,
        time_completed: treatForm.time_done || undefined,
        drug_reaction: treatForm.reaction,
        nurse_initials: treatForm.ni.trim(),
        doctor_initials: treatForm.di.trim(),
      });
      toast.success('Treatment row saved');
      setTreatForm({
        drug_name: '',
        dosage: '',
        route: '',
        time_adm: '',
        time_done: '',
        reaction: '',
        ni: nurseInitials,
        di: doctorInitials,
      });
      setShowTreatForm(false);
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save treatment row');
    } finally {
      setSavingTreat(false);
    }
  };

  if (!admission) return null;

  const statusLabel =
    admission.status?.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) ?? '—';

  const chartBody = loading ? (
    <div className="flex flex-1 min-h-[200px] items-center justify-center text-muted-foreground">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  ) : (
    <div className={`flex-1 min-h-0 overflow-y-auto space-y-6 ${embedded ? 'px-1 py-2' : 'px-5 py-4'}`}>
      {!(historyOnly && vitals.length === 0) && (
            <section className={`${embedded && historyOnly ? 'border-0 bg-transparent p-0 space-y-2' : 'rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3'}`}>
              {!(historyOnly && vitals.length > 0) && (
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  {embedded ? 'Vitals history' : 'Continuous vitals'}
                </h3>
                {!historyOnly && (
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {vitals.length} {vitals.length === 1 ? 'entry' : 'entries'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={showVitalForm ? 'secondary' : 'default'}
                    onClick={() => setShowVitalForm((v) => !v)}
                    className="h-7"
                  >
                    {showVitalForm ? (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 mr-1 rotate-180 transition-transform" />
                        Close form
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        {embedded ? 'Glucose / extra' : 'New row'}
                      </>
                    )}
                  </Button>
                </div>
                )}
              </div>
              )}
              {historyOnly && vitals.length > 0 && (
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Vitals history
                </h3>
              )}
              <div className="overflow-x-auto border rounded-md bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Time</th>
                      <th className="text-right px-2 py-1.5 font-medium">T °C</th>
                      <th className="text-right px-2 py-1.5 font-medium">Pulse</th>
                      <th className="text-right px-2 py-1.5 font-medium">RR</th>
                      <th className="text-right px-2 py-1.5 font-medium">BP</th>
                      <th className="text-right px-2 py-1.5 font-medium" title="Fasting blood sugar (mmol/L)">FBS</th>
                      <th className="text-right px-2 py-1.5 font-medium" title="Random blood sugar (mmol/L)">RBS</th>
                      <th className="text-left px-2 py-1.5 font-medium">Notes</th>
                      <th className="text-left px-2 py-1.5 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vitalsByDay.length === 0 ? (
                      <tr>
                        <td colSpan={9} className="p-6 text-center text-muted-foreground">
                          No vitals recorded yet
                        </td>
                      </tr>
                    ) : (
                      vitalsByDay.map((group) => (
                        <Fragment key={group.key}>
                          <tr className="bg-muted/30">
                            <td colSpan={9} className="px-2 py-1 text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
                              {group.label}
                              <span className="ml-2 text-muted-foreground/70 normal-case font-normal">
                                · {group.rows.length} {group.rows.length === 1 ? 'reading' : 'readings'}
                              </span>
                            </td>
                          </tr>
                          {group.rows.map((v) => {
                            const recorded = new Date(v.recorded_at);
                            const tempNum = v.temperature_c != null ? parseFloat(v.temperature_c) : null;
                            const sysNum = v.bp_systolic ?? null;
                            const diaNum = v.bp_diastolic ?? null;
                            const bpClass = (sysNum != null && diaNum != null)
                              ? (sysNum < NORMAL_BP_SYS_LOW || diaNum < NORMAL_BP_DIA_LOW)
                                ? 'text-blue-600 dark:text-blue-400 font-medium'
                                : (sysNum > NORMAL_BP_SYS_HIGH || diaNum > NORMAL_BP_DIA_HIGH)
                                  ? 'text-orange-600 dark:text-orange-400 font-medium'
                                  : ''
                              : '';
                            return (
                              <tr key={v.id} className="border-t">
                                <td className="px-2 py-1.5 whitespace-nowrap font-mono text-xs">
                                  {timeLabel(recorded)}
                                </td>
                                <td className={`px-2 py-1.5 text-right tabular-nums ${numWarnClass(tempNum, NORMAL_TEMP_LOW, NORMAL_TEMP_HIGH)}`}>
                                  {v.temperature_c ?? '—'}
                                </td>
                                <td className={`px-2 py-1.5 text-right tabular-nums ${numWarnClass(v.pulse ?? null, NORMAL_PULSE_LOW, NORMAL_PULSE_HIGH)}`}>
                                  {v.pulse ?? '—'}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{v.respiratory_rate ?? '—'}</td>
                                <td className={`px-2 py-1.5 text-right tabular-nums ${bpClass}`}>
                                  {sysNum != null && diaNum != null ? `${sysNum}/${diaNum}` : '—'}
                                </td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{v.fbs_mmol ?? '—'}</td>
                                <td className="px-2 py-1.5 text-right tabular-nums">{v.rbs_mmol ?? '—'}</td>
                                <td className="px-2 py-1.5 max-w-[200px] truncate text-muted-foreground" title={v.notes || ''}>
                                  {v.notes || '—'}
                                </td>
                                <td className="px-2 py-1.5 text-xs text-muted-foreground truncate max-w-[120px]" title={v.recorded_by_name || ''}>
                                  {v.recorded_by_name || '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {showVitalForm && !historyOnly && (
                <div className="rounded-md border border-dashed border-border/80 bg-background p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">All fields optional — leave blank if not measured.</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div>
                      <Label className="text-xs">Temp °C</Label>
                      <Input inputMode="decimal" value={vitalForm.temp} onChange={(e) => setVitalForm((p) => ({ ...p, temp: e.target.value }))} placeholder="36.8" />
                    </div>
                    <div>
                      <Label className="text-xs">Pulse</Label>
                      <Input inputMode="numeric" value={vitalForm.pulse} onChange={(e) => setVitalForm((p) => ({ ...p, pulse: e.target.value }))} placeholder="72" />
                    </div>
                    <div>
                      <Label className="text-xs">RR</Label>
                      <Input inputMode="numeric" value={vitalForm.rr} onChange={(e) => setVitalForm((p) => ({ ...p, rr: e.target.value }))} placeholder="16" />
                    </div>
                    <div>
                      <Label className="text-xs">BP sys</Label>
                      <Input inputMode="numeric" value={vitalForm.bps} onChange={(e) => setVitalForm((p) => ({ ...p, bps: e.target.value }))} placeholder="120" />
                    </div>
                    <div>
                      <Label className="text-xs">BP dia</Label>
                      <Input inputMode="numeric" value={vitalForm.bpd} onChange={(e) => setVitalForm((p) => ({ ...p, bpd: e.target.value }))} placeholder="80" />
                    </div>
                    <div>
                      <Label className="text-xs">FBS (mmol/L)</Label>
                      <Input inputMode="decimal" value={vitalForm.fbs} onChange={(e) => setVitalForm((p) => ({ ...p, fbs: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">RBS (mmol/L)</Label>
                      <Input inputMode="decimal" value={vitalForm.rbs} onChange={(e) => setVitalForm((p) => ({ ...p, rbs: e.target.value }))} />
                    </div>
                    <div className="col-span-2 md:col-span-1">
                      <Label className="text-xs">Notes</Label>
                      <Input value={vitalForm.notes} onChange={(e) => setVitalForm((p) => ({ ...p, notes: e.target.value }))} />
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" onClick={() => void handleAddVital()} disabled={savingVital}>
                      {savingVital ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save row'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowVitalForm(false)} disabled={savingVital}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
      )}

            {!hideTreatmentSheet && (
            <section className="rounded-lg border border-border/80 bg-muted/20 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Treatment sheet</h3>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-muted-foreground">
                    {treatments.length} {treatments.length === 1 ? 'entry' : 'entries'}
                  </span>
                  <Button
                    type="button"
                    size="sm"
                    variant={showTreatForm ? 'secondary' : 'default'}
                    onClick={() => setShowTreatForm((v) => !v)}
                    className="h-7"
                  >
                    {showTreatForm ? (
                      <>
                        <ChevronDown className="h-3.5 w-3.5 mr-1 rotate-180 transition-transform" />
                        Close form
                      </>
                    ) : (
                      <>
                        <Plus className="h-3.5 w-3.5 mr-1" />
                        New row
                      </>
                    )}
                  </Button>
                </div>
              </div>
              <div className="overflow-x-auto border rounded-md bg-background">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">Drug</th>
                      <th className="text-left px-2 py-1.5 font-medium">Dose</th>
                      <th className="text-left px-2 py-1.5 font-medium">Route</th>
                      <th className="text-left px-2 py-1.5 font-medium">Given</th>
                      <th className="text-left px-2 py-1.5 font-medium">Done</th>
                      <th className="text-left px-2 py-1.5 font-medium">Reaction</th>
                      <th className="text-left px-2 py-1.5 font-medium">Nurse</th>
                      <th className="text-left px-2 py-1.5 font-medium">Doctor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {treatments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-6 text-center text-muted-foreground">
                          No treatment rows yet
                        </td>
                      </tr>
                    ) : (
                      treatments.map((t) => (
                        <tr key={t.id} className="border-t">
                          <td className="px-2 py-1.5 font-medium">{t.drug_name}</td>
                          <td className="px-2 py-1.5 tabular-nums">{t.dosage || '—'}</td>
                          <td className="px-2 py-1.5 capitalize">{t.route || '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{t.time_administered ? t.time_administered.slice(0, 5) : '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-xs whitespace-nowrap">{t.time_completed ? t.time_completed.slice(0, 5) : '—'}</td>
                          <td className="px-2 py-1.5 max-w-[140px] truncate text-muted-foreground" title={t.drug_reaction || ''}>{t.drug_reaction || '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{t.nurse_initials || '—'}</td>
                          <td className="px-2 py-1.5 font-mono text-xs">{t.doctor_initials || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {showTreatForm && (
                <div className="rounded-md border border-dashed border-border/80 bg-background p-3 space-y-2">
                  <p className="text-[11px] text-muted-foreground">
                    <span className="text-red-500">*</span> drug name required. Signed in as the recording nurse.
                  </p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <div className="col-span-2">
                      <Label className="text-xs">Drug <span className="text-red-500">*</span></Label>
                      <Input
                        value={treatForm.drug_name}
                        onChange={(e) => setTreatForm((p) => ({ ...p, drug_name: e.target.value }))}
                        placeholder="e.g. Paracetamol"
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Dosage</Label>
                      <Input value={treatForm.dosage} onChange={(e) => setTreatForm((p) => ({ ...p, dosage: e.target.value }))} placeholder="500 mg" />
                    </div>
                    <div>
                      <Label className="text-xs">Route</Label>
                      <Input value={treatForm.route} onChange={(e) => setTreatForm((p) => ({ ...p, route: e.target.value }))} placeholder="oral / IV / IM" />
                    </div>
                    <div>
                      <Label className="text-xs">Time given</Label>
                      <Input type="time" value={treatForm.time_adm} onChange={(e) => setTreatForm((p) => ({ ...p, time_adm: e.target.value }))} />
                    </div>
                    <div>
                      <Label className="text-xs">Time completed</Label>
                      <Input type="time" value={treatForm.time_done} onChange={(e) => setTreatForm((p) => ({ ...p, time_done: e.target.value }))} />
                    </div>
                    <div className="col-span-2">
                      <Label className="text-xs">Reaction</Label>
                      <Input value={treatForm.reaction} onChange={(e) => setTreatForm((p) => ({ ...p, reaction: e.target.value }))} placeholder="None / itching / nausea" />
                    </div>
                    <div className="col-span-2 rounded-md border border-border/60 bg-muted/40 px-2.5 py-2">
                      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">Nurse</p>
                      <p className="text-sm font-medium truncate" title={currentUser?.name || ''}>
                        {currentUser?.name || '—'}
                        {nurseInitials ? <span className="ml-1 font-mono text-xs text-muted-foreground">({nurseInitials})</span> : null}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-1">
                    <Button type="button" size="sm" onClick={() => void handleAddTreatment()} disabled={savingTreat}>
                      {savingTreat ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Save row'}
                    </Button>
                    <Button type="button" size="sm" variant="ghost" onClick={() => setShowTreatForm(false)} disabled={savingTreat}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
            </section>
            )}
    </div>
  );

  if (embedded) {
    return <div className="flex flex-col flex-1 min-h-0">{chartBody}</div>;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[920px] lg:max-w-[980px] max-h-[92vh] flex flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="px-5 pt-5 pb-4 border-b shrink-0 space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Activity className="h-5 w-5 text-teal-600 shrink-0" />
              Full observation chart
            </DialogTitle>
            <Badge variant="secondary" className="capitalize font-normal">
              {statusLabel}
            </Badge>
          </div>
          <div className="space-y-1">
            <DialogDescription className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-medium text-foreground">{admission.patient_name}</span>
              <span className="text-muted-foreground">·</span>
              <span className="font-mono text-xs">{admission.admission_id}</span>
              <span className="text-muted-foreground">·</span>
              <span>{admission.ward_name}</span>
              {admission.bed_number ? (
                <>
                  <span className="text-muted-foreground">·</span>
                  <span>Bed {admission.bed_number}</span>
                </>
              ) : null}
            </DialogDescription>
          </div>
        </DialogHeader>
        {chartBody}
        <DialogFooter className="px-5 py-4 border-t shrink-0 sm:justify-end">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
