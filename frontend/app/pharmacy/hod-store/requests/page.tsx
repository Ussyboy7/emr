"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePharmacyPageAuth } from "@/hooks/use-pharmacy-page-auth";
import { formatPackDisplay, packSizeForStockItem, requestInputToUnits } from "@/lib/pharmacy/stock-request-quantity";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type Medication } from "@/lib/services";
import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import {
  formatDisplayDate,
  formatDisplayDateTime,
  localMonthBounds,
  localWeekToTodayBounds,
  todayApiDateString,
} from "@/lib/dates";
import {
  Send,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  Loader2,
  Eye,
  HelpCircle,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";

const MEDICATION_SEARCH_LIMIT = 20;
const MAX_QUANTITY = 100000;

type RequestTab = "incoming" | "outgoing";
type RequestLine = {
  medication: number;
  quantity: number;
  medication_name: string;
  medication_pack_size?: number | null;
};

export default function HodStoreRequestsPage() {
  const { ready, handleAuthError } = usePharmacyPageAuth();

  const [requestTab, setRequestTab] = useState<RequestTab>("incoming");
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("today");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    confirmed: 0,
    awaitingConfirmation: 0,
  });

  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const [requestItems, setRequestItems] = useState<RequestLine[]>([]);
  const [requestNotes, setRequestNotes] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [medicationSearch, setMedicationSearch] = useState("");
  const debouncedMedSearch = useDebouncedValue(medicationSearch, 300);
  const [selectedMedication, setSelectedMedication] = useState<Medication | null>(null);
  const [requestQuantity, setRequestQuantity] = useState("1");
  const [filteredMedications, setFilteredMedications] = useState<Medication[]>([]);

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

  const statsParams = useCallback((): Record<string, string> => {
    const baseParams: Record<string, string> = { show_all: "true" };
    if (debouncedSearchQuery.trim()) baseParams.search = debouncedSearchQuery.trim();
    Object.assign(baseParams, buildDateParams());
    if (requestTab === "incoming") {
      baseParams.to_location = PHARMACY_LOCATIONS.HOD_STORE;
    } else {
      baseParams.from_location = PHARMACY_LOCATIONS.HOD_STORE;
      baseParams.to_location = PHARMACY_LOCATIONS.STORE;
    }
    return baseParams;
  }, [debouncedSearchQuery, buildDateParams, requestTab]);

  const listParams = useCallback((): Record<string, string | number> => {
    const params: Record<string, string | number> = {
      page: currentPage,
      page_size: itemsPerPage,
      show_all: "true",
    };
    if (statusFilter !== "all") params.status = statusFilter;
    if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
    Object.assign(params, buildDateParams());
    if (requestTab === "incoming") {
      params.to_location = PHARMACY_LOCATIONS.HOD_STORE;
    } else {
      params.from_location = PHARMACY_LOCATIONS.HOD_STORE;
      params.to_location = PHARMACY_LOCATIONS.STORE;
    }
    return params;
  }, [currentPage, itemsPerPage, statusFilter, debouncedSearchQuery, buildDateParams, requestTab]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const response = await pharmacyService.getStockRequests(listParams());
      setRequests(response.results || []);
      setTotalRequests(response.count ?? response.results?.length ?? 0);
    } catch (err) {
      if (handleAuthError(err)) {
        return;
      }
      console.error(err);
      toast.error("Failed to load HOD store requests");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const s = await pharmacyService.getStockRequestListStats(statsParams());
      setStats({
        total: s.total,
        pending: s.pending,
        approved: s.approved,
        confirmed: s.confirmed,
        awaitingConfirmation: s.awaitingConfirmation,
      });
    } catch (err) {
      handleAuthError(err);
    }
  };

  useEffect(() => {
    if (!ready) return;
    void loadStats();
  }, [debouncedSearchQuery, statusFilter, dateFilter, requestTab, ready]);

  useEffect(() => {
    if (!ready) return;
    void loadRequests();
  }, [currentPage, itemsPerPage, statusFilter, debouncedSearchQuery, dateFilter, requestTab, ready]);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const term = debouncedMedSearch.trim();
      if (!term) {
        setFilteredMedications([]);
        return;
      }
      try {
        const res = await pharmacyService.getMedications({
          search: term,
          page: 1,
          page_size: MAX_LIST_PAGE_SIZE,
        });
        if (!cancelled) setFilteredMedications((res.results || []).slice(0, MEDICATION_SEARCH_LIMIT));
      } catch {
        if (!cancelled) setFilteredMedications([]);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [debouncedMedSearch]);

  const handleAddItem = () => {
    if (!selectedMedication) {
      toast.error("Select a medication");
      return;
    }
    const packSize = selectedMedication.pack_size ?? 1;
    const inputVal = parseInt(requestQuantity, 10);
    if (!Number.isFinite(inputVal) || inputVal < 1) {
      toast.error("Enter a valid quantity (min 1)");
      return;
    }
    const qty = requestInputToUnits(inputVal, packSize);
    if (qty > MAX_QUANTITY) {
      toast.error(`Quantity must not exceed ${MAX_QUANTITY.toLocaleString()} units`);
      return;
    }
    if (requestItems.find((i) => i.medication === selectedMedication.id)) {
      toast.error("Medication already added");
      return;
    }
    setRequestItems([
      ...requestItems,
      {
        medication: selectedMedication.id,
        quantity: qty,
        medication_name: selectedMedication.name,
        medication_pack_size: selectedMedication.pack_size ?? null,
      },
    ]);
    setSelectedMedication(null);
    setMedicationSearch("");
    setRequestQuantity("1");
  };

  const handleCreateRequest = async () => {
    if (requestItems.length === 0) {
      toast.error("Add at least one medication");
      return;
    }
    try {
      setCreatingRequest(true);
      await pharmacyService.createHodFromStoreStockRequest({
        items: requestItems,
        notes: requestNotes,
      });
      toast.success("Request submitted to Central Store");
      setShowNewRequestModal(false);
      resetNewRequestModal();
      await loadRequests();
      await loadStats();
    } catch (err: any) {
      toast.error(err?.message || "Failed to create request");
    } finally {
      setCreatingRequest(false);
    }
  };

  const handleConfirmReceipt = async () => {
    if (!selectedRequest) return;
    try {
      setIsConfirming(true);
      await pharmacyService.confirmStockRequest(selectedRequest.id, confirmNotes);
      toast.success("Receipt confirmed — HOD stock updated");
      setShowConfirmModal(false);
      setShowDetailsModal(false);
      setConfirmNotes("");
      await Promise.all([loadRequests(), loadStats()]);
    } catch (err: any) {
      toast.error(err?.apiMessage || err?.message || "Failed to confirm receipt");
    } finally {
      setIsConfirming(false);
    }
  };

  const resetNewRequestModal = () => {
    setRequestItems([]);
    setRequestNotes("");
    setMedicationSearch("");
    setSelectedMedication(null);
    setRequestQuantity("1");
    setFilteredMedications([]);
  };

  const openDetails = (req: StockRequest) => {
    setSelectedRequest(req);
    setShowDetailsModal(true);
  };

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; cls: string; tip?: string }> = {
      pending: {
        label: "Pending",
        cls: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-200",
        tip: "Awaiting Central Store approval",
      },
      approved: {
        label: "Approved",
        cls: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-200",
        tip: "Ready for Central Store to issue",
      },
      fulfilled: {
        label: "Issued (Awaiting Confirm)",
        cls: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200",
        tip: "Stock issued; confirm receipt when received",
      },
      received: {
        label: "Confirmed ✓",
        cls: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-200",
      },
      rejected: {
        label: "Rejected",
        cls: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-200",
      },
      partially_fulfilled: {
        label: "Partially Fulfilled",
        cls: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-200",
      },
    };
    const cfg = map[status] || { label: status, cls: "" };
    const badge = <Badge className={cfg.cls}>{cfg.label}</Badge>;
    return cfg.tip ? (
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>{badge}</TooltipTrigger>
          <TooltipContent>
            <p>{cfg.tip}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    ) : (
      badge
    );
  };

  const statsCards = useMemo(
    () => [
      {
        label: "Total",
        value: stats.total,
        icon: Send,
        color: "text-violet-500",
        bg: "bg-violet-500/10",
      },
      {
        label: "Pending",
        value: stats.pending,
        icon: Clock,
        color: "text-amber-500",
        bg: "bg-amber-500/10",
      },
      {
        label: "Approved",
        value: stats.approved,
        icon: Clock,
        color: "text-blue-500",
        bg: "bg-blue-500/10",
      },
      {
        label: "Confirmed",
        value: stats.confirmed,
        icon: CheckCircle2,
        color: "text-green-500",
        bg: "bg-green-500/10",
        sub: stats.awaitingConfirmation
          ? `Awaiting: ${stats.awaitingConfirmation}`
          : undefined,
      },
    ],
    [stats]
  );

  const requestTitle = (req: StockRequest) => {
    if (requestTab === "incoming") {
      return `${req.from_location || "Store"} → HOD Store`;
    }
    return `HOD Store → ${req.to_location || "Store"}`;
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Package className="h-8 w-8 text-violet-500" />
              HOD Store Requests
            </h1>
            <p className="text-muted-foreground mt-1">
              {requestTab === "incoming"
                ? "Bode Thomas — Order stock from Central Store to HOD store"
                : "Bode Thomas — Transfers from HOD store back to Central Store"}
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline">
              <Link href="/pharmacy/hod-store">HOD Store</Link>
            </Button>
            {requestTab === "incoming" && (
              <Button
                onClick={() => setShowNewRequestModal(true)}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Request
              </Button>
            )}
          </div>
        </div>

        <div className="flex gap-1 p-1 bg-muted rounded-lg w-fit">
          <button
            type="button"
            onClick={() => {
              setRequestTab("incoming");
              setCurrentPage(1);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              requestTab === "incoming"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowDownLeft className="h-4 w-4" />
            Orders to HOD store
          </button>
          <button
            type="button"
            onClick={() => {
              setRequestTab("outgoing");
              setCurrentPage(1);
            }}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              requestTab === "outgoing"
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <ArrowUpRight className="h-4 w-4" />
            To Central Store
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
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="pl-10"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={dateFilter} onValueChange={setDateFilter}>
                  <SelectTrigger className="w-[120px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                    <SelectItem value="all">All Time</SelectItem>
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => {
                    setStatusFilter(v);
                    setCurrentPage(1);
                  }}
                >
                  <SelectTrigger className="w-[180px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
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
                {requestTab === "incoming" && (
                  <p className="text-sm mt-2">
                    Use <span className="font-medium text-foreground">New Request</span> to order from
                    Central Store.
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            requests.map((req) => (
              <Card
                key={req.id}
                className="hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openDetails(req)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    <div className="flex-shrink-0">
                      <Send className="h-8 w-8 text-violet-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">
                            {requestTitle(req)}
                          </span>
                          {getStatusBadge(req.status)}
                        </div>
                        <div
                          className="flex items-center gap-1 flex-shrink-0"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {requestTab === "incoming" &&
                            (req.status === "fulfilled" || req.status === "partially_fulfilled") &&
                            !req.confirmed_at && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setSelectedRequest(req);
                                  setShowConfirmModal(true);
                                }}
                                className="bg-green-600 hover:bg-green-700 h-8"
                              >
                                Confirm
                              </Button>
                            )}
                          <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => openDetails(req)}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{req.request_id}</span>
                        <span>•</span>
                        <span>{req.items?.length || 0} item(s)</span>
                        <span>•</span>
                        <span>{formatDisplayDate(req.created_at)}</span>
                        {req.requested_by_name && (
                          <>
                            <span>•</span>
                            <span>Requested by: {req.requested_by_name}</span>
                          </>
                        )}
                      </div>
                      {req.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                          {req.notes}
                        </p>
                      )}
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
              onItemsPerPageChange={(s) => {
                setItemsPerPage(s);
                setCurrentPage(1);
              }}
              itemName="requests"
              pageSizeOptions={[25, 50, 100]}
            />
          </Card>
        )}

        <Dialog
          open={showNewRequestModal}
          onOpenChange={(open) => {
            setShowNewRequestModal(open);
            if (!open) resetNewRequestModal();
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order from Central Store</DialogTitle>
              <DialogDescription>Request medications from Central Store to HOD store</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <h4 className="font-medium">Add Items to Request</h4>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger>
                        <HelpCircle className="h-4 w-4 text-muted-foreground" />
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>
                          Search by name or code. For packed drugs (e.g. Amatem), enter number of packs —
                          the system converts to tablets/units automatically.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <div className="space-y-3">
                  <div>
                    <Label>Search medication</Label>
                    <Input
                      className="mt-1"
                      value={medicationSearch}
                      onChange={(e) => {
                        setMedicationSearch(e.target.value);
                        setSelectedMedication(null);
                      }}
                      placeholder="Drug name or code"
                    />
                    {filteredMedications.length > 0 && !selectedMedication && (
                      <div className="mt-1 border rounded-md max-h-36 overflow-y-auto">
                        {filteredMedications.map((m) => (
                          <button
                            key={m.id}
                            type="button"
                            className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
                            onClick={() => {
                              setSelectedMedication(m);
                              setMedicationSearch(m.name);
                              setFilteredMedications([]);
                            }}
                          >
                            {m.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  {selectedMedication && (
                    <div>
                      <Label className="text-xs">
                        {(selectedMedication.pack_size ?? 1) > 1
                          ? `Packs (×${selectedMedication.pack_size} units each, max ${Math.floor(MAX_QUANTITY / (selectedMedication.pack_size ?? 1)).toLocaleString()} packs)`
                          : `Quantity (1–${MAX_QUANTITY.toLocaleString()} units)`}
                      </Label>
                      <Input
                        className="mt-1"
                        type="number"
                        min={1}
                        max={
                          (selectedMedication.pack_size ?? 1) > 1
                            ? Math.floor(MAX_QUANTITY / (selectedMedication.pack_size ?? 1))
                            : MAX_QUANTITY
                        }
                        value={requestQuantity}
                        onChange={(e) => setRequestQuantity(e.target.value)}
                        placeholder={(selectedMedication.pack_size ?? 1) > 1 ? "10" : "100"}
                      />
                      {(selectedMedication.pack_size ?? 1) > 1 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {`${Math.max(0, Number.parseInt(requestQuantity || "0", 10) || 0).toLocaleString()} packs = ${(Math.max(0, Number.parseInt(requestQuantity || "0", 10) || 0) * (selectedMedication.pack_size ?? 1)).toLocaleString()} units`}
                        </p>
                      )}
                    </div>
                  )}
                  {selectedMedication && (
                    <Button
                      type="button"
                      onClick={handleAddItem}
                      className="w-full bg-blue-600 hover:bg-blue-700"
                    >
                      <Plus className="h-4 w-4 mr-2" />
                      Add to Request
                    </Button>
                  )}
                  {requestItems.length > 0 && (
                    <div className="mt-4 space-y-2">
                      <p className="text-sm font-medium">Items Added ({requestItems.length})</p>
                      {requestItems.map((item, idx) => (
                        <div
                          key={`${item.medication}-${idx}`}
                          className="flex items-center justify-between p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-900"
                        >
                          <div>
                            <p className="text-sm font-medium">{item.medication_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {formatPackDisplay(item.quantity, item.medication_pack_size)}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setRequestItems(requestItems.filter((_, i) => i !== idx))}
                            className="h-6 w-6 p-0"
                          >
                            ×
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  className="mt-1 resize-none"
                  rows={3}
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g., Urgent restock for department use..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewRequestModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreateRequest}
                disabled={creatingRequest || requestItems.length === 0}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {creatingRequest ? "Submitting..." : "Create Request"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selectedRequest?.request_id}</DialogTitle>
              <DialogDescription>
                {selectedRequest
                  ? `${selectedRequest.from_location} → ${selectedRequest.to_location}`
                  : ""}
              </DialogDescription>
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
                  {selectedRequest.requested_by_name && (
                    <div>
                      <p className="text-muted-foreground">Requested By</p>
                      <p className="font-medium">{selectedRequest.requested_by_name}</p>
                    </div>
                  )}
                </div>
                {selectedRequest.confirmed_at && (
                  <div className="bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-lg p-3">
                    <p className="text-sm font-medium mb-1 text-green-800 dark:text-green-200">
                      ✓ Receipt Confirmed
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      Confirmed by: {selectedRequest.confirmed_by_name}
                    </p>
                    <p className="text-xs text-green-700 dark:text-green-300">
                      On: {formatDisplayDateTime(selectedRequest.confirmed_at)}
                    </p>
                  </div>
                )}
                {selectedRequest.notes && (
                  <div>
                    <p className="text-sm font-medium mb-1">Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedRequest.notes}</p>
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium mb-2">
                    Items ({selectedRequest.items?.length || 0})
                  </p>
                  <div className="space-y-2">
                    {(selectedRequest.items || []).map((item, idx) => (
                      <div
                        key={item.id ?? idx}
                        className="border rounded-lg p-3 text-sm flex justify-between items-start"
                      >
                        <div>
                          <p className="font-medium">{item.medication_name || "Unknown"}</p>
                          <p className="text-xs text-muted-foreground">
                            Requested:{" "}
                            {formatPackDisplay(Number(item.quantity), packSizeForStockItem(item))}
                          </p>
                        </div>
                        {Number(item.fulfilled_quantity) > 0 && (
                          <span className="text-xs font-medium text-green-600">
                            ✓{" "}
                            {formatPackDisplay(
                              Number(item.fulfilled_quantity),
                              packSizeForStockItem(item)
                            )}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
                    Close
                  </Button>
                  {requestTab === "incoming" &&
                    (selectedRequest.status === "fulfilled" ||
                      selectedRequest.status === "partially_fulfilled") &&
                    !selectedRequest.confirmed_at && (
                      <Button
                        onClick={() => setShowConfirmModal(true)}
                        className="bg-green-600 hover:bg-green-700"
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Confirm Receipt
                      </Button>
                    )}
                </DialogFooter>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Confirm Stock Receipt</DialogTitle>
              <DialogDescription>Verify that HOD store received the issued stock</DialogDescription>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="font-medium mb-2">Request: {selectedRequest.request_id}</p>
                  <div className="space-y-1 text-xs">
                    {(selectedRequest.items || []).map((item, idx) => (
                      <div key={item.id ?? idx} className="flex justify-between gap-3">
                        <span>{item.medication_name}</span>
                        <span className="font-medium">
                          {formatPackDisplay(
                            Number(item.fulfilled_quantity || item.quantity),
                            packSizeForStockItem(item)
                          )}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Confirmation Notes (optional)</Label>
                  <Textarea
                    placeholder="e.g., All items received in good condition..."
                    value={confirmNotes}
                    onChange={(e) => setConfirmNotes(e.target.value)}
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowConfirmModal(false)} disabled={isConfirming}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleConfirmReceipt}
                    disabled={isConfirming}
                    className="bg-green-600 hover:bg-green-700"
                  >
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
