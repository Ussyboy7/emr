"use client";

import { useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { StandardPagination } from "@/components/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { pharmacyService, type MedicationInventory, type Medication } from "@/lib/services";
import { Package, Search, Plus, TrendingUp, AlertTriangle, Loader2, Eye, Edit, Pill, Send } from "lucide-react";

interface MedicationWithStock {
  id: number;
  name: string;
  generic_name?: string;
  strength?: string;
  form?: string;
  storeQuantity: number;
  minimumStock: number;
  batches: MedicationInventory[];
}

export default function WarehouseStorePage() {
  const [activeTab, setActiveTab] = useState("inventory");
  
  // Inventory tab state
  const [inventoryLoading, setInventoryLoading] = useState(true);
  const [storeInventory, setStoreInventory] = useState<MedicationWithStock[]>([]);
  const [inventorySearchQuery, setInventorySearchQuery] = useState("");
  const [selectedMedication, setSelectedMedication] = useState<MedicationWithStock | null>(null);
  const [showDetailsModal, setShowDetailsModal] = useState(false);
  const [inventoryCurrentPage, setInventoryCurrentPage] = useState(1);
  const [inventoryItemsPerPage, setInventoryItemsPerPage] = useState(10);

  // Manage Drugs tab state
  const [medLoading, setMedLoading] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [drugSearchQuery, setDrugSearchQuery] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [creatingMed, setCreatingMed] = useState(false);
  const [drugCurrentPage, setDrugCurrentPage] = useState(1);
  const [drugItemsPerPage, setDrugItemsPerPage] = useState(10);

  // Add drug form state
  const [formData, setFormData] = useState({
    name: "",
    generic_name: "",
    code: "",
    unit: "tablet",
    strength: "",
    form: "",
    category: "",
    pack_size: "",
    manufacturer: "",
    min_stock_level: "0",
    prescription_required: false,
  });

  useEffect(() => {
    loadStoreInventory();
    loadMedications();
  }, []);

  const loadStoreInventory = async () => {
    try {
      setInventoryLoading(true);
      const response = await pharmacyService.getInventory({
        page: 1,
        page_size: 10000,
        location: "Store",
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
            generic_name: medication?.generic_name,
            strength: medication?.strength,
            form: medication?.form,
            storeQuantity: 0,
            minimumStock: medication?.min_stock_level || 0,
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
      toast.error("Failed to load warehouse inventory");
    } finally {
      setInventoryLoading(false);
    }
  };

  const loadMedications = async () => {
    try {
      setMedLoading(true);
      const response = await pharmacyService.getMedications({
        page: 1,
        page_size: 10000,
      });
      setMedications(response.results || []);
    } catch (err) {
      console.error("Error loading medications:", err);
      toast.error("Failed to load medications");
    } finally {
      setMedLoading(false);
    }
  };

  const handleAddMedication = async () => {
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error("Name and Code are required");
      return;
    }

    try {
      setCreatingMed(true);
      await pharmacyService.createMedication({
        name: formData.name,
        generic_name: formData.generic_name,
        code: formData.code,
        unit: formData.unit,
        strength: formData.strength,
        form: formData.form,
        category: formData.category,
        pack_size: formData.pack_size ? Number(formData.pack_size) : undefined,
        manufacturer: formData.manufacturer,
        min_stock_level: formData.min_stock_level ? Number(formData.min_stock_level) : 0,
        prescription_required: formData.prescription_required,
      });
      toast.success("Medication added successfully");
      setShowAddModal(false);
      setFormData({
        name: "",
        generic_name: "",
        code: "",
        unit: "tablet",
        strength: "",
        form: "",
        category: "",
        pack_size: "",
        manufacturer: "",
        min_stock_level: "0",
        prescription_required: false,
      });
      await loadMedications();
    } catch (err: any) {
      toast.error(err?.message || "Failed to add medication");
    } finally {
      setCreatingMed(false);
    }
  };

  const filteredInventory = useMemo(() => {
    return storeInventory.filter((med) =>
      med.name.toLowerCase().includes(inventorySearchQuery.toLowerCase()) ||
      med.generic_name?.toLowerCase().includes(inventorySearchQuery.toLowerCase())
    );
  }, [storeInventory, inventorySearchQuery]);

  const paginatedInventory = useMemo(() => {
    const start = (inventoryCurrentPage - 1) * inventoryItemsPerPage;
    return filteredInventory.slice(start, start + inventoryItemsPerPage);
  }, [filteredInventory, inventoryCurrentPage, inventoryItemsPerPage]);

  const filteredMedications = useMemo(() => {
    return medications.filter(
      (med) =>
        med.name.toLowerCase().includes(drugSearchQuery.toLowerCase()) ||
        med.code.toLowerCase().includes(drugSearchQuery.toLowerCase()) ||
        med.generic_name?.toLowerCase().includes(drugSearchQuery.toLowerCase())
    );
  }, [medications, drugSearchQuery]);

  const paginatedMedications = useMemo(() => {
    const start = (drugCurrentPage - 1) * drugItemsPerPage;
    return filteredMedications.slice(start, start + drugItemsPerPage);
  }, [filteredMedications, drugCurrentPage, drugItemsPerPage]);

  const handleViewDetails = (med: MedicationWithStock) => {
    setSelectedMedication(med);
    setShowDetailsModal(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Package className="h-8 w-8 text-violet-500" />
              Warehouse
            </h1>
            <p className="text-muted-foreground mt-1">Central inventory - Master drug registry and stock management</p>
          </div>
          <Button onClick={() => (window.location.href = '/pharmacy/store/requests')} className="bg-violet-600 hover:bg-violet-700">
            <Send className="h-4 w-4 mr-2" />
            Handle Requests
          </Button>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="inventory" className="flex items-center gap-2">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Stock Inventory</span>
              <span className="sm:hidden">Inventory</span>
            </TabsTrigger>
            <TabsTrigger value="drugs" className="flex items-center gap-2">
              <Pill className="h-4 w-4" />
              <span className="hidden sm:inline">Manage Drugs</span>
              <span className="sm:hidden">Drugs</span>
            </TabsTrigger>
          </TabsList>

          {/* Stock Inventory Tab */}
          <TabsContent value="inventory" className="space-y-4 mt-4">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Medications</p>
                      <p className="text-2xl sm:text-3xl font-bold text-violet-600">{storeInventory.length}</p>
                    </div>
                    <Package className="h-6 w-6 text-violet-500" />
                  </div>
                </CardContent>
              </Card>

              <Card className={storeInventory.filter((m) => m.storeQuantity <= m.minimumStock).length > 0 ? "border-amber-200 dark:border-amber-800" : ""}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Low Stock</p>
                      <p className={`text-2xl sm:text-3xl font-bold ${storeInventory.filter((m) => m.storeQuantity <= m.minimumStock).length > 0 ? "text-amber-600" : "text-green-600"}`}>
                        {storeInventory.filter((m) => m.storeQuantity <= m.minimumStock).length}
                      </p>
                    </div>
                    <AlertTriangle className={`h-6 w-6 ${storeInventory.filter((m) => m.storeQuantity <= m.minimumStock).length > 0 ? "text-amber-500" : "text-green-500"}`} />
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Units</p>
                      <p className="text-2xl sm:text-3xl font-bold text-emerald-600">{storeInventory.reduce((sum, m) => sum + m.storeQuantity, 0).toLocaleString()}</p>
                    </div>
                    <TrendingUp className="h-6 w-6 text-emerald-500" />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Search */}
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by medication name or generic name..."
                    value={inventorySearchQuery}
                    onChange={(e) => {
                      setInventorySearchQuery(e.target.value);
                      setInventoryCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Inventory List */}
            <div className="space-y-3">
              {inventoryLoading ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                    <p>Loading warehouse inventory...</p>
                  </CardContent>
                </Card>
              ) : paginatedInventory.length > 0 ? (
                paginatedInventory.map((med) => {
                  const isLowStock = med.storeQuantity <= med.minimumStock;
                  return (
                    <Card key={med.id} className={`border-l-4 ${isLowStock ? "border-l-amber-500" : "border-l-violet-500"}`}>
                      <CardContent className="py-3 px-4">
                        <div className="flex items-center justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-foreground">{med.name}</span>
                              {med.strength && <Badge variant="outline" className="text-xs">{med.strength}</Badge>}
                              {isLowStock && <Badge className="bg-amber-100 text-amber-800 text-xs">Low Stock</Badge>}
                            </div>
                            <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                              {med.generic_name && <span>{med.generic_name}</span>}
                              {med.form && (
                                <>
                                  <span>•</span>
                                  <span>{med.form}</span>
                                </>
                              )}
                              <span>•</span>
                              <span>{med.batches.length} batch(es)</span>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <div className="text-right">
                              <p className="text-sm font-semibold">{med.storeQuantity}</p>
                              <p className="text-xs text-muted-foreground">units</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewDetails(med)}
                              className="h-8 w-8 p-0"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
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

            {/* Pagination */}
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
          </TabsContent>

          {/* Manage Drugs Tab */}
          <TabsContent value="drugs" className="space-y-4 mt-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">Drug Master Registry</h3>
                <p className="text-sm text-muted-foreground">Add and manage drug master data</p>
              </div>
              <Button onClick={() => setShowAddModal(true)} className="bg-violet-600 hover:bg-violet-700">
                <Plus className="h-4 w-4 mr-2" />
                Add Drug
              </Button>
            </div>

            {/* Search */}
            <Card>
              <CardContent className="p-4">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by name, code, or generic name..."
                    value={drugSearchQuery}
                    onChange={(e) => {
                      setDrugSearchQuery(e.target.value);
                      setDrugCurrentPage(1);
                    }}
                    className="pl-10"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Medications List */}
            <div className="space-y-3">
              {medLoading ? (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                    <p>Loading medications...</p>
                  </CardContent>
                </Card>
              ) : paginatedMedications.length > 0 ? (
                paginatedMedications.map((med) => (
                  <Card key={med.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold">{med.name}</span>
                            <Badge variant="outline" className="text-xs">{med.code}</Badge>
                            {med.strength && <Badge variant="outline" className="text-xs">{med.strength}</Badge>}
                            {med.prescription_required && (
                              <Badge className="bg-red-100 text-red-800 text-xs">Rx</Badge>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                            {med.generic_name && <span>{med.generic_name}</span>}
                            {med.form && (
                              <>
                                <span>•</span>
                                <span>{med.form}</span>
                              </>
                            )}
                            {med.category && (
                              <>
                                <span>•</span>
                                <span>{med.category}</span>
                              </>
                            )}
                          </div>
                        </div>
                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                          <Edit className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              ) : (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <Pill className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No medications found</p>
                  </CardContent>
                </Card>
              )}
            </div>

            {/* Pagination */}
            {filteredMedications.length > 0 && (
              <Card className="p-4">
                <StandardPagination
                  currentPage={drugCurrentPage}
                  totalItems={filteredMedications.length}
                  itemsPerPage={drugItemsPerPage}
                  onPageChange={setDrugCurrentPage}
                  onItemsPerPageChange={(newSize) => {
                    setDrugItemsPerPage(newSize);
                    setDrugCurrentPage(1);
                  }}
                  itemName="medications"
                />
              </Card>
            )}
          </TabsContent>
        </Tabs>

        {/* Inventory Details Modal */}
        <Dialog open={showDetailsModal} onOpenChange={setShowDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{selectedMedication?.name}</DialogTitle>
            </DialogHeader>
            {selectedMedication && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Generic Name</p>
                    <p className="font-medium">{selectedMedication.generic_name || "—"}</p>
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

                <div>
                  <h4 className="font-medium mb-2">Batches ({selectedMedication.batches.length})</h4>
                  <div className="space-y-2">
                    {selectedMedication.batches.map((batch) => (
                      <div key={batch.id} className="border rounded-lg p-2 text-sm">
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium">Batch: {batch.batch_number}</p>
                            <p className="text-xs text-muted-foreground">Expiry: {batch.expiry_date}</p>
                          </div>
                          <p className="font-semibold">{batch.quantity}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Add Drug Modal */}
        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Drug</DialogTitle>
              <DialogDescription>Create a new drug master record</DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Amoxil"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Generic Name</Label>
                <Input
                  value={formData.generic_name}
                  onChange={(e) => setFormData({ ...formData, generic_name: e.target.value })}
                  placeholder="e.g., Amoxicillin"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Code *</Label>
                <Input
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                  placeholder="e.g., AMOX500"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Unit *</Label>
                <Select value={formData.unit} onValueChange={(val) => setFormData({ ...formData, unit: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="capsule">Capsule</SelectItem>
                    <SelectItem value="ml">Milliliter (ml)</SelectItem>
                    <SelectItem value="vial">Vial</SelectItem>
                    <SelectItem value="box">Box</SelectItem>
                    <SelectItem value="pack">Pack</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Strength</Label>
                <Input
                  value={formData.strength}
                  onChange={(e) => setFormData({ ...formData, strength: e.target.value })}
                  placeholder="e.g., 500mg"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Form</Label>
                <Select value={formData.form} onValueChange={(val) => setFormData({ ...formData, form: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select form" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="tablet">Tablet</SelectItem>
                    <SelectItem value="capsule">Capsule</SelectItem>
                    <SelectItem value="syrup">Syrup</SelectItem>
                    <SelectItem value="injection">Injection</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Input
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  placeholder="e.g., Antibiotics"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Pack Size</Label>
                <Input
                  type="number"
                  value={formData.pack_size}
                  onChange={(e) => setFormData({ ...formData, pack_size: e.target.value })}
                  placeholder="e.g., 10"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Manufacturer</Label>
                <Input
                  value={formData.manufacturer}
                  onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })}
                  placeholder="e.g., GSK"
                  className="mt-1"
                />
              </div>
              <div>
                <Label>Minimum Stock Level</Label>
                <Input
                  type="number"
                  value={formData.min_stock_level}
                  onChange={(e) => setFormData({ ...formData, min_stock_level: e.target.value })}
                  placeholder="0"
                  className="mt-1"
                />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.prescription_required}
                    onChange={(e) => setFormData({ ...formData, prescription_required: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Prescription Required</span>
                </label>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddModal(false)}>
                Cancel
              </Button>
              <Button onClick={handleAddMedication} disabled={creatingMed} className="bg-violet-600 hover:bg-violet-700">
                {creatingMed ? "Adding..." : "Add Drug"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
