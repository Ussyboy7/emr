"use client";

import { useEffect, useMemo, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePharmacyPageAuth } from "@/hooks/use-pharmacy-page-auth";
import { formatPackDisplay, packSizeForRequestItem } from "@/lib/pharmacy/stock-request-quantity";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type Medication } from "@/lib/services";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import { localMonthBounds, localWeekToTodayBounds, todayApiDateString } from "@/lib/dates";
import { useClinic } from "@/hooks/use-clinic";
import { StockRequestListCard } from "@/components/pharmacy/StockRequestListCard";
import { StockRequestDetailDialog } from "@/components/pharmacy/StockRequestDetailDialog";
import { StockRequestItemsBuilder } from "@/components/pharmacy/StockRequestItemsBuilder";
import { Send, Search, Plus, CheckCircle2, Clock, Loader2, Building2 } from "lucide-react";

export default function DispensaryRequestsPage() {
  return (
    <Suspense fallback={null}>
      <DispensaryRequestsPageContent />
    </Suspense>
  );
}

function DispensaryRequestsPageContent() {
  const searchParams = useSearchParams();
  const { ready, handleAuthError } = usePharmacyPageAuth();
  const { activeClinicName } = useClinic();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [medicationCache, setMedicationCache] = useState<Record<number, Medication>>({});
  const learnMedication = useCallback((med: Medication) => {
    setMedicationCache((prev) => ({ ...prev, [med.id]: med }));
  }, []);
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
  const [seedMedication, setSeedMedication] = useState<Medication | null>(null);
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, confirmed: 0, awaitingConfirmation: 0 });

  const [requestTab, setRequestTab] = useState<"dispensary" | "ward">("dispensary");

  const [currentPage, setCurrentPage] = useState(1);
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
    if (!ready) return;
    const medIdRaw = searchParams.get("medicationId");
    const openNew = searchParams.get("new") === "1";
    if (!openNew && !medIdRaw) return;

    const bootstrap = async () => {
      if (medIdRaw) {
        const medId = Number.parseInt(medIdRaw, 10);
        if (Number.isFinite(medId) && medId > 0) {
          try {
            const med = await pharmacyService.getMedication(medId);
            learnMedication(med);
            setSeedMedication(med);
          } catch (err) {
            if (!handleAuthError(err)) {
              console.error("Error loading medication for request:", err);
            }
          }
        }
      }
      setShowNewRequestModal(true);
    };
    void bootstrap();
  }, [ready, searchParams, handleAuthError, learnMedication]);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = { page: currentPage, page_size: itemsPerPage };
      if (statusFilter !== "all") params.status = statusFilter;
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      Object.assign(params, buildDateParams());
      if (requestTab === "dispensary") {
        params.to_location = PHARMACY_LOCATIONS.DISPENSARY;
      } else {
        params.to_location = PHARMACY_LOCATIONS.WARD_CARE;
      }
      const response = await pharmacyService.getStockRequests(params);
      setRequests(response.results || []);
      setTotalRequests(response.count ?? response.results?.length ?? 0);
    } catch (err) {
      if (handleAuthError(err)) return;
      console.error("Error loading stock requests:", err);
      toast.error("Failed to load stock requests");
    } finally {
      setLoading(false);
    }
  }, [buildDateParams, currentPage, debouncedSearchQuery, handleAuthError, itemsPerPage, requestTab, statusFilter]);

  const loadStats = useCallback(async () => {
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
    } catch (err) {
      handleAuthError(err);
    }
  }, [buildDateParams, debouncedSearchQuery, handleAuthError, requestTab]);

  useEffect(() => {
    if (!ready) return;
    void loadStats();
  }, [loadStats, ready]);

  useEffect(() => {
    if (!ready) return;
    void loadRequests();
  }, [loadRequests, ready]);

  const closeNewRequestModal = () => {
    setShowNewRequestModal(false);
    setRequestItems([]);
    setRequestNotes("");
    setSeedMedication(null);
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
      closeNewRequestModal();
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
              {activeClinicName
                ? `${activeClinicName} · ${requestTab === "dispensary" ? "Dispensary" : "Ward Care"} · From Central Store`
                : requestTab === "dispensary"
                  ? "Dispensary requests from Central Store"
                  : "Ward Care requests from Central Store"}
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
                  <StockRequestListCard
                    key={req.id}
                    request={req}
                    role="requester"
                    medications={Object.values(medicationCache)}
                    onOpen={(r) => {
                      setSelectedRequest(r);
                      setShowDetailsModal(true);
                    }}
                    onConfirm={(r) => {
                      setSelectedRequest(r);
                      setShowConfirmModal(true);
                    }}
                  />
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

        <Dialog
          open={showNewRequestModal}
          onOpenChange={(open) => {
            if (!open) closeNewRequestModal();
            else setShowNewRequestModal(true);
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create Dispensary Request</DialogTitle>
              <DialogDescription>
                Add one or more drugs to the list below, then submit a single request to Central Store.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <StockRequestItemsBuilder
                key={showNewRequestModal ? "open" : "closed"}
                items={requestItems}
                onItemsChange={setRequestItems}
                medicationCache={medicationCache}
                onMedicationLearned={learnMedication}
                seedMedication={seedMedication}
                addButtonClassName="bg-violet-600 hover:bg-violet-700"
              />
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
              <Button variant="outline" onClick={closeNewRequestModal}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateRequest}
                disabled={creatingRequest || requestItems.length === 0}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {creatingRequest
                  ? "Submitting..."
                  : requestItems.length > 0
                    ? `Submit request (${requestItems.length} drug${requestItems.length === 1 ? "" : "s"})`
                    : "Submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <StockRequestDetailDialog
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
          request={selectedRequest}
          role="requester"
          medications={Object.values(medicationCache)}
          onConfirm={() => setShowConfirmModal(true)}
        />

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
                        <span className="font-medium">{formatPackDisplay(Number(item.fulfilled_quantity || item.quantity), packSizeForRequestItem(item, Object.values(medicationCache)))}</span>
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
