"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { formatDisplayDateMedium, formatDisplayTime } from "@/lib/dates";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { StandardPagination } from "@/components/shared/StandardPagination";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { helpService, type SupportTicket, type SupportTicketStatus } from "@/lib/services/help-service";
import { useHelpPageAuth } from "@/hooks/use-help-page-auth";
import { toast } from "sonner";
import { ArrowLeft, HelpCircle, Loader2, Send, Ticket } from "lucide-react";

const STATUS_LABELS: Record<SupportTicketStatus, string> = {
  open: "Open",
  in_progress: "In progress",
  resolved: "Resolved",
  closed: "Closed",
};

function statusVariant(status?: SupportTicketStatus): "default" | "secondary" | "destructive" | "outline" {
  if (status === "open") return "default";
  if (status === "in_progress") return "secondary";
  if (status === "resolved") return "outline";
  return "outline";
}

export default function MyTicketsPage() {
  const { ready, handleAuthError } = useHelpPageAuth();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(20);
  const [totalCount, setTotalCount] = useState(0);

  const loadTickets = useCallback(async () => {
    if (!ready) return;
    try {
      setLoading(true);
      const res = await helpService.listMyTickets({
        page: currentPage,
        page_size: itemsPerPage,
        status: statusFilter === "all" ? undefined : (statusFilter as SupportTicketStatus),
      });
      setTickets(res.results);
      setTotalCount(res.count);
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Could not load your support tickets.");
    } finally {
      setLoading(false);
    }
  }, [ready, currentPage, itemsPerPage, statusFilter, handleAuthError]);

  useEffect(() => {
    loadTickets();
  }, [loadTickets]);

  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter]);

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
              <Ticket className="h-8 w-8 text-cyan-500" />
              My Support Tickets
            </h1>
            <p className="mt-1 text-muted-foreground">
              Track tickets you submitted to IT. Status updates appear here when IT progresses your request.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/help">
                <ArrowLeft className="mr-2 h-4 w-4" />
                Help & Support
              </Link>
            </Button>
            <Button asChild className="bg-cyan-600 hover:bg-cyan-700">
              <Link href="/help?ticket=1">
                <Send className="mr-2 h-4 w-4" />
                New ticket
              </Link>
            </Button>
          </div>
        </div>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-3 pb-2">
            <CardTitle className="text-lg">Submitted tickets</CardTitle>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[160px]">
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
          </CardHeader>
          <CardContent className="space-y-3">
            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : tickets.length === 0 ? (
              <div className="py-12 text-center">
                <HelpCircle className="mx-auto mb-4 h-12 w-12 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">No tickets yet.</p>
                <Button asChild className="mt-4">
                  <Link href="/help?ticket=1">Submit your first ticket</Link>
                </Button>
              </div>
            ) : (
              tickets.map((ticket) => (
                <div key={ticket.id ?? ticket.reference} className="rounded-lg border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-foreground">{ticket.subject}</p>
                      <p className="text-xs text-muted-foreground">
                        {ticket.reference} · {ticket.category} · {ticket.priority} priority
                      </p>
                    </div>
                    <Badge variant={statusVariant(ticket.status)}>{STATUS_LABELS[ticket.status ?? "open"]}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground line-clamp-3">{ticket.description}</p>
                  {ticket.created_at && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      Submitted {formatDisplayDateMedium(ticket.created_at)} at {formatDisplayTime(ticket.created_at)}
                    </p>
                  )}
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
