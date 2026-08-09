"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { usePharmacyPageAuth } from "@/hooks/use-pharmacy-page-auth";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { pharmacyService, type HodStockIssue } from "@/lib/services";
import { formatDisplayDateTime } from "@/lib/dates";
import {
  buildHodIssueCardMeta,
  buildHodIssueRecipientLine,
  formatHodIssueQuantity,
  getHodIssueReasonBadgeLabel,
} from "@/lib/pharmacy/hod-stock-issue-card";
import {
  History,
  Search,
  Loader2,
  Pill,
  Eye,
  Calendar,
  Package,
  AlertTriangle,
} from "lucide-react";

export default function HodDispenseHistoryPage() {
  const { ready, handleAuthError } = usePharmacyPageAuth();

  const [history, setHistory] = useState<HodStockIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);
  const [dateFilter, setDateFilter] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [summaryStats, setSummaryStats] = useState<{
    total: number;
    today: number;
    total_quantity: string;
  } | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [selected, setSelected] = useState<HodStockIssue | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const datePreset = dateFilter !== "all" ? dateFilter : undefined;

  const loadSummaryStats = useCallback(async () => {
    setSummaryLoading(true);
    setSummaryError(null);
    try {
      const s = await pharmacyService.getHodStockIssueSummaryStats({
        search: debouncedSearch.trim() || undefined,
        date_preset: datePreset,
      });
      setSummaryStats(s);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      setSummaryStats(null);
      setSummaryError(e instanceof Error ? e.message : "Failed to load summary statistics");
    } finally {
      setSummaryLoading(false);
    }
  }, [debouncedSearch, datePreset, handleAuthError]);

  const loadHistory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const listRes = await pharmacyService.getHodStockIssues({
        page: currentPage,
        page_size: itemsPerPage,
        search: debouncedSearch.trim() || undefined,
        date_preset: datePreset,
      });
      setHistory(listRes.results || []);
      setTotalCount(listRes.count ?? listRes.results?.length ?? 0);
    } catch (e: unknown) {
      if (handleAuthError(e)) return;
      const message = e instanceof Error ? e.message : "Failed to load HOD dispense history";
      setError(message);
      setHistory([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [currentPage, itemsPerPage, debouncedSearch, datePreset, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadSummaryStats();
  }, [loadSummaryStats, ready]);

  useEffect(() => {
    if (!ready) return;
    void loadHistory();
  }, [loadHistory, ready]);

  const stats = useMemo(() => {
    if (!summaryStats) return null;
    const totalQty = Number(summaryStats.total_quantity) || 0;
    const avgQty =
      summaryStats.total > 0 ? Math.round((totalQty / summaryStats.total) * 10) / 10 : 0;
    return {
      total: summaryStats.total,
      today: summaryStats.today,
      totalQuantity: totalQty,
      avgQuantity: avgQty,
    };
  }, [summaryStats]);

  const statsCards = useMemo(
    () => [
      {
        label: "Total Issues",
        value: summaryLoading ? "—" : stats ? stats.total.toLocaleString() : "—",
        sub: "All HOD store issues",
        icon: Package,
        color: "text-violet-600",
        iconColor: "text-violet-500",
        bg: "bg-violet-500/10",
      },
      {
        label: "Today",
        value: summaryLoading ? "—" : stats ? stats.today.toLocaleString() : "—",
        sub: "Issued today",
        icon: Calendar,
        color: "text-emerald-600",
        iconColor: "text-emerald-500",
        bg: "bg-emerald-500/10",
      },
      {
        label: "Units Issued",
        value: summaryLoading ? "—" : stats ? stats.totalQuantity.toLocaleString() : "—",
        sub: "Total quantity",
        icon: Pill,
        color: "text-amber-600",
        iconColor: "text-amber-500",
        bg: "bg-amber-500/10",
      },
      {
        label: "Avg per Issue",
        value: summaryLoading ? "—" : stats ? stats.avgQuantity.toLocaleString() : "—",
        sub: "Average units",
        icon: History,
        color: "text-blue-600",
        iconColor: "text-blue-500",
        bg: "bg-blue-500/10",
      },
    ],
    [summaryLoading, stats]
  );

  const getStatusBadge = () => (
    <Badge
      variant="outline"
      className="text-[10px] px-1.5 py-0 bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400"
    >
      Issued
    </Badge>
  );

  const openDetails = (row: HodStockIssue) => {
    setSelected(row);
    setShowDetailModal(true);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <History className="h-8 w-8 text-violet-500" />
              HOD Dispense History
            </h1>
            <p className="text-muted-foreground mt-1">
              Bode Thomas — Audit trail of medications issued from the HOD store
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/pharmacy/hod-store">HOD Store</Link>
          </Button>
        </div>

        {summaryError && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="py-3 text-sm text-destructive">{summaryError}</CardContent>
          </Card>
        )}

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {statsCards.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-2xl sm:text-3xl font-bold tabular-nums ${stat.color} mt-1`}>
                      {stat.value}
                    </p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}>
                    <stat.icon className={`h-5 w-5 ${stat.iconColor}`} />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{stat.sub}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  className="pl-10"
                  placeholder="Search issue ID, drug, patient, MRN..."
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    setCurrentPage(1);
                  }}
                />
              </div>
              <Select
                value={dateFilter}
                onValueChange={(v) => {
                  setDateFilter(v);
                  setCurrentPage(1);
                }}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Time</SelectItem>
                  <SelectItem value="today">Today</SelectItem>
                  <SelectItem value="week">This Week</SelectItem>
                  <SelectItem value="month">This Month</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-between px-1">
          <p className="text-sm text-muted-foreground">
            Showing <span className="font-medium text-foreground">{history.length}</span> records
          </p>
        </div>

        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading HOD dispense history...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button
                  variant="outline"
                  className="mt-4"
                  onClick={() => {
                    void loadHistory();
                    void loadSummaryStats();
                  }}
                >
                  Retry
                </Button>
              </CardContent>
            </Card>
          ) : history.length > 0 ? (
            history.map((row) => {
              const reasonBadge = getHodIssueReasonBadgeLabel(row);
              const cardMeta = buildHodIssueCardMeta(row);
              const recipientLine = buildHodIssueRecipientLine(row);
              return (
              <Card
                key={row.id}
                className="border-l-4 border-l-emerald-500 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => openDetails(row)}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-start gap-3">
                    <div className="flex-shrink-0 rounded-full bg-violet-500/10 p-2 mt-0.5">
                      <Pill className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <h3 className="font-medium text-foreground text-sm truncate">
                              {row.medication_name || "Medication"}
                            </h3>
                            {getStatusBadge()}
                            {reasonBadge ? (
                              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 shrink-0">
                                {reasonBadge}
                              </Badge>
                            ) : null}
                          </div>
                          {cardMeta ? (
                            <p className="text-xs text-muted-foreground mt-0.5 truncate">{cardMeta}</p>
                          ) : null}
                          {recipientLine ? (
                            <p className="text-xs text-foreground/80 mt-0.5 truncate">{recipientLine}</p>
                          ) : null}
                        </div>
                        <Button
                          variant="outline"
                          size="icon"
                          className="h-8 w-8 flex-shrink-0"
                          onClick={(e) => {
                            e.stopPropagation();
                            openDetails(row);
                          }}
                          title="View details"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            })
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No HOD issues recorded</p>
                <p className="text-sm text-muted-foreground">
                  Try adjusting your search or filters, or issue stock from HOD Store
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        {!loading && totalCount > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(size) => {
                setItemsPerPage(size);
                setCurrentPage(1);
              }}
              itemName="records"
              pageSizeOptions={[25, 50, 100]}
            />
          </Card>
        )}

        <Dialog open={showDetailModal} onOpenChange={setShowDetailModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected?.medication_name || "HOD Issue"}</DialogTitle>
              <DialogDescription>
                {selected?.issue_id}
                {selected?.reason ? ` · ${selected.reason}` : ""}
              </DialogDescription>
            </DialogHeader>

            {selected && (
              <div className="space-y-4">
                <div className="rounded-lg bg-muted/50 p-4 text-sm space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    {getStatusBadge()}
                    {getHodIssueReasonBadgeLabel(selected) ? (
                      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5">
                        {getHodIssueReasonBadgeLabel(selected)}
                      </Badge>
                    ) : null}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Issued</p>
                      <p className="font-medium mt-0.5">{formatDisplayDateTime(selected.issued_at)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Quantity</p>
                      <p className="font-medium mt-0.5">{formatHodIssueQuantity(selected)}</p>
                    </div>
                    {selected.batch_number ? (
                      <div>
                        <p className="text-muted-foreground text-xs">Batch</p>
                        <p className="font-medium mt-0.5">{selected.batch_number}</p>
                      </div>
                    ) : null}
                    <div>
                      <p className="text-muted-foreground text-xs">Issued by</p>
                      <p className="font-medium mt-0.5">{selected.issued_by_name || "—"}</p>
                    </div>
                    {selected.patient_name ? (
                      <div>
                        <p className="text-muted-foreground text-xs">Patient</p>
                        <p className="font-medium mt-0.5">
                          {selected.patient_name}
                          {selected.patient_mrn ? ` (${selected.patient_mrn})` : ""}
                        </p>
                      </div>
                    ) : null}
                  </div>
                </div>

                {selected.notes ? (
                  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p>{selected.notes}</p>
                  </div>
                ) : null}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDetailModal(false)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
