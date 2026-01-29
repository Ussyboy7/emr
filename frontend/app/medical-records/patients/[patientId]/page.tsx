"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
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
  ChevronLeft, ChevronRight, Loader2, AlertTriangle, FileText, Pencil
} from "lucide-react";
import { patientService, consultationService, labService, radiologyService, 
         pharmacyService, physioService, wardService, type Patient } from '@/lib/services';
import { apiFetch } from '@/lib/api-client';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { PatientAvatar } from '@/components/PatientAvatar';
import { VitalsDetailModal } from '@/components/VitalsDetailModal';
import { ConsultationReportModal } from '@/components/consultation/ConsultationReportModal';
import { loadConsultationReportSession, type ConsultationReportSession } from '@/lib/consultation-report';
import { getOrganizationHeader } from '@/lib/constants/organization';

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

export default function PatientMedicalRecordsPage({ params }: { params: Promise<{ patientId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const patientId = resolvedParams.patientId;
  const [patient, setPatient] = useState<Patient | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

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
  const [selectedLab, setSelectedLab] = useState<any>(null);
  const [selectedImaging, setSelectedImaging] = useState<any>(null);
  const [selectedPhysio, setSelectedPhysio] = useState<any>(null);
  const [selectedPhysioSessions, setSelectedPhysioSessions] = useState<any[]>([]);
  const [selectedPhysioSession, setSelectedPhysioSession] = useState<any>(null);
  const [loadingPhysioSessions, setLoadingPhysioSessions] = useState(false);
  const [selectedWard, setSelectedWard] = useState<any>(null);

  // History data
  const [consultationHistory, setConsultationHistory] = useState<any[]>([]);
  const [labHistory, setLabHistory] = useState<any[]>([]);
  const [imagingHistory, setImagingHistory] = useState<any[]>([]);
  const [prescriptionHistory, setPrescriptionHistory] = useState<any[]>([]);
  const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
  const [physioHistory, setPhysioHistory] = useState<any[]>([]);
  const [wardAdmissions, setWardAdmissions] = useState<any[]>([]);
  const [medicalHistory, setMedicalHistory] = useState<any>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);

  // Pagination
  const [consultationsPage, setConsultationsPage] = useState(1);
  const [consultationsPerPage, setConsultationsPerPage] = useState(10);

  // Load patient data — supports both numeric id and string patient_id (e.g. "NN-NYSC-01")
  useEffect(() => {
    const loadPatient = async () => {
      try {
        setLoading(true);
        setError(null);
        let numericId: number;

        const parsedId = parseInt(patientId, 10);
        if (!isNaN(parsedId) && parsedId > 0) {
          numericId = parsedId;
        } else {
          // URL has string patient_id (e.g. "E-A2962", "NN-NYSC-01") — resolve to numeric id
          const searchResult = await patientService.getPatients({ search: patientId });
          const matchedPatient = searchResult.results.find(
            (p) =>
              p.patient_id === patientId ||
              (p.patient_id && p.patient_id.toUpperCase() === patientId.toUpperCase())
          );
          if (!matchedPatient) {
            throw new Error(`Patient with ID "${patientId}" not found`);
          }
          numericId = matchedPatient.id;
        }

        const patientData = await patientService.getPatient(numericId);
        setPatient(patientData);

        // Load patient history
        await loadPatientHistory(numericId);
      } catch (err: any) {
        console.error('Error loading patient:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError(err.message || 'Failed to load patient data');
        }
      } finally {
        setLoading(false);
      }
    };

    if (patientId) {
      loadPatient();
    }
  }, [patientId]);

  // Load patient history
  const loadPatientHistory = async (patientId: number) => {
    setLoadingHistory(true);
    try {
      // Load consultations
      const consultations = await consultationService.getSessions({ patient: patientId });
      setConsultationHistory(consultations.results || []);

      // Load lab results
      const labResults = await labService.getCompletedTests({ patient: patientId.toString() });
      setLabHistory(labResults?.results || []);

      // Load imaging
      const imagingResults = await radiologyService.getVerifiedReports({ patient: patientId.toString() });
      setImagingHistory(imagingResults?.results || []);

      // Load prescriptions
      const prescriptions = await pharmacyService.getPrescriptions({ patient: patientId.toString() });
      setPrescriptionHistory(prescriptions?.results || []);

      // Load vitals
      const vitals = await patientService.getPatientVitals(patientId);
      setVitalsHistory(vitals || []);

      // Load physio
      try {
        const physioOrders = await physioService.getOrders({ patient: patientId.toString() });
        setPhysioHistory(physioOrders?.results || []);
      } catch (err) {
        console.warn('Could not load physio history:', err);
      }

      // Load ward admissions
      const admissions = await wardService.getAdmissions({ patient: patientId });
      setWardAdmissions(admissions?.results || []);

      // Load medical history
      try {
        const history = await patientService.getPatientHistory(patientId);
        setMedicalHistory(history);
      } catch (err) {
        console.warn('Could not load medical history:', err);
      }
    } catch (err) {
      console.error('Error loading patient history:', err);
    } finally {
      setLoadingHistory(false);
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
            <div className="flex items-start gap-6">
              <PatientAvatar name={(patient.full_name || `${patient.first_name || ''} ${patient.surname || ''}`.trim()) || ''} photoUrl={patient.photo} size="lg" />
              <div className="flex-1">
                <h2 className="text-2xl font-bold">{patient.full_name || `${patient.first_name} ${patient.surname}`}</h2>
                <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                  <p>Patient ID: {patient.patient_id} • Age: {patient.age ?? ''} • Gender: {patient.gender ?? ''}</p>
                  {patient.blood_group && <p>Blood Group: {patient.blood_group} {patient.genotype ? `• Genotype: ${patient.genotype}` : ''}</p>}
                  {patient.phone && <p>Phone: {patient.phone}</p>}
                  {patient.email && <p>Email: {patient.email}</p>}
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
        {/* Prescription View Dialog */}
        <Dialog open={showPrescriptionView} onOpenChange={setShowPrescriptionView}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            {selectedPrescription && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Pill className="h-5 w-5 text-violet-500" />
                    Prescription {selectedPrescription.prescription_id || selectedPrescription.id}
                  </DialogTitle>
                  <DialogDescription>
                    {formatDate(selectedPrescription.prescribed_at || selectedPrescription.date)}
                    {selectedPrescription.prescribed_at && ` at ${formatTime(selectedPrescription.prescribed_at)}`}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div><span className="text-muted-foreground">Doctor:</span> {selectedPrescription.doctor_name ?? ''}</div>
                    <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{selectedPrescription.status ?? ''}</Badge></div>
                    {selectedPrescription.diagnosis && <div className="col-span-2"><span className="text-muted-foreground">Diagnosis:</span> {selectedPrescription.diagnosis}</div>}
                    {selectedPrescription.notes && <div className="col-span-2"><span className="text-muted-foreground">Notes:</span> {selectedPrescription.notes}</div>}
                  </div>
                  <div>
                    <h4 className="text-sm font-semibold mb-2">Medications</h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium">Medication</th>
                            <th className="px-3 py-2 text-left font-medium">Dosage</th>
                            <th className="px-3 py-2 text-left font-medium">Frequency</th>
                            <th className="px-3 py-2 text-left font-medium">Duration</th>
                            <th className="px-3 py-2 text-center font-medium">Qty</th>
                            <th className="px-3 py-2 text-center font-medium">Dispensed</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(selectedPrescription.medications || []).map((med: any, idx: number) => (
                            <tr key={med.id || idx}>
                              <td className="px-3 py-2 font-medium">{(med.medication_name || med.medication?.name || med.name) ?? ''}</td>
                              <td className="px-3 py-2">{med.dosage ?? ''}</td>
                              <td className="px-3 py-2">{med.frequency ?? ''}</td>
                              <td className="px-3 py-2">{med.duration ?? ''}</td>
                              <td className="px-3 py-2 text-center">{med.quantity ?? ''}{med.unit ? ` ${med.unit}` : ''}</td>
                              <td className="px-3 py-2 text-center">
                                <Badge variant={med.is_dispensed ? 'default' : 'outline'} className={med.is_dispensed ? 'bg-emerald-600' : ''}>
                                  {med.is_dispensed ? 'Yes' : 'No'}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        <VitalsDetailModal
          vitals={selectedVital}
          patientName={patient?.full_name || (patient ? `${patient.first_name || ''} ${patient.surname || ''}`.trim() : '')}
          isOpen={isVitalsDetailModalOpen}
          onClose={() => { setIsVitalsDetailModalOpen(false); setSelectedVital(null); }}
        />

        {/* Lab View Dialog */}
        <Dialog open={!!selectedLab} onOpenChange={(open) => { if (!open) setSelectedLab(null); }}>
          <DialogContent className="max-w-lg">
            {selectedLab && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><TestTube className="h-5 w-5" /> Lab Result</DialogTitle>
                  <DialogDescription>{(selectedLab.test_name || selectedLab.name) ?? ''} • {formatDate(selectedLab.processed_at || selectedLab.verified_at)}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Test:</span> {(selectedLab.test_name || selectedLab.name) ?? ''}</div>
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(selectedLab.processed_at || selectedLab.verified_at)} {formatTime(selectedLab.processed_at || selectedLab.verified_at)}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{selectedLab.status ?? ''}</Badge></div>
                  {selectedLab.results && Object.keys(selectedLab.results || {}).length > 0 && (
                    <div>
                      <div className="font-medium mb-2">Results</div>
                      <div className="border rounded p-3 space-y-1">
                        {Object.entries(selectedLab.results || {}).map(([k, v]: [string, any]) => (
                          <div key={k} className="flex justify-between"><span className="text-muted-foreground">{k}:</span> {String(v ?? '')}</div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Imaging View Dialog */}
        <Dialog open={!!selectedImaging} onOpenChange={(open) => { if (!open) setSelectedImaging(null); }}>
          <DialogContent className="max-w-lg">
            {selectedImaging && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><ScanLine className="h-5 w-5" /> Imaging Report</DialogTitle>
                  <DialogDescription>{(selectedImaging.study_details?.procedure || selectedImaging.procedure) ?? ''} • {formatDate(selectedImaging.reported_at || selectedImaging.created_at)}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Procedure:</span> {(selectedImaging.study_details?.procedure || selectedImaging.procedure) ?? ''}</div>
                  <div><span className="text-muted-foreground">Date:</span> {formatDate(selectedImaging.reported_at || selectedImaging.created_at)} {formatTime(selectedImaging.reported_at || selectedImaging.created_at)}</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{selectedImaging.overall_status ?? ''}</Badge></div>
                  {(selectedImaging.impression || selectedImaging.finding || selectedImaging.conclusion) && (
                    <div><span className="text-muted-foreground">Finding:</span> <p className="mt-1 p-2 bg-muted/50 rounded">{selectedImaging.impression || selectedImaging.finding || selectedImaging.conclusion}</p></div>
                  )}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

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
                    ? `${selectedPhysioSession.patient_name || (patient?.full_name || (patient ? [patient.first_name, patient.surname].filter(Boolean).join(' ') : '')) || 'Patient'} · PHY-${String(selectedPhysioSession.id || '').padStart(6, '0')} · Session ${selectedPhysioSession.session_number ?? '—'}`
                    : `PHY-${String(selectedPhysio.id || '').padStart(6, '0')} · ${formatDate(selectedPhysio.ordered_at)}`
                  }
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
                            Session {s.session_number ?? '—'} {s.status === 'completed' ? '(Completed)' : ''} — {s.scheduled_at ? new Date(s.scheduled_at).toLocaleString() : (s.id != null ? `PHY-${String(s.id).padStart(6, '0')}` : '—')}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-6">
                  {/* Report Header */}
                  <div className="border-b pb-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <h2 className="text-lg font-semibold text-blue-700">PHYSIOTHERAPY SESSION REPORT</h2>
                        <p className="text-sm text-muted-foreground">Nigerian Ports Authority Medical Services</p>
                      </div>
                      <div className="text-right">
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => window.print()}>
                            <Printer className="h-4 w-4 mr-1" />
                            Print
                          </Button>
                          <Button variant="outline" size="sm">
                            <Download className="h-4 w-4 mr-1" />
                            Download PDF
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Patient & Session Info */}
                    <div className="grid grid-cols-2 gap-6">
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Patient Information</h3>
                        <div className="space-y-1">
                          <p><span className="font-medium">Name:</span> {selectedPhysioSession.patient_name || (patient?.full_name || (patient ? [patient.first_name, patient.surname].filter(Boolean).join(' ') : '')) || 'Unknown'}</p>
                          <p><span className="font-medium">ID:</span> {selectedPhysioSession.patient_id || patient?.patient_id || '—'}</p>
                          <p><span className="font-medium">Physiotherapist:</span> {selectedPhysioSession.physiotherapist_name || 'Not specified'}</p>
                        </div>
                      </div>
                      <div className="space-y-2">
                        <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">Session Details</h3>
                        <div className="space-y-1">
                          <p><span className="font-medium">Session:</span> {selectedPhysioSession.session_number ?? '—'}</p>
                          <p><span className="font-medium">Scheduled:</span> {selectedPhysioSession.scheduled_at ? new Date(selectedPhysioSession.scheduled_at).toLocaleString() : '—'}</p>
                          <p><span className="font-medium">Completed:</span> {selectedPhysioSession.completed_at ? new Date(selectedPhysioSession.completed_at).toLocaleString() : '—'}</p>
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
                        <div className="space-y-2">
                          <Label className="text-sm font-medium">Pain Assessment</Label>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded border">
                              <p className="text-xs text-muted-foreground">Before Treatment</p>
                              <p className="text-xl font-bold text-red-600">{selectedPhysioSession.pain_level_before != null ? `${selectedPhysioSession.pain_level_before}/10` : '—'}</p>
                            </div>
                            <div className="text-center p-3 bg-green-50 dark:bg-green-900/20 rounded border">
                              <p className="text-xs text-muted-foreground">After Treatment</p>
                              <p className="text-xl font-bold text-green-600">{selectedPhysioSession.pain_level_after != null ? `${selectedPhysioSession.pain_level_after}/10` : '—'}</p>
                            </div>
                          </div>
                        </div>
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
                      <p>Session ID: {selectedPhysioSession?.id != null ? `PHY-${String(selectedPhysioSession.id).padStart(6, '0')}` : '—'}</p>
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
          <DialogContent className="max-w-lg">
            {selectedWard && (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2"><Building2 className="h-5 w-5" /> Ward Admission</DialogTitle>
                  <DialogDescription>{selectedWard.ward_name ?? ''} • {formatDate(selectedWard.admission_date)}</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 text-sm">
                  <div><span className="text-muted-foreground">Admission Date:</span> {formatDate(selectedWard.admission_date)} {formatTime(selectedWard.admission_date)}</div>
                  <div><span className="text-muted-foreground">Ward:</span> {selectedWard.ward_name ?? ''}</div>
                  <div><span className="text-muted-foreground">Type:</span> {selectedWard.admission_type ?? ''}</div>
                  <div><span className="text-muted-foreground">Diagnosis:</span> {selectedWard.admission_diagnosis ?? ''}</div>
                  <div><span className="text-muted-foreground">Length of Stay:</span> {selectedWard.length_of_stay ?? 0} days</div>
                  <div><span className="text-muted-foreground">Status:</span> <Badge variant="outline">{selectedWard.status ?? ''}</Badge></div>
                  {selectedWard.discharge_date && <div><span className="text-muted-foreground">Discharge Date:</span> {formatDate(selectedWard.discharge_date)}</div>}
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Tabs */}
        <Card>
          <CardHeader className="pb-0">
            <Tabs defaultValue="consultations" className="w-full">
              <TabsList className="grid w-full grid-cols-8">
                <TabsTrigger value="consultations" className="text-xs">
                  <ClipboardList className="h-3 w-3 mr-1" />
                  Consultations ({consultationHistory.length})
                </TabsTrigger>
                <TabsTrigger value="labs" className="text-xs">
                  <TestTube className="h-3 w-3 mr-1" />
                  Lab Results ({labHistory.length})
                </TabsTrigger>
                <TabsTrigger value="imaging" className="text-xs">
                  <ScanLine className="h-3 w-3 mr-1" />
                  Imaging ({imagingHistory.length})
                </TabsTrigger>
                <TabsTrigger value="prescriptions" className="text-xs">
                  <Pill className="h-3 w-3 mr-1" />
                  Prescriptions ({prescriptionHistory.length})
                </TabsTrigger>
                <TabsTrigger value="vitals" className="text-xs">
                  <Heart className="h-3 w-3 mr-1" />
                  Vitals ({vitalsHistory.length})
                </TabsTrigger>
                <TabsTrigger value="physio" className="text-xs">
                  <Activity className="h-3 w-3 mr-1" />
                  Physio ({physioHistory.length})
                </TabsTrigger>
                <TabsTrigger value="wards" className="text-xs">
                  <Building2 className="h-3 w-3 mr-1" />
                  Ward Admissions ({wardAdmissions.length})
                </TabsTrigger>
                <TabsTrigger value="background" className="text-xs">
                  <User className="h-3 w-3 mr-1" />
                  Background
                </TabsTrigger>
              </TabsList>

              {/* Consultations Tab */}
              <TabsContent value="consultations" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading consultations...</p>
                  </div>
                ) : consultationHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <ClipboardList className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No consultations found</p>
                    <p className="text-sm text-muted-foreground">Consultation history will appear here</p>
                  </div>
                ) : (
                  <>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">Date</th>
                            <th className="px-4 py-2 text-left font-medium">Doctor</th>
                            <th className="px-4 py-2 text-left font-medium">Clinic</th>
                            <th className="px-4 py-2 text-center font-medium">Action</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {paginatedConsultations.map((session) => (
                            <tr key={session.id} className="hover:bg-muted/30">
                              <td className="px-4 py-3 text-muted-foreground">{formatDate(session.started_at)}</td>
                              <td className="px-4 py-3">{session.doctor_name ?? ''}</td>
                              <td className="px-4 py-3">
                                <Badge variant="outline">{session.clinic_name ?? ''}</Badge>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <Button variant="ghost" size="sm" onClick={() => viewSessionDetails(session)}>
                                  <Eye className="h-4 w-4 mr-1" /> View Report
                                </Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    {/* Pagination */}
                    {totalConsultationPages > 1 && (
                      <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-center gap-4">
                          <p className="text-sm text-muted-foreground">
                            Showing {consultationHistory.length === 0 ? 0 : `${(consultationsPage - 1) * consultationsPerPage + 1}-${Math.min(consultationHistory.length, consultationsPage * consultationsPerPage)}`} of {consultationHistory.length}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="sm" disabled={consultationsPage === 1} onClick={() => setConsultationsPage(p => p - 1)}>
                            <ChevronLeft className="h-4 w-4" />
                            Previous
                          </Button>
                          <div className="flex items-center gap-1">
                            {Array.from({ length: Math.min(5, totalConsultationPages) }, (_, i) => {
                              let pageNum: number;
                              if (totalConsultationPages <= 5) pageNum = i + 1;
                              else if (consultationsPage <= 3) pageNum = i + 1;
                              else if (consultationsPage >= totalConsultationPages - 2) pageNum = totalConsultationPages - 4 + i;
                              else pageNum = consultationsPage - 2 + i;
                              if (pageNum > totalConsultationPages || pageNum < 1) return null;
                              return (
                                <Button key={pageNum} variant={consultationsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setConsultationsPage(pageNum)}>
                                  {pageNum}
                                </Button>
                              );
                            })}
                          </div>
                          <Button variant="outline" size="sm" disabled={consultationsPage >= totalConsultationPages} onClick={() => setConsultationsPage(p => p + 1)}>
                            Next
                            <ChevronRight className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>

              {/* Lab Results Tab */}
              <TabsContent value="labs" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading lab results...</p>
                  </div>
                ) : labHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <TestTube className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No lab results found</p>
                    <p className="text-sm text-muted-foreground">Lab results will appear here once available</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Date</th>
                          <th className="px-4 py-2 text-left font-medium">Test</th>
                          <th className="px-4 py-2 text-left font-medium">Status</th>
                          <th className="px-4 py-2 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {labHistory.map((lab: any) => (
                          <tr key={lab.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(lab.processed_at || lab.verified_at)} {formatTime(lab.processed_at || lab.verified_at)}
                            </td>
                            <td className="px-4 py-3 font-medium">{(lab.test_name || lab.name) ?? ''}</td>
                            <td className="px-4 py-3">
                              <Badge className={lab.status === 'Normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                                {lab.status ?? ''}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedLab(lab); }}>
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Imaging Tab */}
              <TabsContent value="imaging" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading imaging results...</p>
                  </div>
                ) : imagingHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <ScanLine className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No imaging results found</p>
                    <p className="text-sm text-muted-foreground">Imaging results will appear here once available</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Date</th>
                          <th className="px-4 py-2 text-left font-medium">Procedure</th>
                          <th className="px-4 py-2 text-left font-medium">Status</th>
                          <th className="px-4 py-2 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {imagingHistory.map((img: any) => (
                          <tr key={img.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(img.reported_at || img.created_at)} {formatTime(img.reported_at || img.created_at)}
                            </td>
                            <td className="px-4 py-3 font-medium">{(img.study_details?.procedure || img.procedure) ?? ''}</td>
                            <td className="px-4 py-3">
                              <Badge className={img.overall_status === 'normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                                {img.overall_status ?? ''}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedImaging(img); }}>
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Prescriptions Tab */}
              <TabsContent value="prescriptions" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading prescriptions...</p>
                  </div>
                ) : prescriptionHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <Pill className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No prescriptions found</p>
                    <p className="text-sm text-muted-foreground">Prescriptions will appear here once available</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Date</th>
                          <th className="px-4 py-2 text-left font-medium">Prescription ID</th>
                          <th className="px-4 py-2 text-left font-medium">Doctor</th>
                          <th className="px-4 py-2 text-left font-medium">Medications</th>
                          <th className="px-4 py-2 text-center font-medium">Status</th>
                          <th className="px-4 py-2 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {prescriptionHistory.map((prescription: any) => (
                          <tr key={prescription.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">{formatDate(prescription.prescribed_at || prescription.date)}</td>
                            <td className="px-4 py-3">
                              <Badge variant="outline">{prescription.prescription_id || prescription.id}</Badge>
                            </td>
                            <td className="px-4 py-3">{prescription.doctor_name ?? ''}</td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-1">
                                {(prescription.medications || []).slice(0, 3).map((med: any, idx: number) => (
                                  <Badge key={idx} variant="outline" className="text-xs">
                                    {[med.medication_name || med.medication?.name || med.name, med.dosage].filter(Boolean).join(' ')}
                                  </Badge>
                                ))}
                                {(prescription.medications || []).length > 3 && (
                                  <Badge variant="outline" className="text-xs">
                                    +{(prescription.medications || []).length - 3} more
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={
                                prescription.status === 'dispensed' ? 'bg-emerald-100 text-emerald-800' :
                                prescription.status === 'partially_dispensed' ? 'bg-amber-100 text-amber-800' :
                                'bg-gray-100 text-gray-800'
                              }>
                                {prescription.status ?? ''}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedPrescription(prescription); setShowPrescriptionView(true); }}>
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Vitals Tab */}
              <TabsContent value="vitals" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading vitals...</p>
                  </div>
                ) : vitalsHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <Heart className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No vitals records found</p>
                    <p className="text-sm text-muted-foreground">Vitals will appear here once recorded</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Date</th>
                          <th className="px-4 py-2 text-left font-medium">Summary</th>
                          <th className="px-4 py-2 text-left font-medium">Recorded By</th>
                          <th className="px-4 py-2 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {vitalsHistory.map((vital: any) => (
                          <tr key={vital.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(vital.recorded_at)} {formatTime(vital.recorded_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex flex-wrap gap-2 text-xs">
                                {vital.temperature && (
                                  <Badge variant="outline" className="text-xs">
                                    T: {vital.temperature}°C
                                  </Badge>
                                )}
                                {vital.blood_pressure_systolic && vital.blood_pressure_diastolic && (
                                  <Badge variant="outline" className="text-xs">
                                    BP: {vital.blood_pressure_systolic}/{vital.blood_pressure_diastolic}
                                  </Badge>
                                )}
                                {vital.heart_rate && (
                                  <Badge variant="outline" className="text-xs">
                                    HR: {vital.heart_rate} bpm
                                  </Badge>
                                )}
                                {vital.oxygen_saturation && (
                                  <Badge variant="outline" className="text-xs">
                                    SpO2: {vital.oxygen_saturation}%
                                  </Badge>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-sm">{vital.recorded_by_name ?? ''}</td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => {
                                setSelectedVital({
                                  id: vital.id,
                                  recordedAt: vital.recorded_at,
                                  recordedBy: vital.recorded_by_name,
                                  bloodPressureSystolic: vital.blood_pressure_systolic,
                                  bloodPressureDiastolic: vital.blood_pressure_diastolic,
                                  pulse: vital.heart_rate,
                                  temperature: vital.temperature,
                                  respiratoryRate: vital.respiratory_rate,
                                  oxygenSaturation: vital.oxygen_saturation,
                                  weight: vital.weight,
                                  height: vital.height,
                                  notes: vital.notes,
                                });
                                setIsVitalsDetailModalOpen(true);
                              }}>
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Physio Tab */}
              <TabsContent value="physio" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading physiotherapy records...</p>
                  </div>
                ) : physioHistory.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <Activity className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No physiotherapy records found</p>
                    <p className="text-sm text-muted-foreground">Physiotherapy records will appear here once available</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Date</th>
                          <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                          <th className="px-4 py-2 text-left font-medium">Status</th>
                          <th className="px-4 py-2 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {physioHistory.map((order: any) => (
                          <tr key={order.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(order.ordered_at)} {formatTime(order.ordered_at)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{order.diagnosis ?? ''}</div>
                            </td>
                            <td className="px-4 py-3">
                              <Badge className={
                                order.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                                order.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                                'bg-gray-100 text-gray-800'
                              }>
                                {order.status ?? ''}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={async () => {
                                setSelectedPhysio(order);
                                setLoadingPhysioSessions(true);
                                try {
                                  const sessions = await physioService.getSessions({ order: order.id });
                                  // Only show completed sessions - no fallback
                                  const completedSessions = (sessions.results || []).filter((s: any) => s.status === 'completed');
                                  setSelectedPhysioSessions(completedSessions);
                                  if (completedSessions.length > 0) {
                                    setSelectedPhysioSession(completedSessions[0]);
                                  } else {
                                    setSelectedPhysioSession(null);
                                  }
                                } catch (err) {
                                  console.error('Error loading physio sessions:', err);
                                  toast.error('Failed to load session details');
                                  setSelectedPhysioSessions([]);
                                  setSelectedPhysioSession(null);
                                } finally {
                                  setLoadingPhysioSessions(false);
                                }
                              }}>
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Ward Admissions Tab */}
              <TabsContent value="wards" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading ward admissions...</p>
                  </div>
                ) : wardAdmissions.length === 0 ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <Building2 className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No ward admissions found</p>
                    <p className="text-sm text-muted-foreground">Ward admission history will appear here</p>
                  </div>
                ) : (
                  <div className="border rounded-lg overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="px-4 py-2 text-left font-medium">Admission Date</th>
                          <th className="px-4 py-2 text-left font-medium">Ward</th>
                          <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                          <th className="px-4 py-2 text-left font-medium">Days</th>
                          <th className="px-4 py-2 text-left font-medium">Status</th>
                          <th className="px-4 py-2 text-center font-medium">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {wardAdmissions.map((admission: any) => (
                          <tr key={admission.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(admission.admission_date)} {formatTime(admission.admission_date)}
                            </td>
                            <td className="px-4 py-3">
                              <div className="font-medium">{admission.ward_name ?? ''}</div>
                              <div className="text-xs text-muted-foreground">{admission.admission_type ?? ''}</div>
                            </td>
                            <td className="px-4 py-3">
                              <p className="text-sm max-w-[200px] truncate" title={admission.admission_diagnosis ?? ''}>
                                {admission.admission_diagnosis ?? ''}
                              </p>
                            </td>
                            <td className="px-4 py-3">{admission.length_of_stay ?? 0} days</td>
                            <td className="px-4 py-3">
                              <Badge className={`${
                                admission.status === 'admitted' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' :
                                admission.status === 'discharged' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {admission.status ?? ''}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => { setSelectedWard(admission); }}>
                                <Eye className="h-4 w-4 mr-1" /> View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </TabsContent>

              {/* Background Tab */}
              <TabsContent value="background" className="mt-4">
                {loadingHistory ? (
                  <div className="text-center py-12">
                    <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Loading medical history...</p>
                  </div>
                ) : !medicalHistory ? (
                  <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                    <User className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                    <p className="font-medium text-muted-foreground mb-1">No medical history recorded</p>
                    <p className="text-sm text-muted-foreground">Medical history will appear here once recorded</p>
                  </div>
                ) : (
                  <div className="grid gap-4 md:grid-cols-2">
                    {/* Allergies */}
                    <Card className={medicalHistory.allergies && medicalHistory.allergies.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-muted'}>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <AlertTriangle className={`h-4 w-4 ${medicalHistory.allergies && medicalHistory.allergies.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                          Allergies
                          {medicalHistory.allergies && medicalHistory.allergies.length > 0 && (
                            <Badge variant="outline" className="ml-auto bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                              {medicalHistory.allergies.length}
                            </Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {medicalHistory.allergies && medicalHistory.allergies.length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {medicalHistory.allergies.map((allergy: string, index: number) => (
                              <Badge key={index} className="bg-red-600 text-white hover:bg-red-700">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                {allergy}
                              </Badge>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-sm text-muted-foreground">
                            <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p>No known allergies</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Chronic Conditions */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Stethoscope className="h-4 w-4 text-amber-500" />
                          Chronic Conditions
                          {medicalHistory.diagnoses && medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length > 0 && (
                            <Badge variant="outline" className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                              {medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length}
                            </Badge>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {medicalHistory.diagnoses && medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length > 0 ? (
                          <div className="flex flex-wrap gap-2">
                            {medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').map((diagnosis: { name: string; code?: string; diagnosedDate?: string }, index: number) => (
                              <div key={index} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                                    {diagnosis.code ?? ''}
                                  </Badge>
                                  <span className="font-medium text-sm">{diagnosis.name}</span>
                                </div>
                                {diagnosis.diagnosedDate && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    Diagnosed: {diagnosis.diagnosedDate}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4 text-sm text-muted-foreground">
                            <Stethoscope className="h-6 w-6 mx-auto mb-2 opacity-50" />
                            <p>No active chronic conditions</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Surgical History */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <Activity className="h-4 w-4 text-rose-500" />
                          Surgical History
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {medicalHistory.surgical_history && medicalHistory.surgical_history.length > 0 ? (
                          <div className="space-y-3">
                            {medicalHistory.surgical_history.map((surgery: { procedure: string; date: string; hospital?: string }, index: number) => (
                              <div key={index} className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                                <div className="flex items-start justify-between mb-1">
                                  <span className="font-medium text-sm">{surgery.procedure}</span>
                                  <Badge variant="outline" className="text-xs">{surgery.date}</Badge>
                                </div>
                                {surgery.hospital && (
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {surgery.hospital}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-sm text-muted-foreground">
                            <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No surgical history recorded</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Family History */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <User className="h-4 w-4 text-blue-500" />
                          Family History
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        {medicalHistory.family_history && medicalHistory.family_history.length > 0 ? (
                          <div className="space-y-3">
                            {medicalHistory.family_history.map((fh: { relation: string; condition: string }, index: number) => (
                              <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm mb-1">{fh.relation}</div>
                                    <div className="text-xs text-muted-foreground">{fh.condition}</div>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-8 text-sm text-muted-foreground">
                            <User className="h-8 w-8 mx-auto mb-2 opacity-50" />
                            <p>No family history recorded</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Social History */}
                    <Card className="md:col-span-2">
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <User className="h-4 w-4 text-emerald-500" />
                          Social History
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                            <div className="text-xs text-muted-foreground mb-2">Smoking</div>
                            <div className="font-semibold text-emerald-700 dark:text-emerald-300">{medicalHistory.social_history?.smoking ?? ''}</div>
                          </div>
                          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
                            <div className="text-xs text-muted-foreground mb-2">Alcohol</div>
                            <div className="font-semibold text-blue-700 dark:text-blue-300">{medicalHistory.social_history?.alcohol ?? ''}</div>
                          </div>
                          <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 text-center">
                            <div className="text-xs text-muted-foreground mb-2">Exercise</div>
                            <div className="font-semibold text-purple-700 dark:text-purple-300">{medicalHistory.social_history?.exercise ?? ''}</div>
                          </div>
                          {medicalHistory.social_history?.occupation && (
                            <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
                              <div className="text-xs text-muted-foreground mb-2">Occupation</div>
                              <div className="font-semibold text-amber-700 dark:text-amber-300">{medicalHistory.social_history.occupation}</div>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardHeader>
        </Card>
      </div>
    </DashboardLayout>
  );
}
