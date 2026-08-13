"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { AlertTriangle, Loader2, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";
import { wardService, type PatientAdmission } from "@/lib/services/ward-service";
import { resolveCareSessionAdmissionSession } from "@/lib/ward/care-session-session-resolver";
import { physioService } from "@/lib/services";
import { CareSessionPageHeader } from "@/components/ward/care-session/CareSessionPageHeader";
import { CareSessionTabs, type CareSessionTab, isCareSessionTab } from "@/components/ward/care-session/CareSessionTabs";
import { useWardOrders } from "@/hooks/use-ward-orders";
import { userCanAddWardDoctorOrders, userCanEditCancelWardOrders, userCanPerformWardOrders } from "@/lib/ward-order-permissions";
import { ConsultationReportModal } from "@/components/consultation/ConsultationReportModal";
import { loadConsultationReportSession } from "@/lib/consultation-report";
import { LabCompletedReportDialog } from "@/components/laboratory/LabCompletedReportDialog";
import { RadiologyCompletedReportDialog } from "@/components/radiology/RadiologyCompletedReportDialog";
import { PrescriptionReportDialog } from "@/components/pharmacy/PrescriptionReportDialog";
import { VitalsDetailModal } from "@/components/shared/VitalsDetailModal";
import { EyeSessionReportDialog } from "@/components/eyecare/EyeSessionReportDialog";
import { ConsultationRoomPhysioOrderViewDialog } from "@/components/consultation/room/ConsultationRoomPhysioOrderViewDialog";
import { ConsultationRoomWardAdmissionDialog } from "@/components/consultation/room/ConsultationRoomWardAdmissionDialog";
import { PatientHistoryReferralViewDialog } from "@/components/patient-history/PatientHistoryReferralViewDialog";
import { WardQuickObservationForm, emptyWardObservationForm, type WardObservationFormData } from "@/components/ward/WardQuickObservationForm";
import { hasAnyVitalsEntry, parseOptionalInt } from "@/lib/vitals-entry-form";
import { transformApiRowToCompletedTest } from "@/lib/laboratory/completedLabReport";
import { transformApiRadiologyReportToCompleted } from "@/lib/radiology/completedRadiologyReport";
import type { ConsultationSession } from "@/lib/services";

export default function CareSessionPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const admissionId = Number(params?.admissionId);
  const { currentUser } = useCurrentUser();

  const [admission, setAdmission] = useState<PatientAdmission | null>(null);
  const [session, setSession] = useState<ConsultationSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!Number.isFinite(admissionId) || admissionId <= 0) {
      setError("Invalid admission id.");
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const adm = await wardService.getAdmission(admissionId);
        if (cancelled) return;
        setAdmission(adm);
        const s = await resolveCareSessionAdmissionSession(adm);
        if (!cancelled) setSession(s);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load admission.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [admissionId]);

  const activeTab = useMemo<CareSessionTab>(() => {
    const v = searchParams?.get("tab");
    return isCareSessionTab(v || "") ? v as CareSessionTab : "overview";
  }, [searchParams]);
  const isNursingContext = searchParams?.get("source") === "nursing";

  const setActiveTab = useCallback((tab: CareSessionTab) => {
    const source = searchParams?.get("source");
    const query = new URLSearchParams({ tab });
    if (source) query.set("source", source);
    router.replace(`/wards/admissions/${admissionId}?${query.toString()}`);
  }, [router, admissionId, searchParams]);

  const requestAddInstruction = useCallback(() => {
    setOpenAddInstruction(true);
    setActiveTab('orders');
  }, [setActiveTab]);

  const reloadAdmission = useCallback(async () => {
    if (!admissionId || !Number.isFinite(admissionId)) return;
    try {
      const adm = await wardService.getAdmission(admissionId);
      setAdmission(adm);
      const s = await resolveCareSessionAdmissionSession(adm);
      setSession(s);
    } catch (e: any) {
      toast.error(e?.message || "Failed to refresh admission.");
    }
  }, [admissionId]);

  const onAdmissionChange = useCallback((fresh: PatientAdmission) => {
    setAdmission(fresh);
    void resolveCareSessionAdmissionSession(fresh).then(setSession);
  }, []);

  // ---- Documents ----
  const downloadBlob = useCallback((blob: Blob, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, []);

  const [isDownloadingSummary, setIsDownloadingSummary] = useState(false);
  const handleDownloadSummary = async () => {
    if (!admission) return;
    setIsDownloadingSummary(true);
    try {
      const blob = await wardService.fetchAdmissionSummaryPdf(admission.id);
      downloadBlob(blob, `admission_summary_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to download admission summary");
    } finally {
      setIsDownloadingSummary(false);
    }
  };

  const [isDownloadingSlip, setIsDownloadingSlip] = useState(false);
  const handleDownloadSlip = async () => {
    if (!admission) return;
    setIsDownloadingSlip(true);
    try {
      const blob = await wardService.fetchDischargeSlipPdf(admission.id);
      downloadBlob(blob, `discharge_slip_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to download discharge slip");
    } finally {
      setIsDownloadingSlip(false);
    }
  };

  const [isDownloadingReferralLetter, setIsDownloadingReferralLetter] = useState(false);
  const handleDownloadReferralLetter = async () => {
    if (!admission) return;
    setIsDownloadingReferralLetter(true);
    try {
      const blob = await wardService.fetchReferralLetterPdf(admission.id);
      downloadBlob(blob, `referral_letter_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to download referral letter");
    } finally {
      setIsDownloadingReferralLetter(false);
    }
  };

  const [isDownloadingResponsibility, setIsDownloadingResponsibility] = useState(false);
  const handleDownloadResponsibilityForm = async (formType: "transfer" | "dama" | "general" | "auto" = "auto") => {
    if (!admission) return;
    setIsDownloadingResponsibility(true);
    try {
      const blob = await wardService.fetchResponsibilityFormPdf(admission.id, formType);
      downloadBlob(blob, `responsibility_form_${admission.admission_id}.pdf`);
    } catch (err: any) {
      toast.error(err?.message || "Failed to download responsibility form");
    } finally {
      setIsDownloadingResponsibility(false);
    }
  };

  const getResponsibilityFormVariant = useCallback((admission: PatientAdmission) => {
    const hasReferral = Boolean(admission.escort);
    const dt = admission.discharge_type || "";
    if (dt === "against_medical_advice") return { label: "DAMA form", formType: "dama" as const };
    if (dt === "transfer" || hasReferral) return { label: "Transfer responsibility", formType: "transfer" as const };
    if (admission.status === "discharged" || admission.status === "pending_discharge") {
      return { label: "Discharge ack.", formType: "general" as const };
    }
    return null;
  }, []);

  // ---- Orders ----
  const [labOrderOpen, setLabOrderOpen] = useState(false);
  const [radiologyOrderOpen, setRadiologyOrderOpen] = useState(false);
  const [physioOrderOpen, setPhysioOrderOpen] = useState(false);
  const [eyeOrderOpen, setEyeOrderOpen] = useState(false);
  const [referralOrderOpen, setReferralOrderOpen] = useState(false);
  const [openAddInstruction, setOpenAddInstruction] = useState(false);
  const [observationData, setObservationData] = useState<WardObservationFormData>(emptyWardObservationForm());
  const [isSavingObservation, setIsSavingObservation] = useState(false);
  const [observationRefreshKey, setObservationRefreshKey] = useState(0);
  const [showDischargeDialog, setShowDischargeDialog] = useState(false);
  const [dischargeDiagnosis, setDischargeDiagnosis] = useState('');
  const [dischargeNotes, setDischargeNotes] = useState('');
  const [followUpInstructions, setFollowUpInstructions] = useState('');
  const [isSubmittingDischarge, setIsSubmittingDischarge] = useState(false);

  const handleInitiateDischarge = async () => {
    if (!admission) return;
    if (!dischargeDiagnosis.trim()) {
      toast.error('Discharge diagnosis is required.');
      return;
    }
    setIsSubmittingDischarge(true);
    try {
      const fresh = await wardService.initiateDischarge(admission.id, {
        discharge_type: 'regular',
        discharge_diagnosis: dischargeDiagnosis.trim(),
        discharge_notes: dischargeNotes.trim() || undefined,
        follow_up_instructions: followUpInstructions.trim() || undefined,
      });
      onAdmissionChange(fresh);
      setShowDischargeDialog(false);
      setDischargeDiagnosis('');
      setDischargeNotes('');
      setFollowUpInstructions('');
      toast.success('Discharge initiated — nursing will complete sign-out when the patient leaves.');
    } catch (error: any) {
      toast.error(error?.message || 'Failed to initiate discharge');
    } finally {
      setIsSubmittingDischarge(false);
    }
  };

  const handleSaveObservation = async () => {
    if (!admission || !isNursingContext) return;
    const v = observationData.vitals;
    if (!observationData.current_condition && !observationData.vitals_notes.trim() && !observationData.escalate && !hasAnyVitalsEntry(v)) {
      toast.error("Please enter a condition, vitals, or escalation");
      return;
    }
    const pulse = parseOptionalInt(v.pulse);
    const hasNumericVitals = v.temperature.trim() !== '' || pulse != null || v.bloodPressureSystolic.trim() !== '' || v.bloodPressureDiastolic.trim() !== '' || v.respiratoryRate.trim() !== '';
    const hasVitalsReading = hasNumericVitals || v.oxygenSaturation.trim() !== '';
    if (observationData.vitals_notes.trim() && !hasVitalsReading) {
      toast.error("Enter vitals to save a vitals note");
      return;
    }

    setIsSavingObservation(true);
    try {
      const noteLines = [observationData.vitals_notes.trim(), observationData.escalate ? "⚠️ ESCALATED — Needs Doctor Review" : ''].filter(Boolean);
      if (hasVitalsReading) {
        const vitalNoteParts = [
          v.oxygenSaturation.trim() ? `SpO2 ${v.oxygenSaturation}%` : '',
          ...noteLines,
        ].filter(Boolean);
        await wardService.createObservationVital({
          admission: admission.id,
          temperature_c: v.temperature || undefined,
          pulse,
          respiratory_rate: parseOptionalInt(v.respiratoryRate),
          bp_systolic: parseOptionalInt(v.bloodPressureSystolic),
          bp_diastolic: parseOptionalInt(v.bloodPressureDiastolic),
          notes: vitalNoteParts.length ? vitalNoteParts.join("\n\n") : undefined,
        });
      }
      const condition = observationData.escalate ? "Needs Doctor Review" : observationData.current_condition || admission.current_condition;
      const fresh = condition
        ? await wardService.updateAdmission(admission.id, { current_condition: condition })
        : await wardService.getAdmission(admission.id);
      setObservationData(emptyWardObservationForm());
      setObservationRefreshKey((key) => key + 1);
      onAdmissionChange(fresh);
      toast.success(observationData.escalate ? "Patient escalated — doctor has been flagged for review" : "Observation recorded successfully");
    } catch (error: any) {
      toast.error(error?.message || "Failed to save observation");
    } finally {
      setIsSavingObservation(false);
    }
  };

  const { createLab, createRadiology, createPhysio, createReferral } = useWardOrders({
    admission,
    visitId: admission?.visit,
    patientId: admission?.patient,
    onChanged: () => void reloadAdmission(),
  });

  const handleWardLabOrder = async (payload: any) => {
    if (!admission) return;
    await createLab({
      priority: payload.priority,
      clinical_notes: payload.clinicalNotes || undefined,
      tests_data: payload.templates.map((t: any) => ({
        name: t.name,
        code:
          t.code ||
          t.name
            .substring(0, 24)
            .toUpperCase()
            .replace(/[^A-Z0-9]+/g, "_")
            .replace(/^_|_$/g, "") ||
          "LAB",
        sample_type: t.sample_type || "Blood",
        template: t.id,
        status: "pending",
        notes: payload.clinicalNotes || "",
      })),
    } as any);
  };

  const handleWardRadiologyOrder = async (payload: any) => {
    if (!admission) return;
    await createRadiology({
      priority: payload.priority,
      clinical_notes: payload.clinicalIndication?.trim() || undefined,
      provisional_diagnosis: payload.provisionalDiagnosis?.trim() || undefined,
      lmp: payload.lmp || undefined,
      studies_data: payload.templates.map((t: any) => ({
        procedure: t.name,
        body_part: t.body_part || "",
        modality: t.modality || "X-Ray",
        template: t.id,
        status: "pending",
      })),
    } as any);
  };

  const handleWardPhysioOrder = async (payload: any) => {
    if (!admission) return;
    await createPhysio({
      history_clinical_findings: payload.historyClinicalFindings || undefined,
      diagnosis: payload.diagnosis.trim(),
      drug_history: payload.drugHistory || undefined,
      special_instructions: payload.specialInstructions || undefined,
      priority: payload.priority,
      referral_source: "doctor",
    } as any);
  };

  // ---- Permissions ----
  const allowAddOrders = userCanAddWardDoctorOrders(currentUser) && admission?.status === "admitted";
  const allowEditCancelOrders = userCanEditCancelWardOrders(currentUser);
  const allowPerformOrders = userCanPerformWardOrders(currentUser);

  const orderModals = useMemo(() => ({
    lab: labOrderOpen,
    radiology: radiologyOrderOpen,
    physio: physioOrderOpen,
    eye: eyeOrderOpen,
    referral: referralOrderOpen,
    setLab: setLabOrderOpen,
    setRadiology: setRadiologyOrderOpen,
    setPhysio: setPhysioOrderOpen,
    setEye: setEyeOrderOpen,
    setReferral: setReferralOrderOpen,
  }), [labOrderOpen, radiologyOrderOpen, physioOrderOpen, eyeOrderOpen, referralOrderOpen]);

  const [historyReloadToken, setHistoryReloadToken] = useState(0);

  const historyCallbacks = useMemo(() => ({
    onViewConsultation: async (session: { id: number }) => {
      await viewSessionDetails(session.id);
    },
    onViewLab: (lab: any) => handleViewLab(lab),
    onViewImaging: (img: any) => handleViewImaging(img),
    onViewPrescription: (p: any) => handleViewPrescription(p),
    onViewVital: (v: any) => handleViewVital(v),
    onViewPhysio: (order: any) => void openPhysioDetail(order),
    onViewEyeOrder: (o: { id: number }) => {
      setEyeSessionReportOrderId(o.id);
      setEyeSessionReportOpen(true);
    },
    onViewWard: (a: any) => {
      setSelectedWardAdmission(a);
      setShowWardAdmissionDetail(true);
    },
    onViewReferral: (r: { id?: number | null }) => {
      if (r?.id != null) openReferralView(Number(r.id));
    },
    onReferralUpdated: () => setHistoryReloadToken((n) => n + 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  const [showConsultationReport, setShowConsultationReport] = useState(false);
  const [consultationReportSession, setConsultationReportSession] = useState<any>(null);
  const [isConsultationReportLoading, setIsConsultationReportLoading] = useState(false);

  const viewSessionDetails = async (sessionId: number) => {
    setIsConsultationReportLoading(true);
    setConsultationReportSession(null);
    try {
      const reportSession = await loadConsultationReportSession(Number(sessionId));
      setConsultationReportSession(reportSession);
      setShowConsultationReport(true);
    } catch {
      toast.error("Failed to load consultation report.");
    } finally {
      setIsConsultationReportLoading(false);
    }
  };

  const [selectedCompletedLabTest, setSelectedCompletedLabTest] = useState<any>(null);
  const [showLabResultViewer, setShowLabResultViewer] = useState(false);
  const handleViewLab = (labResult: any) => {
    setSelectedCompletedLabTest(transformApiRowToCompletedTest(labResult as any, "tests"));
    setShowLabResultViewer(true);
  };

  const [selectedCompletedRadiologyReport, setSelectedCompletedRadiologyReport] = useState<any>(null);
  const [showRadiologyReportViewer, setShowRadiologyReportViewer] = useState(false);
  const handleViewImaging = (img: any) => {
    setSelectedCompletedRadiologyReport(transformApiRadiologyReportToCompleted(img as any));
    setShowRadiologyReportViewer(true);
  };

  const [selectedPrescription, setSelectedPrescription] = useState<any>(null);
  const [showPrescriptionViewer, setShowPrescriptionViewer] = useState(false);
  const handleViewPrescription = (p: any) => {
    setSelectedPrescription(p);
    setShowPrescriptionViewer(true);
  };

  const [showVitalsDetail, setShowVitalsDetail] = useState(false);
  const [selectedVital, setSelectedVital] = useState<any>(null);
  const handleViewVital = (v: any) => {
    setSelectedVital(v);
    setShowVitalsDetail(true);
  };

  const [selectedPhysioOrder, setSelectedPhysioOrder] = useState<any>(null);
  const [physioOrderSessions, setPhysioOrderSessions] = useState<any[]>([]);
  const [loadingPhysioSessions, setLoadingPhysioSessions] = useState(false);
  const [isPhysioOrderDialogOpen, setIsPhysioOrderDialogOpen] = useState(false);
  const openPhysioDetail = async (order: any) => {
    setIsPhysioOrderDialogOpen(true);
    setSelectedPhysioOrder(order);
    setPhysioOrderSessions([]);
    setLoadingPhysioSessions(true);
    try {
      const sessions = await physioService.getSessions({ order: order.id });
      const list = Array.isArray(sessions) ? sessions : (sessions as any)?.results ?? [];
      setPhysioOrderSessions(list);
    } catch {
      setPhysioOrderSessions([]);
    } finally {
      setLoadingPhysioSessions(false);
    }
  };

  const [eyeSessionReportOpen, setEyeSessionReportOpen] = useState(false);
  const [eyeSessionReportOrderId, setEyeSessionReportOrderId] = useState<number | undefined>(undefined);

  const [showWardAdmissionDetail, setShowWardAdmissionDetail] = useState(false);
  const [selectedWardAdmission, setSelectedWardAdmission] = useState<any>(null);

  const [referralViewOpen, setReferralViewOpen] = useState(false);
  const [referralViewId, setReferralViewId] = useState<number | undefined>();
  const [referralViewRefreshKey, setReferralViewRefreshKey] = useState(0);
  const openReferralView = useCallback((id: number) => {
    setReferralViewId(id);
    setReferralViewRefreshKey((k) => k + 1);
    setReferralViewOpen(true);
  }, []);

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <Card>
            <CardContent className="flex items-center justify-center py-16">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="ml-3 text-muted-foreground">Loading care session...</p>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  if (error || !admission) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-red-500" />
                  <p className="text-red-600 dark:text-red-400">{error || "Admission not found"}</p>
                </div>
                <Link href={isNursingContext ? "/nursing/wards" : "/consultation/wards"} className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
                  <ArrowLeft className="h-4 w-4" /> Back to {isNursingContext ? "Ward Care" : "Ward Rounds"}
                </Link>
              </div>
            </CardContent>
          </Card>
          <div className="h-4" />
          <Link href={isNursingContext ? "/nursing/wards" : "/consultation/wards"} className="text-sm text-primary inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" /> Back to {isNursingContext ? "Ward Care" : "Ward Rounds"}
          </Link>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-5 min-h-0 flex flex-col">
        <div>
          <Link href={isNursingContext ? "/nursing/wards" : "/consultation/wards"} className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-3.5 w-3.5" /> {isNursingContext ? "Ward Care" : "Ward rounds"}
          </Link>
        </div>
        <CareSessionPageHeader
          admission={admission}
          session={session}
          isDownloadingSummary={isDownloadingSummary}
          isDownloadingSlip={isDownloadingSlip}
          isDownloadingReferralLetter={isDownloadingReferralLetter}
          isDownloadingResponsibility={isDownloadingResponsibility}
          onDownloadSummary={() => void handleDownloadSummary()}
          onDownloadSlip={() => void handleDownloadSlip()}
          onDownloadReferralLetter={() => void handleDownloadReferralLetter()}
          onDownloadResponsibility={(formType) => void handleDownloadResponsibilityForm(formType)}
          getResponsibilityFormVariant={getResponsibilityFormVariant}
          onInitiateDischarge={!isNursingContext ? () => setShowDischargeDialog(true) : undefined}
        />
        <div className="flex flex-col">
        <CareSessionTabs
            admission={admission}
            session={session}
            currentUser={currentUser}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            allowAddOrders={allowAddOrders}
            allowEditCancelOrders={allowEditCancelOrders}
            allowPerformOrders={allowPerformOrders}
            orderModals={orderModals}
            onLabOrder={handleWardLabOrder}
            onRadiologyOrder={handleWardRadiologyOrder}
            onPhysioOrder={handleWardPhysioOrder}
            onReferralOrder={createReferral}
            onDataChanged={reloadAdmission}
            onAdmissionChange={onAdmissionChange}
            historyReloadToken={historyReloadToken}
            historyCallbacks={historyCallbacks}
            patientIdForHistory={admission.patient}
            onRequestAddInstruction={requestAddInstruction}
            openAddInstruction={openAddInstruction}
            onAddInstructionOpened={() => setOpenAddInstruction(false)}
            nursingMode={isNursingContext}
            observationData={observationData}
            onObservationChange={setObservationData}
            onSaveObservation={() => void handleSaveObservation()}
            isSavingObservation={isSavingObservation}
            observationRefreshKey={observationRefreshKey}
          />
        </div>

        {/* Shared detail viewers */}
        <ConsultationReportModal
          open={showConsultationReport}
          onOpenChange={setShowConsultationReport}
          session={consultationReportSession}
          loading={isConsultationReportLoading}
        />

        <Dialog open={showDischargeDialog} onOpenChange={setShowDischargeDialog}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Initiate discharge</DialogTitle>
              <DialogDescription>
                Record the doctor&apos;s discharge decision. Nursing will complete sign-out when the patient leaves the ward.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="session-discharge-diagnosis">Discharge diagnosis</Label>
                <Textarea
                  id="session-discharge-diagnosis"
                  value={dischargeDiagnosis}
                  onChange={(event) => setDischargeDiagnosis(event.target.value)}
                  placeholder="Enter the final or working discharge diagnosis"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-discharge-notes">Discharge summary</Label>
                <Textarea
                  id="session-discharge-notes"
                  value={dischargeNotes}
                  onChange={(event) => setDischargeNotes(event.target.value)}
                  placeholder="Clinical summary and condition at discharge"
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="session-follow-up">Follow-up instructions</Label>
                <Textarea
                  id="session-follow-up"
                  value={followUpInstructions}
                  onChange={(event) => setFollowUpInstructions(event.target.value)}
                  placeholder="Medication, review date, warning signs, or other instructions"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDischargeDialog(false)} disabled={isSubmittingDischarge}>Cancel</Button>
              <Button onClick={() => void handleInitiateDischarge()} disabled={isSubmittingDischarge || !dischargeDiagnosis.trim()}>
                {isSubmittingDischarge ? 'Initiating…' : 'Initiate discharge'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <PrescriptionReportDialog
          open={showPrescriptionViewer}
          onOpenChange={(o) => {
            setShowPrescriptionViewer(o);
            if (!o) setSelectedPrescription(null);
          }}
          prescription={selectedPrescription ? {
            ...selectedPrescription,
            clinic: selectedPrescription.clinic || (selectedPrescription as any)?.visit_details?.clinic || "",
            doctor_name: selectedPrescription.doctor_name || "",
            prescription_id: selectedPrescription.prescription_id || selectedPrescription.id,
            dispensed_by_name: selectedPrescription.dispensed_by_name || (selectedPrescription as any)?.dispensed_by_name || "",
          } : null}
          prescriptionDbId={selectedPrescription?.id ?? null}
          patient={
            selectedPrescription && admission
              ? {
                  name: selectedPrescription.patient_name || admission.patient_name || "",
                  patientId: admission.patient?.toString() || "",
                  age: (selectedPrescription as any)?.patient_details?.age ?? null,
                  gender: (selectedPrescription as any)?.patient_details?.gender ?? "",
                }
              : null
          }
        />
        <VitalsDetailModal
          vitals={selectedVital}
          patientName={admission.patient_name}
          patientId={admission.patient?.toString()}
          isOpen={showVitalsDetail}
          onClose={() => { setShowVitalsDetail(false); setSelectedVital(null); }}
        />
        <LabCompletedReportDialog
          open={!!selectedCompletedLabTest}
          onOpenChange={(o) => { if (!o) setSelectedCompletedLabTest(null); }}
          test={selectedCompletedLabTest}
          hideLabWorkflowActions
        />
        <RadiologyCompletedReportDialog
          open={!!selectedCompletedRadiologyReport}
          onOpenChange={(o) => { if (!o) setSelectedCompletedRadiologyReport(null); }}
          report={selectedCompletedRadiologyReport}
        />
        <EyeSessionReportDialog
          open={eyeSessionReportOpen}
          onOpenChange={setEyeSessionReportOpen}
          orderId={eyeSessionReportOrderId}
        />
        <ConsultationRoomPhysioOrderViewDialog
          open={isPhysioOrderDialogOpen}
          onOpenChange={setIsPhysioOrderDialogOpen}
          selectedPhysioOrder={selectedPhysioOrder}
          physioOrderSessions={physioOrderSessions}
          loadingPhysioSessions={loadingPhysioSessions}
        />
        <ConsultationRoomWardAdmissionDialog
          open={showWardAdmissionDetail}
          onOpenChange={setShowWardAdmissionDetail}
          selectedWardAdmission={selectedWardAdmission}
        />
        <PatientHistoryReferralViewDialog
          open={referralViewOpen}
          onOpenChange={setReferralViewOpen}
          referralId={referralViewId ?? null}
          refreshKey={referralViewRefreshKey}
        />
      </div>
    </DashboardLayout>
  );
}
