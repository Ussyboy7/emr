"use client";

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { pharmacyService, type StockRequest } from '@/lib/services';
import { PHARMACY_LOCATIONS } from '@/lib/constants/pharmacy-locations';
import { 
  Database, Search, Plus, Pill, Package, AlertTriangle, Eye, Edit,
  Layers, Calendar, CheckCircle2, XCircle, TrendingUp,
  Upload, Hash, Minus, ArrowUpDown, Clock, Loader2
} from 'lucide-react';

import { MEDICATION_CATEGORIES, DOSAGE_FORMS, MEDICATION_STRENGTHS, MEDICATION_MANUFACTURERS } from '@/lib/constants/pharmacy';

// Batch interface
interface MedicationBatch {
  id: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  receivedDate: string;
  supplier: string;
}

// Stock adjustment reasons
const adjustmentReasons = [
  'Physical count adjustment',
  'Damaged/Expired removal',
  'Return from patient',
  'Transfer to another location',
  'Wastage/Spillage',
  'Theft/Loss',
  'Other',
];

// Type definitions
interface MedicationInventoryItem {
  id: string;
  medicationId?: number; // Store medication ID for easier updates
  name: string;
  genericName: string;
  category: string;
  strength: string;
  dosageForm: string;
  packSize: number;
  manufacturer: string;
  currentStock: number;
  minimumStock: number;
  lastRestocked: string;
  expiryDate: string;
  batches: MedicationBatch[];
}

const categories = MEDICATION_CATEGORIES;

const dosageForms = DOSAGE_FORMS;

export default function InventoryPage() {
  const location = PHARMACY_LOCATIONS.DISPENSARY;
  const [inventory, setInventory] = useState<MedicationInventoryItem[]>([]);
  const [allInventoryForStats, setAllInventoryForStats] = useState<MedicationInventoryItem[]>([]); // All inventory for stats calculation
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [stockFilter, setStockFilter] = useState('all');

  const [incomingLoading, setIncomingLoading] = useState(true);
  const [incomingRequests, setIncomingRequests] = useState<StockRequest[]>([]);
  const [selectedRequest, setSelectedRequest] = useState<StockRequest | null>(null);
  const [showRequestDetailsModal, setShowRequestDetailsModal] = useState(false);
  const [showConfirmReceiptModal, setShowConfirmReceiptModal] = useState(false);
  const [confirmNotes, setConfirmNotes] = useState("");
  const [confirmingReceipt, setConfirmingReceipt] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // Load all inventory for stats (separate from paginated data)
  useEffect(() => {
    loadAllInventoryForStats();
    loadIncomingRequests();
  }, []);

  // Load inventory from API
  useEffect(() => {
    loadInventory();
  }, [currentPage, itemsPerPage, searchQuery, categoryFilter, stockFilter]);

  // Load all inventory for stats calculation
  const loadAllInventoryForStats = async () => {
    try {
      const response = await pharmacyService.getInventory({
        page: 1,
        page_size: 10000, // Load a large number for stats
        location,
      });
      const transformed = transformInventoryItems(response.results);
      setAllInventoryForStats(transformed);
    } catch (err) {
      console.error('Error loading all inventory for stats:', err);
    }
  };

  const loadIncomingRequests = async () => {
    try {
      setIncomingLoading(true);
      const [fulfilled, partial] = await Promise.all([
        pharmacyService.getStockRequests({ status: "fulfilled", page: 1, page_size: 50 }),
        pharmacyService.getStockRequests({ status: "partially_fulfilled", page: 1, page_size: 50 }),
      ]);
      const combined = [...(fulfilled.results || []), ...(partial.results || [])]
        .filter((r) => r.to_location === PHARMACY_LOCATIONS.DISPENSARY)
        .sort((a, b) => String(b.updated_at || b.created_at).localeCompare(String(a.updated_at || a.created_at)));
      setIncomingRequests(combined);
    } catch (err: any) {
      toast.error(err?.message || "Failed to load incoming requests");
    } finally {
      setIncomingLoading(false);
    }
  };

  const openRequestDetails = (req: StockRequest) => {
    setSelectedRequest(req);
    setShowRequestDetailsModal(true);
  };

  const openConfirmReceipt = (req: StockRequest) => {
    setSelectedRequest(req);
    setConfirmNotes("");
    setShowConfirmReceiptModal(true);
  };

  const handleConfirmReceipt = async () => {
    if (!selectedRequest) return;
    try {
      setConfirmingReceipt(true);
      await pharmacyService.confirmStockRequest(selectedRequest.id, confirmNotes);
      toast.success("Receipt confirmed");
      setShowConfirmReceiptModal(false);
      setShowRequestDetailsModal(false);
      await Promise.all([loadIncomingRequests(), loadInventory(), loadAllInventoryForStats()]);
    } catch (err: any) {
      toast.error(err?.message || "Failed to confirm receipt");
    } finally {
      setConfirmingReceipt(false);
    }
  };

  // Transform inventory items helper function
  const transformInventoryItems = (results: any[]): MedicationInventoryItem[] => {
    return results.map((item: any) => {
        // Extract medication details from nested medication object
      const medication = item.medication || {};
        const medicationName = item.medication_name || medication.name || 'Unknown';
        const genericName = (medication.generic && medication.generic.name) || '';
        const strength = medication.strength || '';
        const dosageForm = medication.form || medication.dosage_form || '';
        
      // Get category from medication (now stored in backend)
      const category = medication.category || 'All Categories';
      
      // Get medication ID
      const medicationId = typeof item.medication === 'number' 
        ? item.medication 
        : (item.medication?.id ? (typeof item.medication.id === 'number' ? item.medication.id : parseInt(item.medication.id)) : undefined);
      
      return {
        id: item.id.toString(),
        medicationId, // Store medication ID for easier updates
          name: medicationName,
          genericName,
          category,
          strength,
          dosageForm,
        packSize: medication.pack_size || 10, // Get from backend
        manufacturer: medication.manufacturer || '', // Get from backend
        currentStock: Number(item.quantity),
        minimumStock: Number(item.min_stock_level),
        lastRestocked: (item as any).created_at?.split('T')[0] || (item as any).updated_at?.split('T')[0] || '',
        expiryDate: item.expiry_date,
          batches: [{
            id: item.id.toString(),
            batchNumber: item.batch_number,
            quantity: Number(item.quantity),
            expiryDate: item.expiry_date,
            receivedDate: (item as any).created_at?.split('T')[0] || '',
            supplier: item.supplier || '',
          }] as MedicationBatch[],
      };
    });
  };

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
        search: searchQuery || undefined,
        location,
      };

      if (categoryFilter !== 'All Categories') {
        params.medication__category = categoryFilter;
      }
      
      if (stockFilter !== 'all') {
        params.stock_status = stockFilter;
      }

      const response = await pharmacyService.getInventory(params);
      setTotalCount(response.count || response.results.length);
      // Transform API data to frontend format
      const transformed = transformInventoryItems(response.results);
      setInventory(transformed);
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
      console.error('Error loading inventory:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Modal states
  const [showAddModal, setShowAddModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showAdjustStockModal, setShowAdjustStockModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<MedicationInventoryItem | null>(null);
  
  // Add stock form
  const [newBatch, setNewBatch] = useState({
    batchNumber: '',
    quantity: 0,
    expiryDate: '',
    supplier: '',
  });
  
  // Stock adjustment form
  const [adjustmentForm, setAdjustmentForm] = useState({
    type: 'decrease' as 'increase' | 'decrease',
    quantity: 0,
    reason: '',
    notes: '',
  });
  
  // New medication form
  const [newMedication, setNewMedication] = useState({
    name: '', genericName: '', category: 'Analgesics', strength: '', dosageForm: 'Tablet',
    packSize: 10, manufacturer: '', minimumStock: 100
  });
  
  // Filter inventory (backend handles filtering now)
  const filteredInventory = inventory;

  // Use filtered inventory directly (no client-side pagination - backend handles it)
  const paginatedInventory = filteredInventory;

  // Reset to page 1 when filters change
  useEffect(() => {
    if (currentPage !== 1) {
      setCurrentPage(1);
    }
  }, [searchQuery, categoryFilter, stockFilter]);

  // Check for expiring soon items (within 90 days) - use allInventoryForStats
  const getExpiringItems = useMemo(() => {
    const today = new Date();
    const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    return allInventoryForStats.filter(med => {
      const expiry = new Date(med.expiryDate);
      return expiry <= ninetyDaysFromNow && expiry >= today;
    });
  }, [allInventoryForStats]);

  const getExpiredItems = useMemo(() => {
    const today = new Date();
    return allInventoryForStats.filter(med => new Date(med.expiryDate) < today);
  }, [allInventoryForStats]);

  // Stats - use allInventoryForStats to show everything in store, not just current page
  const stats = useMemo(() => ({
    total: allInventoryForStats.length,
    outOfStock: allInventoryForStats.filter(m => m.currentStock === 0).length,
    lowStock: allInventoryForStats.filter(m => m.currentStock > 0 && m.currentStock <= m.minimumStock).length,
    totalValue: allInventoryForStats.reduce((sum, m) => sum + m.currentStock, 0),
    expiringSoon: getExpiringItems.length,
    expired: getExpiredItems.length,
  }), [allInventoryForStats, getExpiringItems, getExpiredItems]);
  
  const formatPackDisplay = (units: number, packSize: number | undefined | null) => {
    if (!packSize || packSize <= 1) return `${units.toLocaleString()} units`;
    const packs = Math.floor(units / packSize);
    return `${packs.toLocaleString()} packs (${units.toLocaleString()} units)`;
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    const today = new Date();
    const expiry = new Date(expiryDate);
    const diffTime = expiry.getTime() - today.getTime();
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  };

  const getExpiryBadgeColor = (expiryDate: string) => {
    const days = getDaysUntilExpiry(expiryDate);
    if (days < 0) return 'bg-red-500 text-white';
    if (days <= 30) return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
    if (days <= 90) return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
  };

  const getStockStatus = (med: MedicationInventoryItem) => {
    if (med.currentStock === 0) return 'Out of Stock';
    if (med.currentStock <= med.minimumStock) return 'Low Stock';
    return 'In Stock';
  };

  const getStockColor = (status: string) => {
    switch (status) {
      case 'Out of Stock': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      case 'Low Stock': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      case 'In Stock': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const handleViewDetails = (med: MedicationInventoryItem) => {
    setSelectedMedication(med);
    setShowViewModal(true);
  };

  const handleAddStock = (med: MedicationInventoryItem) => {
    setSelectedMedication(med);
    setShowAddStockModal(true);
  };

  const handleAddMedication = async () => {
    const newId = `MED-${String(inventory.length + 1).padStart(3, '0')}`;
    const medication = {
      ...newMedication,
      id: newId,
      currentStock: 0,
      lastRestocked: '-',
      expiryDate: '-'
    };
    
    setInventory(prev => [...prev, medication] as MedicationInventoryItem[]);
    
    // Reload all inventory for stats
    await loadAllInventoryForStats();
    
    toast.success(`${newMedication.name} added to inventory`);
    setShowAddModal(false);
    setNewMedication({
      name: '', genericName: '', category: 'Analgesics', strength: '', dosageForm: 'Tablet',
      packSize: 10, manufacturer: '', minimumStock: 100
      });
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Database className="h-8 w-8 text-violet-500" />
              Dispensary inventory
            </h1>
            <p className="text-muted-foreground mt-1">Manage dispensary stock and track inventory levels</p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/pharmacy/drugs">Drug master</Link>
            </Button>
            <Button asChild className="bg-violet-600 hover:bg-violet-700">
              <Link href="/pharmacy/requests">Dispensary Requests</Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-foreground">Incoming from Central store</p>
                <p className="text-sm text-muted-foreground">Confirm stock issued by Central store</p>
              </div>
              <Button variant="outline" onClick={loadIncomingRequests} disabled={incomingLoading}>
                {incomingLoading ? "Loading..." : "Refresh"}
              </Button>
            </div>

            {incomingLoading ? (
              <div className="text-sm text-muted-foreground">Loading incoming requests…</div>
            ) : incomingRequests.length > 0 ? (
              <div className="space-y-2">
                {incomingRequests.map((req) => (
                  <div key={req.id} className="flex items-center justify-between gap-3 rounded-lg border p-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{req.request_id}</span>
                        <Badge className={req.status === "partially_fulfilled" ? "bg-amber-100 text-amber-800" : "bg-emerald-100 text-emerald-800"}>
                          {req.status === "partially_fulfilled" ? "Partially Issued" : "Issued"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{new Date(req.updated_at || req.created_at).toLocaleString()}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {req.items?.length || 0} item(s)
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openRequestDetails(req)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openConfirmReceipt(req)}>
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        Confirm
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted-foreground">No issued requests awaiting confirmation.</div>
            )}
          </CardContent>
        </Card>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-2xl sm:text-3xl font-bold text-violet-600">{stats.total}</p>
                </div>
                <Package className="h-6 w-6 text-violet-500" />
              </div>
            </CardContent>
          </Card>
          <Card className={stats.outOfStock > 0 ? 'border-red-200 dark:border-red-800' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Out of Stock</p>
                  <p className="text-2xl sm:text-3xl font-bold text-red-600">{stats.outOfStock}</p>
                </div>
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              {stats.outOfStock > 0 && (
                <p className="text-xs text-red-600 mt-1">⚠️ Requires attention</p>
              )}
            </CardContent>
          </Card>
          <Card className={stats.lowStock > 0 ? 'border-amber-200 dark:border-amber-800' : ''}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Low Stock</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600">{stats.lowStock}</p>
                </div>
                <AlertTriangle className="h-6 w-6 text-amber-500" />
              </div>
              {stats.lowStock > 0 && (
                <p className="text-xs text-amber-600 mt-1">⚠️ Reorder soon</p>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Units</p>
                  <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{stats.totalValue.toLocaleString()}</p>
                </div>
                <TrendingUp className="h-6 w-6 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Alerts Banner */}
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

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <Label>Search</Label>
                <div className="relative mt-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, generic name, or ID..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    {categories.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Stock Status</Label>
                <Select value={stockFilter} onValueChange={setStockFilter}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
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

        {/* Inventory List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading inventory...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadInventory}>Retry</Button>
              </CardContent>
            </Card>
          ) : filteredInventory.length > 0 ? (
            paginatedInventory.map((med) => {
              const stockStatus = getStockStatus(med);
              
              return (
                <Card 
                  key={med.id} 
                  className={`border-l-4 hover:shadow-md transition-shadow ${
                    stockStatus === 'Out of Stock' ? 'border-l-red-500' :
                    stockStatus === 'Low Stock' ? 'border-l-amber-500' :
                    'border-l-violet-500'
                  }`}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      {/* Avatar */}
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        stockStatus === 'Out of Stock' ? 'bg-red-100 dark:bg-red-900/30' :
                        stockStatus === 'Low Stock' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        'bg-emerald-100 dark:bg-emerald-900/30'
                      }`}>
                        <Pill className={`h-4 w-4 ${
                          stockStatus === 'Out of Stock' ? 'text-red-600' :
                          stockStatus === 'Low Stock' ? 'text-amber-600' :
                          'text-emerald-600'
                        }`} />
                      </div>
                      
                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        {/* Row 1: Name + Badges + Actions */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap min-w-0">
                            <span className="font-semibold text-foreground truncate">{med.name}</span>
                            <Badge variant="outline" className="text-[10px] px-1.5 py-0">{med.strength}</Badge>
                            <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStockColor(stockStatus)}`}>{stockStatus}</Badge>
                            <span className="text-[10px] font-medium text-muted-foreground">
                              {formatPackDisplay(med.currentStock, med.packSize)}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewDetails(med)} title="View Details">
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedMedication(med); setShowBatchesModal(true); }} title="View Batches">
                              <Layers className="h-4 w-4 text-muted-foreground hover:text-violet-500" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedMedication(med); setShowAdjustStockModal(true); }} title="Adjust Stock">
                              <ArrowUpDown className="h-4 w-4 text-muted-foreground hover:text-amber-500" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Row 2: Details */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span>{med.genericName}</span>
                          <span>•</span>
                          <span>{med.category}</span>
                          <span>•</span>
                          <span>{med.dosageForm}</span>
                          <span>•</span>
                              <span className={`flex items-center gap-1 ${getDaysUntilExpiry(med.expiryDate) <= 90 ? 'text-amber-600 dark:text-amber-400' : ''} ${getDaysUntilExpiry(med.expiryDate) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                                <Clock className="h-3 w-3" />
                                {getDaysUntilExpiry(med.expiryDate) < 0 ? 'Expired' : 
                                 getDaysUntilExpiry(med.expiryDate) <= 30 ? `${getDaysUntilExpiry(med.expiryDate)}d` :
                                 med.expiryDate}
                              </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No medications found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {filteredInventory.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={searchQuery || categoryFilter !== 'All Categories' || stockFilter !== 'all' 
                ? filteredInventory.length 
                : totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1); // Reset to first page when changing page size
              }}
              itemName="medications"
            />
          </Card>
        )}

        {/* View Details Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Pill className="h-5 w-5 text-violet-500" />
                {selectedMedication?.name}
              </DialogTitle>
            </DialogHeader>
            
            {selectedMedication && (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <Badge variant="outline" className={getStockColor(getStockStatus(selectedMedication))}>
                    {getStockStatus(selectedMedication)}
                  </Badge>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div><span className="text-muted-foreground">ID:</span> <span className="font-medium">{selectedMedication.id}</span></div>
                  <div><span className="text-muted-foreground">Generic Name:</span> <span className="font-medium">{selectedMedication.genericName}</span></div>
                  <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{selectedMedication.category}</span></div>
                  <div><span className="text-muted-foreground">Strength:</span> <span className="font-medium">{selectedMedication.strength}</span></div>
                  <div><span className="text-muted-foreground">Form:</span> <span className="font-medium">{selectedMedication.dosageForm}</span></div>
                  <div><span className="text-muted-foreground">Pack Size:</span> <span className="font-medium">{selectedMedication.packSize}</span></div>
                  <div><span className="text-muted-foreground">Manufacturer:</span> <span className="font-medium">{selectedMedication.manufacturer}</span></div>
                  <div><span className="text-muted-foreground">Last Restocked:</span> <span className="font-medium">{selectedMedication.lastRestocked}</span></div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Stock Levels</h4>
                  <div className="grid grid-cols-2 gap-4 text-center mb-3">
                    <div>
                      <p className="text-2xl font-bold text-foreground">
                        {formatPackDisplay(selectedMedication.currentStock, selectedMedication.packSize)}
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
                    <span className="text-muted-foreground">Expiry Date:</span>{' '}
                    <span className="font-medium">{selectedMedication.expiryDate}</span>
                  </p>
                </div>
              </div>
            )}
            
            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enhanced Add Stock Modal with Batch Tracking */}
        <Dialog open={showAddStockModal} onOpenChange={setShowAddStockModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-emerald-500" />
                Receive Stock
              </DialogTitle>
              <DialogDescription>
                Add new stock batch for {selectedMedication?.name}
              </DialogDescription>
            </DialogHeader>
            
            {selectedMedication && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-sm">
                  <div className="flex justify-between mb-2">
                    <span className="text-muted-foreground">Current Stock:</span>
                    <span className="font-medium">
                      {formatPackDisplay(selectedMedication.currentStock, selectedMedication.packSize)}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label className="flex items-center gap-1">
                      <Hash className="h-3 w-3" />
                      Batch Number *
                    </Label>
                    <Input
                      value={newBatch.batchNumber}
                      onChange={(e) => setNewBatch({ ...newBatch, batchNumber: e.target.value })}
                      placeholder="e.g., BT-2024-XXX"
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Quantity (Packs) *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newBatch.quantity || ''}
                      onChange={(e) => setNewBatch({ ...newBatch, quantity: parseInt(e.target.value) || 0 })}
                      placeholder="Enter quantity"
                      className="mt-1"
                    />
                    {newBatch.quantity > 0 && selectedMedication?.packSize && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Total: {(newBatch.quantity * (selectedMedication.packSize || 1)).toLocaleString()} units
                      </p>
                    )}
                  </div>
                  <div>
                    <Label className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      Expiry Date *
                    </Label>
                    <Input
                      type="date"
                      value={newBatch.expiryDate}
                      onChange={(e) => setNewBatch({ ...newBatch, expiryDate: e.target.value })}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Supplier</Label>
                    <Input
                      value={newBatch.supplier}
                      onChange={(e) => setNewBatch({ ...newBatch, supplier: e.target.value })}
                      placeholder="Supplier name"
                      className="mt-1"
                    />
                  </div>
                </div>

                {newBatch.quantity > 0 && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm">
                    <p className="text-emerald-700 dark:text-emerald-400">
                      New total stock: <strong>
                        {formatPackDisplay(selectedMedication.currentStock + (newBatch.quantity * (selectedMedication.packSize || 1)), selectedMedication.packSize)}
                      </strong>
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddStockModal(false);
                setNewBatch({ batchNumber: '', quantity: 0, expiryDate: '', supplier: '' });
              }}>Cancel</Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={async () => {
                  if (!newBatch.batchNumber || !newBatch.quantity || !newBatch.expiryDate) {
                    toast.error('Please fill in all required fields');
                    return;
                  }
                  
                  try {
                    // Get current inventory item to find medication ID
                    const currentItem = inventory.find(m => m.id === selectedMedication?.id);
                    if (!currentItem) {
                      toast.error('Medication not found');
                      return;
                    }
                    
                    // Get medication ID from the inventory API response
                    // Fetch the specific inventory item by ID to get the medication reference
                    const inventoryItems = await pharmacyService.getInventory({ search: currentItem.name, location });
                    const matchingItem = inventoryItems.results.find((item: any) => {
                      // Match by name or by ID if available
                      return item.medication_name === currentItem.name || 
                             item.id?.toString() === selectedMedication?.id;
                    });
                    
                    if (!matchingItem) {
                      toast.error('Could not find medication in inventory. Please try adding the medication first.');
                      return;
                    }
                    
                    // Get medication ID - it should be in the medication field
                    const medicationId = matchingItem.medication;
                    if (!medicationId) {
                      toast.error('Could not find medication ID. Please try adding the medication first.');
                      return;
                    }
                    
                    // Create new inventory batch entry via API
                    await pharmacyService.createInventoryItem({
                      medication: typeof medicationId === 'number' ? medicationId : parseInt(medicationId),
                      batch_number: newBatch.batchNumber,
                      expiry_date: newBatch.expiryDate,
                      quantity: newBatch.quantity * (currentItem.packSize || 1),
                      unit: currentItem.dosageForm || 'unit',
                      min_stock_level: currentItem.minimumStock,
                      supplier: newBatch.supplier,
                      location,
                    });
                    
                    toast.success(`Added ${newBatch.quantity} packs of ${selectedMedication?.name} (Batch: ${newBatch.batchNumber})`);
                    setShowAddStockModal(false);
                    setNewBatch({ batchNumber: '', quantity: 0, expiryDate: '', supplier: '' });
                    await loadInventory(); // Reload inventory
                    await loadAllInventoryForStats(); // Reload stats
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to add stock');
                    console.error('Error adding stock:', err);
                  }
                }}
                disabled={!newBatch.batchNumber || !newBatch.quantity || !newBatch.expiryDate}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Receive Stock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Stock Adjustment Modal */}
        <Dialog open={showAdjustStockModal} onOpenChange={setShowAdjustStockModal}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowUpDown className="h-5 w-5 text-amber-500" />
                Adjust Stock
              </DialogTitle>
              <DialogDescription>
                Adjust stock for {selectedMedication?.name}
              </DialogDescription>
            </DialogHeader>
            
            {selectedMedication && (
              <div className="space-y-4">
                <div className="bg-muted/50 rounded-lg p-4 text-sm text-center">
                  <p className="text-muted-foreground">Current Stock</p>
                  <p className="text-2xl sm:text-3xl font-bold">
                    {formatPackDisplay(selectedMedication.currentStock, selectedMedication.packSize)}
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <Button
                    variant={adjustmentForm.type === 'increase' ? 'default' : 'outline'}
                    className={adjustmentForm.type === 'increase' ? 'bg-emerald-500 hover:bg-emerald-600' : ''}
                    onClick={() => setAdjustmentForm({ ...adjustmentForm, type: 'increase' })}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Increase
                  </Button>
                  <Button
                    variant={adjustmentForm.type === 'decrease' ? 'default' : 'outline'}
                    className={adjustmentForm.type === 'decrease' ? 'bg-red-500 hover:bg-red-600' : ''}
                    onClick={() => setAdjustmentForm({ ...adjustmentForm, type: 'decrease' })}
                  >
                    <Minus className="h-4 w-4 mr-2" />
                    Decrease
                  </Button>
                </div>

                <div>
                  <Label>Quantity (Packs) *</Label>
                  <Input
                    type="number"
                    min="1"
                    max={adjustmentForm.type === 'decrease' ? Math.floor(selectedMedication.currentStock / (selectedMedication.packSize || 1)) : undefined}
                    value={adjustmentForm.quantity || ''}
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
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select reason" /></SelectTrigger>
                    <SelectContent>
                      {adjustmentReasons.map(reason => (
                        <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                  <div className={`p-3 rounded-lg text-sm ${adjustmentForm.type === 'increase' ? 'bg-emerald-50 dark:bg-emerald-900/20' : 'bg-red-50 dark:bg-red-900/20'}`}>
                    <p className={adjustmentForm.type === 'increase' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}>
                      New stock level: <strong>
                        {(() => {
                          const current = selectedMedication.currentStock;
                          const packSize = selectedMedication.packSize || 1;
                          const adjustPacks = adjustmentForm.quantity;
                          const adjustUnits = adjustPacks * packSize;
                          const next =
                            adjustmentForm.type === 'increase'
                              ? current + adjustUnits
                              : current - adjustUnits;
                          return formatPackDisplay(Math.max(0, next), packSize);
                        })()}
                      </strong>
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAdjustStockModal(false);
                setAdjustmentForm({ type: 'decrease', quantity: 0, reason: '', notes: '' });
              }}>Cancel</Button>
              <Button 
                className={adjustmentForm.type === 'increase' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'}
                onClick={async () => {
                  if (!adjustmentForm.quantity || !adjustmentForm.reason) {
                    toast.error('Please fill in all required fields');
                    return;
                  }
                  
                  const packSize = selectedMedication!.packSize || 1;
                  const adjustUnits = adjustmentForm.quantity * packSize;
                  
                  const newStock = adjustmentForm.type === 'increase' 
                    ? selectedMedication!.currentStock + adjustUnits
                    : selectedMedication!.currentStock - adjustUnits;
                  
                  if (newStock < 0) {
                    toast.error('Stock cannot be negative');
                    return;
                  }

                  try {
                    // Update inventory item via API
                    const inventoryId = parseInt(selectedMedication?.id || '');
                    if (!inventoryId) {
                      toast.error('Invalid inventory item ID');
                      return;
                    }
                    
                    await pharmacyService.updateInventoryItem(inventoryId, {
                      quantity: newStock,
                    });
                    
                    toast.success(`Stock ${adjustmentForm.type === 'increase' ? 'increased' : 'decreased'} by ${adjustmentForm.quantity} packs (${adjustUnits} units)`);
                    setShowAdjustStockModal(false);
                    setAdjustmentForm({ type: 'decrease', quantity: 0, reason: '', notes: '' });
                    await loadInventory(); // Reload inventory
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to adjust stock');
                    console.error('Error adjusting stock:', err);
                  }
                }}
                disabled={!adjustmentForm.quantity || !adjustmentForm.reason}
              >
                <CheckCircle2 className="h-4 w-4 mr-2" />
                Confirm Adjustment
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Batches Modal */}
        <Dialog open={showBatchesModal} onOpenChange={setShowBatchesModal}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-violet-500" />
                Batch Details - {selectedMedication?.name}
              </DialogTitle>
              <DialogDescription>
                View all batches and expiry information
              </DialogDescription>
            </DialogHeader>
            
            {selectedMedication && (
              <div className="overflow-y-auto max-h-[50vh] space-y-3">
                {selectedMedication.batches && selectedMedication.batches.length > 0 ? (
                  selectedMedication.batches.map((batch, idx) => {
                    const daysUntilExpiry = getDaysUntilExpiry(batch.expiryDate);
                    const isExpired = daysUntilExpiry < 0;
                    const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 90;
                    
                    return (
                      <Card key={batch.id} className={`border-l-4 ${
                        isExpired ? 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10' :
                        isExpiringSoon ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10' :
                        'border-l-emerald-500'
                      }`}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Hash className="h-4 w-4 text-muted-foreground" />
                              <span className="font-medium">{batch.batchNumber}</span>
                              {idx === 0 && <Badge variant="secondary" className="text-[10px]">Primary</Badge>}
                            </div>
                            <Badge className={getExpiryBadgeColor(batch.expiryDate)}>
                              {isExpired ? 'EXPIRED' : isExpiringSoon ? `Expires in ${daysUntilExpiry} days` : `Exp: ${batch.expiryDate}`}
                            </Badge>
                          </div>
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                            <div>
                              <span className="text-muted-foreground">Quantity:</span>{' '}
                              <span className="font-medium">
                                {formatPackDisplay(Number(batch.quantity || 0), selectedMedication?.packSize)}
                              </span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Received:</span>{' '}
                              <span className="font-medium">{batch.receivedDate}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Supplier:</span>{' '}
                              <span className="font-medium">{batch.supplier || 'N/A'}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2" />
                    <p>No batch information available</p>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBatchesModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Medication Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Plus className="h-5 w-5 text-violet-500" />
                Add New Medication
              </DialogTitle>
            </DialogHeader>
            
            <div className="overflow-y-auto max-h-[60vh] space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Brand Name *</Label>
                  <Input
                    value={newMedication.name}
                    onChange={(e) => setNewMedication({...newMedication, name: e.target.value})}
                    placeholder="e.g., Amoxil"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Generic Name *</Label>
                  <Input
                    value={newMedication.genericName}
                    onChange={(e) => setNewMedication({...newMedication, genericName: e.target.value})}
                    placeholder="e.g., Amoxicillin"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Category *</Label>
                  <Select value={newMedication.category} onValueChange={(v) => setNewMedication({...newMedication, category: v})}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {categories.filter(c => c.value !== 'All Categories').map(cat => (
                        <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Strength *</Label>
                  <Select value={newMedication.strength} onValueChange={(v) => setNewMedication({...newMedication, strength: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select strength" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {MEDICATION_STRENGTHS.map((strength) => (
                        <SelectItem key={strength} value={strength}>{strength}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Dosage Form *</Label>
                  <Select value={newMedication.dosageForm} onValueChange={(v) => setNewMedication({...newMedication, dosageForm: v})}>
                    <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dosageForms.map(form => (
                        <SelectItem key={form} value={form}>{form}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pack Size</Label>
                  <Input
                    type="number"
                    value={newMedication.packSize}
                    onChange={(e) => setNewMedication({...newMedication, packSize: parseInt(e.target.value) || 10})}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Manufacturer</Label>
                  <Select value={newMedication.manufacturer} onValueChange={(v) => setNewMedication({...newMedication, manufacturer: v})}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Select manufacturer" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {MEDICATION_MANUFACTURERS.map((manufacturer) => (
                        <SelectItem key={manufacturer} value={manufacturer}>{manufacturer}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Minimum Stock</Label>
                  <Input
                    type="number"
                    value={newMedication.minimumStock}
                    onChange={(e) => setNewMedication({...newMedication, minimumStock: parseInt(e.target.value) || 0})}
                    className="mt-1"
                  />
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
              <Button 
                className="bg-violet-600 hover:bg-violet-700"
                onClick={handleAddMedication}
                disabled={!newMedication.name || !newMedication.genericName || !newMedication.strength}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Medication
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showRequestDetailsModal} onOpenChange={setShowRequestDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-violet-500" />
                Request Details
              </DialogTitle>
            </DialogHeader>
            {selectedRequest && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Request ID</p>
                    <p className="font-medium">{selectedRequest.request_id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <p className="font-medium">{selectedRequest.status}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">From</p>
                    <p className="font-medium">{selectedRequest.from_location}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">To</p>
                    <p className="font-medium">{selectedRequest.to_location}</p>
                  </div>
                </div>

                {selectedRequest.notes && (
                  <div className="rounded-lg border p-3 text-sm">
                    <p className="text-muted-foreground">Notes</p>
                    <p className="mt-1">{selectedRequest.notes}</p>
                  </div>
                )}

                <div className="space-y-2">
                  <p className="font-medium">Items</p>
                  <div className="space-y-2">
                    {(selectedRequest.items || []).map((it) => (
                      <div key={it.id || `${it.medication}-${it.medication_name}`} className="rounded-lg border p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium truncate">{it.medication_name || `Medication ${it.medication}`}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              Requested: {it.quantity} {it.unit || "unit"} • Issued: {Number(it.fulfilled_quantity || 0)} {it.unit || "unit"}
                            </p>
                          </div>
                          {Number(it.fulfilled_quantity || 0) >= it.quantity ? (
                            <Badge className="bg-emerald-100 text-emerald-800">Full</Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800">Partial</Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRequestDetailsModal(false)}>
                Close
              </Button>
              {selectedRequest && (selectedRequest.status === "fulfilled" || selectedRequest.status === "partially_fulfilled") && (
                <Button onClick={() => openConfirmReceipt(selectedRequest)} className="bg-emerald-600 hover:bg-emerald-700">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  Confirm Receipt
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showConfirmReceiptModal} onOpenChange={setShowConfirmReceiptModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                Confirm Received Stock
              </DialogTitle>
              <DialogDescription>Confirm that the dispensary has received the issued stock.</DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Confirmation Notes (optional)</Label>
              <Textarea value={confirmNotes} onChange={(e) => setConfirmNotes(e.target.value)} placeholder="e.g., Received complete, no discrepancies" />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowConfirmReceiptModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleConfirmReceipt} disabled={confirmingReceipt} className="bg-emerald-600 hover:bg-emerald-700">
                {confirmingReceipt ? "Confirming..." : "Confirm Receipt"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
