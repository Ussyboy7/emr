'use client';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Download, FileCheck, FileText, Loader2, Send } from 'lucide-react';
import type { PatientAdmission } from '@/lib/services/ward-service';

export type ResponsibilityFormVariant = {
  formType: 'transfer' | 'dama' | 'general' | 'auto';
  label: string;
} | null;

type Props = {
  admission: PatientAdmission;
  isDownloadingSummary: boolean;
  isDownloadingSlip: boolean;
  isDownloadingReferralLetter: boolean;
  isDownloadingResponsibility: boolean;
  onDownloadSummary: () => void;
  onDownloadSlip: () => void;
  onDownloadReferralLetter: () => void;
  onDownloadResponsibility: (formType: 'transfer' | 'dama' | 'general' | 'auto') => void;
  getResponsibilityFormVariant: (admission: PatientAdmission) => ResponsibilityFormVariant;
};

export function WardAdmissionDocumentsMenu({
  admission,
  isDownloadingSummary,
  isDownloadingSlip,
  isDownloadingReferralLetter,
  isDownloadingResponsibility,
  onDownloadSummary,
  onDownloadSlip,
  onDownloadReferralLetter,
  onDownloadResponsibility,
  getResponsibilityFormVariant,
}: Props) {
  const responsibility = getResponsibilityFormVariant(admission);
  const showDischargeDocs =
    admission.status === 'discharged' || admission.status === 'pending_discharge';

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="sm" variant="outline" className="h-8 text-xs shrink-0">
          <Download className="h-3.5 w-3.5 mr-1.5" />
          Documents
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem onClick={onDownloadSummary} disabled={isDownloadingSummary}>
          {isDownloadingSummary ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          {admission.status === 'discharged' ? 'Summary PDF' : 'Interim PDF'}
        </DropdownMenuItem>
        {showDischargeDocs && (
          <DropdownMenuItem onClick={onDownloadSlip} disabled={isDownloadingSlip}>
            {isDownloadingSlip ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <FileText className="h-4 w-4 mr-2" />
            )}
            Patient slip
          </DropdownMenuItem>
        )}
        {admission.escort && (
          <DropdownMenuItem onClick={onDownloadReferralLetter} disabled={isDownloadingReferralLetter}>
            {isDownloadingReferralLetter ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Send className="h-4 w-4 mr-2" />
            )}
            Referral letter
          </DropdownMenuItem>
        )}
        {responsibility && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onClick={() => onDownloadResponsibility(responsibility.formType)}
              disabled={isDownloadingResponsibility}
            >
              {isDownloadingResponsibility ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <FileCheck className="h-4 w-4 mr-2" />
              )}
              {responsibility.label}
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
