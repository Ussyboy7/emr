"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
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
import { pharmacyService, type Medication } from "@/lib/services";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MEDICATION_CATEGORIES, MEDICATION_STRENGTHS, MEDICATION_MANUFACTURERS, DOSAGE_FORMS } from "@/lib/constants/pharmacy";
import { Plus, Search, Edit, Eye, Pill, Loader2 } from "lucide-react";

export default function DrugMasterPage() {
  const [medLoading, setMedLoading] = useState(false);
  const [medications, setMedications] = useState<Medication[]>([]);
  const [medicationsTotal, setMedicationsTotal] = useState(0);
  const [drugSearchQuery, setDrugSearchQuery] = useState("");
  const debouncedDrugSearch = useDebouncedValue(drugSearchQuery, 300);
  const [showAddModal, setShowAddModal] = useState(false);
  const [creatingMed, setCreatingMed] = useState(false);
  const [addDrugError, setAddDrugError] = useState<string | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingMedication, setEditingMedication] = useState<Medication | null>(null);
  const [editModalLoading, setEditModalLoading] = useState(false);
  const [editDrugError, setEditDrugError] = useState<string | null>(null);
  const [selectedDrug, setSelectedDrug] = useState<Medication | null>(null);
  const [showDrugDetailsModal, setShowDrugDetailsModal] = useState(false);
  const [drugDetailsLoading, setDrugDetailsLoading] = useState(false);
  const [drugCurrentPage, setDrugCurrentPage] = useState(1);
  const [drugItemsPerPage, setDrugItemsPerPage] = useState(50);

  const [generics, setGenerics] = useState<Array<{ id: number; name: string; unit?: string }>>([]);
  const [newGenericName, setNewGenericName] = useState("");

  const [formData, setFormData] = useState({
    name: "",
    generic_id: "",
    code: "",
    unit: "tablet",
    strength: "",
    strengthCustom: "",
    form: "",
    category: "",
    pack_size: "",
    manufacturer: "",
    min_stock_level: "0",
  });

  const [editFormData, setEditFormData] = useState({
    name: "",
    generic_id: "",
    code: "",
    unit: "tablet",
    strength: "",
    strengthCustom: "",
    form: "",
    category: "",
    pack_size: "",
    manufacturer: "",
    min_stock_level: "0",
    is_active: true,
  });

  const loadMedications = useCallback(async () => {
    try {
      setMedLoading(true);
      const response = await pharmacyService.getMedications({
        page: drugCurrentPage,
        page_size: drugItemsPerPage,
        search: debouncedDrugSearch.trim() || undefined,
      });
      setMedications(response.results || []);
      setMedicationsTotal(typeof response.count === "number" ? response.count : (response.results || []).length);
    } catch (err) {
      console.error("Error loading medications:", err);
      toast.error("Failed to load medications");
    } finally {
      setMedLoading(false);
    }
  }, [drugCurrentPage, drugItemsPerPage, debouncedDrugSearch]);

  useEffect(() => {
    void loadMedications();
  }, [loadMedications]);

  useEffect(() => {
    setDrugCurrentPage(1);
  }, [debouncedDrugSearch, drugItemsPerPage]);

  useEffect(() => {
    const loadGenerics = async () => {
      try {
        const res = await pharmacyService.getGenerics({ page: 1, page_size: 200 });
        setGenerics((res.results || []).map((g: any) => ({ id: g.id, name: g.name, unit: g.unit })));
      } catch {
        /* silent */
      }
    };
    void loadGenerics();
  }, []);

  const handleAddMedication = async () => {
    setAddDrugError(null);
    if (!formData.name.trim() || !formData.code.trim()) {
      toast.error("Name and Code are required");
      return;
    }
    if (!formData.generic_id) {
      toast.error("Select a Generic Medication or create one");
      return;
    }

    try {
      setCreatingMed(true);
      await pharmacyService.createMedication({
        name: formData.name,
        generic_id: formData.generic_id ? Number(formData.generic_id) : undefined,
        code: formData.code,
        unit: formData.unit,
        strength: formData.strength === "__custom__" ? normalizeStrength(formData.strengthCustom) : (formData.strength || ''),
        form: formData.form || '',
        category: formData.category,
        pack_size: formData.pack_size ? Number(formData.pack_size) : undefined,
        manufacturer: formData.manufacturer,
        min_stock_level: formData.min_stock_level ? Number(formData.min_stock_level) : 0,
      });
      toast.success("Medication added successfully");
      setShowAddModal(false);
      setFormData({
        name: "",
        generic_id: "",
        code: "",
        unit: "tablet",
        strength: "",
        strengthCustom: "",
        form: "",
        category: "",
        pack_size: "",
        manufacturer: "",
        min_stock_level: "0",
      });
      await loadMedications();
    } catch (err: any) {
      const message = (err && (err.apiMessage || err.message)) || "Failed to add medication";
      try {
        const parsed = err?.body ? JSON.parse(err.body) : null;
        const detail = parsed?.detail || parsed?.error || parsed?.errors?.detail || null;
        const finalMessage = detail || message;
        setAddDrugError(finalMessage);
        toast.error(finalMessage);
      } catch {
        setAddDrugError(message);
        toast.error(message);
      }
    } finally {
      setCreatingMed(false);
    }
  };

  const openEditModal = async (med: Medication) => {
    setEditingMedication(med);
    setEditDrugError(null);
    setShowEditModal(true);
    setEditModalLoading(true);
    try {
      const latest = await pharmacyService.getMedication(med.id);
      setEditFormData({
        name: latest.name || "",
        generic_id: latest.generic?.id ? String(latest.generic.id) : "",
        code: latest.code || "",
        unit: latest.unit || "tablet",
        strength: latest.strength || "",
        strengthCustom: "",
        form: latest.form || "",
        category: (latest.category || "").trim(),
        pack_size: typeof latest.pack_size === "number" ? String(latest.pack_size) : "",
        manufacturer: latest.manufacturer || "",
        min_stock_level: latest.min_stock_level !== undefined && latest.min_stock_level !== null ? String(Number(latest.min_stock_level)) : "0",
        is_active: latest.is_active ?? true,
      });
      setMedications((prev) => prev.map((m) => (m.id === latest.id ? latest : m)));
    } catch {
      setEditFormData({
        name: med.name || "",
        generic_id: med.generic?.id ? String(med.generic.id) : "",
        code: med.code || "",
        unit: med.unit || "tablet",
        strength: med.strength || "",
        strengthCustom: "",
        form: med.form || "",
        category: (med.category || "").trim(),
        pack_size: typeof med.pack_size === "number" ? String(med.pack_size) : "",
        manufacturer: med.manufacturer || "",
        min_stock_level: med.min_stock_level !== undefined && med.min_stock_level !== null ? String(Number(med.min_stock_level)) : "0",
        is_active: med.is_active ?? true,
      });
    } finally {
      setEditModalLoading(false);
    }
  };

  const extractStrengthFromName = (name: string) => {
    const match = String(name || "").match(/(\d+(?:\.\d+)?\s?(?:mg|mcg|g|IU|%)(?:\s*\/\s*\d+(?:\.\d+)?\s?(?:mg|mcg|g|IU|%))*)/i);
    if (!match) return "";
    return normalizeStrength(match[1]);
  };

  const openDrugDetails = async (med: Medication) => {
    try {
      setDrugDetailsLoading(true);
      let latest = await pharmacyService.getMedication(med.id);

      if (!latest.strength) {
        const inferred = extractStrengthFromName(latest.name);
        if (inferred) {
          latest = await pharmacyService.updateMedication(latest.id, { strength: inferred });
        }
      }

      setSelectedDrug(latest);
      setMedications((prev) => prev.map((m) => (m.id === latest.id ? latest : m)));
      setShowDrugDetailsModal(true);
    } catch (e: any) {
      const message = (e && (e.apiMessage || e.message)) || "Failed to refresh drug details";
      toast.error(message);
      setSelectedDrug(med);
      setShowDrugDetailsModal(true);
    } finally {
      setDrugDetailsLoading(false);
    }
  };

  const handleUpdateMedication = async () => {
    setEditDrugError(null);
    if (!editingMedication) return;
    if (!editFormData.name.trim() || !editFormData.code.trim()) {
      toast.error("Name and Code are required");
      return;
    }
    if (!editFormData.generic_id) {
      toast.error("Select a Generic Medication");
      return;
    }

    try {
      const updated = await pharmacyService.updateMedication(editingMedication.id, {
        name: editFormData.name,
        code: editFormData.code,
        unit: editFormData.unit,
        strength: editFormData.strength === "__custom__" ? normalizeStrength(editFormData.strengthCustom) : (editFormData.strength || ''),
        form: editFormData.form || '',
        category: editFormData.category || "",
        manufacturer: editFormData.manufacturer || "",
        pack_size: editFormData.pack_size ? Number(editFormData.pack_size) : null,
        min_stock_level: editFormData.min_stock_level ? Number(editFormData.min_stock_level) : 0,
        is_active: !!editFormData.is_active,
        generic_id: editFormData.generic_id ? Number(editFormData.generic_id) : undefined,
      } as any);
      toast.success("Medication updated successfully");
      setShowEditModal(false);
      setEditingMedication(null);
      setMedications((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
      if (selectedDrug && selectedDrug.id === updated.id) {
        setSelectedDrug(updated);
      }
    } catch (err: any) {
      const message = (err && (err.apiMessage || err.message)) || "Failed to update medication";
      try {
        const parsed = err?.body ? JSON.parse(err.body) : null;
        const detail = parsed?.detail || parsed?.error || null;
        const finalMessage = detail || message;
        setEditDrugError(finalMessage);
        toast.error(finalMessage);
      } catch {
        setEditDrugError(message);
        toast.error(message);
      }
    }
  };

  const addStrengthOptions = useMemo(() => {
    const opts = [...MEDICATION_STRENGTHS];
    if (formData.strength && !opts.includes(formData.strength)) {
      opts.unshift(formData.strength);
    }
    if (!opts.includes("__custom__")) opts.push("__custom__");
    return opts;
  }, [formData.strength]);

  const editStrengthOptions = useMemo(() => {
    const opts = [...MEDICATION_STRENGTHS];
    if (editFormData.strength && !opts.includes(editFormData.strength)) {
      opts.unshift(editFormData.strength);
    }
    if (!opts.includes("__custom__")) opts.push("__custom__");
    return opts;
  }, [editFormData.strength]);

  const normalizeStrength = (s: string) => {
    const v = (s || "").trim();
    if (!v) return "";
    let out = v.replace(/\s+/g, " ");
    out = out.replace(/\s*mg\b/gi, "mg").replace(/\s*mcg\b/gi, "mcg").replace(/\s*g\b/gi, "g").replace(/\s*iu\b/gi, "IU").replace(/\s*%\b/gi, "%");
    out = out.replace(/\s*\/\s*/g, "/");
    out = out.replace(/\bper\s*/gi, "/");
    if (out.length > 100) out = out.slice(0, 100);
    return out;
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <Pill className="h-8 w-8 text-violet-500" />
              Drug master
            </h1>
            <p className="text-muted-foreground mt-1">
              Manage brand/item records used for receiving and dispensing.{" "}
              <Link href="/pharmacy/generics" className="text-violet-600 hover:underline">
                Manage generics
              </Link>
            </p>
          </div>
          <Button onClick={() => setShowAddModal(true)} className="bg-violet-600 hover:bg-violet-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Drug
          </Button>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by name, code, or generic name..."
                value={drugSearchQuery}
                onChange={(e) => {
                  setDrugSearchQuery(e.target.value);
                }}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        <div className="space-y-3">
          {medLoading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading medications...</p>
              </CardContent>
            </Card>
          ) : medications.length > 0 ? (
            medications.map((med) => (
              <Card key={med.id} className="border-l-4 border-l-violet-500 hover:shadow-md transition-shadow">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold">{med.name}</span>
                        <Badge variant="outline" className="text-xs">
                          {med.code}
                        </Badge>
                        {med.strength && (
                          <Badge variant="outline" className="text-xs">
                            {med.strength}
                          </Badge>
                        )}
                        {typeof med.pack_size === "number" && (
                          <Badge variant="outline" className="text-xs">
                            Pack {med.pack_size}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                        {(med.generic?.name || med.generic_name) && <span>{med.generic?.name || med.generic_name}</span>}
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
                        {med.min_stock_level !== undefined && med.min_stock_level !== null && (
                          <>
                            <span>•</span>
                            <span>Min {Number(med.min_stock_level)}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openDrugDetails(med)}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={() => openEditModal(med)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                    </div>
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

        {medicationsTotal > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={drugCurrentPage}
              totalItems={medicationsTotal}
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

        <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add New Drug</DialogTitle>
              <DialogDescription>Create a new drug master record</DialogDescription>
            </DialogHeader>
            {addDrugError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{addDrugError}</div>
            )}

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
                <Label>Generic Medication</Label>
                <Select
                  value={formData.generic_id}
                  onValueChange={(val) => {
                    const g = generics.find((x) => String(x.id) === val);
                    setFormData({
                      ...formData,
                      generic_id: val,
                      ...(g?.unit ? { unit: g.unit.toLowerCase() } : {}),
                    });
                  }}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select generic" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {generics.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <div className="mt-2 flex gap-2">
                  <Input value={newGenericName} onChange={(e) => setNewGenericName(e.target.value)} placeholder="New generic name (e.g., Amoxicillin)" />
                  <Button
                    variant="outline"
                    onClick={async () => {
                      if (!newGenericName.trim()) {
                        toast.error("Enter a generic name");
                        return;
                      }
                      try {
                        const g = await pharmacyService.createGeneric({ name: newGenericName.trim() });
                        setGenerics((prev) => [{ id: g.id, name: g.name, unit: (g as any).unit || "tablet" }, ...prev]);
                        setFormData({ ...formData, generic_id: String(g.id), ...((g as any).unit ? { unit: String((g as any).unit).toLowerCase() } : {}) });
                        setNewGenericName("");
                        toast.success("Generic created");
                      } catch (e: any) {
                        toast.error(e?.message || "Failed to create generic");
                      }
                    }}
                  >
                    + Add Generic
                  </Button>
                </div>
              </div>
              <div>
                <Label>Code *</Label>
                <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g., AMOX500" className="mt-1" />
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
                <Select value={formData.strength} onValueChange={(val) => setFormData({ ...formData, strength: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select strength" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {addStrengthOptions.map((strength) => (
                      <SelectItem key={strength} value={strength}>
                        {strength}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {formData.strength === "__custom__" && (
                  <Input
                    className="mt-2"
                    value={formData.strengthCustom}
                    onChange={(e) => setFormData({ ...formData, strengthCustom: e.target.value })}
                    placeholder="Enter strength (e.g., 80/480mg)"
                  />
                )}
              </div>
              <div>
                <Label>Form</Label>
                <Select value={formData.form} onValueChange={(val) => setFormData({ ...formData, form: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select form" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSAGE_FORMS.map((form) => (
                      <SelectItem key={form} value={form}>
                        {form}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={formData.category} onValueChange={(val) => setFormData({ ...formData, category: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEDICATION_CATEGORIES.filter((c) => c.value !== "All Categories").map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Select value={formData.manufacturer} onValueChange={(value) => setFormData({ ...formData, manufacturer: value })}>
                    <SelectTrigger id="manufacturer">
                      <SelectValue placeholder="Select manufacturer" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {MEDICATION_MANUFACTURERS.map((manufacturer) => (
                        <SelectItem key={manufacturer} value={manufacturer}>
                          {manufacturer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pack Size</Label>
                  <Input type="number" value={formData.pack_size} onChange={(e) => setFormData({ ...formData, pack_size: e.target.value })} placeholder="e.g. 10" />
                </div>
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

        <Dialog open={showEditModal} onOpenChange={setShowEditModal}>
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Drug</DialogTitle>
              <DialogDescription>Update drug master record</DialogDescription>
            </DialogHeader>
            {editDrugError && (
              <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{editDrugError}</div>
            )}
            {editModalLoading && (
              <div className="flex items-center justify-center py-8 text-muted-foreground">
                <Loader2 className="h-6 w-6 animate-spin mr-2" />
                Loading drug details…
              </div>
            )}
            {!editModalLoading && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label>Name *</Label>
                <Input value={editFormData.name} onChange={(e) => setEditFormData({ ...editFormData, name: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Generic Medication *</Label>
                <Select value={editFormData.generic_id} onValueChange={(val) => setEditFormData({ ...editFormData, generic_id: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select generic" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {generics.map((g) => (
                      <SelectItem key={g.id} value={String(g.id)}>
                        {g.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Code *</Label>
                <Input value={editFormData.code} onChange={(e) => setEditFormData({ ...editFormData, code: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label>Unit *</Label>
                <Select value={editFormData.unit} onValueChange={(val) => setEditFormData({ ...editFormData, unit: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select unit" />
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
                <Select value={editFormData.strength} onValueChange={(val) => setEditFormData({ ...editFormData, strength: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select strength" />
                  </SelectTrigger>
                  <SelectContent className="max-h-[200px]">
                    {editStrengthOptions.map((strength) => (
                      <SelectItem key={strength} value={strength}>
                        {strength}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {editFormData.strength === "__custom__" && (
                  <Input
                    className="mt-2"
                    value={editFormData.strengthCustom ?? ""}
                    onChange={(e) => setEditFormData({ ...editFormData, strengthCustom: e.target.value })}
                    placeholder="Enter strength"
                  />
                )}
              </div>
              <div>
                <Label>Form</Label>
                <Select value={editFormData.form} onValueChange={(val) => setEditFormData({ ...editFormData, form: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select form" />
                  </SelectTrigger>
                  <SelectContent>
                    {DOSAGE_FORMS.map((form) => (
                      <SelectItem key={form} value={form}>
                        {form}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Category</Label>
                <Select value={editFormData.category} onValueChange={(val) => setEditFormData({ ...editFormData, category: val })}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {MEDICATION_CATEGORIES.filter((c) => c.value !== "All Categories").map((cat) => (
                      <SelectItem key={cat.value} value={cat.value}>
                        {cat.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="edit_manufacturer">Manufacturer</Label>
                  <Select value={editFormData.manufacturer} onValueChange={(value) => setEditFormData({ ...editFormData, manufacturer: value })}>
                    <SelectTrigger id="edit_manufacturer">
                      <SelectValue placeholder="Select manufacturer" />
                    </SelectTrigger>
                    <SelectContent className="max-h-[200px]">
                      {MEDICATION_MANUFACTURERS.map((manufacturer) => (
                        <SelectItem key={manufacturer} value={manufacturer}>
                          {manufacturer}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Pack Size</Label>
                  <Input type="number" value={editFormData.pack_size} onChange={(e) => setEditFormData({ ...editFormData, pack_size: e.target.value })} />
                </div>
              </div>
              <div>
                <Label>Minimum Stock Level</Label>
                <Input type="number" value={editFormData.min_stock_level} onChange={(e) => setEditFormData({ ...editFormData, min_stock_level: e.target.value })} className="mt-1" />
              </div>
              <div className="md:col-span-2">
                <label className="flex items-center gap-2 mt-2">
                  <input type="checkbox" checked={editFormData.is_active} onChange={(e) => setEditFormData({ ...editFormData, is_active: e.target.checked })} className="rounded" />
                  <span className="text-sm">Active</span>
                </label>
              </div>
            </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditModal(false)} disabled={editModalLoading}>
                Cancel
              </Button>
              <Button onClick={handleUpdateMedication} className="bg-violet-600 hover:bg-violet-700" disabled={editModalLoading}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showDrugDetailsModal} onOpenChange={setShowDrugDetailsModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px]">
            <DialogHeader>
              <DialogTitle>{selectedDrug?.name}</DialogTitle>
              <DialogDescription>Drug master details</DialogDescription>
            </DialogHeader>
            {drugDetailsLoading && <div className="text-sm text-muted-foreground">Refreshing…</div>}
            {selectedDrug && (
              <div className="grid grid-cols-2 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                {(selectedDrug.generic?.name || selectedDrug.generic_name) && (
                  <div>
                    <p className="text-muted-foreground">Generic</p>
                    <p className="font-medium">{selectedDrug.generic?.name || selectedDrug.generic_name}</p>
                  </div>
                )}
                <div>
                  <p className="text-muted-foreground">Code</p>
                  <p className="font-medium">{selectedDrug.code}</p>
                </div>
                {selectedDrug.strength && (
                  <div>
                    <p className="text-muted-foreground">Strength</p>
                    <p className="font-medium">{selectedDrug.strength}</p>
                  </div>
                )}
                {selectedDrug.form && (
                  <div>
                    <p className="text-muted-foreground">Form</p>
                    <p className="font-medium">{selectedDrug.form}</p>
                  </div>
                )}
                {selectedDrug.unit && (
                  <div>
                    <p className="text-muted-foreground">Unit</p>
                    <p className="font-medium">{selectedDrug.unit}</p>
                  </div>
                )}
                {selectedDrug.category && (
                  <div>
                    <p className="text-muted-foreground">Category</p>
                    <p className="font-medium">{selectedDrug.category}</p>
                  </div>
                )}
                {selectedDrug.manufacturer && (
                  <div>
                    <p className="text-muted-foreground">Manufacturer</p>
                    <p className="font-medium">{selectedDrug.manufacturer}</p>
                  </div>
                )}
                {typeof selectedDrug.pack_size === "number" && (
                  <div>
                    <p className="text-muted-foreground">Pack Size</p>
                    <p className="font-medium">{selectedDrug.pack_size}</p>
                  </div>
                )}
                {selectedDrug.min_stock_level !== undefined && selectedDrug.min_stock_level !== null && (
                  <div>
                    <p className="text-muted-foreground">Minimum Stock Level</p>
                    <p className="font-medium">{Number(selectedDrug.min_stock_level)}</p>
                  </div>
                )}
                <div className="col-span-2">
                  <p className="text-muted-foreground">Status</p>
                  <p className="font-medium">{selectedDrug.is_active ? "Active" : "Inactive"}</p>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button onClick={() => setShowDrugDetailsModal(false)} className="bg-violet-600 hover:bg-violet-700">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
