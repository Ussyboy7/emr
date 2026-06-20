"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { formatDisplayTime } from "@/lib/dates";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MODAL_SIZES } from "@/components/ui/modal-sizes";
import { helpService } from "@/lib/services";
import { toast } from "sonner";
import { useHelpPageAuth } from "@/hooks/use-help-page-auth";
import { isPathAllowedByPages } from "@/lib/home-route";
import {
  helpContactOptions,
  helpFaqs,
  helpFaqCategories,
  helpQuickActions,
  helpRoleTips,
  helpSupportHours,
  SUPPORT_EMAIL,
} from "@/lib/help/help-content";
import {
  HelpCircle,
  Search,
  Book,
  Mail,
  MessageSquare,
  Phone,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Send,
  Headphones,
  Loader2,
  Activity,
  ExternalLink,
} from "lucide-react";

type ScrollTarget = "faqs" | "status" | "resources";

const QUICK_ACTION_ICONS = {
  scroll: Book,
  mailto: Mail,
  ticket: Send,
  status: Activity,
} as const;

function serviceBadge(service?: string): { label: string; ok: boolean } {
  if (!service) return { label: "Unknown", ok: false };
  if (service.includes("healthy")) return { label: "Operational", ok: true };
  if (service.includes("unhealthy") || service.includes("failed")) {
    return { label: "Degraded", ok: false };
  }
  return { label: "Unknown", ok: false };
}

export default function HelpPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, handleAuthError, currentUser } = useHelpPageAuth();
  const faqsRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef<HTMLDivElement>(null);
  const resourcesRef = useRef<HTMLDivElement>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("all");
  const [isTicketDialogOpen, setIsTicketDialogOpen] = useState(false);
  const [ticketForm, setTicketForm] = useState({
    category: "",
    priority: "medium",
    subject: "",
    description: "",
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [systemStatus, setSystemStatus] = useState<{
    status: string;
    services: Record<string, string>;
    lastUpdated: string;
  }>({
    status: "healthy",
    services: {},
    lastUpdated: "",
  });
  const [loadingStatus, setLoadingStatus] = useState(true);

  const canViewAdminHealth = useMemo(
    () =>
      Boolean(
        currentUser &&
          (currentUser.isSuperuser ||
            isPathAllowedByPages("/admin/health", currentUser.permissions ?? [])),
      ),
    [currentUser],
  );

  const loadSystemStatus = useCallback(async () => {
    try {
      setLoadingStatus(true);
      const status = await helpService.getSystemStatus();
      const services: Record<string, string> = {};
      Object.entries(status.services || {}).forEach(([key, value]) => {
        if (value !== undefined) services[key] = value;
      });
      setSystemStatus({
        status: status.status,
        services,
        lastUpdated: formatDisplayTime(new Date()),
      });
    } catch (err) {
      if (handleAuthError(err)) return;
      setSystemStatus({
        status: "unhealthy",
        services: { api: "Connection failed" },
        lastUpdated: formatDisplayTime(new Date()),
      });
      toast.error("Could not reach the health check endpoint.");
    } finally {
      setLoadingStatus(false);
    }
  }, [handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    loadSystemStatus();
    const interval = setInterval(loadSystemStatus, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [ready, loadSystemStatus]);

  useEffect(() => {
    if (!ready) return;
    if (searchParams.get("ticket") !== "1") return;
    setIsTicketDialogOpen(true);
    const params = new URLSearchParams(searchParams.toString());
    params.delete("ticket");
    const query = params.toString();
    router.replace(query ? `/help?${query}` : "/help", { scroll: false });
  }, [ready, searchParams, router]);

  const filteredFaqs = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return helpFaqs
      .filter((cat) => selectedCategory === "all" || cat.category === selectedCategory)
      .map((cat) => ({
        ...cat,
        questions: cat.questions.filter(
          (qa) =>
            !query ||
            qa.q.toLowerCase().includes(query) ||
            qa.a.toLowerCase().includes(query),
        ),
      }))
      .filter((cat) => cat.questions.length > 0);
  }, [searchQuery, selectedCategory]);

  const scrollTo = (target: ScrollTarget) => {
    const node =
      target === "faqs"
        ? faqsRef.current
        : target === "status"
          ? statusRef.current
          : resourcesRef.current;
    node?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const openTicketDialog = () => setIsTicketDialogOpen(true);

  const handleQuickAction = (action: (typeof helpQuickActions)[number]) => {
    if (action.kind === "scroll") scrollTo(action.target);
    if (action.kind === "ticket") openTicketDialog();
    if (action.kind === "mailto") window.location.href = action.href;
  };

  const handleContactAction = (kind: (typeof helpContactOptions)[number]["kind"]) => {
    if (kind === "ticket") openTicketDialog();
    if (kind === "email") {
      window.location.href = `mailto:${SUPPORT_EMAIL}?subject=EMR%20Support%20Request`;
    }
  };

  const handleSubmitTicket = async () => {
    if (!ticketForm.category || !ticketForm.subject || !ticketForm.description) {
      toast.error("Please fill in all required fields");
      return;
    }
    setIsSubmitting(true);
    try {
      const ticket = await helpService.submitTicket({
        category: ticketForm.category,
        priority: ticketForm.priority as "low" | "medium" | "high" | "critical",
        subject: ticketForm.subject,
        description: ticketForm.description,
      });
      toast.success(`Support ticket submitted — reference ${ticket.reference}`);
      setIsTicketDialogOpen(false);
      setTicketForm({ category: "", priority: "medium", subject: "", description: "" });
    } catch (err) {
      if (handleAuthError(err)) return;
      toast.error("Failed to submit ticket. Please try again or email support.");
    } finally {
      setIsSubmitting(false);
    }
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

  const dbStatus = serviceBadge(systemStatus.services.database);
  const cacheStatus = serviceBadge(systemStatus.services.cache);
  const apiHealthy = systemStatus.status === "healthy";

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <HelpCircle className="h-8 w-8 text-cyan-500" />
              Help & Support
            </h1>
            <p className="text-muted-foreground mt-1">Get help with using the EMR system</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/help/tickets">My tickets</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/help/docs">User guides</Link>
            </Button>
            <Button onClick={openTicketDialog} className="bg-cyan-600 hover:bg-cyan-700">
              <Send className="h-4 w-4 mr-2" />
              Submit Support Ticket
            </Button>
          </div>
        </div>

        <Card className="bg-gradient-to-r from-cyan-500/10 to-blue-500/10 border-cyan-500/20">
          <CardContent className="p-6">
            <h2 className="text-xl font-semibold mb-4">How can we help you today?</h2>
            <div className="relative max-w-2xl">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                placeholder="Search FAQs by keyword…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-11 h-12 text-lg"
              />
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
          {helpQuickActions.map((action) => {
            const Icon =
              action.kind === "scroll" && action.target === "status"
                ? QUICK_ACTION_ICONS.status
                : QUICK_ACTION_ICONS[action.kind === "scroll" ? "scroll" : action.kind];
            return (
              <button
                key={action.title}
                type="button"
                onClick={() => handleQuickAction(action)}
                className="text-left rounded-lg border bg-card hover:shadow-md transition-shadow group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500"
              >
                <div className="p-4 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-cyan-500/10 flex items-center justify-center group-hover:bg-cyan-500/20 transition-colors flex-shrink-0">
                    <Icon className="h-6 w-6 text-cyan-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-medium">{action.title}</h3>
                    <p className="text-sm text-muted-foreground">{action.description}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:text-cyan-500 transition-colors flex-shrink-0" />
                </div>
              </button>
            );
          })}
        </div>

        <Card ref={resourcesRef} className="scroll-mt-6">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Book className="h-5 w-5 text-cyan-500" />
              Role tips & menu paths
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Your sidebar only shows modules your access role allows. Use these common paths; ask
              your administrator to update role pages if you need another module. For full walkthroughs,
              open <Link href="/help/docs" className="text-cyan-600 hover:underline">User Guides</Link> or
              track requests in <Link href="/help/tickets" className="text-cyan-600 hover:underline">My Tickets</Link>.
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {helpRoleTips.map((tip) => (
                <div key={tip.role} className="rounded-lg border p-3 text-sm">
                  <p className="font-medium text-foreground">{tip.role}</p>
                  <p className="text-muted-foreground mt-1">{tip.paths}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div ref={faqsRef} className="lg:col-span-2 space-y-4 scroll-mt-6">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <h2 className="text-xl font-semibold">Frequently Asked Questions</h2>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Categories</SelectItem>
                  {helpFaqCategories.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {filteredFaqs.length === 0 ? (
              <Card className="p-8 text-center">
                <HelpCircle className="h-12 w-12 mx-auto mb-4 text-muted-foreground opacity-20" />
                <p className="text-muted-foreground">No FAQs found matching your search</p>
              </Card>
            ) : (
              filteredFaqs.map((cat) => (
                <Card key={cat.category}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg">{cat.category}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Accordion type="single" collapsible className="w-full">
                      {cat.questions.map((qa, i) => (
                        <AccordionItem key={`${cat.category}-${i}`} value={`${cat.category}-${i}`}>
                          <AccordionTrigger className="text-left">{qa.q}</AccordionTrigger>
                          <AccordionContent className="text-muted-foreground">{qa.a}</AccordionContent>
                        </AccordionItem>
                      ))}
                    </Accordion>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Phone className="h-5 w-5 text-emerald-500" />
                  Contact Support
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {helpContactOptions.map((opt) => (
                  <button
                    key={opt.title}
                    type="button"
                    className="w-full flex items-center gap-3 p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors text-left disabled:cursor-default disabled:opacity-80"
                    onClick={() => handleContactAction(opt.kind)}
                    disabled={opt.kind === "phone"}
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                      {opt.kind === "email" ? (
                        <Mail className="h-5 w-5 text-emerald-600" />
                      ) : opt.kind === "ticket" ? (
                        <MessageSquare className="h-5 w-5 text-emerald-600" />
                      ) : (
                        <Headphones className="h-5 w-5 text-emerald-600" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm">{opt.title}</p>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                    <Badge variant="secondary" className="flex-shrink-0 max-w-[10rem] truncate">
                      {opt.contact}
                    </Badge>
                  </button>
                ))}
              </CardContent>
            </Card>

            <Card ref={statusRef} className="scroll-mt-6">
              <CardHeader>
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-500" />
                    System Status
                  </CardTitle>
                  <Button variant="ghost" size="sm" onClick={loadSystemStatus} disabled={loadingStatus}>
                    <Loader2 className={`h-4 w-4 ${loadingStatus ? "animate-spin" : ""}`} />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {loadingStatus ? (
                  <div className="text-center py-4">
                    <Loader2 className="h-6 w-6 mx-auto mb-2 animate-spin text-muted-foreground" />
                    <p className="text-xs text-muted-foreground">Checking status…</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Database</span>
                      <Badge
                        className={
                          dbStatus.ok
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        }
                      >
                        {dbStatus.ok ? (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 mr-1" />
                        )}
                        {dbStatus.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">Cache</span>
                      <Badge
                        className={
                          cacheStatus.ok
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : "bg-amber-500/10 text-amber-600 border-amber-500/30"
                        }
                      >
                        {cacheStatus.ok ? (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 mr-1" />
                        )}
                        {cacheStatus.label}
                      </Badge>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm">API Server</span>
                      <Badge
                        className={
                          apiHealthy
                            ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
                            : "bg-rose-500/10 text-rose-600 border-rose-500/30"
                        }
                      >
                        {apiHealthy ? (
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                        ) : (
                          <AlertTriangle className="h-3 w-3 mr-1" />
                        )}
                        {apiHealthy ? "Operational" : "Unhealthy"}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2">
                      Last updated: {systemStatus.lastUpdated || "Never"}
                    </p>
                    {canViewAdminHealth ? (
                      <Button asChild variant="outline" size="sm" className="w-full mt-2">
                        <Link href="/admin/health">
                          Full system health
                          <ExternalLink className="h-3.5 w-3.5 ml-2" />
                        </Link>
                      </Button>
                    ) : null}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  Support Hours
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                {helpSupportHours.map((row) => (
                  <div key={row.days} className="flex justify-between gap-2">
                    <span>{row.days}</span>
                    <span
                      className={
                        "highlight" in row && row.highlight
                          ? "font-medium text-emerald-600"
                          : "muted" in row && row.muted
                            ? "text-muted-foreground"
                            : "font-medium"
                      }
                    >
                      {row.hours}
                    </span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </div>

        <Dialog open={isTicketDialogOpen} onOpenChange={setIsTicketDialogOpen}>
          <DialogContent className={MODAL_SIZES.sm2}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-cyan-500" />
                Submit Support Ticket
              </DialogTitle>
              <DialogDescription>
                Your request is logged for the IT team with a reference number. IT can also find it
                under Administration → Audit (support tickets).
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={ticketForm.category}
                    onValueChange={(v) => setTicketForm((p) => ({ ...p, category: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="technical">Technical Issue</SelectItem>
                      <SelectItem value="access">Access Problem</SelectItem>
                      <SelectItem value="feature">Feature Request</SelectItem>
                      <SelectItem value="training">Training Request</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select
                    value={ticketForm.priority}
                    onValueChange={(v) => setTicketForm((p) => ({ ...p, priority: v }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">Low</SelectItem>
                      <SelectItem value="medium">Medium</SelectItem>
                      <SelectItem value="high">High</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Subject *</Label>
                <Input
                  value={ticketForm.subject}
                  onChange={(e) => setTicketForm((p) => ({ ...p, subject: e.target.value }))}
                  placeholder="Brief description of the issue"
                />
              </div>
              <div className="space-y-2">
                <Label>Description *</Label>
                <Textarea
                  value={ticketForm.description}
                  onChange={(e) => setTicketForm((p) => ({ ...p, description: e.target.value }))}
                  placeholder="Please provide detailed information about your issue…"
                  rows={5}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setIsTicketDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleSubmitTicket}
                disabled={
                  isSubmitting ||
                  !ticketForm.category ||
                  !ticketForm.subject ||
                  !ticketForm.description
                }
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                {isSubmitting ? "Submitting…" : "Submit Ticket"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}
