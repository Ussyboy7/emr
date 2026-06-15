"use client";

import { ConsultationReportModal } from '@/components/consultation/ConsultationReportModal';
import { LabCompletedReportDialog } from '@/components/laboratory/LabCompletedReportDialog';
import {
  PrescriptionReportDialog,
  type PrescriptionReportData,
} from '@/components/pharmacy/PrescriptionReportDialog';
import { RadiologyCompletedReportDialog } from '@/components/radiology/RadiologyCompletedReportDialog';
import { VitalsDetailModal, type VitalsDetailModalProps } from '@/components/shared/VitalsDetailModal';
import type { ConsultationRoomPatient, VitalsData } from '@/lib/consultation/room-types';
import type { ConsultationReportSession } from '@/lib/consultation-report';
import type { CompletedTest as CompletedLabReportTest } from '@/lib/laboratory/completedLabReport';
import type { CompletedRadiologyReport } from '@/lib/radiology/completedRadiologyReport';

export type ConsultationRoomReportDialogsProps = {
  consultationReportSession: ConsultationReportSession | null;
  setConsultationReportSession: (session: ConsultationReportSession | null) => void;
  isConsultationReportLoading: boolean;
  showLabResultViewer: boolean;
  setShowLabResultViewer: (open: boolean) => void;
  selectedCompletedLabTest: CompletedLabReportTest | null;
  setSelectedCompletedLabTest: (test: CompletedLabReportTest | null) => void;
  showRadiologyReportViewer: boolean;
  setShowRadiologyReportViewer: (open: boolean) => void;
  selectedCompletedRadiologyReport: CompletedRadiologyReport | null;
  setSelectedCompletedRadiologyReport: (report: CompletedRadiologyReport | null) => void;
  showPrescriptionViewer: boolean;
  setShowPrescriptionViewer: (open: boolean) => void;
  selectedPrescription: PrescriptionReportData | null;
  setSelectedPrescription: (prescription: PrescriptionReportData | null) => void;
  currentPatient: ConsultationRoomPatient | null;
  isVitalsDetailModalOpen: boolean;
  setIsVitalsDetailModalOpen: (open: boolean) => void;
  selectedVital: VitalsData | null;
};

export function ConsultationRoomReportDialogs({
  consultationReportSession,
  setConsultationReportSession,
  isConsultationReportLoading,
  showLabResultViewer,
  setShowLabResultViewer,
  selectedCompletedLabTest,
  setSelectedCompletedLabTest,
  showRadiologyReportViewer,
  setShowRadiologyReportViewer,
  selectedCompletedRadiologyReport,
  setSelectedCompletedRadiologyReport,
  showPrescriptionViewer,
  setShowPrescriptionViewer,
  selectedPrescription,
  setSelectedPrescription,
  currentPatient,
  isVitalsDetailModalOpen,
  setIsVitalsDetailModalOpen,
  selectedVital,
}: ConsultationRoomReportDialogsProps) {
  return (
    <>
      <ConsultationReportModal
        open={consultationReportSession !== null}
        onOpenChange={(o) => {
          if (!o) setConsultationReportSession(null);
        }}
        session={consultationReportSession}
        loading={isConsultationReportLoading}
      />

      <LabCompletedReportDialog
        open={showLabResultViewer}
        onOpenChange={(o) => {
          setShowLabResultViewer(o);
          if (!o) setSelectedCompletedLabTest(null);
        }}
        test={selectedCompletedLabTest}
        hideLabWorkflowActions
      />

      <RadiologyCompletedReportDialog
        open={showRadiologyReportViewer}
        onOpenChange={(o) => {
          setShowRadiologyReportViewer(o);
          if (!o) setSelectedCompletedRadiologyReport(null);
        }}
        report={selectedCompletedRadiologyReport}
      />

      <PrescriptionReportDialog
        open={showPrescriptionViewer}
        onOpenChange={(o) => {
          setShowPrescriptionViewer(o);
          if (!o) setSelectedPrescription(null);
        }}
        prescription={selectedPrescription}
        prescriptionDbId={selectedPrescription?.id ?? null}
        patient={
          currentPatient
            ? {
                name: currentPatient.name || '',
                patientId: currentPatient.patientId || '',
                age: currentPatient.age,
                gender: currentPatient.gender,
              }
            : null
        }
      />

      <VitalsDetailModal
        isOpen={isVitalsDetailModalOpen}
        onClose={() => setIsVitalsDetailModalOpen(false)}
        vitals={selectedVital as VitalsDetailModalProps['vitals']}
        patientName={currentPatient?.name || 'Patient'}
        patientId={currentPatient?.patientId}
      />
    </>
  );
}
