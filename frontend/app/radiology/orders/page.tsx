"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { MAX_LIST_PAGE_SIZE, DEFAULT_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { getMediaUrl, openMediaInNewTab } from '@/lib/media-url';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { toast } from 'sonner';
import { useRadiologyUrlSync } from '@/hooks/use-radiology-url-sync';
import { useRadiologyPageAuth } from '@/hooks/use-radiology-page-auth';
import { MODAL_SIZES } from '@/components/ui/modal-sizes';
import {
  findRadiologyOrdersTabForOrders,
  isValidRadiologyOrdersTab,
  orderMatchesRadiologyOrdersTab,
  radiologyOrdersTabToStudyStatus,
  RADIOLOGY_ORDERS_TAB_LABELS,
  type RadiologyOrdersTab,
} from '@/lib/radiology/radiology-workflow-search';
import {
  adminService,
  patientService,
  radiologyService,
  formatPatientGenderLabel,
  type Clinic,
  type Patient,
  type ImagingPartner,
  type RadiologyReferralDispatch,
} from '@/lib/services';
import { RAD_OTHER_TEMPLATE_CODE } from '@/lib/constants/order-template-codes';
import { PatientAvatar } from '@/components/shared/PatientAvatar';
import { resolvePatientPhoto } from '@/lib/patient-photo';
import { Icd10DiagnosesBlock } from '@/components/medical/Icd10DiagnosesBlock';
import { AdvancedDateRangeDialog } from '@/components/shared/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/shared/CustomDateRangeButton';
import { formatLocalYmd } from '@/lib/laboratory/constants';
import { useServerToday } from '@/hooks/use-server-today';
import {
  ClipboardList, Search, Eye, Calendar, Clock, Activity, CheckCircle2,
  FileBarChart, AlertTriangle, ScanLine, User, ArrowRight,
  CalendarDays, Loader2, Play, FileText,
  Beaker, Building2, Truck, RotateCcw, XCircle, TestTube, Plus, X, Stethoscope,
  Send, Printer, FileSignature, Mail, History, Hash, Pencil,
} from 'lucide-react';

import { formatDisplayDate, formatDisplayDateMedium, formatDisplayTime } from '@/lib/dates';

const formatOrderedAtDisplay = (isoString: string | undefined): string => {
  if (!isoString) return '';
  const datePart = formatDisplayDateMedium(isoString);
  const timePart = formatDisplayTime(isoString);
  if (datePart === '—') return '';
  return `${datePart}, ${timePart}`;
};

/** External/manual request: explicit flag, or form doctor present without an EMR ordering doctor. */
function isRadiologyExternalManualOrder(order: {
  source_type?: string;
  external_requesting_doctor_name?: string;
  doctor?: number | null;
  doctor_details?: { id?: number } | null;
}) {
  if (order?.source_type === 'external_manual') return true;
  const hasFormDoctor = Boolean(String(order?.external_requesting_doctor_name ?? '').trim());
  const hasEmrDoctor = Boolean(order?.doctor_details?.id ?? order?.doctor);
  return hasFormDoctor && !hasEmrDoctor;
}

type CustomRadiologyReportRow = {
  id: string;
  procedure: string;
  report: string;
  recommendations: string;
  critical: boolean;
};

const isOtherRadiologyStudy = (study?: any | null) => {
  if (!study) return false;
  const code = String(study.template_details?.code || study.template?.code || '').toUpperCase();
  const procedure = String(study.procedure || '').toUpperCase();
  return code === RAD_OTHER_TEMPLATE_CODE || procedure === 'OTHER' || procedure === 'OTHERS' || procedure.includes('OTHER');
};

const makeCustomRadiologyRowId = () => `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const createCustomRadiologyRow = (procedure = ''): CustomRadiologyReportRow => ({
  id: makeCustomRadiologyRowId(),
  procedure,
  report: '',
  recommendations: '',
  critical: false,
});

const getRadiologyReportFileUrl = (filePath?: string | null) =>
  getMediaUrl(filePath ?? '') ?? '';

const parseCustomRadiologyNames = (study: any, order?: any): string[] => {
  const existingRows = Array.isArray(study?.custom_reports) ? study.custom_reports : [];
  if (existingRows.length > 0) {
    return existingRows
      .map((row: any) => String(row?.procedure || row?.name || '').trim())
      .filter(Boolean);
  }
  const source = order?.clinical_notes || study?.procedure || '';
  return String(source)
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter((item) => item && !/^others?$/i.test(item));
};

export default function RadiologyOrdersPage() {
  const serverToday = useServerToday();
  const { ready, handleAuthError } = useRadiologyPageAuth();
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [processingFilter, setProcessingFilter] = useState<'all' | 'in_house' | 'outsourced'>('all');
  const [sourceTypeFilter, setSourceTypeFilter] = useState<'all' | 'internal_emr' | 'external_manual'>('all');
  const [activeTab, setActiveTab] = useState<RadiologyOrdersTab>('all');
  const autoTabRef = useRef<string | null>(null);

  useRadiologyUrlSync({
    search: searchQuery,
    tab: activeTab,
    defaultTab: 'all',
    onSearchFromUrl: setSearchQuery,
    onTabFromUrl: (tab) => setActiveTab(tab as RadiologyOrdersTab),
    isValidTab: isValidRadiologyOrdersTab,
  });

  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    pendingSamples: 0,
    processing: 0,
    resultsReady: 0,
    rejected: 0,
    stat: 0,
  });

  // Get study status badge color
  const getStudyStatusBadge = (status?: string) => {
    switch (status) {
      case 'pending': return 'bg-gray-500/10 text-gray-600';
      case 'processing': return 'bg-blue-500/10 text-blue-600';
      case 'reported': return 'bg-emerald-500/10 text-emerald-600';
      case 'verified': return 'bg-green-500/10 text-green-600';
      case 'rejected': return 'bg-red-500/10 text-red-600';
      default: return 'bg-gray-500/10 text-gray-600';
    }
  };

  // Order Card Component (like lab orders)
  const OrderCard = ({ order }: { order: any }) => {
    const orderStatus = getOrderStatus(order);
    const isCompleted = orderStatus === 'completed';
    const statusLabel = orderStatus === 'completed'
      ? 'Completed'
      : orderStatus.replace('_', ' ').replace('results ready', 'Results Ready');

    return (
      <Card
        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${
          order.priority === 'stat' ? 'border-l-red-500' :
          order.priority === 'urgent' ? 'border-l-orange-500' :
          'border-l-blue-500'
        }`}
        onClick={() => openViewDialog(order)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <PatientAvatar name={order.patient_name ?? ''} photoUrl={resolvePatientPhoto(order)} size="sm" />

            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{order.patient_name ?? ''}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityColor(order.priority)}`}>
                    {getPriorityLabel(order.priority)}
                  </Badge>
                  {isRadiologyExternalManualOrder(order) && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-amber-500/10 text-amber-700 border-amber-200">
                      External Request
                    </Badge>
                  )}
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(orderStatus)}`}>
                    {statusLabel}
                  </Badge>
                  {order.studies?.slice(0, 2).map((study: any, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {study.procedure.split(' ')[0]}
                    </Badge>
                  ))}
                  {order.studies?.length > 2 && <span className="text-[10px] text-muted-foreground">+{order.studies.length - 2}</span>}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isCompleted && (
                    <div className="h-7 w-7 flex items-center justify-center rounded border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openViewDialog(order); }}>
                    <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                  </Button>
                </div>
              </div>

              {/* Row 2: Details */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>
                  {order.patient_age != null ? `${order.patient_age}y` : ''}
                  {order.patient_age != null ? ' ' : ''}
                  {formatPatientGenderLabel(order.patient_details?.gender) ||
                    formatPatientGenderLabel(order.patient_gender) ||
                    (order.patient_gender ? String(order.patient_gender) : '')}
                </span>
                <span>•</span>
                <span className="flex items-center gap-1">
                  <Stethoscope className="h-3 w-3 shrink-0" />
                  {isRadiologyExternalManualOrder(order)
                    ? (order.external_requesting_doctor_name?.trim() || 'External doctor')
                    : (order.doctor_name?.trim() || 'Unknown')}
                </span>
                {isRadiologyExternalManualOrder(order) && order.external_clinic_details?.name && (
                  <>
                    <span>•</span>
                    <span>{order.external_clinic_details.name}</span>
                  </>
                )}
                <span>•</span>
                <span className="flex items-center gap-1" title="When the order was placed">
                  <Clock className="h-3 w-3 shrink-0" />
                  {formatOrderedAtDisplay(order.ordered_at) || '—'}
                </span>
                <span>•</span>
                <span>{order.studies?.length || 0} {order.studies?.length === 1 ? 'study' : 'studies'}</span>
                <span>•</span>
                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStudyStatusBadge(order.studies?.[0]?.status)}`}>
                  {order.studies?.[0]?.status === 'pending' ? 'Not Started' :
                   order.studies?.[0]?.status === 'processing' ? 'Processing' :
                   order.studies?.[0]?.status === 'reported' ? 'Results Ready' :
                   order.studies?.[0]?.status === 'verified' ? 'Verified' :
                   order.studies?.[0]?.status === 'rejected' ? 'Rejected' :
                   order.studies?.[0]?.status || 'Not Started'}
                </Badge>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  // Open view dialog (like lab orders)
  const openViewDialog = async (order: any) => {
    try {
      // Fetch full order details to ensure studies are included
      const fullOrder = await radiologyService.getOrder(order.id);
      setSelectedOrder(fullOrder);
      setIsViewDialogOpen(true);
      // Load dispatch history in the background so the Dispatches panel
      // inside the detail dialog renders without a blocking await.
      void loadOrderDispatches(Number(fullOrder.id));
    } catch (error: any) {
      if (handleAuthError(error)) return;
      toast.error(error.message || 'Failed to load order details');
    }
  };

  // Open process study dialog (like lab)
  const openProcessStudyDialog = (study: any, order: any) => {
    setSelectedStudy(study);
    setSelectedOrder(order);
    setProcessingMethod('in_house');
    setIsProcessDialogOpen(true);
  };

  // Handle starting study processing — in-house only. The outsourced path
  // is exclusively routed through `handleContinueToDispatch`, which opens
  // the order-level dispatch dialog so we always produce a structured
  // RadiologyReferralDispatch with PDFs and audit log entries. We
  // hardcode the method here so a stray render path can't accidentally
  // re-introduce the legacy free-text outsourcing.
  const handleStartProcessing = async () => {
    if (!selectedStudy || !selectedOrder) return;

    setIsSubmittingResults(true);
    try {
      await radiologyService.updateStudyStatus(selectedStudy.id, 'processing', {
        processing_method: 'in_house',
        outsourced_lab: null,
      });

      toast.success('Study processing started successfully');
      setIsProcessDialogOpen(false);
      
      await Promise.all([
        loadOrders(),
        (async () => {
          if (isViewDialogOpen && selectedOrder) {
            const updatedOrder = await radiologyService.getOrder(selectedOrder.id);
            setSelectedOrder(updatedOrder);
          }
        })(),
      ]);
    } catch (error: any) {
      if (handleAuthError(error)) return;
      console.error('Error starting study processing:', error);
      toast.error(error.message || 'Failed to start study processing');
    } finally {
      setIsSubmittingResults(false);
    }
  };

  // Load Imaging Partners
  const loadImagingPartners = useCallback(async () => {
    setLoadingImagingPartners(true);
    try {
      const res = await radiologyService.getImagingPartners();
      setImagingPartners(res.results || []);
    } catch (e: any) {
      if (handleAuthError(e)) return;
      console.error('getImagingPartners failed', e?.status, e?.body, e);
      toast.error('Failed to load imaging partners');
      setImagingPartners([]);
    } finally {
      setLoadingImagingPartners(false);
    }
  }, []);

  // Reset the Add/Edit Partner form to its empty defaults. Called when the
  // dialog closes and after a successful submit so reopening it doesn't
  // leak the previous edit's values into a fresh "+ Add" flow.
  const resetPartnerForm = () => {
    setEditingPartnerId(null);
    setNewPartnerName('');
    setNewPartnerCode('');
    setNewPartnerEmail('');
    setNewPartnerPhone('');
    setNewPartnerAddress('');
    setNewPartnerContactTitle('The Medical Director');
  };

  // Pre-fill the form with an existing partner and flip into edit mode.
  // Triggered from the Manage Partners list and from the amber "no
  // address" shortcut inside the dispatch dialog.
  const openEditPartnerDialog = (partner: ImagingPartner) => {
    setEditingPartnerId(partner.id);
    setNewPartnerName(partner.name || '');
    setNewPartnerCode(partner.code || '');
    setNewPartnerEmail(partner.email || '');
    setNewPartnerPhone(partner.phone || '');
    setNewPartnerAddress(partner.address || '');
    setNewPartnerContactTitle(partner.contact_person_title || 'The Medical Director');
    setIsAddPartnerDialogOpen(true);
  };

  // Unified create/update handler. Picks POST or PATCH based on whether
  // `editingPartnerId` is set. Mirrors `handleSubmitPartner` in lab.
  const handleSubmitPartner = async () => {
    if (!newPartnerName.trim()) {
      toast.error('Partner name is required');
      return;
    }

    const isEdit = editingPartnerId !== null;
    const payload: Partial<ImagingPartner> = {
      name: newPartnerName.trim(),
      code: newPartnerCode.trim(),
      email: newPartnerEmail.trim(),
      phone: newPartnerPhone.trim(),
      address: newPartnerAddress.trim(),
      contact_person_title: newPartnerContactTitle.trim(),
    };

    setIsSubmittingPartner(true);
    try {
      const saved = isEdit
        ? await radiologyService.updateImagingPartner(editingPartnerId!, payload)
        : await radiologyService.createImagingPartner({
            ...payload,
            is_active: true,
            sort_order: imagingPartners.length,
          });

      setImagingPartners((prev) =>
        isEdit
          ? prev.map((p) => (p.id === saved.id ? saved : p))
          : [...prev, saved]
      );

      // If the dispatch dialog is currently open and the user just created
      // a brand-new partner, auto-select it so the picker is satisfied
      // without an extra click.
      if (!isEdit && isDispatchDialogOpen) {
        setDispatchPartnerId(String(saved.id));
      }

      toast.success(
        isEdit
          ? `Imaging partner "${saved.name}" updated`
          : `Imaging partner "${saved.name}" added successfully`
      );

      resetPartnerForm();
      setIsAddPartnerDialogOpen(false);
    } catch (error: any) {
      if (handleAuthError(error)) return;
      console.error('Save imaging partner error:', error);
      toast.error(error?.message || 'Failed to save imaging partner');
    } finally {
      setIsSubmittingPartner(false);
    }
  };

  // Delete Imaging Partner
  const handleDeletePartner = (partnerId: number, partnerName: string) => {
    setDeleteConfirmPartnerId(partnerId);
    setDeleteConfirmPartnerName(partnerName);
  };

  // Confirm Delete Imaging Partner
  const confirmDeletePartner = async () => {
    if (deleteConfirmPartnerId === null) return;

    setDeletingPartnerId(deleteConfirmPartnerId);
    try {
      await radiologyService.deleteImagingPartner(deleteConfirmPartnerId);
      setImagingPartners((prev) => prev.filter((p) => p.id !== deleteConfirmPartnerId));
      toast.success(`Imaging partner "${deleteConfirmPartnerName}" deleted successfully`);
    } catch (error: any) {
      if (handleAuthError(error)) return;
      console.error('Delete imaging partner error:', error);
      toast.error(error?.message || 'Failed to delete imaging partner');
    } finally {
      setDeletingPartnerId(null);
      setDeleteConfirmPartnerId(null);
      setDeleteConfirmPartnerName('');
    }
  };

  // Load imaging partners on component mount
  useEffect(() => {
    loadImagingPartners();
  }, [loadImagingPartners]);

  // Result entry state (like lab)
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedStudy, setSelectedStudy] = useState<any>(null);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  // View & Manage Order Dialog (like lab)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [selectedPatientFull, setSelectedPatientFull] = useState<any | null>(null);
  const [selectedPrincipalPersonalNumber, setSelectedPrincipalPersonalNumber] = useState<string | null>(null);
  const [resultEntryMode, setResultEntryMode] = useState<'manual' | 'upload'>('manual');
  const [resultsForm, setResultsForm] = useState({
    report: '',
    critical: false,
    reportFiles: [] as File[],
  });
  const [customReportRows, setCustomReportRows] = useState<CustomRadiologyReportRow[]>([]);
  const [customReportFiles, setCustomReportFiles] = useState<Record<string, File | null>>({});
  const [isSubmittingResults, setIsSubmittingResults] = useState(false);

  // Processing method selection (like lab). The Outsourced choice no
  // longer collects a free-text facility here — it bridges into the
  // order-level dispatch dialog via `handleContinueToDispatch`, so we
  // don't need a paired `outsourcedLab` text field anymore.
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
  const [processingMethod, setProcessingMethod] = useState<'in_house' | 'outsourced'>('in_house');

  // Imaging Partners management (like lab partners)
  const [imagingPartners, setImagingPartners] = useState<ImagingPartner[]>([]);
  const [loadingImagingPartners, setLoadingImagingPartners] = useState(false);
  // The Add Partner dialog doubles as the Edit Partner dialog: when
  // `editingPartnerId !== null`, the form pre-fills with that partner's
  // details and `handleSubmitPartner` issues a PATCH instead of a POST.
  const [isAddPartnerDialogOpen, setIsAddPartnerDialogOpen] = useState(false);
  const [editingPartnerId, setEditingPartnerId] = useState<number | null>(null);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerCode, setNewPartnerCode] = useState('');
  const [newPartnerEmail, setNewPartnerEmail] = useState('');
  const [newPartnerPhone, setNewPartnerPhone] = useState('');
  // `address` and `contact_person_title` are the fields the backend
  // snapshots onto each `RadiologyReferralDispatch` so the referral letter
  // and responsibility form print a real addressee block. Default the
  // addressee role to the most common Lagos hospital convention.
  const [newPartnerAddress, setNewPartnerAddress] = useState('');
  const [newPartnerContactTitle, setNewPartnerContactTitle] = useState('The Medical Director');
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);
  const [isManagePartnersDialogOpen, setIsManagePartnersDialogOpen] = useState(false);
  const [deletingPartnerId, setDeletingPartnerId] = useState<number | null>(null);
  const [deleteConfirmPartnerId, setDeleteConfirmPartnerId] = useState<number | null>(null);
  const [deleteConfirmPartnerName, setDeleteConfirmPartnerName] = useState<string>('');

  // ----------------------------------------------------------------------
  // Send to External Imaging Centre — order-level outsourced dispatch
  // ----------------------------------------------------------------------
  // Mirrors the laboratory dispatch flow: a 2-stage dialog that first picks
  // studies + partner + notes, then swaps to a confirmation panel that
  // prints the standardised Referral Letter and Responsibility Form before
  // the user clicks Done. See `app/laboratory/orders/page.tsx` for the
  // canonical reference — keep the two flows structurally aligned so future
  // changes are easy to mirror.
  const [isDispatchDialogOpen, setIsDispatchDialogOpen] = useState(false);
  const [dispatchSelectedStudyIds, setDispatchSelectedStudyIds] = useState<number[]>([]);
  const [dispatchPartnerId, setDispatchPartnerId] = useState<string>('');
  const [dispatchNotes, setDispatchNotes] = useState('');
  const [isCreatingDispatch, setIsCreatingDispatch] = useState(false);

  // Stage 2 — confirmation panel for the dispatch we just issued (or are reprinting).
  const [confirmedDispatch, setConfirmedDispatch] = useState<RadiologyReferralDispatch | null>(null);
  const [referralLetterPrinted, setReferralLetterPrinted] = useState(false);
  const [responsibilityFormPrinted, setResponsibilityFormPrinted] = useState(false);
  const [isPrintingReferral, setIsPrintingReferral] = useState(false);
  const [isPrintingResponsibility, setIsPrintingResponsibility] = useState(false);

  // Dispatch history shown inside the order detail dialog.
  const [orderDispatches, setOrderDispatches] = useState<RadiologyReferralDispatch[]>([]);
  const [loadingOrderDispatches, setLoadingOrderDispatches] = useState(false);
  const [cancellingDispatchId, setCancellingDispatchId] = useState<number | null>(null);

  // Done-without-printing nudge — shown when the user closes the
  // confirmation panel without opening either PDF.
  const [skipPrintConfirmOpen, setSkipPrintConfirmOpen] = useState(false);

  // Cancel-dispatch flow: which dispatch is being cancelled + the reason
  // typed into the confirmation dialog.
  const [cancelDispatchTarget, setCancelDispatchTarget] = useState<RadiologyReferralDispatch | null>(null);
  const [cancelDispatchReason, setCancelDispatchReason] = useState('');

  // ----------------------------------------------------------------------
  // Dispatch flow handlers — mirrors `app/laboratory/orders/page.tsx`
  // dispatch handlers. Declared after the dispatch state above so the
  // useMemo / useCallback closures can reference them without a use-before-
  // declaration TypeScript error.
  // ----------------------------------------------------------------------

  /**
   * Studies that are eligible to be sent out to a partner: still pending or
   * scheduled (i.e. not yet acquired or reported), and not already on an
   * issued dispatch. The backend enforces the same invariant — see
   * `RadiologyOrderViewSet.dispatch_outsourced` — but pre-filtering here
   * keeps the picker honest and the user from selecting unsendable rows.
   */
  const dispatchEligibleStudies = useMemo(() => {
    if (!selectedOrder?.studies) return [] as any[];
    const onActiveDispatch = new Set<number>();
    for (const d of orderDispatches) {
      if (d.status !== 'issued') continue;
      for (const s of d.studies) onActiveDispatch.add(s.id);
    }
    return selectedOrder.studies.filter(
      (s: any) =>
        (s.status === 'pending' || s.status === 'scheduled') &&
        !onActiveDispatch.has(Number(s.id))
    );
  }, [selectedOrder, orderDispatches]);

  const loadOrderDispatches = useCallback(async (orderId: number) => {
    setLoadingOrderDispatches(true);
    try {
      const dispatches = await radiologyService.getOrderDispatches(orderId);
      setOrderDispatches(dispatches);
    } catch (e: any) {
      if (handleAuthError(e)) return;
      console.error('getOrderDispatches failed', e);
      // 404 likely means migrations haven't run yet — keep the rest of the page usable.
      if (e?.status !== 404) {
        toast.error(e?.message || 'Could not load dispatch history');
      }
      setOrderDispatches([]);
    } finally {
      setLoadingOrderDispatches(false);
    }
  }, []);

  /**
   * Open the order-level dispatch dialog. By default every eligible study is
   * pre-selected (typical "send the whole batch" flow). Pass a
   * `prefocusStudyId` when arriving from another entry point so we only
   * pre-select that one — the user can still tick others to batch them in.
   */
  const openDispatchDialog = async (prefocusStudyId?: number) => {
    if (!selectedOrder) return;
    setIsDispatchDialogOpen(true);
    setConfirmedDispatch(null);
    setReferralLetterPrinted(false);
    setResponsibilityFormPrinted(false);
    setDispatchSelectedStudyIds(
      prefocusStudyId
        ? [prefocusStudyId]
        : dispatchEligibleStudies.map((s: any) => Number(s.id))
    );
    setDispatchPartnerId('');
    setDispatchNotes('');
    if (imagingPartners.length === 0) await loadImagingPartners();
  };

  const toggleDispatchStudy = (studyId: number) => {
    setDispatchSelectedStudyIds((prev) =>
      prev.includes(studyId) ? prev.filter((x) => x !== studyId) : [...prev, studyId]
    );
  };

  const handleCreateDispatch = async () => {
    if (!selectedOrder) return;
    if (dispatchSelectedStudyIds.length === 0) {
      toast.error('Pick at least one study to send out');
      return;
    }
    if (!dispatchPartnerId) {
      toast.error('Choose the imaging partner this batch is going to');
      return;
    }

    setIsCreatingDispatch(true);
    try {
      const dispatch = await radiologyService.dispatchOutsourced(Number(selectedOrder.id), {
        partner_id: parseInt(dispatchPartnerId, 10),
        study_ids: dispatchSelectedStudyIds,
        notes: dispatchNotes.trim() || undefined,
      });

      toast.success(`Dispatch ${dispatch.dispatch_id} issued to ${dispatch.partner_name}`);

      setConfirmedDispatch(dispatch);
      setReferralLetterPrinted(false);
      setResponsibilityFormPrinted(false);

      // Refresh order + dispatch history so the order detail UI mirrors the new state.
      await Promise.all([
        loadOrders(),
        (async () => {
          const updatedOrder = await radiologyService.getOrder(Number(selectedOrder.id));
          setSelectedOrder(updatedOrder);
        })(),
        loadOrderDispatches(Number(selectedOrder.id)),
      ]);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      console.error('dispatchOutsourced failed', err);
      const msg = err?.apiMessage || err?.message || 'Failed to create dispatch';
      toast.error(msg);
    } finally {
      setIsCreatingDispatch(false);
    }
  };

  /**
   * Open a dispatch PDF in a new tab (same blob → object URL pattern used
   * for other PDFs). The backend stamps the printed-at field each time the
   * URL is hit, so reprinting just refreshes that timestamp.
   */
  const openDispatchPdf = async (
    kind: 'referral' | 'responsibility',
    dispatch: RadiologyReferralDispatch
  ) => {
    if (!selectedOrder) return;

    const setBusy = kind === 'referral' ? setIsPrintingReferral : setIsPrintingResponsibility;
    setBusy(true);
    let objectUrl: string | null = null;
    try {
      const blob =
        kind === 'referral'
          ? await radiologyService.fetchReferralLetterPdf(Number(selectedOrder.id), dispatch.id)
          : await radiologyService.fetchResponsibilityFormPdf(Number(selectedOrder.id), dispatch.id);
      objectUrl = URL.createObjectURL(blob);

      const win = window.open(objectUrl, '_blank');
      if (!win) {
        toast.error('Pop-ups blocked. Allow pop-ups to view the PDF.');
        return;
      }

      if (kind === 'referral') setReferralLetterPrinted(true);
      else setResponsibilityFormPrinted(true);

      // Refresh history so the printed-at timestamp shows up in the table.
      await loadOrderDispatches(Number(selectedOrder.id));
    } catch (err: any) {
      if (handleAuthError(err)) return;
      console.error('openDispatchPdf failed', err);
      toast.error(err?.apiMessage || err?.message || 'Failed to open PDF');
    } finally {
      setBusy(false);
      // Keep the object URL alive for ~1 minute so the new tab can render
      // it before we revoke. Browsers usually cache the blob anyway.
      if (objectUrl) setTimeout(() => URL.revokeObjectURL(objectUrl!), 60_000);
    }
  };

  /** Close the dispatch dialog. If neither doc was opened, route through the
   *  print-skip nudge instead of dismissing immediately. */
  const handleDoneDispatch = () => {
    if (!confirmedDispatch) {
      setIsDispatchDialogOpen(false);
      return;
    }
    if (!referralLetterPrinted && !responsibilityFormPrinted) {
      setSkipPrintConfirmOpen(true);
      return;
    }
    setIsDispatchDialogOpen(false);
    setConfirmedDispatch(null);
  };

  /** Confirmed close from the "Done without printing" nudge. */
  const confirmDoneSkipPrint = () => {
    setSkipPrintConfirmOpen(false);
    setIsDispatchDialogOpen(false);
    setConfirmedDispatch(null);
  };

  /** Open the dialog that confirms cancellation of a dispatch and collects
   *  an optional reason. The actual cancel call lives in
   *  `confirmCancelDispatch`. */
  const handleCancelDispatch = (dispatch: RadiologyReferralDispatch) => {
    setCancelDispatchTarget(dispatch);
    setCancelDispatchReason('');
  };

  const confirmCancelDispatch = async () => {
    if (!selectedOrder || !cancelDispatchTarget) return;
    const dispatch = cancelDispatchTarget;
    setCancellingDispatchId(dispatch.id);
    try {
      await radiologyService.cancelDispatch(
        Number(selectedOrder.id),
        dispatch.id,
        cancelDispatchReason.trim() || undefined,
      );
      toast.success(`Dispatch ${dispatch.dispatch_id} cancelled`);
      await Promise.all([
        loadOrders(),
        (async () => {
          const updatedOrder = await radiologyService.getOrder(Number(selectedOrder.id));
          setSelectedOrder(updatedOrder);
        })(),
        loadOrderDispatches(Number(selectedOrder.id)),
      ]);
      setCancelDispatchTarget(null);
      setCancelDispatchReason('');
    } catch (err: any) {
      if (handleAuthError(err)) return;
      console.error('cancelDispatch failed', err);
      toast.error(err?.apiMessage || err?.message || 'Failed to cancel dispatch');
    } finally {
      setCancellingDispatchId(null);
    }
  };

  /** Reopen the post-dispatch print panel for an existing dispatch (used by
   *  the Dispatches history). Lets the user reprint paperwork without
   *  creating a new dispatch. */
  const openExistingDispatchPanel = (dispatch: RadiologyReferralDispatch) => {
    setConfirmedDispatch(dispatch);
    setReferralLetterPrinted(!!dispatch.referral_letter_printed_at);
    setResponsibilityFormPrinted(!!dispatch.responsibility_form_printed_at);
    setIsDispatchDialogOpen(true);
  };

  /**
   * Bridge from the per-study Process dialog when the user picks
   * "Outsourced". Closes the per-study dialog and opens the order-level
   * dispatch dialog with the clicked study pre-selected. Mirrors lab's
   * `handleContinueToDispatch` — keeping these two flows symmetrical means
   * outsourcing always produces a `RadiologyReferralDispatch` (with PDFs
   * and audit log) instead of the legacy free-text `outsourced_facility`
   * shortcut on the study row.
   */
  const handleContinueToDispatch = () => {
    if (!selectedStudy) return;
    const studyId = Number(selectedStudy.id);
    setIsProcessDialogOpen(false);
    // Defer so the close animation completes before the next dialog mounts.
    setTimeout(() => void openDispatchDialog(studyId), 50);
  };

  const [isAddStudyDialogOpen, setIsAddStudyDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [addStudyProcessingMethod, setAddStudyProcessingMethod] = useState<'in_house' | 'outsourced'>('in_house');
  const [addStudyOutsourcedFacility, setAddStudyOutsourcedFacility] = useState('');
  const [isAddingStudy, setIsAddingStudy] = useState(false);

  const [isExternalOrderDialogOpen, setIsExternalOrderDialogOpen] = useState(false);
  const [externalPatientSearch, setExternalPatientSearch] = useState('');
  const [externalPatientResults, setExternalPatientResults] = useState<Patient[]>([]);
  const [searchingExternalPatients, setSearchingExternalPatients] = useState(false);
  const [selectedExternalPatient, setSelectedExternalPatient] = useState<Patient | null>(null);
  const [externalClinics, setExternalClinics] = useState<Clinic[]>([]);
  const [externalClinicId, setExternalClinicId] = useState('');
  const [externalRequestingDoctorName, setExternalRequestingDoctorName] = useState('');
  const [externalManualReference, setExternalManualReference] = useState('');
  const [externalManualFile, setExternalManualFile] = useState<File | null>(null);
  const [externalClinicalNotes, setExternalClinicalNotes] = useState('');
  const [externalProvisionalDiagnosis, setExternalProvisionalDiagnosis] = useState('');
  const [externalPriority, setExternalPriority] = useState<'routine' | 'urgent' | 'stat'>('routine');
  const [externalTemplateSearch, setExternalTemplateSearch] = useState('');
  const [selectedExternalTemplateIds, setSelectedExternalTemplateIds] = useState<Set<number>>(new Set());
  const [isSubmittingExternalOrder, setIsSubmittingExternalOrder] = useState(false);

  const buildDateQuery = useCallback(
    (filter: string): Record<string, string> => {
      // Anchor on the server's "today" so filters reflect the server calendar,
      // not the client device clock. `serverToday` is populated once on mount.
      const anchor = serverToday ? new Date(`${serverToday}T00:00:00`) : new Date();
      const anchorYmd = serverToday || formatLocalYmd(anchor);
      if (filter === 'today') return { date: anchorYmd };
      if (filter === 'week') {
        const start = new Date(anchor);
        start.setDate(anchor.getDate() - 7);
        return { start_date: formatLocalYmd(start), end_date: anchorYmd };
      }
      if (filter === 'month') {
        const start = new Date(anchor);
        start.setMonth(anchor.getMonth() - 1);
        return { start_date: formatLocalYmd(start), end_date: anchorYmd };
      }
      return {};
    },
    [serverToday],
  );

  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const searching = Boolean(debouncedSearch);
      const dateQuery = searching ? {} : buildDateQuery(dateFilter);
      const rangeQuery =
        !searching && (dateRange.from || dateRange.to)
          ? { start_date: dateRange.from || undefined, end_date: dateRange.to || undefined }
          : {};
      const commonFilters = {
        ...(searching ? { search: debouncedSearch } : {}),
        ...(processingFilter !== 'all' ? { processing_method: processingFilter } : {}),
        ...(priorityFilter !== 'all' ? { priority: priorityFilter } : {}),
        ...(genderFilter !== 'all' ? { gender: genderFilter as 'male' | 'female' } : {}),
        ...(sourceTypeFilter !== 'all' ? { source_type: sourceTypeFilter } : {}),
        ...dateQuery,
        ...rangeQuery,
      };
      const studyStatus = radiologyOrdersTabToStudyStatus(activeTab);
      const listFilters = {
        ...commonFilters,
        ...(searching ? {} : studyStatus ? { study_status: studyStatus } : {}),
        ...(!searching && activeTab === 'rejected' ? { date_field: 'rejected_at' as const } : {}),
      };

      const [response, statsResponse] = await Promise.all([
        radiologyService.getOrders({
          page: currentPage,
          page_size: itemsPerPage,
          ...listFilters,
        }),
        radiologyService.getOrderStats(commonFilters),
      ]);

      setOrders(response.results || []);
      setTotalCount(response.count || response.results.length);
      setStats({
        total: statsResponse.total || 0,
        pendingSamples: statsResponse.pending || 0,
        processing: statsResponse.processing || 0,
        resultsReady: statsResponse.results_ready || 0,
        rejected: statsResponse.rejected || 0,
        stat: statsResponse.stat || 0,
      });
    } catch (err: any) {
      if (handleAuthError(err)) return;
      if (!silent) {
        setError(err.message || 'Failed to load radiology orders');
        toast.error('Failed to load radiology orders. Please try again.');
      }
      console.error('Error loading radiology orders:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, processingFilter, priorityFilter, genderFilter, sourceTypeFilter, dateFilter, dateRange.from, dateRange.to, activeTab, currentPage, itemsPerPage, buildDateQuery, handleAuthError]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    if (!ready) return;
    loadOrders();
  }, [ready, loadOrders]);

  const pollingPaused = useMemo(
    () =>
      isDateFilterDialogOpen ||
      isViewDialogOpen ||
      isProcessDialogOpen ||
      isResultsDialogOpen ||
      isAddStudyDialogOpen ||
      isExternalOrderDialogOpen ||
      isDispatchDialogOpen,
    [
      isDateFilterDialogOpen,
      isViewDialogOpen,
      isProcessDialogOpen,
      isResultsDialogOpen,
      isAddStudyDialogOpen,
      isExternalOrderDialogOpen,
      isDispatchDialogOpen,
    ]
  );

  useEffect(() => {
    if (!ready || pollingPaused) return;
    const id = setInterval(() => {
      void loadOrders({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, [ready, loadOrders, pollingPaused]);

  useEffect(() => {
    if (!isViewDialogOpen) {
      setSelectedPatientFull(null);
      setSelectedPrincipalPersonalNumber(null);
      return;
    }
    const patientId = selectedOrder?.patient_details?.id ?? selectedOrder?.patient;
    if (!patientId) {
      setSelectedPatientFull(null);
      setSelectedPrincipalPersonalNumber(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await patientService.getPatient(Number(patientId));
        if (!cancelled) setSelectedPatientFull(p);

        if (p?.category === 'dependent' && p?.principal_staff) {
          try {
            const principal = await patientService.getPatient(Number(p.principal_staff));
            if (!cancelled) {
              setSelectedPrincipalPersonalNumber(principal?.personal_number?.trim() || null);
            }
          } catch {
            if (!cancelled) setSelectedPrincipalPersonalNumber(null);
          }
        } else if (!cancelled) {
          setSelectedPrincipalPersonalNumber(null);
        }
      } catch {
        if (!cancelled) {
          setSelectedPatientFull(null);
          setSelectedPrincipalPersonalNumber(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isViewDialogOpen, selectedOrder?.patient_details?.id, selectedOrder?.patient]);

  const loadTemplates = useCallback(async () => {
    setLoadingTemplates(true);
    try {
      const response = await radiologyService.getTemplates();
      setTemplates(response.results || []);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err?.message || 'Failed to load templates');
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  }, []);

  useEffect(() => {
    if (!isAddStudyDialogOpen) return;
    if (templates.length > 0) return;
    loadTemplates();
  }, [isAddStudyDialogOpen, loadTemplates, templates.length]);

  useEffect(() => {
    if (!isExternalOrderDialogOpen) return;
    if (templates.length === 0) loadTemplates();
    (async () => {
      try {
        const res = await adminService.getClinics({ is_active: true, page_size: MAX_LIST_PAGE_SIZE });
        setExternalClinics(res.results || []);
      } catch (err: any) {
        if (handleAuthError(err)) return;
        toast.error(err?.message || 'Failed to load originating clinics');
        setExternalClinics([]);
      }
    })();
  }, [isExternalOrderDialogOpen, loadTemplates, templates.length]);

  useEffect(() => {
    if (!isExternalOrderDialogOpen) return;
    const q = externalPatientSearch.trim();
    if (q.length < 2) {
      setExternalPatientResults([]);
      setSearchingExternalPatients(false);
      return;
    }

    let cancelled = false;
    const t = setTimeout(async () => {
      setSearchingExternalPatients(true);
      try {
        const res = await patientService.getPatients({ search: q, page_size: DEFAULT_LIST_PAGE_SIZE });
        if (!cancelled) setExternalPatientResults(res.results || []);
      } catch {
        if (!cancelled) setExternalPatientResults([]);
      } finally {
        if (!cancelled) setSearchingExternalPatients(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isExternalOrderDialogOpen, externalPatientSearch]);

  const filteredTemplates = useMemo(() => {
    const q = templateSearch.trim().toLowerCase();
    if (!q) return [];
    const matches = templates.filter((t) => {
      const name = String(t?.name ?? '').toLowerCase();
      const code = String(t?.code ?? '').toLowerCase();
      return name.includes(q) || code.includes(q);
    });
    return matches.slice(0, 25);
  }, [templateSearch, templates]);

  const selectedExternalTemplates = useMemo(
    () => templates.filter((template) => selectedExternalTemplateIds.has(Number(template.id))),
    [templates, selectedExternalTemplateIds],
  );

  const filteredExternalTemplates = useMemo(() => {
    const q = externalTemplateSearch.trim().toLowerCase();
    if (!q) return templates.slice(0, 25);
    return templates
      .filter((template) => {
        const name = String(template?.name ?? '').toLowerCase();
        const code = String(template?.code ?? '').toLowerCase();
        const modality = String(template?.modality ?? template?.category ?? '').toLowerCase();
        return name.includes(q) || code.includes(q) || modality.includes(q);
      })
      .slice(0, 25);
  }, [externalTemplateSearch, templates]);

  const resetExternalOrderForm = () => {
    setExternalPatientSearch('');
    setExternalPatientResults([]);
    setSelectedExternalPatient(null);
    setExternalClinicId('');
    setExternalRequestingDoctorName('');
    setExternalManualReference('');
    setExternalManualFile(null);
    setExternalClinicalNotes('');
    setExternalProvisionalDiagnosis('');
    setExternalPriority('routine');
    setExternalTemplateSearch('');
    setSelectedExternalTemplateIds(new Set());
  };

  const handleCreateExternalOrder = async () => {
    if (!selectedExternalPatient) {
      toast.error('Select a patient from Medical Records');
      return;
    }
    if (!externalClinicId) {
      toast.error('Select the originating clinic');
      return;
    }
    if (!externalRequestingDoctorName.trim()) {
      toast.error('Enter the requesting doctor from the manual form');
      return;
    }
    if (selectedExternalTemplates.length === 0) {
      toast.error('Select at least one requested study');
      return;
    }

    setIsSubmittingExternalOrder(true);
    try {
      const clinicId = Number(externalClinicId);
      const selectedClinic = externalClinics.find((clinic) => clinic.id === clinicId);
      if (!selectedClinic?.name) {
        toast.error('Select a configured originating clinic. Ask admin to add this clinic if it is missing.');
        return;
      }

      await radiologyService.createExternalOrder({
        patient: selectedExternalPatient.id,
        priority: externalPriority,
        external_clinic: clinicId,
        external_requesting_doctor_name: externalRequestingDoctorName.trim(),
        manual_request_reference: externalManualReference.trim() || undefined,
        manual_request_file: externalManualFile || undefined,
        clinical_notes: externalClinicalNotes.trim(),
        provisional_diagnosis: externalProvisionalDiagnosis.trim(),
        studies_data: selectedExternalTemplates.map((template) => ({
          template: template.id,
          procedure: template.name,
          body_part: template.body_part || '',
          modality: template.modality || template.category || '',
          status: 'pending',
        })),
      });

      toast.success('External radiology request created');
      setIsExternalOrderDialogOpen(false);
      resetExternalOrderForm();
      setSourceTypeFilter('external_manual');
      setActiveTab('pending');
      setCurrentPage(1);
      await loadOrders();
    } catch (err: any) {
      if (handleAuthError(err)) return;
      console.error('Failed to create external radiology request:', err);
      toast.error(err?.message || 'Failed to create external radiology request');
    } finally {
      setIsSubmittingExternalOrder(false);
    }
  };

  const formatLmp = (value: any) => formatDisplayDateMedium(value);

  const handleAddStudy = async () => {
    if (!selectedOrder) return;
    if (!selectedTemplate?.id) {
      toast.error('Select an imaging study template first');
      return;
    }

    setIsAddingStudy(true);
    try {
      await radiologyService.createStudy({
        order: selectedOrder.id,
        template: selectedTemplate.id,
        procedure: selectedTemplate.name || 'Radiology Study',
        body_part: selectedTemplate.body_part || '',
        modality: selectedTemplate.modality || '',
        status: 'pending',
        images_count: 0,
        processing_method: addStudyProcessingMethod,
        outsourced_facility: addStudyProcessingMethod === 'outsourced' ? addStudyOutsourcedFacility : '',
      } as any);

      toast.success('Study added to order');
      setIsAddStudyDialogOpen(false);
      setTemplateSearch('');
      setSelectedTemplate(null);
      setAddStudyProcessingMethod('in_house');
      setAddStudyOutsourcedFacility('');

      await loadOrders();
      const updatedOrder = await radiologyService.getOrder(selectedOrder.id);
      setSelectedOrder(updatedOrder);
    } catch (err: any) {
      if (handleAuthError(err)) return;
      toast.error(err?.message || 'Failed to add study');
    } finally {
      setIsAddingStudy(false);
    }
  };

  const getOrderStatus = (order: any): string => {
    const studies = order.studies || [];
    if (studies.length === 0) return 'pending';

    // If all studies are verified, order is completed
    if (studies.every((s: any) => s.status === 'verified')) return 'completed';
    // If any study is processing, order is processing
    if (studies.some((s: any) => s.status === 'processing')) return 'processing';
    // If any study is reported, order has results ready
    if (studies.some((s: any) => s.status === 'reported')) return 'results_ready';
    // Otherwise, pending
    return 'pending';
  };

  // When searching, switch to the tab that contains matches.
  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q || loading || orders.length === 0) {
      autoTabRef.current = null;
      return;
    }
    if (orders.some((o) => orderMatchesRadiologyOrdersTab(o, activeTab))) return;
    const next = findRadiologyOrdersTabForOrders(orders);
    if (next && next !== activeTab) {
      const key = `${q}:${next}`;
      if (autoTabRef.current !== key) {
        autoTabRef.current = key;
        setActiveTab(next);
        toast.info(`Found in ${RADIOLOGY_ORDERS_TAB_LABELS[next]} — switched tab.`);
      }
    }
  }, [debouncedSearch, orders, activeTab, loading]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priorityFilter, dateFilter, genderFilter, processingFilter, sourceTypeFilter, activeTab, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'stat': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      case 'urgent': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400';
      case 'routine': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      case 'processing': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      case 'reported': return 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400';
      case 'verified': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'completed': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'rejected': return 'bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'stat': return 'STAT';
      case 'urgent': return 'Urgent';
      case 'routine': return 'Routine';
      default: return priority;
    }
  };

  // Result entry functions (like lab)
  const openResultsDialog = (study: any, order: any, isRework: boolean = false) => {
    setSelectedStudy(study);
    setSelectedOrder(order);
    const existingRows = Array.isArray(study.custom_reports) ? study.custom_reports : [];
    const initialCustomRows = existingRows.length > 0
      ? existingRows.map((row: any) => ({
          id: String(row.id || makeCustomRadiologyRowId()),
          procedure: String(row.procedure || row.name || ''),
          report: String(row.report || ''),
          recommendations: String(row.recommendations || ''),
          critical: Boolean(row.critical),
        }))
      : parseCustomRadiologyNames(study, order).map((name) => createCustomRadiologyRow(name));
    setResultsForm({
      report: study.report || study.findings || '',
      critical: study.critical || false,
      reportFiles: [],
    });
    setCustomReportRows(initialCustomRows.length > 0 ? initialCustomRows : [createCustomRadiologyRow()]);
    setCustomReportFiles({});
    setResultEntryMode(study.processing_method === 'outsourced' ? 'upload' : 'manual');
    setIsResultsDialogOpen(true);
  };


  const handleSubmitResults = async () => {
    if (!selectedStudy || !selectedOrder) return;

    setIsSubmittingResults(true);
    try {
      await radiologyService.updateStudyResults(selectedStudy.id, {
        report: isOtherRadiologyStudy(selectedStudy) ? '' : resultsForm.report,
        critical: isOtherRadiologyStudy(selectedStudy)
          ? customReportRows.some((row) => row.critical)
          : resultsForm.critical,
        reportFiles: resultsForm.reportFiles,
        customReports: isOtherRadiologyStudy(selectedStudy)
          ? customReportRows
              .map((row) => ({
                ...row,
                procedure: row.procedure.trim(),
                report: row.report.trim(),
                recommendations: row.recommendations.trim(),
              }))
              .filter((row) => row.procedure || row.report || row.recommendations || customReportFiles[row.id])
          : undefined,
        customReportFiles: isOtherRadiologyStudy(selectedStudy) ? customReportFiles : undefined,
        status: 'reported'
      });

      toast.success('Study results submitted successfully');
      setIsResultsDialogOpen(false);
      
      await Promise.all([
        loadOrders(),
        (async () => {
          if (isViewDialogOpen && selectedOrder) {
            const updatedOrder = await radiologyService.getOrder(selectedOrder.id);
            setSelectedOrder(updatedOrder);
          }
        })(),
      ]);
    } catch (error: any) {
      if (handleAuthError(error)) return;
      toast.error(error.message || 'Failed to submit study results');
    } finally {
      setIsSubmittingResults(false);
    }
  };

  const handleProcessOrder = async (order: any) => {
    try {
      await radiologyService.updateOrderStatus(parseInt(order.id), 'processing');
      toast.success('Order status updated to Processing');
      loadOrders();
    } catch (error: any) {
      if (handleAuthError(error)) return;
      console.error('Error updating order status:', error);
      toast.error(error.message || 'Failed to update order status');
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-blue-500" />
              Study Orders
            </h1>
            <p className="text-muted-foreground mt-1">Process studies individually - acquire, process & report results per study</p>
          </div>
          <Button
            onClick={() => setIsExternalOrderDialogOpen(true)}
            className="bg-amber-500 hover:bg-amber-600 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            New External Radiology Request
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-gray-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('pending')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Orders</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.pendingSamples}</p>
                </div>
                <TestTube className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Study orders waiting for processing</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('processing')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Processing</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.processing}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Studies currently being processed</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-amber-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('results')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Results Ready</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.resultsReady}</p>
                </div>
                <FileText className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Study results ready for verification</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-rose-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('rejected')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.rejected}</p>
                </div>
                <XCircle className="h-8 w-8 text-rose-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Studies that were rejected and need rework</p>
              </TooltipContent>
            </Tooltip>
          <Card className="border-l-4 border-l-red-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">STAT Orders</p>
                  <p className="text-2xl sm:text-3xl font-bold text-red-600 dark:text-red-400">{stats.stat}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-red-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Tabs */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as RadiologyOrdersTab)} className="w-full">
                <TabsList>
                  <TabsTrigger value="pending">Pending ({stats.pendingSamples})</TabsTrigger>
                  <TabsTrigger value="processing">Processing ({stats.processing})</TabsTrigger>
                  <TabsTrigger value="results">Results ({stats.resultsReady})</TabsTrigger>
                  <TabsTrigger value="rejected">Rejected ({stats.rejected})</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                <div className="relative flex-1 min-w-[min(100%,16rem)]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Patient, MRN, order ID (RAD-…), procedure, modality…"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <CustomDateRangeButton onClick={() => setIsDateFilterDialogOpen(true)} />
                  <Select value={dateFilter} onValueChange={setDateFilter} >
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="stat">STAT</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="routine">Routine</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={genderFilter} onValueChange={setGenderFilter}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Gender" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Gender</SelectItem>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={processingFilter}
                    onValueChange={(v) => setProcessingFilter(v as 'all' | 'in_house' | 'outsourced')}
                  >
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Processing" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All processing</SelectItem>
                      <SelectItem value="in_house">In-house</SelectItem>
                      <SelectItem value="outsourced">Outsourced</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select
                    value={sourceTypeFilter}
                    onValueChange={(v) => setSourceTypeFilter(v as 'all' | 'internal_emr' | 'external_manual')}
                  >
                    <SelectTrigger className="w-[170px]"><SelectValue placeholder="Source" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All sources</SelectItem>
                      <SelectItem value="internal_emr">EMR Orders</SelectItem>
                      <SelectItem value="external_manual">External Requests</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom order date range to narrow down radiology orders."
          label="Order Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Orders List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading radiology orders...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={() => void loadOrders()}>Retry</Button>
              </CardContent>
            </Card>
          ) : orders.length > 0 ? (
            orders.map((order) => <OrderCard key={order.id} order={order} />)
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No radiology orders found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="orders"
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Showing {totalCount} order{totalCount !== 1 ? 's' : ''} (page {currentPage} of {Math.max(1, Math.ceil(totalCount / itemsPerPage))})
            </p>
          </Card>
        )}

        <Dialog open={isExternalOrderDialogOpen} onOpenChange={setIsExternalOrderDialogOpen}>
          <DialogContent className={MODAL_SIZES.xl}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-500" />
                New External Radiology Request
              </DialogTitle>
              <DialogDescription>
                Create a radiology order from a manual request form. Patient is selected from Medical Records.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-5 py-4">
              <div className="space-y-2">
                <Label>Patient from Medical Records *</Label>
                {selectedExternalPatient ? (
                  <div className="flex items-center justify-between rounded-md border p-3">
                    <div className="flex items-center gap-3">
                      <PatientAvatar name={selectedExternalPatient.full_name || `${selectedExternalPatient.first_name} ${selectedExternalPatient.surname}`} photoUrl={selectedExternalPatient.photo} size="sm" />
                      <div>
                        <p className="text-sm font-medium">
                          {selectedExternalPatient.full_name || `${selectedExternalPatient.first_name} ${selectedExternalPatient.surname}`}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {[selectedExternalPatient.patient_id, selectedExternalPatient.personal_number, formatPatientGenderLabel(selectedExternalPatient.gender), selectedExternalPatient.age != null ? `${selectedExternalPatient.age}y` : '']
                            .filter(Boolean)
                            .join(' • ')}
                        </p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedExternalPatient(null)}>
                      Change
                    </Button>
                  </div>
                ) : (
                  <>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        value={externalPatientSearch}
                        onChange={(event) => setExternalPatientSearch(event.target.value)}
                        placeholder="Search patient name, MRN, or personal number"
                        className="pl-10"
                      />
                    </div>
                    <div className="rounded-md border divide-y max-h-48 overflow-y-auto">
                      {searchingExternalPatients ? (
                        <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" />
                          Searching patients...
                        </div>
                      ) : externalPatientResults.length > 0 ? (
                        externalPatientResults.map((patient) => (
                          <button
                            key={patient.id}
                            type="button"
                            className="w-full p-3 text-left hover:bg-muted flex items-center gap-3"
                            onClick={() => setSelectedExternalPatient(patient)}
                          >
                            <PatientAvatar name={patient.full_name || `${patient.first_name} ${patient.surname}`} photoUrl={patient.photo} size="sm" />
                            <span>
                              <span className="block text-sm font-medium">{patient.full_name || `${patient.first_name} ${patient.surname}`}</span>
                              <span className="block text-xs text-muted-foreground">
                                {[patient.patient_id, patient.personal_number, formatPatientGenderLabel(patient.gender)].filter(Boolean).join(' • ')}
                              </span>
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="p-3 text-sm text-muted-foreground">
                          Type at least 2 characters to search Medical Records.
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Originating Clinic *</Label>
                  <Select value={externalClinicId} onValueChange={setExternalClinicId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select clinic/facility" />
                    </SelectTrigger>
                    <SelectContent>
                      {externalClinics.map((clinic) => (
                        <SelectItem key={clinic.id} value={String(clinic.id)}>
                          {clinic.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Requesting Doctor on Form *</Label>
                  <Input
                    value={externalRequestingDoctorName}
                    onChange={(event) => setExternalRequestingDoctorName(event.target.value)}
                    placeholder="e.g. Dr. Musa"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={externalPriority} onValueChange={(value) => setExternalPriority(value as 'routine' | 'urgent' | 'stat')}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="routine">Routine</SelectItem>
                      <SelectItem value="urgent">Urgent</SelectItem>
                      <SelectItem value="stat">STAT</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label>Manual Form Reference</Label>
                  <Input
                    value={externalManualReference}
                    onChange={(event) => setExternalManualReference(event.target.value)}
                    placeholder="Optional form/reference number"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Attach Manual Request Form</Label>
                <Input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  onChange={(event) => setExternalManualFile(event.target.files?.[0] || null)}
                />
                {externalManualFile && (
                  <p className="text-xs text-muted-foreground">Selected: {externalManualFile.name}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  Files are saved on the server with this order. After you create the request, open the order and use{' '}
                  <span className="font-medium text-foreground">View attached manual request</span> to open or download it.
                </p>
              </div>

              <div className="space-y-2">
                <Label>Requested Studies from Templates *</Label>
                <Input
                  value={externalTemplateSearch}
                  onChange={(event) => setExternalTemplateSearch(event.target.value)}
                  placeholder="Search procedure, code, or modality"
                />
                <div className="rounded-md border divide-y max-h-56 overflow-y-auto">
                  {loadingTemplates ? (
                    <div className="p-3 text-sm text-muted-foreground flex items-center gap-2">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading templates...
                    </div>
                  ) : filteredExternalTemplates.length > 0 ? (
                    filteredExternalTemplates.map((template) => {
                      const checked = selectedExternalTemplateIds.has(Number(template.id));
                      return (
                        <label key={template.id} className="flex items-start gap-3 p-3 hover:bg-muted cursor-pointer">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setSelectedExternalTemplateIds((prev) => {
                                const next = new Set(prev);
                                if (value) next.add(Number(template.id));
                                else next.delete(Number(template.id));
                                return next;
                              });
                            }}
                          />
                          <span>
                            <span className="block text-sm font-medium">{template.name}</span>
                            <span className="block text-xs text-muted-foreground">
                              {[template.code, template.modality || template.category, template.body_part].filter(Boolean).join(' • ')}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  ) : (
                    <div className="p-3 text-sm text-muted-foreground">No matching templates found.</div>
                  )}
                </div>
                {selectedExternalTemplates.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {selectedExternalTemplates.map((template) => (
                      <Badge key={template.id} variant="secondary">
                        {template.name}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Clinical Notes / Indication from Form</Label>
                  <Textarea
                    value={externalClinicalNotes}
                    onChange={(event) => setExternalClinicalNotes(event.target.value)}
                    rows={3}
                    placeholder="Copy indication, clinical notes, or special instructions from the manual form..."
                  />
                </div>
                <div className="space-y-2">
                  <Label>Provisional Diagnosis</Label>
                  <Textarea
                    value={externalProvisionalDiagnosis}
                    onChange={(event) => setExternalProvisionalDiagnosis(event.target.value)}
                    rows={3}
                    placeholder="Optional diagnosis from the form..."
                  />
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsExternalOrderDialogOpen(false)} disabled={isSubmittingExternalOrder}>
                Cancel
              </Button>
              <Button onClick={handleCreateExternalOrder} disabled={isSubmittingExternalOrder}>
                {isSubmittingExternalOrder ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create External Request'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Process Study Dialog (like lab) */}
        <Dialog open={isProcessDialogOpen} onOpenChange={setIsProcessDialogOpen}>
          <DialogContent className={MODAL_SIZES.sm}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Play className="h-5 w-5 text-blue-500" />
                Process Study
              </DialogTitle>
              <DialogDescription>
                Choose processing method for {selectedStudy?.procedure}
              </DialogDescription>
            </DialogHeader>

            {selectedStudy && selectedOrder && (
              <div className="space-y-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedOrder.patient_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Study:</span><span className="font-medium">{selectedStudy.procedure}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Acquired By:</span><span className="font-medium">{selectedStudy.acquired_by_name || 'System Administrator'}</span></div>
                </div>

                <div className="space-y-3">
                  <Label>Processing Method *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setProcessingMethod('in_house')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        processingMethod === 'in_house'
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-muted hover:border-emerald-300'
                      }`}
                    >
                      <Building2 className={`h-6 w-6 mb-2 ${processingMethod === 'in_house' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">In-house</p>
                      <p className="text-xs text-muted-foreground">Process in our department</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcessingMethod('outsourced')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        processingMethod === 'outsourced'
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20'
                          : 'border-muted hover:border-indigo-300'
                      }`}
                    >
                      <Truck className={`h-6 w-6 mb-2 ${processingMethod === 'outsourced' ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">Outsourced</p>
                      <p className="text-xs text-muted-foreground">Send to external lab</p>
                    </button>
                  </div>

                  {processingMethod === 'outsourced' && (
                    // Picking Outsourced no longer collects a free-text
                    // facility name here — that path produced inconsistent
                    // data (no dispatch record, no PDFs, no audit). The
                    // user is now bridged into the order-level dispatch
                    // dialog where they pick a structured ImagingPartner
                    // and we generate the standardised paperwork.
                    <div className="rounded-lg border border-indigo-200 bg-indigo-50/60 dark:border-indigo-900/40 dark:bg-indigo-900/10 p-3 text-xs text-indigo-800 dark:text-indigo-300 flex gap-2">
                      <Send className="h-4 w-4 mt-0.5 shrink-0" />
                      <p>
                        Next step: pick the imaging partner, batch with any other
                        outsourced studies on this order, and print the
                        Referral Letter and Responsibility Form. We&apos;ll generate
                        a serial (RAD-YYYY-NNNNNN) for the dispatch.
                      </p>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsProcessDialogOpen(false)}>
                Cancel
              </Button>
              {processingMethod === 'outsourced' ? (
                <Button
                  onClick={handleContinueToDispatch}
                  className="bg-indigo-500 hover:bg-indigo-600"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Continue to dispatch
                </Button>
              ) : (
                <Button
                  onClick={handleStartProcessing}
                  disabled={isSubmittingResults}
                  className="bg-blue-500 hover:bg-blue-600"
                >
                  {isSubmittingResults ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                  Start Processing
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enter Results Dialog (like lab) */}
        <Dialog open={isResultsDialogOpen} onOpenChange={setIsResultsDialogOpen}>
          <DialogContent className={MODAL_SIZES.md}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                {selectedStudy?.status === 'Rejected' ? 'Rework & Resubmit Results' : 'Enter Study Results'}
              </DialogTitle>
              <DialogDescription>
                {selectedStudy?.status === 'Rejected'
                  ? `Edit and resubmit corrected results for ${selectedStudy?.procedure}`
                  : `Enter report for ${selectedStudy?.procedure}`}
              </DialogDescription>
            </DialogHeader>
            {selectedStudy && selectedOrder && (
              <div className="space-y-4 py-4">
                {selectedStudy.status === 'Rejected' && (
                  <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
                          Study Rejected - Requires Correction
                        </p>
                        <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">
                          This study result was rejected by the verifier. Please review and correct the values below before resubmitting.
                        </p>
                        {selectedStudy.verification_notes && selectedStudy.verification_notes.startsWith('Rejected:') && (
                          <div className="mt-3 p-2 rounded bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-700">
                            <p className="text-xs font-medium text-rose-800 dark:text-rose-200 mb-1">Rejection Reason:</p>
                            <p className="text-xs text-rose-700 dark:text-rose-300">
                              {selectedStudy.verification_notes.replace('Rejected: ', '')}
                            </p>
                          </div>
                        )}
                        {selectedStudy.rejected_by_name && selectedStudy.rejected_at && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">
                            Rejected by {selectedStudy.rejected_by_name}
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedOrder.patient_name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Study:</span><span className="font-medium">{selectedStudy.procedure}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Processing:</span><span className="font-medium">{selectedStudy.processing_method === 'in_house' ? 'In-house' : `Outsourced${selectedStudy.outsourced_facility ? ` (${selectedStudy.outsourced_facility})` : ''}`}</span></div>
                </div>

                {/* Result Entry Method (like lab) */}
                {isOtherRadiologyStudy(selectedStudy) ? (
                  <div className="space-y-3">
                    <div>
                      <p className="text-sm font-medium">Custom / Other Studies</p>
                      <p className="text-xs text-muted-foreground">
                        Add one row for each custom imaging study. Known catalog studies should be added as separate studies.
                      </p>
                    </div>
                    <div className="space-y-3">
                      {customReportRows.map((row, index) => (
                        <div key={row.id} className="rounded-lg border p-3 space-y-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-muted-foreground">Study {index + 1}</span>
                            {customReportRows.length > 1 && (
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2 text-rose-600"
                                onClick={() => {
                                  setCustomReportRows((prev) => prev.filter((item) => item.id !== row.id));
                                  setCustomReportFiles((prev) => {
                                    const next = { ...prev };
                                    delete next[row.id];
                                    return next;
                                  });
                                }}
                              >
                                <X className="h-3.5 w-3.5 mr-1" />
                                Remove
                              </Button>
                            )}
                          </div>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                            <div className="space-y-2">
                              <Label>Study / Procedure</Label>
                              <Input
                                value={row.procedure}
                                onChange={(e) => setCustomReportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, procedure: e.target.value } : item))}
                                placeholder="e.g. Soft tissue ultrasound neck"
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Upload File</Label>
                              <Input
                                type="file"
                                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                                onChange={(e) => setCustomReportFiles((prev) => ({ ...prev, [row.id]: e.target.files?.[0] || null }))}
                                className="cursor-pointer"
                              />
                              {customReportFiles[row.id] && (
                                <p className="text-xs text-green-600">Selected: {customReportFiles[row.id]?.name}</p>
                              )}
                            </div>
                          </div>
                          <div className="space-y-2">
                            <Label>Report</Label>
                            <Textarea
                              value={row.report}
                              onChange={(e) => setCustomReportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, report: e.target.value } : item))}
                              placeholder="Enter report for this custom study..."
                              rows={4}
                            />
                          </div>
                          <div className="space-y-2">
                            <Label>Recommendations</Label>
                            <Textarea
                              value={row.recommendations}
                              onChange={(e) => setCustomReportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, recommendations: e.target.value } : item))}
                              placeholder="Optional recommendations..."
                              rows={2}
                            />
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              checked={row.critical}
                              onCheckedChange={(checked) => setCustomReportRows((prev) => prev.map((item) => item.id === row.id ? { ...item, critical: checked as boolean } : item))}
                            />
                            <Label className="text-sm font-medium leading-none">Mark this row as Critical Finding</Label>
                          </div>
                        </div>
                      ))}
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCustomReportRows((prev) => [...prev, createCustomRadiologyRow()])}
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add Custom Study Row
                    </Button>
                  </div>
                ) : (
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Result Entry Method</Label>
                  <Tabs value={resultEntryMode} onValueChange={(value) => setResultEntryMode(value as 'manual' | 'upload')} className="w-full">
                    <TabsList className="grid w-full grid-cols-2">
                      <TabsTrigger value="manual" className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Text Entry
                      </TabsTrigger>
                      <TabsTrigger value="upload" className="flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        File Upload
                      </TabsTrigger>
                    </TabsList>

                    <TabsContent value="manual" className="space-y-4 mt-4">
                      <div className="text-sm text-muted-foreground mb-3">
                        Enter report text. You can also upload a file below if needed.
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="report">Report</Label>
                        <Textarea
                          id="report"
                          placeholder="Enter the radiology report..."
                          value={resultsForm.report}
                          onChange={(e) => setResultsForm(prev => ({ ...prev, report: e.target.value }))}
                          rows={6}
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="critical"
                          checked={resultsForm.critical}
                          onCheckedChange={(checked) => setResultsForm(prev => ({ ...prev, critical: checked as boolean }))}
                        />
                        <Label htmlFor="critical" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Mark as Critical Finding
                        </Label>
                      </div>

                      <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="report-file-manual">Optional: Upload Supporting Files</Label>
                        <Input
                          id="report-file-manual"
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const newFiles = Array.from(e.target.files || []);
                            if (newFiles.length) {
                              setResultsForm(prev => ({ ...prev, reportFiles: [...prev.reportFiles, ...newFiles] }));
                            }
                            e.target.value = '';
                          }}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground">
                          Upload additional files (PDF, Word, Images)
                        </p>
                        {resultsForm.reportFiles.length > 0 && (
                          <div className="text-sm space-y-1">
                            {resultsForm.reportFiles.map((f, i) => (
                              <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-green-600">
                                <span className="flex-1 truncate">Selected: {f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setResultsForm(prev => ({ ...prev, reportFiles: prev.reportFiles.filter((_, idx) => idx !== i) }))}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="upload" className="space-y-4 mt-4">
                      <div className="text-sm text-muted-foreground mb-3">
                        Upload a complete report document. You can also add summary report text below if desired.
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="report-file">Upload Result Files</Label>
                        <Input
                          id="report-file"
                          type="file"
                          multiple
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => {
                            const newFiles = Array.from(e.target.files || []);
                            if (newFiles.length) {
                              setResultsForm(prev => ({ ...prev, reportFiles: [...prev.reportFiles, ...newFiles] }));
                            }
                            e.target.value = '';
                          }}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground">
                          Supports PDF, Word, Images (JPG, PNG)
                        </p>
                        {resultsForm.reportFiles.length > 0 && (
                          <div className="text-sm space-y-1">
                            {resultsForm.reportFiles.map((f, i) => (
                              <div key={`${f.name}-${i}`} className="flex items-center gap-2 text-green-600">
                                <span className="flex-1 truncate">Selected: {f.name}</span>
                                <button
                                  type="button"
                                  onClick={() => setResultsForm(prev => ({ ...prev, reportFiles: prev.reportFiles.filter((_, idx) => idx !== i) }))}
                                  className="text-red-500 hover:text-red-700 text-xs font-medium"
                                >
                                  Remove
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2 border-t pt-4">
                        <Label htmlFor="report-upload">Optional: Summary Report</Label>
                        <Textarea
                          id="report-upload"
                          placeholder="Optional: Add summary report text from the uploaded report..."
                          value={resultsForm.report}
                          onChange={(e) => setResultsForm(prev => ({ ...prev, report: e.target.value }))}
                          rows={4}
                        />
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="critical-upload"
                          checked={resultsForm.critical}
                          onCheckedChange={(checked) => setResultsForm(prev => ({ ...prev, critical: checked as boolean }))}
                        />
                        <Label htmlFor="critical-upload" className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
                          Mark as Critical Finding
                        </Label>
                      </div>
                    </TabsContent>
                  </Tabs>
                </div>
                )}

              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResultsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitResults}
                disabled={
                  isSubmittingResults ||
                  (isOtherRadiologyStudy(selectedStudy)
                    ? !customReportRows.some((row) => row.procedure.trim() || row.report.trim() || row.recommendations.trim() || customReportFiles[row.id])
                    : (!resultsForm.reportFiles.length && !resultsForm.report.trim()))
                }
                className="bg-amber-500 hover:bg-amber-600"
              >
                {isSubmittingResults ? 'Submitting...' : 'Submit Results'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View & Manage Order Dialog - All actions happen here (like lab) */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className={MODAL_SIZES.lg}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-amber-500" />
                Manage Order
              </DialogTitle>
              <DialogDescription>{selectedOrder?.order_id} • Process individual studies</DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4 py-4">
                {/* Order Header */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={`text-xs px-2 py-1 ${getPriorityColor(selectedOrder.priority)}`}>
                    {getPriorityLabel(selectedOrder.priority)}
                  </Badge>
                  <span className="text-sm text-muted-foreground">
                    {(() => {
                      const studies = selectedOrder.studies || [];
                      // Match lab progress calculation: Results Ready = 90%, Verified = 100%
                      const statusWeights: Record<string, number> = {
                        'pending': 0,
                        'processing': 50,
                        'reported': 90,
                        'verified': 100,
                        'rejected': 100
                      };

                      const total = studies.reduce((sum: number, s: any) => {
                        const weight = statusWeights[s.status] || 0;
                        return sum + weight;
                      }, 0);

                      const percentage = studies.length > 0 ? Math.round(total / studies.length) : 0;
                      return `${percentage}% complete`;
                    })()}
                  </span>
                  <Progress
                    value={(() => {
                      const studies = selectedOrder.studies || [];
                      // Match lab progress calculation: Results Ready = 90%, Verified = 100%
                      const statusWeights: Record<string, number> = {
                        'pending': 0,
                        'processing': 50,
                        'reported': 90,
                        'verified': 100,
                        'rejected': 100
                      };

                      const total = studies.reduce((sum: number, s: any) => {
                        const weight = statusWeights[s.status] || 0;
                        return sum + weight;
                      }, 0);

                      return studies.length > 0 ? total / studies.length : 0;
                    })()}
                    className="flex-1 h-2"
                  />
                </div>

                {/* Patient & Doctor Info */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient</p>
                    <div className="flex items-start gap-2 mt-1">
                      <PatientAvatar name={selectedOrder.patient_name} photoUrl={resolvePatientPhoto(selectedOrder)} size="sm" />
                      <div>
                        <p className="font-medium">{selectedOrder.patient_name}</p>
                        <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                          {(() => {
                            const ids = [
                              selectedOrder.patient_details?.id ?? selectedOrder.patient,
                              selectedPatientFull?.patient_id,
                            ].filter((v) => v != null && String(v).trim() !== '');
                            const line = ids.map((v, i) => (i === 0 ? `Patient ID: ${v}` : String(v))).join(' • ');
                            return line ? <p>{line}</p> : null;
                          })()}
                          {(selectedOrder.patient_details?.age != null || selectedOrder.patient_details?.gender) && (
                            <p>
                              {[
                                selectedOrder.patient_details?.age != null ? `${selectedOrder.patient_details.age}y` : '',
                                selectedOrder.patient_details?.gender,
                              ]
                                .filter(Boolean)
                                .join(' ')}
                            </p>
                          )}
                          {(selectedPatientFull?.phone?.trim() || selectedPatientFull?.email?.trim()) && (
                            <p>
                              {[selectedPatientFull?.phone?.trim(), selectedPatientFull?.email?.trim()]
                                .filter(Boolean)
                                .join(' • ')}
                            </p>
                          )}
                          {(selectedPatientFull?.category || selectedOrder?.clinic) && (
                            <p>
                              {selectedPatientFull?.category ? `Category: ${selectedPatientFull.category}` : ''}
                              {selectedPatientFull?.category && selectedOrder?.clinic ? ' • ' : ''}
                              {selectedOrder?.clinic ? `Clinic: ${selectedOrder.clinic}` : ''}
                            </p>
                          )}
                          {selectedPatientFull?.category === 'dependent' && selectedPrincipalPersonalNumber && (
                            <p>Principal P.N.: {selectedPrincipalPersonalNumber}</p>
                          )}
                          <p>Location: {(selectedOrder as any).location_clinic_name || '—'}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    {isRadiologyExternalManualOrder(selectedOrder) ? (
                      <>
                        <p className="text-xs text-muted-foreground">Requesting Doctor on Form</p>
                        <div className="space-y-1 mt-1">
                          <p className="font-medium">
                            {selectedOrder.external_requesting_doctor_name?.trim() || '—'}
                          </p>
                          {selectedOrder.external_clinic_details?.name && (
                            <p className="text-xs text-muted-foreground">
                              Originating clinic: {selectedOrder.external_clinic_details.name}
                            </p>
                          )}
                          {selectedOrder.manual_request_reference && (
                            <p className="text-xs text-muted-foreground">Reference: {selectedOrder.manual_request_reference}</p>
                          )}
                          {selectedOrder.manual_request_file && (
                            <a
                              className="text-xs text-blue-600 hover:underline"
                              href={getRadiologyReportFileUrl(selectedOrder.manual_request_file)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              View attached manual request
                            </a>
                          )}
                        </div>
                      </>
                    ) : (
                      <>
                        <p className="text-xs text-muted-foreground">Ordering Doctor</p>
                        <p className="font-medium mt-1">{selectedOrder.doctor_name?.trim() || 'Unknown'}</p>
                        {selectedOrder.doctor_details?.specialty?.trim() && (
                          <p className="text-xs text-muted-foreground">{selectedOrder.doctor_details.specialty}</p>
                        )}
                      </>
                    )}
                  </div>
                </div>

                <Icd10DiagnosesBlock diagnoses={selectedOrder.icd10_diagnoses} compact />

                {/* Clinical Notes */}
                {selectedOrder.clinical_notes && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Clinical Notes</p>
                    <p className="text-sm">{selectedOrder.clinical_notes}</p>
                  </div>
                )}

                {/* Provisional Diagnosis & LMP */}
                {(selectedOrder.provisional_diagnosis || selectedOrder.lmp) && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {selectedOrder.provisional_diagnosis && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-muted-foreground mb-1">Provisional Diagnosis</p>
                        <p className="text-sm">{selectedOrder.provisional_diagnosis}</p>
                      </div>
                    )}
                    {selectedOrder.lmp && (
                      <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                        <p className="text-xs text-muted-foreground mb-1">LMP</p>
                        <p className="text-sm">{formatLmp(selectedOrder.lmp)}</p>
                      </div>
                    )}
                  </div>
                )}

                {/* Individual Studies - With Actions */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium">Studies ({selectedOrder.studies?.length || 0})</p>
                    <div className="flex items-center gap-2">
                      {/* Surface "Send to External Imaging Centre" only when at
                          least one study is eligible (pending/scheduled and not
                          on an issued dispatch). Disabled-but-visible would be
                          noisier than just hiding it. */}
                      {dispatchEligibleStudies.length > 0 && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void openDispatchDialog()}
                          className="h-8 border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:hover:bg-indigo-900/20"
                        >
                          <Send className="h-4 w-4 mr-2" />
                          Send to External
                          <Badge variant="secondary" className="ml-2 text-[10px] h-5">
                            {dispatchEligibleStudies.length}
                          </Badge>
                        </Button>
                      )}
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsAddStudyDialogOpen(true)}
                        className="h-8"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Study
                      </Button>
                    </div>
                  </div>
                  {selectedOrder.studies?.map((study: any, idx: number) => (
                    <div key={study.id || idx} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 bg-blue-500/10 text-blue-600">
                            {study.modality || study.procedure?.split(' ')[0] || 'X-Ray'}
                          </Badge>
                          <span className="font-medium">{study.procedure || 'Radiology Study'}</span>
                          {study.processing_method && (
                            <Badge variant="outline" className={`text-[10px] ${study.processing_method === 'in_house' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}`}>
                              {study.processing_method === 'in_house' ? <Building2 className="h-2.5 w-2.5 mr-0.5" /> : <Truck className="h-2.5 w-2.5 mr-0.5" />}
                              {study.processing_method === 'in_house' ? 'In-house' : 'Outsourced'}
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStudyStatusBadge(study.status)}`}>
                          {study.status === 'reported' ? 'Results Ready' :
                           study.status === 'processing' ? 'Processing' :
                           study.status === 'pending' ? 'Not Started' :
                           study.status || 'Not Started'}
                        </Badge>
                      </div>

                      {/* Study Details & Actions */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {study.acquired_by_name && <span>Acquired by {study.acquired_by_name} {study.acquired_at && `at ${formatDisplayTime(study.acquired_at)}`}</span>}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {(study.status === 'pending' || !study.status) && (
                            <Button size="sm" onClick={() => openProcessStudyDialog(study, selectedOrder)} className="h-7 px-3 bg-violet-500 hover:bg-violet-600 text-white text-xs">
                              <Beaker className="h-3 w-3 mr-1" />Start Processing
                            </Button>
                          )}
                          {study.status === 'processing' && (
                            <Button size="sm" onClick={() => openResultsDialog(study, selectedOrder)} className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs">
                              <FileText className="h-3 w-3 mr-1" />Enter Results
                            </Button>
                          )}
                          {study.status === 'reported' && (
                            <Button variant="outline" size="sm" className="h-7 px-3 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Complete
                            </Button>
                          )}
                          {study.status === 'rejected' && (
                            <Button
                              size="sm"
                              onClick={() => openResultsDialog(study, selectedOrder, true)}
                              className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />Rework & Resubmit
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Show Results if available */}
                      {(study.status === 'reported' || study.status === 'verified') && (
                        <div className={`mt-2 p-2 rounded text-xs ${study.critical ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                          <div className="flex items-center justify-between mb-1">
                            <p className={`font-medium ${study.critical ? 'text-rose-700 dark:text-rose-400' : 'text-emerald-700 dark:text-emerald-400'}`}>Results:</p>
                            {study.critical && (
                              <Badge className="text-[10px] px-1.5 py-0 bg-rose-500 text-white">
                                <AlertTriangle className="h-2 w-2 mr-0.5" />Critical
                              </Badge>
                            )}
                          </div>
                          {Array.isArray(study.custom_reports) && study.custom_reports.length > 0 ? (
                            <div className="space-y-2">
                              {study.custom_reports.map((row: any, rowIdx: number) => {
                                const attachment = (study.report_attachments || []).find((file: any) =>
                                  file.row_id === row.id || file.row_name?.trim().toLowerCase() === String(row.procedure || '').trim().toLowerCase()
                                );
                                const fileUrl = getRadiologyReportFileUrl(attachment?.file);
                                return (
                                  <div key={row.id || rowIdx} className="rounded border bg-background/70 p-2 space-y-1">
                                    <div className="flex items-center justify-between gap-2">
                                      <span className="font-medium">{row.procedure || `Custom study ${rowIdx + 1}`}</span>
                                      {row.critical && <Badge className="text-[10px] bg-rose-500 text-white">Critical</Badge>}
                                    </div>
                                    {row.report && <p className="whitespace-pre-wrap">{row.report}</p>}
                                    {row.recommendations && <p><span className="text-muted-foreground">Recommendations:</span> {row.recommendations}</p>}
                                    {fileUrl && (
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs text-blue-600"
                                        onClick={() => {
                                          void openMediaInNewTab(attachment?.file).catch((err: any) =>
                                            toast.error(err?.message || 'Failed to open file')
                                          );
                                        }}
                                      >
                                        <Eye className="h-3 w-3 mr-1" />View file
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-1">
                              {study.report && (
                                <div><span className="text-muted-foreground">Report:</span> <span className="font-medium">{study.report}</span></div>
                              )}
                              {!study.report && (
                                <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">Normal study</span></div>
                              )}
                            </div>
                          )}
                          {/* Show uploaded report file if available */}
                          {(study.report_file_url || study.report_file) && (
                            <div className="mt-2 p-2 rounded bg-blue-50 dark:bg-blue-900/20 flex items-center justify-between border border-blue-200 dark:border-blue-800">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-blue-600" />
                                <span className="text-xs font-medium text-blue-800 dark:text-blue-200">
                                  {study.report_file ? (typeof study.report_file === 'string' ? study.report_file.split('/').pop() : 'Report File') : 'Report File'}
                                </span>
                              </div>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700"
                                onClick={() => {
                                  const fileUrl =
                                    study.report_file_url ||
                                    (study.report_file && typeof study.report_file === 'string'
                                      ? study.report_file
                                      : null);
                                  if (fileUrl) {
                                    void openMediaInNewTab(fileUrl).catch((err: unknown) =>
                                      toast.error(err instanceof Error ? err.message : 'Failed to open file'),
                                    );
                                  } else {
                                    toast.error('File URL not available');
                                  }
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />View
                              </Button>
                            </div>
                          )}
                          {/* Show additional uploaded files (attachments without a row_id) */}
                          {Array.isArray(study.report_attachments) && study.report_attachments.filter((att: any) => !att.row_id).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {study.report_attachments.filter((att: any) => !att.row_id).map((att: any) => {
                                const fileUrl = getRadiologyReportFileUrl(att.file);
                                return (
                                  <div key={att.id} className="p-2 rounded bg-blue-50/50 dark:bg-blue-900/10 flex items-center justify-between border border-blue-200/50 dark:border-blue-800/50">
                                    <div className="flex items-center gap-2">
                                      <FileText className="h-4 w-4 text-blue-400" />
                                      <span className="text-xs text-blue-700 dark:text-blue-300">{att.row_name || 'Additional File'}</span>
                                    </div>
                                    {fileUrl && (
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700"
                                        onClick={() => {
                                          void openMediaInNewTab(att.file).catch((err: any) =>
                                            toast.error(err?.message || 'Failed to open file')
                                          );
                                        }}
                                      >
                                        <Eye className="h-3 w-3 mr-1" />View
                                      </Button>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Dispatches History — every batch send-out for this order.
                    Lets the radiographer reprint paperwork or cancel an
                    issued dispatch without leaving this dialog. */}
                {(orderDispatches.length > 0 || loadingOrderDispatches) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <History className="h-4 w-4 text-indigo-500" />
                      <p className="text-sm font-medium">Dispatches</p>
                      {loadingOrderDispatches && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
                    </div>
                    <div className="space-y-2">
                      {orderDispatches.map((d) => {
                        const issuedDate = d.issued_at ? new Date(d.issued_at) : null;
                        const isActive = d.status === 'issued';
                        const fmtTime = (iso?: string | null) => {
                          if (!iso) return '';
                          const formatted = formatDisplayTime(iso);
                          return formatted === '—' ? '' : formatted;
                        };
                        return (
                          <div
                            key={d.id}
                            className={`p-3 rounded-lg border space-y-2 ${
                              isActive
                                ? 'border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-900/10'
                                : 'border-muted bg-muted/30'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2 flex-wrap text-xs">
                                <span className="inline-flex items-center gap-1 font-mono font-medium text-indigo-700 dark:text-indigo-400">
                                  <Hash className="h-3 w-3" />{d.dispatch_id}
                                </span>
                                <Badge
                                  variant="outline"
                                  className={
                                    d.status === 'issued'
                                      ? 'bg-indigo-500/10 text-indigo-600 text-[10px]'
                                      : d.status === 'cancelled'
                                      ? 'bg-rose-500/10 text-rose-600 text-[10px]'
                                      : 'bg-amber-500/10 text-amber-600 text-[10px]'
                                  }
                                >
                                  {d.status}
                                </Badge>
                                <span className="text-muted-foreground">→</span>
                                <span className="font-medium">{d.partner_name}</span>
                                <span className="text-muted-foreground">
                                  • {d.studies.length} stud{d.studies.length === 1 ? 'y' : 'ies'}
                                </span>
                                {issuedDate && (
                                  <span className="text-muted-foreground">
                                    • {formatDisplayDate(d.issued_at)} {fmtTime(d.issued_at)}
                                    {d.issued_by_name ? ` by ${d.issued_by_name}` : ''}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-1">
                                <Button
                                  type="button"
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => openExistingDispatchPanel(d)}
                                  title="Reprint referral letter / responsibility form"
                                >
                                  <Printer className="h-3 w-3 mr-1" />
                                  Reprint
                                </Button>
                                {isActive && (
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 px-2 text-xs text-rose-600 hover:text-rose-700 hover:bg-rose-50"
                                    onClick={() => handleCancelDispatch(d)}
                                    disabled={cancellingDispatchId === d.id}
                                    title="Cancel this dispatch and revert studies to Pending"
                                  >
                                    {cancellingDispatchId === d.id ? (
                                      <Loader2 className="h-3 w-3 animate-spin" />
                                    ) : (
                                      <X className="h-3 w-3 mr-1" />
                                    )}
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </div>
                            <div className="flex flex-wrap gap-1">
                              {d.studies.map((s) => (
                                <Badge
                                  key={s.id}
                                  variant="outline"
                                  className="text-[10px] bg-background"
                                  title={`${s.modality || ''}${s.body_part ? ` • ${s.body_part}` : ''} • Status: ${s.status}`}
                                >
                                  {s.procedure}
                                </Badge>
                              ))}
                            </div>
                            <div className="flex flex-wrap gap-3 text-[10px] text-muted-foreground">
                              <span className="inline-flex items-center gap-1">
                                <Mail className="h-3 w-3" />
                                Referral letter:{' '}
                                {d.referral_letter_printed_at
                                  ? `printed ${fmtTime(d.referral_letter_printed_at)}`
                                  : 'not printed'}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <FileSignature className="h-3 w-3" />
                                Responsibility form:{' '}
                                {d.responsibility_form_printed_at
                                  ? `printed ${fmtTime(d.responsibility_form_printed_at)}`
                                  : 'not printed'}
                              </span>
                              {d.cancellation_reason && (
                                <span className="text-rose-600">Reason: {d.cancellation_reason}</span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={isAddStudyDialogOpen}
          onOpenChange={(open) => {
            setIsAddStudyDialogOpen(open);
            if (!open) {
              setTemplateSearch('');
              setSelectedTemplate(null);
              setAddStudyProcessingMethod('in_house');
              setAddStudyOutsourcedFacility('');
            }
          }}
        >
          <DialogContent className={MODAL_SIZES.ml}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-amber-500" />
                Add Study
              </DialogTitle>
              <DialogDescription>
                {selectedOrder?.order_id ? `${selectedOrder.order_id} • Add an imaging study to this order` : 'Add an imaging study to this order'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="template-search">Search & Select Imaging Study</Label>
                <Input
                  id="template-search"
                  placeholder="Type to search by name or code..."
                  value={templateSearch}
                  onChange={(e) => {
                    setTemplateSearch(e.target.value);
                    if (!templates.length && !loadingTemplates) loadTemplates();
                  }}
                />
                {loadingTemplates && (
                  <div className="text-xs text-muted-foreground flex items-center gap-2">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Loading templates...
                  </div>
                )}
                {templateSearch.trim() && filteredTemplates.length > 0 && (
                  <div className="border rounded-md max-h-56 overflow-y-auto">
                    {filteredTemplates.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => {
                          setSelectedTemplate(t);
                          setTemplateSearch(`${t.name ?? ''}`.trim());
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted/60 transition-colors flex items-start justify-between gap-3"
                      >
                        <div>
                          <div className="text-sm font-medium">{t.name}</div>
                          <div className="text-xs text-muted-foreground">{t.code}</div>
                        </div>
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                          {t.modality || t.category || 'Study'}
                        </Badge>
                      </button>
                    ))}
                  </div>
                )}
                {selectedTemplate && (
                  <div className="p-3 rounded-md bg-muted/40">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">{selectedTemplate.name}</p>
                        <p className="text-xs text-muted-foreground">{selectedTemplate.code}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                        {selectedTemplate.modality || selectedTemplate.category || 'Study'}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Processing Method</Label>
                  <Select value={addStudyProcessingMethod} onValueChange={(v) => setAddStudyProcessingMethod(v as any)}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select method" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="in_house">In-house</SelectItem>
                      <SelectItem value="outsourced">Outsourced</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {addStudyProcessingMethod === 'outsourced' && (
                  <div className="space-y-2">
                    <Label htmlFor="outsourced-facility">Outsourced Facility</Label>
                    <Input
                      id="outsourced-facility"
                      placeholder="Enter facility name..."
                      value={addStudyOutsourcedFacility}
                      onChange={(e) => setAddStudyOutsourcedFacility(e.target.value)}
                    />
                  </div>
                )}
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddStudyDialogOpen(false)} disabled={isAddingStudy}>
                Cancel
              </Button>
              <Button onClick={handleAddStudy} disabled={isAddingStudy || !selectedTemplate} className="bg-amber-500 hover:bg-amber-600">
                {isAddingStudy ? 'Adding...' : 'Add Study'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Imaging Partner Dialog */}
        {/* Add / Edit Imaging Partner Dialog — single dialog that handles
            both modes. `editingPartnerId !== null` drives the title, button
            label, and POST-vs-PATCH switch in `handleSubmitPartner`. */}
        <Dialog
          open={isAddPartnerDialogOpen}
          onOpenChange={(open) => {
            setIsAddPartnerDialogOpen(open);
            if (!open) resetPartnerForm();
          }}
        >
          <DialogContent className={MODAL_SIZES.sm2}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {editingPartnerId !== null ? (
                  <Pencil className="h-5 w-5 text-blue-500" />
                ) : (
                  <Plus className="h-5 w-5 text-emerald-500" />
                )}
                {editingPartnerId !== null ? 'Edit Imaging Partner' : 'Add Imaging Partner'}
              </DialogTitle>
              <DialogDescription>
                {editingPartnerId !== null
                  ? 'Update partner details. The address and addressee role are printed on referral letters and responsibility forms.'
                  : 'Add a new external imaging centre as an outsourced partner. The address and addressee role are printed on referral letters and responsibility forms.'}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <Label htmlFor="partner-name">Partner Name *</Label>
                  <Input
                    id="partner-name"
                    value={newPartnerName}
                    onChange={(e) => setNewPartnerName(e.target.value)}
                    placeholder="e.g. Mecure Healthcare"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-code">Code (optional)</Label>
                  <Input
                    id="partner-code"
                    value={newPartnerCode}
                    onChange={(e) => setNewPartnerCode(e.target.value)}
                    placeholder="e.g. MECURE"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-contact-title">Addressee Role</Label>
                  <Input
                    id="partner-contact-title"
                    value={newPartnerContactTitle}
                    onChange={(e) => setNewPartnerContactTitle(e.target.value)}
                    placeholder="e.g. The Chief Medical Director"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-email">Email (optional)</Label>
                  <Input
                    id="partner-email"
                    type="email"
                    value={newPartnerEmail}
                    onChange={(e) => setNewPartnerEmail(e.target.value)}
                    placeholder="e.g. contact@mecure.healthcare"
                    disabled={isSubmittingPartner}
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="partner-phone">Phone (optional)</Label>
                  <Input
                    id="partner-phone"
                    value={newPartnerPhone}
                    onChange={(e) => setNewPartnerPhone(e.target.value)}
                    placeholder="e.g. +234-1-234-5678"
                    disabled={isSubmittingPartner}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="partner-address">Postal Address</Label>
                <Textarea
                  id="partner-address"
                  value={newPartnerAddress}
                  onChange={(e) => setNewPartnerAddress(e.target.value)}
                  placeholder={'e.g.\nPlot B, Block XII, Alhaji Adejumo Avenue,\n(beside Total Filling Station),\nOff Oshodi Gbagada Expressway,\nAnthony, Lagos.'}
                  className="min-h-[6rem] text-sm"
                  disabled={isSubmittingPartner}
                />
                <p className="text-xs text-muted-foreground">
                  One line per row. Used on referral letters and responsibility forms.
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsAddPartnerDialogOpen(false)}
                disabled={isSubmittingPartner}
              >
                Cancel
              </Button>
              <Button
                onClick={handleSubmitPartner}
                disabled={isSubmittingPartner || !newPartnerName.trim()}
                className={
                  editingPartnerId !== null
                    ? 'bg-blue-600 hover:bg-blue-700'
                    : 'bg-emerald-600 hover:bg-emerald-700'
                }
              >
                {isSubmittingPartner ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {editingPartnerId !== null ? 'Saving...' : 'Adding...'}
                  </>
                ) : editingPartnerId !== null ? (
                  <>
                    <Pencil className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4 mr-2" />
                    Add Partner
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Manage Imaging Partners Dialog */}
        <Dialog
          open={isManagePartnersDialogOpen}
          onOpenChange={(open) => {
            setIsManagePartnersDialogOpen(open);
            // Lazily refresh partners the first time it's opened so the
            // list works even if the user never went through the dispatch
            // flow on this session.
            if (open && imagingPartners.length === 0 && !loadingImagingPartners) {
              void loadImagingPartners();
            }
          }}
        >
          <DialogContent className={MODAL_SIZES.sm2}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-500" />
                Manage Imaging Partners
              </DialogTitle>
              <DialogDescription>
                View and manage all imaging partners for outsourced study processing.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 py-2">
              {imagingPartners.length === 0 ? (
                <div className="text-center py-6 text-muted-foreground">
                  <p>No imaging partners added yet.</p>
                  <p className="text-xs mt-1">Click &quot;Add Partner&quot; to create one.</p>
                </div>
              ) : (
                imagingPartners.map((partner) => (
                  <div key={partner.id} className="flex items-start justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <p className="font-medium text-sm">{partner.name}</p>
                      {partner.code && (
                        <p className="text-xs text-muted-foreground">Code: {partner.code}</p>
                      )}
                      {partner.contact_person_title && (
                        <p className="text-xs text-muted-foreground">
                          Addressee: {partner.contact_person_title}
                        </p>
                      )}
                      {partner.address ? (
                        <p className="text-xs text-muted-foreground whitespace-pre-line">
                          {partner.address}
                        </p>
                      ) : (
                        // Surface missing addresses inline so admins can spot
                        // partners that will currently print without an
                        // addressee block on the referral letter.
                        <p className="text-xs text-amber-600 dark:text-amber-400 inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          No postal address — letters will print without it
                        </p>
                      )}
                      {partner.email && (
                        <p className="text-xs text-muted-foreground">📧 {partner.email}</p>
                      )}
                      {partner.phone && (
                        <p className="text-xs text-muted-foreground">📞 {partner.phone}</p>
                      )}
                    </div>
                    <div className="ml-2 flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditPartnerDialog(partner)}
                        disabled={deletingPartnerId === partner.id}
                        className="text-blue-600 hover:text-blue-700 hover:bg-blue-50 h-8 px-2"
                        title={`Edit ${partner.name}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleDeletePartner(partner.id, partner.name)}
                        disabled={deletingPartnerId === partner.id}
                        className="text-red-600 hover:text-red-700 hover:bg-red-50 h-8 px-2"
                        title={`Delete ${partner.name}`}
                      >
                        {deletingPartnerId === partner.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <X className="h-4 w-4" />
                        )}
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setIsManagePartnersDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Delete Imaging Partner Confirmation Dialog */}
        <Dialog open={deleteConfirmPartnerId !== null} onOpenChange={(open) => {
          if (!open) {
            setDeleteConfirmPartnerId(null);
            setDeleteConfirmPartnerName('');
          }
        }}>
          <DialogContent className={MODAL_SIZES.sm}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                Delete Imaging Partner
              </DialogTitle>
              <DialogDescription>
                Are you sure you want to delete "{deleteConfirmPartnerName}"?
              </DialogDescription>
            </DialogHeader>

            <p className="text-sm text-muted-foreground py-2">
              This action will remove the imaging partner from the system. Studies already assigned to this partner will not be affected.
            </p>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setDeleteConfirmPartnerId(null);
                  setDeleteConfirmPartnerName('');
                }}
                disabled={deletingPartnerId === deleteConfirmPartnerId}
              >
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={confirmDeletePartner}
                disabled={deletingPartnerId === deleteConfirmPartnerId}
              >
                {deletingPartnerId === deleteConfirmPartnerId ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Deleting...
                  </>
                ) : (
                  'Delete'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ────────────────────────────────────────────────────────────────
            Send to External Imaging Centre — 2-stage dispatch dialog.
            Stage 1 picks studies + partner + notes; stage 2 swaps to a
            confirmation panel that prints the standardised Referral Letter
            and Responsibility Form. Mirrors the lab dispatch dialog in
            `app/laboratory/orders/page.tsx` so future tweaks port cleanly.
        ──────────────────────────────────────────────────────────────── */}
        <Dialog
          open={isDispatchDialogOpen}
          onOpenChange={(open) => {
            setIsDispatchDialogOpen(open);
            if (!open) {
              setConfirmedDispatch(null);
              setReferralLetterPrinted(false);
              setResponsibilityFormPrinted(false);
            }
          }}
        >
          <DialogContent className={MODAL_SIZES.ml}>
            {confirmedDispatch ? (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                    Dispatch Issued
                  </DialogTitle>
                  <DialogDescription>
                    Print the paperwork that travels with the patient. Both
                    documents are stamped with dispatch{' '}
                    <span className="font-mono font-medium">{confirmedDispatch.dispatch_id}</span>.
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-4 py-2">
                  <div className="p-4 rounded-lg border border-indigo-200 bg-indigo-50/40 dark:border-indigo-900/40 dark:bg-indigo-900/10 space-y-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Hash className="h-4 w-4 text-indigo-600" />
                      <span className="font-mono font-medium text-indigo-700 dark:text-indigo-400">
                        {confirmedDispatch.dispatch_id}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="font-medium">{confirmedDispatch.partner_name}</span>
                      <Badge variant="outline" className="bg-background text-[10px]">
                        {confirmedDispatch.studies.length} stud{confirmedDispatch.studies.length === 1 ? 'y' : 'ies'}
                      </Badge>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {confirmedDispatch.studies.map((s) => (
                        <Badge key={s.id} variant="outline" className="text-[10px] bg-background">
                          {s.procedure}
                        </Badge>
                      ))}
                    </div>
                    {confirmedDispatch.notes && (
                      <p className="text-xs text-muted-foreground">Notes: {confirmedDispatch.notes}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => openDispatchPdf('referral', confirmedDispatch)}
                      disabled={isPrintingReferral}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        referralLetterPrinted
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'
                      } ${isPrintingReferral ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isPrintingReferral ? (
                          <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                        ) : (
                          <Mail className={`h-5 w-5 ${referralLetterPrinted ? 'text-emerald-600' : 'text-indigo-600'}`} />
                        )}
                        <p className="font-medium">Referral Letter</p>
                        {referralLetterPrinted && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Letter to <span className="font-medium">{confirmedDispatch.partner_name}</span>{' '}
                        listing the requested imaging studies.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => openDispatchPdf('responsibility', confirmedDispatch)}
                      disabled={isPrintingResponsibility}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        responsibilityFormPrinted
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                          : 'border-indigo-300 hover:border-indigo-500 hover:bg-indigo-50/50 dark:hover:bg-indigo-900/10'
                      } ${isPrintingResponsibility ? 'opacity-60 cursor-wait' : ''}`}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        {isPrintingResponsibility ? (
                          <Loader2 className="h-5 w-5 text-indigo-600 animate-spin" />
                        ) : (
                          <FileSignature className={`h-5 w-5 ${responsibilityFormPrinted ? 'text-emerald-600' : 'text-indigo-600'}`} />
                        )}
                        <p className="font-medium">Responsibility Form</p>
                        {responsibilityFormPrinted && (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 ml-auto" />
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Patient acknowledgement & financial responsibility for the outsourced imaging.
                      </p>
                    </button>
                  </div>

                  {!referralLetterPrinted && !responsibilityFormPrinted && (
                    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-300">
                      <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                      <p>
                        You can reprint these later from the Dispatches list on the order detail. The
                        dispatch is already saved with serial{' '}
                        <span className="font-mono font-medium">{confirmedDispatch.dispatch_id}</span>.
                      </p>
                    </div>
                  )}
                </div>

                <DialogFooter>
                  <Button onClick={handleDoneDispatch} className="bg-emerald-500 hover:bg-emerald-600">
                    <CheckCircle2 className="h-4 w-4 mr-2" />
                    Done
                  </Button>
                </DialogFooter>
              </>
            ) : (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Send className="h-5 w-5 text-indigo-500" />
                    Send to External Imaging Centre
                  </DialogTitle>
                  <DialogDescription>
                    Issue a referral dispatch for one or more pending studies. We&apos;ll
                    generate a serial (RAD-YYYY-NNNNNN) and the standardised paperwork.
                  </DialogDescription>
                </DialogHeader>

                {selectedOrder && (
                  <div className="space-y-4 py-2">
                    <div className="p-3 rounded-lg bg-muted/50 text-sm space-y-1">
                      <div className="flex flex-wrap justify-between gap-2">
                        <span><span className="text-muted-foreground">Patient:</span> <span className="font-medium">{selectedOrder.patient_details?.name || selectedOrder.patient_name || '—'}</span></span>
                        <span><span className="text-muted-foreground">Order:</span> <span className="font-mono font-medium">{selectedOrder.order_id}</span></span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Studies to send out *</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDispatchSelectedStudyIds(dispatchEligibleStudies.map((s: any) => Number(s.id)))}
                            className="text-xs h-auto p-1"
                            disabled={dispatchEligibleStudies.length === 0 || dispatchSelectedStudyIds.length === dispatchEligibleStudies.length}
                          >
                            Select all
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setDispatchSelectedStudyIds([])}
                            className="text-xs h-auto p-1"
                            disabled={dispatchSelectedStudyIds.length === 0}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>

                      {dispatchEligibleStudies.length === 0 ? (
                        <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground text-center">
                          No pending studies are waiting for processing. All studies on this
                          order are already in progress, complete, or on an active dispatch.
                        </div>
                      ) : (
                        <div className="rounded-lg border max-h-56 overflow-y-auto divide-y">
                          {dispatchEligibleStudies.map((s: any) => {
                            const studyId = Number(s.id);
                            const checked = dispatchSelectedStudyIds.includes(studyId);
                            return (
                              <label
                                key={studyId}
                                className={`flex items-center gap-3 p-2.5 cursor-pointer hover:bg-muted/50 ${
                                  checked ? 'bg-indigo-50/50 dark:bg-indigo-900/10' : ''
                                }`}
                              >
                                <Checkbox
                                  checked={checked}
                                  onCheckedChange={() => toggleDispatchStudy(studyId)}
                                />
                                <div className="flex-1 min-w-0">
                                  <div className="flex flex-wrap items-center gap-2">
                                    <span className="text-sm font-medium">{s.procedure}</span>
                                    {s.modality && (
                                      <Badge variant="outline" className="text-[10px]">{s.modality}</Badge>
                                    )}
                                    {s.body_part && (
                                      <Badge variant="outline" className="text-[10px] bg-muted">{s.body_part}</Badge>
                                    )}
                                    <Badge variant="outline" className="text-[10px] capitalize">{s.status}</Badge>
                                  </div>
                                </div>
                              </label>
                            );
                          })}
                        </div>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {dispatchSelectedStudyIds.length} of {dispatchEligibleStudies.length} selected
                      </p>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Imaging partner *</Label>
                        <div className="flex gap-2">
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsManagePartnersDialogOpen(true)}
                            className="text-xs h-auto p-1"
                          >
                            ⚙️ Manage
                          </Button>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsAddPartnerDialogOpen(true)}
                            className="text-xs h-auto p-1"
                          >
                            <Plus className="h-3 w-3 mr-0.5" />Add
                          </Button>
                        </div>
                      </div>
                      <Select
                        value={dispatchPartnerId}
                        onValueChange={setDispatchPartnerId}
                        disabled={loadingImagingPartners}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingImagingPartners ? 'Loading partners…' : 'Choose an imaging partner…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {imagingPartners.length === 0 && !loadingImagingPartners && (
                            <div className="px-2 py-1.5 text-xs text-muted-foreground">
                              No partners yet — click <span className="font-medium">+ Add</span> to create one.
                            </div>
                          )}
                          {imagingPartners.map((p) => (
                            <SelectItem key={p.id} value={String(p.id)}>
                              <div className="flex flex-col">
                                <span className="font-medium">{p.name}</span>
                                {p.address && (
                                  <span className="text-[11px] text-muted-foreground line-clamp-1">
                                    {p.address.split('\n')[0]}
                                  </span>
                                )}
                              </div>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {dispatchPartnerId && (() => {
                        const partner = imagingPartners.find((p) => String(p.id) === dispatchPartnerId);
                        if (!partner) return null;
                        const hasAddress = !!(partner.address || '').trim();
                        if (hasAddress) {
                          return (
                            <div className="rounded-lg border bg-muted/30 p-2 text-xs text-muted-foreground whitespace-pre-line">
                              <span className="font-medium text-foreground block mb-0.5">
                                {partner.contact_person_title || 'The Medical Director'}
                              </span>
                              {partner.address}
                            </div>
                          );
                        }
                        return (
                          <div className="rounded-lg border border-amber-200 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-900/10 p-3 text-xs text-amber-800 dark:text-amber-300 flex items-start gap-2">
                            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                            <div className="flex-1 space-y-1">
                              <p>
                                <span className="font-medium">{partner.name}</span> has no postal
                                address saved. Letters will print without it — the partner
                                won&apos;t see the addressee block.
                              </p>
                              <button
                                type="button"
                                className="font-medium underline hover:text-amber-900 dark:hover:text-amber-200"
                                onClick={() => openEditPartnerDialog(partner)}
                              >
                                Edit partner →
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="rad-dispatch-notes">Notes (optional)</Label>
                      <Textarea
                        id="rad-dispatch-notes"
                        value={dispatchNotes}
                        onChange={(e) => setDispatchNotes(e.target.value)}
                        placeholder="Anything the receiving imaging centre should know — patient mobility, urgency, contact, etc."
                        className="min-h-[4.5rem] text-sm"
                      />
                    </div>
                  </div>
                )}

                <DialogFooter>
                  <Button variant="outline" onClick={() => setIsDispatchDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleCreateDispatch}
                    disabled={
                      isCreatingDispatch ||
                      dispatchSelectedStudyIds.length === 0 ||
                      !dispatchPartnerId
                    }
                    className="bg-indigo-500 hover:bg-indigo-600"
                  >
                    {isCreatingDispatch ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4 mr-2" />
                    )}
                    Issue Dispatch
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Done-without-printing nudge — shown when the user closes the
            confirmation panel without opening either PDF. Regular Dialog
            (not AlertDialog) to match the rest of the radiology page. */}
        <Dialog
          open={skipPrintConfirmOpen}
          onOpenChange={(open) => {
            if (!open) setSkipPrintConfirmOpen(false);
          }}
        >
          <DialogContent className={MODAL_SIZES.sm}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                Close without printing the paperwork?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  You haven&apos;t opened the <span className="font-medium">Referral Letter</span>{' '}
                  or the <span className="font-medium">Responsibility Form</span> yet
                  {confirmedDispatch && (
                    <>
                      {' '}for{' '}
                      <span className="font-mono font-medium">{confirmedDispatch.dispatch_id}</span>
                    </>
                  )}
                  .
                </span>
                <span className="block">
                  The dispatch is already saved on the server — you can reprint either document
                  any time from the <span className="font-medium">Dispatches</span> list on this
                  order. The patient won&apos;t move forward without that paperwork though, so
                  don&apos;t forget to print before sending them out.
                </span>
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setSkipPrintConfirmOpen(false)}>
                Stay & Print
              </Button>
              <Button
                onClick={confirmDoneSkipPrint}
                className="bg-amber-500 hover:bg-amber-600 focus:ring-amber-500"
              >
                Close anyway
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel-dispatch confirmation — collects an optional reason and
            spells out the side-effect (studies revert to Pending so a fresh
            dispatch can be issued). */}
        <Dialog
          open={cancelDispatchTarget !== null}
          onOpenChange={(open) => {
            // Block dismiss while the API call is in flight so the spinner
            // stays visible. Otherwise reset target + reason on close.
            if (!open && cancellingDispatchId === null) {
              setCancelDispatchTarget(null);
              setCancelDispatchReason('');
            }
          }}
        >
          <DialogContent className={MODAL_SIZES.xs}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <X className="h-5 w-5 text-rose-500" />
                Cancel dispatch{cancelDispatchTarget ? ` ${cancelDispatchTarget.dispatch_id}` : ''}?
              </DialogTitle>
              <DialogDescription className="space-y-2">
                <span className="block">
                  This dispatch was issued to{' '}
                  <span className="font-medium">
                    {cancelDispatchTarget?.partner_name || 'the external imaging centre'}
                  </span>{' '}
                  with {cancelDispatchTarget?.studies.length ?? 0}{' '}
                  stud{(cancelDispatchTarget?.studies.length ?? 0) === 1 ? 'y' : 'ies'}.
                </span>
                <span className="block">
                  Each study still in <span className="font-medium">processing</span> will be
                  reverted to <span className="font-medium">Pending</span>. You can then issue a
                  fresh dispatch (to the same or a different partner) without any manual reset.
                  Studies with reports already submitted are left as-is.
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-1 pt-1">
              <Label htmlFor="rad-cancel-dispatch-reason" className="text-xs text-muted-foreground">
                Reason (optional, recorded on audit log)
              </Label>
              <Textarea
                id="rad-cancel-dispatch-reason"
                value={cancelDispatchReason}
                onChange={(e) => setCancelDispatchReason(e.target.value)}
                placeholder="e.g. Wrong partner selected; patient to be re-routed."
                className="min-h-[4rem] text-sm"
                disabled={cancellingDispatchId !== null}
              />
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setCancelDispatchTarget(null);
                  setCancelDispatchReason('');
                }}
                disabled={cancellingDispatchId !== null}
              >
                Keep dispatch
              </Button>
              <Button
                onClick={() => void confirmCancelDispatch()}
                disabled={cancellingDispatchId !== null}
                className="bg-rose-600 hover:bg-rose-700 focus:ring-rose-500"
              >
                {cancellingDispatchId !== null ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Cancelling…
                  </>
                ) : (
                  <>
                    <X className="h-4 w-4 mr-2" />
                    Cancel dispatch
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
