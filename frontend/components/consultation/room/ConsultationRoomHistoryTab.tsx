"use client";

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { TabsContent } from '@/components/ui/tabs';
import { PatientHistoryTabs } from '@/components/patient-history/PatientHistoryTabs';
import { VisitDetailModal } from '@/components/shared/VisitDetailModal';
import type { PatientHistoryData } from '@/lib/clinical-overview-utils';
import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { Edit } from 'lucide-react';

export type ConsultationRoomHistoryTabProps = {
  currentPatient: ConsultationRoomPatient | null;
  patientHistorySnapshot: PatientHistoryData | null;
  historyReloadToken: number;
  onViewConsultation: (session: { id: number }) => void;
  onViewLab: (labResult: any) => void;
  onViewImaging: (img: any) => void;
  onViewPrescription: (prescription: any) => void;
  onViewVital: (vital: any) => void;
  onViewPhysio: (order: any) => void;
  onViewEyeOrder: (order: { id: number }) => void;
  onViewWard: (admission: any) => void;
  onIssueCertificate?: () => void;
  onViewReferral: (referral: { id?: number | null }) => void;
  onReferralUpdated: () => void;
  onEditMedicalHistory: () => void;
};

export function ConsultationRoomHistoryTab({
  currentPatient,
  patientHistorySnapshot,
  historyReloadToken,
  onViewConsultation,
  onViewLab,
  onViewImaging,
  onViewPrescription,
  onViewVital,
  onViewPhysio,
  onViewEyeOrder,
  onViewWard,
  onIssueCertificate,
  onViewReferral,
  onReferralUpdated,
  onEditMedicalHistory,
}: ConsultationRoomHistoryTabProps) {
  const [visitDetailOpen, setVisitDetailOpen] = useState(false);
  const [visitDetailData, setVisitDetailData] = useState<{ id: string; numericId?: number; visitId?: string } | null>(null);

  return (
    <TabsContent value="history">
      <div className="space-y-4">
        <PatientHistoryTabs
          patientId={currentPatient?.id ? Number(currentPatient.id) : 0}
          initialData={patientHistorySnapshot ?? undefined}
          defaultTab="background"
          showVisits
          showCertificates
          showDocuments
          allowDocumentActions={false}
          showReferrals
          showBackground
          onViewVisit={(v) => {
            if (v?.id) {
              setVisitDetailData({
                id: String(v.id),
                numericId: typeof v.id === 'number' ? v.id : undefined,
                visitId: v.visit_id || String(v.id),
              });
              setVisitDetailOpen(true);
            }
          }}
          onViewConsultation={onViewConsultation}
          onViewLab={onViewLab}
          onViewImaging={onViewImaging}
          onViewPrescription={onViewPrescription}
          onViewVital={onViewVital}
          onViewPhysio={onViewPhysio}
          onViewEyeOrder={onViewEyeOrder}
          onViewWard={onViewWard}
          onIssueCertificate={currentPatient ? onIssueCertificate : undefined}
          historyReloadToken={historyReloadToken}
          onViewReferral={(r) => r?.id != null && onViewReferral(r)}
          onReferralUpdated={onReferralUpdated}
          backgroundExtra={
            <div className="flex justify-end mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={onEditMedicalHistory}
                disabled={!currentPatient}
              >
                <Edit className="h-4 w-4 mr-2" />
                Edit Medical History
              </Button>
            </div>
          }
        />
        <VisitDetailModal
          visit={visitDetailData}
          isOpen={visitDetailOpen}
          onClose={() => {
            setVisitDetailOpen(false);
            setVisitDetailData(null);
          }}
        />
      </div>
    </TabsContent>
  );
}
