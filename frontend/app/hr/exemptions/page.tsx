"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import {
  Loader2,
  Plus,
  Trash2,
  ShieldCheck,
  Search,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { hrService, type AnnualCheckupExemption } from "@/lib/services/hr-service";
import { DEFAULT_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { exemptionReasonBadgeClass, employeeInitials } from "@/lib/hr/hr-display";
import { patientService } from "@/lib/services/patient-service";
import { useHrPageAuth } from "@/hooks/use-hr-page-auth";
import { useHrProgrammeYear } from "@/hooks/use-hr-programme-year";
import { formatDisplayDateMedium } from "@/lib/dates";

const REASONS = [
  { value: "maternity", label: "Maternity" },
  { value: "on_leave", label: "On leave" },
  { value: "secondment", label: "Secondment" },
  { value: "medical", label: "Medical deferral" },
  { value: "other", label: "Other" },
];

export default function HRExemptionsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, handleAuthError } = useHrPageAuth();
  const { year, setYear, yearOptions } = useHrProgrammeYear();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [rows, setRows] = useState<AnnualCheckupExemption[]>([]);
  const [listCount, setListCount] = useState(0);
  const [yearExemptionCount, setYearExemptionCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AnnualCheckupExemption | null>(null);
  const [patientSearch, setPatientSearch] = useState("");
  const debouncedPatientSearch = useDebouncedValue(patientSearch, 300);
  const [patients, setPatients] = useState<{ id: number; label: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [form, setForm] = useState({
    patient: "",
    programme_year: String(new Date().getFullYear()),
    reason: "on_leave",
    notes: "",
  });

  const loadYearCount = useCallback(async () => {
    try {
      const data = await hrService.listExemptions({
        programme_year: year,
        page_size: 1,
      });
      setYearExemptionCount(data.count ?? data.results.length);
    } catch (err) {
      if (handleAuthError(err)) return;
    }
  }, [year, handleAuthError]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await hrService.listExemptions({
        programme_year: year,
        search: debouncedSearch.trim() || undefined,
        page: currentPage,
        page_size: itemsPerPage,
      });
      setRows(data.results);
      setListCount(data.count ?? data.results.length);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Could not load exemptions.");
    } finally {
      setLoading(false);
    }
  }, [year, debouncedSearch, currentPage, itemsPerPage, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    loadYearCount();
  }, [ready, loadYearCount]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [year, debouncedSearch, itemsPerPage]);

  useEffect(() => {
    if (searchParams.get("grant") !== "1") return;
    setForm((f) => ({ ...f, programme_year: String(year) }));
    setOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("grant");
    const query = params.toString();
    router.replace(query ? `?${query}` : "?", { scroll: false });
  }, [searchParams, router, year]);

  useEffect(() => {
    if (!debouncedPatientSearch.trim()) {
      setPatients([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await patientService.getPatients({
          search: debouncedPatientSearch,
          category: "employee",
          page_size: DEFAULT_LIST_PAGE_SIZE,
        });
        if (cancelled) return;
        setPatients(
          res.results.map((p) => ({
            id: p.id,
            label: `${p.full_name} (${p.patient_id})`,
          })),
        );
      } catch {
        if (!cancelled) setPatients([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [debouncedPatientSearch]);

  const handleCreate = async () => {
    if (!form.patient) {
      toast.error("Select an employee.");
      return;
    }
    try {
      await hrService.createExemption({
        patient: Number(form.patient),
        programme_year: Number(form.programme_year),
        reason: form.reason,
        notes: form.notes,
      });
      toast.success("Exemption granted.");
      setOpen(false);
      setForm({
        patient: "",
        programme_year: String(year),
        reason: "on_leave",
        notes: "",
      });
      setPatientSearch("");
      loadYearCount();
      load();
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Could not create exemption.");
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await hrService.deleteExemption(deleteTarget.id);
      toast.success("Exemption removed.");
      setDeleteTarget(null);
      loadYearCount();
      load();
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Could not remove exemption.");
    }
  };

  const openGrantDialog = () => {
    setForm((f) => ({ ...f, programme_year: String(year) }));
    setOpen(true);
  };

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-6 flex items-center justify-center min-h-[40vh]">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600">
                <ShieldCheck className="h-6 w-6 text-white" />
              </div>
              Exemptions
            </h1>
            <p className="text-muted-foreground mt-1">
              Employees exempt from annual check-ups for the {year} programme year
            </p>
          </div>
          <Button
            onClick={openGrantDialog}
            className="bg-violet-600 hover:bg-violet-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Grant exemption
          </Button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-2 gap-4">
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Active exemptions</p>
                  <p className="text-2xl sm:text-3xl font-bold text-violet-500">
                    {yearExemptionCount}
                  </p>
                </div>
                <ShieldCheck className="h-8 w-8 text-violet-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Programme year</p>
                  <p className="text-2xl sm:text-3xl font-bold text-purple-500">{year}</p>
                </div>
                <Users className="h-8 w-8 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Search employee, ID, or reason…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <Select value={String(year)} onValueChange={(v) => setYear(Number(v))}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {yearOptions.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!loading && listCount > 0 ? (
          <p className="text-sm text-muted-foreground px-1">
            Showing {rows.length} of {listCount} exemption
            {listCount === 1 ? "" : "s"}
            {debouncedSearch.trim() ? " matching search" : ""}
          </p>
        ) : null}

        {loading && rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading exemptions…</p>
            </CardContent>
          </Card>
        ) : listCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ShieldCheck className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No exemptions found
              </h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {debouncedSearch.trim()
                  ? "Try adjusting your search."
                  : `No exemptions for the ${year} programme year.`}
              </p>
              {!debouncedSearch.trim() ? (
                <Button
                  onClick={openGrantDialog}
                  className="bg-violet-600 hover:bg-violet-700 text-white"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Grant exemption
                </Button>
              ) : null}
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => (
              <Card
                key={row.id}
                className="border-l-4 border-l-violet-500 hover:shadow-md transition-shadow"
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 bg-violet-100 dark:bg-violet-900/30">
                      <span className="font-semibold text-xs text-violet-600 dark:text-violet-400">
                        {employeeInitials(row.patient_name)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-foreground truncate">
                              {row.patient_name}
                            </span>
                            <Badge
                              variant="outline"
                              className={exemptionReasonBadgeClass(row.reason)}
                            >
                              {row.reason_display}
                            </Badge>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                            <span>{row.patient_display_id}</span>
                            <span>•</span>
                            <span>Granted {formatDisplayDateMedium(row.granted_at)}</span>
                            {row.granted_by_name ? (
                              <>
                                <span>•</span>
                                <span>By {row.granted_by_name}</span>
                              </>
                            ) : null}
                            {row.expires_at ? (
                              <>
                                <span>•</span>
                                <span>Expires {formatDisplayDateMedium(row.expires_at)}</span>
                              </>
                            ) : null}
                          </div>
                          {row.notes ? (
                            <p className="text-sm text-muted-foreground mt-1">{row.notes}</p>
                          ) : null}
                        </div>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="flex-shrink-0 h-8 w-8"
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {listCount > 0 ? (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={listCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="exemptions"
            />
          </Card>
        ) : null}

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className={MODAL_SIZES.md}>
            <DialogHeader>
              <DialogTitle>Grant exemption</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Search employee</Label>
                <Input
                  value={patientSearch}
                  onChange={(e) => setPatientSearch(e.target.value)}
                  placeholder="Name or personal number"
                  className="mt-1"
                />
                <Select
                  value={form.patient}
                  onValueChange={(v) => setForm((f) => ({ ...f, patient: v }))}
                >
                  <SelectTrigger className="mt-2">
                    <SelectValue placeholder="Select employee" />
                  </SelectTrigger>
                  <SelectContent>
                    {patients.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Programme year</Label>
                <Select
                  value={form.programme_year}
                  onValueChange={(v) => setForm((f) => ({ ...f, programme_year: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={String(y)}>
                        {y}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Reason</Label>
                <Select
                  value={form.reason}
                  onValueChange={(v) => setForm((f) => ({ ...f, reason: v }))}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REASONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>
                        {r.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  className="mt-1"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleCreate}
                className="bg-violet-600 hover:bg-violet-700 text-white"
              >
                Save exemption
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={Boolean(deleteTarget)} onOpenChange={(open) => !open && setDeleteTarget(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove exemption</AlertDialogTitle>
              <AlertDialogDescription>
                Remove the {year} exemption for {deleteTarget?.patient_name}? They will appear as
                due in the compliance list again.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={handleDelete}
                className="bg-red-600 hover:bg-red-700"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </DashboardLayout>
  );
}
