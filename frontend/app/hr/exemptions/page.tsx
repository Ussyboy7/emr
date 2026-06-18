"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePaginatedListGuard, useResetPageOnFilterChange } from "@/hooks/use-paginated-list-guard";
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
import { DEFAULT_LIST_PAGE_SIZE, MAX_LIST_PAGE_SIZE } from "@/lib/pagination-constants";
import { exemptionReasonBadgeClass } from "@/lib/hr/hr-display";
import { patientService } from "@/lib/services/patient-service";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";

const REASONS = [
  { value: "maternity", label: "Maternity" },
  { value: "on_leave", label: "On leave" },
  { value: "secondment", label: "Secondment" },
  { value: "medical", label: "Medical deferral" },
  { value: "other", label: "Other" },
];

import { formatDisplayDateMedium } from "@/lib/dates";

const formatDate = (d: string | null | undefined): string => formatDisplayDateMedium(d);

export default function HRExemptionsPage() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [rows, setRows] = useState<AnnualCheckupExemption[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<unknown>(null);
  const [open, setOpen] = useState(false);
  const [patientSearch, setPatientSearch] = useState("");
  const [patients, setPatients] = useState<{ id: number; label: string }[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const { resetToFirstPage, beginLoad } = usePaginatedListGuard(currentPage);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [form, setForm] = useState({
    patient: "",
    programme_year: String(currentYear),
    reason: "on_leave",
    notes: "",
  });
  useAuthRedirect(authError);

  const load = useCallback(async () => {
    const isStale = beginLoad();
    try {
      setLoading(true);
      const data = await hrService.listExemptions({
        programme_year: year,
        page_size: MAX_LIST_PAGE_SIZE,
      });
      if (isStale()) return;
      setRows(data.results);
      setTotalCount(data.count ?? data.results.length);
    } catch (err) {
      if (isAuthenticationError(err)) setAuthError(err);
    } finally {
      setLoading(false);
    }
  }, [year, beginLoad]);

  useEffect(() => {
    void load();
  }, [load]);

  useResetPageOnFilterChange(resetToFirstPage, setCurrentPage, [
    year, debouncedSearch, itemsPerPage,
  ]);

  useEffect(() => {
    if (!patientSearch.trim()) {
      setPatients([]);
      return;
    }
    const t = setTimeout(async () => {
      const res = await patientService.getPatients({
        search: patientSearch,
        category: "employee",
        page_size: DEFAULT_LIST_PAGE_SIZE,
      });
      setPatients(
        res.results.map((p) => ({
          id: p.id,
          label: `${p.full_name} (${p.patient_id})`,
        }))
      );
    }, 300);
    return () => clearTimeout(t);
  }, [patientSearch]);

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.patient_name.toLowerCase().includes(q) ||
        row.patient_display_id.toLowerCase().includes(q) ||
        row.reason_display.toLowerCase().includes(q)
    );
  }, [rows, debouncedSearch]);

  const paginatedRows = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return filteredRows.slice(start, start + itemsPerPage);
  }, [filteredRows, currentPage, itemsPerPage]);

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
      load();
    } catch {
      toast.error("Could not create exemption.");
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await hrService.deleteExemption(id);
      toast.success("Exemption removed.");
      load();
    } catch {
      toast.error("Could not remove exemption.");
    }
  };

  const openGrantDialog = () => {
    setForm((f) => ({ ...f, programme_year: String(year) }));
    setOpen(true);
  };

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
                    {totalCount}
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
                  {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {!loading && filteredRows.length > 0 ? (
          <p className="text-sm text-muted-foreground px-1">
            Showing {paginatedRows.length} of {filteredRows.length} exemption
            {filteredRows.length === 1 ? "" : "s"}
          </p>
        ) : null}

        {loading && rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading exemptions…</p>
            </CardContent>
          </Card>
        ) : filteredRows.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ShieldCheck className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No exemptions found
              </h3>
              <p className="text-muted-foreground text-center max-w-md mb-4">
                {rows.length === 0
                  ? `No exemptions for the ${year} programme year.`
                  : "Try adjusting your search."}
              </p>
              {rows.length === 0 ? (
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
            {paginatedRows.map((row) => (
              <Card
                key={row.id}
                className="border-l-4 border-l-violet-500 hover:shadow-md transition-shadow"
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <PatientAvatar name={row.patient_name} photoUrl={undefined} size="sm" />
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
                            <span>Granted {formatDate(row.granted_at)}</span>
                            {row.granted_by_name ? (
                              <>
                                <span>•</span>
                                <span>By {row.granted_by_name}</span>
                              </>
                            ) : null}
                            {row.expires_at ? (
                              <>
                                <span>•</span>
                                <span>Expires {formatDate(row.expires_at)}</span>
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
                          onClick={() => handleDelete(row.id)}
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

        {filteredRows.length > 0 ? (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={filteredRows.length}
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
                    {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
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
      </div>
    </DashboardLayout>
  );
}
