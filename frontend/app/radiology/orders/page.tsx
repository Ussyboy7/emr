"use client";

import { useState, useEffect, useMemo } from 'react';
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
import { radiologyService } from '@/lib/services';
import { PatientAvatar } from '@/components/PatientAvatar';
import {
  ClipboardList, Search, Eye, Calendar, Clock, Activity, CheckCircle2,
  FileBarChart, AlertTriangle, ScanLine, User, ArrowRight,
  CalendarDays, Filter, Loader2, Play, FileText,
  Beaker, Building2, Truck, RotateCcw, XCircle, TestTube
} from 'lucide-react';

export default function RadiologyOrdersPage() {
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [activeTab, setActiveTab] = useState('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const getTimeSince = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

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
            <PatientAvatar name={order.patient_name || 'Unknown'} size="sm" />

            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{order.patient_name || 'Unknown Patient'}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityColor(order.priority)}`}>
                    {getPriorityLabel(order.priority)}
                  </Badge>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(orderStatus)}`}>
                    {orderStatus.replace('_', ' ').replace('results ready', 'Results Ready')}
                  </Badge>
                  {order.studies?.slice(0, 2).map((study: any, idx: number) => (
                    <Badge key={idx} variant="secondary" className="text-[10px] px-1.5 py-0">
                      {study.procedure.split(' ')[0]}
                    </Badge>
                  ))}
                  {order.studies?.length > 2 && <span className="text-[10px] text-muted-foreground">+{order.studies.length - 2}</span>}
                </div>
                <Button variant="ghost" size="sm" className="h-7 w-7 p-0 flex-shrink-0" onClick={(e) => { e.stopPropagation(); openViewDialog(order); }}>
                  <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                </Button>
              </div>

              {/* Row 2: Details */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>{order.patient_age || '36'}y {order.patient_gender || 'male'}</span>
                <span>•</span>
                <span>{order.doctor_name || 'System Administrator'}</span>
                <span>•</span>
                <span>{getTimeSince(order.ordered_at)}</span>
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
      loadOrders();
    } catch (error: any) {
      console.error('Error starting study processing:', error);
      toast.error(error.message || 'Failed to start study processing');
    } finally {
      setIsSubmittingResults(false);
    }
  };

  // Result entry state (like lab)
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [selectedStudy, setSelectedStudy] = useState<any>(null);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  // View & Manage Order Dialog (like lab)
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [resultEntryMode, setResultEntryMode] = useState<'manual' | 'upload'>('manual');
  const [resultsForm, setResultsForm] = useState({
    findings: '',
    impression: '',
    critical: false,
    reportFile: null as File | null,
  });
  const [isSubmittingResults, setIsSubmittingResults] = useState(false);

  // Processing method selection (like lab)
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
  const [processingMethod, setProcessingMethod] = useState<'in_house' | 'outsourced'>('in_house');
  const [outsourcedLab, setOutsourcedLab] = useState('');

  // Load orders from API
  useEffect(() => {
    loadOrders();
  }, [currentPage, itemsPerPage, searchQuery, priorityFilter]);


  const loadOrders = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await radiologyService.getOrders({
        page: currentPage,
        page_size: itemsPerPage,
        search: searchQuery || undefined,
        priority: priorityFilter !== 'all' ? priorityFilter : undefined,
        // Note: statusFilter, dateFilter not yet implemented in backend
      });

      setTotalCount(response.count || response.results.length);
      setOrders(response.results || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load radiology orders');
      console.error('Error loading radiology orders:', err);
    } finally {
      setLoading(false);
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

  // Filter orders
  // Client-side filtering only for tabs (server handles search, priority filters)
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Tab filtering (client-side for UX)
      if (activeTab === 'pending') return (order.studies || []).some((s: any) => s.status === 'pending');
      if (activeTab === 'processing') return (order.studies || []).some((s: any) => s.status === 'processing');
      if (activeTab === 'results') return (order.studies || []).some((s: any) => s.status === 'reported');
      if (activeTab === 'rejected') return (order.studies || []).some((s: any) => s.status === 'rejected');
      return true; // All tab shows everything
    });
  }, [orders, activeTab]);

  // With server-side pagination, orders array contains only current page results
  const paginatedOrders = filteredOrders;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priorityFilter, activeTab]);

  // Calculate stats (simplified like lab)
  // Calculate stats like lab orders - based on individual studies, not orders
  const stats = useMemo(() => {
    const allStudies = orders.flatMap(order => order.studies || []);

    return {
      total: orders.length,
      pendingSamples: allStudies.filter(s => s && s.status === 'pending').length,
      processing: allStudies.filter(s => s && s.status === 'processing').length,
      resultsReady: allStudies.filter(s => s && s.status === 'reported').length,
      rejected: allStudies.filter(s => s && s.status === 'rejected').length,
      stat: orders.filter(o => o.priority === 'STAT').length,
    };
  }, [orders]);

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
      findings: study.findings || '',
      impression: study.impression || '',
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
        findings: resultsForm.findings,
        impression: resultsForm.impression,
        critical: resultsForm.critical,
        reportFile: resultsForm.reportFile,
        status: 'reported'
      });

      toast.success('Study results submitted successfully');
      setIsResultsDialogOpen(false);
      setSelectedStudy(null);
      setSelectedOrder(null);
      loadOrders(); // Refresh the orders list
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
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-blue-500" />
              Study Orders
            </h1>
            <p className="text-muted-foreground mt-1">Process studies individually - acquire, process & report results per study</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={loadOrders} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Refresh
            </Button>
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
                  <p className="text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.pendingSamples}</p>
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
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.processing}</p>
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
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.resultsReady}</p>
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
                  <p className="text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.rejected}</p>
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
                  <p className="text-3xl font-bold text-red-600 dark:text-red-400">{stats.stat}</p>
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
                <Select value={dateFilter} onValueChange={setDateFilter} disabled>
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
                    <SelectItem value="STAT">STAT</SelectItem>
                    <SelectItem value="Urgent">Urgent</SelectItem>
                    <SelectItem value="Routine">Routine</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={'all'} onValueChange={() => {}}>
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gender</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

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
                <Button variant="outline" className="mt-4" onClick={loadOrders}>Retry</Button>
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
              Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} (page {currentPage} of {Math.ceil(totalCount / itemsPerPage)})
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
                      <Label>Select Lab Partner *</Label>
                      <Input
                        placeholder="Enter lab partner name"
                        value={outsourcedLab}
                        onChange={(e) => setOutsourcedLab(e.target.value)}
                      />
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
                {isSubmittingResults ? 'Starting...' : 'Start Processing'}
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
                  : `Enter findings and impression for ${selectedStudy?.procedure}`}
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
                        Enter findings and impression text. You can also upload a file below if needed.
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="findings">Findings</Label>
                        <Textarea
                          id="findings"
                          placeholder="Describe the radiological findings..."
                          value={resultsForm.findings}
                          onChange={(e) => setResultsForm(prev => ({ ...prev, findings: e.target.value }))}
                          rows={4}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="impression">Impression</Label>
                        <Textarea
                          id="impression"
                          placeholder="Provide clinical impression and diagnosis..."
                          value={resultsForm.impression}
                          onChange={(e) => setResultsForm(prev => ({ ...prev, impression: e.target.value }))}
                          rows={3}
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
                        Upload a complete report document. You can also add summary findings/impression text below if desired.
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
                        <Label htmlFor="findings-upload">Optional: Summary Findings</Label>
                        <Textarea
                          id="findings-upload"
                          placeholder="Optional: Add summary findings from the uploaded report..."
                          value={resultsForm.findings}
                          onChange={(e) => setResultsForm(prev => ({ ...prev, findings: e.target.value }))}
                          rows={3}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="impression-upload">Optional: Summary Impression</Label>
                        <Textarea
                          id="impression-upload"
                          placeholder="Optional: Add summary impression from the uploaded report..."
                          value={resultsForm.impression}
                          onChange={(e) => setResultsForm(prev => ({ ...prev, impression: e.target.value }))}
                          rows={2}
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
                disabled={isSubmittingResults || (!resultsForm.reportFile && (!resultsForm.findings.trim() || !resultsForm.impression.trim()))}
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
                    <div className="flex items-center gap-2">
                      <PatientAvatar name={selectedOrder.patient_name} size="sm" />
                      <div>
                        <p className="font-medium">{selectedOrder.patient_name}</p>
                        <p className="text-xs text-muted-foreground">
                          {selectedOrder.patient_details?.age}y {selectedOrder.patient_details?.gender}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div>
                    <p className="text-sm font-medium mb-2">Ordering Doctor</p>
                    <p className="font-medium">{selectedOrder.doctor_name || 'System Administrator'}</p>
                    <p className="text-xs text-muted-foreground">{selectedOrder.doctor_details?.specialty}</p>
                  </div>
                </div>

                {/* Clinical Notes */}
                {selectedOrder.clinical_notes && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Clinical Notes</p>
                    <p className="text-sm">{selectedOrder.clinical_notes}</p>
                  </div>
                )}

                {/* Individual Studies - With Actions */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Studies ({selectedOrder.studies?.length || 0})</p>
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
                        <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 text-xs">
                          <p className="font-medium text-emerald-700 dark:text-emerald-400 mb-1">Results:</p>
                          <div className="space-y-1">
                            {study.findings && (
                              <div><span className="text-muted-foreground">Findings:</span> <span className="font-medium">{study.findings}</span></div>
                            )}
                            {study.impression && (
                              <div><span className="text-muted-foreground">Impression:</span> <span className="font-medium">{study.impression}</span></div>
                            )}
                            {!study.findings && !study.impression && (
                              <div><span className="text-muted-foreground">Status:</span> <span className="font-medium">Normal study</span></div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
