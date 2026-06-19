"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/shared/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  FileText,
  Search,
  Plus,
  Users,
  Activity,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import { patientService, visitService, type Visit } from "@/lib/services";
import { PREVIEW_PAGE_SIZE } from "@/lib/pagination-constants";
import { useMedicalRecordsPageAuth } from "@/hooks/use-medical-records-page-auth";
import { useServerToday } from "@/hooks/use-server-today";
import {
  getVisitServiceClinicsDisplay,
  joinDisplayParts,
} from "@/lib/utils/clinic-utils";
import { toast } from "sonner";

interface PatientData {
  id: number;
  full_name: string;
  patient_id: string;
  age?: number;
  age_display?: string;
  gender?: string;
}

interface VisitDayStats {
  visitsToday: number;
  inProgress: number;
  scheduled: number;
  completed: number;
}

export default function MedicalRecordsPage() {
  const router = useRouter();
  const serverToday = useServerToday();
  const { ready, handleAuthError } = useMedicalRecordsPageAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [totalPatients, setTotalPatients] = useState(0);
  const [visitStats, setVisitStats] = useState<VisitDayStats>({
    visitsToday: 0,
    inProgress: 0,
    scheduled: 0,
    completed: 0,
  });
  const [activeVisits, setActiveVisits] = useState<Visit[]>([]);
  const [scheduledVisits, setScheduledVisits] = useState<Visit[]>([]);
  const [recentPatients, setRecentPatients] = useState<PatientData[]>([]);

  const loadDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const [
        patientCounts,
        visitStatsRes,
        inProgressListRes,
        scheduledListRes,
        recentPatientsRes,
      ] = await Promise.all([
        patientService.getPatientCounts(),
        visitService.getListStats({ date: serverToday }),
        visitService.getVisits({ date: serverToday, status: "in_progress", page: 1, page_size: PREVIEW_PAGE_SIZE }),
        visitService.getVisits({ date: serverToday, status: "scheduled", page: 1, page_size: PREVIEW_PAGE_SIZE }),
        patientService.getPatients({ page: 1, page_size: PREVIEW_PAGE_SIZE, ordering: "-created_at" }),
      ]);

      setTotalPatients(patientCounts.total ?? 0);
      setVisitStats({
        visitsToday: visitStatsRes.total ?? 0,
        scheduled: visitStatsRes.scheduled ?? 0,
        inProgress: visitStatsRes.inProgress ?? 0,
        completed: visitStatsRes.completed ?? 0,
      });
      setActiveVisits(inProgressListRes.results ?? []);
      setScheduledVisits(scheduledListRes.results ?? []);
      setRecentPatients(
        (recentPatientsRes.results ?? []).map((p) => ({
          id: p.id,
          full_name: p.full_name ?? "",
          patient_id: p.patient_id,
          age: p.age,
          age_display: p.age_display,
          gender: p.gender,
        })),
      );
    } catch (err) {
      console.error("Error loading medical records dashboard:", err);
      if (handleAuthError(err)) return;
      setError("Failed to load medical records data");
      toast.error("Failed to load medical records dashboard. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [serverToday, handleAuthError]);

  useEffect(() => {
    if (!ready) return;
    void loadDashboard();
  }, [ready, loadDashboard]);

  const hasActiveWork = visitStats.inProgress > 0 || visitStats.scheduled > 0;

  const pendingVisits = useMemo(() => {
    const seen = new Set<number>();
    const merged: Visit[] = [];
    for (const v of [...activeVisits, ...scheduledVisits]) {
      if (seen.has(v.id)) continue;
      seen.add(v.id);
      merged.push(v);
    }
    return merged.slice(0, 5);
  }, [activeVisits, scheduledVisits]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {error && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">
                  Try reloading the page or contact support if the issue persists.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <FileText className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Medical Records Department</h1>
                  <p className="text-sm sm:text-base text-blue-100 dark:text-blue-200">
                    Digital medical records management and patient documentation
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-blue-600 hover:bg-blue-50 dark:bg-white dark:text-blue-600 dark:hover:bg-blue-50 shadow-md"
                  onClick={() => router.push("/medical-records/patients/new")}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Register Patient
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => router.push("/medical-records/patients")}
                >
                  <Search className="h-4 w-4 mr-2" />
                  Find Patient
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Overview */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Today&apos;s Overview
            {!loading && (
              <span className="text-xs font-normal text-muted-foreground">({serverToday})</span>
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
            ) : (
              <>
                <OverviewCard
                  label="Total Patients"
                  value={totalPatients}
                  icon={Users}
                  tone="registry"
                  emptyHint="No patients registered"
                  activeHint="All registered patients"
                />
                <OverviewCard
                  label="Visits Today"
                  value={visitStats.visitsToday}
                  icon={Calendar}
                  tone="blue"
                  emptyHint="No visits today"
                  activeHint="Visits dated today"
                />
                <OverviewCard
                  label="In Progress"
                  value={visitStats.inProgress}
                  icon={Activity}
                  tone="blue"
                  emptyHint="None in progress"
                  activeHint="Active visits today"
                />
                <OverviewCard
                  label="Completed Today"
                  value={visitStats.completed}
                  icon={CheckCircle2}
                  tone="emerald"
                  emptyHint="None completed yet"
                  activeHint="Visits completed today"
                />
              </>
            )}
          </div>
        </div>

        {/* Secondary row: scheduled (common workflow) */}
        {!loading && visitStats.scheduled > 0 && (
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Clock className="h-5 w-5 text-amber-500" />
                <div>
                  <p className="font-medium text-sm">
                    {visitStats.scheduled} scheduled visit{visitStats.scheduled !== 1 ? "s" : ""} today
                  </p>
                  <p className="text-xs text-muted-foreground">Awaiting check-in or start</p>
                </div>
              </div>
              <Button asChild variant="outline" size="sm">
                <Link href="/medical-records/visits">View visits</Link>
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
            <Button
              onClick={() => router.push("/medical-records/patients/new")}
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-l-4 border-l-white/20"
            >
              <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
              <span className="text-xs sm:text-sm font-medium">Register Patient</span>
              <span className="text-[10px] sm:text-xs opacity-90">Create new patient records</span>
            </Button>
            <Button
              onClick={() => router.push("/medical-records/patients")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-blue-500/30 hover:bg-blue-500/10 border-l-4 border-l-blue-500"
            >
              <Search className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Patient Search</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Find patients by name/ID</span>
            </Button>
            <Button
              onClick={() => router.push("/medical-records/visits/new")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-green-500/30 hover:bg-green-500/10 border-l-4 border-l-green-500"
            >
              <Plus className="h-5 w-5 sm:h-6 sm:w-6 text-green-500 dark:text-green-400" />
              <span className="text-xs sm:text-sm font-medium">Start New Visit</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Create patient consultations</span>
            </Button>
            <Button
              onClick={() => router.push("/medical-records/coding")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-amber-500/30 hover:bg-amber-500/10 border-l-4 border-l-amber-500"
            >
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-amber-500 dark:text-amber-400" />
              <span className="text-xs sm:text-sm font-medium">ICD-10 Codes</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Browse diagnosis coding</span>
            </Button>
            <Button
              onClick={() => router.push("/medical-records/reports")}
              variant="outline"
              className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-purple-500/30 hover:bg-purple-500/10 border-l-4 border-l-purple-500"
            >
              <FileText className="h-5 w-5 sm:h-6 sm:w-6 text-purple-500 dark:text-purple-400" />
              <span className="text-xs sm:text-sm font-medium">View Reports</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Departmental & statistical reports</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Active / scheduled visits */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
                  Visits Needing Attention
                </CardTitle>
                <Badge
                  variant="default"
                  className={
                    hasActiveWork
                      ? "bg-blue-500/10 text-blue-700 border-blue-500/20"
                      : "bg-green-500/10 text-green-700 border-green-500/20"
                  }
                >
                  {hasActiveWork
                    ? `${visitStats.inProgress + visitStats.scheduled} open`
                    : "All Clear"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : pendingVisits.length > 0 ? (
                  <div className="space-y-2">
                    {visitStats.scheduled > 0 && (
                      <TaskRow
                        title="Scheduled visits"
                        description={`${visitStats.scheduled} visit${visitStats.scheduled !== 1 ? "s" : ""} booked for today`}
                        href="/medical-records/visits"
                      />
                    )}
                    {visitStats.inProgress > 0 && (
                      <TaskRow
                        title="In progress"
                        description={`${visitStats.inProgress} visit${visitStats.inProgress !== 1 ? "s" : ""} underway`}
                        href="/medical-records/visits"
                      />
                    )}
                    {pendingVisits.map((visit) => (
                      <VisitRow key={visit.id} visit={visit} />
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">No active visits</p>
                    <p className="text-xs text-muted-foreground">
                      All patients have been processed or are in consultation.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent registrations */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                Recently Registered
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentPatients.length > 0 ? (
                <div className="space-y-3">
                  {recentPatients.map((patient) => (
                    <Link
                      key={patient.id}
                      href={`/medical-records/patients/${patient.id}`}
                      className="block"
                    >
                      <div className="p-3 rounded-lg border border-muted bg-muted/30 hover:bg-muted/50 transition-colors">
                        <p className="font-medium text-sm">{patient.full_name}</p>
                        <p className="text-xs text-muted-foreground">ID: {patient.patient_id}</p>
                        {(patient.age_display || patient.age != null || patient.gender) && (
                          <p className="text-xs text-muted-foreground mt-1">
                            {joinDisplayParts([
                              patient.age_display ||
                                (patient.age != null ? `${patient.age} years` : ""),
                              patient.gender,
                            ])}
                          </p>
                        )}
                      </div>
                    </Link>
                  ))}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-blue-600"
                    onClick={() => router.push("/medical-records/patients")}
                  >
                    View all patients
                  </Button>
                </div>
              ) : (
                <div className="text-center py-8">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No patients yet</p>
                  <p className="text-xs text-muted-foreground">Start by registering a new patient</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}

type OverviewTone = "registry" | "blue" | "amber" | "emerald";

function OverviewCard({
  label,
  value,
  icon: Icon,
  tone,
  emptyHint,
  activeHint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tone: OverviewTone;
  emptyHint: string;
  activeHint: string;
}) {
  const styles: Record<OverviewTone, { border: string; icon: string; text: string }> = {
    registry: {
      border: "border-l-blue-500",
      icon: "text-blue-500 dark:text-blue-400",
      text: "text-blue-600 dark:text-blue-400",
    },
    blue: {
      border: "border-l-blue-500",
      icon: "text-blue-500 dark:text-blue-400",
      text: "text-blue-600 dark:text-blue-400",
    },
    amber: {
      border: "border-l-amber-500",
      icon: "text-amber-500 dark:text-amber-400",
      text: "text-amber-600 dark:text-amber-400",
    },
    emerald: {
      border: "border-l-emerald-500",
      icon: "text-emerald-500 dark:text-emerald-400",
      text: "text-emerald-600 dark:text-emerald-400",
    },
  };

  const isRegistry = tone === "registry";
  const active = isRegistry ? value > 0 : value > 0;
  const s = styles[tone];

  return (
    <Card className={`border-l-4 ${active || isRegistry ? s.border : "border-l-green-500"}`}>
      <CardContent className="p-4">
        <p className="text-sm text-muted-foreground">{label}</p>
        <div className="flex items-center gap-2 mt-1">
          <Icon
            className={`h-5 w-5 ${active || isRegistry ? s.icon : "text-green-500 dark:text-green-400"}`}
          />
          <p
            className={`text-2xl sm:text-3xl font-bold ${
              active || isRegistry ? s.text : "text-green-600 dark:text-green-400"
            }`}
          >
            {value}
          </p>
        </div>
        <p
          className={`text-xs mt-1 ${
            active || isRegistry ? "text-muted-foreground" : "text-green-600 dark:text-green-400"
          }`}
        >
          {active || isRegistry ? activeHint : emptyHint}
        </p>
      </CardContent>
    </Card>
  );
}

function TaskRow({
  title,
  description,
  href,
}: {
  title: string;
  description: string;
  href: string;
}) {
  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/20">
      <div className="min-w-0">
        <p className="font-medium text-sm text-blue-900 dark:text-blue-100">{title}</p>
        <p className="text-xs text-muted-foreground">{description}</p>
      </div>
      <Button asChild size="sm" variant="outline" className="shrink-0 ml-2">
        <Link href={href}>View</Link>
      </Button>
    </div>
  );
}

function VisitRow({ visit }: { visit: Visit }) {
  const sub = joinDisplayParts([
    visit.visit_type &&
      visit.visit_type.charAt(0).toUpperCase() + visit.visit_type.slice(1).replace(/_/g, " "),
    getVisitServiceClinicsDisplay({ clinic: visit.clinic, clinics: visit.clinics }),
  ]);

  return (
    <div className="flex items-center justify-between p-3 rounded-lg border border-muted bg-muted/30 hover:bg-muted/50 transition-colors">
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{visit.patient_name ?? "Patient"}</p>
        {sub ? <p className="text-xs text-muted-foreground truncate">{sub}</p> : null}
      </div>
      <div className="flex items-center gap-2 flex-shrink-0">
        <Badge
          variant="outline"
          className={
            visit.status === "in_progress"
              ? "border-blue-500 text-blue-600"
              : "border-amber-500 text-amber-600"
          }
        >
          {visit.status === "in_progress" ? "In Progress" : "Scheduled"}
        </Badge>
        <Button asChild variant="ghost" size="sm">
          <Link href="/medical-records/visits">
            Open
            <ArrowRight className="h-4 w-4 ml-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
