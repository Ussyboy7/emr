"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import {
  BedDouble,
  Building2,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";
import {
  wardService,
  type Ward,
  type Bed,
} from "@/lib/services/ward-service";
import { MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";

const WARD_TYPES: { value: string; label: string }[] = [
  { value: "general", label: "General Medicine" },
  { value: "surgical", label: "Surgical" },
  { value: "medical", label: "Medical" },
  { value: "pediatric", label: "Pediatric" },
  { value: "maternity", label: "Maternity" },
  { value: "icu", label: "Intensive Care Unit" },
  { value: "ccu", label: "Coronary Care Unit" },
  { value: "emergency", label: "Emergency" },
  { value: "isolation", label: "Isolation" },
  { value: "psychiatric", label: "Psychiatric" },
];

const WARD_STATUS: { value: string; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "maintenance", label: "Under Maintenance" },
  { value: "closed", label: "Closed" },
];

const BED_TYPES: { value: string; label: string }[] = [
  { value: "standard", label: "Standard" },
  { value: "icu", label: "ICU" },
  { value: "ventilator", label: "Ventilator" },
  { value: "isolation", label: "Isolation" },
  { value: "maternity", label: "Maternity" },
  { value: "pediatric", label: "Pediatric" },
];

const BED_STATUS: { value: string; label: string }[] = [
  { value: "available", label: "Available" },
  { value: "occupied", label: "Occupied" },
  { value: "maintenance", label: "Under Maintenance" },
  { value: "reserved", label: "Reserved" },
  { value: "out_of_service", label: "Out of Service" },
];

export interface WardsAdminManagerHandle {
  openCreate: () => void;
}

interface WardsAdminManagerProps {
  showHeader?: boolean;
}

type WardFormState = {
  ward_code: string;
  name: string;
  ward_type: string;
  floor: string;
  building: string;
  total_beds: number;
  description: string;
  status: string;
  phone_extension: string;
};

const emptyWardForm = (): WardFormState => ({
  ward_code: "",
  name: "",
  ward_type: "general",
  floor: "",
  building: "",
  total_beds: 20,
  description: "",
  status: "active",
  phone_extension: "",
});

function wardToForm(w: Ward): WardFormState {
  return {
    ward_code: w.ward_code,
    name: w.name,
    ward_type: w.ward_type,
    floor: w.floor ?? "",
    building: w.building ?? "",
    total_beds: w.total_beds,
    description: w.description ?? "",
    status: w.status,
    phone_extension: w.phone_extension ?? "",
  };
}

export const WardsAdminManager = forwardRef<
  WardsAdminManagerHandle,
  WardsAdminManagerProps
>(function WardsAdminManager({ showHeader = true }, ref) {
  const [wards, setWards] = useState<Ward[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const [wardDialogOpen, setWardDialogOpen] = useState(false);
  const [editingWardId, setEditingWardId] = useState<number | null>(null);
  const [wardForm, setWardForm] = useState<WardFormState>(emptyWardForm);
  const [savingWard, setSavingWard] = useState(false);

  const [bedsDialogOpen, setBedsDialogOpen] = useState(false);
  const [bedsWard, setBedsWard] = useState<Ward | null>(null);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(false);
  const [bedDialogOpen, setBedDialogOpen] = useState(false);
  const [editingBed, setEditingBed] = useState<Bed | null>(null);
  const [bedForm, setBedForm] = useState({
    bed_number: "",
    bed_type: "standard",
    status: "available",
    has_oxygen: false,
    has_suction: false,
    has_monitor: false,
    has_ventilator: false,
    has_iv_pole: true,
  });
  const [savingBed, setSavingBed] = useState(false);

  const loadWards = useCallback(async () => {
    setLoading(true);
    try {
      const res = await wardService.getWards({ page_size: MAX_LIST_PAGE_SIZE });
      setWards(res.results || []);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Failed to load wards";
      toast.error(msg);
      setWards([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadWards();
  }, [loadWards]);

  useImperativeHandle(ref, () => ({
    openCreate: () => {
      setEditingWardId(null);
      setWardForm(emptyWardForm());
      setWardDialogOpen(true);
    },
  }));

  const filteredWards = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return wards;
    return wards.filter(
      (w) =>
        w.name.toLowerCase().includes(q) ||
        w.ward_code.toLowerCase().includes(q) ||
        (w.description || "").toLowerCase().includes(q),
    );
  }, [wards, search]);

  const openEditWard = (w: Ward) => {
    setEditingWardId(w.id);
    setWardForm(wardToForm(w));
    setWardDialogOpen(true);
  };

  const submitWard = async () => {
    if (!wardForm.ward_code.trim() || !wardForm.name.trim()) {
      toast.error("Ward code and name are required");
      return;
    }
    setSavingWard(true);
    try {
      if (editingWardId != null) {
        await wardService.updateWard(editingWardId, {
          ward_code: wardForm.ward_code.trim(),
          name: wardForm.name.trim(),
          ward_type: wardForm.ward_type,
          floor: wardForm.floor || undefined,
          building: wardForm.building || undefined,
          total_beds: wardForm.total_beds,
          description: wardForm.description || undefined,
          status: wardForm.status,
          phone_extension: wardForm.phone_extension || undefined,
        });
        toast.success("Ward updated");
      } else {
        await wardService.createWard({
          ward_code: wardForm.ward_code.trim(),
          name: wardForm.name.trim(),
          ward_type: wardForm.ward_type,
          floor: wardForm.floor || undefined,
          building: wardForm.building || undefined,
          total_beds: wardForm.total_beds,
          description: wardForm.description || undefined,
          status: wardForm.status,
          phone_extension: wardForm.phone_extension || undefined,
        });
        toast.success("Ward created");
      }
      setWardDialogOpen(false);
      await loadWards();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSavingWard(false);
    }
  };

  const openBedsEditor = async (w: Ward) => {
    setBedsWard(w);
    setBedsDialogOpen(true);
    setLoadingBeds(true);
    try {
      const list = await wardService.getWardBeds(w.id);
      setBeds(Array.isArray(list) ? list : []);
    } catch {
      toast.error("Could not load beds");
      setBeds([]);
    } finally {
      setLoadingBeds(false);
    }
  };

  const openNewBed = () => {
    if (!bedsWard) return;
    setEditingBed(null);
    setBedForm({
      bed_number: "",
      bed_type: "standard",
      status: "available",
      has_oxygen: false,
      has_suction: false,
      has_monitor: false,
      has_ventilator: false,
      has_iv_pole: true,
    });
    setBedDialogOpen(true);
  };

  const openEditBed = (b: Bed) => {
    setEditingBed(b);
    setBedForm({
      bed_number: b.bed_number,
      bed_type: b.bed_type,
      status: b.status,
      has_oxygen: b.has_oxygen,
      has_suction: b.has_suction,
      has_monitor: b.has_monitor,
      has_ventilator: b.has_ventilator,
      has_iv_pole: b.has_iv_pole,
    });
    setBedDialogOpen(true);
  };

  const submitBed = async () => {
    if (!bedsWard || !bedForm.bed_number.trim()) {
      toast.error("Bed number is required");
      return;
    }
    setSavingBed(true);
    try {
      if (editingBed) {
        await wardService.updateBed(editingBed.id, {
          bed_number: bedForm.bed_number.trim(),
          bed_type: bedForm.bed_type,
          status: bedForm.status,
          has_oxygen: bedForm.has_oxygen,
          has_suction: bedForm.has_suction,
          has_monitor: bedForm.has_monitor,
          has_ventilator: bedForm.has_ventilator,
          has_iv_pole: bedForm.has_iv_pole,
        });
        toast.success("Bed updated");
      } else {
        await wardService.createBed({
          ward: bedsWard.id,
          bed_number: bedForm.bed_number.trim(),
          bed_type: bedForm.bed_type,
          status: bedForm.status,
          has_oxygen: bedForm.has_oxygen,
          has_suction: bedForm.has_suction,
          has_monitor: bedForm.has_monitor,
          has_ventilator: bedForm.has_ventilator,
          has_iv_pole: bedForm.has_iv_pole,
        });
        toast.success("Bed added");
      }
      setBedDialogOpen(false);
      const list = await wardService.getWardBeds(bedsWard.id);
      setBeds(Array.isArray(list) ? list : []);
      void loadWards();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
    } finally {
      setSavingBed(false);
    }
  };

  const deleteBed = async (b: Bed) => {
    if (
      !confirm(
        `Remove Bed ${b.bed_number} from this ward? This cannot be undone if the API allows delete.`,
      )
    )
      return;
    try {
      await wardService.deleteBed(b.id);
      toast.success("Bed removed");
      if (bedsWard) {
        const list = await wardService.getWardBeds(bedsWard.id);
        setBeds(Array.isArray(list) ? list : []);
      }
      await loadWards();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Delete failed";
      toast.error(msg);
    }
  };

  return (
    <div className="space-y-4">
      {showHeader && (
        <div>
          <h2 className="text-lg font-semibold text-foreground flex items-center gap-2">
            <Building2 className="h-5 w-5 text-teal-600" />
            Inpatient wards
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Configure wards and physical beds. Nurses assign patients to these
            beds from Ward Care.
          </p>
        </div>
      )}

      <Card>
        <CardContent className="p-4 flex flex-col sm:flex-row gap-3 sm:items-center">
          <div className="relative flex-1 min-w-[12rem]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-9"
              placeholder="Search code, name, description…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <Card>
          <CardContent className="p-12 flex justify-center">
            <Loader2 className="h-10 w-10 animate-spin text-muted-foreground" />
          </CardContent>
        </Card>
      ) : filteredWards.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="p-10 text-center text-muted-foreground">
            No wards match your search.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-2">
          {filteredWards.map((w) => (
            <Card key={w.id} className="border-l-4 border-l-teal-500">
              <CardContent className="py-3 px-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold truncate">{w.name}</span>
                      <Badge variant="outline" className="text-[10px] font-mono">
                        {w.ward_code}
                      </Badge>
                      <Badge variant="secondary" className="text-[10px] capitalize">
                        {w.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {WARD_TYPES.find((t) => t.value === w.ward_type)?.label ?? w.ward_type}
                      {w.floor ? ` · Floor ${w.floor}` : ""}
                      {w.building ? ` · ${w.building}` : ""}
                    </p>
                    <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                      <span>
                        Beds: {w.beds_count ?? 0} rows · {w.occupied_beds}/{w.total_beds}{" "}
                        occupied
                      </span>
                      {w.phone_extension && <span>· Ext {w.phone_extension}</span>}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 shrink-0">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => void openBedsEditor(w)}
                    >
                      <BedDouble className="h-3.5 w-3.5 mr-1" />
                      Beds ({w.beds_count ?? 0})
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8"
                      onClick={() => openEditWard(w)}
                    >
                      <Pencil className="h-3.5 w-3.5 mr-1" />
                      Edit ward
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Ward create / edit */}
      <Dialog open={wardDialogOpen} onOpenChange={setWardDialogOpen}>
        <DialogContent className={MODAL_SIZES.md}>
          <DialogHeader>
            <DialogTitle>{editingWardId ? "Edit ward" : "Add ward"}</DialogTitle>
            <DialogDescription>
              Ward capacity ({typeof wardForm.total_beds === "number" ? wardForm.total_beds : "—"}) is
              used for occupancy KPIs; add individual bed rows in &quot;Beds&quot;.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Ward code *</Label>
                <Input
                  value={wardForm.ward_code}
                  onChange={(e) =>
                    setWardForm((p) => ({ ...p, ward_code: e.target.value }))
                  }
                  placeholder="e.g. GM-01"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Name *</Label>
                <Input
                  value={wardForm.name}
                  onChange={(e) =>
                    setWardForm((p) => ({ ...p, name: e.target.value }))
                  }
                  placeholder="e.g. General Medicine"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={wardForm.ward_type}
                  onValueChange={(v) =>
                    setWardForm((p) => ({ ...p, ward_type: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WARD_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={wardForm.status}
                  onValueChange={(v) =>
                    setWardForm((p) => ({ ...p, status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {WARD_STATUS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Floor</Label>
                <Input
                  value={wardForm.floor}
                  onChange={(e) =>
                    setWardForm((p) => ({ ...p, floor: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-1.5">
                <Label>Building</Label>
                <Input
                  value={wardForm.building}
                  onChange={(e) =>
                    setWardForm((p) => ({ ...p, building: e.target.value }))
                  }
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Total beds (capacity)</Label>
              <Input
                type="number"
                min={0}
                value={wardForm.total_beds}
                onChange={(e) =>
                  setWardForm((p) => ({
                    ...p,
                    total_beds: Math.max(0, parseInt(e.target.value, 10) || 0),
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Phone extension</Label>
              <Input
                value={wardForm.phone_extension}
                onChange={(e) =>
                  setWardForm((p) => ({
                    ...p,
                    phone_extension: e.target.value,
                  }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label>Description</Label>
              <Textarea
                rows={3}
                value={wardForm.description}
                onChange={(e) =>
                  setWardForm((p) => ({ ...p, description: e.target.value }))
                }
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setWardDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700"
              onClick={() => void submitWard()}
              disabled={savingWard}
            >
              {savingWard ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : editingWardId ? (
                "Save"
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-1" />
                  Create
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Beds list */}
      <Dialog
        open={bedsDialogOpen}
        onOpenChange={(o) => {
          setBedsDialogOpen(o);
          if (!o) setBedsWard(null);
        }}
      >
        <DialogContent className={MODAL_SIZES.ml}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <BedDouble className="h-5 w-5" />
              Beds — {bedsWard?.name}
            </DialogTitle>
            <DialogDescription>
              Edit bed numbers, types, and equipment flags. Occupied beds cannot
              always be deleted safely — release the patient in Ward Care first.
            </DialogDescription>
          </DialogHeader>
          {loadingBeds ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
              {beds.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">
                  No bed rows yet. Add beds here or sync capacity above.
                </p>
              ) : (
                beds.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between gap-2 rounded-md border p-2.5 text-sm"
                  >
                    <div className="min-w-0">
                      <div className="font-medium">Bed {b.bed_number}</div>
                      <div className="text-xs text-muted-foreground capitalize">
                        {b.bed_type} · {b.status}
                        {b.current_patient_name && (
                          <span className="text-amber-600">
                            {" "}
                            · {b.current_patient_name}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8"
                        onClick={() => openEditBed(b)}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 text-destructive"
                        onClick={() => void deleteBed(b)}
                        disabled={b.status === "occupied"}
                        title={
                          b.status === "occupied"
                            ? "Vacate bed from Ward Care first"
                            : "Delete bed"
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={openNewBed} disabled={!bedsWard}>
              <Plus className="h-4 w-4 mr-1" />
              Add bed
            </Button>
            <Button onClick={() => setBedsDialogOpen(false)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bed create / edit */}
      <Dialog open={bedDialogOpen} onOpenChange={setBedDialogOpen}>
        <DialogContent className={MODAL_SIZES.xs}>
          <DialogHeader>
            <DialogTitle>{editingBed ? "Edit bed" : "Add bed"}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-3 py-2">
            <div className="space-y-1.5">
              <Label>Bed number *</Label>
              <Input
                value={bedForm.bed_number}
                onChange={(e) =>
                  setBedForm((p) => ({ ...p, bed_number: e.target.value }))
                }
                placeholder="e.g. 12A"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={bedForm.bed_type}
                  onValueChange={(v) =>
                    setBedForm((p) => ({ ...p, bed_type: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BED_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select
                  value={bedForm.status}
                  onValueChange={(v) =>
                    setBedForm((p) => ({ ...p, status: v }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BED_STATUS.map((t) => (
                      <SelectItem key={t.value} value={t.value}>
                        {t.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  ["has_oxygen", "Oxygen"],
                  ["has_suction", "Suction"],
                  ["has_monitor", "Monitor"],
                  ["has_ventilator", "Ventilator"],
                ] as const
              ).map(([key, label]) => (
                <div key={key} className="flex items-center gap-2">
                  <Checkbox
                    id={key}
                    checked={bedForm[key]}
                    onCheckedChange={(c) =>
                      setBedForm((p) => ({ ...p, [key]: !!c }))
                    }
                  />
                  <Label htmlFor={key} className="text-sm font-normal">
                    {label}
                  </Label>
                </div>
              ))}
              <div className="flex items-center gap-2 col-span-2">
                <Checkbox
                  id="iv"
                  checked={bedForm.has_iv_pole}
                  onCheckedChange={(c) =>
                    setBedForm((p) => ({ ...p, has_iv_pole: !!c }))
                  }
                />
                <Label htmlFor="iv" className="text-sm font-normal">
                  IV pole
                </Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBedDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void submitBed()} disabled={savingBed}>
              {savingBed ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
