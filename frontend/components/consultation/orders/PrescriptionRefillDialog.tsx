"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { MAX_LIST_PAGE_SIZE } from '@/lib/pagination-constants';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ChevronDown, ChevronRight, History, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { pharmacyService, type Prescription } from "@/lib/services";
import {
  getRefillablePrescriptions,
  isRefillableLine,
  orderInputsFromSelectedLines,
  refillLineKey,
  type RefillLineKey,
} from "@/lib/consultation/prescription-refill";
import { formatDisplayDateMedium } from "@/lib/dates";
import type { PrescriptionOrderItemInput } from "./PrescriptionOrderModal";

function formatRxDate(rx: Prescription): string {
  const raw = rx.dispensed_at || rx.prescribed_at || rx.date;
  return formatDisplayDateMedium(raw);
}

function statusLabel(status: Prescription["status"]): string {
  switch (status) {
    case "dispensed":
      return "Dispensed";
    case "partially_dispensed":
      return "Partially dispensed";
    case "dispensing":
      return "Dispensing";
    case "pending":
      return "Pending";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

export function PrescriptionRefillDialog({
  open,
  onOpenChange,
  patientId,
  patientAllergies,
  existingDraftGenericIds = [],
  onContinue,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: number | null | undefined;
  patientAllergies?: string[];
  existingDraftGenericIds?: number[];
  onContinue: (items: PrescriptionOrderItemInput[]) => void;
}) {
  const [loading, setLoading] = useState(false);
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [expanded, setExpanded] = useState<Set<number>>(new Set());
  const [selected, setSelected] = useState<Set<RefillLineKey>>(new Set());

  const load = useCallback(async () => {
    if (!patientId || !Number.isFinite(patientId)) return;
    setLoading(true);
    try {
      const res = await pharmacyService.getPrescriptions({
        patient: String(patientId),
        page_size: MAX_LIST_PAGE_SIZE,
      });
      const refillable = getRefillablePrescriptions(res.results || []);
      setPrescriptions(refillable);
      if (refillable.length > 0) {
        setExpanded(new Set([refillable[0].id]));
      } else {
        setExpanded(new Set());
      }
      setSelected(new Set());
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Failed to load prescriptions";
      toast.error(message);
      setPrescriptions([]);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (open) void load();
    else {
      setSelected(new Set());
      setPrescriptions([]);
    }
  }, [open, load]);

  const draftGenericSet = useMemo(
    () => new Set(existingDraftGenericIds.filter((id) => Number.isFinite(id) && id > 0)),
    [existingDraftGenericIds]
  );

  const selectedItems = useMemo(
    () => orderInputsFromSelectedLines(prescriptions, selected),
    [prescriptions, selected]
  );

  const duplicateCount = useMemo(
    () => selectedItems.filter((i) => draftGenericSet.has(i.generic)).length,
    [selectedItems, draftGenericSet]
  );

  const toggleLine = (key: RefillLineKey) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectAllInRx = (rx: Prescription) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const line of rx.medications || []) {
        if (!isRefillableLine(rx, line)) continue;
        next.add(refillLineKey(rx.id, line.id));
      }
      return next;
    });
  };

  const toggleExpanded = (rxId: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(rxId)) next.delete(rxId);
      else next.add(rxId);
      return next;
    });
  };

  const handleContinue = () => {
    if (selectedItems.length === 0) {
      toast.error("Select at least one medication line");
      return;
    }
    onContinue(selectedItems);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[95vw] sm:max-w-[720px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5 text-violet-500" />
            Refill from previous prescriptions
          </DialogTitle>
          <DialogDescription>
            Choose medications from previous prescriptions — dispensed or still in the pharmacy queue.
            You can review and edit them before they are added as drafts in this visit.
          </DialogDescription>
        </DialogHeader>

        {patientAllergies && patientAllergies.length > 0 && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
              <AlertTriangle className="h-4 w-4" />
              <span>
                <strong>Allergies:</strong> {patientAllergies.join(", ")}
              </span>
            </div>
          </div>
        )}

        {duplicateCount > 0 && (
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {duplicateCount} selected line(s) match generics already in your draft list — you can still
            continue and review in the form.
          </p>
        )}

        {loading ? (
          <div className="py-12 flex flex-col items-center text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin mb-2" />
            Loading prescription history…
          </div>
        ) : prescriptions.length === 0 ? (
          <div className="py-10 text-center text-muted-foreground text-sm">
            No previous prescriptions found for this patient.
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
            {prescriptions.map((rx) => {
              const isOpen = expanded.has(rx.id);
              const lines = (rx.medications || []).filter((line) => isRefillableLine(rx, line));
              const selectedInRx = lines.filter((line) =>
                selected.has(refillLineKey(rx.id, line.id))
              ).length;

              return (
                <div
                  key={rx.id}
                  className="border rounded-lg overflow-hidden bg-card"
                >
                  <button
                    type="button"
                    className="w-full flex items-center gap-2 p-3 text-left hover:bg-muted/50"
                    onClick={() => toggleExpanded(rx.id)}
                  >
                    {isOpen ? (
                      <ChevronDown className="h-4 w-4 shrink-0" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
                        <span>{formatRxDate(rx)}</span>
                        <Badge variant="outline" className="text-xs">
                          {statusLabel(rx.status)}
                        </Badge>
                        {rx.doctor_name && (
                          <span className="text-muted-foreground font-normal truncate">
                            {rx.doctor_name}
                          </span>
                        )}
                      </div>
                      {rx.diagnosis && (
                        <p className="text-xs text-muted-foreground truncate mt-0.5">
                          {rx.diagnosis}
                        </p>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {selectedInRx}/{lines.length} selected
                    </span>
                  </button>

                  {isOpen && (
                    <div className="border-t px-3 pb-3 space-y-2">
                      <div className="flex justify-end pt-2">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => selectAllInRx(rx)}
                          disabled={lines.length === 0}
                        >
                          Select all in this order
                        </Button>
                      </div>
                      {lines.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-2">
                          No refillable lines (missing generic, superseded, or record-only).
                        </p>
                      ) : (
                        lines.map((line) => {
                          const key = refillLineKey(rx.id, line.id);
                          const name =
                            line.medication_name ||
                            (line.medication_details as { name?: string } | undefined)?.name ||
                            "Medication";
                          const checked = selected.has(key);
                          const isDup =
                            typeof line.generic === "number" && draftGenericSet.has(line.generic);

                          return (
                            <label
                              key={line.id}
                              className={`flex items-start gap-3 p-2 rounded-md cursor-pointer border ${
                                checked ? "bg-violet-50 dark:bg-violet-900/20 border-violet-200" : "border-transparent hover:bg-muted/40"
                              }`}
                            >
                              <Checkbox
                                checked={checked}
                                onCheckedChange={() => toggleLine(key)}
                                className="mt-0.5"
                              />
                              <div className="flex-1 min-w-0 text-sm">
                                <div className="font-medium flex flex-wrap gap-2 items-center">
                                  {name}
                                  {isDup && (
                                    <Badge variant="outline" className="text-xs text-amber-700">
                                      In drafts
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {[line.dose || line.dosage, line.route, line.frequency, line.duration]
                                    .filter(Boolean)
                                    .join(" • ")}{" "}
                                  • Qty {line.quantity ?? line.dispensed_quantity ?? "—"}
                                </p>
                              </div>
                            </label>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={handleContinue}
            disabled={loading || selectedItems.length === 0}
            className="bg-violet-600 hover:bg-violet-700"
          >
            Review {selectedItems.length > 0 ? `(${selectedItems.length})` : ""} in form
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
