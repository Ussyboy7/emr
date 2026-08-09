'use client';

import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  Syringe,
  Bandage,
  Pill,
  DoorOpen,
  AlertTriangle,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import { NURSING_DRESSING_PROCEDURE_TYPES } from '@/lib/constants/medical-data';
import {
  completeNursingProcedureOrder,
  type DressingPerformForm,
  type MedicationPerformForm,
} from '@/lib/nursing/complete-nursing-procedure-order';
import {
  defaultInjectionAdminTime,
  emptyInjectionPerformForm,
  getInjectionSiteOptions,
  injectionSiteNeedsLaterality,
  type InjectionPerformForm,
} from '@/lib/nursing/injection-site-options';
import type { NursingProcedureItem } from '@/lib/nursing/nursing-procedure-queue';

const TYPE_CONFIG: Record<
  string,
  { icon: typeof Syringe; color: string; label: string; buttonClass: string }
> = {
  injection: {
    icon: Syringe,
    color: 'text-emerald-500',
    label: 'Injection',
    buttonClass: 'bg-emerald-500 hover:bg-emerald-600',
  },
  dressing: {
    icon: Bandage,
    color: 'text-violet-500',
    label: 'Dressing',
    buttonClass: 'bg-violet-500 hover:bg-violet-600',
  },
  medication: {
    icon: Pill,
    color: 'text-blue-500',
    label: 'Medication',
    buttonClass: 'bg-blue-500 hover:bg-blue-600',
  },
  ward_admission: {
    icon: DoorOpen,
    color: 'text-amber-500',
    label: 'Observation Admission',
    buttonClass: 'bg-amber-500 hover:bg-amber-600',
  },
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  procedure: NursingProcedureItem | null;
  currentUserId?: number;
  onCompleted?: () => void;
  /** Ward admission legacy fallback only */
  wards?: Array<{ id: number; ward_code?: string; name?: string }>;
};

export function PerformNursingProcedureDialog({
  open,
  onOpenChange,
  procedure,
  currentUserId,
  onCompleted,
  wards = [],
}: Props) {
  const [submitting, setSubmitting] = useState(false);
  const [injectionForm, setInjectionForm] = useState<InjectionPerformForm>(() =>
    emptyInjectionPerformForm(),
  );
  const [dressingForm, setDressingForm] = useState<DressingPerformForm>({
    dressingType: '',
    woundCondition: '',
    observations: '',
  });
  const [medicationForm, setMedicationForm] = useState<MedicationPerformForm>({
    site: '',
    administeredTime: '',
    notes: '',
  });
  const [wardAdmissionNotes, setWardAdmissionNotes] = useState('');

  const resetForms = () => {
    setInjectionForm(emptyInjectionPerformForm());
    setDressingForm({ dressingType: '', woundCondition: '', observations: '' });
    setMedicationForm({ site: '', administeredTime: '', notes: '' });
    setWardAdmissionNotes('');
  };

  useEffect(() => {
    if (!open || !procedure) return;
    resetForms();
    if (procedure.type === 'injection') {
      setInjectionForm({
        ...emptyInjectionPerformForm(),
        administeredTime: defaultInjectionAdminTime(),
      });
    }
    if (procedure.type === 'medication') {
      setMedicationForm((prev) => ({ ...prev, administeredTime: defaultInjectionAdminTime() }));
    }
  }, [open, procedure]);

  const injectionSiteOptions = useMemo(() => {
    if (!procedure || procedure.type !== 'injection') return [];
    return getInjectionSiteOptions(procedure.details.route);
  }, [procedure]);

  const injectionCanComplete = useMemo(() => {
    if (!procedure || procedure.type !== 'injection') return true;
    const validSite =
      !!injectionForm.site && injectionSiteOptions.some((o) => o.value === injectionForm.site);
    if (!validSite) return false;
    if (!injectionForm.administeredTime.trim()) return false;
    if (injectionSiteNeedsLaterality(injectionForm.site) && !injectionForm.laterality) return false;
    if (injectionForm.immediateReaction === 'yes' && !injectionForm.reactionDetail.trim()) {
      return false;
    }
    return true;
  }, [procedure, injectionForm, injectionSiteOptions]);

  const dressingCanComplete = useMemo(() => {
    if (!procedure || procedure.type !== 'dressing') return true;
    return Boolean(dressingForm.dressingType && dressingForm.woundCondition);
  }, [procedure, dressingForm]);

  const medicationCanComplete = useMemo(() => {
    if (!procedure || procedure.type !== 'medication') return true;
    return Boolean(medicationForm.administeredTime.trim());
  }, [procedure, medicationForm.administeredTime]);

  const handleComplete = async () => {
    if (!procedure) return;
    setSubmitting(true);
    try {
      await completeNursingProcedureOrder({
        procedure,
        currentUserId,
        injectionForm: procedure.type === 'injection' ? injectionForm : undefined,
        dressingForm: procedure.type === 'dressing' ? dressingForm : undefined,
        medicationForm: procedure.type === 'medication' ? medicationForm : undefined,
        wardAdmissionNotes: procedure.type === 'ward_admission' ? wardAdmissionNotes : undefined,
        wards,
      });
      const config = TYPE_CONFIG[procedure.type] || TYPE_CONFIG.medication;
      toast.success(`${config.label} completed for ${procedure.patientName}`);
      onOpenChange(false);
      resetForms();
      onCompleted?.();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to complete procedure';
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  const config = procedure ? TYPE_CONFIG[procedure.type] || TYPE_CONFIG.medication : null;
  const TypeIcon = config?.icon ?? Syringe;

  const submitLabel =
    procedure?.type === 'injection'
      ? 'Administer'
      : procedure?.type === 'dressing'
        ? 'Complete Dressing'
        : procedure?.type === 'medication'
          ? 'Administer'
          : procedure?.type === 'ward_admission'
            ? 'Admit Patient'
            : 'Complete';

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForms();
      }}
    >
      <DialogContent className={MODAL_SIZES.md}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {config ? (
              <>
                <TypeIcon className={`h-5 w-5 ${config.color}`} />
                {config.label}
              </>
            ) : (
              'Complete procedure'
            )}
          </DialogTitle>
          {procedure ? (
            <DialogDescription>
              {procedure.patientName}
              {procedure.patientId ? ` — ${procedure.patientId}` : ''}
            </DialogDescription>
          ) : null}
        </DialogHeader>

        {procedure ? (
          <div className="py-4 space-y-4">
            {procedure.allergies.length > 0 ? (
              <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30">
                <p className="text-sm font-medium text-rose-600 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Allergy Alert: {procedure.allergies.join(', ')}
                </p>
              </div>
            ) : null}

            <div className="p-4 rounded-lg bg-muted/50">
              <p className="text-xs text-muted-foreground mb-1">Ordered by {procedure.orderedBy}</p>
              {procedure.type === 'injection' ? (
                <>
                  <p className="font-medium text-foreground">
                    {procedure.details.medication} - {procedure.details.dosage}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    {[procedure.details.route, procedure.details.frequency].filter(Boolean).join(' • ')}
                  </p>
                </>
              ) : null}
              {procedure.type === 'dressing' ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">Wound type</p>
                    <p className="font-medium">{procedure.details.woundType || '—'}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Location</p>
                    <p className="font-medium">{procedure.details.woundLocation || '—'}</p>
                  </div>
                  {procedure.details.instructions ? (
                    <div className="col-span-2">
                      <p className="text-xs text-muted-foreground">Instructions</p>
                      <p className="text-sm">{procedure.details.instructions}</p>
                    </div>
                  ) : null}
                </div>
              ) : null}
              {procedure.type === 'medication' ? (
                <>
                  <p className="font-medium text-foreground">{procedure.details.medication}</p>
                  <p className="text-sm text-muted-foreground">{procedure.details.route}</p>
                </>
              ) : null}
            </div>

            {procedure.type === 'injection' ? (
              <div className="grid grid-cols-2 gap-4">
                <p className="col-span-2 text-xs text-muted-foreground">
                  Confirm the vial or syringe matches the order before administering.
                </p>
                <div className="space-y-2">
                  <Label>Injection Site *</Label>
                  <Select
                    value={injectionForm.site}
                    onValueChange={(v) =>
                      setInjectionForm((p) => ({
                        ...p,
                        site: v,
                        laterality: injectionSiteNeedsLaterality(v) ? p.laterality : '',
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {injectionSiteOptions.map((opt) => (
                        <SelectItem key={opt.value} value={opt.value}>
                          {opt.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {injectionSiteNeedsLaterality(injectionForm.site) ? (
                  <div className="space-y-2">
                    <Label>Laterality *</Label>
                    <Select
                      value={injectionForm.laterality}
                      onValueChange={(v) =>
                        setInjectionForm((p) => ({ ...p, laterality: v as 'Left' | 'Right' }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Left or right" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Left">Left</SelectItem>
                        <SelectItem value="Right">Right</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                ) : null}
                <div className="col-span-2 space-y-2">
                  <Label>Time of administration *</Label>
                  <Input
                    type="time"
                    value={injectionForm.administeredTime}
                    onChange={(e) =>
                      setInjectionForm((p) => ({ ...p, administeredTime: e.target.value }))
                    }
                  />
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Immediate reaction after dose</Label>
                  <Select
                    value={injectionForm.immediateReaction}
                    onValueChange={(v) =>
                      setInjectionForm((p) => ({
                        ...p,
                        immediateReaction: v as 'none' | 'yes',
                        reactionDetail: v === 'none' ? '' : p.reactionDetail,
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">None observed</SelectItem>
                      <SelectItem value="yes">Yes — describe below</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {injectionForm.immediateReaction === 'yes' ? (
                  <div className="col-span-2 space-y-2">
                    <Label>Reaction details *</Label>
                    <Textarea
                      value={injectionForm.reactionDetail}
                      onChange={(e) =>
                        setInjectionForm((p) => ({ ...p, reactionDetail: e.target.value }))
                      }
                      rows={2}
                    />
                  </div>
                ) : null}
                <div className="col-span-2 space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={injectionForm.notes}
                    onChange={(e) => setInjectionForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
            ) : null}

            {procedure.type === 'dressing' ? (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Dressing Type *</Label>
                  <Select
                    value={dressingForm.dressingType}
                    onValueChange={(v) => setDressingForm((p) => ({ ...p, dressingType: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {NURSING_DRESSING_PROCEDURE_TYPES.map((type) => (
                        <SelectItem key={type} value={type}>
                          {type}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Wound Condition *</Label>
                  <Select
                    value={dressingForm.woundCondition}
                    onValueChange={(v) => setDressingForm((p) => ({ ...p, woundCondition: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Healing">Healing</SelectItem>
                      <SelectItem value="Infected">Infected</SelectItem>
                      <SelectItem value="Stagnant">Stagnant</SelectItem>
                      <SelectItem value="Deteriorating">Deteriorating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="col-span-2 space-y-2">
                  <Label>Observations</Label>
                  <Textarea
                    value={dressingForm.observations}
                    onChange={(e) => setDressingForm((p) => ({ ...p, observations: e.target.value }))}
                    rows={3}
                  />
                </div>
              </div>
            ) : null}

            {procedure.type === 'medication' ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Time of administration *</Label>
                  <Input
                    type="time"
                    value={medicationForm.administeredTime}
                    onChange={(e) =>
                      setMedicationForm((p) => ({ ...p, administeredTime: e.target.value }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={medicationForm.notes}
                    onChange={(e) => setMedicationForm((p) => ({ ...p, notes: e.target.value }))}
                    rows={2}
                  />
                </div>
              </div>
            ) : null}

            {procedure.type === 'ward_admission' ? (
              <div className="space-y-4">
                {procedure.details.admissionDiagnosesList?.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {procedure.details.admissionDiagnosesList.map((diagnosis, index) => (
                      <Badge key={`${diagnosis}-${index}`} variant="outline" className="text-xs">
                        {diagnosis}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label>Admission Notes</Label>
                  <Textarea
                    value={wardAdmissionNotes}
                    onChange={(e) => setWardAdmissionNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => void handleComplete()}
            disabled={
              submitting ||
              !procedure ||
              (procedure.type === 'injection' && !injectionCanComplete) ||
              (procedure.type === 'dressing' && !dressingCanComplete) ||
              (procedure.type === 'medication' && !medicationCanComplete)
            }
            className={`text-white ${config?.buttonClass ?? ''}`}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Recording...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {submitLabel}
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
