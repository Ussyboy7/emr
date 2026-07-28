"use client";

import { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar, TestTube, ScanLine, Pill, Heart,
  Activity, Building2, ClipboardList, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, FileText, Share2, User, Eye, ClipboardCheck, FolderOpen, Plus,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatDisplayDate } from '@/lib/dates';
import { usePatientHistory, type PatientHistoryData } from '@/hooks/usePatientHistory';
import { printMedicalCertificatePdf } from '@/lib/medical-records/medicalCertificatePdf';
import { PatientHistoryReferralViewDialog } from '@/components/patient-history/PatientHistoryReferralViewDialog';
import { AddClinicalDocumentDialog } from '@/components/medical-records/AddClinicalDocumentDialog';
import { BulkClinicalDocumentsDialog } from '@/components/medical-records/BulkClinicalDocumentsDialog';
import { openMediaInNewTab } from '@/lib/media-url';
import { referralStatusLabel, getStatusBadgeClass } from '@/lib/referrals/referral-helpers';
import type { AnnualCheckup } from '@/lib/services/annual-checkup-service';
import type { ClinicalDocumentType } from '@/lib/services/patient-service';

// --- Helpers ---

const formatDate = (d: string | undefined): string => {
  if (!d) return '';
  const formatted = formatDisplayDate(d);
  return formatted === '—' ? '' : formatted;
};

const formatPriority = (p: string | undefined): string => {
  if (!p) return '';
  const s = p.toLowerCase();
  if (s === 'stat') return 'STAT';
  if (s === 'urgent') return 'Urgent';
  if (s === 'routine') return 'Routine';
  return p;
};

const humanizeStatus = (v: unknown): string => {
  const s = String(v ?? '').trim();
  if (!s) return '';
  return s.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
};

const statusBadgeClass = (status: string): string => {
  switch (status) {
    case 'completed': case 'discharged': case 'verified': case 'normal': return 'bg-emerald-500/10 text-emerald-600';
    case 'in_progress': case 'admitted': case 'reported': case 'results_ready': return 'bg-blue-500/10 text-blue-600';
    case 'scheduled': return 'bg-amber-500/10 text-amber-600';
    case 'critical': return 'bg-rose-500/10 text-rose-600';
    case 'abnormal': return 'bg-amber-500/10 text-amber-600';
    case 'cancelled': return 'bg-gray-500/10 text-gray-600';
    default: return 'bg-gray-500/10 text-gray-600';
  }
};

const purposeLabel: Record<string, string> = {
  fitness: 'Fitness certificate',
  illness: 'Illness / sick leave',
  travel: 'Travel medical',
  employment: 'Employment medical',
};

// --- Pagination ---

function Pagination({ page, totalPages, setPage }: { page: number; totalPages: number; setPage: (p: number) => void }) {
  if (totalPages <= 1) return null;
  const pages = Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
    if (totalPages <= 5) return i + 1;
    const half = Math.floor(5 / 2);
    if (page <= half) return i + 1;
    if (page >= totalPages - half) return totalPages - 4 + i;
    return page - half + i;
  });
  return (
    <div className="flex items-center gap-2">
      <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)}>
        <ChevronLeft className="h-4 w-4" /> Previous
      </Button>
      {pages.map(p => (
        <Button key={p} variant={page === p ? 'default' : 'outline'} size="sm" className="w-8 h-8 p-0" onClick={() => setPage(p)}>
          {p}
        </Button>
      ))}
      <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)}>
        Next <ChevronRight className="h-4 w-4" />
      </Button>
    </div>
  );
}

// --- Props ---

export interface PatientHistoryTabsProps {
  patientId: number;
  /** Tab visibility flags */
  showVisits?: boolean;
  showCertificates?: boolean;
  showReferrals?: boolean;
  showBackground?: boolean;
  showDocuments?: boolean;
  allowDocumentActions?: boolean;
  /** Show Annual Check-up tab (typically for employees) */
  showAnnual?: boolean;
  scheduleCheckupHref?: string;
  /** Pre-fetched data (component won't fetch its own) */
  initialData?: PatientHistoryData;
  compact?: boolean;
  /** Active tab (for controlled usage) */
  tab?: string;
  /** Tab change handler (for controlled usage) */
  onTabChange?: (tab: string) => void;
  /** Default tab (uncontrolled usage, default 'consultations') */
  defaultTab?: string;
  /** Custom view handlers — if provided they replace built-in dialogs for that tab */
  onViewConsultation?: (session: any) => void;
  onViewVisit?: (visit: any) => void;
  onViewPrescription?: (prescription: any) => void;
  onViewVital?: (vital: any) => void;
  onViewLab?: (lab: any) => void;
  onViewImaging?: (imaging: any) => void;
  onViewPhysio?: (order: any) => void;
  onViewEyeOrder?: (order: any) => void;
  onViewWard?: (admission: any) => void;
  onViewAnnualCheckup?: (checkup: AnnualCheckup) => void;
  onViewReferral?: (referral: any) => void;
  /** Opens medical certificate issue flow (patient record context). */
  onIssueCertificate?: () => void;
  /** Opens add clinical document dialog (patient record context). */
  onAddDocument?: () => void;
  /** Bump to refetch history after certificate create, etc. */
  historyReloadToken?: number;
  /** Called after referral issue/submit from the view dialog. */
  onReferralUpdated?: () => void;
  /** Extra content rendered at top of Background tab */
  backgroundExtra?: React.ReactNode;
}

// --- Component ---

export function PatientHistoryTabs({
  patientId,
  showVisits = false,
  showCertificates = false,
  showReferrals = false,
  showBackground = false,
  showDocuments = false,
  allowDocumentActions = true,
  showAnnual = false,
  scheduleCheckupHref,
  initialData,
  compact = false,
  tab: tabProp,
  onTabChange,
  defaultTab = 'consultations',
  onViewConsultation,
  onViewVisit,
  onViewPrescription,
  onViewVital,
  onViewLab,
  onViewImaging,
  onViewPhysio,
  onViewEyeOrder,
  onViewWard,
  onViewAnnualCheckup,
  onViewReferral,
  onIssueCertificate,
  onAddDocument,
  historyReloadToken,
  onReferralUpdated,
  backgroundExtra,
}: PatientHistoryTabsProps) {
  const fetched = usePatientHistory(initialData ? null : patientId);
  const data = initialData ?? fetched.data;
  const loading = fetched.loading;

  const reloadHistory = useCallback(() => {
    onReferralUpdated?.();
    if (!initialData) {
      fetched.reload();
    }
  }, [onReferralUpdated, initialData, fetched.reload]);

  useEffect(() => {
    if (historyReloadToken == null || initialData) return;
    fetched.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyReloadToken, initialData]);

  // --- Pagination ---
  const [consultationsPage, setConsultationsPage] = useState(1);
  const consultationsPerPage = 10;
  const totalConsultationPages = Math.ceil(data.consultations.length / consultationsPerPage);
  const paginatedConsultations = data.consultations.slice(
    (consultationsPage - 1) * consultationsPerPage,
    consultationsPage * consultationsPerPage
  );
  const [viewingCertId, setViewingCertId] = useState<number | null>(null);
  const [localTab, setLocalTab] = useState(defaultTab);
  const activeTab = tabProp ?? localTab;
  const [referralViewId, setReferralViewId] = useState<number | null>(null);
  const [referralViewRefreshKey, setReferralViewRefreshKey] = useState(0);
  const [referralDialogOpen, setReferralDialogOpen] = useState(false);
  const [addDocOpen, setAddDocOpen] = useState(false);
  const [bulkDocOpen, setBulkDocOpen] = useState(false);
  const [viewingDocId, setViewingDocId] = useState<number | null>(null);
  const previousControlledTabRef = useRef<string | undefined>(undefined);
  const [docPrefill, setDocPrefill] = useState<{
    referralId?: number | null;
    docType?: ClinicalDocumentType;
  }>({});

  const handleSubTabChange = (value: string) => {
    if (!tabProp) setLocalTab(value);
    onTabChange?.(value);
    if (value === 'referrals' && showReferrals) {
      reloadHistory();
    }
  };

  useEffect(() => {
    const previousTab = previousControlledTabRef.current;
    previousControlledTabRef.current = tabProp;
    if (tabProp === 'referrals' && showReferrals && previousTab !== 'referrals') {
      reloadHistory();
    }
  }, [tabProp, showReferrals, reloadHistory]);

  const handleViewReferral = (referral: { id?: number }) => {
    if (onViewReferral) {
      triggerView(onViewReferral, referral);
      return;
    }
    if (!referral.id) return;
    setReferralViewId(referral.id);
    setReferralViewRefreshKey((n) => n + 1);
    setReferralDialogOpen(true);
  };

  const handleViewCertificate = async (cert: { id?: number }) => {
    if (!cert.id) return;
    setViewingCertId(cert.id);
    try {
      await printMedicalCertificatePdf(cert.id);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to open certificate PDF.');
    } finally {
      setViewingCertId(null);
    }
  };

  const handleViewDocument = async (doc: { id?: number; file?: string }) => {
    if (!doc.file) {
      toast.error('No file attached');
      return;
    }
    setViewingDocId(doc.id ?? null);
    try {
      await openMediaInNewTab(doc.file);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to open document');
    } finally {
      setViewingDocId(null);
    }
  };

  const openAddDocument = () => {
    if (onAddDocument) {
      onAddDocument();
      return;
    }
    setDocPrefill({});
    setAddDocOpen(true);
  };

  const handleAttachReferralReturnDoc = (referral: any) => {
    const specialty = String(referral?.specialty || '').toLowerCase();
    const facility = String(referral?.facility || '').toLowerCase();
    const hint = `${specialty} ${facility}`;
    const docType: ClinicalDocumentType =
      hint.includes('lab')
        ? 'lab'
        : hint.includes('radio') || hint.includes('xray') || hint.includes('scan') || hint.includes('imaging')
          ? 'radiology'
          : 'consultation_report';
    setDocPrefill({
      referralId: typeof referral?.id === 'number' ? referral.id : null,
      docType,
    });
    setAddDocOpen(true);
  };

  // --- Tabs definition ---
  const tabs = useMemo(() => {
    const all: { value: string; label: string; icon: typeof Calendar; count?: number }[] = [];
    if (showVisits) all.push({ value: 'visits', label: 'Visits', icon: Calendar, count: data.visits.length });
    if (showAnnual || data.annualCheckups.length > 0) {
      all.push({
        value: 'annual',
        label: 'Annual',
        icon: ClipboardCheck,
        count: data.annualCheckups.length,
      });
    }
    all.push({ value: 'consultations', label: 'Consultations', icon: ClipboardList, count: data.consultations.length });
    all.push({ value: 'labs', label: 'Lab Results', icon: TestTube, count: data.labResults.length });
    all.push({ value: 'imaging', label: 'Imaging', icon: ScanLine, count: data.imagingOrders.length });
    all.push({ value: 'prescriptions', label: 'Prescriptions', icon: Pill, count: data.prescriptions.length });
    all.push({ value: 'vitals', label: 'Vitals', icon: Heart, count: data.vitals.length });
    all.push({ value: 'physio', label: 'Physio', icon: Activity, count: data.physioOrders.length });
    all.push({ value: 'eye', label: 'Eye Care', icon: Eye, count: data.eyeOrders.length });
    all.push({ value: 'wards', label: compact ? 'Wards' : 'Ward Admissions', icon: Building2, count: data.wardAdmissions.length });
    if (showCertificates) all.push({ value: 'certificates', label: 'Certificates', icon: FileText, count: data.certificates.length });
    if (showDocuments) {
      all.push({
        value: 'documents',
        label: 'Documents',
        icon: FolderOpen,
        count: data.clinicalDocuments?.length ?? 0,
      });
    }
    if (showReferrals) all.push({ value: 'referrals', label: 'Referrals', icon: Share2, count: data.referrals.length });
    if (showBackground) all.push({ value: 'background', label: 'Background', icon: User });
    return all;
  }, [showVisits, showAnnual, showCertificates, showDocuments, showReferrals, showBackground, data, compact]);

  if (loading && !initialData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading patient history...</span>
      </div>
    );
  }

  const triggerView = (handler: ((item: any) => void) | undefined, item: any) => {
    if (handler) handler(item);
  };

  return (
    <>
    <Card>
      <CardHeader className={compact ? 'pb-0' : ''}>
        <Tabs value={activeTab} onValueChange={handleSubTabChange} className="w-full">
          <TabsList className="mb-1 flex h-auto w-full flex-wrap items-center justify-start gap-1 overflow-visible rounded-md bg-muted p-1 text-muted-foreground">
            {tabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="shrink-0 gap-1 px-2 py-1 text-xs whitespace-nowrap">
                <tab.icon className="h-3 w-3" />
                {tab.label}{tab.count != null ? ` (${tab.count})` : ''}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Visits */}
          {showVisits && (
            <TabsContent value="visits" className="mt-4">
              {data.visits.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No visit records found</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-left font-medium">Type</th>
                        <th className="px-4 py-2 text-left font-medium">Clinics</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.visits.map((v: any) => (
                        <tr key={v.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{v.date || '—'}</td>
                          <td className="px-4 py-3">{v.visit_type || 'OPD'}</td>
                          <td className="px-4 py-3">
                            {Array.isArray(v.clinics) && v.clinics.length
                              ? (v.clinics as string[]).join(', ')
                              : (v.location_clinic_name || '—')}
                          </td>
                          <td className="px-4 py-3"><Badge variant="outline" className={`text-xs ${statusBadgeClass(v.status)}`}>{humanizeStatus(v.status)}</Badge></td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => triggerView(onViewVisit, v)}>
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
          )}

          {/* Annual check-ups */}
          {(showAnnual || data.annualCheckups.length > 0) && (
            <TabsContent value="annual" className="mt-4">
              {data.annualCheckups.length === 0 ? (
                <div className="py-10 text-center space-y-3">
                  <p className="text-sm text-muted-foreground">No annual check-up records found</p>
                  {scheduleCheckupHref ? (
                    <Button variant="outline" size="sm" asChild>
                      <a href={scheduleCheckupHref}>Schedule annual check-up</a>
                    </Button>
                  ) : null}
                </div>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-left font-medium">Programme</th>
                        <th className="px-4 py-2 text-left font-medium">Doctor</th>
                        <th className="px-4 py-2 text-left font-medium">Outcome</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {[...data.annualCheckups]
                        .sort((a, b) => (b.programme_year || 0) - (a.programme_year || 0))
                        .map((checkup) => (
                          <tr key={checkup.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 text-muted-foreground">
                              {formatDate(checkup.visit_date)}
                            </td>
                            <td className="px-4 py-3">{checkup.programme_year}</td>
                            <td className="px-4 py-3">{checkup.signed_off_by_name || '—'}</td>
                            <td className="px-4 py-3">
                              {checkup.status === 'completed'
                                ? checkup.fitness_outcome_display || 'Completed'
                                : '—'}
                            </td>
                            <td className="px-4 py-3">
                              <Badge
                                variant="outline"
                                className={`text-xs ${statusBadgeClass(checkup.status)}`}
                              >
                                {checkup.status === 'completed'
                                  ? 'Completed'
                                  : checkup.status === 'cancelled'
                                    ? 'Cancelled'
                                    : 'In progress'}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => triggerView(onViewAnnualCheckup, checkup)}
                              >
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
          )}

          {/* Consultations */}
          <TabsContent value="consultations" className="mt-4">
            {data.consultations.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No consultation records found</p>
            ) : (
              <>
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-left font-medium">Doctor</th>
                        <th className="px-4 py-2 text-left font-medium">Location</th>
                        <th className="px-4 py-2 text-left font-medium">Clinic</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {paginatedConsultations.map((s: any) => (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(s.started_at)}</td>
                          <td className="px-4 py-3">{s.doctor_name || '—'}</td>
                          <td className="px-4 py-3">{s.location_clinic_name || '—'}</td>
                          <td className="px-4 py-3">{s.clinic_name || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => triggerView(onViewConsultation, s)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="flex items-center justify-between mt-3">
                  <p className="text-sm text-muted-foreground">
                    Showing {(consultationsPage - 1) * consultationsPerPage + 1}–{Math.min(data.consultations.length, consultationsPage * consultationsPerPage)} of {data.consultations.length}
                  </p>
                  <Pagination page={consultationsPage} totalPages={totalConsultationPages} setPage={setConsultationsPage} />
                </div>
              </>
            )}
          </TabsContent>

          {/* Lab Results */}
          <TabsContent value="labs" className="mt-4">
            {data.labResults.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">
                No lab results with entered or verified results found
              </p>
            ) : (
              <>
              <p className="text-xs text-muted-foreground mb-3">
                Tests with results entered or verified only — pending orders are not listed here.
              </p>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Test</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.labResults.map((lab: any) => (
                      <tr key={lab.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(lab.completed_at || lab.created_at)}</td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium">{lab.name || lab.test_name || 'Lab Test'}</div>
                            {(lab.name || lab.test_name) && lab.panel_name && <div className="text-xs text-muted-foreground">{lab.panel_name}</div>}
                          </div>
                        </td>
                        <td className="px-4 py-3">{lab.location_clinic_name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusBadgeClass((lab.status || lab.overall_status || '').toLowerCase())}`}>
                            {humanizeStatus(lab.status || lab.overall_status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm" onClick={() => triggerView(onViewLab, lab)}>
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              </>
            )}
          </TabsContent>

          {/* Imaging */}
          <TabsContent value="imaging" className="mt-4">
            {data.imagingOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No imaging results found</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Procedure</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.imagingOrders.map((img: any) => (
                      <tr key={img.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(img.created_at)}</td>
                        <td className="px-4 py-3 font-medium">{img.study_details?.procedure || 'Imaging'}</td>
                        <td className="px-4 py-3">{img.location_clinic_name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusBadgeClass((img.study_details?.overall_status || img.study_details?.status || '').toLowerCase())}`}>
                            {humanizeStatus(img.study_details?.overall_status || img.study_details?.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm" onClick={() => triggerView(onViewImaging, img)}>
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

          {/* Prescriptions */}
          <TabsContent value="prescriptions" className="mt-4">
            {data.prescriptions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No prescriptions found</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Doctor</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.prescriptions.map((p: any) => {
                      return (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(p.prescribed_at || p.created_at)}</td>
                          <td className="px-4 py-3">{p.doctor_name || '—'}</td>
                          <td className="px-4 py-3">{p.location_clinic_name || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${statusBadgeClass((p.status || '').toLowerCase())}`}>
                              {humanizeStatus(p.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => triggerView(onViewPrescription, p)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Vitals */}
          <TabsContent value="vitals" className="mt-4">
            {data.vitals.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No vitals recorded</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Recorded By</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.vitals.slice(0, 20).map((v: any, i: number) => (
                        <tr key={v.id ?? i} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(v.recorded_at)}</td>
                          <td className="px-4 py-3">{v.recorded_by_name || '—'}</td>
                          <td className="px-4 py-3">{v.location_clinic_name || '—'}</td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => triggerView(onViewVital, v)}>
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

          {/* Physio */}
          <TabsContent value="physio" className="mt-4">
            {data.physioOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No physiotherapy orders found</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.physioOrders.map((o: any) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(o.ordered_at)}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{o.diagnosis || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-3">{o.location_clinic_name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusBadgeClass(o.status)}`}>
                            {humanizeStatus(o.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm" onClick={() => triggerView(onViewPhysio, o)}>
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

          {/* Eye */}
          <TabsContent value="eye" className="mt-4">
            {data.eyeOrders.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No eye care orders found</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.eyeOrders.map((o: any) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(o.ordered_at)}</td>
                        <td className="px-4 py-3 font-medium">{o.diagnosis || '—'}</td>
                        <td className="px-4 py-3">{o.location_clinic_name || '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusBadgeClass(o.status)}`}>
                            {humanizeStatus(o.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm" onClick={() => triggerView(onViewEyeOrder, o)}>
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

          {/* Wards */}
          <TabsContent value="wards" className="mt-4">
            {data.wardAdmissions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No ward admissions found</p>
            ) : (
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Admitted</th>
                      <th className="px-4 py-2 text-left font-medium">Ward</th>
                      <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                      <th className="px-4 py-2 text-left font-medium">Location</th>
                      <th className="px-4 py-2 text-left font-medium">Days</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.wardAdmissions.map((a: any) => {
                      const admitted = a.admitted_at ? new Date(a.admitted_at) : null;
                      const discharged = a.discharged_at ? new Date(a.discharged_at) : null;
                      const days = admitted ? Math.ceil(((discharged || new Date()).getTime() - admitted.getTime()) / (1000 * 60 * 60 * 24)) : 0;
                      return (
                        <tr key={a.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(a.admitted_at)}</td>
                          <td className="px-4 py-3 font-medium">{a.ward_name || '—'}</td>
                          <td className="px-4 py-3">{a.diagnosis || a.history || '—'}</td>
                          <td className="px-4 py-3">{a.location_clinic_name || '—'}</td>
                          <td className="px-4 py-3 text-muted-foreground">{days} days</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${statusBadgeClass(a.status)}`}>
                              {humanizeStatus(a.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => triggerView(onViewWard, a)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>

          {/* Certificates */}
          {showCertificates && (
            <TabsContent value="certificates" className="mt-4">
              {onIssueCertificate && (
                <div className="flex justify-end mb-3">
                  <Button type="button" size="sm" variant="outline" onClick={onIssueCertificate}>
                    <FileText className="h-4 w-4 mr-2" />
                    Issue certificate
                  </Button>
                </div>
              )}
              {data.certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No medical certificates found</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Issued</th>
                        <th className="px-4 py-2 text-left font-medium">Purpose</th>
                        <th className="px-4 py-2 text-left font-medium">Validity</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.certificates.map((c: any) => (
                        <tr key={c.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(c.issued_at || c.created_at)}</td>
                          <td className="px-4 py-3">{purposeLabel[c.purpose] || c.purpose || '—'}</td>
                          <td className="px-4 py-3">
                            {c.valid_from && (c.valid_to || c.valid_until)
                              ? `${formatDate(c.valid_from)} – ${formatDate(c.valid_to || c.valid_until)}`
                              : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={viewingCertId === c.id}
                              onClick={() => { void handleViewCertificate(c); }}
                            >
                              {viewingCertId === c.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Eye className="h-4 w-4 mr-1" />
                              )}
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          )}

          {/* Clinical documents (scanned / external) */}
          {showDocuments && (
            <TabsContent value="documents" className="mt-4">
              {allowDocumentActions ? (
                <div className="flex justify-end mb-3">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" onClick={() => setBulkDocOpen(true)}>
                      <FolderOpen className="h-4 w-4 mr-2" />
                      Bulk scan
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={openAddDocument}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add document
                    </Button>
                  </div>
                </div>
              ) : null}
              {(data.clinicalDocuments?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No scanned or external documents yet
                </p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-left font-medium">Type</th>
                        <th className="px-4 py-2 text-left font-medium">Source</th>
                        <th className="px-4 py-2 text-left font-medium">Title / facility</th>
                        <th className="px-4 py-2 text-left font-medium">Uploaded by</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {(data.clinicalDocuments || []).map((d: any) => (
                        <tr key={d.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(d.document_date)}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className="text-xs">
                              {d.doc_type_display || humanizeStatus(d.doc_type)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge className="text-xs bg-slate-500/10 text-slate-700">
                              {d.source_display || humanizeStatus(d.source)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <p className="font-medium">{d.title || d.original_filename || '—'}</p>
                            {(d.facility || d.referral_id_display) && (
                              <p className="text-xs text-muted-foreground">
                                {[d.facility, d.referral_id_display].filter(Boolean).join(' · ')}
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-3 text-muted-foreground">
                            {d.uploaded_by_name_snapshot || '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              disabled={viewingDocId === d.id}
                              onClick={() => { void handleViewDocument(d); }}
                            >
                              {viewingDocId === d.id ? (
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                              ) : (
                                <Eye className="h-4 w-4 mr-1" />
                              )}
                              View
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </TabsContent>
          )}

          {/* Referrals */}
          {showReferrals && (
            <TabsContent value="referrals" className="mt-4">
              {data.referrals.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No referrals found</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Date</th>
                        <th className="px-4 py-2 text-left font-medium">Facility</th>
                        <th className="px-4 py-2 text-left font-medium">Specialty</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        {allowDocumentActions ? (
                          <th className="px-4 py-2 text-center font-medium">Return doc</th>
                        ) : null}
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.referrals.map((r: any) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(r.referred_at)}</td>
                          <td className="px-4 py-3">{r.facility || '—'}</td>
                          <td className="px-4 py-3">{r.specialty || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${getStatusBadgeClass(r.status || '')}`}>
                              {referralStatusLabel(r.status)}
                            </Badge>
                          </td>
                          {allowDocumentActions ? (
                            <td className="px-4 py-3 text-center">
                              <Button variant="ghost" size="sm" onClick={() => handleAttachReferralReturnDoc(r)}>
                                <FolderOpen className="h-4 w-4 mr-1" /> Attach
                              </Button>
                            </td>
                          ) : null}
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => handleViewReferral(r)}>
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
          )}

          {/* Background */}
          {showBackground && (
            <TabsContent value="background" className="mt-4">
              {backgroundExtra}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card className={data.medicalHistory?.allergies?.length ? 'border-red-200 dark:border-red-800' : ''}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Allergies</CardTitle></CardHeader>
                  <CardContent>
                    {data.medicalHistory?.allergies?.length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {data.medicalHistory.allergies.map((a: string, i: number) => (
                          <Badge key={i} className="bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">{a}</Badge>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No known allergies</p>
                    )}
                  </CardContent>
                </Card>
                <Card className={data.medicalHistory?.chronic_conditions?.length ? 'border-amber-200 dark:border-amber-800' : ''}>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Chronic Conditions</CardTitle></CardHeader>
                  <CardContent>
                    {data.medicalHistory?.chronic_conditions?.length > 0 ? (
                      <ul className="text-sm space-y-1">
                        {data.medicalHistory.chronic_conditions.map((c: string, i: number) => (
                          <li key={i} className="flex items-center gap-2"><AlertTriangle className="h-3 w-3 text-amber-500" />{c}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-muted-foreground">None reported</p>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Surgical History</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm">{data.medicalHistory?.surgical_history || 'None reported'}</p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Family History</CardTitle></CardHeader>
                  <CardContent>
                    <p className="text-sm">{data.medicalHistory?.family_history || 'None reported'}</p>
                  </CardContent>
                </Card>
                <Card className="md:col-span-2">
                  <CardHeader className="pb-2"><CardTitle className="text-sm">Social History</CardTitle></CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <p className="text-xs text-muted-foreground">Smoking</p>
                        <p className="font-medium">{data.medicalHistory?.smoking_status || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Alcohol</p>
                        <p className="font-medium">{data.medicalHistory?.alcohol_consumption || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Exercise</p>
                        <p className="font-medium">{data.medicalHistory?.exercise_frequency || '—'}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Occupation</p>
                        <p className="font-medium">{data.medicalHistory?.occupation || '—'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardHeader>
    </Card>
    {!onViewReferral ? (
      <PatientHistoryReferralViewDialog
        open={referralDialogOpen}
        onOpenChange={setReferralDialogOpen}
        referralId={referralViewId}
        refreshKey={referralViewRefreshKey}
        onReferralUpdated={reloadHistory}
      />
    ) : null}
    {!onAddDocument && showDocuments && allowDocumentActions ? (
      <AddClinicalDocumentDialog
        open={addDocOpen}
        onOpenChange={setAddDocOpen}
        patientNumericId={patientId}
        defaultReferralId={docPrefill.referralId}
        defaultDocType={docPrefill.docType}
        onUploaded={() => {
          reloadHistory();
        }}
      />
    ) : null}
    {!onAddDocument && showDocuments && allowDocumentActions ? (
      <BulkClinicalDocumentsDialog
        open={bulkDocOpen}
        onOpenChange={setBulkDocOpen}
        patientNumericId={patientId}
        onUploaded={() => {
          reloadHistory();
        }}
      />
    ) : null}
    </>
  );
}
