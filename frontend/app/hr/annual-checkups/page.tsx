"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import {
  Download,
  Loader2,
  Search,
  ClipboardList,
  Users,
  CheckCircle2,
  AlertTriangle,
  FileText,
} from "lucide-react";
import { toast } from "sonner";
import {
  hrService,
  type HRComplianceRow,
  type HRComplianceSummary,
} from "@/lib/services/hr-service";
import {
  complianceAvatarClasses,
  complianceOutcomeBadgeClass,
  complianceStatusBadgeClass,
  complianceStatusBorderClass,
  employeeInitials,
  formatComplianceStatus,
} from "@/lib/hr/hr-display";
import { useHrPageAuth } from "@/hooks/use-hr-page-auth";
import { useHrProgrammeYear } from "@/hooks/use-hr-programme-year";
import { formatDisplayDateMedium } from "@/lib/dates";

const STATUS_OPTIONS = ["all", "completed", "in_progress", "due", "overdue", "exempt"] as const;

function parseStatus(value: string | null): string {
  if (value && STATUS_OPTIONS.includes(value as (typeof STATUS_OPTIONS)[number])) {
    return value;
  }
  return "all";
}

export default function HRAnnualCheckupsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, handleAuthError } = useHrPageAuth();
  const { year, setYear, yearOptions } = useHrProgrammeYear();
  const [status, setStatus] = useState(() => parseStatus(searchParams.get("status")));
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [rows, setRows] = useState<HRComplianceRow[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [summary, setSummary] = useState<HRComplianceSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);

  useEffect(() => {
    setStatus(parseStatus(searchParams.get("status")));
  }, [searchParams]);

  useEffect(() => {
    const params = new URLSearchParams(searchParams.toString());
    const next = status === "all" ? null : status;
    if ((params.get("status") || null) === next) return;
    if (next) params.set("status", next);
    else params.delete("status");
    router.replace(`?${params.toString()}`, { scroll: false });
  }, [status, router, searchParams]);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await hrService.getCompliance({
        programme_year: year,
        status: status !== "all" ? status : undefined,
        search: debouncedSearch.trim() || undefined,
        page: currentPage,
        page_size: itemsPerPage,
      });
      setRows(data.results);
      setTotalCount(data.count ?? data.results.length);
      setSummary(data.summary);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Could not load compliance data.");
    } finally {
      setLoading(false);
    }
  }, [year, status, debouncedSearch, currentPage, itemsPerPage, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    load();
  }, [ready, load]);

  useEffect(() => {
    setCurrentPage(1);
  }, [year, status, debouncedSearch, itemsPerPage]);

  const handleExport = async () => {
    try {
      const blob = await hrService.exportCsv(year, {
        status: status !== "all" ? status : undefined,
        search: debouncedSearch.trim() || undefined,
      });
      hrService.downloadBlob(blob, `annual_checkup_compliance_${year}.csv`);
      toast.success("Compliance report exported.");
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("CSV export failed.");
    }
  };

  const handleOutcomeLetter = async (row: HRComplianceRow) => {
    if (!row.annual_checkup_id) return;
    try {
      const blob = await hrService.fetchOutcomeLetterPdf(row.annual_checkup_id);
      hrService.downloadBlob(blob, `outcome_${row.patient_display_id}_${year}.pdf`);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Outcome letter not available.");
    }
  };

  const stats = summary
    ? [
        {
          label: "Eligible",
          value: summary.total_eligible,
          icon: Users,
          border: "border-l-violet-500",
          color: "text-violet-500",
        },
        {
          label: "Completed",
          value: summary.completed,
          icon: CheckCircle2,
          border: "border-l-emerald-500",
          color: "text-emerald-500",
        },
        {
          label: "Due / in progress",
          value: summary.due + summary.in_progress,
          icon: ClipboardList,
          border: "border-l-amber-500",
          color: "text-amber-500",
        },
        {
          label: "Overdue",
          value: summary.overdue,
          icon: AlertTriangle,
          border: "border-l-rose-500",
          color: "text-rose-500",
        },
      ]
    : [];

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
                <ClipboardList className="h-6 w-6 text-white" />
              </div>
              Annual Check-ups
            </h1>
            <p className="text-muted-foreground mt-1">
              HR-safe view — fitness outcomes and attendance status only
            </p>
          </div>
          <Button variant="outline" onClick={handleExport}>
            <Download className="h-4 w-4 mr-2" />
            Export CSV
          </Button>
        </div>

        {summary ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stats.map((stat) => (
              <Card key={stat.label} className={`border-l-4 ${stat.border}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">{stat.label}</p>
                      <p className={`text-2xl sm:text-3xl font-bold ${stat.color}`}>
                        {stat.value}
                      </p>
                    </div>
                    <stat.icon className={`h-8 w-8 ${stat.color} opacity-50`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        ) : null}

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Search name or personal number…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
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
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-[160px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="in_progress">In progress</SelectItem>
                    <SelectItem value="due">Due</SelectItem>
                    <SelectItem value="overdue">Overdue</SelectItem>
                    <SelectItem value="exempt">Exempt</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {!loading && totalCount > 0 ? (
          <p className="text-sm text-muted-foreground px-1">
            Showing {rows.length} of {totalCount} employee
            {totalCount === 1 ? "" : "s"}
            {summary && summary.exempt > 0 ? ` · ${summary.exempt} exempt` : ""}
          </p>
        ) : null}

        {loading && rows.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading compliance data…</p>
            </CardContent>
          </Card>
        ) : totalCount === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-16">
              <ClipboardList className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-xl font-semibold text-foreground mb-2">
                No employees found
              </h3>
              <p className="text-muted-foreground text-center max-w-md">
                Try adjusting your search or status filter for the {year} programme year.
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {rows.map((row) => {
              const outcome = row.fitness_outcome_display || row.exemption_reason || "";
              const avatar = complianceAvatarClasses(row.compliance_status);
              return (
                <Card
                  key={row.patient_id}
                  className={`border-l-4 ${complianceStatusBorderClass(row.compliance_status)} hover:shadow-md transition-shadow`}
                >
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${avatar.bg}`}
                      >
                        <span className={`font-semibold text-xs ${avatar.text}`}>
                          {employeeInitials(row.full_name)}
                        </span>
                      </div>

                      <div className="flex-1 min-w-0 overflow-hidden">
                        <div className="flex items-center gap-2">
                          <h3 className="font-medium text-foreground text-sm truncate">
                            {row.full_name}
                          </h3>
                          {outcome ? (
                            <Badge
                              variant="outline"
                              className={`text-[10px] px-1.5 py-0 h-5 max-w-[9rem] truncate ${complianceOutcomeBadgeClass(row.compliance_status)}`}
                              title={outcome}
                            >
                              {outcome}
                            </Badge>
                          ) : null}
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 h-5 ${complianceStatusBadgeClass(row.compliance_status)}`}
                          >
                            {formatComplianceStatus(row.compliance_status)}
                          </Badge>
                        </div>

                        <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5 flex-wrap">
                          <span>{row.personal_number || row.patient_display_id}</span>
                          {row.division ? (
                            <>
                              <span>•</span>
                              <span>{row.division}</span>
                            </>
                          ) : null}
                          {row.visit_date ? (
                            <>
                              <span>•</span>
                              <span>{formatDisplayDateMedium(row.visit_date)}</span>
                            </>
                          ) : null}
                        </div>
                      </div>

                      <div className="flex items-center gap-1 flex-shrink-0">
                        {row.has_outcome_letter ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => handleOutcomeLetter(row)}
                            title="Download outcome letter"
                          >
                            <FileText className="h-3.5 w-3.5" />
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}

        {totalCount > 0 ? (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="employees"
            />
          </Card>
        ) : null}
      </div>
    </DashboardLayout>
  );
}
