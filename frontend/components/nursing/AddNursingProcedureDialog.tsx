"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Loader2, Search, Syringe, User } from "lucide-react";
import { toast } from "sonner";
import { patientService, formatPatientGenderLabel } from "@/lib/services";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  NursingOrderModal,
  type NursingOrderSubmitInput,
} from "@/components/consultation/orders/NursingOrderModal";
import {
  createNursingQueueOrder,
  fetchRecentPatientNursingOrders,
  recentOrderToFormInput,
  resolveNursingProcedureVisit,
  type RecentNursingOrderRow,
} from "@/lib/nursing/nursing-repeat-procedure";

type SelectedPatient = {
  dbId: number;
  patientId: string;
  name: string;
  age?: number;
  gender?: string;
};

export type AddNursingProcedureResult = {
  order: Record<string, unknown>;
  visitId?: number;
  createdNursingVisit: boolean;
  completeNow: boolean;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentUserId?: number;
  onCreated: (result: AddNursingProcedureResult) => void | Promise<void>;
};

export function AddNursingProcedureDialog({
  open,
  onOpenChange,
  currentUserId,
  onCreated,
}: Props) {
  const [step, setStep] = useState<"patient" | "order">("patient");
  const [patientSearch, setPatientSearch] = useState("");
  const debouncedSearch = useDebouncedValue(patientSearch, 300);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SelectedPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<SelectedPatient | null>(null);
  const [recentOrders, setRecentOrders] = useState<RecentNursingOrderRow[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [repeatFrom, setRepeatFrom] = useState<RecentNursingOrderRow | null>(null);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [recordAsVisit, setRecordAsVisit] = useState(true);
  const [initialPayload, setInitialPayload] = useState<Partial<NursingOrderSubmitInput> | undefined>();
  const [submitting, setSubmitting] = useState(false);

  const reset = useCallback(() => {
    setStep("patient");
    setPatientSearch("");
    setSearchResults([]);
    setSelectedPatient(null);
    setRecentOrders([]);
    setRepeatFrom(null);
    setOrderModalOpen(false);
    setRecordAsVisit(true);
    setInitialPayload(undefined);
    setSubmitting(false);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    const q = debouncedSearch.trim();
    if (!q || q.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    (async () => {
      setSearching(true);
      try {
        const res = await patientService.getPatients({ search: q, page_size: DEFAULT_LIST_PAGE_SIZE });
        if (cancelled) return;
        setSearchResults(
          (res.results || []).map((p: any) => ({
            dbId: p.id,
            patientId: p.patient_id || String(p.id),
            name: p.full_name || `${p.surname || ""} ${p.first_name || ""}`.trim(),
            age: p.age,
            gender: formatPatientGenderLabel(p.gender),
          }))
        );
      } catch {
        if (!cancelled) setSearchResults([]);
      } finally {
        if (!cancelled) setSearching(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedSearch]);

  const selectPatient = async (patient: SelectedPatient) => {
    setSelectedPatient(patient);
    setStep("order");
    setLoadingRecent(true);
    try {
      const rows = await fetchRecentPatientNursingOrders(patient.dbId);
      setRecentOrders(rows);
    } catch {
      setRecentOrders([]);
    } finally {
      setLoadingRecent(false);
      setOrderModalOpen(true);
      setInitialPayload({ type: "Injection", instructions: "" });
      setRepeatFrom(null);
    }
  };

  const startRepeat = (order: RecentNursingOrderRow) => {
    setRepeatFrom(order);
    setInitialPayload(recentOrderToFormInput(order));
    setOrderModalOpen(true);
  };

  const startNew = () => {
    setRepeatFrom(null);
    setInitialPayload({ type: "Injection", instructions: "" });
    setOrderModalOpen(true);
  };

  const handleSubmitOrder = async (
    payload: NursingOrderSubmitInput,
    completeNow: boolean
  ) => {
    if (!selectedPatient) return;
    setSubmitting(true);
    try {
      const clinicalNotes =
        payload.type === "Dressing"
          ? `${payload.woundType || "Wound"} — ${payload.woundLocation || "site"}. ${payload.instructions || ""}`.trim()
          : `${payload.medication || "Injection"} ${payload.dosage || ""}`.trim();

      const { visitId, createdNursingVisit } = await resolveNursingProcedureVisit(
        selectedPatient.dbId,
        recordAsVisit,
        clinicalNotes
      );

      const repeatPrefix = repeatFrom ? "[Nursing repeat]" : undefined;
      const orderedBy =
        repeatFrom?.ordered_by != null
          ? Number(repeatFrom.ordered_by)
          : currentUserId ?? null;

      const order = await createNursingQueueOrder({
        patientDbId: selectedPatient.dbId,
        payload,
        visitId,
        orderedByUserId: orderedBy,
        repeatPrefix,
      });

      toast.success(completeNow ? "Procedure ready to complete" : "Added to nursing queue");
      await onCreated({
        order,
        visitId,
        createdNursingVisit,
        completeNow,
      });
    } catch (err: any) {
      toast.error(err?.message || "Failed to add procedure");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Dialog open={open && step === "patient"} onOpenChange={onOpenChange}>
        <DialogContent className={MODAL_SIZES.md}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Syringe className="h-5 w-5 text-violet-500" />
              Add procedure — returning patient
            </DialogTitle>
            <DialogDescription>
              Search for a patient, then add an injection or dressing to the nursing queue.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search name, patient ID, or personal number..."
                value={patientSearch}
                onChange={(e) => setPatientSearch(e.target.value)}
                className="pl-10"
                autoFocus
              />
            </div>
            {searching && (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Searching...
              </p>
            )}
            <div className="max-h-[280px] overflow-y-auto space-y-1">
              {searchResults.map((p) => (
                <button
                  key={p.dbId}
                  type="button"
                  className="w-full text-left rounded-lg border px-3 py-2 hover:bg-muted/60 transition-colors"
                  onClick={() => void selectPatient(p)}
                >
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {p.patientId}
                    {p.age ? ` · ${p.age}y` : ""}
                    {p.gender ? ` · ${p.gender}` : ""}
                  </p>
                </button>
              ))}
              {!searching && debouncedSearch.trim().length >= 2 && searchResults.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-6">No patients found</p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {selectedPatient && (
        <NursingOrderModal
          open={orderModalOpen}
          onOpenChange={(next) => {
            setOrderModalOpen(next);
            if (!next) {
              onOpenChange(false);
              reset();
            }
          }}
          allowedTypes={["Injection", "Dressing"]}
          initialPayload={initialPayload}
          confirmLabel="Add to queue"
          completeNowLabel="Add & complete now"
          onSubmit={async (payload) => handleSubmitOrder(payload, false)}
          onSubmitCompleteNow={async (payload) => handleSubmitOrder(payload, true)}
          descriptionExtra={
            <div className="space-y-3">
              <div className="rounded-lg bg-muted/50 px-3 py-2 flex items-center gap-2 text-sm">
                <User className="h-4 w-4 text-muted-foreground shrink-0" />
                <span>
                  <span className="font-medium">{selectedPatient.name}</span>
                  <span className="text-muted-foreground"> — {selectedPatient.patientId}</span>
                </span>
              </div>

              {loadingRecent ? (
                <p className="text-xs text-muted-foreground">Loading recent orders...</p>
              ) : recentOrders.length > 0 ? (
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">Repeat from recent order</Label>
                  <div className="flex flex-wrap gap-2">
                    {recentOrders.slice(0, 4).map((o) => (
                      <Button
                        key={o.id}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-auto py-1 text-xs"
                        onClick={() => startRepeat(o)}
                      >
                        <Badge variant="secondary" className="mr-1 text-[10px]">
                          {String(o.order_type || "").toLowerCase().includes("dress") ? "Dressing" : "Injection"}
                        </Badge>
                        {(o.description || "").slice(0, 40)}
                        {(o.description || "").length > 40 ? "…" : ""}
                      </Button>
                    ))}
                    <Button type="button" variant="ghost" size="sm" className="text-xs" onClick={startNew}>
                      New (blank)
                    </Button>
                  </div>
                </div>
              ) : null}

              <div className="flex items-center gap-2">
                <Checkbox
                  id="record-as-visit"
                  checked={recordAsVisit}
                  onCheckedChange={(v) => setRecordAsVisit(v === true)}
                />
                <Label htmlFor="record-as-visit" className="text-sm font-normal cursor-pointer">
                  Record as visit (appears in Manage Visits for attendance)
                </Label>
              </div>
            </div>
          }
        />
      )}
    </>
  );
}
