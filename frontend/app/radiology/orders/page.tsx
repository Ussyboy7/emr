"use client";

import { useState, useEffect, useMemo, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
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
import { patientService, radiologyService, formatPatientGenderLabel } from '@/lib/services';
import { PatientAvatar } from '@/components/PatientAvatar';
import { Icd10DiagnosesBlock } from '@/components/medical/Icd10DiagnosesBlock';
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { CustomDateRangeButton } from '@/components/CustomDateRangeButton';
import {
  ClipboardList, Search, Eye, Calendar, Clock, Activity, CheckCircle2,
  FileBarChart, AlertTriangle, ScanLine, User, ArrowRight,
  CalendarDays, Loader2, Play, FileText,
  Beaker, Building2, Truck, RotateCcw, XCircle, TestTube, Plus, X
} from 'lucide-react';

const formatOrderedAtDisplay = (isoString: string | undefined): string => {
  if (!isoString) return '';
  try {
    const date = new Date(isoString);
    if (Number.isNaN(date.getTime())) return '';
    const datePart = date.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
    const timePart = date.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
    return `${datePart}, ${timePart}`;
  } catch {
    return '';
  }
};

export default function RadiologyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [processingFilter, setProcessingFilter] = useState<'all' | 'in_house' | 'outsourced'>('all');
  const [activeTab, setActiveTab] = useState('all');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

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
            <PatientAvatar name={order.patient_name ?? ''} size="sm" />

            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{order.patient_name ?? ''}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityColor(order.priority)}`}>
                    {getPriorityLabel(order.priority)}
                  </Badge>
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
                <span>{order.doctor_name || 'System Administrator'}</span>
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
    } catch (error: any) {
      toast.error(error.message || 'Failed to load order details');
    }
  };

  // Open process study dialog (like lab)
  const openProcessStudyDialog = (study: any, order: any) => {
    setSelectedStudy(study);
    setSelectedOrder(order);
    setProcessingMethod('in_house');
    setOutsourcedLab('');
    setIsProcessDialogOpen(true);
  };

  // Handle starting study processing
  const handleStartProcessing = async () => {
    if (!selectedStudy || !selectedOrder) return;

    setIsSubmittingResults(true);
    try {
      // Update study status to processing
      await radiologyService.updateStudyStatus(selectedStudy.id, 'processing', {
        processing_method: processingMethod,
        outsourced_lab: processingMethod === 'outsourced' ? outsourcedLab : null
      });

      toast.success('Study processing started successfully');
      setIsProcessDialogOpen(false);
      
      // Reload orders to get updated data
      await loadOrders();
      
      // Update selectedOrder if view dialog is still open (like lab orders)
      if (isViewDialogOpen && selectedOrder) {
        const updatedOrder = await radiologyService.getOrder(selectedOrder.id);
        setSelectedOrder(updatedOrder);
      }
    } catch (error: any) {
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
      const res = await radiologyService.getImagingPartners({ page_size: 200 });
      setImagingPartners(res.results || []);
    } catch (e: any) {
      console.error('getImagingPartners failed', e?.status, e?.body, e);
      toast.error('Failed to load imaging partners');
      setImagingPartners([]);
    } finally {
      setLoadingImagingPartners(false);
    }
  }, []);

  // Add Imaging Partner
  const handleAddPartner = async () => {
    if (!newPartnerName.trim()) {
      toast.error('Partner name is required');
      return;
    }

    setIsSubmittingPartner(true);
    try {
      const newPartner = await radiologyService.createImagingPartner({
        name: newPartnerName.trim(),
        code: newPartnerCode.trim() || undefined,
        email: newPartnerEmail.trim() || undefined,
        phone: newPartnerPhone.trim() || undefined,
        is_active: true,
        sort_order: imagingPartners.length
      });

      setImagingPartners((prev) => [...prev, newPartner]);
      toast.success(`Imaging partner "${newPartner.name}" added successfully`);

      setNewPartnerName('');
      setNewPartnerCode('');
      setNewPartnerEmail('');
      setNewPartnerPhone('');
      setIsSubmittingPartner(false);
      setIsAddPartnerDialogOpen(false);
    } catch (error: any) {
      console.error('Add imaging partner error:', error);
      toast.error(error?.message || 'Failed to add imaging partner');
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
  const [resultEntryMode, setResultEntryMode] = useState<'manual' | 'upload'>('manual');
  const [resultsForm, setResultsForm] = useState({
    report: '',
    critical: false,
    reportFile: null as File | null,
  });
  const [isSubmittingResults, setIsSubmittingResults] = useState(false);

  // Processing method selection (like lab)
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
  const [processingMethod, setProcessingMethod] = useState<'in_house' | 'outsourced'>('in_house');
  const [outsourcedLab, setOutsourcedLab] = useState('');

  // Imaging Partners management (like lab partners)
  const [imagingPartners, setImagingPartners] = useState<any[]>([]);
  const [loadingImagingPartners, setLoadingImagingPartners] = useState(false);
  const [isAddPartnerDialogOpen, setIsAddPartnerDialogOpen] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [newPartnerCode, setNewPartnerCode] = useState('');
  const [newPartnerEmail, setNewPartnerEmail] = useState('');
  const [newPartnerPhone, setNewPartnerPhone] = useState('');
  const [isSubmittingPartner, setIsSubmittingPartner] = useState(false);
  const [isManagePartnersDialogOpen, setIsManagePartnersDialogOpen] = useState(false);
  const [deletingPartnerId, setDeletingPartnerId] = useState<number | null>(null);
  const [deleteConfirmPartnerId, setDeleteConfirmPartnerId] = useState<number | null>(null);
  const [deleteConfirmPartnerName, setDeleteConfirmPartnerName] = useState<string>('');

  const [isAddStudyDialogOpen, setIsAddStudyDialogOpen] = useState(false);
  const [templates, setTemplates] = useState<any[]>([]);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [templateSearch, setTemplateSearch] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [addStudyProcessingMethod, setAddStudyProcessingMethod] = useState<'in_house' | 'outsourced'>('in_house');
  const [addStudyOutsourcedFacility, setAddStudyOutsourcedFacility] = useState('');
  const [isAddingStudy, setIsAddingStudy] = useState(false);

  const normalizePriority = (value: unknown): string => String(value || '').trim().toLowerCase();

  const normalizeGender = (value: unknown): string => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'm') return 'male';
    if (v === 'f') return 'female';
    return v;
  };

  const matchesDateFilter = (isoDate: string | undefined, filter: string): boolean => {
    if (filter === 'all') return true;
    if (!isoDate) {
      console.log('Date filter: no date, returning false');
      return false;
    }
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) {
      console.log('Date filter: invalid date', isoDate);
      return false;
    }

    // Use local timezone for comparison
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (filter === 'today') {
      const result = dt >= todayStart && dt < tomorrowStart;
      console.log('Date filter today:', { isoDate, dt: dt.toISOString(), todayStart: todayStart.toISOString(), tomorrowStart: tomorrowStart.toISOString(), result });
      return result;
    }

    if (filter === 'week') {
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - 6);
      const result = dt >= weekStart && dt < tomorrowStart;
      console.log('Date filter week:', { isoDate, weekStart: weekStart.toISOString(), result });
      return result;
    }

    if (filter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const result = dt >= monthStart && dt < tomorrowStart;
      console.log('Date filter month:', { isoDate, monthStart: monthStart.toISOString(), result });
      return result;
    }

    return true;
  };

  const orderHasStudyStatus = (order: any, status: string): boolean =>
    (order.studies || []).some((s: any) => s.status === status);

  const loadOrders = useCallback(async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    try {
      if (!silent) {
        setLoading(true);
        setError(null);
      }

      const response = await radiologyService.getOrders({
        page: 1,
        page_size: 1000,
        ...(debouncedSearch ? { search: debouncedSearch } : {}),
        ...(processingFilter !== 'all' ? { processing_method: processingFilter } : {}),
      });

      setOrders(response.results || []);
    } catch (err: any) {
      if (!silent) {
        setError(err.message || 'Failed to load radiology orders');
      }
      console.error('Error loading radiology orders:', err);
    } finally {
      if (!silent) {
        setLoading(false);
      }
    }
  }, [debouncedSearch, processingFilter]);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  const pollingPaused = useMemo(
    () =>
      isDateFilterDialogOpen ||
      isViewDialogOpen ||
      isProcessDialogOpen ||
      isResultsDialogOpen ||
      isAddStudyDialogOpen,
    [
      isDateFilterDialogOpen,
      isViewDialogOpen,
      isProcessDialogOpen,
      isResultsDialogOpen,
      isAddStudyDialogOpen,
    ]
  );

  useEffect(() => {
    if (pollingPaused) return;
    const id = setInterval(() => {
      void loadOrders({ silent: true });
    }, 15000);
    return () => clearInterval(id);
  }, [loadOrders, pollingPaused]);

  useEffect(() => {
    if (!isViewDialogOpen) {
      setSelectedPatientFull(null);
      return;
    }
    const patientId = selectedOrder?.patient_details?.id ?? selectedOrder?.patient;
    if (!patientId) {
      setSelectedPatientFull(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const p = await patientService.getPatient(Number(patientId));
        if (!cancelled) setSelectedPatientFull(p);
      } catch {
        if (!cancelled) setSelectedPatientFull(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isViewDialogOpen, selectedOrder?.patient_details?.id, selectedOrder?.patient]);

  const loadTemplates = async () => {
    setLoadingTemplates(true);
    try {
      const response = await radiologyService.getTemplates({ page_size: 1000 });
      setTemplates(response.results || []);
    } catch (err: any) {
      toast.error(err?.message || 'Failed to load templates');
      setTemplates([]);
    } finally {
      setLoadingTemplates(false);
    }
  };

  useEffect(() => {
    if (!isAddStudyDialogOpen) return;
    if (templates.length > 0) return;
    loadTemplates();
  }, [isAddStudyDialogOpen]);

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

  const formatLmp = (value: any) => {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: '2-digit' });
  };

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
      toast.error(err?.message || 'Failed to add study');
    } finally {
      setIsAddingStudy(false);
    }
  };

  // Helper function to determine order status (simplified like lab)
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

  // Base filtering (search/date/priority/gender)
  const baseFilteredOrders = useMemo(() => {
    console.log('Applying filters:', { dateFilter, priorityFilter, genderFilter, totalOrders: orders.length });
    const matchesCustomDateRange = (orderedAt: string | undefined) => {
      if (!dateRange.from && !dateRange.to) return true;
      if (!orderedAt) return false;

      const dt = new Date(orderedAt);
      if (Number.isNaN(dt.getTime())) return false;

      if (dateRange.from) {
        const from = new Date(`${dateRange.from}T00:00:00`);
        if (dt < from) return false;
      }

      if (dateRange.to) {
        const to = new Date(`${dateRange.to}T23:59:59.999`);
        if (dt > to) return false;
      }

      return true;
    };
    
    return orders.filter(order => {
      // Debug: log order details
      if (dateFilter !== 'all' || priorityFilter !== 'all' || genderFilter !== 'all') {
        console.log('Order:', {
          id: order.id,
          ordered_at: order.ordered_at,
          priority: order.priority,
          patient_gender: order.patient_gender,
          patient_details_gender: order.patient_details?.gender
        });
      }
      
      if (!matchesDateFilter(order.ordered_at, dateFilter)) {
        console.log('Date filter rejected:', order.ordered_at, dateFilter);
        return false;
      }

      if (!matchesCustomDateRange(order.ordered_at)) {
        return false;
      }

      if (priorityFilter !== 'all' && normalizePriority(order.priority) !== priorityFilter) {
        console.log('Priority filter rejected:', order.priority, priorityFilter);
        return false;
      }

      if (genderFilter !== 'all') {
        const orderGender =
          normalizeGender(order.patient_details?.gender) ||
          normalizeGender(order.patient_gender);
        console.log('Gender check:', orderGender, genderFilter);
        if (orderGender !== genderFilter) {
          console.log('Gender filter rejected:', orderGender, genderFilter);
          return false;
        }
      }

      // Search / processing_method are applied server-side in loadOrders when set

      return true;
    });
  }, [orders, dateFilter, priorityFilter, genderFilter, dateRange.from, dateRange.to]);

  // Tab/status filtering on top of base filters
  const filteredOrders = useMemo(() => {
    return baseFilteredOrders.filter((order) => {
      if (activeTab === 'pending') return orderHasStudyStatus(order, 'pending');
      if (activeTab === 'processing') return orderHasStudyStatus(order, 'processing');
      if (activeTab === 'results') return orderHasStudyStatus(order, 'reported');
      if (activeTab === 'rejected') return orderHasStudyStatus(order, 'rejected');
      return true;
    });
  }, [baseFilteredOrders, activeTab]);

  // Client-side pagination for filtered dataset
  const paginatedOrders = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(start, start + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priorityFilter, dateFilter, genderFilter, processingFilter, activeTab, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // Calculate stats from current control filters (excluding tab)
  const stats = useMemo(() => {
    const allStudies = baseFilteredOrders.flatMap(order => order.studies || []);

    return {
      total: baseFilteredOrders.length,
      pendingSamples: allStudies.filter(s => s && s.status === 'pending').length,
      processing: allStudies.filter(s => s && s.status === 'processing').length,
      resultsReady: allStudies.filter(s => s && s.status === 'reported').length,
      rejected: allStudies.filter(s => s && s.status === 'rejected').length,
      stat: baseFilteredOrders.filter(o => normalizePriority(o.priority) === 'stat').length,
    };
  }, [baseFilteredOrders]);

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
    setResultsForm({
      report: study.report || study.findings || '',
      critical: study.critical || false,
      reportFile: null,
    });
    setResultEntryMode(study.processing_method === 'outsourced' ? 'upload' : 'manual');
    setIsResultsDialogOpen(true);
  };


  const handleSubmitResults = async () => {
    if (!selectedStudy || !selectedOrder) return;

    setIsSubmittingResults(true);
    try {
      await radiologyService.updateStudyResults(selectedStudy.id, {
        report: resultsForm.report,
        critical: resultsForm.critical,
        reportFile: resultsForm.reportFile,
        status: 'reported'
      });

      toast.success('Study results submitted successfully');
      setIsResultsDialogOpen(false);
      
      // Reload orders to get updated data
      await loadOrders();
      
      // Update selectedOrder if view dialog is still open (like lab orders)
      if (isViewDialogOpen && selectedOrder) {
        const updatedOrder = await radiologyService.getOrder(selectedOrder.id);
        setSelectedOrder(updatedOrder);
      } else {
        setSelectedStudy(null);
        setSelectedOrder(null);
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to submit study results');
    } finally {
      setIsSubmittingResults(false);
    }
  };

  const handleProcessOrder = async (order: any) => {
    try {
      console.log('Calling updateOrderStatus for order:', order.id);
      console.log('Order ID type:', typeof order.id);
      console.log('Parsed order ID:', parseInt(order.id));
      // Security: Removed debug console logs and direct API calls

      await radiologyService.updateOrderStatus(parseInt(order.id), 'processing');
      toast.success('Order status updated to Processing');
      loadOrders();
    } catch (error: any) {
      console.error('Error updating order status:', error);
      console.log('Error details:', error);
      console.log('Order object:', order);
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
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-gray-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('pending')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Samples</p>
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
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
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
          ) : filteredOrders.length > 0 ? (
            paginatedOrders.map((order) => <OrderCard key={order.id} order={order} />)
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
        {filteredOrders.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredOrders.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="orders"
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Showing {paginatedOrders.length} of {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} (page {currentPage} of {Math.max(1, Math.ceil(filteredOrders.length / itemsPerPage))})
            </p>
          </Card>
        )}

        {/* Process Study Dialog (like lab) */}
        <Dialog open={isProcessDialogOpen} onOpenChange={setIsProcessDialogOpen}>
          <DialogContent className="sm:max-w-md">
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
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Select Imaging Partner *</Label>
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
                            + Add Partner
                          </Button>
                        </div>
                      </div>
                      <Select
                        value={outsourcedLab}
                        onValueChange={setOutsourcedLab}
                        disabled={loadingImagingPartners}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder={loadingImagingPartners ? 'Loading partners…' : 'Choose an imaging partner…'} />
                        </SelectTrigger>
                        <SelectContent>
                          {imagingPartners.map((p) => (
                            <SelectItem key={p.id} value={p.name}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setIsProcessDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleStartProcessing}
                disabled={isSubmittingResults || (processingMethod === 'outsourced' && !outsourcedLab.trim())}
                className="bg-blue-500 hover:bg-blue-600"
              >
                {isSubmittingResults ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Start Processing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enter Results Dialog (like lab) */}
        <Dialog open={isResultsDialogOpen} onOpenChange={setIsResultsDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
                        <Label htmlFor="report-file-manual">Optional: Upload Supporting File</Label>
                        <Input
                          id="report-file-manual"
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => setResultsForm(prev => ({ ...prev, reportFile: e.target.files?.[0] || null }))}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground">
                          Optional: Upload additional files (PDF, Word, Images)
                        </p>
                        {resultsForm.reportFile && (
                          <p className="text-sm text-green-600">Selected: {resultsForm.reportFile.name}</p>
                        )}
                      </div>
                    </TabsContent>

                    <TabsContent value="upload" className="space-y-4 mt-4">
                      <div className="text-sm text-muted-foreground mb-3">
                        Upload a complete report document. You can also add summary report text below if desired.
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="report-file">Upload Result File</Label>
                        <Input
                          id="report-file"
                          type="file"
                          accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                          onChange={(e) => setResultsForm(prev => ({ ...prev, reportFile: e.target.files?.[0] || null }))}
                          className="cursor-pointer"
                        />
                        <p className="text-xs text-muted-foreground">
                          Supports PDF, Word, Images (JPG, PNG)
                        </p>
                        {resultsForm.reportFile && (
                          <p className="text-sm text-green-600">Selected: {resultsForm.reportFile.name}</p>
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

              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResultsDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitResults}
                disabled={isSubmittingResults || (!resultsForm.reportFile && !resultsForm.report.trim())}
                className="bg-amber-500 hover:bg-amber-600"
              >
                {isSubmittingResults ? 'Submitting...' : 'Submit Results'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View & Manage Order Dialog - All actions happen here (like lab) */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm font-medium mb-2">Patient</p>
                    <div className="flex items-start gap-2">
                      <PatientAvatar name={selectedOrder.patient_name} size="sm" />
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
                        </div>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Ordering Doctor</p>
                    {selectedOrder.doctor_name?.trim() && (
                      <p className="font-medium">{selectedOrder.doctor_name}</p>
                    )}
                    {selectedOrder.doctor_details?.specialty?.trim() && (
                      <p className="text-xs text-muted-foreground">{selectedOrder.doctor_details.specialty}</p>
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
                          {study.acquired_by_name && <span>Acquired by {study.acquired_by_name} {study.acquired_at && `at ${new Date(study.acquired_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`}</span>}
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
                          <div className="space-y-1">
                            {study.report && (
                              <div><span className="text-muted-foreground">Report:</span> <span className="font-medium">{study.report}</span></div>
                            )}
                            {!study.report && (
                              <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">Normal study</span></div>
                            )}
                          </div>
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
                                  const fileUrl = study.report_file_url || (study.report_file && typeof study.report_file === 'string' ? study.report_file : null);
                                  if (fileUrl) {
                                    const link = document.createElement('a');
                                    link.href = fileUrl;
                                    link.target = '_blank';
                                    link.rel = 'noopener noreferrer';
                                    document.body.appendChild(link);
                                    link.click();
                                    document.body.removeChild(link);
                                  } else {
                                    toast.error('File URL not available');
                                  }
                                }}
                              >
                                <Eye className="h-3 w-3 mr-1" />View
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
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
          <DialogContent className="w-[95vw] sm:max-w-[650px] max-h-[90vh] overflow-y-auto">
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
        <Dialog open={isAddPartnerDialogOpen} onOpenChange={setIsAddPartnerDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-500" />
                Add Imaging Partner
              </DialogTitle>
              <DialogDescription>
                Add a new external imaging center as an outsourced partner for study processing.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label htmlFor="partner-name">Partner Name *</Label>
                <Input
                  id="partner-name"
                  value={newPartnerName}
                  onChange={(e) => setNewPartnerName(e.target.value)}
                  placeholder="e.g. Metro Diagnostic Center"
                  disabled={isSubmittingPartner}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="partner-code">Code (optional)</Label>
                <Input
                  id="partner-code"
                  value={newPartnerCode}
                  onChange={(e) => setNewPartnerCode(e.target.value)}
                  placeholder="e.g. METRO"
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
                  placeholder="e.g. contact@metro.diagnostics"
                  disabled={isSubmittingPartner}
                />
              </div>

              <div className="space-y-1">
                <Label htmlFor="partner-phone">Phone (optional)</Label>
                <Input
                  id="partner-phone"
                  value={newPartnerPhone}
                  onChange={(e) => setNewPartnerPhone(e.target.value)}
                  placeholder="e.g. +1-800-METRO"
                  disabled={isSubmittingPartner}
                />
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
                onClick={handleAddPartner}
                disabled={isSubmittingPartner || !newPartnerName.trim()}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {isSubmittingPartner ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Adding...
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
        <Dialog open={isManagePartnersDialogOpen} onOpenChange={setIsManagePartnersDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
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
                  <p className="text-xs mt-1">Click "Add Partner" to create one.</p>
                </div>
              ) : (
                imagingPartners.map((partner) => (
                  <div key={partner.id} className="flex items-start justify-between p-3 rounded-lg border">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{partner.name}</p>
                      {partner.code && (
                        <p className="text-xs text-muted-foreground">Code: {partner.code}</p>
                      )}
                      {partner.email && (
                        <p className="text-xs text-muted-foreground">📧 {partner.email}</p>
                      )}
                      {partner.phone && (
                        <p className="text-xs text-muted-foreground">📞 {partner.phone}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDeletePartner(partner.id, partner.name)}
                      disabled={deletingPartnerId === partner.id}
                      className="ml-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      {deletingPartnerId === partner.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <X className="h-4 w-4" />
                      )}
                    </Button>
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
          <DialogContent className="w-[95vw] sm:max-w-[400px]">
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

      </div>
    </DashboardLayout>
  );
}
