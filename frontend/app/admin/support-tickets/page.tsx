"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { useAdminPageAuth } from "@/hooks/use-admin-page-auth";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { helpService, type SupportTicket, type SupportTicketStatus } from "@/lib/services/help-service";
import { toast } from "sonner";
import { ClipboardList, Loader2, Search, Ticket } from "lucide-react";

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

const PRIORITY_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  critical: "destructive",
  high: "destructive",
  medium: "secondary",
  low: "outline",
};

export default function AdminSupportTicketsPage() {
  const { ready, handleAuthError } = useAdminPageAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 400);
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);
  const [updatingId, setUpdatingId] = useState<number | null>(null);

  const loadQueue = useCallback(async () => {
    if (!ready) return;
    try {
      setLoading(true);
      const res = await helpService.listTicketQueue({
        page: currentPage,
        page_size: itemsPerPage,
        status: statusFilter === "all" ? undefined : (statusFilter as SupportTicketStatus),
        search: debouncedSearch || undefined,
      });
      setTickets(res.results);
      setTotalCount(res.count);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Could not load support ticket queue.");
    } finally {
      setLoading(false);
    }
  }, [ready, currentPage, itemsPerPage, statusFilter, debouncedSearch, handleAuthError]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, debouncedSearch]);

  const handleStatusChange = async (ticket: SupportTicket, nextStatus: SupportTicketStatus) => {
    if (!ticket.id) return;
    setUpdatingId(ticket.id);
    try {
      await helpService.updateTicketStatus(ticket.id, nextStatus);
      toast.success(`Ticket ${ticket.reference} updated to ${STATUS_LABELS[nextStatus]}.`);
      await loadQueue();
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Failed to update ticket status.");
    } finally {
      setUpdatingId(null);
    }
  };

  if (!ready) {
    return (
      <DashboardLayout>
        <div className="flex min-h-[40vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto space-y-4 p-4 sm:space-y-6 sm:p-6">
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-center">
          <div>
            <h1 className="flex items-center gap-3 text-2xl font-bold text-foreground sm:text-3xl">
              <Ticket className="h-8 w-8 text-violet-500" />
              Support Tickets
            </h1>
            <p className="mt-1 text-muted-foreground">
              IT helpdesk queue — triage user submissions and update workflow status.
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/admin/audit?object_type=support_ticket">
              <ClipboardList className="mr-2 h-4 w-4" />
              Audit trail
            </Link>
          </Button>
        </div>

        <Card>
          <CardHeader className="space-y-3 pb-2">
            <CardTitle className="text-lg">Ticket queue</CardTitle>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              <div className="relative md:col-span-2">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  placeholder="Search reference, subject, or description…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  {(Object.keys(STATUS_LABELS) as SupportTicketStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>
                      {STATUS_LABELS[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tickets.length === 0 ? (
              <p className="py-12 text-center text-muted-foreground">No tickets match your filters.</p>
            ) : (
              tickets.map((ticket) => (
                <div key={ticket.id ?? ticket.reference} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium text-foreground">{ticket.subject}</p>
                        <Badge variant={PRIORITY_VARIANT[ticket.priority] ?? "outline"}>{ticket.priority}</Badge>
                        <Badge variant="secondary">{ticket.category}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {ticket.reference} · {ticket.user_name || ticket.user_username} ·{" "}
                        {ticket.created_at
                          ? `${formatDisplayDateMedium(ticket.created_at)} ${formatDisplayTime(ticket.created_at)}`
                          : "—"}
                      </p>
                    </div>
                    <Select
                      value={ticket.status ?? "open"}
                      onValueChange={(value) => handleStatusChange(ticket, value as SupportTicketStatus)}
                      disabled={updatingId === ticket.id}
                    >
                      <SelectTrigger className="w-[160px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(Object.keys(STATUS_LABELS) as SupportTicketStatus[]).map((s) => (
                          <SelectItem key={s} value={s}>
                            {STATUS_LABELS[s]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{ticket.description}</p>
                </div>
              ))
            )}

            {!loading && totalCount > 0 && (
              <StandardPagination
                currentPage={currentPage}
                totalItems={totalCount}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={(size) => {
                  setItemsPerPage(size);
                  setCurrentPage(1);
                }}
              />
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
