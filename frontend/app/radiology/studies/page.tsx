"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { radiologyService, type RadiologyOrder as ApiRadiologyOrder, type RadiologyStudy as ApiRadiologyStudy } from '@/lib/services';
import { transformPriority, transformProcessingMethod, transformToBackendProcessingMethod } from '@/lib/services/transformers';
import {
  ScanLine, Search, Eye, Clock, CheckCircle2, Activity, Loader2,
  AlertTriangle, Calendar, FileText, Play, Stethoscope, Upload,
  ClipboardList, RefreshCw, Building2, Truck, X, Image as ImageIcon,
  Camera, Download
} from 'lucide-react';

// Imaging Study interface - similar to LabTest
interface ImagingStudy {
  id: string;
  procedure: string;
  category: string; // X-Ray, CT, MRI, Ultrasound, etc.
  bodyPart: string;
  contrastRequired: boolean;
  status: 'Pending' | 'Scheduled' | 'Acquired' | 'Processing' | 'Reported' | 'Verified';
  processingMethod?: 'In-house' | 'Outsourced';
  outsourcedFacility?: string;
  scheduledDate?: string;
  scheduledTime?: string;
  technologist?: string;
  acquiredAt?: string;
  imagesCount?: number;
  findings?: string;
  impression?: string;
  critical?: boolean;
  reportFile?: { name: string; type: string; uploadedAt: string };
  reportedBy?: string;
  reportedAt?: string;
}

interface RadiologyOrder {
  id: string;
  orderId: string;
  patient: { id: string; name: string; age: number; gender: string; };
  doctor: { id: string; name: string; specialty: string; };
  studies: ImagingStudy[];
  priority: 'Routine' | 'Urgent' | 'STAT';
  orderedAt: string;
  clinic: string;
  clinicalIndication?: string;
  specialInstructions?: string;
}

// Transform backend study status to frontend format
const transformStudyStatus = (status: string): string => {
  const statusMap: Record<string, string> = {
    'pending': 'Pending',
    'scheduled': 'Scheduled',
    'acquired': 'Acquired',
    'processing': 'Processing',
    'reported': 'Reported',
    'verified': 'Verified',
  };
  return statusMap[status] || status;
};

// Transform backend order to frontend format
const transformOrder = (apiOrder: any): RadiologyOrder => {
  // Extract patient details from order or visit
  const patientId = apiOrder.patient?.toString() || '';
  const patientName = apiOrder.patient_name || 'Unknown';
  const patientAge = (apiOrder as any).patient_details?.age || (apiOrder as any).patient_age || 0;
  const patientGender = (apiOrder as any).patient_details?.gender || (apiOrder as any).patient_gender || 'Unknown';
  
  // Extract doctor details
  const doctorId = apiOrder.doctor?.toString() || '';
  const doctorName = apiOrder.doctor_name || 'Unknown';
  const doctorSpecialty = (apiOrder as any).doctor_details?.specialty || (apiOrder as any).doctor_specialty || '';
  
  // Extract visit/clinic details
  const clinic = (apiOrder as any).visit_details?.clinic || (apiOrder as any).clinic || '';
  const clinicalIndication = apiOrder.clinical_notes || (apiOrder as any).clinical_indication || '';
  const specialInstructions = (apiOrder as any).special_instructions || '';
  
  return {
    id: apiOrder.id.toString(),
    orderId: apiOrder.order_id || `RAD-${apiOrder.id}`,
    patient: {
      id: patientId,
      name: patientName,
      age: patientAge,
      gender: patientGender,
    },
    doctor: {
      id: doctorId,
      name: doctorName,
      specialty: doctorSpecialty,
    },
    studies: (apiOrder.studies || []).map((study: ApiRadiologyStudy) => ({
      id: study.id.toString(),
      procedure: study.procedure,
      category: study.modality || 'X-Ray',
      bodyPart: study.body_part || '',
      contrastRequired: study.procedure?.toLowerCase().includes('contrast') || false,
      status: transformStudyStatus(study.status) as ImagingStudy['status'],
      processingMethod: study.processing_method ? transformProcessingMethod(study.processing_method) as 'In-house' | 'Outsourced' : undefined,
      outsourcedFacility: study.outsourced_facility,
      scheduledDate: study.scheduled_date,
      scheduledTime: study.scheduled_time,
      technologist: (study as any).acquired_by_name || (study as any).scheduled_by_name,
      acquiredAt: study.acquired_at,
      imagesCount: study.images_count,
      findings: study.findings,
      impression: study.impression,
      critical: (study as any).critical || (study as any).overall_status === 'critical' || false,
      reportedBy: (study as any).reported_by_name || (study.reported_by ? String(study.reported_by) : undefined),
      reportedAt: study.reported_at,
    })),
    priority: transformPriority(apiOrder.priority) as 'Routine' | 'Urgent' | 'STAT',
    orderedAt: apiOrder.ordered_at,
    clinic,
    clinicalIndication,
    specialInstructions,
  };
};

// Outsourced imaging facilities
const outsourcedFacilities = [
  'PathCare Imaging',
  'MedLab Radiology Center',
  'Synlab Diagnostics',
  'Lancet Imaging',
  'Alpha Diagnostic Imaging',
];

// Report templates by category
const reportTemplates: Record<string, { sections: string[] }> = {
  'X-Ray': { sections: ['Technique', 'Comparison', 'Findings', 'Impression'] },
  'CT Scan': { sections: ['Technique', 'Contrast', 'Comparison', 'Findings', 'Impression'] },
  'MRI': { sections: ['Technique', 'Sequences', 'Contrast', 'Comparison', 'Findings', 'Impression'] },
  'Ultrasound': { sections: ['Technique', 'Findings', 'Impression'] },
  'Mammography': { sections: ['Technique', 'Breast Composition', 'Findings', 'BI-RADS Category', 'Recommendation'] },
};

export default function RadiologyOrdersPage() {
  const [orders, setOrders] = useState<RadiologyOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [modalityFilter, setModalityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [genderFilter, setGenderFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('pending');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Dialog states
  const [selectedOrder, setSelectedOrder] = useState<RadiologyOrder | null>(null);
  const [selectedStudy, setSelectedStudy] = useState<ImagingStudy | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isScheduleDialogOpen, setIsScheduleDialogOpen] = useState(false);
  const [isAcquireDialogOpen, setIsAcquireDialogOpen] = useState(false);
  const [isReportDialogOpen, setIsReportDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [scheduleForm, setScheduleForm] = useState({ date: '', time: '' });
  const [acquireForm, setAcquireForm] = useState({ imagesCount: '', notes: '', processingMethod: 'In-house' as 'In-house' | 'Outsourced', facility: '' });
  const [reportEntryMode, setReportEntryMode] = useState<'manual' | 'upload'>('manual');
  const [reportForm, setReportForm] = useState({ findings: '', impression: '', critical: false });
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Calculate order progress
  const getOrderProgress = (studies: ImagingStudy[]) => {
    const statusWeights: Record<string, number> = {
      'Pending': 0, 'Scheduled': 15, 'Acquired': 40, 'Processing': 60, 'Reported': 90, 'Verified': 100
    };
    const total = studies.reduce((sum, s) => sum + statusWeights[s.status], 0);
    return Math.round(total / studies.length);
  };

  // Get overall order status
  const getOrderStatus = (studies: ImagingStudy[]) => {
    if (studies.every(s => s.status === 'Verified')) return 'Completed';
    if (studies.some(s => s.status === 'Reported')) return 'Reported';
    if (studies.some(s => s.status === 'Processing')) return 'Processing';
    if (studies.some(s => s.status === 'Acquired')) return 'Acquired';
    if (studies.some(s => s.status === 'Scheduled')) return 'Scheduled';
    return 'Pending';
  };

  const getFilteredOrders = () => {
    return orders.filter(order => {
      const matchesSearch = order.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.orderId.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.doctor.name.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPriority = priorityFilter === 'all' || order.priority === priorityFilter;
      const matchesModality = modalityFilter === 'all' || order.studies.some(s => s.category === modalityFilter);
      const matchesGender = genderFilter === 'all' || order.patient.gender.toLowerCase() === genderFilter.toLowerCase();
      
      // Date filter
      if (dateFilter !== 'all') {
        const orderedDate = new Date(order.orderedAt);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        
        if (dateFilter === 'today' && orderedDate.toDateString() !== today.toDateString()) return false;
        if (dateFilter === 'week') {
          const weekAgo = new Date(today);
          weekAgo.setDate(weekAgo.getDate() - 7);
          if (orderedDate < weekAgo) return false;
        }
        if (dateFilter === 'month') {
          const monthAgo = new Date(today);
          monthAgo.setMonth(monthAgo.getMonth() - 1);
          if (orderedDate < monthAgo) return false;
        }
      }

      // Tab filtering
      if (activeTab === 'pending') return matchesSearch && matchesPriority && matchesModality && matchesGender && order.studies.some(s => s.status === 'Pending' || s.status === 'Scheduled');
      if (activeTab === 'processing') return matchesSearch && matchesPriority && matchesModality && matchesGender && order.studies.some(s => s.status === 'Acquired' || s.status === 'Processing');
      return matchesSearch && matchesPriority && matchesModality && matchesGender;
    });
  };

  const filteredOrders = getFilteredOrders();

  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredOrders.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredOrders, currentPage, itemsPerPage]);

  // Load orders from API
  useEffect(() => {
    loadOrders();
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priorityFilter, modalityFilter, dateFilter, genderFilter, activeTab]);

  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);
      const params: any = {
        page: currentPage,
      };
      if (priorityFilter !== 'all') {
        params.priority = priorityFilter.toLowerCase();
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      
      const response = await radiologyService.getOrders(params);
      const transformedOrders = response.results.map(transformOrder);
      setOrders(transformedOrders);
    } catch (err: any) {
      setError(err.message || 'Failed to load orders');
      toast.error('Failed to load radiology orders. Please try again.');
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  };

  const stats = useMemo(() => {
    const allStudies = orders.flatMap(o => o.studies);
    return {
      pending: allStudies.filter(s => s.status === 'Pending' || s.status === 'Scheduled').length,
      processing: allStudies.filter(s => s.status === 'Acquired' || s.status === 'Processing').length,
      completed: allStudies.filter(s => s.status === 'Verified').length,
    };
  }, [orders]);

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'STAT': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Urgent': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
    }
  };

  const getStudyStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-gray-500/10 text-gray-600 border-gray-500/50';
      case 'Scheduled': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/50';
      case 'Acquired': return 'bg-violet-500/10 text-violet-600 border-violet-500/50';
      case 'Processing': return 'bg-blue-500/10 text-blue-600 border-blue-500/50';
      case 'Reported': return 'bg-amber-500/10 text-amber-600 border-amber-500/50';
      case 'Verified': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/50';
    }
  };

  const getCategoryBadge = (category: string) => {
    switch (category) {
      case 'X-Ray': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/30';
      case 'CT Scan': return 'bg-violet-500/10 text-violet-600 border-violet-500/30';
      case 'MRI': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30';
      case 'Ultrasound': return 'bg-teal-500/10 text-teal-600 border-teal-500/30';
      case 'Mammography': return 'bg-pink-500/10 text-pink-600 border-pink-500/30';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    }
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'Completed': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50';
      case 'Reported': return 'bg-amber-500/10 text-amber-600 border-amber-500/50';
      case 'Processing': return 'bg-blue-500/10 text-blue-600 border-blue-500/50';
      case 'Acquired': return 'bg-violet-500/10 text-violet-600 border-violet-500/50';
      case 'Scheduled': return 'bg-cyan-500/10 text-cyan-600 border-cyan-500/50';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/50';
    }
  };

  const getTimeSince = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  const formatTime = (isoString: string) => {
    return new Date(isoString).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  // Handlers
  const openViewDialog = (order: RadiologyOrder) => { setSelectedOrder(order); setIsViewDialogOpen(true); };

  const openScheduleDialog = (study: ImagingStudy) => {
    setSelectedStudy(study);
    setScheduleForm({ date: '', time: '' });
    setIsScheduleDialogOpen(true);
  };

  const openAcquireDialog = (study: ImagingStudy) => {
    setSelectedStudy(study);
    setAcquireForm({ imagesCount: '', notes: '', processingMethod: study.processingMethod || 'In-house', facility: study.outsourcedFacility || '' });
    setIsAcquireDialogOpen(true);
  };

  const openReportDialog = (study: ImagingStudy) => {
    setSelectedStudy(study);
    setReportForm({ findings: study.findings || '', impression: study.impression || '', critical: study.critical || false });
    setReportEntryMode(study.processingMethod === 'Outsourced' ? 'upload' : 'manual');
    setUploadedFile(null);
    setIsReportDialogOpen(true);
  };

  const handleSchedule = async () => {
    if (!selectedOrder || !selectedStudy || !scheduleForm.date || !scheduleForm.time) return;
    setIsSubmitting(true);

    try {
      await radiologyService.scheduleStudy(
        parseInt(selectedOrder.id),
        parseInt(selectedStudy.id),
        scheduleForm.date,
        scheduleForm.time
      );

      toast.success(`Study scheduled for ${scheduleForm.date} at ${scheduleForm.time}`);
      
      // Reload orders
      await loadOrders();
      
      // Update selected order if dialog is still open
      if (isViewDialogOpen && selectedOrder) {
        const updatedOrder = await radiologyService.getOrder(parseInt(selectedOrder.id));
        setSelectedOrder(transformOrder(updatedOrder));
      }

      setIsScheduleDialogOpen(false);
    } catch (err: any) {
      toast.error(err.message || 'Failed to schedule study');
      console.error('Error scheduling study:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleCompleteAcquisition = async () => {
    if (!selectedOrder || !selectedStudy || !acquireForm.imagesCount) return;
    if (acquireForm.processingMethod === 'Outsourced' && !acquireForm.facility) {
      toast.error('Please select a facility for outsourced processing');
      return;
    }
    setIsSubmitting(true);

    try {
      await radiologyService.acquireStudy(
        parseInt(selectedOrder.id),
        parseInt(selectedStudy.id),
        transformToBackendProcessingMethod(acquireForm.processingMethod) as 'in_house' | 'outsourced',
        parseInt(acquireForm.imagesCount),
        acquireForm.processingMethod === 'Outsourced' ? acquireForm.facility : undefined,
        acquireForm.notes
      );

      toast.success(`${acquireForm.imagesCount} images acquired${acquireForm.processingMethod === 'In-house' ? ' and ready for interpretation' : ` - sent to ${acquireForm.facility}`}`);
      
      // Reload orders
      await loadOrders();
      
      // Update selected order if dialog is still open
      if (isViewDialogOpen && selectedOrder) {
        const updatedOrder = await radiologyService.getOrder(parseInt(selectedOrder.id));
        setSelectedOrder(transformOrder(updatedOrder));
      }

      setIsAcquireDialogOpen(false);
      setAcquireForm({ imagesCount: '', notes: '', processingMethod: 'In-house', facility: '' });
    } catch (err: any) {
      toast.error(err.message || 'Failed to complete acquisition');
      console.error('Error completing acquisition:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmitReport = async () => {
    if (!selectedOrder || !selectedStudy) return;
    if (reportEntryMode === 'manual' && (!reportForm.findings || !reportForm.impression)) {
      toast.error('Please fill in findings and impression');
      return;
    }
    if (reportEntryMode === 'upload' && !uploadedFile) {
      toast.error('Please upload a report file');
      return;
    }
    setIsSubmitting(true);

    try {
      // If file upload, convert to text or handle separately
      let reportText = '';
      if (reportEntryMode === 'manual') {
        reportText = `${reportForm.findings}\n\nIMPRESSION:\n${reportForm.impression}`;
      } else if (uploadedFile) {
        // For file upload, read file content as text or store filename
        // Note: Backend currently only accepts text, file storage would need to be added
        reportText = `Report uploaded: ${uploadedFile.name} (${(uploadedFile.size / 1024).toFixed(1)} KB)\n\nFile upload functionality requires backend file storage integration.`;
      }

      // Prepare report data
      const reportData: any = {
        study_id: parseInt(selectedStudy.id),
        report: reportText,
      };
      
      if (reportEntryMode === 'manual') {
        reportData.findings = reportForm.findings;
        reportData.impression = reportForm.impression;
      }
      
      if (reportForm.critical) {
        reportData.critical = true;
      }
      
      // Call API with FormData if file upload, otherwise JSON
      if (reportEntryMode === 'upload' && uploadedFile) {
        const formData = new FormData();
        formData.append('study_id', selectedStudy.id);
        formData.append('report', reportText);
        formData.append('report_file', uploadedFile);
        if (reportForm.critical) {
          formData.append('critical', 'true');
        }
        
        const { apiFetch } = await import('@/lib/api-client');
        await apiFetch(`/radiology/orders/${parseInt(selectedOrder.id)}/report/`, {
          method: 'POST',
          body: formData,
        });
      } else {
        const { apiFetch } = await import('@/lib/api-client');
        await apiFetch(`/radiology/orders/${parseInt(selectedOrder.id)}/report/`, {
          method: 'POST',
          body: JSON.stringify(reportData),
        });
      }

      toast.success('Report submitted successfully. Awaiting verification.');
      
      // Reload orders
      await loadOrders();
      
      // Update selected order if dialog is still open
      if (isViewDialogOpen && selectedOrder) {
        const updatedOrder = await radiologyService.getOrder(parseInt(selectedOrder.id));
        setSelectedOrder(transformOrder(updatedOrder));
      }

      setIsReportDialogOpen(false);
      setReportForm({ findings: '', impression: '', critical: false });
      setUploadedFile(null);
    } catch (err: any) {
      toast.error(err.message || 'Failed to submit report');
      console.error('Error submitting report:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
    }
  };

  // Order Card
  const OrderCard = ({ order }: { order: RadiologyOrder }) => {
    const orderProgress = getOrderProgress(order.studies);
    const orderStatus = getOrderStatus(order.studies);

    return (
      <Card
        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${order.priority === 'STAT' ? 'border-l-rose-500' : order.priority === 'Urgent' ? 'border-l-amber-500' : 'border-l-cyan-500'}`}
        onClick={() => openViewDialog(order)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${order.priority === 'STAT' ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-cyan-100 dark:bg-cyan-900/30'}`}>
              <span className={`font-semibold text-xs ${order.priority === 'STAT' ? 'text-rose-600' : 'text-cyan-600'}`}>
                {order.patient.name.split(' ').map(n => n[0]).join('')}
              </span>
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{order.patient.name}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityBadge(order.priority)}`}>
                    {order.priority === 'STAT' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{order.priority}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getOrderStatusBadge(orderStatus)}`}>{orderStatus}</Badge>
                  {order.studies.map(study => (
                    <Badge key={study.id} variant="outline" className={`text-[10px] px-1.5 py-0 ${getCategoryBadge(study.category)}`}>
                      <ScanLine className="h-2 w-2 mr-0.5" />{study.category}
                    </Badge>
                  ))}
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={(e) => { e.stopPropagation(); openViewDialog(order); }}>
                  <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
              </div>

              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>{order.orderId}</span>
                <span>•</span>
                <span>{order.patient.age}y {order.patient.gender}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{order.doctor.name}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{getTimeSince(order.orderedAt)}</span>
                <span>•</span>
                <span className="font-medium text-foreground">{orderProgress}%</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ScanLine className="h-8 w-8 text-cyan-500" />
              Radiology Orders
            </h1>
            <p className="text-muted-foreground mt-1">Process imaging studies - schedule, acquire, interpret & report</p>
          </div>
          <Button variant="outline" onClick={loadOrders} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-gray-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('pending')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending/Scheduled</p>
                  <p className="text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.pending}</p>
                </div>
                <Calendar className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('processing')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Processing</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.processing}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Completed</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.completed}</p>
                </div>
                <CheckCircle2 className="h-8 w-8 text-emerald-400" />
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
                  <TabsTrigger value="pending">Pending ({stats.pending})</TabsTrigger>
                  <TabsTrigger value="processing">Processing ({stats.processing})</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search orders..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className="pl-10" 
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  <Select value={dateFilter} onValueChange={setDateFilter}>
                    <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="today">Today</SelectItem>
                      <SelectItem value="week">This Week</SelectItem>
                      <SelectItem value="month">This Month</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={modalityFilter} onValueChange={setModalityFilter}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Modality" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modalities</SelectItem>
                      <SelectItem value="X-Ray">X-Ray</SelectItem>
                      <SelectItem value="CT Scan">CT Scan</SelectItem>
                      <SelectItem value="MRI">MRI</SelectItem>
                      <SelectItem value="Ultrasound">Ultrasound</SelectItem>
                      <SelectItem value="Mammography">Mammography</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[120px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="STAT">STAT</SelectItem>
                      <SelectItem value="Urgent">Urgent</SelectItem>
                      <SelectItem value="Routine">Routine</SelectItem>
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
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders List */}
        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading orders...</p>
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={loadOrders}>Retry</Button>
            </CardContent></Card>
          ) : filteredOrders.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <ScanLine className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No orders found</p>
            </CardContent></Card>
          ) : (
            paginatedOrders
              .sort((a, b) => {
                const priorityOrder = { STAT: 0, Urgent: 1, Routine: 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
              })
              .map(order => <OrderCard key={order.id} order={order} />)
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
              onItemsPerPageChange={setItemsPerPage}
              itemName="orders"
            />
          </Card>
        )}

        {/* View & Manage Order Dialog */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-cyan-500" />Manage Order</DialogTitle>
              <DialogDescription>{selectedOrder?.orderId} • Process imaging studies</DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4 py-4">
                {/* Order Header */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getPriorityBadge(selectedOrder.priority)}>{selectedOrder.priority}</Badge>
                  <span className="text-sm text-muted-foreground">{getOrderProgress(selectedOrder.studies)}% complete</span>
                  <Progress value={getOrderProgress(selectedOrder.studies)} className="flex-1 h-2" />
                </div>

                {/* Patient & Doctor Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div><p className="text-xs text-muted-foreground">Patient</p><p className="font-medium">{selectedOrder.patient.name}</p><p className="text-xs text-muted-foreground">{selectedOrder.patient.age}y {selectedOrder.patient.gender}</p></div>
                  <div><p className="text-xs text-muted-foreground">Ordering Doctor</p><p className="font-medium">{selectedOrder.doctor.name}</p><p className="text-xs text-muted-foreground">{selectedOrder.doctor.specialty}</p></div>
                </div>

                {selectedOrder.clinicalIndication && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Clinical Indication</p>
                    <p className="text-sm">{selectedOrder.clinicalIndication}</p>
                  </div>
                )}

                {selectedOrder.specialInstructions && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-xs text-amber-700 dark:text-amber-400 mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />Special Instructions</p>
                    <p className="text-sm text-amber-800 dark:text-amber-300">{selectedOrder.specialInstructions}</p>
                  </div>
                )}

                {/* Individual Studies - With Actions */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Studies ({selectedOrder.studies.length})</p>
                  {selectedOrder.studies.map(study => (
                    <div key={study.id} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={getCategoryBadge(study.category)}>{study.category}</Badge>
                          <span className="font-medium">{study.procedure}</span>
                          {study.contrastRequired && <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600">Contrast</Badge>}
                          {study.processingMethod && (
                            <Badge variant="outline" className={`text-[10px] ${study.processingMethod === 'In-house' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}`}>
                              {study.processingMethod === 'In-house' ? <Building2 className="h-2.5 w-2.5 mr-0.5" /> : <Truck className="h-2.5 w-2.5 mr-0.5" />}
                              {study.processingMethod}
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className={getStudyStatusBadge(study.status)}>{study.status}</Badge>
                      </div>

                      {/* Study Details & Actions */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {study.technologist && <span>Tech: {study.technologist}</span>}
                          {study.imagesCount && <span className="ml-2">• {study.imagesCount} images</span>}
                          {study.outsourcedFacility && <span className="ml-2">• {study.outsourcedFacility}</span>}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {study.status === 'Pending' && (
                            <Button size="sm" onClick={() => openScheduleDialog(study)} className="h-7 px-3 bg-cyan-500 hover:bg-cyan-600 text-white text-xs">
                              <Calendar className="h-3 w-3 mr-1" />Schedule
                            </Button>
                          )}
                          {study.status === 'Scheduled' && (
                            <Button size="sm" onClick={() => openAcquireDialog(study)} className="h-7 px-3 bg-violet-500 hover:bg-violet-600 text-white text-xs">
                              <Camera className="h-3 w-3 mr-1" />Acquire
                            </Button>
                          )}
                          {study.status === 'Acquired' && (
                            <Button size="sm" onClick={() => openReportDialog(study)} className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs">
                              <FileText className="h-3 w-3 mr-1" />Report
                            </Button>
                          )}
                          {(study.status === 'Reported' || study.status === 'Verified') && (
                            <Button variant="outline" size="sm" className="h-7 px-3 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Complete
                            </Button>
                          )}
                        </div>
                      </div>

                      {/* Show Report if available */}
                      {study.findings && (
                        <div className={`mt-2 p-2 rounded text-xs ${study.critical ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200' : 'bg-emerald-50 dark:bg-emerald-900/20'}`}>
                          {study.critical && <p className="font-medium text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />CRITICAL FINDING</p>}
                          <p className="text-muted-foreground">Findings:</p>
                          <p className="mb-1">{study.findings}</p>
                          <p className="text-muted-foreground">Impression:</p>
                          <p className={study.critical ? 'font-medium text-rose-700 dark:text-rose-400' : ''}>{study.impression}</p>
                        </div>
                      )}
                      {study.reportFile && (
                        <div className="mt-2 p-2 rounded bg-indigo-50 dark:bg-indigo-900/20 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-indigo-600" />
                            <span>{study.reportFile.name}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-indigo-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              // Note: File download requires backend file storage and URL
                              toast.info('File download requires file storage integration');
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />Download
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Schedule Dialog */}
        <Dialog open={isScheduleDialogOpen} onOpenChange={setIsScheduleDialogOpen}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-cyan-500" />Schedule Study</DialogTitle>
              <DialogDescription>Schedule {selectedStudy?.procedure}</DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedStudy && (
              <div className="space-y-4 py-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm"><span className="text-muted-foreground">Patient:</span> {selectedOrder.patient.name}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Study:</span> {selectedStudy.procedure}</p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date *</Label>
                    <Input type="date" value={scheduleForm.date} onChange={(e) => setScheduleForm({ ...scheduleForm, date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Time *</Label>
                    <Input type="time" value={scheduleForm.time} onChange={(e) => setScheduleForm({ ...scheduleForm, time: e.target.value })} />
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsScheduleDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSchedule} disabled={isSubmitting || !scheduleForm.date || !scheduleForm.time} className="bg-cyan-500 hover:bg-cyan-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Calendar className="h-4 w-4 mr-2" />}Schedule
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Acquire Dialog */}
        <Dialog open={isAcquireDialogOpen} onOpenChange={setIsAcquireDialogOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-violet-500" />Complete Acquisition</DialogTitle>
              <DialogDescription>Upload images and choose interpretation method for {selectedStudy?.procedure}</DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedStudy && (
              <div className="space-y-4 py-4">
                <div className="p-3 rounded-lg bg-muted/50">
                  <p className="text-sm"><span className="text-muted-foreground">Patient:</span> {selectedOrder.patient.name}</p>
                  <p className="text-sm"><span className="text-muted-foreground">Study:</span> {selectedStudy.procedure}</p>
                </div>
                <div className="space-y-2">
                  <Label>Number of Images *</Label>
                  <Input type="number" placeholder="e.g., 4" value={acquireForm.imagesCount} onChange={(e) => setAcquireForm({ ...acquireForm, imagesCount: e.target.value })} />
                </div>
                <div className="space-y-2">
                  <Label>Technical Notes (Optional)</Label>
                  <Textarea placeholder="Any technical notes..." value={acquireForm.notes} onChange={(e) => setAcquireForm({ ...acquireForm, notes: e.target.value })} rows={3} />
                </div>
                
                <div className="space-y-3">
                  <Label>Interpretation Method *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setAcquireForm({ ...acquireForm, processingMethod: 'In-house' })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${acquireForm.processingMethod === 'In-house' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-muted hover:border-emerald-300'}`}
                    >
                      <Building2 className={`h-6 w-6 mb-2 ${acquireForm.processingMethod === 'In-house' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">In-house</p>
                      <p className="text-xs text-muted-foreground">Our radiologists interpret</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setAcquireForm({ ...acquireForm, processingMethod: 'Outsourced' })}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${acquireForm.processingMethod === 'Outsourced' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-muted hover:border-indigo-300'}`}
                    >
                      <Truck className={`h-6 w-6 mb-2 ${acquireForm.processingMethod === 'Outsourced' ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">Outsourced</p>
                      <p className="text-xs text-muted-foreground">Send to external facility</p>
                    </button>
                  </div>
                </div>

                {acquireForm.processingMethod === 'Outsourced' && (
                  <div className="space-y-2">
                    <Label>Select Facility *</Label>
                    <Select value={acquireForm.facility} onValueChange={(value) => setAcquireForm({ ...acquireForm, facility: value })}>
                      <SelectTrigger><SelectValue placeholder="Choose a facility..." /></SelectTrigger>
                      <SelectContent>
                        {outsourcedFacilities.map(facility => (
                          <SelectItem key={facility} value={facility}>{facility}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="p-3 rounded-lg bg-muted/50 text-sm text-muted-foreground">
                  Images will be uploaded to PACS{acquireForm.processingMethod === 'In-house' ? ' and marked ready for interpretation' : ` and sent to ${acquireForm.facility || 'selected facility'}`}.
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAcquireDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleCompleteAcquisition} disabled={isSubmitting || !acquireForm.imagesCount || (acquireForm.processingMethod === 'Outsourced' && !acquireForm.facility)} className="bg-violet-500 hover:bg-violet-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}Complete Acquisition
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Report Dialog */}
        <Dialog open={isReportDialogOpen} onOpenChange={setIsReportDialogOpen}>
          <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-amber-500" />Create Report</DialogTitle>
              <DialogDescription>Enter report for {selectedStudy?.procedure}</DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedStudy && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedOrder.patient.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Study:</span><span className="font-medium">{selectedStudy.procedure}</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Processing:</span>
                    <Badge variant="outline" className={selectedStudy.processingMethod === 'In-house' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}>
                      {selectedStudy.processingMethod}
                      {selectedStudy.outsourcedFacility && ` - ${selectedStudy.outsourcedFacility}`}
                    </Badge>
                  </div>
                </div>

                {/* Entry Mode Toggle */}
                <div className="space-y-2">
                  <Label>Report Entry Method</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setReportEntryMode('manual')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${reportEntryMode === 'manual' ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' : 'border-muted hover:border-amber-300'}`}
                    >
                      <p className="font-medium text-sm">Enter Manually</p>
                      <p className="text-xs text-muted-foreground">Type findings & impression</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setReportEntryMode('upload')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${reportEntryMode === 'upload' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-muted hover:border-indigo-300'}`}
                    >
                      <p className="font-medium text-sm">Upload Report</p>
                      <p className="text-xs text-muted-foreground">Upload PDF or document</p>
                    </button>
                  </div>
                </div>

                {reportEntryMode === 'manual' ? (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Findings *</Label>
                      <Textarea
                        value={reportForm.findings}
                        onChange={(e) => setReportForm({ ...reportForm, findings: e.target.value })}
                        placeholder="Describe radiological findings..."
                        rows={5}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Impression *</Label>
                      <Textarea
                        value={reportForm.impression}
                        onChange={(e) => setReportForm({ ...reportForm, impression: e.target.value })}
                        placeholder="Clinical impression and recommendations..."
                        rows={3}
                      />
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/5">
                      <Checkbox
                        id="critical"
                        checked={reportForm.critical}
                        onCheckedChange={(checked) => setReportForm({ ...reportForm, critical: checked as boolean })}
                      />
                      <Label htmlFor="critical" className="flex items-center gap-2 text-rose-600 dark:text-rose-400 cursor-pointer">
                        <AlertTriangle className="h-4 w-4" />Mark as Critical Finding (notify clinician)
                      </Label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <Label>Upload Report File</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      {uploadedFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileText className="h-8 w-8 text-indigo-500" />
                          <div className="text-left">
                            <p className="font-medium">{uploadedFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setUploadedFile(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground mb-2">Drag and drop or click to upload</p>
                          <p className="text-xs text-muted-foreground">Supports PDF, Word, Images</p>
                          <Input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={handleFileChange} className="mt-3" />
                        </>
                      )}
                    </div>
                    <div className="flex items-center gap-3 p-3 rounded-lg border border-rose-500/30 bg-rose-500/5">
                      <Checkbox
                        id="critical-upload"
                        checked={reportForm.critical}
                        onCheckedChange={(checked) => setReportForm({ ...reportForm, critical: checked as boolean })}
                      />
                      <Label htmlFor="critical-upload" className="flex items-center gap-2 text-rose-600 dark:text-rose-400 cursor-pointer">
                        <AlertTriangle className="h-4 w-4" />Mark as Critical Finding
                      </Label>
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsReportDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitReport} disabled={isSubmitting} className="bg-amber-500 hover:bg-amber-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                Submit Report
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}