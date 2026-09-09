"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePharmacyPageAuth } from "@/hooks/use-pharmacy-page-auth";
import {
  formatEditableQuantity,
  formatPackDisplay,
  packSizeForStockItem,
  toDisplayQuantity,
  toUnitsQuantity,
} from "@/lib/pharmacy/stock-request-quantity";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type StockRequestItem, type Medication } from "@/lib/services";
import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import { localMonthBounds, localWeekToTodayBounds, todayApiDateString } from "@/lib/dates";
import { StockRequestListCard } from "@/components/pharmacy/StockRequestListCard";
import { StockRequestDetailDialog } from "@/components/pharmacy/StockRequestDetailDialog";
import { StockRequestItemsBuilder } from "@/components/pharmacy/StockRequestItemsBuilder";
import {
  formatStockRequestItemLine,
  isStockRequestEditable,
} from "@/lib/pharmacy/stock-request-card";
import { Send, CheckCircle2, Clock, Loader2, Zap, Search, Plus, Minus, HelpCircle, Building2 } from "lucide-react";

export default function StoreRequestsPage() {
  const { ready, handleAuthError } = usePharmacyPageAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [dateFilter, setDateFilter] = useState("today");
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [editedQuantities, setEditedQuantities] = useState<Record<number, number>>({});
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSavingQuantities, setIsSavingQuantities] = useState(false);

  const [requestTab, setRequestTab] = useState<"dispensary" | "ward" | "hod">("dispensary");
  const [hodDirection, setHodDirection] = useState<"to_hod" | "from_hod">("to_hod");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [statsData, setStatsData] = useState({ total: 0, pending: 0, approved: 0, awaiting: 0 });

  const [showHodRequestModal, setShowHodRequestModal] = useState(false);
  const [hodRequestItems, setHodRequestItems] = useState<Array<{ medication: number; quantity: number }>>([]);
  const [hodRequestNotes, setHodRequestNotes] = useState("");
  const [creatingHodRequest, setCreatingHodRequest] = useState(false);
  const [hodMedicationCache, setHodMedicationCache] = useState<Record<number, Medication>>({});
  const learnHodMedication = useCallback((med: Medication) => {
    setHodMedicationCache((prev) => ({ ...prev, [med.id]: med }));
  }, []);

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

  const loadStats = useCallback(async () => {
    try {
      const baseParams: Record<string, string> = { show_all: 'true' };
      if (debouncedSearchQuery.trim()) baseParams.search = debouncedSearchQuery.trim();
      Object.assign(baseParams, buildDateParams());
      baseParams.to_location =
        requestTab === "dispensary"
          ? PHARMACY_LOCATIONS.DISPENSARY
          : requestTab === "ward"
            ? PHARMACY_LOCATIONS.WARD_CARE
            : hodDirection === "to_hod"
              ? PHARMACY_LOCATIONS.HOD_STORE
              : PHARMACY_LOCATIONS.STORE;
      if (requestTab === "hod" && hodDirection === "from_hod") {
        baseParams.from_location = PHARMACY_LOCATIONS.HOD_STORE;
      }
      const stats = await pharmacyService.getStockRequestListStats(baseParams);
      setStatsData({
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        awaiting: stats.awaitingConfirmation,
      });
    } catch (err) {
      handleAuthError(err);
    }
  }, [buildDateParams, debouncedSearchQuery, handleAuthError, hodDirection, requestTab]);

  const loadRequests = useCallback(async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: itemsPerPage,
        show_all: 'true',
      };
      if (requestTab === "dispensary") {
        params.to_location = PHARMACY_LOCATIONS.DISPENSARY;
      } else if (requestTab === "ward") {
        params.to_location = PHARMACY_LOCATIONS.WARD_CARE;
      } else if (hodDirection === "to_hod") {
        params.to_location = PHARMACY_LOCATIONS.HOD_STORE;
      } else {
        params.from_location = PHARMACY_LOCATIONS.HOD_STORE;
        params.to_location = PHARMACY_LOCATIONS.STORE;
      }
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      Object.assign(params, buildDateParams());
      const response = await pharmacyService.getStockRequests(params);
      setRequests(response.results || []);
      setTotalCount(response.count ?? response.results?.length ?? 0);
    } catch (err) {
      if (handleAuthError(err)) return;
      console.error("Error loading requests:", err);
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  }, [buildDateParams, currentPage, debouncedSearchQuery, handleAuthError, hodDirection, itemsPerPage, requestTab, statusFilter]);

  useEffect(() => {
    if (!ready) return;
    loadRequests();
  }, [loadRequests, ready]);

  useEffect(() => {
    if (!ready) return;
    loadStats();
  }, [loadStats, ready]);

  const resetHodRequestModal = () => {
    setHodRequestItems([]);
    setHodRequestNotes("");
  };

  const handleCreateHodToStoreRequest = async () => {
    if (hodRequestItems.length === 0) {
      toast.error("Add at least one medication");
      return;
    }
    try {
      setCreatingHodRequest(true);
      await pharmacyService.createHodToStoreStockRequest({
        items: hodRequestItems,
        notes: hodRequestNotes,
      });
      toast.success("Request submitted — issue from HOD store when approved");
      setShowHodRequestModal(false);
      resetHodRequestModal();
      await loadRequests();
      await loadStats();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create request");
    } finally {
      setCreatingHodRequest(false);
    }
  };

  const handleOpenDetails = (req: StockRequest) => {
    setSelectedRequest(req);
    const qtyMap: Record<number, number> = {};
    (req.items || []).forEach((item: StockRequestItem) => {
      if (item.id != null) qtyMap[item.id] = toDisplayQuantity(Number(item.quantity) || 0, packSizeForStockItem(item));
    });
    setEditedQuantities(qtyMap);
    setShowDetailsModal(true);
  };

  const handleQuantityChange = (itemId: number, delta: number, originalQty: number) => {
    const current = editedQuantities[itemId] ?? originalQty;
    const newVal = Math.max(0, current + delta);
    setEditedQuantities((prev) => ({ ...prev, [itemId]: newVal }));
  };

  const handleQuantityInput = (itemId: number, val: string) => {
    const parsed = parseInt(val, 10);
    const newVal = isNaN(parsed) ? 0 : Math.max(0, parsed);
    setEditedQuantities((prev) => ({ ...prev, [itemId]: newVal }));
  };

  const handleSaveQuantities = async () => {
    if (!selectedRequest || selectedRequest.status === "fulfilled" || selectedRequest.status === "partially_fulfilled" || selectedRequest.status === "received") return;
    const validItems = (selectedRequest.items || []).filter((item: StockRequestItem) => item.id != null);
    if (validItems.length === 0) {
      toast.error("No valid items to update");
      return;
    }
    try {
      setIsSavingQuantities(true);
      const items = validItems.map((item: StockRequestItem) => ({
        id: item.id!,
        quantity: toUnitsQuantity(
          editedQuantities[item.id!] ?? toDisplayQuantity(Number(item.quantity), packSizeForStockItem(item)),
          packSizeForStockItem(item),
        ),
      }));
      const res = await pharmacyService.updateStockRequestItems(selectedRequest.id, items);
      toast.success(res?.message || "Quantities updated");
      if (res?.request) {
        setSelectedRequest(res.request);
        const qtyMap: Record<number, number> = {};
        (res.request.items || []).forEach((item: StockRequestItem) => {
          if (item.id != null) qtyMap[item.id] = toDisplayQuantity(Number(item.quantity) || 0, packSizeForStockItem(item));
        });
        setEditedQuantities(qtyMap);
      }
      await loadRequests();
    } catch (err: any) {
      const msg = err?.apiMessage || err?.message || err?.body || "Failed to update quantities";
      const display = typeof msg === "string" ? msg : (msg?.error || msg?.detail || JSON.stringify(msg));
      toast.error(display);
    } finally {
      setIsSavingQuantities(false);
    }
  };

  const handleApproveRequest = async (requestId: number) => {
    try {
      setIsProcessing(true);
      const updated = await pharmacyService.approveStockRequest(requestId);
      toast.success("Request approved");
      if (selectedRequest?.id === requestId) {
        setSelectedRequest(updated);
        const qtyMap: Record<number, number> = {};
        (updated.items || []).forEach((item: StockRequestItem) => {
          if (item.id != null) qtyMap[item.id] = toDisplayQuantity(Number(item.quantity) || 0, packSizeForStockItem(item));
        });
        setEditedQuantities(qtyMap);
      }
      await loadRequests();
    } catch (err: any) {
      toast.error(err?.message || err?.apiMessage || "Failed to approve request");
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFulfillRequest = async (requestId: number) => {
    try {
      setIsProcessing(true);
      await pharmacyService.fulfillStockRequest(requestId);
      toast.success(
        requestTab === "dispensary"
          ? "Request issued — awaiting dispensary confirmation"
          : requestTab === "ward"
            ? "Request issued — awaiting ward nurse confirmation"
            : hodDirection === "to_hod"
              ? "Request issued — awaiting HOD confirmation"
              : "Request issued — stock moved to Central Store"
      );
      setShowDetailsModal(false);
      setSelectedRequest(null);
      await loadRequests();
    } catch (err: any) {
      const msg =
        err?.apiMessage ||
        err?.message ||
        (typeof err?.body === "string" && err.body.trim() ? err.body : undefined) ||
        (typeof err?.body === "object" ? (err.body.error || err.body.detail) : undefined) ||
        "Failed to issue request";
      toast.error(msg);
    } finally {
      setIsProcessing(false);
    }
  };

  const paginatedRequests = requests;

  const stats = useMemo(() => [
    { label: "Total", value: statsData.total, icon: Send, color: "text-violet-500", bg: "bg-violet-500/10" },
    { label: "Pending Review", value: statsData.pending, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Approved", value: statsData.approved, icon: Zap, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Awaiting Confirmation", value: statsData.awaiting, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10" },
  ], [statsData]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Store Requests</h1>
            <p className="text-muted-foreground mt-1">
              {requestTab === "dispensary"
                ? "Central Store — Bode Thomas Clinic — Review, approve, and issue stock to Dispensary"
                : requestTab === "ward"
                  ? "Central Store — Bode Thomas Clinic — Review, approve, and issue stock to Ward Care"
                  : hodDirection === "to_hod"
                    ? "Central Store — Issue stock to Pharmacy HOD store"
                    : "Central Store — Request and receive stock from Pharmacy HOD store"}
            </p>
          </div>
          {requestTab === "hod" && hodDirection === "from_hod" && (
            <Button onClick={() => setShowHodRequestModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Request from HOD Store
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
          <button
            onClick={() => { setRequestTab("hod"); setCurrentPage(1); }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              requestTab === "hod"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Send className="h-4 w-4" />
            HOD Store
          </button>
        </div>

        {requestTab === "hod" && (
          <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
            <button
              type="button"
              onClick={() => { setHodDirection("to_hod"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm ${
                hodDirection === "to_hod" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              To HOD store
            </button>
            <button
              type="button"
              onClick={() => { setHodDirection("from_hod"); setCurrentPage(1); }}
              className={`px-3 py-1.5 rounded-md text-sm ${
                hodDirection === "from_hod" ? "bg-background shadow-sm" : "text-muted-foreground"
              }`}
            >
              From HOD store
            </button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
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
                      onChange={(e) => setSearchQuery(e.target.value)}
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
                        <SelectItem value="pending">Pending Review</SelectItem>
                        <SelectItem value="approved">Approved</SelectItem>
                        <SelectItem value="partially_fulfilled">Partially Issued</SelectItem>
                        <SelectItem value="fulfilled">Awaiting Confirmation</SelectItem>
                        <SelectItem value="received">Confirmed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-between px-1">
              <p className="text-sm text-muted-foreground">
                Showing <span className="font-medium text-foreground">{paginatedRequests.length}</span> requests
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
              ) : paginatedRequests.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Send className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No requests found</p>
                  </CardContent>
                </Card>
              ) : (
                paginatedRequests.map((req) => (
                  <StockRequestListCard
                    key={req.id}
                    request={req}
                    role="operator"
                    onOpen={handleOpenDetails}
                    onApprove={handleApproveRequest}
                    onIssue={handleFulfillRequest}
                    isProcessing={isProcessing}
                  />
                ))
              )}
            </div>

            {!loading && totalCount > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={totalCount}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(s) => { setItemsPerPage(s); setCurrentPage(1); }}
                  itemName="requests"
                  pageSizeOptions={[25, 50, 100]}
                />
              </Card>
            )}

        <StockRequestDetailDialog
          open={showDetailsModal}
          onOpenChange={setShowDetailsModal}
          request={selectedRequest}
          role="operator"
          description={
            selectedRequest && isStockRequestEditable(selectedRequest.status)
              ? "Review items and adjust quantities before approving or issuing"
              : undefined
          }
          itemsSlot={
            selectedRequest ? (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <p className="text-sm font-medium">
                    {isStockRequestEditable(selectedRequest.status)
                      ? "Items (adjust quantities if needed)"
                      : `Items (${selectedRequest.items?.length || 0})`}
                  </p>
                  {isStockRequestEditable(selectedRequest.status) ? (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger>
                          <HelpCircle className="h-4 w-4 text-muted-foreground" />
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Use +/− to change quantities. Save before issuing.</p>
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  ) : null}
                </div>
                <div className="space-y-2">
                  {(selectedRequest.items || []).map((item: StockRequestItem) => {
                    const canEdit = isStockRequestEditable(selectedRequest.status);
                    const fulfilled = Number(item.fulfilled_quantity || 0);
                    const packSize = packSizeForStockItem(item);
                    const qty =
                      editedQuantities[item.id!] ??
                      toDisplayQuantity(Number(item.quantity), packSize);

                    if (!canEdit) {
                      const { medicationName, quantityLine } = formatStockRequestItemLine(item);
                      return (
                        <div
                          key={item.id}
                          className="border rounded-lg p-3 text-sm flex justify-between items-start gap-3"
                        >
                          <div className="min-w-0">
                            <p className="font-medium">{medicationName}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{quantityLine}</p>
                          </div>
                        </div>
                      );
                    }

                    return (
                      <div
                        key={item.id}
                        className="border rounded-lg p-3 bg-muted/30 flex justify-between items-center gap-3"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-sm">{item.medication_name}</p>
                          <p className="text-xs text-muted-foreground">
                            Requested: {formatPackDisplay(Number(item.quantity), packSize)}
                          </p>
                        </div>
                        {fulfilled === 0 ? (
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                handleQuantityChange(
                                  item.id!,
                                  -1,
                                  toDisplayQuantity(Number(item.quantity), packSize),
                                )
                              }
                            >
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Input
                              type="number"
                              min={0}
                              value={qty}
                              onChange={(e) => handleQuantityInput(item.id!, e.target.value)}
                              className="w-16 h-8 text-center text-sm [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                            />
                            <Button
                              variant="outline"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() =>
                                handleQuantityChange(
                                  item.id!,
                                  1,
                                  toDisplayQuantity(Number(item.quantity), packSize),
                                )
                              }
                            >
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            {formatEditableQuantity(qty, packSize)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : null
          }
          footerSlot={
            selectedRequest ? (
              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setShowDetailsModal(false)}>Close</Button>
                {(selectedRequest.status === "pending" || selectedRequest.status === "approved") && (
                  <>
                    <Button onClick={handleSaveQuantities} disabled={isSavingQuantities} variant="secondary">
                      {isSavingQuantities ? "Saving..." : "Save Quantities"}
                    </Button>
                    {selectedRequest.status === "pending" && (
                      <Button onClick={() => handleApproveRequest(selectedRequest.id)} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700">
                        {isProcessing ? "Approving..." : "Approve"}
                      </Button>
                    )}
                    {selectedRequest.status === "approved" && (
                      <Button onClick={() => handleFulfillRequest(selectedRequest.id)} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
                        {isProcessing
                          ? "Issuing..."
                          : requestTab === "dispensary"
                            ? "Issue to Dispensary"
                            : requestTab === "ward"
                              ? "Issue to Ward Care"
                              : hodDirection === "to_hod"
                                ? "Issue to HOD Store"
                                : "Issue from HOD Store"}
                      </Button>
                    )}
                  </>
                )}
              </DialogFooter>
            ) : null
          }
        />

        <Dialog
          open={showHodRequestModal}
          onOpenChange={(open) => {
            setShowHodRequestModal(open);
            if (!open) resetHodRequestModal();
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Request from HOD Store</DialogTitle>
              <DialogDescription>
                Add one or more drugs to the list below, then submit a single request from HOD Store to Central Store.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <StockRequestItemsBuilder
                key={showHodRequestModal ? "open" : "closed"}
                items={hodRequestItems}
                onItemsChange={setHodRequestItems}
                medicationCache={hodMedicationCache}
                onMedicationLearned={learnHodMedication}
              />
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  className="mt-1 resize-none"
                  rows={3}
                  value={hodRequestNotes}
                  onChange={(e) => setHodRequestNotes(e.target.value)}
                  placeholder="e.g., Return excess stock, urgent restock..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowHodRequestModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateHodToStoreRequest}
                disabled={creatingHodRequest || hodRequestItems.length === 0}
              >
                {creatingHodRequest
                  ? "Submitting..."
                  : hodRequestItems.length > 0
                    ? `Submit request (${hodRequestItems.length} drug${hodRequestItems.length === 1 ? "" : "s"})`
                    : "Submit request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
