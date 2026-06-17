import { useCallback } from 'react';
import {
  mapClinicalOverviewToPatientHistory,
  medicalHistoryFormFromRecord,
  type ClinicalOverviewPayload,
  type PatientHistoryData,
} from '@/lib/clinical-overview-utils';
import { patientService } from '@/lib/services';
import { processVitals } from '@/lib/consultation/room-helpers';
import { toast } from 'sonner';
import type { ConsultationRoomPatient, WardAdmissionRow } from '@/lib/consultation/room-types';

type UseConsultationRoomPatientOverviewArgs = {
  setWardAdmissions: (rows: WardAdmissionRow[]) => void;
  setPatientHistorySnapshot: (snapshot: PatientHistoryData | null) => void;
  setMedicalHistory: (history: ReturnType<typeof medicalHistoryFormFromRecord>) => void;
  setCurrentPatient: React.Dispatch<React.SetStateAction<ConsultationRoomPatient | null>>;
};

export function useConsultationRoomPatientOverview({
  setWardAdmissions,
  setPatientHistorySnapshot,
  setMedicalHistory,
  setCurrentPatient,
}: UseConsultationRoomPatientOverviewArgs) {
  const applyPatientOverview = useCallback(
    (overview: ClinicalOverviewPayload) => {
      setWardAdmissions((overview.ward_admissions?.results || []) as WardAdmissionRow[]);
      setPatientHistorySnapshot(mapClinicalOverviewToPatientHistory(overview));
      setMedicalHistory(medicalHistoryFormFromRecord(overview.medical_history));
      const vitals = overview.vitals?.results || [];
      if (vitals.length > 0) {
        const sorted = [...vitals].sort(
          (a, b) =>
            new Date((b as { recorded_at?: string }).recorded_at || 0).getTime() -
            new Date((a as { recorded_at?: string }).recorded_at || 0).getTime(),
        );
        const latest = sorted[0] as Record<string, unknown>;
        setCurrentPatient((prevPatient) => {
          if (!prevPatient) return prevPatient;
          return { ...prevPatient, vitals: processVitals(latest) };
        });
      }
    },
    [setCurrentPatient, setMedicalHistory, setPatientHistorySnapshot, setWardAdmissions],
  );

  const loadPatientOverview = useCallback(
    async (patientId: number) => {
      if (!patientId) return;
      try {
        const overview = await patientService.getClinicalOverview(patientId);
        applyPatientOverview(overview);
      } catch (error) {
        console.error('Error loading patient overview:', error);
        toast.error('Could not load patient history (labs, vitals, referrals). Check your permissions or try again.');
        setWardAdmissions([]);
        setPatientHistorySnapshot(null);
      }
    },
    [applyPatientOverview, setPatientHistorySnapshot, setWardAdmissions],
  );

  return { applyPatientOverview, loadPatientOverview };
}
