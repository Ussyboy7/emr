"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Loader2, Search, X } from "lucide-react";
import { toast } from "sonner";
import { medicalCertificateService, patientService, type Patient as ApiPatient } from "@/lib/services";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { printMedicalCertificatePdf } from "@/lib/medical-records/medicalCertificatePdf";

function inclusiveCalendarDaysBetween(start: string, end: string): number | null {
  const a = new Date(`${start}T12:00:00`);
  const b = new Date(`${end}T12:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const days = Math.floor((b.getTime() - a.getTime()) / 86400000) + 1;
  if (days < 1 || days > 366) return null;
  return days;
}

export interface MedicalCertificateCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, patient search is skipped. */
  patient?: ApiPatient | null;
  onCreated?: () => void;
}

export function MedicalCertificateCreateDialog({
  open,
  onOpenChange,
  patient: presetPatient,
  onCreated,
}: MedicalCertificateCreateDialogProps) {
  const [patientSearch, setPatientSearch] = useState("");
  const [searchResults, setSearchResults] = useState<ApiPatient[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedPatient, setSelectedPatient] = useState<ApiPatient | null>(presetPatient ?? null);
  const [submitting, setSubmitting] = useState(false);
  const searchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [form, setForm] = useState({
    purpose: "",
    findings: "",
    recommendations: "",
    startDate: "",
    endDate: "",
    sickLeaveDays: "",
  });

  useEffect(() => {
    if (open) setSelectedPatient(presetPatient ?? null);
  }, [open, presetPatient]);

  useEffect(() => {
    if (form.purpose !== "illness" || !form.startDate || !form.endDate) return;
    const computed = inclusiveCalendarDaysBetween(form.startDate, form.endDate);
    if (computed == null) return;
    setForm((prev) => {
      if (prev.purpose !== "illness" || prev.sickLeaveDays.trim() !== "") return prev;
      return { ...prev, sickLeaveDays: String(computed) };
    });
  }, [form.purpose, form.startDate, form.endDate]);

  useEffect(() => {
    if (presetPatient) return;
    const q = patientSearch.trim();
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    if (!q) {
      setSearchResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    searchTimeoutRef.current = setTimeout(async () => {
      searchTimeoutRef.current = null;
      try {
        const res = await patientService.getPatients({ search: q, page_size: DEFAULT_LIST_PAGE_SIZE });
        setSearchResults(res.results || []);
      } catch (e: unknown) {
        toast.error(e instanceof Error ? e.message : "Patient search failed");
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [patientSearch, presetPatient]);

  const resetForm = () => {
    setPatientSearch("");
    setSearchResults([]);
    setSelectedPatient(presetPatient ?? null);
    setForm({
      purpose: "",
      findings: "",
      recommendations: "",
      startDate: "",
      endDate: "",
      sickLeaveDays: "",
    });
  };

  const handleSubmit = async () => {
    const patient = presetPatient ?? selectedPatient;
    if (!patient) {
      toast.error("Please select a patient.");
      return;
    }
    if (!form.purpose || !form.startDate || !form.endDate) {
      toast.error("Please complete purpose and validity dates.");
      return;
    }

    let sickLeaveDaysPayload: number | undefined;
    if (form.purpose === "illness") {
      const n = parseInt(form.sickLeaveDays.trim(), 10);
      if (Number.isNaN(n) || n < 1 || n > 366) {
        toast.error("Enter sick leave days (1–366).");
        return;
      }
      sickLeaveDaysPayload = n;
    }

    setSubmitting(true);
    try {
      const created = await medicalCertificateService.createCertificate({
        patient: patient.id,
        purpose: form.purpose as "fitness" | "illness" | "travel" | "employment",
        valid_from: form.startDate,
        valid_to: form.endDate,
        ...(sickLeaveDaysPayload != null ? { sick_leave_days: sickLeaveDaysPayload } : {}),
        findings: form.findings,
        recommendations: form.recommendations,
      });

      try {
        await printMedicalCertificatePdf(created.id);
      } catch (printErr: unknown) {
        const msg = printErr instanceof Error ? printErr.message : "Certificate saved but PDF could not open.";
        toast.error(msg);
      }
      toast.success(`Medical certificate saved (${created.certificate_number}).`);
      onCreated?.();
      onOpenChange(false);
      resetForm();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create medical certificate.");
    } finally {
      setSubmitting(false);
    }
  };

  const activePatient = presetPatient ?? selectedPatient;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) resetForm();
      }}
    >
      <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Issue medical certificate
          </DialogTitle>
          <DialogDescription>Fitness, illness, travel, or employment certificate for the selected patient.</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {!presetPatient && (
            <div className="space-y-2">
              <Label>Patient *</Label>
              {selectedPatient ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5">
                  <div className="min-w-0">
                    <p className="font-medium truncate">
                      {selectedPatient.full_name ??
                        `${selectedPatient.first_name} ${selectedPatient.surname}`.trim()}
                    </p>
                    <p className="text-xs text-muted-foreground">{selectedPatient.patient_id}</p>
                  </div>
                  <Button type="button" variant="ghost" size="icon" onClick={() => setSelectedPatient(null)}>
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      className="pl-10"
                      placeholder="Search by name or patient ID…"
                      value={patientSearch}
                      onChange={(e) => setPatientSearch(e.target.value)}
                    />
                  </div>
                  <div className="max-h-[180px] overflow-y-auto rounded-md border p-1">
                    {searching && (
                      <div className="flex justify-center py-4 text-sm text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                        Searching…
                      </div>
                    )}
                    {!searching &&
                      searchResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="w-full rounded-md px-2 py-2 text-left text-sm hover:bg-muted/80"
                          onClick={() => {
                            setSelectedPatient(p);
                            setPatientSearch("");
                            setSearchResults([]);
                          }}
                        >
                          {p.full_name ?? `${p.first_name} ${p.surname}`.trim()} — {p.patient_id}
                        </button>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}

          {presetPatient && (
            <div className="rounded-lg border bg-muted/30 px-3 py-2 text-sm">
              <span className="text-muted-foreground">Patient: </span>
              <span className="font-medium">{presetPatient.full_name ?? presetPatient.patient_id}</span>
            </div>
          )}

          <div className="space-y-2">
            <Label>Purpose *</Label>
            <Select value={form.purpose} onValueChange={(v) => setForm((p) => ({ ...p, purpose: v, sickLeaveDays: v === "illness" ? p.sickLeaveDays : "" }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select purpose" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fitness">Fitness certificate</SelectItem>
                <SelectItem value="illness">Illness / sick leave</SelectItem>
                <SelectItem value="travel">Travel medical</SelectItem>
                <SelectItem value="employment">Employment medical</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Start date *</Label>
              <Input type="date" value={form.startDate} onChange={(e) => setForm((p) => ({ ...p, startDate: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>End date *</Label>
              <Input type="date" value={form.endDate} onChange={(e) => setForm((p) => ({ ...p, endDate: e.target.value }))} />
            </div>
          </div>

          {form.purpose === "illness" && (
            <div className="space-y-2">
              <Label>Sick leave days (calendar) *</Label>
              <Input
                type="number"
                min={1}
                max={366}
                value={form.sickLeaveDays}
                onChange={(e) => setForm((p) => ({ ...p, sickLeaveDays: e.target.value }))}
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Clinical findings</Label>
            <Textarea
              value={form.findings}
              onChange={(e) => setForm((p) => ({ ...p, findings: e.target.value }))}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label>Recommendations</Label>
            <Textarea
              value={form.recommendations}
              onChange={(e) => setForm((p) => ({ ...p, recommendations: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={!activePatient || submitting}>
            {submitting ? "Saving…" : "Issue certificate"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
