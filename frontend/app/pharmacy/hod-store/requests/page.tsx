"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePharmacyPageAuth } from "@/hooks/use-pharmacy-page-auth";
import { formatPackDisplay, packSizeForStockItem } from "@/lib/pharmacy/stock-request-quantity";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type Medication } from "@/lib/services";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import {
  localMonthBounds,
  localWeekToTodayBounds,
  todayApiDateString,
} from "@/lib/dates";
import { StockRequestListCard } from "@/components/pharmacy/StockRequestListCard";
import { StockRequestDetailDialog } from "@/components/pharmacy/StockRequestDetailDialog";
import { StockRequestItemsBuilder } from "@/components/pharmacy/StockRequestItemsBuilder";
import {
  Send,
  Search,
  Plus,
  CheckCircle2,
  Clock,
  Loader2,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
} from "lucide-react";

type RequestTab = "incoming" | "outgoing";

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

  const [requestItems, setRequestItems] = useState<Array<{ medication: number; quantity: number }>>([]);
  const [requestNotes, setRequestNotes] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [medicationCache, setMedicationCache] = useState<Record<number, Medication>>({});
  const learnMedication = useCallback((med: Medication) => {
    setMedicationCache((prev) => ({ ...prev, [med.id]: med }));
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
  };

  const openDetails = (req: StockRequest) => {
    setSelectedRequest(req);
    setShowDetailsModal(true);
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
              <StockRequestListCard
                key={req.id}
                request={req}
                role="requester"
                onOpen={openDetails}
                onConfirm={
                  requestTab === "incoming"
                    ? (r) => {
                        setSelectedRequest(r);
                        setShowConfirmModal(true);
                      }
                    : undefined
                }
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
            if (!open) resetNewRequestModal();
            setShowNewRequestModal(open);
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Order from Central Store</DialogTitle>
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
                addButtonClassName="bg-violet-600 hover:bg-violet-700"
              />
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
          onConfirm={
            requestTab === "incoming" ? () => setShowConfirmModal(true) : undefined
          }
        />

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
