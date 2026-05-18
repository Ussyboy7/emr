"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  ArrowLeft, Download, Printer, Eye, User, Calendar, Clock, Stethoscope,
  TestTube, ScanLine, Pill, Heart, Activity, Building2, ClipboardList,
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, FileText, Pencil, Share2,
} from "lucide-react";
import { patientService, consultationService, labService, radiologyService,
         pharmacyService, physioService, wardService, medicalCertificateService, referralService, eyeCareService, type Patient, type Visit } from '@/lib/services';
import type { Referral } from '@/lib/services/referral-service';
import { apiFetch } from '@/lib/api-client';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { useCurrentUser } from '@/hooks/use-current-user';
import {
  WardDoctorOrdersSection,
  userCanAddWardDoctorOrders,
  userCanEditCancelWardOrders,
} from '@/components/ward/WardDoctorOrdersSection';
import type { PatientAdmission } from '@/lib/services/ward-service';
import { isAuthenticationError } from '@/lib/auth-errors';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { VitalsDetailModal } from '@/components/shared/VitalsDetailModal';
import { ConsultationReportModal } from '@/components/consultation/ConsultationReportModal';
import { loadConsultationReportSession, type ConsultationReportSession } from '@/lib/consultation-report';
import { LabCompletedReportDialog } from '@/components/laboratory/LabCompletedReportDialog';
import { RadiologyCompletedReportDialog } from '@/components/radiology/RadiologyCompletedReportDialog';
import { PrescriptionReportDialog } from '@/components/pharmacy/PrescriptionReportDialog';
import { VisitDetailModal } from '@/components/shared/VisitDetailModal';
import { ViewEyeOrderModal } from '@/components/eyecare/ViewEyeOrderModal';
import { PatientHistoryTabs } from '@/components/patient-history/PatientHistoryTabs';
import { transformApiRowToCompletedTest, type CompletedTest } from '@/lib/laboratory/completedLabReport';
import { transformApiRadiologyReportToCompleted, type CompletedRadiologyReport } from '@/lib/radiology/completedRadiologyReport';
import { getVisitServiceClinicsDisplay, joinDisplayParts } from '@/lib/utils/clinic-utils';
import { getOrganizationServicesHeader } from '@/lib/constants/organization';

// Utility functions
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleDateString();
  } catch {
    return '';
  }
};

const formatTime = (dateString: string | undefined): string => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return '';
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  } catch {
    return '';
  }
};

const escapeHtml = (value: string) => {
  return String(value ?? '')
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
};

const purposeLabelMap: Record<string, string> = {
  fitness: "FITNESS FOR DUTY",
  illness: "UNFIT FOR WORK",
  travel: "FIT TO TRAVEL",
  employment: "FIT FOR EMPLOYMENT",
};

const patientCategoryLabelMap: Record<string, string> = {
  employee: "Employee",
  retiree: "Retiree",
  dependent: "Dependent",
  nonnpa: "Non-NPA",
};

const buildMedicalCertificateHtmlFromRecord = (cert: any) => {
  const purposeLabel = purposeLabelMap[cert?.purpose] ?? String(cert?.purpose ?? "");
  const patientCategoryLabel = patientCategoryLabelMap[cert?.patient_category_snapshot] ?? (cert?.patient_category_snapshot ?? "");

  const validFrom = formatDate(cert?.valid_from);
  const validTo = formatDate(cert?.valid_to);
  const issueDate = formatDate(cert?.issued_at);

  const findings = (cert?.findings ?? "").trim();
  const recommendations = (cert?.recommendations ?? "").trim();

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>${escapeHtml(purposeLabel)} - ${escapeHtml(cert?.certificate_number ?? "")}</title>
  <style>
    @page { size: A4; margin: 18mm; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; line-height: 1.4; }
    .title { text-align: center; font-weight: 700; font-size: 20px; margin-bottom: 8px; }
    .subtle { color: #333; font-size: 12px; }
    .block { margin-top: 10px; }
    .row { display: flex; justify-content: space-between; gap: 16px; }
    .kv { width: 50%; }
    .label { font-weight: 700; }
    .content { margin-top: 14px; font-size: 14px; white-space: pre-wrap; }
    .signature { margin-top: 28px; display: flex; justify-content: flex-end; }
    .sig-line { border-top: 1px solid #111; width: 240px; padding-top: 6px; text-align: left; }
  </style>
</head>
<body>
  <div class="title">MEDICAL CERTIFICATE</div>
  <div class="subtle" style="text-align:center;">Certificate No: ${escapeHtml(cert?.certificate_number ?? "")} &nbsp; | &nbsp; Issued: ${escapeHtml(issueDate)}</div>

  <div class="block">
    <div class="row">
      <div class="kv">
        <div><span class="label">Patient Name:</span> ${escapeHtml(cert?.patient_name_snapshot ?? cert?.patient_name ?? "")}</div>
        <div><span class="label">Patient ID:</span> ${escapeHtml(cert?.patient_id_snapshot ?? "")}</div>
      </div>
      <div class="kv">
        <div><span class="label">Category:</span> ${escapeHtml(patientCategoryLabel)}</div>
        <div><span class="label">Type:</span> ${escapeHtml(purposeLabel)}</div>
      </div>
    </div>

    <div class="content">
      This is to certify that <strong>${escapeHtml(cert?.patient_name_snapshot ?? cert?.patient_name ?? "")}</strong> is ${escapeHtml(
        purposeLabel.toLowerCase(),
      )}.
      ${
        validFrom && validTo
          ? `The certificate is valid from ${escapeHtml(validFrom)} to ${escapeHtml(validTo)}.`
          : ""
      }
      ${
        cert?.purpose === "illness" &&
        cert?.sick_leave_days != null &&
        Number(cert.sick_leave_days) >= 1
          ? `\n\nNumber of sick leave days (calendar): ${escapeHtml(String(cert.sick_leave_days))}.`
          : ""
      }
      ${
        findings
          ? `\n\nClinical findings:\n${escapeHtml(findings)}`
          : ""
      }
      ${
        recommendations
          ? `\n\nRecommendations:\n${escapeHtml(recommendations)}`
          : ""
      }
    </div>
  </div>

  <div class="signature">
    <div class="sig-line">
      <div><strong>${escapeHtml(cert?.doctor_name_snapshot ?? cert?.issued_by_name ?? "")}</strong></div>
      <div class="subtle">Doctor</div>
    </div>
  </div>
</body>
</html>`;
};

const openPrintWindow = (title: string, html: string) => {
  const popup = window.open("", "_blank", "width=900,height=1000");
  if (!popup) {
    throw new Error("Allow popups to print documents.");
  }
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  popup.document.title = title;
  popup.focus();
  popup.print();
};

const formatPriority = (p: string | undefined): string => {
  if (p == null || p === '') return '';
  const s = String(p).toLowerCase();
  if (s === 'stat') return 'STAT';
  if (s === 'urgent') return 'Urgent';
  if (s === 'routine') return 'Routine';
  return String(p);
};

const formatVitalDisplay = (key: string, value: unknown): string => {
  if (value == null || value === '') return '';
  if (key === 'recordedAt' || key === 'recorded_at' || (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)))
    return formatDate(String(value)) + ' ' + formatTime(String(value));
  return String(value);
};

const vitalLabel = (key: string): string => {
  if (key === 'recordedAt' || key === 'recorded_at') return 'Recorded at';
  return key.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase());
};

const getOverallStatusBadge = (status: string) => {
  switch (status) {
    case 'Critical': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
    case 'Abnormal': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
    default: return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
  }
};

const getResultStatusColor = (status: string) => {
  switch (status) {
    case 'Critical': return 'text-rose-600 dark:text-rose-400 font-bold';
    case 'Abnormal': return 'text-amber-600 dark:text-amber-400 font-medium';
    default: return 'text-foreground';
  }
};

const humanizeStatus = (value: unknown): string => {
  const s = String(value ?? '').trim();
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
};

const getImagingBadgeClass = (label: string) => {
  if (label === 'Critical') return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
  if (label === 'Abnormal') return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
  if (label === 'Normal') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
  if (label === 'Verified') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
  if (label === 'Reported') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
  if (label === 'Pending') return 'bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-500/50';
  if (label === 'Admitted') return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
  if (label === 'Discharged') return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
  if (label === 'Transferred') return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/50';
  return 'bg-muted/40 text-muted-foreground border-border/60';
};

export default function PatientMedicalRecordsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const patientId = resolvedParams.patientId;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const { currentUser } = useCurrentUser();

  // Consultation Report state (shared modal used by View Report)
  const [selectedSession, setSelectedSession] = useState<ConsultationReportSession | null>(null);
  const [showConsultationReport, setShowConsultationReport] = useState(false);
  const [loadingReport, setLoadingReport] = useState(false);

  // Prescription view dialog
  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [showPrescriptionView, setShowPrescriptionView] = useState(false);

  // Vitals view (VitalsDetailModal)
  const [selectedVital, setSelectedVital] = useState<any>(null);
  const [isVitalsDetailModalOpen, setIsVitalsDetailModalOpen] = useState(false);

  // Lab / Imaging / Physio / Ward view dialogs
  const [selectedLabReport, setSelectedLabReport] = useState<CompletedTest | null>(null);
  const [selectedImaging, setSelectedImaging] = useState<any>(null);
  const [selectedImagingReport, setSelectedImagingReport] = useState<CompletedRadiologyReport | null>(null);
  const [selectedPhysio, setSelectedPhysio] = useState<any>(null);
  const [selectedPhysioSessions, setSelectedPhysioSessions] = useState<any[]>([]);
  const [selectedPhysioSession, setSelectedPhysioSession] = useState<any>(null);
  const [loadingPhysioSessions, setLoadingPhysioSessions] = useState(false);
  const [selectedWard, setSelectedWard] = useState<any>(null);

  const [selectedVisitForModal, setSelectedVisitForModal] = useState<{
    id: string;
    numericId: number;
    visitId?: string;
    patientId: string;
    date: string;
    time: string;
    type: string;
    department: string;
    doctor: string;
    diagnosis: string;
    status: string;
    notes?: string;
  } | null>(null);
  const [isVisitDetailModalOpen, setIsVisitDetailModalOpen] = useState(false);

  // History data
  const [visitHistory, setVisitHistory] = useState<any[]>([]);
  const [referralHistory, setReferralHistory] = useState<Referral[]>([]);
  const [isCreatingTestReferral, setIsCreatingTestReferral] = useState(false);
  const [consultationHistory, setConsultationHistory] = useState<any[]>([]);
  const [labHistory, setLabHistory] = useState<any[]>([]);
  const [imagingHistory, setImagingHistory] = useState<any[]>([]);
  const [prescriptionHistory, setPrescriptionHistory] = useState<any[]>([]);
  const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
  const [physioHistory, setPhysioHistory] = useState<any[]>([]);
  const [eyeHistory, setEyeHistory] = useState<any[]>([]);
  const [selectedEyeOrderId, setSelectedEyeOrderId] = useState<number | undefined>(undefined);
  const [showEyeOrderModal, setShowEyeOrderModal] = useState(false);
  const [wardAdmissions, setWardAdmissions] = useState<any[]>([]);
  const [certificateHistory, setCertificateHistory] = useState<any[]>([]);
  const [medicalHistory, setMedicalHistory] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Pagination
  const [consultationsPage, setConsultationsPage] = useState(1);
  const [consultationsPerPage, setConsultationsPerPage] = useState(10);

  // Load patient data — supports DB pk, numeric-looking patient_id, and alphanumeric patient_id
  useEffect(() => {
    const loadPatient = async () => {
      const raw = (patientId || '').trim();
      if (!raw) {
        setLoading(false);
        return;
      }

      const resolveFromSearch = async (query: string) => {
        const searchResult = await patientService.getPatients({ search: query });
        const list = searchResult.results || [];
        const q = query;
        const qu = q.toUpperCase();
        return (
          list.find((p) => p.patient_id === q) ||
          list.find((p) => p.patient_id && p.patient_id.toUpperCase() === qu) ||
          list.find((p) => String(p.id) === q) ||
          null
        );
      };

      try {
        setLoading(true);
        setError(null);
        let numericId: number;
        let patientData: Patient;

        const allDigits = /^\d+$/.test(raw);

        if (!allDigits) {
          const matchedPatient = await resolveFromSearch(raw);
          if (!matchedPatient) {
            throw new Error(`Patient with ID "${raw}" not found`);
          }
          numericId = matchedPatient.id;
          patientData = await patientService.getPatient(numericId);
        } else {
          const parsedId = parseInt(raw, 10);
          if (!Number.isFinite(parsedId) || parsedId <= 0) {
            throw new Error(`Patient with ID "${raw}" not found`);
          }
          try {
            patientData = await patientService.getPatient(parsedId);
            numericId = patientData.id;
          } catch (e: any) {
            const is404 = e?.status === 404;
            if (!is404) throw e;
            // Digits in the URL may be a human patient_id (e.g. "10042"), not the DB pk
            const matchedPatient = await resolveFromSearch(raw);
            if (!matchedPatient) throw e;
            numericId = matchedPatient.id;
            patientData = await patientService.getPatient(numericId);
          }
        }

        setPatient(patientData);
        await loadPatientHistory(numericId);
      } catch (err: any) {
        const status = err?.status as number | undefined;
        const msg = String(err?.message || err?.apiMessage || '');
        const notFound =
          status === 404 ||
          /no patient matches|not found/i.test(msg);

        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else if (notFound) {
          setError(
            'This patient could not be found. The ID may be wrong, the record may have been removed, or you may not have access.'
          );
        } else {
          console.error('Error loading patient:', err);
          setError(msg || 'Failed to load patient data');
        }
      } finally {
        setLoading(false);
      }
    };

    loadPatient();
  }, [patientId]);

  // Load patient history (numericPatientId = patient DB primary key, not human patient_id string)
  const loadPatientHistory = async (numericPatientId: number) => {
    setLoadingHistory(true);
    try {
      // Load consultations first (needed for sessionRows mapping)
      const consultations = await consultationService.getSessions({ patient: numericPatientId });
      const consultationRows = consultations.results || [];
      setConsultationHistory(consultationRows);

      const sessionRows = consultationRows.map((session: any) => {
        const startedAt = session?.started_at || '';
        const [datePart, timePartRaw] = startedAt.includes('T')
          ? startedAt.split('T')
          : [startedAt, ''];
        const timePart = timePartRaw ? String(timePartRaw).substring(0, 5) : '';

        return {
          id: `session-${session.id}`,
          visit_id: session.session_id || `session-${session.id}`,
          patient: session.patient,
          date: datePart || '',
          time: timePart || '',
          visit_type: 'Consultation',
          clinic: session.clinic_name || '',
          clinics: Array.isArray((session as any).visit_clinics)
            ? (session as any).visit_clinics
            : undefined,
          doctor_name: session.doctor_name || (session.doctor as any)?.name || '',
          clinical_notes: session.notes || '',
          status: session.status,
        };
      });

      // All remaining calls only depend on numericPatientId — fire in parallel
      const [
        visitsResp,
        referralsRes,
        labResults,
        imagingOrders,
        prescriptions,
        vitals,
        physioOrders,
        eyeOrders,
        admissions,
        certificates,
        history,
      ] = await Promise.all([
        patientService.getPatientVisits(numericPatientId).catch(() => []),
        referralService.getReferrals({ patient: numericPatientId.toString(), page_size: 500 }).catch(() => ({ results: [] })),
        labService.getCompletedTests({ patient: numericPatientId.toString() }).catch(() => ({ results: [] })),
        radiologyService.getOrders({ patient: numericPatientId.toString(), page_size: 200 }).catch(() => ({ results: [] })),
        pharmacyService.getPrescriptions({ patient: numericPatientId.toString() }).catch(() => ({ results: [] })),
        patientService.getPatientVitals(numericPatientId).catch(() => []),
        physioService.getOrders({ patient: numericPatientId.toString() }).catch(() => ({ results: [] })),
        eyeCareService.getOrders({ patient: Number(numericPatientId) }).catch(() => ({ results: [] })),
        wardService.getAdmissions({ patient: numericPatientId }).catch(() => ({ results: [] })),
        medicalCertificateService.getCertificates({ patient: numericPatientId.toString(), page_size: 200 }).catch(() => ({ results: [] })),
        patientService.getPatientHistory(numericPatientId).catch(() => null),
      ]);

      // Process visits
      try {
        const list = Array.isArray(visitsResp) ? [...visitsResp] : [];
        const combined = [...list, ...sessionRows];
        combined.sort((a, b) => {
          const dateA = String(a.date || '').split('T')[0];
          const dateB = String(b.date || '').split('T')[0];
          const timeA = String(a.time || '00:00:00');
          const timeB = String(b.time || '00:00:00');
          const ta = new Date(`${dateA}T${timeA}`).getTime();
          const tb = new Date(`${dateB}T${timeB}`).getTime();
          const safeTa = Number.isFinite(ta) ? ta : 0;
          const safeTb = Number.isFinite(tb) ? tb : 0;
          return safeTb - safeTa;
        });
        setVisitHistory(combined);
      } catch (err) {
        console.warn('Could not load visits:', err);
        setVisitHistory([...sessionRows]);
      }

      // Process referrals
      try {
        const refList = [...((referralsRes as any)?.results || [])];
        refList.sort((a: any, b: any) => {
          const ta = new Date(a.referred_at || 0).getTime();
          const tb = new Date(b.referred_at || 0).getTime();
          return (Number.isFinite(tb) ? tb : 0) - (Number.isFinite(ta) ? ta : 0);
        });
        setReferralHistory(refList);
      } catch (err) {
        console.warn('Could not load referrals:', err);
        setReferralHistory([]);
      }

      setLabHistory((labResults as any)?.results || []);
      setPrescriptionHistory((prescriptions as any)?.results || []);
      setVitalsHistory((vitals as any) || []);
      setWardAdmissions((admissions as any)?.results || []);
      setMedicalHistory(history);

      // Process imaging
      try {
        const items = ((imagingOrders as any)?.results || []).flatMap((order: any) => {
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
        items.sort((a: any, b: any) => {
          const aDate = new Date(a?.study_details?.verified_at || a?.study_details?.reported_at || a?.study_details?.created_at || a?.created_at || 0).getTime();
          const bDate = new Date(b?.study_details?.verified_at || b?.study_details?.reported_at || b?.study_details?.created_at || b?.created_at || 0).getTime();
          return bDate - aDate;
        });
        setImagingHistory(items);
      } catch (err) {
        console.warn('Could not load imaging history:', err);
        setImagingHistory([]);
      }

      // Process physio
      try {
        setPhysioHistory((physioOrders as any)?.results || []);
      } catch (err) {
        console.warn('Could not load physio history:', err);
        setPhysioHistory([]);
      }
      // Process eye
      try {
        setEyeHistory((eyeOrders as any)?.results || []);
      } catch (err) {
        console.warn('Could not load eye history:', err);
        setEyeHistory([]);
      }
    
      // Process certificates
      try {
        setCertificateHistory((certificates as any)?.results || []);
      } catch (err) {
        console.warn('Could not load medical certificates:', err);
        setCertificateHistory([]);
      }
    } catch (err) {
      console.error('Error loading patient history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  const handlePrintMedicalCertificate = (cert: any) => {
    try {
      openPrintWindow(`Medical Certificate - ${cert?.certificate_number ?? ''}`, buildMedicalCertificateHtmlFromRecord(cert));
    } catch (e: any) {
      toast.error(e?.message || "Allow popups to print documents.");
    }
  };

  // View consultation report (shared Consultation Report modal)
  const viewSessionDetails = async (session: any) => {
    try {
      setLoadingReport(true);
      setSelectedSession(null);
      setShowConsultationReport(true);
      const fullSession = await loadConsultationReportSession(session.id);
      setSelectedSession(fullSession);
    } catch (err: any) {
      console.error('Error loading session details:', err);
      toast.error('Failed to load consultation details');
      setShowConsultationReport(false);
    } finally {
      setLoadingReport(false);
    }
  };

  const openPhysioDetail = async (order: any) => {
    setSelectedPhysio(order);
    setSelectedPhysioSession(null);
    setSelectedPhysioSessions([]);
    setLoadingPhysioSessions(true);
    try {
      const sessions = await physioService.getSessions({ order: order.id });
      const list = Array.isArray(sessions) ? sessions : (sessions as any)?.results ?? [];
      setSelectedPhysioSessions(list);
      if (list.length > 0) {
        setSelectedPhysioSession(list[0]);
      }
    } catch {
      setSelectedPhysioSessions([]);
    } finally {
      setLoadingPhysioSessions(false);
    }
  };

  const openVisitDetail = (v: any) => {
    const clinics = getVisitServiceClinicsDisplay({ clinic: v.clinic, clinics: v.clinics });
    const rawId = v?.id;
    const numericId =
      typeof rawId === 'number'
        ? rawId
        : typeof rawId === 'string' && rawId.startsWith('session-')
          ? Number(rawId.replace('session-', ''))
          : Number(rawId);
    setSelectedVisitForModal({
      id: String(v.id),
      numericId: Number.isFinite(numericId) ? numericId : 0,
      visitId: v.visit_id ?? undefined,
      patientId: String(patient?.id ?? v.patient),
      date: v.date || '',
      time: v.time || '',
      type: v.visit_type || 'OPD',
      department: clinics || '—',
      doctor: (v.doctor_name ?? '').trim() || '—',
      diagnosis: '',
      status: v.status || '',
      notes: v.clinical_notes || '',
    });
    setIsVisitDetailModalOpen(true);
  };

  const handleCreateTestReferral = async () => {
    if (!patient?.id) return;
    setIsCreatingTestReferral(true);
    try {
      await referralService.createReferral({
        patient: patient.id,
        specialty: "Test Referral",
        facility: "Test Facility",
        facility_type: "internal",
        urgency: "routine",
        reason: `Test referral for patient ${patient.patient_id}`,
        clinical_summary: "Generated by test button on Patient Medical Records page.",
      });

      // Refresh the chart so the new referral appears immediately.
      void loadPatientHistory(patient.id);
    } catch (err: any) {
      toast.error(err?.message || "Failed to create test referral");
    } finally {
      setIsCreatingTestReferral(false);
    }
  };

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <Card>
            <CardContent className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Loading patient records...</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !patient) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 dark:text-red-400">{error || 'Patient not found'}</p>
              </div>
              <Button variant="outline" className="mt-4" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4 mr-2" />Go Back
              </Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  const paginatedConsultations = consultationHistory.slice(
    (consultationsPage - 1) * consultationsPerPage,
    consultationsPage * consultationsPerPage
  );
  const totalConsultationPages = Math.ceil(consultationHistory.length / consultationsPerPage);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="sm" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4 mr-2" />Back
            </Button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Patient Medical Records</h1>
              <p className="text-muted-foreground mt-1">Complete medical history and consultation records</p>
            </div>
          </div>
        </div>

        {/* Patient Information */}
        <Card>
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row items-start gap-6">
              <PatientAvatar name={patient.full_name ?? ''} photoUrl={patient.photo} size="lg" />
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{patient.full_name ?? ''}</h2>
                <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient ID</p>
                    <p className="font-semibold text-blue-600">{patient.patient_id}</p>
                  </div>
                  {patient.age != null && (
                    <div>
                      <p className="text-xs text-muted-foreground">Age</p>
                      <p className="font-medium">{patient.age} years</p>
                    </div>
                  )}
                  {(patient.gender === 'male' || patient.gender === 'female' || (patient.gender && String(patient.gender).trim())) && (
                    <div>
                      <p className="text-xs text-muted-foreground">Gender</p>
                      <p className="font-medium">
                        {patient.gender === 'male' ? 'Male' : patient.gender === 'female' ? 'Female' : patient.gender}
                      </p>
                    </div>
                  )}
                  <div>
                    <p className="text-xs text-muted-foreground">Category</p>
                    <Badge className={`text-xs ${
                      patient.category === 'employee' ? 'bg-blue-100 text-blue-800' :
                      patient.category === 'retiree' ? 'bg-amber-100 text-amber-800' :
                      patient.category === 'dependent' ? 'bg-violet-100 text-violet-800' :
                      'bg-emerald-100 text-emerald-800'
                    }`}>
                      {patient.category === 'employee' ? 'Employee' :
                       patient.category === 'retiree' ? 'Retiree' :
                       patient.category === 'dependent' ? 'Dependent' :
                       patient.category === 'nonnpa' ? 'NonNPA' : patient.category}
                    </Badge>
                  </div>
                  {patient.blood_group && (
                    <div>
                      <p className="text-xs text-muted-foreground">Blood Group</p>
                      <p className="font-medium">{patient.blood_group}</p>
                    </div>
                  )}
                  {patient.genotype && (
                    <div>
                      <p className="text-xs text-muted-foreground">Genotype</p>
                      <p className="font-medium">{patient.genotype}</p>
                    </div>
                  )}
                  {patient.phone && (
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium">{patient.phone}</p>
                    </div>
                  )}
                  {patient.email && (
                    <div>
                      <p className="text-xs text-muted-foreground">Email</p>
                      <p className="font-medium truncate">{patient.email}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <ConsultationReportModal
          open={showConsultationReport}
          onOpenChange={setShowConsultationReport}
          session={selectedSession}
          loading={loadingReport}
        />
        <VisitDetailModal
          visit={selectedVisitForModal}
          visitId={selectedVisitForModal?.id}
          isOpen={isVisitDetailModalOpen}
          onClose={() => {
            setIsVisitDetailModalOpen(false);
            setSelectedVisitForModal(null);
          }}
          onVisitUpdated={() => {
            if (patient?.id) void loadPatientHistory(patient.id);
          }}
        />
        <PrescriptionReportDialog
          open={showPrescriptionView}
          onOpenChange={(o) => {
            setShowPrescriptionView(o);
            if (!o) setSelectedPrescription(null);
          }}
          prescription={selectedPrescription ? {
            ...selectedPrescription,
            clinic: selectedPrescription.clinic || (selectedPrescription as any)?.visit_details?.clinic || '',
            doctor_name: selectedPrescription.doctor_name || '',
            prescription_id: selectedPrescription.prescription_id || selectedPrescription.id,
            dispensed_by_name: selectedPrescription.dispensed_by_name || (selectedPrescription as any)?.dispensed_by_name || '',
          } : null}
          prescriptionDbId={selectedPrescription?.id ?? null}
          patient={
            selectedPrescription && patient
              ? {
                  name: selectedPrescription.patient_name ||
                        selectedPrescription.patient_details?.name ||
                        patient.full_name ||
                        '',
                  patientId: patient.patient_id || selectedPrescription.patient_details?.patient_id || '',
                  age: selectedPrescription.patient_details?.age ?? (patient as any)?.age ?? null,
                  gender: selectedPrescription.patient_details?.gender ?? (patient as any)?.gender ?? '',
                }
              : null
          }
        />

        <VitalsDetailModal
          vitals={selectedVital}
          patientName={patient?.full_name ?? ''}
          patientId={patient?.patient_id}
          isOpen={isVitalsDetailModalOpen}
          onClose={() => { setIsVitalsDetailModalOpen(false); setSelectedVital(null); }}
        />

        <LabCompletedReportDialog
          open={!!selectedLabReport}
          onOpenChange={(open) => { if (!open) setSelectedLabReport(null); }}
          test={selectedLabReport}
          hideLabWorkflowActions
        />

        {/* Imaging View Dialog */}
        <RadiologyCompletedReportDialog
          open={!!selectedImagingReport}
          onOpenChange={(open) => { if (!open) setSelectedImagingReport(null); }}
          report={selectedImagingReport}
        />

        {/* Physio View Dialog - Full Session Report */}
        <Dialog open={!!selectedPhysio} onOpenChange={(open) => { 
          if (!open) {
            setSelectedPhysio(null);
            setSelectedPhysioSessions([]);
            setSelectedPhysioSession(null);
          }
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Physiotherapy Session Report
              </DialogTitle>
              {selectedPhysio && (
                <DialogDescription>
                  {selectedPhysioSession
                    ? joinDisplayParts([
                        selectedPhysioSession.patient_name || patient?.full_name || '',
                        selectedPhysioSession.id != null
                          ? `PHY-${String(selectedPhysioSession.id).padStart(6, '0')}`
                          : '',
                        selectedPhysioSession.session_number != null
                          ? `Session ${selectedPhysioSession.session_number}`
                          : '',
                      ])
                    : joinDisplayParts([
                        selectedPhysio.id != null ? `PHY-${String(selectedPhysio.id).padStart(6, '0')}` : '',
                        formatDate(selectedPhysio.ordered_at),
                      ])}
                </DialogDescription>
              )}
            </DialogHeader>
            {loadingPhysioSessions ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <p className="ml-3 text-sm text-muted-foreground">Loading session details...</p>
              </div>
            ) : selectedPhysio && selectedPhysioSession ? (
              <>
                {/* Session Selector */}
                {selectedPhysioSessions.length > 1 && (
                  <div className="mb-4">
                    <Label className="text-sm font-medium mb-2 block">Select Session</Label>
                    <Select
                      value={String(selectedPhysioSession.id ?? '')}
                      onValueChange={(value) => {
                        const session = selectedPhysioSessions.find(s => String(s.id) === value);
                        if (session) setSelectedPhysioSession(session);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select session" />
                      </SelectTrigger>
                      <SelectContent>
                        {selectedPhysioSessions.map((s, idx) => (
                          <SelectItem key={s.id ?? `s-${idx}`} value={String(s.id ?? '')}>
                            {joinDisplayParts([
                              s.session_number != null ? `Session ${s.session_number}` : '',
                              s.status === 'completed' ? '(Completed)' : '',
                              s.scheduled_at
                                ? new Date(s.scheduled_at).toLocaleString()
                                : s.id != null
                                  ? `PHY-${String(s.id).padStart(6, '0')}`
                                  : '',
                            ])}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {(() => {
                  const handlePrint = () => {
                    try {
                      const content = document.getElementById('physio-report-print-root');
                      if (!content) return;
                      const w = window.open('', '_blank', 'noopener,noreferrer');
                      if (!w) return;
                      w.document.open();
                      w.document.write(`
                        <html>
                          <head>
                            <title>Physiotherapy Session Report</title>
                            <style>
                              body { font-family: Arial, sans-serif; margin: 24px; }
                              table { width: 100%; border-collapse: collapse; }
                              th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; vertical-align: top; }
                              th { background: #f5f5f5; text-align: left; }
                              h2 { margin: 0 0 4px 0; }
                            </style>
                          </head>
                          <body>${content.innerHTML}</body>
                        </html>
                      `);
                      w.document.close();
                      w.focus();
                      w.print();
                    } catch {
                      toast.error('Unable to print physiotherapy report');
                    }
                  };

                  const handleDownloadPdf = () => {
                    handlePrint();
                  };

                  return (
                    <div className="flex items-center justify-end gap-2 mb-4">
                      <Button variant="outline" size="sm" onClick={handlePrint}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                      <Button variant="outline" size="sm" onClick={handleDownloadPdf}>
                        <Download className="h-4 w-4 mr-1" />
                        Download PDF
                      </Button>
                    </div>
                  );
                })()}

                <div className="space-y-6">
                  <div id="physio-report-print-root">
                  {/* Report Header */}
                  <div className="border-b pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold text-blue-700">PHYSIOTHERAPY SESSION REPORT</h2>
                        <p className="text-sm text-muted-foreground">{getOrganizationServicesHeader()}</p>
                      </div>
                    </div>

                    {/* Patient & Session Info */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Patient Information</h3>
                        <div className="space-y-1">
                          <p><span className="font-medium">Name:</span> {selectedPhysioSession.patient_name || patient?.full_name || ''}</p>
                          {(selectedPhysioSession.patient_id || patient?.patient_id) && (
                            <p><span className="font-medium">ID:</span> {selectedPhysioSession.patient_id || patient?.patient_id}</p>
                          )}
                          {selectedPhysioSession.physiotherapist_name && (
                            <p><span className="font-medium">Physiotherapist:</span> {selectedPhysioSession.physiotherapist_name}</p>
                          )}
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Session Details</h3>
                        <div className="space-y-1">
                          {selectedPhysioSession.session_number != null && (
                            <p><span className="font-medium">Session:</span> {selectedPhysioSession.session_number}</p>
                          )}
                          {selectedPhysioSession.scheduled_at && (
                            <p><span className="font-medium">Scheduled:</span> {new Date(selectedPhysioSession.scheduled_at).toLocaleString()}</p>
                          )}
                          {selectedPhysioSession.completed_at && (
                            <p><span className="font-medium">Completed:</span> {new Date(selectedPhysioSession.completed_at).toLocaleString()}</p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Diagnosis */}
                    {selectedPhysioSession.order_details?.diagnosis && (
                      <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                        <p className="text-sm font-medium text-amber-800 dark:text-amber-200">Primary Diagnosis</p>
                        <p className="text-sm mt-1">{selectedPhysioSession.order_details.diagnosis}</p>
                      </div>
                    )}
                  </div>

                  {/* Assessment Sections */}
                  <div className="space-y-6">
                    {/* A. Patient Assessment */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-teal-700 dark:text-teal-400 border-b pb-2">A. Patient Assessment</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Presenting Complaint</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.presenting_complaint || 'Not documented'}
                          </p>
                        </div>
                        {(selectedPhysioSession.pain_level_before != null || selectedPhysioSession.pain_level_after != null) && (
                          <div className="space-y-2">
                            <Label className="text-sm font-medium">Pain Assessment</Label>
                            <div className="grid grid-cols-2 gap-2">
                              {selectedPhysioSession.pain_level_before != null && (
                                <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded border">
                                  <p className="text-xs text-muted-foreground">Before Treatment</p>
                                  <p className="text-xl font-bold text-red-600">{selectedPhysioSession.pain_level_before}/10</p>
                                </div>
                              )}
                              {selectedPhysioSession.pain_level_after != null && (
                                <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded border">
                                  <p className="text-xs text-muted-foreground">After Treatment</p>
                                  <p className="text-xl font-bold text-green-600">{selectedPhysioSession.pain_level_after}/10</p>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* B. Medical & Social Background */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-blue-700 dark:text-blue-400 border-b pb-2">B. Medical & Social Background</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Medical History</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.medical_history || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Medications</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.medications || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Social History</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.social_history || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Previous Treatments</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.previous_treatments || 'Not documented'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* C. Physical Examination */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-green-700 dark:text-green-400 border-b pb-2">C. Physical Examination</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Posture & Gait</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.posture_gait || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Range of Motion</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.range_of_motion || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Muscle Strength</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.muscle_strength || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Special Tests</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.special_tests || 'Not documented'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* D. Functional Evaluation */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-purple-700 dark:text-purple-400 border-b pb-2">D. Functional Evaluation</h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Functional Assessment</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.functional_assessment || 'Not documented'}
                          </p>
                        </div>
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Functional Goals</Label>
                          <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                            {selectedPhysioSession.functional_goals || 'Not documented'}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* E. Clinical Reasoning */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-orange-700 dark:text-orange-400 border-b pb-2">E. Clinical Reasoning</h3>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Assessment Findings & Clinical Impression</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                          {selectedPhysioSession.clinical_reasoning || selectedPhysioSession.assessment_findings || 'Not documented'}
                        </p>
                      </div>
                    </div>

                    {/* F. Treatment Plan */}
                    <div className="space-y-3">
                      <h3 className="text-lg font-semibold text-red-700 dark:text-red-400 border-b pb-2">F. Treatment Plan</h3>
                      <div className="space-y-2">
                        <Label className="text-sm font-medium">Planned Treatment Approach</Label>
                        <p className="text-sm bg-muted/50 p-3 rounded border min-h-[80px]">
                          {selectedPhysioSession.next_session_plan || selectedPhysioSession.treatment_performed || 'Not documented'}
                        </p>
                      </div>
                    </div>

                    {/* Treatment Performed & Outcomes */}
                    {(selectedPhysioSession.treatment_performed || selectedPhysioSession.progress_notes) && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-indigo-700 dark:text-indigo-400 border-b pb-2">Treatment Performed & Outcomes</h3>
                        <div className="space-y-4">
                          {selectedPhysioSession.treatment_performed && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Treatment Performed</Label>
                              <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                                {selectedPhysioSession.treatment_performed}
                              </p>
                            </div>
                          )}
                          {selectedPhysioSession.progress_notes && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Progress Notes</Label>
                              <p className="text-sm bg-muted/50 p-3 rounded border min-h-[60px]">
                                {selectedPhysioSession.progress_notes}
                              </p>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Home Exercises & Recommendations */}
                    {((selectedPhysioSession.home_exercises?.length ?? 0) > 0 || (selectedPhysioSession.exercises_prescribed?.length ?? 0) > 0 || (selectedPhysioSession.recommendations?.length ?? 0) > 0) && (
                      <div className="space-y-3">
                        <h3 className="text-lg font-semibold text-emerald-700 dark:text-emerald-400 border-b pb-2">Home Program & Recommendations</h3>
                        <div className="space-y-4">
                          {((selectedPhysioSession.home_exercises || selectedPhysioSession.exercises_prescribed) || []).length > 0 && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Home Exercises</Label>
                              <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-md p-3">
                                <ul className="text-sm space-y-1">
                                  {(selectedPhysioSession.home_exercises || selectedPhysioSession.exercises_prescribed || []).map((exercise: any, index: number) => (
                                    <li key={index} className="flex items-start gap-2">
                                      <span className="text-emerald-600 mt-1">•</span>
                                      <span>{typeof exercise === 'string' ? exercise : (exercise?.description ?? exercise)}</span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          )}
                          {selectedPhysioSession.recommendations && selectedPhysioSession.recommendations.length > 0 && (
                            <div className="space-y-2">
                              <Label className="text-sm font-medium">Recommendations</Label>
                              <div className="space-y-2">
                                {selectedPhysioSession.recommendations.map((rec: any, index: number) => (
                                  <div key={index} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-md p-3">
                                    <p className="text-sm">{rec.text}</p>
                                    <p className="text-xs text-muted-foreground mt-1">Type: {rec.type || 'general'}</p>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Footer */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <p>Report generated on {new Date().toLocaleString()}</p>
                      {selectedPhysioSession?.id != null && (
                        <p>Session ID: PHY-{String(selectedPhysioSession.id).padStart(6, '0')}</p>
                      )}
                    </div>
                  </div>
                  </div>
                </div>
              </>
            ) : selectedPhysio && selectedPhysioSessions.length === 0 ? (
              <div className="text-center py-12">
                <Activity className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                <p className="font-medium text-muted-foreground mb-1">No completed sessions found</p>
                <p className="text-sm text-muted-foreground">This order has no completed sessions yet. Session reports will appear here once sessions are completed.</p>
                <div className="mt-4 space-y-2 text-sm text-left bg-muted/30 p-4 rounded-lg">
                  <div><span className="text-muted-foreground">Order Status:</span> <Badge variant="outline" className="ml-2">{selectedPhysio.status ?? ''}</Badge></div>
                  <div><span className="text-muted-foreground">Diagnosis:</span> {selectedPhysio.diagnosis ?? ''}</div>
                  {selectedPhysio.chief_complaint && <div><span className="text-muted-foreground">Chief Complaint:</span> {selectedPhysio.chief_complaint}</div>}
                  {selectedPhysio.treatment_goal && <div><span className="text-muted-foreground">Treatment Goal:</span> {selectedPhysio.treatment_goal}</div>}
                </div>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* Ward Admission View Dialog */}
        <Dialog open={!!selectedWard} onOpenChange={(open) => { if (!open) setSelectedWard(null); }}>
          <DialogContent className="w-[95vw] sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-emerald-500" />Ward Admission</DialogTitle>
              <DialogDescription>
                {selectedWard ? `${selectedWard.admission_id || selectedWard.id} - ${selectedWard.patient_name || patient?.full_name || ''}` : ''}
              </DialogDescription>
            </DialogHeader>
            {selectedWard && (() => {
              const patientName =
                selectedWard.patient_name ||
                patient?.full_name ||
                '';
              const patientIdValue = patient?.patient_id || '';
              const age = (patient as any)?.age ?? null;
              const gender = (patient as any)?.gender ?? '';
              const statusLabel = humanizeStatus(selectedWard.status);

              const admissionForOrders = {
                ...selectedWard,
                patient_name: patientName,
              } as PatientAdmission;

              const handlePrint = () => {
                try {
                  const content = document.getElementById('ward-admission-print-root');
                  if (!content) return;
                  const w = window.open('', '_blank', 'noopener,noreferrer');
                  if (!w) return;
                  w.document.open();
                  w.document.write(`
                    <html>
                      <head>
                        <title>Ward Admission</title>
                        <style>
                          body { font-family: Arial, sans-serif; margin: 24px; }
                          table { width: 100%; border-collapse: collapse; }
                          th, td { border: 1px solid #ddd; padding: 8px; font-size: 12px; vertical-align: top; }
                          th { background: #f5f5f5; text-align: left; }
                          h2 { margin: 0 0 4px 0; }
                        </style>
                      </head>
                      <body>${content.innerHTML}</body>
                    </html>
                  `);
                  w.document.close();
                  w.focus();
                  w.print();
                } catch {
                  toast.error('Unable to print ward admission');
                }
              };

              const handleDownloadPdf = () => {
                handlePrint();
              };

              return (
                <Tabs defaultValue="summary" className="w-full py-2">
                  <TabsList className="grid w-full grid-cols-2 h-9 mb-4">
                    <TabsTrigger value="summary" className="text-xs">Admission summary</TabsTrigger>
                    <TabsTrigger value="orders" className="text-xs">Doctor&apos;s orders</TabsTrigger>
                  </TabsList>
                  <TabsContent value="summary" className="space-y-6 mt-0">
                  <div id="ward-admission-print-root">
                    <div className="text-center p-4 border-b">
                      <h2 className="text-xl font-bold">WARD ADMISSION SUMMARY</h2>
                      <p className="text-sm text-muted-foreground">{getOrganizationServicesHeader()}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                      <div>
                        <p className="text-xs text-muted-foreground">Patient Name</p>
                        <p className="font-medium">{patientName}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Patient ID</p>
                        <p className="font-medium">{patientIdValue}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Age / Gender</p>
                        <p className="font-medium">{age != null ? `${age} years` : ''} / {gender}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Admission ID</p>
                        <p className="font-medium">{selectedWard.admission_id || selectedWard.id}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Ward</p>
                        <p className="font-medium">{selectedWard.ward_name ?? ''}</p>
                      </div>
                      {selectedWard.bed_number != null && String(selectedWard.bed_number).trim() !== '' && (
                        <div>
                          <p className="text-xs text-muted-foreground">Bed</p>
                          <p className="font-medium">{selectedWard.bed_number}</p>
                        </div>
                      )}
                      <div>
                        <p className="text-xs text-muted-foreground">Admission Type</p>
                        <p className="font-medium">{selectedWard.admission_type ?? ''}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Status</p>
                        <Badge variant="outline" className={getImagingBadgeClass(statusLabel)}>{statusLabel}</Badge>
                      </div>
                      <div className="col-span-2">
                        <p className="text-xs text-muted-foreground">Admission Diagnosis</p>
                        <p className="font-medium">{selectedWard.admission_diagnosis ?? ''}</p>
                      </div>
                      {selectedWard.presenting_complaint && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Presenting Complaint</p>
                          <p className="font-medium whitespace-pre-wrap">{selectedWard.presenting_complaint}</p>
                        </div>
                      )}
                      {selectedWard.admission_notes && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Admission Notes</p>
                          <p className="font-medium whitespace-pre-wrap">{selectedWard.admission_notes}</p>
                        </div>
                      )}
                      {selectedWard.current_condition && (
                        <div className="col-span-2">
                          <p className="text-xs text-muted-foreground">Current Condition</p>
                          <p className="font-medium whitespace-pre-wrap">{selectedWard.current_condition}</p>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="p-3 rounded-lg border">
                        <p className="text-xs text-muted-foreground">Admitted</p>
                        <p className="font-medium">{selectedWard.admission_date ? `${formatDate(selectedWard.admission_date)} ${formatTime(selectedWard.admission_date)}` : ''}</p>
                      </div>
                      <div className="p-3 rounded-lg border">
                        <p className="text-xs text-muted-foreground">Length of Stay</p>
                        <p className="font-medium">
                        {selectedWard.length_of_stay === 0 || selectedWard.length_of_stay == null
                          ? 'Same day'
                          : `${selectedWard.length_of_stay} day${selectedWard.length_of_stay === 1 ? '' : 's'}`}
                      </p>
                      </div>
                      {selectedWard.discharge_date && (
                        <div className="p-3 rounded-lg border">
                          <p className="text-xs text-muted-foreground">Discharged</p>
                          <p className="font-medium">{`${formatDate(selectedWard.discharge_date)} ${formatTime(selectedWard.discharge_date)}`}</p>
                        </div>
                      )}
                      {selectedWard.admitting_doctor_name?.trim() && (
                        <div className="p-3 rounded-lg border">
                          <p className="text-xs text-muted-foreground">Admitting Doctor</p>
                          <p className="font-medium">{selectedWard.admitting_doctor_name}</p>
                        </div>
                      )}
                    </div>

                    {(selectedWard.discharge_summary || selectedWard.discharge_notes || selectedWard.discharge_diagnosis || selectedWard.follow_up_instructions) && (
                      <div className="space-y-4 p-4 border-t">
                        <h3 className="text-sm font-semibold">Discharge Details</h3>
                        {selectedWard.discharge_type && (
                          <div>
                            <p className="text-xs text-muted-foreground">Discharge Type</p>
                            <p className="font-medium">{selectedWard.discharge_type}</p>
                          </div>
                        )}
                        {selectedWard.discharge_diagnosis && (
                          <div>
                            <p className="text-xs text-muted-foreground">Discharge Diagnosis</p>
                            <p className="font-medium whitespace-pre-wrap">{selectedWard.discharge_diagnosis}</p>
                          </div>
                        )}
                        {selectedWard.discharge_summary && (
                          <div>
                            <p className="text-xs text-muted-foreground">Discharge Summary</p>
                            <p className="font-medium whitespace-pre-wrap">{selectedWard.discharge_summary}</p>
                          </div>
                        )}
                        {selectedWard.discharge_notes && (
                          <div>
                            <p className="text-xs text-muted-foreground">Discharge Notes</p>
                            <p className="font-medium whitespace-pre-wrap">{selectedWard.discharge_notes}</p>
                          </div>
                        )}
                        {selectedWard.follow_up_instructions && (
                          <div>
                            <p className="text-xs text-muted-foreground">Follow-up Instructions</p>
                            <p className="font-medium whitespace-pre-wrap">{selectedWard.follow_up_instructions}</p>
                          </div>
                        )}
                        {selectedWard.discharge_doctor_name && (
                          <div>
                            <p className="text-xs text-muted-foreground">Discharge Doctor</p>
                            <p className="font-medium">{selectedWard.discharge_doctor_name}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <Button variant="outline" onClick={() => setSelectedWard(null)}>Close</Button>
                    <Button variant="outline" onClick={handlePrint}>
                      <Printer className="h-4 w-4 mr-2" />Print
                    </Button>
                    <Button onClick={handleDownloadPdf}>
                      <Download className="h-4 w-4 mr-2" />Download PDF
                    </Button>
                  </div>
                  </TabsContent>
                  <TabsContent value="orders" className="mt-0">
                    <WardDoctorOrdersSection
                      admission={admissionForOrders}
                      allowAddOrders={
                        !!currentUser?.isSuperuser ||
                        userCanAddWardDoctorOrders(currentUser?.systemRole)
                      }
                      allowEditCancelOrders={
                        !!currentUser?.isSuperuser ||
                        userCanEditCancelWardOrders(currentUser?.systemRole)
                      }
                      currentUserId={
                        currentUser?.id != null ? Number(currentUser.id) : undefined
                      }
                    />
                  </TabsContent>
                </Tabs>
              );
            })()}
          </DialogContent>
        </Dialog>

        <PatientHistoryTabs
          patientId={patient.id}
          showVisits
          showCertificates
          showReferrals
          showBackground
          onViewConsultation={viewSessionDetails}
          onViewVisit={openVisitDetail}
          onViewPrescription={(p) => { setSelectedPrescription(p); setShowPrescriptionView(true); }}
          onViewVital={(v) => { setSelectedVital(v); setIsVitalsDetailModalOpen(true); }}
          onViewLab={(l) => setSelectedLabReport(transformApiRowToCompletedTest(l, 'tests'))}
          onViewImaging={(i) => setSelectedImagingReport(transformApiRadiologyReportToCompleted(i))}
          onViewPhysio={openPhysioDetail}
          onViewWard={(a) => { setSelectedWard(a); }}
          onViewEyeOrder={(o) => { setSelectedEyeOrderId(o.id); setShowEyeOrderModal(true); }}
        />
      </div>
      <ViewEyeOrderModal
        open={showEyeOrderModal}
        onOpenChange={setShowEyeOrderModal}
        orderId={selectedEyeOrderId}
      />
    </DashboardLayout>
  );
}
