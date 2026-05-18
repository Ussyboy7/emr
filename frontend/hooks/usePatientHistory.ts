import { useEffect, useState, useCallback } from 'react';
import { patientService, consultationService, labService, radiologyService,
         pharmacyService, physioService, wardService, medicalCertificateService, referralService } from '@/lib/services';
import { eyeCareService } from '@/lib/services/eye-care-service';

export interface PatientHistoryData {
  consultations: any[];
  labResults: any[];
  imagingOrders: any[];
  prescriptions: any[];
  vitals: any[];
  physioOrders: any[];
  eyeOrders: any[];
  wardAdmissions: any[];
  certificates: any[];
  referrals: any[];
  medicalHistory: any;
  visits: any[];
}

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
  });
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (patientId == null) return;
    setLoading(true);
    try {
      const consultationsPromise = consultationService.getSessions({ patient: patientId }).catch(() => ({ results: [] }));
      const labPromise = labService.getCompletedTests({ patient: patientId.toString() }).catch(() => ({ results: [] }));
      const imagingPromise = radiologyService.getOrders({ patient: patientId.toString(), page_size: 200 }).catch(() => ({ results: [] }));
      const prescriptionsPromise = pharmacyService.getPrescriptions({ patient: patientId.toString() }).catch(() => ({ results: [] }));
      const vitalsPromise = patientService.getPatientVitals(patientId).catch(() => []);
      const physioPromise = physioService.getOrders({ patient: patientId.toString() }).catch(() => ({ results: [] }));
      const eyePromise = eyeCareService.getOrders({ patient: patientId }).catch(() => ({ results: [] }));
      const wardPromise = wardService.getAdmissions({ patient: patientId }).catch(() => ({ results: [] }));
      const certsPromise = medicalCertificateService.getCertificates({ patient: patientId.toString(), page_size: 200 }).catch(() => ({ results: [] }));
      const referralsPromise = referralService.getReferrals({ patient: patientId.toString(), page_size: 500 }).catch(() => ({ results: [] }));
      const historyPromise = patientService.getPatientHistory(patientId).catch(() => null);
      const visitsPromise = patientService.getPatientVisits(patientId).catch(() => []);

      const [
        consultationsRes, labRes, imagingRes, prescriptionsRes, vitalsRes,
        physioRes, eyeRes, wardRes, certsRes, referralsRes, historyRes, visitsRes,
      ] = await Promise.all([
        consultationsPromise, labPromise, imagingPromise, prescriptionsPromise, vitalsPromise,
        physioPromise, eyePromise, wardPromise, certsPromise, referralsPromise, historyPromise, visitsPromise,
      ]);

      // Process consultations into session rows for visits
      const consultationRows = (consultationsRes as any)?.results || [];
      const sessionRows = consultationRows.map((session: any) => {
        const startedAt = session?.started_at || '';
        const [datePart, timePartRaw] = startedAt.includes('T') ? startedAt.split('T') : [startedAt, ''];
        const timePart = timePartRaw ? String(timePartRaw).substring(0, 5) : '';
        return {
          id: `session-${session.id}`,
          visit_id: session.session_id || `session-${session.id}`,
          patient: session.patient,
          date: datePart || '',
          time: timePart || '',
          visit_type: 'Consultation',
          clinic: session.clinic_name || '',
          clinics: Array.isArray((session as any).visit_clinics) ? (session as any).visit_clinics : undefined,
          doctor_name: session.doctor_name || (session.doctor as any)?.name || '',
          clinical_notes: session.notes || '',
          status: session.status,
        };
      });

      // Merge visits + consultation sessions
      let combinedVisits: any[] = [];
      try {
        const list = Array.isArray(visitsRes) ? [...visitsRes] : [];
        combinedVisits = [...list, ...sessionRows];
        combinedVisits.sort((a, b) => {
          const dateA = String(a.date || '').split('T')[0];
          const dateB = String(b.date || '').split('T')[0];
          const timeA = String(a.time || '00:00:00');
          const timeB = String(b.time || '00:00:00');
          const ta = new Date(`${dateA}T${timeA}`).getTime();
          const tb = new Date(`${dateB}T${timeB}`).getTime();
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        });
      } catch {
        combinedVisits = [...sessionRows];
      }

      // Process imaging - flatten studies
      let imagingItems: any[] = [];
      try {
        imagingItems = ((imagingRes as any)?.results || []).flatMap((order: any) => {
          const studies = Array.isArray(order.studies) ? order.studies : [];
          return studies.map((study: any) => ({
            id: study?.id ?? `${order.id}-${study?.procedure ?? 'study'}`,
            order: order.id,
            order_id: order.order_id,
            patient: order.patient,
            patient_name: order.patient_name,
            patient_details: order.patient_details,
            created_at: study?.created_at ?? order.ordered_at,
            overall_status: null,
            priority: order.priority,
            order_details: {
              id: order.id,
              order_id: order.order_id,
              doctor: order.doctor,
              doctor_name: order.doctor_name,
              doctor_specialty: order.doctor_details?.specialty ?? '',
              doctor_details: order.doctor_details,
              clinic: order.clinic,
              clinical_notes: order.clinical_notes,
              patient_details: order.patient_details,
            },
            study_details: study,
          }));
        });
        imagingItems.sort((a: any, b: any) => {
          const aDate = new Date(a?.study_details?.verified_at || a?.study_details?.reported_at || a?.study_details?.created_at || a?.created_at || 0).getTime();
          const bDate = new Date(b?.study_details?.verified_at || b?.study_details?.reported_at || b?.study_details?.created_at || b?.created_at || 0).getTime();
          return bDate - aDate;
        });
      } catch {
        // ignore
      }

      // Process referrals - sort by date
      let refList: any[] = [];
      try {
        refList = [...((referralsRes as any)?.results || [])];
        refList.sort((a: any, b: any) => {
          const ta = new Date(a.referred_at || 0).getTime();
          const tb = new Date(b.referred_at || 0).getTime();
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        });
      } catch {
        // ignore
      }

      setData({
        consultations: consultationRows,
        labResults: (labRes as any)?.results || [],
        imagingOrders: imagingItems,
        prescriptions: (prescriptionsRes as any)?.results || [],
        vitals: (vitalsRes as any) || [],
        physioOrders: (physioRes as any)?.results || [],
        eyeOrders: (eyeRes as any)?.results || [],
        wardAdmissions: (wardRes as any)?.results || [],
        certificates: (certsRes as any)?.results || [],
        referrals: refList,
        medicalHistory: historyRes,
        visits: combinedVisits,
      });
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
