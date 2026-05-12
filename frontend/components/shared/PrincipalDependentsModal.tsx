"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { patientService, type Patient as ApiPatient } from "@/lib/services";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Pencil, Plus, Users } from "lucide-react";
import { PatientAvatar } from "@/components/shared/PatientAvatar";

const RELATIONSHIPS = ["Spouse", "Child", "Parent", "Sibling", "Guardian", "Other"] as const;

function metaLine(d: ApiPatient): string {
  const age = d.age_display?.trim() || (typeof d.age === "number" ? `${d.age}y` : "");
  const g = typeof d.gender === "string" ? d.gender : "";
  const bits = [d.patient_id, age, g, d.phone?.trim()].filter(Boolean);
  return bits.join(" · ");
}

function dependentTypeShort(t?: string): string {
  if (!t) return "";
  if (t.includes("Retiree")) return "Retiree";
  if (t.includes("Employee")) return "Employee";
  return t.replace(/\s+Dependent/i, "").trim() || t;
}

export type PrincipalDependentsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  principalNumericId: number | null;
  principalDisplayName: string;
  principalPatientId: string;
  principalCategory: "employee" | "retiree";
  defaultTab?: "list" | "add";
  onAfterChange?: () => void;
  onEditDependent: (apiPatient: ApiPatient) => void | Promise<void>;
};

export function PrincipalDependentsModal({
  open,
  onOpenChange,
  principalNumericId,
  principalDisplayName,
  principalPatientId,
  principalCategory,
  defaultTab = "list",
  onAfterChange,
  onEditDependent,
}: PrincipalDependentsModalProps) {
  const [view, setView] = useState<"list" | "add">(defaultTab === "add" ? "add" : "list");
  const [dependents, setDependents] = useState<ApiPatient[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [creating, setCreating] = useState(false);

  const defaultDependentType =
    principalCategory === "retiree" ? "Retiree Dependent" : "Employee Dependent";

  const [form, setForm] = useState({
    dependentType: defaultDependentType,
    gender: "" as "" | "male" | "female",
    surname: "",
    firstName: "",
    middleName: "",
    dateOfBirth: "",
    phone: "",
    occupation: "",
    residentialAddress: "",
    nokRelationship: "Child",
  });

  const resetForm = useCallback(() => {
    setForm({
      dependentType: defaultDependentType,
      gender: "",
      surname: "",
      firstName: "",
      middleName: "",
      dateOfBirth: "",
      phone: "",
      occupation: "",
      residentialAddress: "",
      nokRelationship: "Child",
    });
  }, [defaultDependentType]);

  useEffect(() => {
    if (open) {
      setView(defaultTab === "add" ? "add" : "list");
      resetForm();
    }
  }, [open, defaultTab, resetForm]);

  const loadDependents = useCallback(async () => {
    if (!principalNumericId || principalNumericId <= 0) return;
    setListLoading(true);
    try {
      const res = await patientService.getPatients({
        category: "dependent",
        principal_staff: principalNumericId,
        page_size: 100,
      });
      setDependents(res.results || []);
    } catch (e: unknown) {
      console.error(e);
      toast.error("Could not load dependents.");
      setDependents([]);
    } finally {
      setListLoading(false);
    }
  }, [principalNumericId]);

  useEffect(() => {
    if (open && principalNumericId) void loadDependents();
  }, [open, principalNumericId, loadDependents]);

  const handleCreate = async () => {
    if (!principalNumericId) return;
    if (!form.surname.trim() || !form.firstName.trim() || !form.gender || !form.dateOfBirth) {
      toast.error("Surname, first name, gender, and date of birth are required.");
      return;
    }
    setCreating(true);
    try {
      await patientService.createPatient({
        category: "dependent",
        principal_staff: principalNumericId,
        dependent_type: form.dependentType || defaultDependentType,
        surname: form.surname.trim(),
        first_name: form.firstName.trim(),
        middle_name: form.middleName.trim(),
        gender: form.gender,
        date_of_birth: form.dateOfBirth,
        phone: form.phone.trim(),
        occupation: form.occupation.trim(),
        residential_address: form.residentialAddress.trim(),
        nok_relationship: form.nokRelationship,
      });
      toast.success("Dependent registered.");
      resetForm();
      setView("list");
      await loadDependents();
      onAfterChange?.();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to register dependent.";
      toast.error(msg);
    } finally {
      setCreating(false);
    }
  };

  const limit = principalCategory === "retiree" ? 1 : 5;
  const count = dependents.length;
  const atLimit = count >= limit;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(88vh,720px)] w-[96vw] max-w-xl flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl lg:max-w-3xl">
        <DialogHeader className="sr-only">
          <DialogTitle>Dependents</DialogTitle>
          <DialogDescription>
            {principalDisplayName} · {principalPatientId}
          </DialogDescription>
        </DialogHeader>

        {/* Header: context only (no primary action here) */}
        <div className="shrink-0 border-b bg-muted/20 px-4 py-3 sm:px-5">
          {view === "list" ? (
            <div>
              <div className="flex items-center gap-2 text-foreground">
                <Users className="h-4 w-4 shrink-0 text-violet-500" aria-hidden />
                <span className="text-sm font-semibold tracking-tight">Dependents</span>
                <span className="rounded-full bg-background/80 px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground ring-1 ring-border">
                  {count}/{limit}
                </span>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                <span className="font-medium text-foreground/90">{principalDisplayName}</span>
                <span> · {principalPatientId}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 gap-1 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => setView("list")}
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-xs">Back</span>
              </Button>
              <span className="text-sm font-semibold">New dependent</span>
            </div>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
          {view === "list" ? (
            <>
              {listLoading ? (
                <div className="flex flex-col items-center justify-center gap-2 py-14 text-muted-foreground">
                  <Loader2 className="h-6 w-6 animate-spin" />
                  <span className="text-xs">Loading…</span>
                </div>
              ) : dependents.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-center">
                  <p className="text-sm text-muted-foreground">No dependents linked to this principal yet.</p>
                  {!atLimit ? (
                    <p className="mt-2 max-w-[260px] text-xs text-muted-foreground">
                      Add one with <span className="font-medium text-foreground">Register new dependent</span> at the
                      bottom of this window.
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-muted-foreground">Dependent limit reached for this principal.</p>
                  )}
                </div>
              ) : (
                <ul className="divide-y divide-border/80">
                  {dependents.map((d) => (
                    <li key={d.id}>
                      <div className="group flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                        <PatientAvatar name={d.full_name ?? "?"} photoUrl={d.photo} size="sm" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <p className="truncate text-sm font-medium leading-tight">{d.full_name ?? ""}</p>
                            <span className="shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                              {dependentTypeShort(d.dependent_type)}
                            </span>
                          </div>
                          <p className="mt-0.5 truncate text-xs text-muted-foreground">{metaLine(d)}</p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 shrink-0 text-muted-foreground hover:text-foreground"
                          onClick={() => void onEditDependent(d)}
                          title={`Edit ${d.full_name ?? "dependent"}`}
                        >
                          <Pencil className="h-4 w-4" />
                          <span className="sr-only">Edit</span>
                        </Button>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : (
            <div className="space-y-4">
              {atLimit ? (
                <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
                  This principal already has {count} dependent{count === 1 ? "" : "s"} (limit {limit}).
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label className="text-xs">Type</Label>
                  <Select
                    value={form.dependentType}
                    onValueChange={(v) => setForm((p) => ({ ...p, dependentType: v }))}
                    disabled={atLimit}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Employee Dependent">Employee dependent</SelectItem>
                      <SelectItem value="Retiree Dependent">Retiree dependent</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Gender *</Label>
                  <Select
                    value={form.gender || undefined}
                    onValueChange={(v) => setForm((p) => ({ ...p, gender: v as "male" | "female" }))}
                    disabled={atLimit}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="male">Male</SelectItem>
                      <SelectItem value="female">Female</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Surname *</Label>
                  <Input
                    className="h-9 text-sm"
                    value={form.surname}
                    onChange={(e) => setForm((p) => ({ ...p, surname: e.target.value }))}
                    disabled={atLimit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">First name *</Label>
                  <Input
                    className="h-9 text-sm"
                    value={form.firstName}
                    onChange={(e) => setForm((p) => ({ ...p, firstName: e.target.value }))}
                    disabled={atLimit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Middle name</Label>
                  <Input
                    className="h-9 text-sm"
                    value={form.middleName}
                    onChange={(e) => setForm((p) => ({ ...p, middleName: e.target.value }))}
                    disabled={atLimit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Date of birth *</Label>
                  <Input
                    className="h-9 text-sm"
                    type="date"
                    value={form.dateOfBirth}
                    onChange={(e) => setForm((p) => ({ ...p, dateOfBirth: e.target.value }))}
                    disabled={atLimit}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Relationship *</Label>
                  <Select
                    value={form.nokRelationship}
                    onValueChange={(v) => setForm((p) => ({ ...p, nokRelationship: v }))}
                    disabled={atLimit}
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RELATIONSHIPS.map((r) => (
                        <SelectItem key={r} value={r}>
                          {r}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-xs">Phone</Label>
                  <Input
                    className="h-9 text-sm"
                    value={form.phone}
                    onChange={(e) => setForm((p) => ({ ...p, phone: e.target.value }))}
                    disabled={atLimit}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Occupation</Label>
                  <Input
                    className="h-9 text-sm"
                    value={form.occupation}
                    onChange={(e) => setForm((p) => ({ ...p, occupation: e.target.value }))}
                    disabled={atLimit}
                  />
                </div>
                <div className="space-y-1.5 sm:col-span-2">
                  <Label className="text-xs">Residential address</Label>
                  <Textarea
                    rows={2}
                    className="min-h-[72px] resize-none text-sm"
                    value={form.residentialAddress}
                    onChange={(e) => setForm((p) => ({ ...p, residentialAddress: e.target.value }))}
                    disabled={atLimit}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t pt-3">
                <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
                  Cancel
                </Button>
                <Button type="button" size="sm" onClick={() => void handleCreate()} disabled={creating || atLimit}>
                  {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                </Button>
              </div>
            </div>
          )}
        </div>
        {view === "list" && (
          <div className="shrink-0 border-t bg-muted/10 px-4 py-3 sm:px-6">
            {atLimit ? (
              <p className="text-center text-xs text-muted-foreground">
                Maximum dependents for this principal ({limit}). Deactivate a dependent to add another.
              </p>
            ) : (
              <Button type="button" className="h-10 w-full gap-2" onClick={() => setView("add")}>
                <Plus className="h-4 w-4" />
                Register new dependent
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
