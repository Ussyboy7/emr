"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StandardPagination } from "@/components/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { pharmacyService, type MedicationInventory, type Medication, type BatchAdjustmentHistory } from "@/lib/services";
import { PHARMACY_LOCATIONS } from "@/lib/constants/pharmacy-locations";
import { MEDICATION_CATEGORIES } from "@/lib/constants/pharmacy";
import { Package, Search, TrendingUp, AlertTriangle, Loader2, Eye, Send, Layers, Plus, ArrowUpDown, Upload, Hash, Pill, Clock, XCircle, CheckCircle2 } from "lucide-react";

interface MedicationWithStock {
  id: number;
  name: string;
  generic?: Medication['generic'];
  generic_name?: string;
  strength?: string;
  form?: string;
  category?: string;
  packSize?: number;
  storeQuantity: number;
  minimumStock: number;
  batches: MedicationInventory[];
}

const adjustmentReasons = [
  'Physical count adjustment',
  'Damaged/Expired removal',
  'Return from patient',
  'Transfer to another location',
  'Wastage/Spillage',
  'Theft/Loss',
  'Other',
];

export default function WarehouseStorePage() {
  // Inventory state
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [storeInventory, setStoreInventory] = useState<MedicationWithStock[]>([]);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("All Categories");
  const [stockFilter, setStockFilter] = useState("all");
  const [selectedMedication, setSelectedMedication] = useState<MedicationWithStock | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);
  const [showAdjustBatchModal, setShowAdjustBatchModal] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<MedicationInventory | null>(null);
  const [showBatchHistoryModal, setShowBatchHistoryModal] = useState(false);
  const [selectedHistoryBatch, setSelectedHistoryBatch] = useState<MedicationInventory | null>(null);
  const [adjusting, setAdjusting] = useState(false);
  const [adjustmentHistoryLoading, setAdjustmentHistoryLoading] = useState(false);
  const [adjustmentHistory, setAdjustmentHistory] = useState<BatchAdjustmentHistory[]>([]);
  const [adjustmentHistoryError, setAdjustmentHistoryError] = useState<string | null>(null);
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: "decrease" as "increase" | "decrease",
    quantity: 0,
    reason: "",
    notes: "",
  });

  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [receiveForm, setReceiveForm] = useState({
    batch_number: "",
    quantity: "",
    expiry_date: "",
    supplier: "",
  });

  const [showBulkUploadModal, setShowBulkUploadModal] = useState(false);
  const [bulkUploadFile, setBulkUploadFile] = useState<File | null>(null);
  const [bulkRows, setBulkRows] = useState<
    Array<{
      medication_id: number;
      batch_number: string;
      expiry_date: string;
      quantity: number;
      unit: string;
      supplier?: string;
      min_stock_level?: number;
    }>
  >([]);
  const [bulkErrors, setBulkErrors] = useState<string[]>([]);
  const [bulkUploading, setBulkUploading] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ processed: 0, total: 0 });
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);
  const [inventoryItemsPerPage, setInventoryItemsPerPage] = useState(10);



  useEffect(() => {
    loadStoreInventory();
  }, []);

  const formatPackDisplay = (units: number, packSize: number | undefined | null) => {
    if (!packSize || packSize <= 1) return `${units.toLocaleString()} units`;
    const packs = Math.floor(units / packSize);
    return `${packs.toLocaleString()} packs (${units.toLocaleString()} units)`;
  };

  const loadStoreInventory = async () => {
    try {
      setInventoryLoading(true);
      const response = await pharmacyService.getInventory({
        page: 1,
        page_size: 10000,
        location: PHARMACY_LOCATIONS.STORE,
      });

      const grouped = new Map<number, MedicationWithStock>();

      response.results.forEach((item) => {
        const medId = typeof item.medication === "number" ? item.medication : (item.medication as any)?.id;
        if (!medId) return;

        const medication = (typeof item.medication === "object" ? item.medication : {}) as any;
        if (!grouped.has(medId)) {
          grouped.set(medId, {
            id: medId,
            name: item.medication_name || medication?.name || "Unknown",
            generic: medication?.generic,
            generic_name: medication?.generic?.name || medication?.generic_name,
            strength: medication?.strength || "",
            form: medication?.form || "",
            category: medication?.category || "",
            packSize: (typeof medication?.pack_size === "number" && medication.pack_size > 0) ? medication.pack_size : 10,
            storeQuantity: 0,
            minimumStock: Number(medication?.min_stock_level ?? 0),
            batches: [],
          });
        }

        const med = grouped.get(medId)!;
        med.storeQuantity += Number(item.quantity || 0);
        med.batches.push(item);
      });

      setStoreInventory(Array.from(grouped.values()).sort((a, b) => a.name.localeCompare(b.name)));
    } catch (err) {
      console.error("Error loading store inventory:", err);
      toast.error("Failed to load central store inventory");
    } finally {
      setInventoryLoading(false);
    }
  };

  const categories = useMemo(() => {
    return MEDICATION_CATEGORIES;
  }, []);

  const getDaysUntilExpiry = (expiryDate: string) => {
    if (!expiryDate) return 9999;
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getNearestExpiryDate = (batches: MedicationInventory[]) => {
    if (!batches || batches.length === 0) return "";
    const sorted = batches
      .slice()
      .sort((a, b) => String(a.expiry_date).localeCompare(String(b.expiry_date)));
    return sorted[0]?.expiry_date || "";
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

  useEffect(() => {
    if (inventoryCurrentPage !== 1) setInventoryCurrentPage(1);
  }, [inventorySearchQuery, categoryFilter, stockFilter]);

  const filteredInventory = useMemo(() => {
    const q = inventorySearchQuery.trim().toLowerCase();
    return storeInventory.filter((med) => {
      const matchesSearch =
        !q ||
        med.name.toLowerCase().includes(q) ||
        (med.generic_name || "").toLowerCase().includes(q);

      const matchesCategory = categoryFilter === "All Categories" || (med.category || "") === categoryFilter;

      const status = getStockStatus(med);
      const matchesStock =
        stockFilter === "all" ||
        (stockFilter === "out" && status === "Out of Stock") ||
        (stockFilter === "low" && status === "Low Stock") ||
        (stockFilter === "normal" && status === "In Stock");

      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [storeInventory, inventorySearchQuery, categoryFilter, stockFilter]);

  const paginatedInventory = useMemo(() => {
    const start = (inventoryCurrentPage - 1) * inventoryItemsPerPage;
    return filteredInventory.slice(start, start + inventoryItemsPerPage);
  }, [filteredInventory, inventoryCurrentPage, inventoryItemsPerPage]);

  const stats = useMemo(() => {
    const outOfStock = storeInventory.filter((m) => m.storeQuantity === 0).length;
    const lowStock = storeInventory.filter((m) => m.storeQuantity > 0 && m.storeQuantity <= m.minimumStock).length;
    return {
      totalMedications: storeInventory.length,
      outOfStock,
      lowStock,
      totalUnits: storeInventory.reduce((sum, m) => sum + m.storeQuantity, 0),
    };
  }, [storeInventory]);

  const handleViewDetails = (med: MedicationWithStock) => {
    setSelectedMedication(med);
    setShowDetailsModal(true);
  };

  const handleViewBatches = (med: MedicationWithStock) => {
    setSelectedMedication(med);
    setShowBatchesModal(true);
  };

  const openReceive = () => {
    setReceiveForm({
      batch_number: "",
      quantity: "",
      expiry_date: "",
      supplier: "",
    });
    setShowReceiveModal(true);
  };

  const openReceiveFor = (med: MedicationWithStock) => {
    setSelectedMedication(med);
    openReceive();
  };

  const openAdjustForBatch = async (batch: MedicationInventory) => {
    setSelectedBatch(batch);
    setShowAdjustBatchModal(true);
    setAdjustmentForm({ type: "decrease", quantity: 0, reason: "", notes: "" });
  };

  const openBatchHistoryForBatch = async (batch: MedicationInventory) => {
    setSelectedHistoryBatch(batch);
    setShowBatchHistoryModal(true);
    setAdjustmentHistory([]);
    setAdjustmentHistoryError(null);
    setAdjustmentHistoryLoading(true);
    try {
      const history = await pharmacyService.getBatchAdjustmentHistory(Number(batch.id));
      setAdjustmentHistory(history || []);
    } catch (e: any) {
      setAdjustmentHistoryError("Adjustment history not available.");
      setAdjustmentHistory([]);
    } finally {
      setAdjustmentHistoryLoading(false);
    }
  };

  const handleAdjustBatch = async () => {
    if (!selectedBatch) return;

    if (!adjustmentForm.quantity || !adjustmentForm.reason) {
      toast.error("Please fill in all required fields");
      return;
    }

    const currentQty = Number(selectedBatch.quantity || 0);
    const packSize = selectedMedication?.packSize || 1;
    const adjustPacks = adjustmentForm.quantity;
    const adjustUnits = adjustPacks * packSize;

    const newQty =
      adjustmentForm.type === "increase"
        ? currentQty + adjustUnits
        : currentQty - adjustUnits;

    if (newQty < 0) {
      toast.error("Stock cannot be negative");
      return;
    }

    try {
      setAdjusting(true);
      await pharmacyService.recordBatchAdjustment(Number(selectedBatch.id), {
        quantity_after: newQty,
        adjustment_reason: adjustmentForm.reason,
        adjustment_notes: adjustmentForm.notes || undefined,
      });
      toast.success(
        `Batch stock ${adjustmentForm.type === "increase" ? "increased" : "decreased"} by ${adjustPacks} packs (${adjustUnits} units)`
      );
      setShowAdjustBatchModal(false);
      setSelectedBatch(null);
      setAdjustmentForm({ type: "decrease", quantity: 0, reason: "", notes: "" });
      await loadStoreInventory();
    } catch (e: any) {
      toast.error(e?.message || "Failed to adjust batch");
    } finally {
      setAdjusting(false);
    }
  };

  const getPackSize = (med: MedicationWithStock | null) => med?.packSize || 1;

  const handleReceive = async () => {
    if (!selectedMedication) return;
    if (!receiveForm.batch_number.trim() || !receiveForm.expiry_date.trim()) {
      toast.error("Batch number and expiry date are required");
      return;
    }
    const packs = Number(receiveForm.quantity);
    if (!Number.isFinite(packs) || packs <= 0) {
      toast.error("Quantity must be greater than 0");
      return;
    }

    const packSize = getPackSize(selectedMedication);
    const quantityInUnits = packs * packSize;

    try {
      setReceiving(true);
      await pharmacyService.createInventoryItem({
        medication: selectedMedication.id,
        batch_number: receiveForm.batch_number.trim(),
        expiry_date: receiveForm.expiry_date,
        quantity: quantityInUnits,
        unit: "unit",
        min_stock_level: selectedMedication.minimumStock,
        supplier: receiveForm.supplier.trim() || undefined,
        location: PHARMACY_LOCATIONS.STORE,
      });
      toast.success(`Received ${packs} packs (${quantityInUnits.toLocaleString()} units)`);
      setShowReceiveModal(false);
      setShowDetailsModal(false);
      await loadStoreInventory();
    } catch (e: any) {
      toast.error(e?.message || "Failed to receive stock");
    } finally {
      setReceiving(false);
    }
  };

  const downloadBulkTemplate = () => {
    const csv = [
      "medication_id,batch_number,expiry_date,quantity,unit,supplier,min_stock_level",
      "123,BT-2026-001,2028-01-22,100,tablet,Acme Pharma,50",
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "central-store-bulk-upload-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const parseBulkCSV = async (file: File) => {
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) {
      setBulkRows([]);
      setBulkErrors(["CSV must include a header and at least one data row."]);
      return;
    }

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const idx = (name: string) => header.indexOf(name);
    const required = ["medication_id", "batch_number", "expiry_date", "quantity", "unit"];
    const missing = required.filter((k) => idx(k) === -1);
    if (missing.length) {
      setBulkRows([]);
      setBulkErrors([`Missing required column(s): ${missing.join(", ")}`]);
      return;
    }

    const rows: typeof bulkRows = [];
    const errors: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const parts = lines[i].split(",").map((p) => p.trim());
      const get = (name: string) => {
        const pos = idx(name);
        return pos === -1 ? "" : (parts[pos] ?? "").trim();
      };

      const medicationId = Number(get("medication_id"));
      const batchNumber = get("batch_number");
      const expiryDate = get("expiry_date");
      const quantity = Number(get("quantity"));
      const unit = get("unit") || "unit";
      const supplier = get("supplier") || "";
      const minStockRaw = get("min_stock_level");
      const minStock = minStockRaw ? Number(minStockRaw) : undefined;

      if (!Number.isFinite(medicationId) || medicationId <= 0) {
        errors.push(`Row ${i + 1}: invalid medication_id`);
        continue;
      }
      if (!batchNumber) {
        errors.push(`Row ${i + 1}: batch_number is required`);
        continue;
      }
      if (!expiryDate) {
        errors.push(`Row ${i + 1}: expiry_date is required`);
        continue;
      }
      if (!Number.isFinite(quantity) || quantity <= 0) {
        errors.push(`Row ${i + 1}: quantity must be greater than 0`);
        continue;
      }

      rows.push({
        medication_id: medicationId,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        quantity,
        unit,
        supplier: supplier || undefined,
        min_stock_level: Number.isFinite(minStock as number) ? (minStock as number) : undefined,
      });
    }

    setBulkRows(rows);
    setBulkErrors(errors);
  };

  const handleBulkUpload = async () => {
    if (!bulkRows.length) {
      toast.error("No valid rows to upload");
      return;
    }
    setBulkUploading(true);
    setBulkProgress({ processed: 0, total: bulkRows.length });
    const errors: string[] = [];
    for (let i = 0; i < bulkRows.length; i++) {
      const row = bulkRows[i];
      try {
        await pharmacyService.createInventoryItem({
          medication: row.medication_id,
          batch_number: row.batch_number,
          expiry_date: row.expiry_date,
          quantity: row.quantity,
          unit: row.unit,
          supplier: row.supplier,
          min_stock_level: row.min_stock_level ?? 0,
          location: PHARMACY_LOCATIONS.STORE,
        });
      } catch (e: any) {
        errors.push(`Row ${i + 2}: ${e?.message || "Failed"}`);
      } finally {
        setBulkProgress((p) => ({ ...p, processed: p.processed + 1 }));
      }
    }
    setBulkErrors(errors);
    setBulkUploading(false);
    await loadStoreInventory();
    if (errors.length) toast.error(`Bulk upload completed with ${errors.length} error(s)`);
    else toast.success("Bulk upload completed");
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Package className="h-8 w-8 text-violet-500" />
              Central store
            </h1>
            <p className="text-muted-foreground mt-1">Central inventory - receiving, batches, and stock levels</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setShowBulkUploadModal(true)}>
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload
            </Button>
            <Button asChild variant="outline">
              <Link href="/pharmacy/drugs">Drug master</Link>
            </Button>
            <Button asChild className="bg-violet-600 hover:bg-violet-700">
              <Link href="/pharmacy/store/requests">
                <Send className="h-4 w-4 mr-2" />
                Store Requests
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
                    <p className="text-2xl sm:text-3xl font-bold text-violet-600">{stats.totalMedications}</p>
                  </div>
                  <Package className="h-6 w-6 text-violet-500" />
                </div>
              </CardContent>
            </Card>

            <Card className={stats.outOfStock > 0 ? "border-red-200 dark:border-red-800" : ""}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Out of Stock</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${stats.outOfStock > 0 ? "text-red-600" : "text-green-600"}`}>
                      {stats.outOfStock}
                    </p>
                  </div>
                  <XCircle className={`h-6 w-6 ${stats.outOfStock > 0 ? "text-red-500" : "text-green-500"}`} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Low Stock</p>
                    <p className={`text-2xl sm:text-3xl font-bold ${stats.lowStock > 0 ? "text-amber-600" : "text-green-600"}`}>
                      {stats.lowStock}
                    </p>
                  </div>
                  <AlertTriangle className={`h-6 w-6 ${stats.lowStock > 0 ? "text-amber-500" : "text-green-500"}`} />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Total Units</p>
                    <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{stats.totalUnits.toLocaleString()}</p>
                  </div>
                  <TrendingUp className="h-6 w-6 text-emerald-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {(stats.outOfStock > 0 || stats.lowStock > 0) && (
            <Card className="bg-gradient-to-r from-amber-50 to-red-50 dark:from-amber-900/20 dark:to-red-900/20 border-amber-200 dark:border-amber-800">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  <div>
                    <p className="font-medium text-amber-800 dark:text-amber-400">Stock Alerts</p>
                    <p className="text-sm text-amber-700 dark:text-amber-500">
                      {stats.outOfStock > 0 && `${stats.outOfStock} item(s) out of stock. `}
                      {stats.lowStock > 0 && `${stats.lowStock} item(s) running low. `}
                      Consider restocking soon.
                    </p>
                  </div>
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
                  <p>Loading central store inventory...</p>
                </CardContent>
              </Card>
            ) : paginatedInventory.length > 0 ? (
              paginatedInventory.map((med) => {
                const stockStatus = getStockStatus(med);
                const nearestExpiry = getNearestExpiryDate(med.batches);
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
                              <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStockColor(stockStatus)}`}>
                                {stockStatus}
                              </Badge>
                              <span className="text-[10px] font-medium text-muted-foreground">
                                {formatPackDisplay(med.storeQuantity, med.packSize)}
                              </span>
                            </div>
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewDetails(med)} title="View Details">
                                <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewBatches(med)} title="View Batches">
                                <Layers className="h-4 w-4 text-muted-foreground hover:text-violet-500" />
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => openReceiveFor(med)} title="Receive/Add Stock">
                                <Plus className="h-4 w-4 text-muted-foreground hover:text-emerald-600" />
                              </Button>
                            </div>
                          </div>

                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            {med.generic_name && <span>{med.generic_name}</span>}
                            <span>•</span>
                            <span>{med.category || "Other"}</span>
                            <span>•</span>
                            <span>{med.form || "—"}</span>
                            <span>•</span>
                            <span>{med.batches.length} batch(es)</span>
                            {nearestExpiry && (
                              <>
                                <span>•</span>
                                <span
                                  className={`flex items-center gap-1 ${
                                    daysUntilExpiry <= 90 ? "text-amber-600 dark:text-amber-400" : ""
                                  } ${daysUntilExpiry < 0 ? "text-red-600 dark:text-red-400" : ""}`}
                                >
                                  <Clock className="h-3 w-3" />
                                  {daysUntilExpiry < 0 ? "Expired" : daysUntilExpiry <= 30 ? `${daysUntilExpiry}d` : nearestExpiry}
                                </span>
                              </>
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
                </CardContent>
              </Card>
            )}
          </div>

          {filteredInventory.length > 0 && (
            <Card className="p-4">
              <StandardPagination
                currentPage={inventoryCurrentPage}
                totalItems={filteredInventory.length}
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

        {/* Inventory Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[720px]">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <span className="truncate">{selectedMedication?.name}</span>
                {selectedMedication && (
                  <Badge variant="outline" className={`text-[10px] px-2 py-0.5 ${getStockColor(getStockStatus(selectedMedication))}`}>
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
                  <div>
                    <p className="text-muted-foreground">Generic Name</p>
                    <p className="font-medium">{selectedMedication.generic_name || selectedMedication.generic?.name || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Category</p>
                    <p className="font-medium">{selectedMedication.category || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Strength</p>
                    <p className="font-medium">{selectedMedication.strength || "—"}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Form</p>
                    <p className="font-medium">{selectedMedication.form || "—"}</p>
                  </div>
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
                          {formatPackDisplay(selectedMedication.storeQuantity, selectedMedication.packSize)}
                        </p>
                        <p className="text-xs text-muted-foreground">Current</p>
                      </div>
                      <div>
                        <p className="text-2xl font-bold text-amber-600">
                          {formatPackDisplay(selectedMedication.minimumStock, selectedMedication.packSize)}
                        </p>
                        <p className="text-xs text-muted-foreground">Minimum</p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-muted/50 rounded-lg p-4">
                    <h4 className="font-medium mb-2">Expiry Information</h4>
                    <p className="text-sm">
                      <span className="text-muted-foreground">Expiry Date:</span>{" "}
                      <span className="font-medium">{getNearestExpiryDate(selectedMedication.batches) || "—"}</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailsModal(false)}>
                Close
              </Button>
              <Button variant="outline" onClick={() => selectedMedication && handleViewBatches(selectedMedication)}>
                <Layers className="h-4 w-4 mr-2" />
                View Batches
              </Button>
              <Button onClick={openReceive} className="bg-emerald-600 hover:bg-emerald-700">
                Receive Stock
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
              <DialogDescription>View and adjust Central store batches</DialogDescription>
            </DialogHeader>
            {selectedMedication && (
              <div className="space-y-3">
                {selectedMedication.batches
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
                              Qty: <span className="font-medium text-foreground">
                                {formatPackDisplay(Number(batch.quantity), selectedMedication?.packSize)}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="outline" size="sm" onClick={() => openAdjustForBatch(batch)}>
                              <ArrowUpDown className="h-4 w-4 mr-2" />
                              Adjust
                            </Button>
                            <Button variant="outline" size="sm" onClick={() => openBatchHistoryForBatch(batch)}>
                              <Clock className="h-4 w-4 mr-2" />
                              History
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBatchesModal(false)}>
                Close
              </Button>
              <Button onClick={openReceive} className="bg-emerald-600 hover:bg-emerald-700">
                <Plus className="h-4 w-4 mr-2" />
                Receive Stock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog
          open={showBatchHistoryModal}
          onOpenChange={(open) => {
            setShowBatchHistoryModal(open);
            if (!open) setSelectedHistoryBatch(null);
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Hash className="h-5 w-5 text-muted-foreground" />
                  <span className="font-semibold truncate">
                    {selectedHistoryBatch?.batch_number || "—"}
                  </span>
                </div>
                {selectedHistoryBatch ? (
                  <Badge variant="outline">Exp: {selectedHistoryBatch.expiry_date}</Badge>
                ) : null}
              </DialogTitle>
              <DialogDescription>Batch adjustment history (additions / reductions)</DialogDescription>
            </DialogHeader>

            {selectedHistoryBatch && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-center">
                  <p className="text-muted-foreground">Qty</p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {formatPackDisplay(Number(selectedHistoryBatch.quantity || 0), selectedMedication?.packSize)}
                  </p>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Adjustments</h4>
                  {adjustmentHistoryLoading ? (
                    <div className="flex items-center gap-2 text-muted-foreground text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading history...
                    </div>
                  ) : adjustmentHistoryError ? (
                    <p className="text-sm text-muted-foreground">{adjustmentHistoryError}</p>
                  ) : adjustmentHistory.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No historic adjustments yet for this batch.</p>
                  ) : (
                    <div className="space-y-3">
                      {adjustmentHistory.map((h) => {
                        const packSize = selectedMedication?.packSize || 1;
                        const deltaUnits = Number(h.quantity_after || 0) - Number(h.quantity_before || 0);
                        const direction = deltaUnits >= 0 ? "Increase" : "Decrease";
                        const absUnits = Math.abs(deltaUnits);
                        const dateLabel = h.created_at ? new Date(h.created_at).toLocaleString() : "—";

                        return (
                          <div key={h.id} className="pt-1 border-t border-border first:border-t-0">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="font-medium">
                                  {direction} by {formatPackDisplay(absUnits, packSize)}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  Reason: {h.adjustment_reason?.trim() ? h.adjustment_reason : "Not recorded"}
                                </p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  By: {h.created_by_name || "—"}
                                </p>
                                {h.adjustment_notes ? (
                                  <p className="text-xs text-muted-foreground mt-1 break-words">
                                    Notes: {h.adjustment_notes}
                                  </p>
                                ) : null}
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatPackDisplay(Number(h.quantity_before || 0), packSize)} -&gt;{" "}
                                  {formatPackDisplay(Number(h.quantity_after || 0), packSize)}
                                </p>
                              </div>
                              <p className="text-xs text-muted-foreground whitespace-nowrap">{dateLabel}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setShowBatchHistoryModal(false)}
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  const b = selectedHistoryBatch;
                  setShowBatchHistoryModal(false);
                  if (b) openAdjustForBatch(b);
                }}
                className="bg-emerald-600 hover:bg-emerald-700"
                disabled={!selectedHistoryBatch}
              >
                <ArrowUpDown className="h-4 w-4 mr-2" />
                Adjust
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAdjustBatchModal} onOpenChange={setShowAdjustBatchModal}>
          <DialogContent className="w-[95vw] sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowUpDown className="h-5 w-5 text-amber-500" />
                Adjust Stock
              </DialogTitle>
              <DialogDescription>
                {selectedBatch ? `Adjust stock for Batch ${selectedBatch.batch_number}` : ""}
              </DialogDescription>
            </DialogHeader>

            {selectedBatch && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-center">
                  <p className="text-muted-foreground">Current Stock</p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {formatPackDisplay(Number(selectedBatch.quantity || 0), selectedMedication?.packSize)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={adjustmentForm.type === "increase" ? "default" : "outline"}
                    className={adjustmentForm.type === "increase" ? "bg-emerald-500 hover:bg-emerald-600" : ""}
                    onClick={() => setAdjustmentForm({ ...adjustmentForm, type: "increase" })}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Increase
                  </Button>
                  <Button
                    variant={adjustmentForm.type === "decrease" ? "default" : "outline"}
                    className={adjustmentForm.type === "decrease" ? "bg-red-500 hover:bg-red-600" : ""}
                    onClick={() => setAdjustmentForm({ ...adjustmentForm, type: "decrease" })}
                  >
                    <Hash className="h-4 w-4 mr-2" />
                    Decrease
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Quantity (Packs) *</Label>
                    <Input
                      type="number"
                      min="1"
                      max={adjustmentForm.type === "decrease" ? Number(selectedBatch.quantity || 0) : undefined}
                      value={adjustmentForm.quantity || ""}
                      onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantity: parseInt(e.target.value) || 0 })}
                      placeholder="Enter quantity"
                      className="mt-1"
                    />
                    {adjustmentForm.quantity > 0 && selectedMedication?.packSize && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Total: {(adjustmentForm.quantity * (selectedMedication.packSize || 1)).toLocaleString()} units
                      </p>
                    )}
                  </div>

                  <div>
                    <Label>Reason *</Label>
                    <Select value={adjustmentForm.reason} onValueChange={(v) => setAdjustmentForm({ ...adjustmentForm, reason: v })}>
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select reason" />
                      </SelectTrigger>
                      <SelectContent>
                        {adjustmentReasons.map((reason) => (
                          <SelectItem key={reason} value={reason}>
                            {reason}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div>
                  <Label>Notes (Optional)</Label>
                  <Textarea
                    value={adjustmentForm.notes}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, notes: e.target.value })}
                    placeholder="Add any additional notes..."
                    rows={2}
                    className="mt-1"
                  />
                </div>

                {adjustmentForm.quantity > 0 && (
                  <div
                    className={`p-3 rounded-lg text-sm ${
                      adjustmentForm.type === "increase"
                        ? "bg-emerald-50 dark:bg-emerald-900/20"
                        : "bg-red-50 dark:bg-red-900/20"
                    }`}
                  >
                    <p
                      className={
                        adjustmentForm.type === "increase"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-red-700 dark:text-red-400"
                      }
                    >
                      New stock level:{" "}
                      <strong>
                        {(() => {
                          const current = Number(selectedBatch.quantity || 0);
                          const packSize = selectedMedication?.packSize || 1;
                          const adjustPacks = adjustmentForm.quantity;
                          const adjustUnits = adjustPacks * packSize;
                          const next =
                            adjustmentForm.type === "increase"
                              ? current + adjustUnits
                              : current - adjustUnits;
                          return formatPackDisplay(Math.max(0, next), packSize);
                        })()}
                      </strong>{" "}
                    </p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setShowAdjustBatchModal(false);
                  setAdjustmentForm({ type: "decrease", quantity: 0, reason: "", notes: "" });
                }}
              >
                Cancel
              </Button>
              <Button
                className={adjustmentForm.type === "increase" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}
                onClick={handleAdjustBatch}
                disabled={adjusting || !adjustmentForm.quantity || !adjustmentForm.reason}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                {adjusting ? "Saving..." : "Confirm Adjustment"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showReceiveModal} onOpenChange={setShowReceiveModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>Receive Stock</DialogTitle>
              <DialogDescription>Add a batch into Central store inventory</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label>Batch Number *</Label>
                <Input className="mt-1" value={receiveForm.batch_number} onChange={(e) => setReceiveForm({ ...receiveForm, batch_number: e.target.value })} />
              </div>
              <div>
                <Label>Quantity (Packs) *</Label>
                <Input
                  className="mt-1"
                  type="number"
                  min="1"
                  value={receiveForm.quantity}
                  onChange={(e) => setReceiveForm({ ...receiveForm, quantity: e.target.value })}
                />
                {receiveForm.quantity && selectedMedication?.packSize && (
                  <p className="text-xs text-muted-foreground mt-1">
                    Total units: {(Number(receiveForm.quantity) * (selectedMedication.packSize || 1)).toLocaleString()}
                  </p>
                )}
              </div>
              <div>
                <Label>Expiry Date *</Label>
                <Input className="mt-1" type="date" value={receiveForm.expiry_date} onChange={(e) => setReceiveForm({ ...receiveForm, expiry_date: e.target.value })} />
              </div>
              <div className="sm:col-span-2">
                <Label>Supplier</Label>
                <Input className="mt-1" value={receiveForm.supplier} onChange={(e) => setReceiveForm({ ...receiveForm, supplier: e.target.value })} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowReceiveModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleReceive} disabled={receiving} className="bg-emerald-600 hover:bg-emerald-700">
                {receiving ? "Receiving..." : "Receive Stock"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showBulkUploadModal} onOpenChange={setShowBulkUploadModal}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5 text-violet-500" />
                Bulk Upload (Central store)
              </DialogTitle>
              <DialogDescription>Upload CSV to create stock batches into Store location</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button variant="outline" onClick={downloadBulkTemplate}>
                  Download Template
                </Button>
              </div>

              <div className="space-y-2">
                <Label>CSV File</Label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={async (e) => {
                    const file = e.target.files?.[0] || null;
                    setBulkUploadFile(file);
                    setBulkRows([]);
                    setBulkErrors([]);
                    setBulkProgress({ processed: 0, total: 0 });
                    if (file) await parseBulkCSV(file);
                  }}
                />
              </div>

              <div className="rounded-lg border p-3 text-sm space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground">Valid rows</span>
                  <span className="font-medium">{bulkRows.length}</span>
                </div>
                {bulkProgress.total > 0 && (
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Progress</span>
                    <span className="font-medium">
                      {bulkProgress.processed}/{bulkProgress.total}
                    </span>
                  </div>
                )}
              </div>

              {bulkErrors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50/50 p-3 text-sm space-y-2">
                  <p className="font-semibold text-red-700">Errors</p>
                  <ul className="list-disc pl-5 space-y-1 text-red-700">
                    {bulkErrors.slice(0, 20).map((err, idx) => (
                      <li key={`${idx}-${err}`}>{err}</li>
                    ))}
                  </ul>
                  {bulkErrors.length > 20 && (
                    <p className="text-red-700">Showing first 20 errors.</p>
                  )}
                </div>
              )}

              {bulkRows.length > 0 && (
                <div className="rounded-lg border p-3 text-sm space-y-2">
                  <p className="font-semibold">Preview (first 5)</p>
                  <div className="space-y-2">
                    {bulkRows.slice(0, 5).map((r, idx) => (
                      <div key={`${idx}-${r.medication_id}-${r.batch_number}`} className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium truncate">
                            med {r.medication_id} • {r.batch_number}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            exp {r.expiry_date} • qty {r.quantity} {r.unit}
                          </p>
                        </div>
                        <Badge variant="outline">Store</Badge>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Notes</Label>
                <Textarea placeholder="Optional: internal note for this upload (not saved)" />
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBulkUploadModal(false)}>
                Close
              </Button>
              <Button onClick={handleBulkUpload} disabled={bulkUploading || !bulkRows.length} className="bg-violet-600 hover:bg-violet-700">
                {bulkUploading ? "Uploading..." : "Upload"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
