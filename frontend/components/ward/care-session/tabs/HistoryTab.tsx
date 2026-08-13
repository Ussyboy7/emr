"use client";

import { PatientHistoryTabs } from '@/components/patient-history/PatientHistoryTabs';
import { consultationService } from '@/lib/services';
import { toast } from 'sonner';

export type HistoryTabCallbacks = {
  onViewConsultation: (session: { id: number }) => void;
  onViewLab: (lab: any) => void;
  onViewImaging: (img: any) => void;
  onViewPrescription: (prescription: any) => void;
  onViewVital: (vital: any) => void;
  onViewPhysio: (order: any) => void;
  onViewEyeOrder: (order: { id: number }) => void;
  onViewWard: (admission: any) => void;
  onViewReferral: (referral: { id?: number | null }) => void;
  onReferralUpdated: () => void;
};

type Props = {
  patientId: number;
  historyReloadToken: number;
  callbacks: HistoryTabCallbacks;
};

export function HistoryTab({ patientId, historyReloadToken, callbacks }: Props) {
  return (
    <PatientHistoryTabs
      patientId={patientId}
      defaultTab="background"
      showVisits
      showCertificates
      showDocuments
      allowDocumentActions={false}
      showReferrals
      showBackground
      onViewVisit={async (v) => {
        const visitId = Number(v?.id);
        if (!Number.isFinite(visitId) || visitId <= 0) {
          toast.error('Visit details are not available.');
          return;
        }
        try {
          const session = await consultationService.resolveSessionForVisit({ visit: visitId });
          if (session?.id) {
            callbacks.onViewConsultation({ id: session.id });
          } else {
            toast.error('No consultation session found for this visit.');
          }
        } catch {
          toast.error('Failed to load visit details.');
        }
      }}
      onViewConsultation={callbacks.onViewConsultation}
      onViewLab={callbacks.onViewLab}
      onViewImaging={callbacks.onViewImaging}
      onViewPrescription={callbacks.onViewPrescription}
      onViewVital={callbacks.onViewVital}
      onViewPhysio={callbacks.onViewPhysio}
      onViewEyeOrder={callbacks.onViewEyeOrder}
      onViewWard={callbacks.onViewWard}
      onViewReferral={(r) => r?.id != null && callbacks.onViewReferral(r)}
      onReferralUpdated={callbacks.onReferralUpdated}
      historyReloadToken={historyReloadToken}
    />
  );
}