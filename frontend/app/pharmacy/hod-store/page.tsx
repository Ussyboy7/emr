"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePharmacyPageAuth } from "@/hooks/use-pharmacy-page-auth";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  defaultEntryModeForMedication,
  PharmacyPackQuantityFields,
} from "@/components/pharmacy/PharmacyPackQuantityFields";
import {
  asPackQuantityMedication,
  formatPackDisplay,
  getPackSize,
  resolvePackSize,
  toInventoryUnits,
  type QuantityEntryMode,
} from "@/lib/pharmacy/dispense-quantity";
import {
  pharmacyService,
  type Medication,
  type MedicationInventory,
} from "@/lib/services";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import { MEDICATION_CATEGORIES } from "@/lib/constants/pharmacy";
import { joinDisplayParts } from "@/lib/utils/clinic-utils";
import {
  Package,
  Search,
  TrendingUp,
  AlertTriangle,
  Loader2,
  Eye,
  Send,
  Layers,
  Pill,
  Clock,
  XCircle,
  Hash,
} from "lucide-react";

interface MedicationWithStock {
  id: number;
  name: string;
  generic?: Medication["generic"];
  generic_name?: string;
  strength?: string;
  form?: string;
  category?: string;
  packSize?: number;
  pack_size?: number;
  dispense_mode?: Medication["dispense_mode"];
  unit?: string;
  storeQuantity: number;
  minimumStock: number;
  batches: MedicationInventory[];
  batchCount?: number;
  nearestExpiry?: string;
}

function mapStoreStockRow(
  row: Medication & {
    store_quantity?: string | number;
    nearest_expiry?: string | null;
    batch_count?: number;
  }
): MedicationWithStock {
  const sq = Number(row.store_quantity ?? 0);
  const packSize = resolvePackSize(row);
  return {
    id: row.id,
    name: row.name || "Unknown",
    generic: row.generic,
    generic_name: row.generic_name || row.generic?.name || "",
    strength: row.strength || "",
    form: row.form || "",
    category: row.category || "",
    packSize,
    pack_size: packSize,
    dispense_mode: row.dispense_mode,
    unit: row.unit,
    storeQuantity: sq,
    minimumStock: Number(row.min_stock_level ?? 0),
    batches: [],
    batchCount: typeof row.batch_count === "number" ? row.batch_count : 0,
    nearestExpiry: row.nearest_expiry || "",
  };
}

const ISSUE_REASONS = [
  "Department use",
  "Emergency supply",
  "Patient support",
  "Training / demonstration",
  "Other",
];

const EXPIRY_WARNING_DAYS = 180;
const location = PHARMACY_LOCATIONS.HOD_STORE;

export default function HodStorePage() {
  const { ready, handleAuthError } = usePharmacyPageAuth();

  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [storeInventory, setStoreInventory] = useState<MedicationWithStock[]>([]);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const debouncedInventorySearch = useDebouncedValue(inventorySearchQuery, 300);
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [stockFilter, setStockFilter] = useState("all");
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);
  const [inventoryItemsPerPage, setInventoryItemsPerPage] = useState(DEFAULT_LIST_PAGE_SIZE);
  const [inventoryTotalCount, setInventoryTotalCount] = useState(0);
  const [storeStats, setStoreStats] = useState({
    totalMedications: 0,
    outOfStock: 0,
    lowStock: 0,
    expiringSoon: 0,
    expired: 0,
    totalUnits: 0,
  });

  const [selectedMedication, setSelectedMedication] = useState<MedicationWithStock | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);

  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueBatches, setIssueBatches] = useState<MedicationInventory[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState("auto");
  const [issueQty, setIssueQty] = useState("1");
  const [issueEntryMode, setIssueEntryMode] = useState<QuantityEntryMode>("pack");
  const [patientName, setPatientName] = useState("");
  const [patientMrn, setPatientMrn] = useState("");
  const [issueReason, setIssueReason] = useState(ISSUE_REASONS[0]);
  const [issueNotes, setIssueNotes] = useState("");
  const [issuing, setIssuing] = useState(false);

  const categories = useMemo(() => MEDICATION_CATEGORIES, []);

  const packMed = (med: MedicationWithStock) => asPackQuantityMedication(med);

  const loadStoreStats = useCallback(async () => {
    try {
      const s = await pharmacyService.getStoreStockStats({ location });
      setStoreStats({
        totalMedications: s.total_medications ?? 0,
        outOfStock: s.out_of_stock ?? 0,
        lowStock: s.low_stock ?? 0,
        expiringSoon: s.near_expiry ?? 0,
        expired: s.expired ?? 0,
        totalUnits: Number(s.total_units ?? 0),
      });
    } catch (e) {
      if (handleAuthError(e)) return;
      console.error("Error loading HOD store stats:", e);
    }
  }, [handleAuthError]);

  const loadStorePage = useCallback(async () => {
    try {
      setInventoryLoading(true);
      const res = await pharmacyService.getStoreStockSummary({
        location,
        page: inventoryCurrentPage,
        page_size: inventoryItemsPerPage,
        search: debouncedInventorySearch.trim() || undefined,
        category: categoryFilter === "All Categories" ? undefined : categoryFilter,
        stock_status: stockFilter === "all" ? undefined : stockFilter,
      });
      setStoreInventory(
        (res.results || []).map((r) =>
          mapStoreStockRow(
            r as Medication & {
              store_quantity?: string | number;
              nearest_expiry?: string | null;
              batch_count?: number;
            }
          )
        )
      );
      setInventoryTotalCount(typeof res.count === "number" ? res.count : (res.results || []).length);
    } catch (err) {
      if (handleAuthError(err)) return;
      console.error("Error loading HOD store inventory:", err);
      toast.error("Failed to load HOD store inventory");
    } finally {
      setInventoryLoading(false);
    }
  }, [
    inventoryCurrentPage,
    inventoryItemsPerPage,
    debouncedInventorySearch,
    categoryFilter,
    stockFilter,
    handleAuthError,
  ]);

  useEffect(() => {
    if (!ready) return;
    void loadStoreStats();
  }, [loadStoreStats, ready]);

  useEffect(() => {
    if (!ready) return;
    void loadStorePage();
  }, [loadStorePage, ready]);

  useEffect(() => {
    setInventoryCurrentPage(1);
  }, [debouncedInventorySearch, categoryFilter, stockFilter, inventoryItemsPerPage]);

  const fetchBatchesForMedication = useCallback(async (med: MedicationWithStock) => {
    const res = await pharmacyService.getInventory({
      medication: String(med.id),
      location,
      page_size: MAX_LIST_PAGE_SIZE,
    });
    return res.results || [];
  }, []);

  const getDaysUntilExpiry = (expiryDate: string) => {
    if (!expiryDate) return 9999;
    const today = new Date();
    const expiry = new Date(expiryDate);
    if (Number.isNaN(expiry.getTime())) return 9999;
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getNearestExpiryForMedication = (med: MedicationWithStock) => {
    if (med.batches?.length) {
      const sorted = med.batches
        .slice()
        .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
      return sorted[0]?.expiry_date || "";
    }
    return med.nearestExpiry || "";
  };

  const getStockStatus = (med: MedicationWithStock) => {
    if (med.storeQuantity === 0) return "Out of Stock";
    if (med.storeQuantity <= med.minimumStock) return "Low Stock";
    return "In Stock";
  };

  const getStockColor = (status: string) => {
    switch (status) {
      case "Out of Stock":
        return "bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400";
      case "Low Stock":
        return "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400";
      case "In Stock":
        return "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400";
    }
  };

  const handleViewDetails = async (med: MedicationWithStock) => {
    setSelectedMedication(med);
    setShowDetailsModal(true);
    if (!med.batches?.length && (med.batchCount ?? 0) > 0) {
      const batches = await fetchBatchesForMedication(med);
      setSelectedMedication((prev) => (prev?.id === med.id ? { ...prev, batches } : prev));
    }
  };

  const handleViewBatches = async (med: MedicationWithStock) => {
    setSelectedMedication({ ...med, batches: [] });
    setShowBatchesModal(true);
    const batches = await fetchBatchesForMedication(med);
    setSelectedMedication((prev) => (prev?.id === med.id ? { ...prev, batches } : prev));
  };

  const resetIssueForm = () => {
    setSelectedBatchId("auto");
    setIssueQty("1");
    setIssueEntryMode("pack");
    setPatientName("");
    setPatientMrn("");
    setIssueReason(ISSUE_REASONS[0]);
    setIssueNotes("");
    setIssueBatches([]);
  };

  const openIssueFor = async (med: MedicationWithStock) => {
    if (med.storeQuantity <= 0) {
      toast.error("No stock available for this medication");
      return;
    }
    setSelectedMedication(med);
    resetIssueForm();
    setIssueEntryMode(defaultEntryModeForMedication(packMed(med)));
    setShowIssueModal(true);
    try {
      const batches = await fetchBatchesForMedication(med);
      setIssueBatches(batches.filter((b) => Number(b.quantity) > 0));
    } catch {
      setIssueBatches([]);
    }
  };

  const availableIssueStock = useMemo(() => {
    if (issueBatches.length > 0) {
      return issueBatches.reduce((sum, b) => sum + Number(b.quantity || 0), 0);
    }
    return selectedMedication?.storeQuantity ?? 0;
  }, [issueBatches, selectedMedication]);

  const handleIssue = async () => {
    if (!selectedMedication) return;
    const displayQty = Number(issueQty);
    if (!Number.isFinite(displayQty) || displayQty <= 0) {
      toast.error("Enter a valid quantity");
      return;
    }
    let inventoryQty: number;
    try {
      inventoryQty = toInventoryUnits(displayQty, packMed(selectedMedication), issueEntryMode);
    } catch (err: any) {
      toast.error(err?.message || "Invalid quantity for this medication");
      return;
    }
    if (inventoryQty > availableIssueStock) {
      toast.error("Quantity exceeds available HOD stock");
      return;
    }
    try {
      setIssuing(true);
      await pharmacyService.createHodStockIssue({
        medication: selectedMedication.id,
        quantity: inventoryQty,
        quantity_entry_mode: issueEntryMode,
        inventory_item_id:
          selectedBatchId !== "auto" ? Number(selectedBatchId) : undefined,
        patient_name: patientName.trim(),
        patient_mrn: patientMrn.trim(),
        reason: issueReason,
        notes: issueNotes.trim(),
      });
      toast.success("Medication issued from HOD store");
      setShowIssueModal(false);
      resetIssueForm();
      setSelectedMedication(null);
      await Promise.all([loadStorePage(), loadStoreStats()]);
    } catch (err: any) {
      toast.error(err?.apiMessage || err?.message || "Failed to issue medication");
    } finally {
      setIssuing(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Package className="h-8 w-8 text-violet-500" />
              HOD Store &mdash; Bode Thomas Clinic
            </h1>
            <p className="text-muted-foreground mt-1">
              Pharmacy Head inventory — view stock, batches, and discretionary issues
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Button asChild variant="outline">
              <Link href="/pharmacy/hod-store/history">Dispense History</Link>
            </Button>
            <Button asChild className="bg-violet-600 hover:bg-violet-700">
              <Link href="/pharmacy/hod-store/requests">
                <Send className="h-4 w-4 mr-2" />
                HOD Requests
              </Link>
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Items</p>
                    <p className="text-2xl sm:text-3xl font-bold text-violet-600">
                      {storeStats.totalMedications}
                    </p>
                  </div>
                  <Package className="h-6 w-6 text-violet-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={storeStats.outOfStock > 0 ? "border-red-200 dark:border-red-800" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Out of Stock</p>
                    <p
                      className={`text-2xl sm:text-3xl font-bold ${
                        storeStats.outOfStock > 0 ? "text-red-600" : "text-green-600"
                      }`}
                    >
                      {storeStats.outOfStock}
                    </p>
                  </div>
                  <XCircle
                    className={`h-6 w-6 ${
                      storeStats.outOfStock > 0 ? "text-red-500" : "text-green-500"
                    }`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Low Stock</p>
                    <p
                      className={`text-2xl sm:text-3xl font-bold ${
                        storeStats.lowStock > 0 ? "text-amber-600" : "text-green-600"
                      }`}
                    >
                      {storeStats.lowStock}
                    </p>
                  </div>
                  <AlertTriangle
                    className={`h-6 w-6 ${
                      storeStats.lowStock > 0 ? "text-amber-500" : "text-green-500"
                    }`}
                  />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Units</p>
                    <p className="text-2xl sm:text-3xl font-bold text-emerald-600">
                      {storeStats.totalUnits.toLocaleString()}
                    </p>
                  </div>
                  <TrendingUp className="h-6 w-6 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {(storeStats.outOfStock > 0 ||
            storeStats.lowStock > 0 ||
            storeStats.expiringSoon > 0 ||
            storeStats.expired > 0) && (
            <Card className="bg-gradient-to-r from-amber-50 to-red-50 dark:from-amber-900/20 dark:to-red-900/20 border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    <div>
                      <p className="font-medium text-amber-800 dark:text-amber-400">Stock Alerts</p>
                      <p className="text-sm text-amber-700 dark:text-amber-500">
                        {storeStats.outOfStock > 0 && `${storeStats.outOfStock} item(s) out of stock. `}
                        {storeStats.lowStock > 0 && `${storeStats.lowStock} item(s) running low. `}
                        {storeStats.expiringSoon > 0 &&
                          `${storeStats.expiringSoon} item(s) near expiry (<= ${EXPIRY_WARNING_DAYS} days). `}
                        {storeStats.expired > 0 && `${storeStats.expired} item(s) already expired. `}
                        Order from Central Store via HOD Requests if restocking is needed.
                      </p>
                    </div>
                  </div>
                  {storeStats.expiringSoon > 0 && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-amber-300 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:text-amber-300"
                      onClick={() => setStockFilter("near_expiry")}
                    >
                      View Near Expiry
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <Label>Search</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by medication name or generic name..."
                      value={inventorySearchQuery}
                      onChange={(e) => setInventorySearchQuery(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                <div>
                  <Label>Category</Label>
                  <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[300px]">
                      {categories.map((cat) => (
                        <SelectItem key={cat.value} value={cat.value}>
                          {cat.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Stock Status</Label>
                  <Select value={stockFilter} onValueChange={setStockFilter}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="out">Out of Stock</SelectItem>
                      <SelectItem value="low">Low Stock</SelectItem>
                      <SelectItem value="near_expiry">Near Expiry</SelectItem>
                      <SelectItem value="normal">In Stock</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="space-y-3">
            {inventoryLoading ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                  <p>Loading HOD store inventory...</p>
                </CardContent>
              </Card>
            ) : storeInventory.length > 0 ? (
              storeInventory.map((med) => {
                const stockStatus = getStockStatus(med);
                const nearestExpiry = getNearestExpiryForMedication(med);
                const daysUntilExpiry = nearestExpiry ? getDaysUntilExpiry(nearestExpiry) : 9999;

                return (
                  <Card
                    key={med.id}
                    className={`border-l-4 hover:shadow-md transition-shadow ${
                      stockStatus === "Out of Stock"
                        ? "border-l-red-500"
                        : stockStatus === "Low Stock"
                          ? "border-l-amber-500"
                          : "border-l-violet-500"
                    }`}
                  >
                    <CardContent className="py-3 px-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                            stockStatus === "Out of Stock"
                              ? "bg-red-100 dark:bg-red-900/30"
                              : stockStatus === "Low Stock"
                                ? "bg-amber-100 dark:bg-amber-900/30"
                                : "bg-emerald-100 dark:bg-emerald-900/30"
                          }`}
                        >
                          <Pill
                            className={`h-4 w-4 ${
                              stockStatus === "Out of Stock"
                                ? "text-red-600"
                                : stockStatus === "Low Stock"
                                  ? "text-amber-600"
                                  : "text-emerald-600"
                            }`}
                          />
                        </div>

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2 flex-wrap min-w-0">
                              <span className="font-semibold text-foreground truncate">{med.name}</span>
                              {med.strength && (
                                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                                  {med.strength}
                                </Badge>
                              )}
                              <Badge
                                variant="outline"
                                className={`text-[10px] px-1.5 py-0 ${getStockColor(stockStatus)}`}
                              >
                                {stockStatus}
                              </Badge>
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {formatPackDisplay(med.storeQuantity, med.packSize)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleViewDetails(med)}
                                title="View Details"
                              >
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => handleViewBatches(med)}
                                title="View Batches"
                              >
                                <Layers className="h-4 w-4 text-muted-foreground hover:text-violet-500" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 w-7 p-0"
                                onClick={() => openIssueFor(med)}
                                title="Issue from HOD store"
                                disabled={med.storeQuantity <= 0}
                              >
                                <Send className="h-4 w-4 text-muted-foreground hover:text-violet-600" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>
                              {joinDisplayParts([
                                med.generic_name,
                                med.category,
                                med.form,
                                `${med.batchCount ?? med.batches.length} batch(es)`,
                              ])}
                            </span>
                            {nearestExpiry && (
                              <span
                                className={`inline-flex items-center gap-1 ${
                                  daysUntilExpiry <= EXPIRY_WARNING_DAYS
                                    ? "text-amber-600 dark:text-amber-400"
                                    : ""
                                } ${daysUntilExpiry < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                              >
                                <Clock className="h-3 w-3" />
                                {daysUntilExpiry < 0
                                  ? "Expired"
                                  : daysUntilExpiry <= 30
                                    ? `${daysUntilExpiry}d`
                                    : nearestExpiry}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })
            ) : (
              <Card>
                <CardContent className="py-12 text-center text-muted-foreground">
                  <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No medications found</p>
                  <p className="text-sm mt-2">
                    Request stock from Central Store via{" "}
                    <Link href="/pharmacy/hod-store/requests" className="text-violet-600 underline">
                      HOD Requests
                    </Link>
                    .
                  </p>
                </CardContent>
              </Card>
            )}
          </div>

          {inventoryTotalCount > 0 && (
            <Card className="p-4">
              <StandardPagination
                currentPage={inventoryCurrentPage}
                totalItems={inventoryTotalCount}
                itemsPerPage={inventoryItemsPerPage}
                onPageChange={setInventoryCurrentPage}
                onItemsPerPageChange={(newSize) => {
                  setInventoryItemsPerPage(newSize);
                  setInventoryCurrentPage(1);
                }}
                itemName="medications"
              />
            </Card>
          )}
        </div>

        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <span className="truncate">{selectedMedication?.name}</span>
                {selectedMedication && (
                  <Badge
                    variant="outline"
                    className={`text-[10px] px-2 py-0.5 ${getStockColor(getStockStatus(selectedMedication))}`}
                  >
                    {getStockStatus(selectedMedication)}
                  </Badge>
                )}
              </DialogTitle>
            </DialogHeader>
            {selectedMedication && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">ID</p>
                    <p className="font-medium">{selectedMedication.id}</p>
                  </div>
                  {(selectedMedication.generic_name || selectedMedication.generic?.name) && (
                    <div>
                      <p className="text-muted-foreground">Generic Name</p>
                      <p className="font-medium">
                        {selectedMedication.generic_name || selectedMedication.generic?.name}
                      </p>
                    </div>
                  )}
                  {selectedMedication.category && (
                    <div>
                      <p className="text-muted-foreground">Category</p>
                      <p className="font-medium">{selectedMedication.category}</p>
                    </div>
                  )}
                  {selectedMedication.strength && (
                    <div>
                      <p className="text-muted-foreground">Strength</p>
                      <p className="font-medium">{selectedMedication.strength}</p>
                    </div>
                  )}
                  {selectedMedication.form && (
                    <div>
                      <p className="text-muted-foreground">Form</p>
                      <p className="font-medium">{selectedMedication.form}</p>
                    </div>
                  )}
                  <div>
                    <p className="text-muted-foreground">Total Stock</p>
                    <p className="font-medium text-lg">{selectedMedication.storeQuantity}</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-medium mb-3">Stock Levels</h4>
                    <div className="grid grid-cols-2 gap-4 text-center mb-3">
                      <div>
                        <p className="text-2xl font-bold text-foreground">
                          {formatPackDisplay(
                            selectedMedication.storeQuantity,
                            selectedMedication.packSize
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">Current</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">
                          {formatPackDisplay(
                            selectedMedication.minimumStock,
                            selectedMedication.packSize
                          )}
                        </p>
                        <p className="text-xs text-muted-foreground">Minimum</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Expiry Information</h4>
                    {getNearestExpiryForMedication(selectedMedication) ? (
                      <p className="text-sm">
                        <span className="text-muted-foreground">Expiry Date:</span>{" "}
                        <span className="font-medium">
                          {getNearestExpiryForMedication(selectedMedication)}
                        </span>
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">No expiry data</p>
                    )}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
                Close
              </Button>
              <Button
                variant="outline"
                onClick={() => selectedMedication && handleViewBatches(selectedMedication)}
              >
                <Layers className="h-4 w-4 mr-2" />
                View Batches
              </Button>
              <Button
                onClick={() => selectedMedication && openIssueFor(selectedMedication)}
                className="bg-violet-600 hover:bg-violet-700"
                disabled={!selectedMedication || selectedMedication.storeQuantity <= 0}
              >
                <Send className="h-4 w-4 mr-2" />
                Issue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showBatchesModal} onOpenChange={setShowBatchesModal}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-violet-500" />
                Batches - {selectedMedication?.name}
              </DialogTitle>
              <DialogDescription>View HOD store batches (read-only)</DialogDescription>
            </DialogHeader>
            {selectedMedication && (
              <div className="space-y-3">
                {selectedMedication.batches.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-6">No batches found</p>
                ) : (
                  selectedMedication.batches
                    .slice()
                    .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)))
                    .map((batch) => (
                      <Card key={batch.id}>
                        <CardContent className="p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Hash className="h-4 w-4 text-muted-foreground" />
                                <span className="font-semibold">{batch.batch_number}</span>
                                <Badge variant="outline">Exp: {batch.expiry_date}</Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                Qty:{" "}
                                <span className="font-medium text-foreground">
                                  {formatPackDisplay(
                                    Number(batch.quantity),
                                    selectedMedication?.packSize
                                  )}
                                </span>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBatchesModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={showIssueModal}
          onOpenChange={(open) => {
            setShowIssueModal(open);
            if (!open) resetIssueForm();
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Issue from HOD store</DialogTitle>
              <DialogDescription>
                {selectedMedication
                  ? `Discretionary issue — ${selectedMedication.name}`
                  : "Record a discretionary issue (not prescription dispensing)"}
              </DialogDescription>
            </DialogHeader>
            {selectedMedication && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="text-muted-foreground">Available stock</p>
                  <p className="font-semibold">
                    {formatPackDisplay(availableIssueStock, selectedMedication.packSize)}
                  </p>
                </div>

                {issueBatches.length > 0 && (
                  <div>
                    <Label>Batch (optional)</Label>
                    <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="FIFO (automatic)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="auto">FIFO (earliest expiry first)</SelectItem>
                        {issueBatches.map((b) => (
                          <SelectItem key={b.id} value={String(b.id)}>
                            {b.batch_number} — {Number(b.quantity).toLocaleString()} (exp{" "}
                            {b.expiry_date})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <PharmacyPackQuantityFields
                  medication={packMed(selectedMedication)}
                  displayQuantity={issueQty}
                  onDisplayQuantityChange={setIssueQty}
                  entryMode={issueEntryMode}
                  onEntryModeChange={setIssueEntryMode}
                  maxDisplayQuantity={
                    issueEntryMode === "pack"
                      ? Math.max(1, Math.floor(availableIssueStock / getPackSize(packMed(selectedMedication))))
                      : availableIssueStock
                  }
                />

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <Label>Patient name (optional)</Label>
                    <Input
                      className="mt-1"
                      value={patientName}
                      onChange={(e) => setPatientName(e.target.value)}
                    />
                  </div>
                  <div>
                    <Label>Patient MRN (optional)</Label>
                    <Input
                      className="mt-1"
                      value={patientMrn}
                      onChange={(e) => setPatientMrn(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <Label>Reason</Label>
                  <Select value={issueReason} onValueChange={setIssueReason}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {ISSUE_REASONS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Notes (optional)</Label>
                  <Textarea
                    className="mt-1"
                    value={issueNotes}
                    onChange={(e) => setIssueNotes(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowIssueModal(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleIssue}
                disabled={issuing || !selectedMedication}
                className="bg-violet-600 hover:bg-violet-700"
              >
                {issuing ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Issuing...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Issue
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
