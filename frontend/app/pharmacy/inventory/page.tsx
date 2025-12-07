"use client";

import { useState, useMemo, useEffect } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { pharmacyService, type MedicationInventory as ApiMedicationInventory, type Medication as ApiMedication } from '@/lib/services';
import { 
  Database, Search, Plus, Pill, Package, AlertTriangle, Eye, Edit, 
  RefreshCw, Layers, Calendar, CheckCircle2, XCircle, TrendingUp, 
  TrendingDown, Upload, Hash, Minus, ArrowUpDown, Clock, Beaker, Loader2
} from 'lucide-react';

// Batch interface
interface MedicationBatch {
  id: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  receivedDate: string;
  supplier: string;
  unitCost: number;
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
  name: string;
  genericName: string;
  category: string;
  strength: string;
  dosageForm: string;
  packSize: number;
  manufacturer: string;
  currentStock: number;
  minimumStock: number;
  maximumStock: number;
  location: string;
  prescriptionRequired: boolean;
  isGeneric: boolean;
  lastRestocked: string;
  expiryDate: string;
  batches: MedicationBatch[];
}

const categories = [
  'All Categories', 'Antibiotics', 'Analgesics', 'Cardiovascular', 'Diabetes',
  'Gastrointestinal', 'Vitamins & Supplements', 'Oncology', 'Respiratory'
];

const dosageForms = ['Tablet', 'Capsule', 'Syrup', 'Injection', 'Cream', 'Ointment', 'Drops', 'Inhaler', 'Suspension', 'Powder'];

export default function InventoryPage() {
  const [inventory, setInventory] = useState<MedicationInventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All Categories');
  const [stockFilter, setStockFilter] = useState('all');

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Load inventory from API
  useEffect(() => {
    loadInventory();
  }, [currentPage]);

  const loadInventory = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await pharmacyService.getInventory({
        page: currentPage,
      });
      // Transform API data to frontend format
      const transformed = response.results.map((item: ApiMedicationInventory) => ({
        id: item.id.toString(),
        name: item.medication_name || 'Unknown',
        genericName: '',
        category: 'All Categories',
        strength: '',
        dosageForm: '',
        packSize: 10,
        manufacturer: '',
        currentStock: Number(item.quantity),
        minimumStock: Number(item.min_stock_level),
        maximumStock: Number(item.min_stock_level) * 10,
        location: item.location || '',
        prescriptionRequired: false,
        isGeneric: false,
        lastRestocked: item.created_at?.split('T')[0] || '',
        expiryDate: item.expiry_date,
        batches: [{
          id: item.id.toString(),
          batchNumber: item.batch_number,
          quantity: Number(item.quantity),
          expiryDate: item.expiry_date,
          receivedDate: item.created_at?.split('T')[0] || '',
          supplier: item.supplier || '',
          unitCost: 0,
        }] as MedicationBatch[],
      }));
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
  const [showEditModal, setShowEditModal] = useState(false);
  const [showAddStockModal, setShowAddStockModal] = useState(false);
  const [showAdjustStockModal, setShowAdjustStockModal] = useState(false);
  const [showBatchesModal, setShowBatchesModal] = useState(false);
  const [selectedMedication, setSelectedMedication] = useState<MedicationInventoryItem | null>(null);
  const [addStockAmount, setAddStockAmount] = useState(0);
  
  // Add stock form
  const [newBatch, setNewBatch] = useState({
    batchNumber: '',
    quantity: 0,
    expiryDate: '',
    supplier: '',
    unitCost: 0,
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
    packSize: 10, manufacturer: '', minimumStock: 100, maximumStock: 1000, 
    location: '', prescriptionRequired: false, isGeneric: false
  });

  // Filter inventory
  const filteredInventory = useMemo(() => {
    return inventory.filter(med => {
      const matchesSearch = 
        med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.genericName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.id.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesCategory = categoryFilter === 'All Categories' || med.category === categoryFilter;
      const matchesStock = stockFilter === 'all' ||
        (stockFilter === 'out' && med.currentStock === 0) ||
        (stockFilter === 'low' && med.currentStock > 0 && med.currentStock <= med.minimumStock) ||
        (stockFilter === 'normal' && med.currentStock > med.minimumStock && med.currentStock <= med.maximumStock) ||
        (stockFilter === 'over' && med.currentStock > med.maximumStock);
      return matchesSearch && matchesCategory && matchesStock;
    });
  }, [inventory, searchQuery, categoryFilter, stockFilter]);

  // Paginated inventory
  const paginatedInventory = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredInventory.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredInventory, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, categoryFilter, stockFilter]);

  // Check for expiring soon items (within 90 days)
  const getExpiringItems = useMemo(() => {
    const today = new Date();
    const ninetyDaysFromNow = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
    return inventory.filter(med => {
      const expiry = new Date(med.expiryDate);
      return expiry <= ninetyDaysFromNow && expiry >= today;
    });
  }, [inventory]);

  const getExpiredItems = useMemo(() => {
    const today = new Date();
    return inventory.filter(med => new Date(med.expiryDate) < today);
  }, [inventory]);

  // Stats
  const stats = useMemo(() => ({
    total: inventory.length,
    outOfStock: inventory.filter(m => m.currentStock === 0).length,
    lowStock: inventory.filter(m => m.currentStock > 0 && m.currentStock <= m.minimumStock).length,
    totalValue: inventory.reduce((sum, m) => sum + m.currentStock, 0),
    expiringSoon: getExpiringItems.length,
    expired: getExpiredItems.length,
  }), [inventory, getExpiringItems, getExpiredItems]);
  
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
    if (med.currentStock > med.maximumStock) return 'Overstocked';
    return 'In Stock';
  };

  const getStockColor = (status: string) => {
    switch (status) {
      case 'Out of Stock': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      case 'Low Stock': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      case 'In Stock': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Overstocked': return 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getStockPercentage = (med: MedicationInventoryItem) => {
    return Math.min((med.currentStock / med.maximumStock) * 100, 100);
  };

  const getProgressColor = (med: MedicationInventoryItem) => {
    const percentage = getStockPercentage(med);
    if (percentage === 0) return 'bg-red-500';
    if (percentage <= 25) return 'bg-amber-500';
    if (percentage > 100) return 'bg-violet-500';
    return 'bg-emerald-500';
  };

  const handleViewDetails = (med: MedicationInventoryItem) => {
    setSelectedMedication(med);
    setShowViewModal(true);
  };

  const handleEditMedication = (med: MedicationInventoryItem) => {
    setSelectedMedication(med);
    setShowEditModal(true);
  };

  const handleAddStock = (med: MedicationInventoryItem) => {
    setSelectedMedication(med);
    setAddStockAmount(0);
    setShowAddStockModal(true);
  };

  const confirmAddStock = () => {
    if (!selectedMedication || addStockAmount <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    setInventory(prev => prev.map(med => 
      med.id === selectedMedication.id 
        ? { ...med, currentStock: med.currentStock + addStockAmount, lastRestocked: new Date().toISOString().split('T')[0] }
        : med
    ));

    toast.success(`Added ${addStockAmount} units to ${selectedMedication.name}`);
    setShowAddStockModal(false);
    setSelectedMedication(null);
    setAddStockAmount(0);
  };

  const handleAddMedication = () => {
    const newId = `MED-${String(inventory.length + 1).padStart(3, '0')}`;
    const medication = {
      ...newMedication,
      id: newId,
      currentStock: 0,
      lastRestocked: '-',
      expiryDate: '-'
    };
    
    setInventory(prev => [...prev, medication]);
    toast.success(`${newMedication.name} added to inventory`);
    setShowAddModal(false);
    setNewMedication({
      name: '', genericName: '', category: 'Analgesics', strength: '', dosageForm: 'Tablet',
      packSize: 10, manufacturer: '', minimumStock: 100, maximumStock: 1000,
      location: '', prescriptionRequired: false, isGeneric: false
    });
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Database className="h-8 w-8 text-violet-500" />
              Drug Inventory
            </h1>
            <p className="text-muted-foreground mt-1">Manage medication stock and track inventory levels</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadInventory} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button variant="outline">
              <Upload className="h-4 w-4 mr-2" />
              Bulk Upload
            </Button>
            <Button className="bg-violet-600 hover:bg-violet-700" onClick={() => setShowAddModal(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Medication
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
                  <p className="text-3xl font-bold text-violet-600">{stats.total}</p>
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
                  <p className="text-3xl font-bold text-red-600">{stats.outOfStock}</p>
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
                  <p className="text-3xl font-bold text-amber-600">{stats.lowStock}</p>
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
                  <p className="text-3xl font-bold text-emerald-600">{stats.totalValue.toLocaleString()}</p>
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
                  <SelectContent>
                    {categories.map(cat => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
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
                    <SelectItem value="over">Overstocked</SelectItem>
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
              const stockPercentage = getStockPercentage(med);
              
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
                            <span className={`text-[10px] font-medium ${stockStatus !== 'In Stock' ? 'text-red-600 dark:text-red-400' : 'text-muted-foreground'}`}>
                              {med.currentStock}/{med.maximumStock}
                            </span>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewDetails(med)} title="View Details">
                              <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedMedication(med); setShowBatchesModal(true); }} title="View Batches">
                              <Layers className="h-4 w-4 text-muted-foreground hover:text-violet-500" />
                            </Button>
                            <Button size="sm" className="h-7 px-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs" onClick={() => handleAddStock(med)} title="Add Stock">
                              <Plus className="h-3 w-3 mr-1" />Add
                            </Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => { setSelectedMedication(med); setShowAdjustStockModal(true); }} title="Adjust Stock">
                              <ArrowUpDown className="h-4 w-4 text-muted-foreground hover:text-amber-500" />
                            </Button>
                          </div>
                        </div>
                        
                        {/* Row 2: Details + Progress */}
                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                          <span>{med.genericName}</span>
                          <span>•</span>
                          <span>{med.category}</span>
                          <span>•</span>
                          <span>{med.dosageForm}</span>
                          <span>•</span>
                          <span>{med.location}</span>
                          <span>•</span>
                          <span className={`flex items-center gap-1 ${getDaysUntilExpiry(med.expiryDate) <= 90 ? 'text-amber-600 dark:text-amber-400' : ''} ${getDaysUntilExpiry(med.expiryDate) < 0 ? 'text-red-600 dark:text-red-400' : ''}`}>
                            <Clock className="h-3 w-3" />
                            {getDaysUntilExpiry(med.expiryDate) < 0 ? 'Expired' : 
                             getDaysUntilExpiry(med.expiryDate) <= 30 ? `${getDaysUntilExpiry(med.expiryDate)}d` :
                             med.expiryDate}
                          </span>
                          <div className="flex-1 max-w-[80px] ml-2">
                            <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full ${getProgressColor(med)}`} style={{ width: `${stockPercentage}%` }} />
                            </div>
                          </div>
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
              totalItems={filteredInventory.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="medications"
            />
          </Card>
        )}

        {/* View Details Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="max-w-2xl">
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
                  {selectedMedication.prescriptionRequired && (
                    <Badge variant="outline" className="bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                      Rx Required
                    </Badge>
                  )}
                  {selectedMedication.isGeneric && (
                    <Badge variant="outline">Generic</Badge>
                  )}
                </div>

                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div><span className="text-muted-foreground">ID:</span> <span className="font-medium">{selectedMedication.id}</span></div>
                  <div><span className="text-muted-foreground">Generic Name:</span> <span className="font-medium">{selectedMedication.genericName}</span></div>
                  <div><span className="text-muted-foreground">Category:</span> <span className="font-medium">{selectedMedication.category}</span></div>
                  <div><span className="text-muted-foreground">Strength:</span> <span className="font-medium">{selectedMedication.strength}</span></div>
                  <div><span className="text-muted-foreground">Form:</span> <span className="font-medium">{selectedMedication.dosageForm}</span></div>
                  <div><span className="text-muted-foreground">Pack Size:</span> <span className="font-medium">{selectedMedication.packSize}</span></div>
                  <div><span className="text-muted-foreground">Manufacturer:</span> <span className="font-medium">{selectedMedication.manufacturer}</span></div>
                  <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{selectedMedication.location}</span></div>
                  <div><span className="text-muted-foreground">Last Restocked:</span> <span className="font-medium">{selectedMedication.lastRestocked}</span></div>
                </div>

                <div className="bg-muted/50 rounded-lg p-4">
                  <h4 className="font-medium mb-3">Stock Levels</h4>
                  <div className="grid grid-cols-3 gap-4 text-center mb-3">
                    <div>
                      <p className="text-2xl font-bold text-foreground">{selectedMedication.currentStock.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Current</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-amber-600">{selectedMedication.minimumStock}</p>
                      <p className="text-xs text-muted-foreground">Minimum</p>
                    </div>
                    <div>
                      <p className="text-2xl font-bold text-emerald-600">{selectedMedication.maximumStock.toLocaleString()}</p>
                      <p className="text-xs text-muted-foreground">Maximum</p>
                    </div>
                  </div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${getProgressColor(selectedMedication)}`}
                      style={{ width: `${getStockPercentage(selectedMedication)}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {Math.round(getStockPercentage(selectedMedication))}% of maximum capacity
                  </p>
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
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setShowViewModal(false);
                  if (selectedMedication) handleAddStock(selectedMedication);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add Stock
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enhanced Add Stock Modal with Batch Tracking */}
        <Dialog open={showAddStockModal} onOpenChange={setShowAddStockModal}>
          <DialogContent className="max-w-lg">
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
                    <span className="font-medium">{selectedMedication.currentStock.toLocaleString()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Maximum Stock:</span>
                    <span className="font-medium">{selectedMedication.maximumStock.toLocaleString()}</span>
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
                    <Label>Quantity *</Label>
                    <Input
                      type="number"
                      min="1"
                      value={newBatch.quantity || ''}
                      onChange={(e) => setNewBatch({ ...newBatch, quantity: parseInt(e.target.value) || 0 })}
                      placeholder="Enter quantity"
                      className="mt-1"
                    />
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
                  <div className="col-span-2">
                    <Label>Unit Cost (₦)</Label>
                    <Input
                      type="number"
                      min="0"
                      value={newBatch.unitCost || ''}
                      onChange={(e) => setNewBatch({ ...newBatch, unitCost: parseFloat(e.target.value) || 0 })}
                      placeholder="Cost per unit"
                      className="mt-1"
                    />
                  </div>
                </div>

                {newBatch.quantity > 0 && (
                  <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm">
                    <p className="text-emerald-700 dark:text-emerald-400">
                      New total stock: <strong>{(selectedMedication.currentStock + newBatch.quantity).toLocaleString()}</strong> units
                    </p>
                    {newBatch.unitCost > 0 && (
                      <p className="text-emerald-600 dark:text-emerald-500 text-xs mt-1">
                        Total value: ₦{(newBatch.quantity * newBatch.unitCost).toLocaleString()}
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddStockModal(false);
                setNewBatch({ batchNumber: '', quantity: 0, expiryDate: '', supplier: '', unitCost: 0 });
              }}>Cancel</Button>
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  if (!newBatch.batchNumber || !newBatch.quantity || !newBatch.expiryDate) {
                    toast.error('Please fill in all required fields');
                    return;
                  }
                  setInventory(prev => prev.map(med => 
                    med.id === selectedMedication?.id 
                      ? { 
                          ...med, 
                          currentStock: med.currentStock + newBatch.quantity, 
                          lastRestocked: new Date().toISOString().split('T')[0],
                          batches: [...(med.batches || []), {
                            id: `B${Date.now()}`,
                            batchNumber: newBatch.batchNumber,
                            quantity: newBatch.quantity,
                            expiryDate: newBatch.expiryDate,
                            receivedDate: new Date().toISOString().split('T')[0],
                            supplier: newBatch.supplier,
                            unitCost: newBatch.unitCost,
                          }]
                        }
                      : med
                  ));
                  toast.success(`Added ${newBatch.quantity} units of ${selectedMedication?.name} (Batch: ${newBatch.batchNumber})`);
                  setShowAddStockModal(false);
                  setNewBatch({ batchNumber: '', quantity: 0, expiryDate: '', supplier: '', unitCost: 0 });
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
          <DialogContent className="max-w-md">
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
                  <p className="text-3xl font-bold">{selectedMedication.currentStock.toLocaleString()}</p>
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
                  <Label>Quantity *</Label>
                  <Input
                    type="number"
                    min="1"
                    max={adjustmentForm.type === 'decrease' ? selectedMedication.currentStock : undefined}
                    value={adjustmentForm.quantity || ''}
                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, quantity: parseInt(e.target.value) || 0 })}
                    placeholder="Enter quantity"
                    className="mt-1"
                  />
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
                        {adjustmentForm.type === 'increase' 
                          ? (selectedMedication.currentStock + adjustmentForm.quantity).toLocaleString()
                          : (selectedMedication.currentStock - adjustmentForm.quantity).toLocaleString()
                        }
                      </strong> units
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
                onClick={() => {
                  if (!adjustmentForm.quantity || !adjustmentForm.reason) {
                    toast.error('Please fill in all required fields');
                    return;
                  }
                  const newStock = adjustmentForm.type === 'increase' 
                    ? selectedMedication!.currentStock + adjustmentForm.quantity
                    : selectedMedication!.currentStock - adjustmentForm.quantity;
                  
                  if (newStock < 0) {
                    toast.error('Stock cannot be negative');
                    return;
                  }

                  setInventory(prev => prev.map(med => 
                    med.id === selectedMedication?.id ? { ...med, currentStock: newStock } : med
                  ));
                  
                  toast.success(`Stock ${adjustmentForm.type === 'increase' ? 'increased' : 'decreased'} by ${adjustmentForm.quantity} units`);
                  setShowAdjustStockModal(false);
                  setAdjustmentForm({ type: 'decrease', quantity: 0, reason: '', notes: '' });
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
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-hidden">
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
                              <span className="font-medium">{batch.quantity}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Received:</span>{' '}
                              <span className="font-medium">{batch.receivedDate}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Supplier:</span>{' '}
                              <span className="font-medium">{batch.supplier || 'N/A'}</span>
                            </div>
                            <div>
                              <span className="text-muted-foreground">Unit Cost:</span>{' '}
                              <span className="font-medium">₦{batch.unitCost?.toLocaleString() || 'N/A'}</span>
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
              <Button 
                className="bg-emerald-600 hover:bg-emerald-700"
                onClick={() => {
                  setShowBatchesModal(false);
                  if (selectedMedication) handleAddStock(selectedMedication);
                }}
              >
                <Plus className="h-4 w-4 mr-2" />
                Add New Batch
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Medication Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden">
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
                      {categories.filter(c => c !== 'All Categories').map(cat => (
                        <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Strength *</Label>
                  <Input
                    value={newMedication.strength}
                    onChange={(e) => setNewMedication({...newMedication, strength: e.target.value})}
                    placeholder="e.g., 500mg"
                    className="mt-1"
                  />
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
                  <Input
                    value={newMedication.manufacturer}
                    onChange={(e) => setNewMedication({...newMedication, manufacturer: e.target.value})}
                    placeholder="e.g., GSK"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Storage Location</Label>
                  <Input
                    value={newMedication.location}
                    onChange={(e) => setNewMedication({...newMedication, location: e.target.value})}
                    placeholder="e.g., Shelf A1"
                    className="mt-1"
                  />
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
                <div>
                  <Label>Maximum Stock</Label>
                  <Input
                    type="number"
                    value={newMedication.maximumStock}
                    onChange={(e) => setNewMedication({...newMedication, maximumStock: parseInt(e.target.value) || 0})}
                    className="mt-1"
                  />
                </div>
              </div>
              <div className="flex items-center gap-6">
                <label className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    checked={newMedication.prescriptionRequired}
                    onChange={(e) => setNewMedication({...newMedication, prescriptionRequired: e.target.checked})}
                    className="rounded"
                  />
                  <span className="text-sm">Prescription Required</span>
                </label>
                <label className="flex items-center gap-2">
                  <input 
                    type="checkbox" 
                    checked={newMedication.isGeneric}
                    onChange={(e) => setNewMedication({...newMedication, isGeneric: e.target.checked})}
                    className="rounded"
                  />
                  <span className="text-sm">Generic Drug</span>
                </label>
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

        {/* Edit Medication Modal */}
        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Edit className="h-5 w-5 text-violet-500" />
                Edit Medication
              </DialogTitle>
            </DialogHeader>
            
            {selectedMedication && (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Editing: <strong>{selectedMedication.name}</strong>
                </p>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Minimum Stock</Label>
                    <Input
                      type="number"
                      defaultValue={selectedMedication.minimumStock}
                      className="mt-1"
                    />
                  </div>
                  <div>
                    <Label>Maximum Stock</Label>
                    <Input
                      type="number"
                      defaultValue={selectedMedication.maximumStock}
                      className="mt-1"
                    />
                  </div>
                  <div className="col-span-2">
                    <Label>Storage Location</Label>
                    <Input
                      defaultValue={selectedMedication.location}
                      className="mt-1"
                    />
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>Cancel</Button>
              <Button 
                className="bg-violet-600 hover:bg-violet-700"
                onClick={() => {
                  toast.success('Medication updated successfully');
                  setShowEditModal(false);
                }}
              >
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
