"use client";

import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Calendar, TestTube, ScanLine, Pill, Heart,
  Activity, Building2, ClipboardList, ChevronLeft, ChevronRight,
  Loader2, AlertTriangle, FileText, Share2, User, Eye,
} from 'lucide-react';
import { usePatientHistory, type PatientHistoryData } from '@/hooks/usePatientHistory';

// --- Helpers ---

const formatDate = (d: string | undefined): string => {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString(); } catch { return ''; }
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
    case 'in_progress': case 'admitted': case 'reported': return 'bg-blue-500/10 text-blue-600';
    case 'scheduled': return 'bg-amber-500/10 text-amber-600';
    case 'critical': return 'bg-rose-500/10 text-rose-600';
    case 'abnormal': return 'bg-amber-500/10 text-amber-600';
    case 'cancelled': return 'bg-gray-500/10 text-gray-600';
    default: return 'bg-gray-500/10 text-gray-600';
  }
};

const purposeLabel: Record<string, string> = {
  fitness: 'FITNESS FOR DUTY',
  illness: 'UNFIT FOR WORK',
  travel: 'FIT TO TRAVEL',
  employment: 'FIT FOR EMPLOYMENT',
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
  backgroundExtra,
}: PatientHistoryTabsProps) {
  const fetched = usePatientHistory(initialData ? null : patientId);
  const data = initialData ?? fetched.data;
  const loading = fetched.loading;

  // --- Pagination ---
  const [consultationsPage, setConsultationsPage] = useState(1);
  const consultationsPerPage = 10;
  const totalConsultationPages = Math.ceil(data.consultations.length / consultationsPerPage);
  const paginatedConsultations = data.consultations.slice(
    (consultationsPage - 1) * consultationsPerPage,
    consultationsPage * consultationsPerPage
  );

  // --- Tabs definition ---
  const tabs = useMemo(() => {
    const all: { value: string; label: string; icon: typeof Calendar; count?: number }[] = [];
    if (showVisits) all.push({ value: 'visits', label: 'Visits', icon: Calendar, count: data.visits.length });
    all.push({ value: 'consultations', label: 'Consultations', icon: ClipboardList, count: data.consultations.length });
    all.push({ value: 'labs', label: 'Lab Results', icon: TestTube, count: data.labResults.length });
    all.push({ value: 'imaging', label: 'Imaging', icon: ScanLine, count: data.imagingOrders.length });
    all.push({ value: 'prescriptions', label: 'Prescriptions', icon: Pill, count: data.prescriptions.length });
    all.push({ value: 'vitals', label: 'Vitals', icon: Heart, count: data.vitals.length });
    all.push({ value: 'physio', label: 'Physio', icon: Activity, count: data.physioOrders.length });
    all.push({ value: 'eye', label: 'Eye Care', icon: Eye, count: data.eyeOrders.length });
    all.push({ value: 'wards', label: compact ? 'Wards' : 'Ward Admissions', icon: Building2, count: data.wardAdmissions.length });
    if (showCertificates) all.push({ value: 'certificates', label: 'Certificates', icon: FileText, count: data.certificates.length });
    if (showReferrals) all.push({ value: 'referrals', label: 'Referrals', icon: Share2, count: data.referrals.length });
    if (showBackground) all.push({ value: 'background', label: 'Background', icon: User });
    return all;
  }, [showVisits, showCertificates, showReferrals, showBackground, data, compact]);

  if (loading && !initialData) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-3 text-muted-foreground">Loading patient history...</span>
      </div>
    );
  }

  // --- Default view handler if no override provided ---
  const defaultViewHandler = (label: string) => () => {
    // No-op: the consumer either provides a handler or uses the built-in modals
    // We trust the consumer wired it up
  };

  const triggerView = (handler: ((item: any) => void) | undefined, item: any) => {
    if (handler) handler(item);
  };

  return (
    <Card>
      <CardHeader className={compact ? 'pb-0' : ''}>
        <Tabs value={tabProp} defaultValue={tabProp ? undefined : defaultTab} onValueChange={onTabChange} className="w-full">
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
                        <th className="px-4 py-2 text-left font-medium">Time</th>
                        <th className="px-4 py-2 text-left font-medium">Visit ID</th>
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
                          <td className="px-4 py-3 text-muted-foreground">{v.time || '—'}</td>
                          <td className="px-4 py-3 font-mono text-xs">{v.visit_id || v.id}</td>
                          <td className="px-4 py-3">{v.visit_type || 'OPD'}</td>
                          <td className="px-4 py-3">{v.clinic || (v.clinics ? (v.clinics as string[]).join(', ') : '—') || '—'}</td>
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
                        <th className="px-4 py-2 text-left font-medium">Clinic</th>
                        <th className="px-4 py-2 text-center font-medium">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {paginatedConsultations.map((s: any) => (
                        <tr key={s.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(s.started_at)}</td>
                          <td className="px-4 py-3">{s.doctor_name || '—'}</td>
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
              <p className="text-sm text-muted-foreground text-center py-8">No lab results found</p>
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
                    {data.labResults.map((lab: any) => (
                      <tr key={lab.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(lab.completed_at || lab.created_at)}</td>
                        <td className="px-4 py-3">
                          <div>
                            <div className="font-medium">{lab.name || lab.test_name || 'Lab Test'}</div>
                            {(lab.name || lab.test_name) && lab.panel_name && <div className="text-xs text-muted-foreground">{lab.panel_name}</div>}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusBadgeClass((lab.overall_status || lab.status || '').toLowerCase())}`}>
                            {humanizeStatus(lab.overall_status || lab.status)}
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
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.imagingOrders.map((img: any) => (
                      <tr key={img.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(img.created_at)}</td>
                        <td className="px-4 py-3 font-medium">{img.study_details?.procedure || 'Imaging'}</td>
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
                      <th className="px-4 py-2 text-left font-medium">Prescription ID</th>
                      <th className="px-4 py-2 text-left font-medium">Doctor</th>
                      <th className="px-4 py-2 text-left font-medium">Medications</th>
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.prescriptions.map((p: any) => {
                      const meds = p.medications || (p.medication_name ? [p] : []);
                      const medCount = meds.length;
                      const firstMeds = meds.slice(0, 3).map((m: any) => m.medication_name || m.medication?.name || m.medication).filter(Boolean);
                      return (
                        <tr key={p.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(p.prescribed_at || p.created_at)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{p.prescription_id || p.id}</td>
                          <td className="px-4 py-3">{p.doctor_name || '—'}</td>
                          <td className="px-4 py-3">
                            {firstMeds.join(', ')}{medCount > 3 ? ` +${medCount - 3} more` : ''}
                          </td>
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
                      <th className="px-4 py-2 text-left font-medium">Summary</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.vitals.slice(0, 20).map((v: any, i: number) => {
                      const items: { label: string; value: string; color: string }[] = [];
                      if (v.temperature) items.push({ label: 'Temp', value: `${v.temperature}°C`, color: 'bg-red-100 text-red-700' });
                      if (v.blood_pressure_systolic && v.blood_pressure_diastolic) items.push({ label: 'BP', value: `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}`, color: 'bg-blue-100 text-blue-700' });
                      if (v.heart_rate) items.push({ label: 'HR', value: `${v.heart_rate} bpm`, color: 'bg-emerald-100 text-emerald-700' });
                      if (v.oxygen_saturation) items.push({ label: 'SpO₂', value: `${v.oxygen_saturation}%`, color: 'bg-purple-100 text-purple-700' });
                      return (
                        <tr key={v.id ?? i} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(v.recorded_at)}</td>
                          <td className="px-4 py-3">
                            <div className="flex flex-wrap gap-1">
                              {items.map((it, ii) => (
                                <Badge key={ii} variant="outline" className={`text-xs ${it.color}`}>{it.label}: {it.value}</Badge>
                              ))}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Button variant="ghost" size="sm" onClick={() => triggerView(onViewVital, v)}>
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
                      <th className="px-4 py-2 text-left font-medium">Status</th>
                      <th className="px-4 py-2 text-left font-medium">Priority</th>
                      <th className="px-4 py-2 text-left font-medium">Sessions</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.eyeOrders.map((o: any) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{formatDate(o.ordered_at)}</td>
                        <td className="px-4 py-3">
                          <span className="font-medium">{o.diagnosis || o.chief_complaint || 'N/A'}</span>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="outline" className={`text-xs ${statusBadgeClass(o.status)}`}>
                            {humanizeStatus(o.status)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={o.priority === 'stat' ? 'destructive' : o.priority === 'urgent' ? 'default' : 'secondary'} className="text-xs">
                            {formatPriority(o.priority)}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{o.completed_sessions_count ?? 0}</td>
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
              {data.certificates.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">No medical certificates found</p>
              ) : (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="px-4 py-2 text-left font-medium">Issued</th>
                        <th className="px-4 py-2 text-left font-medium">Certificate No.</th>
                        <th className="px-4 py-2 text-left font-medium">Purpose</th>
                        <th className="px-4 py-2 text-left font-medium">Validity</th>
                        <th className="px-4 py-2 text-left font-medium">Sick Leave</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.certificates.map((c: any) => (
                        <tr key={c.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(c.issued_at || c.created_at)}</td>
                          <td className="px-4 py-3 font-mono text-xs">{c.certificate_number || c.id}</td>
                          <td className="px-4 py-3">{purposeLabel[c.purpose] || c.purpose || '—'}</td>
                          <td className="px-4 py-3">{c.valid_until ? `${formatDate(c.valid_from)} – ${formatDate(c.valid_until)}` : '—'}</td>
                          <td className="px-4 py-3">{c.sick_leave_days ?? '—'}</td>
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
                        <th className="px-4 py-2 text-left font-medium">Urgency</th>
                        <th className="px-4 py-2 text-left font-medium">Status</th>
                        <th className="px-4 py-2 text-left font-medium">Referred By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.referrals.map((r: any) => (
                        <tr key={r.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 text-muted-foreground">{formatDate(r.referred_at)}</td>
                          <td className="px-4 py-3">{r.facility || '—'}</td>
                          <td className="px-4 py-3">{r.specialty || '—'}</td>
                          <td className="px-4 py-3">
                            <Badge variant={r.urgency === 'urgent' ? 'destructive' : 'secondary'} className="text-xs">
                              {r.urgency || '—'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs ${statusBadgeClass((r.status || '').toLowerCase())}`}>
                              {humanizeStatus(r.status)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">{r.referred_by_name || r.created_by_name || '—'}</td>
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
  );
}
