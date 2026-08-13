"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { WardAdmissionDocumentsMenu, type ResponsibilityFormVariant } from '@/components/ward/WardAdmissionDocumentsMenu';
import { resolvePatientPhoto } from '@/lib/patient-photo';
import { formatAdmissionTypeLabel } from '@/lib/ward-admission-ui';
import type { PatientAdmission } from '@/lib/services/ward-service';
import type { ConsultationSession } from '@/lib/services';
import { CalendarDays, CheckCircle, Clock, User, Bed } from 'lucide-react';

function getStatusBadgeClass(status: string) {
  switch (status) {
    case 'admitted': return 'border-blue-500/50 text-blue-600 dark:text-blue-400 bg-blue-500/10';
    case 'pending_discharge': return 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10';
    case 'discharged': return 'border-green-500/50 text-green-600 dark:text-green-400 bg-green-500/10';
    case 'transferred': return 'border-purple-500/50 text-purple-600 dark:text-purple-400 bg-purple-500/10';
    default: return 'border-muted-foreground/50 text-muted-foreground';
  }
}

function formatStatus(status: string) {
  if (status === 'pending_discharge') return 'Pending Discharge';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

type Props = {
  admission: PatientAdmission;
  session: ConsultationSession | null;
  isDownloadingSummary: boolean;
  isDownloadingSlip: boolean;
  isDownloadingReferralLetter: boolean;
  isDownloadingResponsibility: boolean;
  onDownloadSummary: () => void;
  onDownloadSlip: () => void;
  onDownloadReferralLetter: () => void;
  onDownloadResponsibility: (formType: 'transfer' | 'dama' | 'general' | 'auto') => void;
  getResponsibilityFormVariant: (admission: PatientAdmission) => ResponsibilityFormVariant;
  onInitiateDischarge?: () => void;
};

export function CareSessionPageHeader({
  admission,
  session,
  isDownloadingSummary,
  isDownloadingSlip,
  isDownloadingReferralLetter,
  isDownloadingResponsibility,
  onDownloadSummary,
  onDownloadSlip,
  onDownloadReferralLetter,
  onDownloadResponsibility,
  getResponsibilityFormVariant,
  onInitiateDischarge,
}: Props) {
  return (
    <div className="sticky top-0 z-20 rounded-lg border bg-card/95 p-4 sm:p-5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-card/85">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <PatientAvatar
            name={admission.patient_name}
            photoUrl={resolvePatientPhoto(admission)}
            size="md"
            className="shrink-0 hidden sm:flex"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-foreground">
                {admission.patient_name}
              </h1>
              <Badge variant="outline" className={`${getStatusBadgeClass(admission.status)} font-normal text-[10px]`}>
                {formatStatus(admission.status)}
              </Badge>
              {formatAdmissionTypeLabel(admission.admission_type) && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 font-normal">
                  {formatAdmissionTypeLabel(admission.admission_type)}
                </Badge>
              )}
            </div>
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-2 gap-y-1 text-sm mt-1">
              <span className="font-mono text-xs">{admission.admission_id}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1"><Bed className="h-3 w-3" />{admission.ward_name}{admission.bed_number ? ` · Bed ${admission.bed_number}` : ''}</span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {admission.length_of_stay === 0
                  ? 'Same day'
                  : `${admission.length_of_stay} day${admission.length_of_stay === 1 ? '' : 's'}`}
              </span>
              {admission.admitting_doctor_name && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><User className="h-3 w-3" />Dr {admission.admitting_doctor_name}</span>
                </>
              )}
              {admission.admission_date && (
                <>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" />{new Date(admission.admission_date).toLocaleDateString()}</span>
                </>
              )}
              {session?.id != null && <span>·</span>}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onInitiateDischarge && admission.status === 'admitted' && (
            <Button
              size="sm"
              variant="outline"
              className="h-8 text-xs border-amber-500/50 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-950/30"
              onClick={onInitiateDischarge}
            >
              <CheckCircle className="mr-1 h-3.5 w-3.5" /> Initiate discharge
            </Button>
          )}
          {session?.id != null && (
            <Badge variant="outline" className="text-[10px] px-2 h-6 gap-1 bg-emerald-500/5 border-emerald-500/40 text-emerald-600 dark:text-emerald-400">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Session #{session.id}
            </Badge>
          )}
          <WardAdmissionDocumentsMenu
            admission={admission}
            isDownloadingSummary={isDownloadingSummary}
            isDownloadingSlip={isDownloadingSlip}
            isDownloadingReferralLetter={isDownloadingReferralLetter}
            isDownloadingResponsibility={isDownloadingResponsibility}
            onDownloadSummary={onDownloadSummary}
            onDownloadSlip={onDownloadSlip}
            onDownloadReferralLetter={onDownloadReferralLetter}
            onDownloadResponsibility={onDownloadResponsibility}
            getResponsibilityFormVariant={getResponsibilityFormVariant}
          />
        </div>
      </div>
    </div>
  );
}
