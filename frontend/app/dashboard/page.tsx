"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatDisplayDateMedium, formatDisplayTime } from '@/lib/dates';
import { toast } from 'sonner';
import {
  Users, Stethoscope, TestTube, Pill, Calendar, Clock, Activity,
  AlertTriangle, UserPlus,
  Play, ArrowRight,
  FileText, Loader2
} from 'lucide-react';
import { getOperationalDashboard, type OperationalDashboardPayload } from '@/lib/services/dashboard-service';
import { formatFacilityMetric } from './facility-performance';
import { useRouter, useSearchParams } from 'next/navigation';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useReloadOnFocus } from '@/hooks/use-reload-on-focus';
import { getHomeRouteForUser, isPathAllowedByPages } from '@/lib/home-route';
import { getServerToday } from '@/lib/utils/serverTime';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { ClinicFilter } from '@/components/shared/ClinicFilter';
import { clinicGuardRowClass } from '@/lib/clinic-guard';
import { useClinic } from '@/hooks/use-clinic';

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const clinicIdParam = searchParams.get('clinic_id');
  const { currentUser, hydrated } = useCurrentUser();
  const { activeClinicId: guardActiveClinicId } = useClinic();
  const homeRoute = getHomeRouteForUser(currentUser);

  // Super admin can view global dashboard.
  // Non-superusers can view it only if '/dashboard' is explicitly granted in their pages permissions.
  useEffect(() => {
    if (!hydrated) return;
    if (!currentUser) {
      router.replace("/login");
      return;
    }
    if (currentUser.isSuperuser) return;
    if (isPathAllowedByPages("/dashboard", currentUser.permissions ?? [], currentUser.deniedPages ?? [])) return;
    router.replace(homeRoute || "/no-access");
  }, [currentUser, hydrated, homeRoute, router]);

  const [todayStats, setTodayStats] = useState({
    patientsToday: 0,
    patientsChange: 0,
    consultations: 0,
    consultationsChange: 0,
    labTests: 0,
    labTestsChange: 0,
    prescriptions: 0,
    prescriptionsChange: 0,
  });
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<any[]>([]);
  const [facilityPerformance, setFacilityPerformance] = useState<OperationalDashboardPayload['facilityPerformance']>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load dashboard data
  const loadDashboardData = useCallback(async (opts: { silent?: boolean } = {}) => {
    try {
      if (!opts.silent) {
        setLoading(true);
        setError(null);
      }

      let today: string | undefined;
      try {
        today = await getServerToday();
      } catch {
        today = undefined;
      }

      const data = await getOperationalDashboard(
        clinicIdParam ? { date: today, clinic_id: clinicIdParam } : today ? { date: today } : undefined,
      );

      setTodayStats(data.todayStats);
      setRecentPatients(
        data.recentPatients.map((patient) => ({
          ...patient,
          time: formatDisplayTime(patient.time),
        })),
      );
      setUpcomingAppointments(data.upcomingAppointments);
      setFacilityPerformance(data.facilityPerformance);
    } catch (err: any) {
      if (!opts.silent) {
        setError(err.message || 'Failed to load dashboard data');
        toast.error('Failed to load dashboard. Please try again.');
      }
      console.error('Error loading dashboard:', err);
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }, [clinicIdParam]);

  useEffect(() => {
    // Don't fire 10 parallel API calls before auth state has hydrated — otherwise
    // a sign-in race can leave the access token momentarily unavailable and the
    // first apiFetch will throw "Authentication required" before tokens settle.
    if (!hydrated) return;
    if (!currentUser) return;
    loadDashboardData();
  }, [loadDashboardData, hydrated, currentUser]);

  useReloadOnFocus(() => loadDashboardData({ silent: true }), {
    enabled: hydrated && !!currentUser,
  });

  if (loading) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <div className="flex items-center justify-center min-h-[400px]">
            <div className="text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading dashboard...</p>
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  if (error) {
    return (
      <DashboardLayout>
        <div className="container mx-auto p-4 sm:p-6">
          <Card className="border-red-500/50">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <Button onClick={() => loadDashboardData()}>Retry</Button>
            </CardContent>
          </Card>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground">EMR Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              {formatDisplayDateMedium(new Date())}
            </p>
          </div>
          <div className="flex gap-2">
            <ClinicFilter />
            <Button asChild variant="outline">
              <Link href="/medical-records/patients/new"><UserPlus className="h-4 w-4 mr-2" />Register Patient</Link>
            </Button>
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <Link href="/consultation/start"><Play className="h-4 w-4 mr-2" />Start Consultation</Link>
            </Button>
          </div>
        </div>

        {/* Today's Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-blue-500" />Today's Activity</CardTitle>
            <CardDescription>Completed and recorded work today</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Users className="h-6 w-6 text-blue-500" />
                <div>
                  <p className="text-xl font-bold">{todayStats.patientsToday}</p>
                  <p className="text-xs text-muted-foreground">Patients seen</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Stethoscope className="h-6 w-6 text-emerald-500" />
                <div>
                  <p className="text-xl font-bold">{todayStats.consultations}</p>
                  <p className="text-xs text-muted-foreground">Consultations</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <TestTube className="h-6 w-6 text-amber-500" />
                <div>
                  <p className="text-xl font-bold">{todayStats.labTests}</p>
                  <p className="text-xs text-muted-foreground">Lab tests</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50">
                <Pill className="h-6 w-6 text-violet-500" />
                <div>
                  <p className="text-xl font-bold">{todayStats.prescriptions}</p>
                  <p className="text-xs text-muted-foreground">Prescriptions dispensed</p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Facility Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-indigo-500" />Facility Performance</CardTitle>
            <CardDescription>How each facility performed today</CardDescription>
          </CardHeader>
          <CardContent>
            {facilityPerformance.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No data for this period</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {facilityPerformance.map((f) => (
                  <div key={f.name} className="p-3 rounded-lg bg-muted/50">
                    <p className="font-medium text-sm mb-2">{f.name}</p>
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-muted-foreground">Visits</p>
                        <p className="text-lg font-bold">{f.visits}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Completion</p>
                        <p className="text-lg font-bold">{formatFacilityMetric(f.completionRate, 'percent')}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Avg consult</p>
                        <p className="text-lg font-bold">{formatFacilityMetric(f.avgConsultationTime)}</p>
                      </div>
                      <div>
                        <p className="text-muted-foreground">Lab / Rx</p>
                        <p className="text-lg font-bold">{f.labTestsProcessed} / {f.prescriptionsDispensed}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Patients */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-blue-500" />Recent Patients</CardTitle>
              <CardDescription>Patients seen today</CardDescription>
            </div>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/medical-records/patients">View All <ArrowRight className="h-4 w-4 ml-1" /></Link>
            </Button>
          </CardHeader>
          <CardContent>
            {recentPatients.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Users className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No patients seen today</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPatients.map((patient, index) => {
                  const guardClass = clinicGuardRowClass(patient, guardActiveClinicId);
                  return (
                    <div key={patient.visitId ?? `${patient.id}-${index}`} className={`flex items-center justify-between p-3 rounded-lg hover:bg-muted transition-colors ${guardClass || 'bg-muted/50'}`}>
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-medium text-sm">
                          {patient.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                        </div>
                        <div>
                          <p className="font-medium">{patient.name}</p>
                          <p className="text-xs text-muted-foreground">{joinDisplayParts([patient.id, patient.clinic, patient.time])}</p>
                        </div>
                      </div>
                      <Badge variant={
                        patient.status === 'Completed' ? 'default' :
                        patient.status === 'In Consultation' ? 'secondary' :
                        'outline'
                      }>{patient.status}</Badge>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming Appointments */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-teal-500" />Upcoming</CardTitle>
            <CardDescription>Next appointments</CardDescription>
          </CardHeader>
          <CardContent>
            {upcomingAppointments.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Calendar className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>No upcoming appointments</p>
              </div>
            ) : (
              <div className="space-y-3">
                {upcomingAppointments.map((apt, i) => (
                  <div key={i} className="p-3 border rounded-lg">
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium text-sm">{apt.patient}</span>
                      <Badge variant="outline" className="text-xs">{apt.type}</Badge>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      <span>{apt.time}</span>
                      <span>•</span>
                      <span>{apt.clinic}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
