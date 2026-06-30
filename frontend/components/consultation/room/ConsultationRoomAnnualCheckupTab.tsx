"use client";

import { TabsContent } from "@/components/ui/tabs";
import { AnnualCheckupPanel } from "@/components/consultation/AnnualCheckupPanel";
import type { ConsultationRoomPatient } from "@/lib/consultation/room-types";

type ConsultationRoomAnnualCheckupTabProps = {
  patient: ConsultationRoomPatient;
  sessionId: number | null;
  capabilities?: string[];
  isSuperuser?: boolean;
  onNavigateTab: (tab: string) => void;
  onPatientRecordUpdated: (updates: { bloodGroup?: string; genotype?: string }) => void;
};

export function ConsultationRoomAnnualCheckupTab({
  patient,
  sessionId,
  capabilities,
  isSuperuser,
  onNavigateTab,
  onPatientRecordUpdated,
}: ConsultationRoomAnnualCheckupTabProps) {
  if (patient.visitType !== "annual_checkup") {
    return null;
  }

  return (
    <TabsContent value="annual_checkup">
      <AnnualCheckupPanel
        visitId={patient.visitId}
        patientDbId={patient.id}
        patientBloodGroup={patient.bloodGroup}
        patientGenotype={patient.genotype}
        consultationSessionId={sessionId}
        capabilities={capabilities}
        isSuperuser={isSuperuser}
        onNavigateTab={onNavigateTab}
        onPatientRecordUpdated={({ bloodGroup, genotype }) => {
          onPatientRecordUpdated({ bloodGroup, genotype });
        }}
      />
    </TabsContent>
  );
}
