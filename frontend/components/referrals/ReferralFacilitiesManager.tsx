"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useState,
} from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
import { toast } from "sonner";
import {
  Plus,
  Search,
  Edit,
  Trash2,
  Loader2,
  Building2,
} from "lucide-react";
import {
  referralService,
  type ReferralFacility,
} from "@/lib/services/referral-service";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";

const FACILITY_TYPE_OPTIONS: Array<{
  value: ReferralFacility["facility_type"];
  label: string;
  badgeClass: string;
  borderClass: string;
  iconBgClass: string;
  iconClass: string;
}> = [
  {
    value: "internal",
    label: "Internal",
    badgeClass: "bg-teal-100 text-teal-800",
    borderClass: "border-l-teal-500",
    iconBgClass: "bg-teal-100 dark:bg-teal-900/30",
    iconClass: "text-teal-600",
  },
  {
    value: "external",
    label: "External",
    badgeClass: "bg-orange-100 text-orange-800",
    borderClass: "border-l-orange-500",
    iconBgClass: "bg-orange-100 dark:bg-orange-900/30",
    iconClass: "text-orange-600",
  },
  {
    value: "specialist",
    label: "Specialist",
    badgeClass: "bg-purple-100 text-purple-800",
    borderClass: "border-l-purple-500",
    iconBgClass: "bg-purple-100 dark:bg-purple-900/30",
    iconClass: "text-purple-600",
  },
];

interface FacilityFormState {
  name: string;
  code: string;
  facility_type: ReferralFacility["facility_type"];
  phone: string;
  email: string;
  address: string;
  contact_person_title: string;
  specialties: string;
  notes: string;
  is_active: boolean;
  sort_order: number;
}

const emptyForm: FacilityFormState = {
  name: "",
  code: "",
  facility_type: "external",
  phone: "",
  email: "",
  address: "",
  contact_person_title: "The Medical Director",
  specialties: "",
  notes: "",
  is_active: true,
  sort_order: 0,
};

function metaFor(type: ReferralFacility["facility_type"]) {
  return FACILITY_TYPE_OPTIONS.find((o) => o.value === type) ?? FACILITY_TYPE_OPTIONS[1];
}

export interface ReferralFacilitiesManagerHandle {
  openCreate: () => void;
}

interface ReferralFacilitiesManagerProps {
  /**
   * When false, the component renders without its own page heading + Add
   * button; the parent surface (e.g. /admin/clinics) is responsible for
   * those controls and can call `openCreate()` via the ref. Defaults to
   * `true` for the standalone route.
   */
  showHeader?: boolean;
}

/**
 * Self-contained CRUD UI for the referral facility catalog.
 *
 * Used both as a standalone page (showHeader=true) and embedded as a tab
 * on /admin/clinics → "Facilities & Departments" (showHeader=false). In
 * embedded mode the layout matches the sibling tabs exactly: a single
 * horizontal filter Card and vertically stacked accent-bordered row
 * cards, so users get a consistent feel as they move between tabs.
 *
 * The parent owns the page-level "Add facility" button when embedded —
 * it triggers the create dialog via the imperative handle exposed here.
 */
export const ReferralFacilitiesManager = forwardRef<
  ReferralFacilitiesManagerHandle,
  ReferralFacilitiesManagerProps
>(function ReferralFacilitiesManager({ showHeader = true }, ref) {
  const [facilities, setFacilities] = useState<ReferralFacility[]>([]);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | ReferralFacility["facility_type"]>("all");
  // Mirror the page-level "Status" filter: all | Active | Inactive.
  const [statusFilter, setStatusFilter] = useState<"all" | "Active" | "Inactive">("Active");

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ReferralFacility | null>(null);
  const [deleting, setDeleting] = useState<ReferralFacility | null>(null);
  const [form, setForm] = useState<FacilityFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deletingNow, setDeletingNow] = useState(false);

  const refresh = async () => {
    setLoading(true);
    try {
      const rows = await referralService.getReferralFacilities({
        is_active: null,
      });
      setFacilities(rows);
    } catch (error) {
      if (isAuthenticationError(error)) setAuthError(error);
      else toast.error("Failed to load referral facilities");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return facilities.filter((f) => {
      if (statusFilter === "Active" && !f.is_active) return false;
      if (statusFilter === "Inactive" && f.is_active) return false;
      if (typeFilter !== "all" && f.facility_type !== typeFilter) return false;
      if (!q) return true;
      const haystack = [f.name, f.code, f.email, f.address, f.specialties]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [facilities, search, statusFilter, typeFilter]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditing(null);
    setCreateDialogOpen(true);
  };

  useImperativeHandle(ref, () => ({ openCreate }), []);

  const openEdit = (f: ReferralFacility) => {
    setForm({
      name: f.name,
      code: f.code ?? "",
      facility_type: f.facility_type,
      phone: f.phone ?? "",
      email: f.email ?? "",
      address: f.address ?? "",
      contact_person_title: f.contact_person_title ?? "The Medical Director",
      specialties: f.specialties ?? "",
      notes: f.notes ?? "",
      is_active: f.is_active,
      sort_order: f.sort_order,
    });
    setEditing(f);
    setCreateDialogOpen(true);
  };

  const submit = async () => {
    const name = form.name.trim();
    if (!name) {
      toast.error("Facility name is required");
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await referralService.updateReferralFacility(editing.id, { ...form, name });
        toast.success(`Updated ${name}`);
      } else {
        await referralService.createReferralFacility({ ...form, name });
        toast.success(`Added ${name}`);
      }
      setCreateDialogOpen(false);
      setEditing(null);
      void refresh();
    } catch (error) {
      if (isAuthenticationError(error)) setAuthError(error);
      else toast.error((error as Error)?.message || "Failed to save facility");
    } finally {
      setSaving(false);
    }
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeletingNow(true);
    try {
      await referralService.deleteReferralFacility(deleting.id);
      toast.success(`Removed ${deleting.name}`);
      setDeleting(null);
      void refresh();
    } catch (error) {
      if (isAuthenticationError(error)) setAuthError(error);
      else toast.error((error as Error)?.message || "Failed to delete facility");
    } finally {
      setDeletingNow(false);
    }
  };

  const toggleActive = async (f: ReferralFacility) => {
    try {
      await referralService.updateReferralFacility(f.id, { is_active: !f.is_active });
      toast.success(f.is_active ? `Hid ${f.name}` : `Restored ${f.name}`);
      void refresh();
    } catch (error) {
      if (isAuthenticationError(error)) setAuthError(error);
      else toast.error((error as Error)?.message || "Failed to update facility");
    }
  };

  const filterCard = (
    <Card className="mt-4">
      <CardContent className="p-4">
        <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
          <div className="relative flex-1 min-w-[min(100%,16rem)]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              className="pl-10"
              placeholder="Search name, code, address, email…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select
              value={typeFilter}
              onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
            >
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="All types" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                {FACILITY_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={statusFilter}
              onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
            >
              <SelectTrigger className="w-[130px]">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const rowList = (
    <>
      {loading ? (
        <Card className="mt-4">
          <CardContent className="p-8 text-center text-muted-foreground">
            <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
            <p>Loading referral facilities…</p>
          </CardContent>
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="mt-4">
          <CardContent className="p-8 text-center text-muted-foreground">
            <p>No referral facilities match your filters.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3 mt-4">
          {filtered.map((f) => {
            const meta = metaFor(f.facility_type);
            const borderColor = f.is_active ? meta.borderClass : "border-l-gray-500";
            const iconBg = f.is_active ? meta.iconBgClass : "bg-gray-100 dark:bg-gray-900/30";
            const iconColor = f.is_active ? meta.iconClass : "text-gray-600";
            return (
              <Card
                key={f.id}
                className={`border-l-4 hover:shadow-md transition-shadow ${borderColor} ${
                  !f.is_active ? "opacity-60" : ""
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div
                      className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}
                    >
                      <Building2 className={`h-5 w-5 ${iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold truncate">{f.name}</span>
                        {f.code ? (
                          <Badge variant="outline" className="text-xs font-mono">
                            {f.code}
                          </Badge>
                        ) : null}
                        <Badge className={`${meta.badgeClass} text-xs`}>{meta.label}</Badge>
                        {!f.is_active ? (
                          <Badge variant="outline" className="text-xs">
                            Inactive
                          </Badge>
                        ) : null}
                      </div>
                      {f.address ? (
                        <div className="mt-1 text-xs text-muted-foreground whitespace-pre-line">
                          {f.address}
                        </div>
                      ) : (
                        <div className="mt-1 text-xs text-amber-700 dark:text-amber-400">
                          No address yet — add one before printing.
                        </div>
                      )}
                      {(f.phone || f.email) && (
                        <div className="mt-1 text-xs text-muted-foreground">
                          {[f.phone, f.email].filter(Boolean).join(" · ")}
                        </div>
                      )}
                      {f.specialties ? (
                        <div className="mt-1 text-xs text-muted-foreground">
                          <span className="font-medium">Specialties:</span> {f.specialties}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 px-2 text-xs"
                        onClick={() => toggleActive(f)}
                      >
                        {f.is_active ? "Disable" : "Enable"}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={() => openEdit(f)}
                      >
                        <Edit className="h-4 w-4 text-muted-foreground hover:text-blue-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0 text-rose-600"
                        onClick={() => setDeleting(f)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );

  return (
    <div className={showHeader ? "space-y-6" : ""}>
      {showHeader ? (
        <>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                <Building2 className="h-5 w-5 text-blue-500" />
                Referral facilities
              </h1>
              <p className="text-sm text-muted-foreground mt-1">
                Catalog of receiving hospitals printed on responsibility forms.
                Add, edit, or deactivate the facilities your clinicians choose
                when creating a referral.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={openCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Add facility
              </Button>
            </div>
          </div>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <div className="md:col-span-2 relative">
                  <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    className="pl-9"
                    placeholder="Search name, code, address, email…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <Select
                  value={typeFilter}
                  onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="All types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All types</SelectItem>
                    {FACILITY_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select
                  value={statusFilter}
                  onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All status</SelectItem>
                    <SelectItem value="Active">Active</SelectItem>
                    <SelectItem value="Inactive">Inactive</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
          {rowList}
        </>
      ) : (
        <>
          {filterCard}
          {rowList}
        </>
      )}

      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-teal-500" />
              {editing ? "Edit referral facility" : "Add referral facility"}
            </DialogTitle>
            <DialogDescription>
              These details are printed on the responsibility form's "To:" block.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 space-y-2">
                <Label>Name *</Label>
                <Input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Federal Medical Centre, Ebute Meta"
                />
              </div>
              <div className="space-y-2">
                <Label>Code</Label>
                <Input
                  value={form.code}
                  onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                  placeholder="Optional short code"
                />
              </div>
              <div className="space-y-2">
                <Label>Type</Label>
                <Select
                  value={form.facility_type}
                  onValueChange={(v) =>
                    setForm((f) => ({
                      ...f,
                      facility_type: v as ReferralFacility["facility_type"],
                    }))
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {FACILITY_TYPE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Postal address</Label>
                <Textarea
                  rows={3}
                  value={form.address}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, address: e.target.value }))
                  }
                  placeholder={"e.g.\n13 Mortuary Avenue\nEbute Meta, Lagos"}
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Addressee role</Label>
                <Input
                  value={form.contact_person_title}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, contact_person_title: e.target.value }))
                  }
                  placeholder="The Medical Director"
                />
                <p className="text-xs text-muted-foreground">
                  Printed as "To: …" on the responsibility form. Defaults to "The Medical Director".
                </p>
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Specialties</Label>
                <Input
                  value={form.specialties}
                  onChange={(e) => setForm((f) => ({ ...f, specialties: e.target.value }))}
                  placeholder="Comma-separated (e.g. Cardiology, Orthopaedics)"
                />
              </div>
              <div className="sm:col-span-2 space-y-2">
                <Label>Notes</Label>
                <Textarea
                  rows={2}
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label>Sort order</Label>
                <Input
                  type="number"
                  value={form.sort_order}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, sort_order: Number(e.target.value) || 0 }))
                  }
                />
                <p className="text-xs text-muted-foreground">
                  Lower numbers appear first in the dropdown.
                </p>
              </div>
              <div className="space-y-2 flex items-end">
                <label className="inline-flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="h-4 w-4"
                    checked={form.is_active}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, is_active: e.target.checked }))
                    }
                  />
                  Active (visible in clinician dropdown)
                </label>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-6">
            <Button
              variant="outline"
              onClick={() => setCreateDialogOpen(false)}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              onClick={submit}
              disabled={saving || !form.name.trim()}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              {editing ? "Save changes" : "Add facility"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={deleting != null} onOpenChange={(o) => !o && setDeleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove facility?</DialogTitle>
            <DialogDescription>
              Existing referrals already snapshot this facility's name and address,
              so they keep printing correctly. Removing only hides it from the
              clinician dropdown going forward.
            </DialogDescription>
          </DialogHeader>
          <p className="font-medium">{deleting?.name}</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleting(null)} disabled={deletingNow}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void confirmDelete()}
              disabled={deletingNow}
            >
              {deletingNow ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
});
