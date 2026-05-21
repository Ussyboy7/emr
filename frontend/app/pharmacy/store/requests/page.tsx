"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type StockRequestItem } from "@/lib/services";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import { Send, CheckCircle2, Clock, Loader2, Eye, Zap, Search, Plus, Minus, HelpCircle, Building2 } from "lucide-react";

function useDebouncedValue<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function StoreRequestsPage() {
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

  const [requestTab, setRequestTab] = useState<"dispensary" | "ward">("dispensary");

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [statsData, setStatsData] = useState({ total: 0, pending: 0, approved: 0, awaiting: 0 });

  const buildDateParams = () => {
    const p: Record<string, string> = {};
    if (dateFilter === "today") {
      const today = new Date().toISOString().split("T")[0];
      p.date_after = today;
      p.date_before = today;
    } else if (dateFilter === "week") {
      const today = new Date();
      const weekStart = new Date(today);
      weekStart.setDate(today.getDate() - today.getDay());
      p.date_after = weekStart.toISOString().split("T")[0];
      p.date_before = today.toISOString().split("T")[0];
    } else if (dateFilter === "month") {
      const today = new Date();
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
      p.date_after = monthStart.toISOString().split("T")[0];
      p.date_before = today.toISOString().split("T")[0];
    }
    return p;
  };

  const loadStats = async () => {
    try {
      const baseParams: Record<string, string | number> = { page: 1, page_size: 1 };
      if (debouncedSearchQuery.trim()) baseParams.search = debouncedSearchQuery.trim();
      Object.assign(baseParams, buildDateParams());
      baseParams.to_location = requestTab === "dispensary" ? PHARMACY_LOCATIONS.DISPENSARY : PHARMACY_LOCATIONS.WARD_CARE;
      baseParams.show_all = 'true';
      const [all, pending, approved, fulfilled, partResp] = await Promise.all([
        pharmacyService.getStockRequests(baseParams),
        pharmacyService.getStockRequests({ ...baseParams, status: "pending" }),
        pharmacyService.getStockRequests({ ...baseParams, status: "approved" }),
        pharmacyService.getStockRequests({ ...baseParams, status: "fulfilled" }),
        pharmacyService.getStockRequests({ ...baseParams, status: "partially_fulfilled" }),
      ]);
      setStatsData({
        total: all.count ?? 0,
        pending: pending.count ?? 0,
        approved: approved.count ?? 0,
        awaiting: (fulfilled.count ?? 0) + (partResp.count ?? 0),
      });
    } catch {
      // ignore
    }
  };

  const loadRequests = async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: itemsPerPage,
        to_location: requestTab === "dispensary" ? PHARMACY_LOCATIONS.DISPENSARY : PHARMACY_LOCATIONS.WARD_CARE,
        show_all: 'true',
      };
      if (statusFilter && statusFilter !== "all") params.status = statusFilter;
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      Object.assign(params, buildDateParams());
      const response = await pharmacyService.getStockRequests(params);
      setRequests(response.results || []);
      setTotalCount(response.count ?? response.results?.length ?? 0);
    } catch (err) {
      console.error("Error loading requests:", err);
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, [statusFilter, currentPage, itemsPerPage, debouncedSearchQuery, dateFilter, requestTab]);

  useEffect(() => {
    loadStats();
  }, [debouncedSearchQuery, statusFilter, dateFilter, requestTab]);

  const handleOpenDetails = (req: StockRequest) => {
    setSelectedRequest(req);
    const qtyMap: Record<number, number> = {};
    (req.items || []).forEach((item: StockRequestItem) => {
      if (item.id != null) qtyMap[item.id] = toDisplayQuantity(Number(item.quantity) || 0, packSizeForItem(item));
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
          editedQuantities[item.id!] ?? toDisplayQuantity(Number(item.quantity), packSizeForItem(item)),
          packSizeForItem(item),
        ),
      }));
      const res = await pharmacyService.updateStockRequestItems(selectedRequest.id, items);
      toast.success(res?.message || "Quantities updated");
      if (res?.request) {
        setSelectedRequest(res.request);
        const qtyMap: Record<number, number> = {};
        (res.request.items || []).forEach((item: StockRequestItem) => {
          if (item.id != null) qtyMap[item.id] = toDisplayQuantity(Number(item.quantity) || 0, packSizeForItem(item));
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
          if (item.id != null) qtyMap[item.id] = toDisplayQuantity(Number(item.quantity) || 0, packSizeForItem(item));
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
      toast.success(requestTab === "dispensary" ? "Request issued — awaiting dispensary confirmation" : "Request issued — awaiting ward nurse confirmation");
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

  const formatPackDisplay = (units: number, packSize: number | undefined | null) => {
    if (!packSize || packSize <= 1) return `${units.toLocaleString()} units`;
    const packs = Math.floor(units / packSize);
    return `${packs.toLocaleString()} packs (${units.toLocaleString()} units)`;
  };
  const toDisplayQuantity = (units: number, packSize: number | undefined | null) => {
    if (!packSize || packSize <= 1) return units;
    return Math.floor(units / packSize);
  };
  const toUnitsQuantity = (displayQty: number, packSize: number | undefined | null) => {
    if (!packSize || packSize <= 1) return displayQty;
    return displayQty * packSize;
  };
  const formatEditableQuantity = (displayQty: number, packSize: number | undefined | null) => {
    if (!packSize || packSize <= 1) return `${displayQty.toLocaleString()} units`;
    const units = toUnitsQuantity(displayQty, packSize);
    return `${displayQty.toLocaleString()} packs (${units.toLocaleString()} units)`;
  };
  const packSizeForItem = (item: any) => item.medication_pack_size ?? null;

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string; tip?: string }> = {
      pending: { label: "Pending Review", cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200", tip: "Awaiting store approval" },
      approved: { label: "Approved", cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200", tip: "Ready to issue" },
      partially_fulfilled: { label: "Partially Issued", cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200", tip: "Some items issued" },
      fulfilled: { label: "Issued (Awaiting Confirm)", cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200", tip: requestTab === "dispensary" ? "Stock issued; dispensary must confirm receipt" : "Stock issued; ward nurse must confirm receipt" },
      received: { label: "Confirmed", cls: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200" },
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
                : "Central Store — Bode Thomas Clinic — Review, approve, and issue stock to Ward Care"}
            </p>
          </div>
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
                  <Card key={req.id} className="hover:shadow-md transition-shadow cursor-pointer" onClick={() => handleOpenDetails(req)}>
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div className="flex-shrink-0">
                          <Building2 className="h-8 w-8 text-violet-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">
                                {req.clinic_name || 'Unknown clinic'}
                              </span>
                              {getStatusBadge(req.status)}
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0" onClick={(e) => e.stopPropagation()}>
                              {req.status === "pending" && (
                                <Button size="sm" onClick={() => handleApproveRequest(req.id)} disabled={isProcessing} className="bg-blue-600 hover:bg-blue-700 h-8">
                                  Approve
                                </Button>
                              )}
                              {req.status === "approved" && (
                                <Button size="sm" onClick={() => handleFulfillRequest(req.id)} disabled={isProcessing} className="bg-green-600 hover:bg-green-700 h-8">
                                  {isProcessing ? "Issuing..." : "Issue"}
                                </Button>
                              )}
                              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => handleOpenDetails(req)}>
                                <Eye className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>{req.items?.length || 0} item(s)</span>
                            <span>•</span>
                            <span>{new Date(req.created_at).toLocaleDateString()}</span>
                            <span>•</span>
                            <span>Store → {req.to_location || 'Dispensary'}</span>
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

            {!loading && totalCount > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={currentPage}
                  totalItems={totalCount}
                  itemsPerPage={itemsPerPage}
                  onPageChange={setCurrentPage}
                  onItemsPerPageChange={(s) => { setItemsPerPage(s); setCurrentPage(1); }}
                  itemName="requests"
                  pageSizeOptions={[25, 50, 75, 100]}
                />
              </Card>
            )}

        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedRequest?.request_id}</DialogTitle>
              <DialogDescription>Review items and adjust quantities before approving or issuing</DialogDescription>
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
                    <p className="font-medium">{new Date(selectedRequest.created_at).toLocaleDateString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Requesting Clinic</p>
                    <p className="font-medium">{selectedRequest.clinic_name || 'N/A'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Requested By</p>
                    <p className="font-medium">{selectedRequest.requested_by_name || 'N/A'}</p>
                  </div>
                </div>
                {selectedRequest.notes && (
                  <div>
                    <p className="text-sm font-medium mb-1">Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.notes}</p>
                  </div>
                )}
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-sm font-medium">Items (adjust quantities if needed)</p>
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger><HelpCircle className="h-4 w-4 text-muted-foreground" /></TooltipTrigger>
                        <TooltipContent><p>Use +/− to change quantities. Save before issuing.</p></TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </div>
                  <div className="space-y-2">
                    {(selectedRequest.items || []).map((item: StockRequestItem) => {
                      const canEdit = selectedRequest.status === "pending" || selectedRequest.status === "approved";
                      const fulfilled = Number(item.fulfilled_quantity || 0);
                      const packSize = packSizeForItem(item);
                      const qty = editedQuantities[item.id!] ?? toDisplayQuantity(Number(item.quantity), packSize);
                      return (
                        <div key={item.id} className="border rounded-lg p-3 bg-muted/30 flex justify-between items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-sm">{item.medication_name}</p>
                            <p className="text-xs text-muted-foreground">
                              Requested: {formatPackDisplay(Number(item.quantity), packSize)}
                              {fulfilled > 0 && <> • Issued: {formatPackDisplay(fulfilled, packSize)}</>}
                            </p>
                          </div>
                          {canEdit && fulfilled === 0 ? (
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => handleQuantityChange(item.id!, -1, toDisplayQuantity(Number(item.quantity), packSize))}
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
                                onClick={() => handleQuantityChange(item.id!, 1, toDisplayQuantity(Number(item.quantity), packSize))}
                              >
                                <Plus className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : fulfilled > 0 ? (
                            <span className="text-xs font-medium text-green-600">✓ {formatPackDisplay(fulfilled, packSize)} issued</span>
                          ) : (
                            <span className="text-xs text-muted-foreground">{formatEditableQuantity(qty, packSize)}</span>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
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
                          {isProcessing ? "Issuing..." : requestTab === "dispensary" ? "Issue to Dispensary" : "Issue to Ward Care"}
                        </Button>
                      )}
                    </>
                  )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
