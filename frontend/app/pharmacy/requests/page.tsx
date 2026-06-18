"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { usePaginatedListGuard, useResetPageOnFilterChange } from "@/hooks/use-paginated-list-guard";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type Medication } from "@/lib/services";
import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import { formatDisplayDate, localMonthBounds, localWeekToTodayBounds, todayApiDateString, formatDisplayDateTime } from "@/lib/dates";
import { useClinic } from "@/hooks/use-clinic";
import { Send, Search, Plus, CheckCircle2, Clock, Loader2, Eye, HelpCircle, Building2 } from "lucide-react";

const MEDICATION_SEARCH_LIMIT = 20;
const MAX_QUANTITY = 100000;

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function DispensaryRequestsPage() {
  const { activeClinicName } = useClinic();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const [requestItems, setRequestItems] = useState<Array<{ medication: number; quantity: number }>>([]);
  const [requestNotes, setRequestNotes] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [medicationSearch, setMedicationSearch] = useState("");
  const debouncedMedSearch = useDebouncedValue(medicationSearch, 300);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [requestQuantity, setRequestQuantity] = useState("1");
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, confirmed: 0, awaitingConfirmation: 0 });

  const [requestTab, setRequestTab] = useState<"dispensary" | "ward">("dispensary");

  const [currentPage, setCurrentPage] = useState(1);
  const { currentPageRef, resetToFirstPage, beginLoad } = usePaginatedListGuard(currentPage);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const buildDateParams = useCallback(() => {
    const p: Record<string, string> = {};
    if (dateFilter === "today") {
      const today = todayApiDateString();
      p.date_after = today;
      p.date_before = today;
    } else if (dateFilter === "week") {
      const week = localWeekToTodayBounds();
      p.date_after = week.start;
      p.date_before = week.end;
    } else if (dateFilter === "month") {
      const month = localMonthBounds();
      p.date_after = month.start;
      p.date_before = todayApiDateString();
    }
    return p;
  }, [dateFilter]);

  useEffect(() => {
    loadMedications();
  }, []);

  useEffect(() => {
    loadStats();
  }, [debouncedSearchQuery, statusFilter, dateFilter, requestTab]);

  const loadRequests = useCallback(async () => {
    const isStale = beginLoad();
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page: currentPageRef.current, page_size: itemsPerPage };
      if (statusFilter !== "all") params.status = statusFilter;
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      Object.assign(params, buildDateParams());
      if (requestTab === "dispensary") {
        params.to_location = PHARMACY_LOCATIONS.DISPENSARY;
      } else {
        params.to_location = PHARMACY_LOCATIONS.WARD_CARE;
      }
      const response = await pharmacyService.getStockRequests(params);
      if (isStale()) return;
      setRequests(response.results || []);
      setTotalRequests(response.count ?? response.results?.length ?? 0);
    } catch (err) {
      console.error("Error loading stock requests:", err);
      toast.error("Failed to load stock requests");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, itemsPerPage, debouncedSearchQuery, dateFilter, requestTab, buildDateParams, beginLoad, currentPageRef]);

  useResetPageOnFilterChange(resetToFirstPage, setCurrentPage, [
    statusFilter, debouncedSearchQuery, dateFilter, requestTab, itemsPerPage,
  ]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests, currentPage]);

  const loadStats = async () => {
    try {
      const baseParams: Record<string, string> = {};
      if (debouncedSearchQuery.trim()) baseParams.search = debouncedSearchQuery.trim();
      Object.assign(baseParams, buildDateParams());
      baseParams.to_location = requestTab === "dispensary" ? PHARMACY_LOCATIONS.DISPENSARY : PHARMACY_LOCATIONS.WARD_CARE;
      const stats = await pharmacyService.getStockRequestListStats(baseParams);
      setStats({
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        confirmed: stats.confirmed,
        awaitingConfirmation: stats.awaitingConfirmation,
      });
    } catch {
      // ignore
    }
  };

  const loadMedications = async () => {
    try {
      const response = await pharmacyService.getMedications({ page: 1, page_size: MAX_LIST_PAGE_SIZE });
      setMedications(response.results || []);
    } catch (err) {
      console.error("Error loading medications:", err);
    }
  };

  const handleAddItem = () => {
    if (!selectedMedication) {
      toast.error("Please select a medication");
      return;
    }
    const packSize = selectedMedication.pack_size ?? 1;
    const inputVal = parseInt(requestQuantity, 10);
    if (isNaN(inputVal) || inputVal < 1) {
      toast.error("Please enter a valid quantity (min 1)");
      return;
    }
    const qty = packSize > 1 ? inputVal * packSize : inputVal;
    if (qty > MAX_QUANTITY) {
      toast.error(`Quantity must not exceed ${MAX_QUANTITY.toLocaleString()} units`);
      return;
    }
    if (requestItems.find((i) => i.medication === selectedMedication.id)) {
      toast.error("This medication is already added");
      return;
    }
    setRequestItems([...requestItems, { medication: selectedMedication.id, quantity: qty }]);
    setSelectedMedication(null);
    setMedicationSearch("");
    setRequestQuantity("1");
  };

  const handleCreateRequest = async () => {
    if (requestItems.length === 0) {
      toast.error("Please add at least one medication");
      return;
    }
    try {
      setCreatingRequest(true);
      await pharmacyService.createStockRequest({ items: requestItems, notes: requestNotes });
      toast.success("Stock request created successfully");
      setShowNewRequestModal(false);
      setRequestItems([]);
      setRequestNotes("");
      await loadRequests();
      await loadStats();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create stock request");
    } finally {
      setCreatingRequest(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!selectedRequest) return;
    try {
      setIsConfirming(true);
      const res = await pharmacyService.confirmStockRequest(selectedRequest.id, confirmNotes);
      toast.success("Stock receipt confirmed!");
      setShowConfirmModal(false);
      setConfirmNotes("");
      if (res?.request) setSelectedRequest(res.request);
      await Promise.all([loadRequests(), loadStats()]);
    } catch (err: any) {
      toast.error(err?.apiMessage || err?.message || "Failed to confirm receipt");
    } finally {
      setIsConfirming(false);
    }
  };

  const filteredMedications = useMemo(() => {
    if (!debouncedMedSearch.trim()) return [];
    const term = debouncedMedSearch.toLowerCase();
    return medications
      .filter(
        (med) =>
          med.name.toLowerCase().includes(term) || (med.code || "").toLowerCase().includes(term)
      )
      .slice(0, MEDICATION_SEARCH_LIMIT);
  }, [medications, debouncedMedSearch]);

  const formatPackDisplay = (units: number, packSize: number | undefined | null) => {
    if (!packSize || packSize <= 1) return `${units.toLocaleString()} units`;
    const packs = Math.floor(units / packSize);
    return `${packs.toLocaleString()} packs (${units.toLocaleString()} units)`;
  };

  const packSizeForItem = (item: any) => item.medication_pack_size ?? medications.find((m) => m.id === item.medication)?.pack_size ?? null;

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string; tip?: string }> = {
      pending: { label: "Pending", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200", tip: "Awaiting store approval" },
      approved: { label: "Approved", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200", tip: "Ready for store to issue" },
      fulfilled: { label: "Issued (Awaiting Confirm)", cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200", tip: "Stock issued; confirm receipt when received" },
      received: { label: "Confirmed ✓", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200" },
      rejected: { label: "Rejected", cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200" },
      partially_fulfilled: { label: "Partially Fulfilled", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200" },
    };
    const cfg = map[status] || { label: status, cls: "" };
    const badge = <Badge className={cfg.cls}>{cfg.label}</Badge>;
    return cfg.tip ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent><p>{cfg.tip}</p></TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : badge;
  };

  const statsCards = useMemo(
    () => [
      { label: "Total", value: stats.total, icon: Send, color: "text-violet-500", bg: "bg-violet-500/10" },
      { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
      { label: "Approved", value: stats.approved, icon: Clock, color: "text-blue-500", bg: "bg-blue-500/10" },
      { label: "Confirmed", value: stats.confirmed, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", sub: stats.awaitingConfirmation ? `Awaiting: ${stats.awaitingConfirmation}` : undefined },
    ],
    [stats]
  );

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Stock Requests</h1>
            <p className="text-muted-foreground mt-1">
              {requestTab === "dispensary"
                ? `Requests — ${activeClinicName || 'Loading...'} — Dispensary requests from Central Store`
                : `Requests — ${activeClinicName || 'Loading...'} — Ward Care requests from Central Store (nursing)`}
            </p>
          </div>
          {requestTab === "dispensary" && (
            <Button onClick={() => setShowNewRequestModal(true)} className="bg-violet-600 hover:bg-violet-700">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          )}
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            onClick={() => { setRequestTab("dispensary"); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              requestTab === "dispensary"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Send className="h-4 w-4" />
            Dispensary
          </button>
          <button
            onClick={() => { setRequestTab("ward"); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              requestTab === "ward"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building2 className="h-4 w-4" />
            Ward Care
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsCards.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                    {stat.sub && <p className="text-xs text-muted-foreground">{stat.sub}</p>}
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

            <Card>
              <CardContent className="p-4">
                <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
                  <div className="relative flex-1 min-w-[min(100%,16rem)]">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by request ID or notes..."
                      value={searchQuery}
                      onChange={(e) => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                      className="pl-10"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={dateFilter} onValueChange={setDateFilter}>
                      <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="today">Today</SelectItem>
                        <SelectItem value="week">This Week</SelectItem>
                        <SelectItem value="month">This Month</SelectItem>
                        <SelectItem value="all">All Time</SelectItem>
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-[180px]"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Status</SelectItem>
                        <SelectItem value="pending">Pending</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="fulfilled">Fulfilled</SelectItem>
                        <SelectItem value="partially_fulfilled">Partially Fulfilled</SelectItem>
                        <SelectItem value="received">Received</SelectItem>
                        <SelectItem value="rejected">Rejected</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between px-1">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{requests.length}</span> requests
              </p>
            </div>

            <div className="space-y-2">
              {loading ? (
                <Card>
                  <CardContent className="p-12 text-center">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
                    <p className="text-muted-foreground">Loading requests...</p>
                  </CardContent>
                </Card>
              ) : requests.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No requests found</p>
                  </CardContent>
                </Card>
              ) : (
                requests.map((req) => (
                  <Card key={req.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => { setSelectedRequest(req); setShowDetailsModal(true); }}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <Send className="h-8 w-8 text-violet-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">
                                {req.to_location || 'Dispensary'} Request
                              </span>
                              {getStatusBadge(req.status)}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => { setSelectedRequest(req); setShowDetailsModal(true); }}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>{req.items?.length || 0} item(s)</span>
                            <span>•</span>
                            <span>{formatDisplayDate(req.created_at)}</span>
                            <span>•</span>
                            <span>From: {req.from_location || 'Store'}</span>
                            {req.requested_by_name && (
                              <>
                                <span>•</span>
                                <span>Requested by: {req.requested_by_name}</span>
                              </>
                            )}
                          </div>
                          {req.notes && <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">{req.notes}</p>}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>

            {!loading && totalRequests > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={totalRequests}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(s) => { setItemsPerPage(s); setCurrentPage(1); }}
                  itemName="requests"
                  pageSizeOptions={[25, 50, 100]}
                />
              </Card>
            )}

        {/* New Request Modal */}
        <Dialog open={showNewRequestModal} onOpenChange={setShowNewRequestModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Dispensary Request</DialogTitle>
              <DialogDescription>Request medications from Central store to Dispensary</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="font-medium">Add Items to Request</h4>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                      <TooltipContent><p>Search by name or code. Quantity must be 1–{MAX_QUANTITY.toLocaleString()}.</p></TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="space-y-3">
                  <div className="relative">
                    <Label className="text-xs mb-1 block">Search Medication</Label>
                    <Input
                      placeholder="Search by name or code..."
                      value={medicationSearch}
                      onChange={(e) => setMedicationSearch(e.target.value)}
                      className="mt-1"
                    />
                    {filteredMedications.length > 0 && medicationSearch && (
                      <div className="absolute top-full left-0 right-0 mt-1 border rounded-lg bg-background shadow-lg z-10 max-h-48 overflow-y-auto">
                        {filteredMedications.map((med) => (
                          <button
                            key={med.id}
                            onClick={() => { setSelectedMedication(med); setMedicationSearch(""); }}
                            className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                          >
                            <div className="font-medium">{med.name}</div>
                            <div className="text-xs text-muted-foreground">{med.code} • {med.strength}</div>
                          </button>
                        ))}
                        {filteredMedications.length >= MEDICATION_SEARCH_LIMIT && (
                          <p className="px-3 py-2 text-xs text-muted-foreground">Showing first {MEDICATION_SEARCH_LIMIT} results. Refine search for more.</p>
                        )}
                      </div>
                    )}
                  </div>
                  {selectedMedication && (
                    <div className="bg-muted/50 p-2 rounded border">
                      <p className="text-sm font-medium">{selectedMedication.name}</p>
                      <p className="text-xs text-muted-foreground">{selectedMedication.code}</p>
                    </div>
                  )}
                  {selectedMedication && (
                    <div>
                      <Label className="text-xs">
                        {(selectedMedication.pack_size ?? 1) > 1
                          ? `Packs (×${selectedMedication.pack_size} units each, max ${Math.floor(MAX_QUANTITY / (selectedMedication.pack_size ?? 1)).toLocaleString()} packs)`
                          : `Quantity (1–${MAX_QUANTITY.toLocaleString()} units)`}
                      </Label>
                      <Input
                        type="number"
                        min={1}
                        max={(selectedMedication.pack_size ?? 1) > 1 ? Math.floor(MAX_QUANTITY / (selectedMedication.pack_size ?? 1)) : MAX_QUANTITY}
                        value={requestQuantity}
                        onChange={(e) => setRequestQuantity(e.target.value)}
                        placeholder={(selectedMedication.pack_size ?? 1) > 1 ? "10" : "100"}
                        className="mt-1"
                      />
                      {(selectedMedication.pack_size ?? 1) > 1 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {`${Math.max(0, Number.parseInt(requestQuantity || "0", 10) || 0).toLocaleString()} packs = ${(Math.max(0, Number.parseInt(requestQuantity || "0", 10) || 0) * (selectedMedication.pack_size ?? 1)).toLocaleString()} units`}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedMedication && (
                    <Button onClick={handleAddItem} className="w-full bg-blue-600 hover:bg-blue-700">
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Request
                    </Button>
                  )}
                  {requestItems.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium">Items Added ({requestItems.length})</p>
                      {requestItems.map((item, idx) => {
                        const med = medications.find((m) => m.id === item.medication);
                        const packSize = med?.pack_size ?? null;
                        return (
                          <div key={idx} className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-900">
                            <div>
                              <p className="text-sm font-medium">{med?.name}</p>
                              <p className="text-xs text-muted-foreground">{formatPackDisplay(item.quantity, packSize)}</p>
                            </div>
                            <Button variant="ghost" size="sm" onClick={() => setRequestItems(requestItems.filter((_, i) => i !== idx))} className="h-6 w-6 p-0">×</Button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g., Urgent request, special instructions..."
                  className="mt-1 resize-none"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewRequestModal(false)}>Cancel</Button>
              <Button onClick={handleCreateRequest} disabled={creatingRequest || requestItems.length === 0} className="bg-violet-600 hover:bg-violet-700">
                {creatingRequest ? "Creating..." : "Create Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedRequest?.request_id}</DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <div className="font-medium">{getStatusBadge(selectedRequest.status)}</div>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Created</p>
                    <p className="font-medium">{formatDisplayDate(selectedRequest.created_at)}</p>
                  </div>
                </div>
                {selectedRequest.confirmed_at && (
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                    <p className="text-sm font-medium mb-1 text-green-800 dark:text-green-200">✓ Receipt Confirmed</p>
                    <p className="text-xs text-green-700 dark:text-green-300">Confirmed by: {selectedRequest.confirmed_by_name}</p>
                    <p className="text-xs text-green-700 dark:text-green-300">On: {formatDisplayDateTime(selectedRequest.confirmed_at)}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium mb-2">Items ({selectedRequest.items?.length || 0})</p>
                  <div className="space-y-2">
                    {(selectedRequest.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="border rounded-lg p-3 text-sm flex justify-between items-start">
                        <div>
                          <p className="font-medium">{item.medication_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">Requested: {formatPackDisplay(Number(item.quantity), packSizeForItem(item))}</p>
                        </div>
                        {item.fulfilled_quantity > 0 && <span className="text-xs font-medium text-green-600">✓ {formatPackDisplay(Number(item.fulfilled_quantity), packSizeForItem(item))}</span>}
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDetailsModal(false)}>Close</Button>
                  {(selectedRequest.status === "fulfilled" || selectedRequest.status === "partially_fulfilled") && !selectedRequest.confirmed_at && (
                    <Button onClick={() => setShowConfirmModal(true)} className="bg-green-600 hover:bg-green-700">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      Confirm Receipt
                    </Button>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Confirm Receipt Modal */}
        <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Confirm Stock Receipt</DialogTitle>
              <DialogDescription>Verify that you have received the issued stock</DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium mb-2">Request: {selectedRequest.request_id}</p>
                  <div className="space-y-1 text-xs">
                    {(selectedRequest.items || []).map((item: any, idx: number) => (
                      <div key={idx} className="flex justify-between">
                        <span>{item.medication_name}</span>
                        <span className="font-medium">{formatPackDisplay(Number(item.fulfilled_quantity || item.quantity), packSizeForItem(item))}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Confirmation Notes (optional)</Label>
                  <Textarea placeholder="e.g., All items received in good condition..." value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} rows={3} className="mt-1" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowConfirmModal(false)} disabled={isConfirming}>Cancel</Button>
                  <Button onClick={handleConfirmReceipt} disabled={isConfirming} className="bg-green-600 hover:bg-green-700">
                    {isConfirming ? "Confirming..." : "Confirm Receipt"}
                  </Button>
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
