"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import {
  Loader2,
  ClipboardList,
  Users,
  AlertTriangle,
  CheckCircle2,
  ShieldCheck,
  Activity,
  Clock,
  Download,
  Plus,
  ArrowRight,
} from "lucide-react";
import { hrService, type HRComplianceSummary } from "@/lib/services/hr-service";
import { useAuthRedirect } from "@/hooks/use-auth-redirect";
import { isAuthenticationError } from "@/lib/auth-errors";

export default function HRDashboardPage() {
  const router = useRouter();
  const year = new Date().getFullYear();
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<unknown>(null);
  const [summary, setSummary] = useState<(HRComplianceSummary & { programme_year: number }) | null>(null);
  useAuthRedirect(authError);

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const data = await hrService.getSummary(year);
      setSummary(data);
    } catch (err) {
      if (isAuthenticationError(err)) setAuthError(err);
      else toast.error("Failed to load HR dashboard. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [year]);

  useEffect(() => {
    load();
  }, [load]);

  const dueCount = summary ? summary.due + summary.in_progress : 0;
  const pendingCount = dueCount + (summary?.overdue ?? 0);
  const completionRate = useMemo(() => {
    if (!summary || summary.total_eligible === 0) return 0;
    return Math.round((summary.completed / summary.total_eligible) * 100);
  }, [summary]);

  const handleExport = async () => {
    try {
      const blob = await hrService.exportCsv(year);
      hrService.downloadBlob(blob, `annual_checkup_compliance_${year}.csv`);
      toast.success("Compliance report exported.");
    } catch {
      toast.error("CSV export failed.");
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-violet-500 to-purple-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                <Users className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold">Human Resources</h1>
                <p className="text-sm sm:text-base text-violet-100">
                  Annual employee check-up compliance — {year} programme year
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Programme Overview */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Programme Overview
            {!loading && (
              <span className="text-xs font-normal text-muted-foreground">({year})</span>
            )}
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Loading...</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                      <p className="text-2xl sm:text-3xl font-bold text-muted-foreground">--</p>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : summary ? (
              <>
                <Card className="border-l-4 border-l-violet-500">
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Eligible employees</p>
                    <div className="flex items-center gap-2 mt-1">
                      <Users className="h-5 w-5 text-violet-500 dark:text-violet-400" />
                      <p className="text-2xl sm:text-3xl font-bold text-violet-600 dark:text-violet-400">
                        {summary.total_eligible}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">In annual programme</p>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${summary.completed > 0 ? "border-l-emerald-500" : "border-l-green-500"}`}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Completed</p>
                    <div className="flex items-center gap-2 mt-1">
                      <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                      <p className="text-2xl sm:text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                        {summary.completed}
                      </p>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">
                      {completionRate}% completion rate
                    </p>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${dueCount > 0 ? "border-l-amber-500" : "border-l-green-500"}`}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Due</p>
                    <div className="flex items-center gap-2 mt-1">
                      <ClipboardList className={`h-5 w-5 ${dueCount > 0 ? "text-amber-500 dark:text-amber-400" : "text-green-500 dark:text-green-400"}`} />
                      <p className={`text-2xl sm:text-3xl font-bold ${dueCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>
                        {dueCount}
                      </p>
                    </div>
                    <p className={`text-xs mt-1 ${dueCount > 0 ? "text-amber-600 dark:text-amber-400" : "text-green-600 dark:text-green-400"}`}>
                      {dueCount > 0 ? "Awaiting check-up" : "None due right now"}
                    </p>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${summary.overdue > 0 ? "border-l-rose-500" : "border-l-green-500"}`}>
                  <CardContent className="p-4">
                    <p className="text-sm text-muted-foreground">Overdue</p>
                    <div className="flex items-center gap-2 mt-1">
                      <AlertTriangle className={`h-5 w-5 ${summary.overdue > 0 ? "text-rose-500 dark:text-rose-400" : "text-green-500 dark:text-green-400"}`} />
                      <p className={`text-2xl sm:text-3xl font-bold ${summary.overdue > 0 ? "text-rose-600 dark:text-rose-400" : "text-green-600 dark:text-green-400"}`}>
                        {summary.overdue}
                      </p>
                    </div>
                    <p className={`text-xs mt-1 ${summary.overdue > 0 ? "text-rose-600 dark:text-rose-400" : "text-green-600 dark:text-green-400"}`}>
                      {summary.overdue > 0 ? "Needs follow-up" : "No overdue employees"}
                    </p>
                  </CardContent>
                </Card>
              </>
            ) : null}
          </div>
        </div>

        {/* Attention Needed */}
        {!loading && summary && (summary.overdue > 0 || dueCount > 0 || summary.exempt > 0) && (
          <div>
            <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Attention Needed
            </h2>
            <div className="space-y-2">
              {summary.overdue > 0 && (
                <Card className="border-l-4 border-l-rose-500 bg-rose-50 dark:bg-rose-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">Overdue check-ups</p>
                        <p className="text-sm text-muted-foreground">
                          {summary.overdue} employee{summary.overdue === 1 ? "" : "s"} past the programme deadline
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/hr/annual-checkups">Review</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {dueCount > 0 && (
                <Card className="border-l-4 border-l-amber-500 bg-amber-50 dark:bg-amber-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">Due check-ups</p>
                        <p className="text-sm text-muted-foreground">
                          {dueCount} employee{dueCount === 1 ? "" : "s"} still due for their annual check-up
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/hr/annual-checkups">View list</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
              {summary.exempt > 0 && (
                <Card className="border-l-4 border-l-violet-500 bg-violet-50 dark:bg-violet-950/20">
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-medium text-sm">Active exemptions</p>
                        <p className="text-sm text-muted-foreground">
                          {summary.exempt} employee{summary.exempt === 1 ? "" : "s"} exempt this programme year
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href="/hr/exemptions">Manage</Link>
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button
              onClick={() => router.push("/hr/annual-checkups")}
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white border-l-4 border-l-white/20"
            >
              <div className="flex items-center gap-2">
                <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6" />
                {!loading && pendingCount > 0 && (
                  <Badge variant="secondary" className="bg-white/20 text-white text-xs px-2 py-0.5">
                    {pendingCount}
                  </Badge>
                )}
              </div>
              <span className="text-xs sm:text-sm font-medium">Annual Check-ups</span>
              <span className="text-[10px] sm:text-xs opacity-90">Compliance matrix</span>
            </Button>

            <Button
              onClick={() => router.push("/hr/exemptions")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-violet-500"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 sm:h-6 sm:w-6 text-violet-500 dark:text-violet-400" />
                {!loading && summary && summary.exempt > 0 && (
                  <Badge variant="secondary" className="text-xs px-2 py-0.5">
                    {summary.exempt}
                  </Badge>
                )}
              </div>
              <span className="text-xs sm:text-sm font-medium">Exemptions</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Grant or review</span>
            </Button>

            <Button
              onClick={() => router.push("/hr/exemptions")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-purple-500"
            >
              <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-purple-500 dark:text-purple-400" />
              <span className="text-xs sm:text-sm font-medium">Grant Exemption</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Add new exemption</span>
            </Button>

            <Button
              onClick={handleExport}
              variant="outline"
              disabled={loading}
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-violet-500/30 hover:bg-violet-500/10 border-l-4 border-l-emerald-500"
            >
              <Download className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium">Export CSV</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">{year} compliance report</span>
            </Button>
          </div>
        </div>

        {/* Programme Progress */}
        {!loading && summary && summary.total_eligible > 0 && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                  Programme Progress
                </CardTitle>
                <Badge
                  variant="outline"
                  className={
                    completionRate >= 80
                      ? "border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10"
                      : "border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-500/10"
                  }
                >
                  {completionRate}% complete
                </Badge>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-sm mb-2">
                    <span className="text-muted-foreground">Check-ups completed</span>
                    <span className="font-medium">
                      {summary.completed} / {summary.total_eligible}
                    </span>
                  </div>
                  <Progress value={completionRate} className="h-2" />
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{summary.completed}</p>
                    <p className="text-xs text-muted-foreground">Completed</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold text-amber-600 dark:text-amber-400">{dueCount}</p>
                    <p className="text-xs text-muted-foreground">Due</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{summary.overdue}</p>
                    <p className="text-xs text-muted-foreground">Overdue</p>
                  </div>
                  <div className="rounded-lg border p-3">
                    <p className="text-lg font-bold text-violet-600 dark:text-violet-400">{summary.exempt}</p>
                    <p className="text-xs text-muted-foreground">Exempt</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-violet-500 dark:text-violet-400" />
                  Programme Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  HR-safe compliance view for the {year} annual check-up programme. Clinical details are not shown here.
                </p>
                <Button asChild variant="outline" className="w-full justify-between">
                  <Link href="/hr/annual-checkups">
                    Open compliance list
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                {summary.exempt > 0 ? (
                  <p className="text-xs text-muted-foreground">
                    {summary.exempt} active exemption{summary.exempt === 1 ? "" : "s"} on record.
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">No active exemptions this year.</p>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </DashboardLayout>
  );
}
