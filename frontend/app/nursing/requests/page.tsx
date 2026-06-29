"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { pharmacyService, type StockRequest, type Medication } from "@/lib/services";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import { localMonthBounds, localWeekToTodayBounds, todayApiDateString } from "@/lib/dates";
import { StockRequestListCard } from "@/components/pharmacy/StockRequestListCard";
import { StockRequestDetailDialog } from "@/components/pharmacy/StockRequestDetailDialog";
import { StockRequestItemsBuilder } from "@/components/pharmacy/StockRequestItemsBuilder";
import { Send, Search, Plus, CheckCircle2, Clock, Loader2, Package, ArrowLeft } from "lucide-react";
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import { useNursingPageAuth } from '@/hooks/use-nursing-page-auth';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import {
  formatPackDisplay,
  packSizeForRequestItem,
} from '@/lib/pharmacy/stock-request-quantity';

type CatalogTab = "all" | "iv_fluids" | "injectables" | "wound" | "consumables";

const IV_FLUID_CATEGORIES = new Set([
  "IVFluids",
  "Electrolytes",
  "ParenteralNutrition",
  "PlasmaSubstitutes",
  "Dialysis",
  "PeritonealDialysis",
]);
const WOUND_CATEGORIES = new Set(["WoundCare", "Antiseptics", "Dermatological"]);

function medicationMatchesCatalog(m: Medication, tab: CatalogTab): boolean {
  if (tab === "all") return true;
  const cat = m.category || "";
  const form = (m.form || "").toLowerCase();
  if (tab === "iv_fluids") return IV_FLUID_CATEGORIES.has(cat);
  if (tab === "injectables") {
    return (
      form.includes("inject") ||
      form.includes("ampoule") ||
      ["Vaccines", "Biologicals", "Insulin", "Anticoagulants"].some((k) => cat.includes(k) || cat === k)
    );
  }
  if (tab === "wound") return WOUND_CATEGORIES.has(cat);
  if (tab === "consumables") {
    return (
      ["OralRehydration", "NasalDecongestants", "ThroatLozenges", "Nutritional"].includes(cat) ||
      form.includes("syringe") ||
      form.includes("needle")
    );
  }
  return true;
}

export default function NursingRequestsPage() {
  const { ready, handleAuthError } = useNursingPageAuth();
  const [loading, setLoading] = useState(true);
  const [requests, setRequests] = useState<StockRequest[]>([]);
  const [totalRequests, setTotalRequests] = useState(0);
  const [medicationLookup, setMedicationLookup] = useState<Record<number, Medication>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFilter, setDateFilter] = useState("all");
  const [showNewRequestModal, setShowNewRequestModal] = useState(false);
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [isConfirming, setIsConfirming] = useState(false);

  const [requestItems, setRequestItems] = useState<Array<{ medication: number; quantity: number }>>([]);
  const [requestNotes, setRequestNotes] = useState("");
  const [creatingRequest, setCreatingRequest] = useState(false);
  const [catalogTab, setCatalogTab] = useState<CatalogTab>("all");
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 300);
  const learnMedication = useCallback((med: Medication) => {
    setMedicationLookup((prev) => ({ ...prev, [med.id]: med }));
  }, []);
  const catalogFilter = useCallback(
    (med: Medication) => medicationMatchesCatalog(med, catalogTab),
    [catalogTab],
  );
  const catalogSearchHeader = useMemo(
    () => (
      <div>
        <Label className="text-xs text-muted-foreground">Requisition catalog (narrows search)</Label>
        <div className="flex flex-wrap gap-2 mt-1">
          {(
            [
              ["all", "All items"],
              ["iv_fluids", "IV fluids / electrolytes"],
              ["injectables", "Injectables"],
              ["wound", "Wound care"],
              ["consumables", "Consumables / ORS"],
            ] as const
          ).map(([id, label]) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={catalogTab === id ? "default" : "outline"}
              className="h-8 text-xs"
              onClick={() => setCatalogTab(id as CatalogTab)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    ),
    [catalogTab],
  );
  const [stats, setStats] = useState({ total: 0, pending: 0, approved: 0, confirmed: 0, awaitingConfirmation: 0 });

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
    void loadStats();
  }, [ready, debouncedSearchQuery, dateFilter]);

  useEffect(() => {
    if (!ready) return;
    void loadRequests();
  }, [ready, currentPage, itemsPerPage, statusFilter, debouncedSearchQuery, dateFilter]);

  const loadRequests = async () => {
    try {
      setLoading(true);
      const params: Record<string, string | number> = {
        page: currentPage,
        page_size: itemsPerPage,
        to_location: PHARMACY_LOCATIONS.WARD_CARE,
      };
      if (statusFilter !== "all") params.status = statusFilter;
      if (debouncedSearchQuery.trim()) params.search = debouncedSearchQuery.trim();
      Object.assign(params, buildDateParams());
      const response = await pharmacyService.getStockRequests(params);
      setRequests(response.results || []);
      setTotalRequests(response.count ?? response.results?.length ?? 0);
    } catch (err) {
      console.error("Error loading nursing requests:", err);
      if (handleAuthError(err)) return;
      toast.error("Failed to load requests");
    } finally {
      setLoading(false);
    }
  };

  const loadStats = async () => {
    try {
      const baseParams: Record<string, string> = {
        to_location: PHARMACY_LOCATIONS.WARD_CARE,
      };
      if (debouncedSearchQuery.trim()) baseParams.search = debouncedSearchQuery.trim();
      Object.assign(baseParams, buildDateParams());
      const stats = await pharmacyService.getStockRequestListStats(baseParams);
      setStats({
        total: stats.total,
        pending: stats.pending,
        approved: stats.approved,
        confirmed: stats.confirmed,
        awaitingConfirmation: stats.awaitingConfirmation,
      });
    } catch (err) {
      console.error("Error loading nursing request stats:", err);
      if (handleAuthError(err)) return;
      toast.error("Failed to load request statistics");
    }
  };

  const closeNewRequestModal = () => {
    setShowNewRequestModal(false);
    setRequestItems([]);
    setRequestNotes("");
    setCatalogTab("all");
  };

  const handleCreateRequest = async () => {
    if (requestItems.length === 0) { toast.error("Please add at least one medication"); return; }
    try {
      setCreatingRequest(true);
      await pharmacyService.createNursingStockRequest({ items: requestItems, notes: requestNotes });
      toast.success("Drug request submitted to Dispensary");
      closeNewRequestModal();
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
      const res = await pharmacyService.confirmStockRequest(selectedRequest.id, confirmNotes);
      toast.success("Stock receipt confirmed! Ward stock updated.");
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

  const packSizeForItem = (item: { medication_pack_size?: number | null; medication?: number }) =>
    packSizeForRequestItem(item, Object.values(medicationLookup));

  const statsCards = useMemo(() => [
    { label: "Total", value: stats.total, icon: Send, color: "text-teal-500", bg: "bg-teal-500/10" },
    { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-500", bg: "bg-amber-500/10" },
    { label: "Approved", value: stats.approved, icon: Clock, color: "text-blue-500", bg: "bg-blue-500/10" },
    { label: "Confirmed", value: stats.confirmed, icon: CheckCircle2, color: "text-green-500", bg: "bg-green-500/10", sub: stats.awaitingConfirmation ? `Awaiting: ${stats.awaitingConfirmation}` : undefined },
  ], [stats]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Send className="h-8 w-8 text-teal-500" />
              Drug Requests
            </h1>
            <p className="text-muted-foreground mt-1">Request medications from Central Store to Ward Care</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/nursing/inventory">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Ward Stock
              </Link>
            </Button>
            <Button onClick={() => setShowNewRequestModal(true)} className="bg-teal-600 hover:bg-teal-700">
              <Plus className="h-4 w-4 mr-2" />
              New Request
            </Button>
          </div>
        </div>

        {/* Stats */}
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

        {/* Awaiting Confirmation Alert */}
        {stats.awaitingConfirmation > 0 && (
          <Card className="bg-gradient-to-r from-yellow-50 to-teal-50 dark:from-yellow-900/20 dark:to-teal-900/20 border-yellow-200 dark:border-yellow-800">
            <CardContent className="p-4 flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 text-yellow-600 flex-shrink-0" />
              <p className="text-sm text-yellow-800 dark:text-yellow-300">
                <span className="font-semibold">{stats.awaitingConfirmation}</span> request(s) issued by Dispensary — confirm receipt to update ward stock.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
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
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="w-[200px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="approved">Approved</SelectItem>
                    <SelectItem value="fulfilled">Issued (Awaiting Confirm)</SelectItem>
                    <SelectItem value="partially_fulfilled">Partially Fulfilled</SelectItem>
                    <SelectItem value="received">Confirmed</SelectItem>
                    <SelectItem value="rejected">Rejected</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{requests.length}</span> of{" "}
            <span className="font-medium text-foreground">{totalRequests}</span> requests
          </p>
        </div>

        {/* Requests List */}
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
                <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="font-medium mb-1">No requests found</p>
                <p className="text-sm mb-4">Submit a request to get medications from the Dispensary</p>
                <Button onClick={() => setShowNewRequestModal(true)} className="bg-teal-600 hover:bg-teal-700">
                  <Plus className="h-4 w-4 mr-2" />
                  New Request
                </Button>
              </CardContent>
            </Card>
          ) : (
            requests.map((req) => (
              <StockRequestListCard
                key={req.id}
                request={req}
                role="requester"
                medications={Object.values(medicationLookup)}
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

        {/* New Request Modal */}
        <Dialog
          open={showNewRequestModal}
          onOpenChange={(open) => {
            if (!open) closeNewRequestModal();
            else setShowNewRequestModal(true);
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Request Drugs from Central Store</DialogTitle>
              <DialogDescription>
                Add one or more drugs to the list below, then submit a single request to Central Store for Ward Care stock.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <StockRequestItemsBuilder
                key={showNewRequestModal ? "open" : "closed"}
                items={requestItems}
                onItemsChange={setRequestItems}
                medicationCache={medicationLookup}
                onMedicationLearned={learnMedication}
                defaultQuantity="10"
                addButtonClassName="bg-teal-600 hover:bg-teal-700"
                searchHeader={catalogSearchHeader}
                filterMedication={catalogFilter}
              />
              <div>
                <Label>Notes (optional)</Label>
                <Textarea
                  value={requestNotes}
                  onChange={(e) => setRequestNotes(e.target.value)}
                  placeholder="e.g., Urgent, for post-op ward patients..."
                  className="mt-1 resize-none"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={closeNewRequestModal}>Cancel</Button>
              <Button
                onClick={handleCreateRequest}
                disabled={creatingRequest || requestItems.length === 0}
                className="bg-teal-600 hover:bg-teal-700"
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
          medications={Object.values(medicationLookup)}
          description={
            selectedRequest
              ? `${selectedRequest.request_id} · Central Store → Ward Care`
              : undefined
          }
          onConfirm={() => {
            setShowDetailsModal(false);
            setShowConfirmModal(true);
          }}
        />

        {/* Confirm Receipt Modal */}
        <Dialog open={showConfirmModal} onOpenChange={setShowConfirmModal}>
          <DialogContent className={MODAL_SIZES.sm2}>
            <DialogHeader>
              <DialogTitle>Confirm Stock Receipt</DialogTitle>
              <DialogDescription>Verify you have received the issued medications into the ward</DialogDescription>
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
                <div className="bg-teal-50 dark:bg-teal-950/30 border border-teal-200 dark:border-teal-900 rounded-lg p-3 text-sm text-teal-800 dark:text-teal-300">
                  Confirming receipt will add these medications to your Ward Care stock from Central Store.
                </div>
                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea placeholder="e.g., All items received in good condition..." value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} rows={3} className="mt-1" />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowConfirmModal(false)} disabled={isConfirming}>Cancel</Button>
                  <Button onClick={handleConfirmReceipt} disabled={isConfirming} className="bg-green-600 hover:bg-green-700">
                    {isConfirming ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Confirming...</> : "Confirm Receipt"}
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
