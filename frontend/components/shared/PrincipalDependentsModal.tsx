"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { patientService, type Patient as ApiPatient } from "@/lib/services";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Users } from "lucide-react";
import { PatientAvatar } from "@/components/shared/PatientAvatar";

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
  onAfterChange,
  onEditDependent,
}: PrincipalDependentsModalProps) {
  const router = useRouter();
  const [dependents, setDependents] = useState<ApiPatient[]>([]);
  const [listLoading, setListLoading] = useState(false);

  const loadDependents = useCallback(async () => {
    if (!principalNumericId || principalNumericId <= 0) return;
    setListLoading(true);
    try {
      const res = await patientService.getPatients({
        category: "dependent",
        principal_staff: principalNumericId,
        page_size: MAX_LIST_PAGE_SIZE,
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

  const limit = principalCategory === "retiree" ? 1 : 5;
  const count = dependents.length;
  const atLimit = count >= limit;

  const handleOpenRegistration = () => {
    if (!principalNumericId || atLimit) return;
    const params = new URLSearchParams({
      category: "dependent",
      principal: String(principalNumericId),
      dependent_type: principalCategory === "retiree" ? "Retiree Dependent" : "Employee Dependent",
    });
    onAfterChange?.();
    router.push(`/medical-records/patients/new?${params.toString()}`);
    onOpenChange(false);
  };

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
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 sm:px-6 sm:py-4">
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
        </div>
        <div className="shrink-0 border-t bg-muted/10 px-4 py-3 sm:px-6">
          {atLimit ? (
            <p className="text-center text-xs text-muted-foreground">
              Maximum dependents for this principal ({limit}). Deactivate a dependent to add another.
            </p>
          ) : (
            <Button type="button" className="h-10 w-full gap-2" onClick={handleOpenRegistration}>
              <Plus className="h-4 w-4" />
              Register dependent (full form)
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
