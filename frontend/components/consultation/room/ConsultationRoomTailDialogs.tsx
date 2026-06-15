"use client";

import { EyeSessionReportDialog } from '@/components/eyecare/EyeSessionReportDialog';
import { MedicalCertificateCreateDialog } from '@/components/medical-records/MedicalCertificateCreateDialog';
import { PatientHistoryReferralViewDialog } from '@/components/patient-history/PatientHistoryReferralViewDialog';
import type { Patient as ApiPatient } from '@/lib/services/patient-service';
import type { Dispatch, SetStateAction } from 'react';

export type ConsultationRoomTailDialogsProps = {
  eyeSessionReportOpen: boolean;
  setEyeSessionReportOpen: (open: boolean) => void;
  eyeSessionReportOrderId: number | undefined;
  referralViewOpen: boolean;
  setReferralViewOpen: (open: boolean) => void;
  referralViewId: number | null | undefined;
  referralViewRefreshKey: number;
  bumpReferralHistory: () => void;
  certDialogOpen: boolean;
  setCertDialogOpen: (open: boolean) => void;
  certificatePatient: ApiPatient | null;
  setCertificatePatient: Dispatch<SetStateAction<ApiPatient | null>>;
  setHistoryReloadToken: Dispatch<SetStateAction<number>>;
};

export function ConsultationRoomTailDialogs({
  eyeSessionReportOpen,
  setEyeSessionReportOpen,
  eyeSessionReportOrderId,
  referralViewOpen,
  setReferralViewOpen,
  referralViewId,
  referralViewRefreshKey,
  bumpReferralHistory,
  certDialogOpen,
  setCertDialogOpen,
  certificatePatient,
  setCertificatePatient,
  setHistoryReloadToken,
}: ConsultationRoomTailDialogsProps) {
  return (
    <>
      <EyeSessionReportDialog
        open={eyeSessionReportOpen}
        onOpenChange={setEyeSessionReportOpen}
        orderId={eyeSessionReportOrderId}
      />
      <PatientHistoryReferralViewDialog
        open={referralViewOpen}
        onOpenChange={setReferralViewOpen}
        referralId={referralViewId ?? null}
        refreshKey={referralViewRefreshKey}
        onReferralUpdated={bumpReferralHistory}
      />
      <MedicalCertificateCreateDialog
        open={certDialogOpen}
        onOpenChange={(open) => {
          setCertDialogOpen(open);
          if (!open) setCertificatePatient(null);
        }}
        patient={certificatePatient}
        onCreated={() => setHistoryReloadToken((n) => n + 1)}
      />
    </>
  );
}
