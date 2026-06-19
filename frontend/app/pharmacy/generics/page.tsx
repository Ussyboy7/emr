"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { pharmacyService, type GenericMedication } from "@/lib/services";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePharmacyPageAuth } from "@/hooks/use-pharmacy-page-auth";
import { DOSAGE_FORMS as DOSAGE_FORM_OPTIONS, MEDICATION_STRENGTHS, MEDICATION_CATEGORIES } from "@/lib/constants/pharmacy";
import { Plus, Search, Edit, Eye, Trash2, Loader2 } from "lucide-react";

const ANY = "__any__";

const ROUTES = [
  { value: ANY, label: "Any route" },
  { value: "Oral", label: "Oral" },
  { value: "IV", label: "IV" },
  { value: "IM", label: "IM" },
  { value: "SC", label: "SC" },
  { value: "Topical", label: "Topical" },
  { value: "Inhalation", label: "Inhalation" },
  { value: "Other", label: "Other" },
];

const DOSAGE_FORMS = [
  { value: ANY, label: "Any form" },
  { value: "Tablet", label: "Tablet" },
  { value: "Capsule", label: "Capsule" },
  { value: "Syrup", label: "Syrup" },
  { value: "Suspension", label: "Suspension" },
  { value: "Injection", label: "Injection" },
  { value: "Cream", label: "Cream" },
  { value: "Ointment", label: "Ointment" },
  { value: "Drops", label: "Drops" },
  { value: "Other", label: "Other" },
];

const GENERIC_ROUTES = ROUTES.filter((r) => r.value !== ANY);
const GENERIC_CATEGORIES = MEDICATION_CATEGORIES.filter((c) => c.value !== "All Categories");

export default function GenericsPage() {
  const { ready, handleAuthError } = usePharmacyPageAuth();
  const [loading, setLoading] = useState(true);
  const [generics, setGenerics] = useState<GenericMedication[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [routeFilter, setRouteFilter] = useState(ANY);
  const [formFilter, setFormFilter] = useState(ANY);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showViewModal, setShowViewModal] = useState(false);
  const [selectedGeneric, setSelectedGeneric] = useState<GenericMedication | null>(null);
  const [saving, setSaving] = useState(false);

  const [formData, setFormData] = useState({
    name: "",
    active_ingredient: "",
    category: "",
    strength: "",
    dosage_form: "",
    route: "",
    is_active: true,
  });

  const loadGenerics = useCallback(async () => {
    try {
      setLoading(true);
      const response = await pharmacyService.getGenerics({
        page: currentPage,
        page_size: itemsPerPage,
        search: debouncedSearch.trim() || undefined,
        route: routeFilter !== ANY ? routeFilter : undefined,
        dosage_form: formFilter !== ANY ? formFilter : undefined,
      });
      setGenerics(response.results || []);
      setTotalCount(typeof response.count === "number" ? response.count : (response.results || []).length);
    } catch (err) {
      if (handleAuthError(err)) return;
      console.error("Error loading generics:", err);
      toast.error("Failed to load generics");
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, routeFilter, formFilter, handleAuthError]);

  const prevFiltersRef = useRef({ debouncedSearch, routeFilter, formFilter, itemsPerPage });
  useEffect(() => {
    const prev = prevFiltersRef.current;
    if (
      prev.debouncedSearch !== debouncedSearch ||
      prev.routeFilter !== routeFilter ||
      prev.formFilter !== formFilter ||
      prev.itemsPerPage !== itemsPerPage
    ) {
      setCurrentPage(1);
    }
    prevFiltersRef.current = { debouncedSearch, routeFilter, formFilter, itemsPerPage };
  }, [debouncedSearch, routeFilter, formFilter, itemsPerPage]);

  useEffect(() => {
    if (!ready) return;
    void loadGenerics();
  }, [loadGenerics, currentPage, ready]);

  const openCreate = () => {
    setFormData({
      name: "",
      active_ingredient: "",
      category: "Other",
      strength: "",
      dosage_form: "",
      route: "",
      is_active: true,
    });
    setShowCreateModal(true);
  };

  const openEdit = (g: GenericMedication) => {
    setSelectedGeneric(g);
    setFormData({
      name: g.name || "",
      active_ingredient: g.active_ingredient || "",
      category: g.category || "",
      strength: g.strength || "",
      dosage_form: g.dosage_form || "",
      route: g.route || "",
      is_active: g.is_active ?? true,
    });
    setShowEditModal(true);
  };

  const openView = (g: GenericMedication) => {
    setSelectedGeneric(g);
    setShowViewModal(true);
  };

  const handleCreate = async () => {
    if (!formData.name.trim()) {
      toast.error("Generic name is required");
      return;
    }
    if (!formData.category.trim()) {
      toast.error("Category is required");
      return;
    }
    try {
      setSaving(true);
      await pharmacyService.createGeneric({
        name: formData.name.trim(),
        active_ingredient: formData.active_ingredient.trim() || undefined,
        category: formData.category.trim(),
        strength: formData.strength.trim() || undefined,
        dosage_form: formData.dosage_form.trim() || undefined,
        route: formData.route.trim() || undefined,
      });
      toast.success("Generic created");
      setShowCreateModal(false);
      await loadGenerics();
    } catch (err: any) {
      toast.error(err?.apiMessage || err?.message || "Failed to create generic");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async () => {
    if (!selectedGeneric) return;
    if (!formData.name.trim()) {
      toast.error("Generic name is required");
      return;
    }
    if (!formData.category.trim()) {
      toast.error("Category is required");
      return;
    }
    try {
      setSaving(true);
      await pharmacyService.updateGeneric(selectedGeneric.id, {
        name: formData.name.trim(),
        active_ingredient: formData.active_ingredient.trim(),
        category: formData.category.trim(),
        strength: formData.strength.trim(),
        dosage_form: formData.dosage_form.trim(),
        route: formData.route.trim(),
        is_active: !!formData.is_active,
      });
      toast.success("Generic updated");
      setShowEditModal(false);
      setSelectedGeneric(null);
      await loadGenerics();
    } catch (err: any) {
      toast.error(err?.apiMessage || err?.message || "Failed to update generic");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (g: GenericMedication) => {
    const ok = window.confirm(`Delete generic "${g.name}"? This will unlink brands (generic_id will become null).`);
    if (!ok) return;
    try {
      await pharmacyService.deleteGeneric(g.id);
      toast.success("Generic deleted");
      await loadGenerics();
    } catch (err: any) {
      toast.error(err?.apiMessage || err?.message || "Failed to delete generic");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">Generics</h1>
            <p className="text-muted-foreground mt-1">Manage parent generic medications (strength/form/route variants)</p>
          </div>
          <Button onClick={openCreate} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Generic
          </Button>
        </div>

        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, ingredient, category, strength, form, route..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <Label>Route</Label>
                <Select value={routeFilter} onValueChange={(v) => { setRouteFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Any route" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROUTES.map((r) => (
                      <SelectItem key={r.label} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dosage Form</Label>
                <Select value={formFilter} onValueChange={(v) => { setFormFilter(v); setCurrentPage(1); }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Any form" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSAGE_FORMS.map((f) => (
                      <SelectItem key={f.label} value={f.value}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading generics...</p>
              </CardContent>
            </Card>
          ) : generics.length > 0 ? (
            generics.map((g) => (
              <Card key={g.id} className={`border-l-4 ${g.is_active ? "border-l-violet-500" : "border-l-slate-400"} hover:shadow-md transition-shadow`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-foreground">{g.name}</span>
                        {!g.is_active && <Badge variant="outline" className="text-xs">Inactive</Badge>}
                        {g.category && <Badge variant="outline" className="text-xs">{g.category}</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        {(g.strength || g.dosage_form || g.route) && (
                          <span>
                            {[g.strength, g.dosage_form, g.route].filter(Boolean).join(" • ")}
                          </span>
                        )}
                        {g.active_ingredient && (
                          <>
                            <span>•</span>
                            <span>{g.active_ingredient}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openView(g)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEdit(g)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => handleDelete(g)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center text-muted-foreground">
                <p>No generics found</p>
              </CardContent>
            </Card>
          )}
        </div>

        {totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="generics"
            />
          </Card>
        )}

        <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Generic</DialogTitle>
              <DialogDescription>Create a parent generic medication record</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Active Ingredient</Label>
                <Input value={formData.active_ingredient} onChange={(e) => setFormData({ ...formData, active_ingredient: e.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERIC_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Strength</Label>
                <Select value={formData.strength} onValueChange={(v) => setFormData({ ...formData, strength: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select strength" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEDICATION_STRENGTHS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dosage Form</Label>
                <Select value={formData.dosage_form} onValueChange={(v) => setFormData({ ...formData, dosage_form: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select dosage form" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSAGE_FORM_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Route</Label>
                <Select value={formData.route} onValueChange={(v) => setFormData({ ...formData, route: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERIC_ROUTES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={handleCreate} className="bg-violet-600 hover:bg-violet-700">
                {saving ? "Saving..." : "Create"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Generic</DialogTitle>
              <DialogDescription>Update a parent generic medication record</DialogDescription>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <Label>Name *</Label>
                <Input value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Active Ingredient</Label>
                <Input value={formData.active_ingredient} onChange={(e) => setFormData({ ...formData, active_ingredient: e.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERIC_CATEGORIES.map((c) => (
                      <SelectItem key={c.value} value={c.value}>
                        {c.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Strength</Label>
                <Select value={formData.strength} onValueChange={(v) => setFormData({ ...formData, strength: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select strength" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEDICATION_STRENGTHS.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Dosage Form</Label>
                <Select value={formData.dosage_form} onValueChange={(v) => setFormData({ ...formData, dosage_form: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select dosage form" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSAGE_FORM_OPTIONS.map((f) => (
                      <SelectItem key={f} value={f}>
                        {f}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Route</Label>
                <Select value={formData.route} onValueChange={(v) => setFormData({ ...formData, route: v })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select route" />
                  </SelectTrigger>
                  <SelectContent>
                    {GENERIC_ROUTES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="rounded"
                  />
                  <span className="text-sm">Active</span>
                </label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)}>
                Cancel
              </Button>
              <Button disabled={saving} onClick={handleUpdate} className="bg-violet-600 hover:bg-violet-700">
                {saving ? "Saving..." : "Save Changes"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{selectedGeneric?.name}</DialogTitle>
              <DialogDescription>Generic details</DialogDescription>
            </DialogHeader>
            {selectedGeneric && (
              <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                {selectedGeneric.active_ingredient && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Active Ingredient</p>
                    <p className="font-medium">{selectedGeneric.active_ingredient}</p>
                  </div>
                )}
                {selectedGeneric.category && (
                  <div className="col-span-2">
                    <p className="text-muted-foreground">Category</p>
                    <p className="font-medium">{selectedGeneric.category}</p>
                  </div>
                )}
                {selectedGeneric.strength && (
                  <div>
                    <p className="text-muted-foreground">Strength</p>
                    <p className="font-medium">{selectedGeneric.strength}</p>
                  </div>
                )}
                {selectedGeneric.dosage_form && (
                  <div>
                    <p className="text-muted-foreground">Dosage Form</p>
                    <p className="font-medium">{selectedGeneric.dosage_form}</p>
                  </div>
                )}
                {selectedGeneric.route && (
                  <div>
                    <p className="text-muted-foreground">Route</p>
                    <p className="font-medium">{selectedGeneric.route}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">{selectedGeneric.is_active ? "Active" : "Inactive"}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setShowViewModal(false)} className="bg-violet-600 hover:bg-violet-700">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
