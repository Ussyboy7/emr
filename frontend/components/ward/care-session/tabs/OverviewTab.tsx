"use client";

import { AlertTriangle, BadgeCheck, CheckCircle, FileText, Send } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { isEscalatedCondition, formatAdmissionTypeLabel } from '@/lib/ward-admission-ui';
import { formatDisplayDateTime } from '@/lib/dates';
import type { PatientAdmission } from '@/lib/services/ward-service';
import type { ConsultationSession } from '@/lib/services';

function getConditionBadgeClass(condition: string) {
  if (/needs doctor review/i.test(condition))
    return 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-500/10';
  const lc = condition.toLowerCase();
  if (lc.includes('stable') || lc.includes('good') || lc.includes('improving'))
    return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
  if (lc.includes('critical') || lc.includes('serious'))
    return 'border-red-500/50 text-red-600 dark:text-red-400 bg-red-500/10';
  return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
}

type Props = {
  admission: PatientAdmission;
  session: ConsultationSession | null;
};

export function OverviewTab({ admission, session }: Props) {
  return (
    <div className="space-y-4">
      {(admission.current_condition || admission.status !== 'admitted') && (
        <section className="rounded-lg border bg-card p-4 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Care session
            </h3>
            {formatAdmissionTypeLabel(admission.admission_type) && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                {formatAdmissionTypeLabel(admission.admission_type)}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div>
              <Label className="text-muted-foreground text-xs">Admission diagnosis</Label>
              <p className="mt-0.5">{admission.admission_diagnosis || '—'}</p>
            </div>
            {admission.presenting_complaint && (
              <div>
                <Label className="text-muted-foreground text-xs">Presenting complaint</Label>
                <p className="mt-0.5">{admission.presenting_complaint}</p>
              </div>
            )}
            {admission.admitting_doctor_name && (
              <div>
                <Label className="text-muted-foreground text-xs">Admitting doctor</Label>
                <p className="mt-0.5">Dr {admission.admitting_doctor_name}</p>
              </div>
            )}
            {admission.admission_date && (
              <div>
                <Label className="text-muted-foreground text-xs">Admitted on</Label>
                <p className="mt-0.5">{formatDisplayDateTime(admission.admission_date)}</p>
              </div>
            )}
          </div>
        </section>
      )}

      {admission.current_condition && isEscalatedCondition(admission.current_condition) && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg border text-sm bg-orange-50 dark:bg-orange-950/30 border-orange-300 dark:border-orange-700 text-orange-700 dark:text-orange-300">
          <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-orange-600" />
          <div>
            <p className="font-semibold text-xs">Nurse escalation</p>
            <p>{admission.current_condition}</p>
          </div>
        </div>
      )}

      {session?.id != null && sessionDiagnosisNotes(session) && (
        <details className="rounded-lg border bg-muted/20 p-3 group">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <span>Linked consultation notes</span>
            <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 gap-1 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              <BadgeCheck className="h-3 w-3" /> Session #{session.id}
            </Badge>
          </summary>
          <div className="mt-3 space-y-3">
            <ConsultationNoteSection label="Presenting complaint" value={session.presentation_complaint} />
            <ConsultationNoteSection label="History of presenting illness" value={session.history_of_presenting_illness} />
            <ConsultationNoteSection label="Physical examination" value={session.physical_examination} />
            <ConsultationNoteSection label="Assessment" value={session.assessment} />
            <ConsultationNoteSection label="Treatment plan" value={session.plan} />
          </div>
        </details>
      )}

      {/* Discharge plan — surfaces any initiated discharge so it stays visible */}
      {(admission.status === 'pending_discharge' || admission.status === 'discharged') && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-900/50 bg-amber-50/40 dark:bg-amber-950/20 p-4 space-y-3">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <Label className="text-xs uppercase tracking-wide text-amber-700 dark:text-amber-400 font-semibold">
              Discharge Plan
            </Label>
            {admission.status === 'pending_discharge' && (
              <Badge variant="outline" className="text-[10px] px-1.5 h-5 border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                Awaiting nurse sign-out
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            {admission.discharge_type && (
              <div>
                <Label className="text-muted-foreground text-xs">Discharge type</Label>
                <p className="font-medium capitalize">{admission.discharge_type.replace(/_/g, ' ')}</p>
              </div>
            )}
            {admission.discharge_date && (
              <div>
                <Label className="text-muted-foreground text-xs">
                  {admission.status === 'discharged' ? 'Discharged on' : 'Initiated on'}
                </Label>
                <p className="font-medium">{formatDisplayDateTime(admission.discharge_date)}</p>
              </div>
            )}
          </div>
          {admission.discharge_diagnosis && (
            <div>
              <Label className="text-muted-foreground text-xs">Final diagnosis</Label>
              <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1">{admission.discharge_diagnosis}</p>
            </div>
          )}
          {admission.discharge_summary && (
            <div>
              <Label className="text-muted-foreground text-xs">Discharge summary</Label>
              <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1 whitespace-pre-wrap">{admission.discharge_summary}</p>
            </div>
          )}
          {admission.follow_up_instructions && (
            <div>
              <Label className="text-muted-foreground text-xs">Follow-up instructions</Label>
              <p className="text-sm bg-background border border-border/60 p-2 rounded mt-1 whitespace-pre-wrap">{admission.follow_up_instructions}</p>
            </div>
          )}
        </div>
      )}

      {admission.admission_instructions?.trim() && (
        <section className="rounded-lg border bg-card p-3 space-y-1.5">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Instructions at admission
          </h3>
          <p className="text-sm whitespace-pre-wrap">{admission.admission_instructions}</p>
        </section>
      )}

      {admission.escort && (
        <section className="rounded-lg border border-cyan-200 dark:border-cyan-900/50 bg-cyan-50/50 dark:bg-cyan-950/20 p-3 space-y-2">
          <div className="flex items-center gap-2">
            <Send className="h-3.5 w-3.5 text-cyan-700 dark:text-cyan-400" />
            <Label className="text-xs uppercase tracking-wide text-cyan-700 dark:text-cyan-400 font-semibold">
              External referral linked
            </Label>
            {admission.escort.referral_id_display && (
              <Badge variant="outline" className="text-[10px] px-1.5 h-5 font-mono">
                {admission.escort.referral_id_display}
              </Badge>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <Label className="text-muted-foreground text-xs">Receiving facility</Label>
              <p className="font-medium">{admission.escort.facility_name_snapshot || admission.escort.facility_name || '—'}</p>
            </div>
            {admission.escort.referral_specialty && (
              <div>
                <Label className="text-muted-foreground text-xs">Specialty</Label>
                <p className="font-medium">{admission.escort.referral_specialty}</p>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}

/** Compact single-paragraph summary of the linked session's clinical notes. */
function sessionDiagnosisNotes(session: ConsultationSession): string {
  const parts = [session.presentation_complaint, session.history_of_presenting_illness, session.physical_examination, session.assessment, session.plan]
    .filter((v): v is string => typeof v === 'string' && v.trim().length > 0);
  return parts.join('\n\n');
}

function ConsultationNoteSection({ label, value }: { label: string; value?: string | null }) {
  if (!value?.trim()) return null;
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="rounded-md border bg-background/70 p-2 text-sm whitespace-pre-wrap text-foreground/90">{value}</p>
    </div>
  );
}
