import { useEffect, useState, useCallback } from 'react';
import { patientService } from '@/lib/services';
import {
  mapClinicalOverviewToPatientHistory,
  type PatientHistoryData,
} from '@/lib/clinical-overview-utils';

export type { PatientHistoryData } from '@/lib/clinical-overview-utils';

interface UsePatientHistoryResult {
  data: PatientHistoryData;
  loading: boolean;
  reload: () => void;
}

export function usePatientHistory(patientId: number | null): UsePatientHistoryResult {
  const [data, setData] = useState<PatientHistoryData>({
    consultations: [],
    labResults: [],
    imagingOrders: [],
    prescriptions: [],
    vitals: [],
    physioOrders: [],
    eyeOrders: [],
    wardAdmissions: [],
    certificates: [],
    referrals: [],
    medicalHistory: null,
    visits: [],
    annualCheckups: [],
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (patientId == null) return;
    setLoading(true);
    try {
      const overview = await patientService.getClinicalOverview(patientId);
      setData(mapClinicalOverviewToPatientHistory(overview));
    } catch (err) {
      console.error('usePatientHistory: error loading data', err);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, loading, reload: load };
}
