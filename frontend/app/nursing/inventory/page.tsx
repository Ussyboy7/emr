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
import { pharmacyService } from '@/lib/services';
import { PHARMACY_LOCATIONS } from '@/lib/constants/pharmacy-locations';
import {
  Database, Search, Pill, Package, AlertTriangle, Eye,
  Layers, XCircle, TrendingUp, Hash, Clock, Loader2, RefreshCw
} from 'lucide-react';
import { MEDICATION_CATEGORIES } from '@/lib/constants/pharmacy';

interface MedicationBatch {
  id: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  receivedDate: string;
  supplier: string;
  sourceFromCentralStore?: { request_id?: string; issue_id?: string; issued_at?: string; from_location?: string } | null;
}

interface MedicationInventoryItem {
  id: string;
  medicationId?: number;
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

export default function NursingInventoryPage() {
  const location = PHARMACY_LOCATIONS.WARD_CARE;
  const [inventory, setInventory] = useState<MedicationInventoryItem[]>([]);
  const [allInventoryForStats, setAllInventoryForStats] = useState<MedicationInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [stockFilter, setStockFilter] = useState('all');

  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  const [showViewModal, setShowViewModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<MedicationInventoryItem | null>(null);

  useEffect(() => {
    loadAllInventoryForStats();
  }, []);

  useEffect(() => {
    loadInventory();
  }, [currentPage, itemsPerPage, searchQuery, categoryFilter, stockFilter]);

  useEffect(() => {
    if (currentPage !== 1) setCurrentPage(1);
  }, [searchQuery, categoryFilter, stockFilter]);

  const transformInventoryItems = (results: any[]): MedicationInventoryItem[] => {
    return results.map((item: any) => {
      const medication = item.medication || {};
      const medicationName = item.medication_name || medication.name || 'Unknown';
      const genericName = (medication.generic && medication.generic.name) || '';
      const strength = medication.strength || '';
      const dosageForm = medication.form || medication.dosage_form || '';
      const category = medication.category || 'All Categories';
      const medicationId = typeof item.medication === 'number'
        ? item.medication
        : (item.medication?.id ? (typeof item.medication.id === 'number' ? item.medication.id : parseInt(item.medication.id)) : undefined);

      return {
        id: item.id.toString(),
        medicationId,
        name: medicationName,
        genericName,
        category,
        strength,
        dosageForm,
        packSize: medication.pack_size || 10,
        manufacturer: medication.manufacturer || '',
        currentStock: Number(item.quantity),
        minimumStock: Number(item.min_stock_level),
        lastRestocked: (item as any).created_at?.split('T')[0] || (item as any).updated_at?.split('T')[0] || '',
        expiryDate: item.expiry_date,
        batches: [{
          id: item.id.toString(),
          batchNumber: item.batch_number,
          quantity: Number(item.quantity),
          expiryDate: item.expiry_date,
          receivedDate: (item.source_from_central_store?.issued_at?.split('T')[0]) || (item as any).created_at?.split('T')[0] || '',
          supplier: item.supplier || '',
          sourceFromCentralStore: item.source_from_central_store || null,
        }] as MedicationBatch[],
      };
    });
  };

  const loadAllInventoryForStats = async () => {
    try {
      const response = await pharmacyService.getInventory({ page: 1, page_size: 10000, location });
      setAllInventoryForStats(transformInventoryItems(response.results));
    } catch (err) {
      console.error('Error loading ward care inventory stats:', err);
    }
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
      if (categoryFilter !== 'All Categories') params.medication__category = categoryFilter;
      if (stockFilter !== 'all') params.stock_status = stockFilter;
      const response = await pharmacyService.getInventory(params);
      setTotalCount(response.count || response.results.length);
      setInventory(transformInventoryItems(response.results));
    } catch (err: any) {
      setError(err.message || 'Failed to load inventory');
      console.error('Error loading ward care inventory:', err);
    } finally {
      setLoading(false);
    }
  };

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

  const stats = useMemo(() => ({
    total: allInventoryForStats.length,
    outOfStock: allInventoryForStats.filter(m => m.currentStock === 0).length,
    lowStock: allInventoryForStats.filter(m => m.currentStock > 0 && m.currentStock <= m.minimumStock).length,
    totalUnits: allInventoryForStats.reduce((sum, m) => sum + m.currentStock, 0),
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
    return Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
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

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Database className="h-8 w-8 text-teal-500" />
              Ward Stock
            </h1>
                <p className="text-muted-foreground mt-1">Ward Care stock received from Central Store</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { loadInventory(); loadAllInventoryForStats(); }}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
            <Button asChild className="bg-teal-600 hover:bg-teal-700">
              <Link href="/nursing/requests">Request from Central Store</Link>
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total Items</p>
                  <p className="text-2xl sm:text-3xl font-bold text-teal-600">{stats.total}</p>
                </div>
                <Package className="h-6 w-6 text-teal-500" />
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
              {stats.outOfStock > 0 && <p className="text-xs text-red-600 mt-1">Requires attention</p>}
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
              {stats.lowStock > 0 && <p className="text-xs text-amber-600 mt-1">Reorder soon</p>}
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

        {/* Stock Alerts Banner */}
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
                    Consider requesting from Central Store.
                  </p>
                </div>
                <Button asChild variant="outline" size="sm" className="ml-auto border-amber-400 text-amber-700 hover:bg-amber-100 dark:hover:bg-amber-900/30">
                  <Link href="/nursing/requests">Request Stock</Link>
                </Button>
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
                    placeholder="Search by name, generic name..."
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
                <p>Loading ward stock...</p>
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
          ) : inventory.length > 0 ? (
            inventory.map((med) => {
              const stockStatus = getStockStatus(med);
              return (
                <Card
                  key={med.id}
                  className={`border-l-4 hover:shadow-md transition-shadow ${
                    stockStatus === 'Out of Stock' ? 'border-l-red-500' :
                    stockStatus === 'Low Stock' ? 'border-l-amber-500' :
                    'border-l-teal-500'
                  }`}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${
                        stockStatus === 'Out of Stock' ? 'bg-red-100 dark:bg-red-900/30' :
                        stockStatus === 'Low Stock' ? 'bg-amber-100 dark:bg-amber-900/30' :
                        'bg-teal-100 dark:bg-teal-900/30'
                      }`}>
                        <Pill className={`h-4 w-4 ${
                          stockStatus === 'Out of Stock' ? 'text-red-600' :
                          stockStatus === 'Low Stock' ? 'text-amber-600' :
                          'text-teal-600'
                        }`} />
                      </div>
                      <div className="flex-1 min-w-0">
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
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedMedication(med); setShowViewModal(true); }} title="View Details">
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedMedication(med); setShowBatchesModal(true); }} title="View Receipts">
                              <Layers className="h-4 w-4 text-muted-foreground hover:text-teal-500" />
                            </Button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          {med.genericName && <><span>{med.genericName}</span><span>•</span></>}
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
                <p className="text-lg font-medium mb-1">No ward stock found</p>
                <p className="text-sm text-muted-foreground mb-4">Request medications from Central Store to get started</p>
                <Button asChild className="bg-teal-600 hover:bg-teal-700">
                  <Link href="/nursing/requests">Request from Central Store</Link>
                </Button>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {inventory.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={searchQuery || categoryFilter !== 'All Categories' || stockFilter !== 'all'
                ? inventory.length
                : totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => { setItemsPerPage(newSize); setCurrentPage(1); }}
              itemName="medications"
            />
          </Card>
        )}

        {/* View Details Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Pill className="h-5 w-5 text-teal-500" />
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
                  <div className="grid grid-cols-2 gap-4 text-center">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{formatPackDisplay(selectedMedication.currentStock, selectedMedication.packSize)}</p>
                      <p className="text-xs text-muted-foreground">Current</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600">{formatPackDisplay(selectedMedication.minimumStock, selectedMedication.packSize)}</p>
                      <p className="text-xs text-muted-foreground">Minimum</p>
                    </div>
                  </div>
                </div>
                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-2">Expiry</h4>
                  <p className="text-sm">
                    <span className="text-muted-foreground">Expiry Date:</span>{' '}
                    <span className="font-medium">{selectedMedication.expiryDate}</span>
                  </p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View Receipts Modal */}
        <Dialog open={showBatchesModal} onOpenChange={setShowBatchesModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Layers className="h-5 w-5 text-teal-500" />
                Ward Receipts — {selectedMedication?.name}
              </DialogTitle>
              <DialogDescription>Transfer receipts from Central Store to Ward Care</DialogDescription>
            </DialogHeader>
            {selectedMedication && (
              <div className="overflow-y-auto max-h-[50vh] space-y-3">
                {selectedMedication.batches && selectedMedication.batches.length > 0 ? (
                  selectedMedication.batches.map((batch, idx) => {
                    const daysUntilExpiry = getDaysUntilExpiry(batch.expiryDate);
                    const isExpired = daysUntilExpiry < 0;
                    const isExpiringSoon = daysUntilExpiry >= 0 && daysUntilExpiry <= 90;
                    const sourceLabel = batch.sourceFromCentralStore?.from_location || batch.supplier || 'N/A';
                    const requestId = batch.sourceFromCentralStore?.request_id || '—';
                    const issuedDate = batch.sourceFromCentralStore?.issued_at?.split('T')[0] || '—';
                    return (
                      <Card key={batch.id} className={`border-l-4 ${
                        isExpired ? 'border-l-red-500 bg-red-50/50 dark:bg-red-900/10' :
                        isExpiringSoon ? 'border-l-amber-500 bg-amber-50/50 dark:bg-amber-900/10' :
                        'border-l-teal-500'
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
                              <span className="font-medium">{formatPackDisplay(Number(batch.quantity || 0), selectedMedication?.packSize)}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Received:</span>{' '}
                              <span className="font-medium">{batch.receivedDate}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Source:</span>{' '}
                              <span className="font-medium">{sourceLabel}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Request:</span>{' '}
                              <span className="font-medium">{requestId}</span>
                            </div>
                          </div>
                          {batch.sourceFromCentralStore && (
                            <div className="mt-2 text-xs">
                              <span className="text-muted-foreground">Issued:</span>{' '}
                              <span className="font-medium">{issuedDate}</span>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-2" />
                    <p>No receipts available</p>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBatchesModal(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
