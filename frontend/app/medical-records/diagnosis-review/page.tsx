"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { ConsultationReportModal } from "@/components/consultation/ConsultationReportModal";
import { StandardPagination } from "@/components/shared/StandardPagination";
import {
  loadConsultationReportSession,
  type ConsultationReportSession,
} from "@/lib/consultation-report";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ClipboardCheck,
  Search,
  Loader2,
  AlertCircle,
  Pencil,
  FileText,
  Calendar,
  Users,
  Stethoscope,
  CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import {
  consultationService,
  DIAGNOSIS_CORRECTION_REASONS,
  type Diagnosis,
  type DiagnosisCorrectionReason,
  type ICD10Code,
} from "@/lib/services";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";
import { formatDisplayDate, formatDisplayDateRange } from "@/lib/dates";

function reasonLabel(value?: string) {
  return DIAGNOSIS_CORRECTION_REASONS.find((r) => r.value === value)?.label ?? value ?? "—";
}

export default function DiagnosisReviewPage() {
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<Diagnosis[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [correctedOnly, setCorrectedOnly] = useState<string>("all");

  const [correctOpen, setCorrectOpen] = useState(false);
  const [selectedRow, setSelectedRow] = useState<Diagnosis | null>(null);
  const [codeSearch, setCodeSearch] = useState("");
  const debouncedCodeSearch = useDebouncedValue(codeSearch, 300);
  const [codeResults, setCodeResults] = useState<ICD10Code[]>([]);
  const [codeSearching, setCodeSearching] = useState(false);
  const [selectedCode, setSelectedCode] = useState<ICD10Code | null>(null);
  const [reason, setReason] = useState<DiagnosisCorrectionReason>("wrong_code");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [isReportModalOpen, setIsReportModalOpen] = useState(false);
  const [reportSession, setReportSession] = useState<ConsultationReportSession | null>(null);
  const [reportLoading, setReportLoading] = useState(false);

  const hasActiveFilters = Boolean(
    debouncedSearch || dateFrom || dateTo || correctedOnly === "corrected",
  );

  const periodLabel = useMemo(() => {
    if (dateFrom && dateTo) return formatDisplayDateRange(dateFrom, dateTo);
    if (dateFrom) return `From ${formatDisplayDate(dateFrom)}`;
    if (dateTo) return `Until ${formatDisplayDate(dateTo)}`;
    return "All dates";
  }, [dateFrom, dateTo]);

  const correctedOnPage = useMemo(
    () => rows.filter((r) => r.corrected_at).length,
    [rows],
  );

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, dateFrom, dateTo, correctedOnly, itemsPerPage]);

  const loadRows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await consultationService.getDiagnosisReviewList({
        page,
        page_size: itemsPerPage,
        search: debouncedSearch || undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        corrected_only: correctedOnly === "corrected",
      });
      setRows(res.results ?? []);
      setTotal(res.count ?? 0);
    } catch (err) {
      if (handleAuthError(err)) return;
      console.error("Failed to load diagnosis review list:", err);
      toast.error("Failed to load diagnoses for review");
    } finally {
      setLoading(false);
    }
  }, [
    page,
    itemsPerPage,
    debouncedSearch,
    dateFrom,
    dateTo,
    correctedOnly,
    handleAuthError,
  ]);

  useEffect(() => {
    if (!ready) return;
    void loadRows();
  }, [ready, loadRows]);

  useEffect(() => {
    if (!correctOpen) return;
    const term = debouncedCodeSearch.trim();
    if (!term) {
      setCodeResults([]);
      return;
    }
    let cancelled = false;
    setCodeSearching(true);
    consultationService
      .getICD10Codes({ search: term, page_size: 20 })
      .then((res) => {
        if (!cancelled) setCodeResults(res.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setCodeResults([]);
      })
      .finally(() => {
        if (!cancelled) setCodeSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [correctOpen, debouncedCodeSearch]);

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setCorrectedOnly("all");
  };

  const handleOpenReport = async (row: Diagnosis) => {
    if (!row.session) {
      toast.error("No consultation session linked to this diagnosis.");
      return;
    }
    try {
      setReportLoading(true);
      setReportSession(null);
      setIsReportModalOpen(true);
      const session = await loadConsultationReportSession(row.session);
      setReportSession(session);
    } catch (err) {
      console.error("Failed to load consultation report:", err);
      if (handleAuthError(err)) return;
      toast.error("Failed to load consultation report");
      setIsReportModalOpen(false);
    } finally {
      setReportLoading(false);
    }
  };

  const openCorrectDialog = (row: Diagnosis) => {
    setSelectedRow(row);
    setSelectedCode(null);
    setCodeSearch("");
    setCodeResults([]);
    setReason("wrong_code");
    setNotes("");
    setCorrectOpen(true);
  };

  const handleCorrect = async () => {
    if (!selectedRow || !selectedCode) {
      toast.error("Select a replacement ICD-10 code");
      return;
    }
    if (selectedCode.id === selectedRow.icd10_code) {
      toast.error("Select a different ICD-10 code");
      return;
    }
    try {
      setSubmitting(true);
      await consultationService.correctDiagnosis(selectedRow.id, {
        icd10_code: selectedCode.id,
        reason,
        notes: notes.trim() || undefined,
      });
      toast.success(`Diagnosis updated to ${selectedCode.code}`);
      setCorrectOpen(false);
      void loadRows();
    } catch (err: unknown) {
      if (handleAuthError(err)) return;
      const message =
        err instanceof Error ? err.message : "Failed to correct diagnosis";
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardCheck className="h-8 w-8 text-emerald-500" />
              Diagnosis Review
            </h1>
            <p className="text-muted-foreground mt-1 max-w-2xl">
              Review ICD-10 codes on completed consultations and correct coding for
              reports. The original clinician and a full audit trail are preserved.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Stethoscope className="h-4 w-4" />
                Matching diagnoses
              </p>
              <p className="text-2xl font-bold text-blue-600">
                {loading ? "…" : total.toLocaleString()}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <Calendar className="h-4 w-4" />
                Visit period
              </p>
              <p className="text-lg font-semibold text-amber-700 dark:text-amber-400 mt-1">
                {periodLabel}
              </p>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4" />
                {correctedOnly === "corrected" ? "Corrected records" : "On this page"}
              </p>
              <p className="text-2xl font-bold text-emerald-600">
                {loading
                  ? "…"
                  : correctedOnly === "corrected"
                    ? total.toLocaleString()
                    : correctedOnPage.toLocaleString()}
              </p>
              {correctedOnly !== "corrected" && !loading && correctedOnPage > 0 && (
                <p className="text-xs text-muted-foreground mt-1">
                  {correctedOnPage} corrected on this page
                </p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Users className="h-5 w-5" />
              Consultation diagnoses
            </CardTitle>
            <CardDescription>
              Completed consultations only. Use the report icon to review, or correct an ICD-10 code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-col xl:flex-row xl:flex-wrap xl:items-center gap-2">
              <div className="relative flex-1 min-w-[min(100%,14rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search patient, chart ID, or ICD code..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-9 h-9"
                />
              </div>
              <Select value={correctedOnly} onValueChange={setCorrectedOnly}>
                <SelectTrigger className="h-9 w-full xl:w-[160px]">
                  <SelectValue placeholder="All diagnoses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All diagnoses</SelectItem>
                  <SelectItem value="corrected">Corrected only</SelectItem>
                </SelectContent>
              </Select>
              <Input
                type="date"
                aria-label="Visit from"
                className="h-9 w-full xl:w-[150px]"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
              />
              <Input
                type="date"
                aria-label="Visit to"
                className="h-9 w-full xl:w-[150px]"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
              />
              {hasActiveFilters && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 shrink-0"
                  onClick={clearFilters}
                >
                  Clear
                </Button>
              )}
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-lg border border-dashed bg-muted/20">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-muted-foreground/50" />
                <p className="font-medium text-muted-foreground">No diagnoses found</p>
                <p className="text-sm text-muted-foreground mt-1">
                  Try adjusting filters or date range.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50">
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        Visit date
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        Patient
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden md:table-cell">
                        Clinician
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground">
                        ICD-10
                      </th>
                      <th className="text-left p-3 font-medium text-muted-foreground hidden lg:table-cell">
                        Correction
                      </th>
                      <th className="text-right p-3 font-medium text-muted-foreground w-[72px]">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row) => (
                      <tr
                        key={row.id}
                        className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-3 whitespace-nowrap align-top">
                          {row.visit_date
                            ? formatDisplayDate(row.visit_date)
                            : formatDisplayDate(row.diagnosed_at)}
                        </td>
                        <td className="p-3 align-top">
                          <div className="font-medium">{row.patient_name}</div>
                          <div className="text-xs text-muted-foreground font-mono mt-0.5">
                            {row.patient_chart_id}
                          </div>
                        </td>
                        <td className="p-3 hidden md:table-cell align-top text-muted-foreground">
                          {row.diagnosed_by_name ?? "—"}
                        </td>
                        <td className="p-3 align-top min-w-[200px]">
                          <Badge variant="outline" className="font-mono font-semibold mb-1.5">
                            {row.icd10_code_details?.code}
                          </Badge>
                          <p className="text-muted-foreground leading-snug">
                            {row.icd10_code_details?.description}
                          </p>
                          {row.original_icd10_code_details && (
                            <p className="text-xs text-amber-700 dark:text-amber-400 mt-1.5">
                              Previously {row.original_icd10_code_details.code} —{" "}
                              {row.original_icd10_code_details.description}
                            </p>
                          )}
                        </td>
                        <td className="p-3 hidden lg:table-cell align-top">
                          {row.corrected_at ? (
                            <div className="space-y-1">
                              <Badge
                                variant="outline"
                                className="text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30"
                              >
                                Corrected
                              </Badge>
                              <p className="text-xs text-muted-foreground">
                                {reasonLabel(row.correction_reason)}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                by {row.corrected_by_name}
                              </p>
                            </div>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="p-3 text-right align-top">
                          <div className="flex items-center justify-end gap-0.5">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7"
                              onClick={() => void handleOpenReport(row)}
                              title="View consultation report"
                              disabled={!row.session}
                            >
                              <FileText className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 text-emerald-700 hover:text-emerald-800 hover:bg-emerald-50 dark:hover:bg-emerald-950/30"
                              onClick={() => openCorrectDialog(row)}
                              title="Correct ICD-10 code"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {!loading && total > 0 && (
              <StandardPagination
                currentPage={page}
                totalItems={total}
                itemsPerPage={itemsPerPage}
                onPageChange={setPage}
                onItemsPerPageChange={setItemsPerPage}
                itemName="diagnoses"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={correctOpen} onOpenChange={setCorrectOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Correct ICD-10 code</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div>
                  <span className="font-medium text-foreground">{selectedRow?.patient_name}</span>
                  {" · "}
                  <span className="font-mono">{selectedRow?.patient_chart_id}</span>
                </div>
                <div>
                  Current code:{" "}
                  <span className="font-mono rounded-md border px-2 py-0.5 text-xs">
                    {selectedRow?.icd10_code_details?.code}
                  </span>
                  {" — "}
                  {selectedRow?.icd10_code_details?.description}
                </div>
                <div className="text-xs">
                  The diagnosing clinician stays on record. This change is audited for reports.
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Search replacement ICD-10 *</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={codeSearch}
                  onChange={(e) => {
                    setCodeSearch(e.target.value);
                    setSelectedCode(null);
                  }}
                  placeholder="Code or description..."
                  className="pl-9"
                />
              </div>
              {codeSearching && (
                <p className="text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3 w-3 animate-spin" /> Searching...
                </p>
              )}
              {selectedCode && (
                <div className="rounded-md border border-emerald-300 bg-emerald-50 dark:bg-emerald-950/30 p-3">
                  <Badge variant="outline" className="font-mono mb-1">
                    {selectedCode.code}
                  </Badge>
                  <p className="text-sm text-muted-foreground">{selectedCode.description}</p>
                </div>
              )}
              {!selectedCode && codeResults.length > 0 && (
                <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                  {codeResults.map((code) => (
                    <button
                      key={code.id}
                      type="button"
                      className="w-full text-left p-3 hover:bg-muted/50 transition-colors"
                      onClick={() => {
                        setSelectedCode(code);
                        setCodeSearch(code.code);
                      }}
                    >
                      <Badge variant="secondary" className="font-mono mr-2">
                        {code.code}
                      </Badge>
                      <span className="text-sm text-muted-foreground">{code.description}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>Reason *</Label>
              <Select
                value={reason}
                onValueChange={(v) => setReason(v as DiagnosisCorrectionReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DIAGNOSIS_CORRECTION_REASONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes (optional)</Label>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Brief note for audit trail..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setCorrectOpen(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button
              className="bg-emerald-600 hover:bg-emerald-700"
              onClick={() => void handleCorrect()}
              disabled={submitting || !selectedCode}
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save correction"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConsultationReportModal
        open={isReportModalOpen}
        onOpenChange={setIsReportModalOpen}
        session={reportSession}
        loading={reportLoading}
      />
    </DashboardLayout>
  );
}
