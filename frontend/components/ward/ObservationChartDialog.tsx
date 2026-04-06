'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Activity } from 'lucide-react';
import {
  wardService,
  type PatientAdmission,
  type AdmissionObservationVital,
  type AdmissionTreatmentRow,
} from '@/lib/services/ward-service';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  admission: PatientAdmission | null;
};

export function ObservationChartDialog({ open, onOpenChange, admission }: Props) {
  const [vitals, setVitals] = useState<AdmissionObservationVital[]>([]);
  const [treatments, setTreatments] = useState<AdmissionTreatmentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingVital, setSavingVital] = useState(false);
  const [savingTreat, setSavingTreat] = useState(false);
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
    if (!treatForm.ni.trim() || !treatForm.di.trim()) {
      toast.error('Nurse and doctor initials are required');
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
        ni: '',
        di: '',
      });
      await load();
    } catch (e: any) {
      toast.error(e?.message || 'Failed to save treatment row');
    } finally {
      setSavingTreat(false);
    }
  };

  if (!admission) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[900px] max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 text-teal-600" />
            Full observation chart
          </DialogTitle>
          <DialogDescription>
            {admission.patient_name} · {admission.admission_id} · {admission.ward_name}
            {admission.bed_number ? ` · Bed ${admission.bed_number}` : ''} · Diagnosis:{' '}
            {admission.admission_diagnosis?.slice(0, 120)}
            {admission.admission_diagnosis && admission.admission_diagnosis.length > 120 ? '…' : ''}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-12 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            <section>
              <h3 className="text-sm font-semibold mb-2">Continuous vitals (incl. FBS / RBS)</h3>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Time</th>
                      <th className="text-right p-2">T°C</th>
                      <th className="text-right p-2">Pulse</th>
                      <th className="text-right p-2">RR</th>
                      <th className="text-right p-2">BP</th>
                      <th className="text-right p-2">FBS</th>
                      <th className="text-right p-2">RBS</th>
                      <th className="text-left p-2">Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vitals.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-muted-foreground">
                          No vitals recorded yet
                        </td>
                      </tr>
                    ) : (
                      vitals.map((v) => (
                        <tr key={v.id} className="border-t">
                          <td className="p-2 whitespace-nowrap">
                            {new Date(v.recorded_at).toLocaleString()}
                          </td>
                          <td className="p-2 text-right">{v.temperature_c ?? '—'}</td>
                          <td className="p-2 text-right">{v.pulse ?? '—'}</td>
                          <td className="p-2 text-right">{v.respiratory_rate ?? '—'}</td>
                          <td className="p-2 text-right">
                            {v.bp_systolic != null && v.bp_diastolic != null
                              ? `${v.bp_systolic}/${v.bp_diastolic}`
                              : '—'}
                          </td>
                          <td className="p-2 text-right">{v.fbs_mmol ?? '—'}</td>
                          <td className="p-2 text-right">{v.rbs_mmol ?? '—'}</td>
                          <td className="p-2 max-w-[140px] truncate" title={v.notes || ''}>
                            {v.notes || '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <div>
                  <Label className="text-xs">Temp °C</Label>
                  <Input value={vitalForm.temp} onChange={(e) => setVitalForm((p) => ({ ...p, temp: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Pulse</Label>
                  <Input value={vitalForm.pulse} onChange={(e) => setVitalForm((p) => ({ ...p, pulse: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">RR</Label>
                  <Input value={vitalForm.rr} onChange={(e) => setVitalForm((p) => ({ ...p, rr: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">BP sys</Label>
                  <Input value={vitalForm.bps} onChange={(e) => setVitalForm((p) => ({ ...p, bps: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">BP dia</Label>
                  <Input value={vitalForm.bpd} onChange={(e) => setVitalForm((p) => ({ ...p, bpd: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">FBS (mmol/L)</Label>
                  <Input value={vitalForm.fbs} onChange={(e) => setVitalForm((p) => ({ ...p, fbs: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">RBS (mmol/L)</Label>
                  <Input value={vitalForm.rbs} onChange={(e) => setVitalForm((p) => ({ ...p, rbs: e.target.value }))} />
                </div>
                <div className="col-span-2">
                  <Label className="text-xs">Notes</Label>
                  <Input value={vitalForm.notes} onChange={(e) => setVitalForm((p) => ({ ...p, notes: e.target.value }))} />
                </div>
              </div>
              <Button type="button" className="mt-2" size="sm" onClick={() => void handleAddVital()} disabled={savingVital}>
                {savingVital ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add vitals row'}
              </Button>
            </section>

            <section>
              <h3 className="text-sm font-semibold mb-2">Treatment sheet</h3>
              <div className="overflow-x-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-2">Drug</th>
                      <th className="text-left p-2">Dose</th>
                      <th className="text-left p-2">Route</th>
                      <th className="text-left p-2">Given</th>
                      <th className="text-left p-2">Done</th>
                      <th className="text-left p-2">Reaction</th>
                      <th className="text-left p-2">Nurse</th>
                      <th className="text-left p-2">Doctor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {treatments.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="p-4 text-center text-muted-foreground">
                          No treatment rows yet
                        </td>
                      </tr>
                    ) : (
                      treatments.map((t) => (
                        <tr key={t.id} className="border-t">
                          <td className="p-2">{t.drug_name}</td>
                          <td className="p-2">{t.dosage || '—'}</td>
                          <td className="p-2">{t.route || '—'}</td>
                          <td className="p-2">{t.time_administered || '—'}</td>
                          <td className="p-2">{t.time_completed || '—'}</td>
                          <td className="p-2 max-w-[100px] truncate">{t.drug_reaction || '—'}</td>
                          <td className="p-2">{t.nurse_initials || '—'}</td>
                          <td className="p-2">{t.doctor_initials || '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                <div className="col-span-2">
                  <Label className="text-xs">Drug *</Label>
                  <Input
                    value={treatForm.drug_name}
                    onChange={(e) => setTreatForm((p) => ({ ...p, drug_name: e.target.value }))}
                  />
                </div>
                <div>
                  <Label className="text-xs">Dosage</Label>
                  <Input value={treatForm.dosage} onChange={(e) => setTreatForm((p) => ({ ...p, dosage: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Route</Label>
                  <Input value={treatForm.route} onChange={(e) => setTreatForm((p) => ({ ...p, route: e.target.value }))} />
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
                  <Input value={treatForm.reaction} onChange={(e) => setTreatForm((p) => ({ ...p, reaction: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">Nurse initials *</Label>
                  <Input value={treatForm.ni} onChange={(e) => setTreatForm((p) => ({ ...p, ni: e.target.value }))} maxLength={12} />
                </div>
                <div>
                  <Label className="text-xs">Doctor initials *</Label>
                  <Input value={treatForm.di} onChange={(e) => setTreatForm((p) => ({ ...p, di: e.target.value }))} maxLength={12} />
                </div>
              </div>
              <Button type="button" className="mt-2" size="sm" onClick={() => void handleAddTreatment()} disabled={savingTreat}>
                {savingTreat ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Add treatment row'}
              </Button>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
