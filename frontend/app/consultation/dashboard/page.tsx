"use client";

import { useState, useEffect, useMemo } from "react";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import Link from "next/link";
import {
  User, Calendar, Clock, Stethoscope, TrendingUp, Activity, CheckCircle2, Users,
  ArrowRight, History, Play, BarChart3, PieChart, Loader2,
  Pill, FlaskConical, Syringe, FileText, Timer, Bed, Hospital
} from "lucide-react";
import { consultationService, wardService } from "@/lib/services";
import { toast } from "sonner";
import { useCurrentUser } from "@/hooks/use-current-user";

export default function DoctorDashboardPage() {
  const { currentUser: user } = useCurrentUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  const [wards, setWards] = useState<any[]>([]);
  const [currentAdmissions, setCurrentAdmissions] = useState<any[]>([]);
  
  // Dashboard data will be loaded from API
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);
      // Get current user's doctor ID if available
      const doctorId = user?.id ? Number(user.id) : undefined;

      // Load all data in parallel
      const [statsResult, wardsResult, admissionsResult] = await Promise.allSettled([
        consultationService.getStats(doctorId),
        wardService.getWards(),
        wardService.getAdmissions({ status: 'admitted' }),
      ]);

      // Process stats
      if (statsResult.status === 'fulfilled') {
        setStats(statsResult.value);
      } else {
        console.error('Failed to load stats:', statsResult.reason);
      }

      // Process wards
      if (wardsResult.status === 'fulfilled') {
        setWards(wardsResult.value.results || []);
      } else {
        console.error('Failed to load wards:', wardsResult.reason);
      }

      // Process admissions
      if (admissionsResult.status === 'fulfilled') {
        setCurrentAdmissions(admissionsResult.value.results || []);
      } else {
        console.error('Failed to load admissions:', admissionsResult.reason);
      }
    } catch (err: any) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message || 'Failed to load dashboard data');
      toast.error('Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  const CURRENT_DOCTOR = {
    name: user?.name || user?.username || "Dr. Loading...",
    specialty: user?.systemRole || "GOPD Practice",
    location: "Main Clinic", // clinic_name not available in User type
    employeeId: user?.employeeId || "EMP001"
  };

  if (loading || !stats) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading your dashboard...</p>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Ensure all nested properties have defaults (backend returns snake_case)
  const safeStats = {
    today: {
      sessions: stats.today?.sessions || 0,
      patients: stats.today?.patients || 0,
      completed: stats.today?.completed || 0,
      avg_duration: stats.today?.avg_duration || 0,
      prescriptions: stats.today?.prescriptions || 0,
      lab_orders: stats.today?.lab_orders || 0,
      nursing_orders: stats.today?.nursing_orders || 0,
    },
    week: {
      sessions: stats.week?.sessions || 0,
      patients: stats.week?.patients || 0,
      byDay: stats.week?.by_day || [], // Backend returns by_day
    },
    month: {
      sessions: stats.month?.sessions || 0,
      patients: stats.month?.patients || 0,
      prescriptions: stats.month?.prescriptions || 0,
      lab_orders: stats.month?.lab_orders || 0,
    },
    clinic_breakdown: stats.clinic_breakdown || [],
    recent_sessions: stats.recent_sessions || [],
  };

  
  // Safely calculate total clinic sessions with null checks
  const totalClinicSessions = safeStats.clinic_breakdown.reduce((acc: number, c: { clinic: string; count: number }) => acc + c.count, 0);

  // Separate recent sessions from upcoming follow-ups
  const recentSessions = safeStats.recent_sessions.filter((session: any) => {
    // Consider sessions from today and yesterday as recent
    const sessionDate = new Date(session.created_at || Date.now());
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    return sessionDate >= yesterday;
  });

  const upcomingFollowUps = safeStats.recent_sessions.filter((session: any) => {
    // Consider sessions that need follow-up (you can customize this logic)
    // For now, show sessions that are not from today
    const sessionDate = new Date(session.created_at || Date.now());
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return sessionDate < today;
  });

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Doctor Profile Header */}
        <Card className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Stethoscope className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Consultation Department</h1>
                  <p className="text-sm sm:text-base text-emerald-100">Digital consultation and patient management</p>
                  <p className="text-xs sm:text-sm text-emerald-200">Welcome back, {CURRENT_DOCTOR.name}</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link href="/consultation/start">
                  <Button className="bg-white text-emerald-600 hover:bg-emerald-50 shadow-md">
                    <Play className="h-4 w-4 mr-2" />
                    Start Consultation
                  </Button>
                </Link>
                <Link href="/consultation/history?scope=my">
                  <Button variant="outline" className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10">
                    <History className="h-4 w-4 mr-2" />
                    My Sessions
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Quick Stats - Today */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Calendar className="h-5 w-5 text-blue-500" />
            Today's Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <Activity className="h-5 w-5 text-blue-500 mr-2" />
                  <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{safeStats.today.sessions}</p>
                </div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <p className="text-xs text-muted-foreground">Consultations</p>
                  {safeStats.today.sessions > 0 && (
                    <div className="flex items-center text-xs text-green-600 dark:text-green-400">
                      <TrendingUp className="h-3 w-3" />
                      +8%
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <Users className="h-5 w-5 text-emerald-500 mr-2" />
                  <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{safeStats.today.patients}</p>
                </div>
                <div className="flex items-center justify-center gap-1 mb-1">
                  <p className="text-xs text-muted-foreground">Patients</p>
                  {safeStats.today.patients > 0 && (
                    <div className="flex items-center text-xs text-green-600 dark:text-green-400">
                      <TrendingUp className="h-3 w-3" />
                      +15%
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-pink-500">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <FileText className="h-5 w-5 text-pink-500 mr-2" />
                  <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{safeStats.today.prescriptions}</p>
                </div>
                <p className="text-xs text-muted-foreground">Prescriptions</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <Activity className="h-5 w-5 text-amber-500 mr-2" />
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{safeStats.today.lab_orders}</p>
                </div>
                <p className="text-xs text-muted-foreground">Lab Orders</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-4 text-center">
                <div className="flex items-center justify-center mb-2">
                  <Stethoscope className="h-5 w-5 text-orange-500 mr-2" />
                  <p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{safeStats.today.nursing_orders}</p>
                </div>
                <p className="text-xs text-muted-foreground">Nursing</p>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Main Content Grid */}
        <div className="grid lg:grid-cols-3 gap-6">
          {/* Left Column - Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Weekly Activity */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5 text-blue-500" />
                  This Week's Activity
                </CardTitle>
                <CardDescription>{safeStats.week.sessions} consultations • {safeStats.week.patients} patients</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {safeStats.week.byDay.length > 0 ? (
                    safeStats.week.byDay.map((day: { day: string; count: number }) => (
                    <div key={day.day} className="flex items-center gap-3">
                      <span className="w-10 text-sm text-muted-foreground">{day.day}</span>
                      <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${Math.min((day.count / Math.max(...safeStats.week.byDay.map((d: any) => d.count), 1)) * 100, 100)}%` }}
                        >
                          <span className="text-xs text-white font-medium">{day.count}</span>
                        </div>
                      </div>
                    </div>
                    ))
                  ) : (
                    <div className="text-center py-4 text-muted-foreground text-sm">No data for this week</div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Monthly Summary */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Calendar className="h-4 w-4 text-purple-500" />
                    This Month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{safeStats.month.sessions}</p>
                      <p className="text-xs text-muted-foreground">Consultations</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{safeStats.month.patients}</p>
                      <p className="text-xs text-muted-foreground">Patients</p>
                    </div>
                    <div className="text-center p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{safeStats.month.prescriptions}</p>
                      <p className="text-xs text-muted-foreground">Prescriptions</p>
                    </div>
                    <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{safeStats.month.lab_orders}</p>
                      <p className="text-xs text-muted-foreground">Lab Orders</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <PieChart className="h-4 w-4 text-emerald-500" />
                    By Clinic
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {safeStats.clinic_breakdown.length > 0 ? (
                      safeStats.clinic_breakdown.map((clinic: { clinic: string; count: number }) => (
                        <div key={clinic.clinic}>
                          <div className="flex justify-between text-sm mb-1">
                            <span>{clinic.clinic}</span>
                            <span className="text-muted-foreground">
                              {clinic.count} ({totalClinicSessions > 0 ? Math.round((clinic.count / totalClinicSessions) * 100) : 0}%)
                            </span>
                          </div>
                          <Progress value={totalClinicSessions > 0 ? (clinic.count / totalClinicSessions) * 100 : 0} className="h-2" />
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4 text-muted-foreground text-sm">No clinic data available</div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Ward Overview */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Hospital className="h-5 w-5 text-cyan-500" />
                  Ward Overview
                </CardTitle>
                <CardDescription>Current ward status and bed availability</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {wards.length > 0 ? (
                    wards.map((ward) => (
                      <div key={ward.id} className="p-4 bg-gradient-to-br from-cyan-50 to-blue-50 dark:from-cyan-900/20 dark:to-blue-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                        <div className="flex items-center gap-2 mb-2">
                          <Bed className="h-4 w-4 text-cyan-500" />
                          <span className="font-medium text-sm text-cyan-700 dark:text-cyan-300">{ward.name}</span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Available</span>
                            <span className="font-medium text-emerald-600 dark:text-emerald-400">{ward.available_beds || 0}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Occupied</span>
                            <span className="font-medium text-rose-600 dark:text-rose-400">{ward.occupied_beds || 0}</span>
                          </div>
                          <div className="flex justify-between text-xs">
                            <span className="text-muted-foreground">Total</span>
                            <span className="font-medium">{ward.total_beds}</span>
                          </div>
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="col-span-4 text-center py-4 text-muted-foreground text-sm">
                      No ward data available
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Recent & Upcoming */}
          <div className="space-y-6">
            {/* Recent Sessions */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    <History className="h-4 w-4 text-emerald-500" />
                    Recent Sessions
                  </CardTitle>
                  <Link href="/consultation/history?scope=my">
                    <Button variant="ghost" size="sm" className="text-emerald-600 hover:text-emerald-700">
                      View All <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentSessions.length > 0 ? (
                  recentSessions.map((session: { id: number; patient: string; diagnosis: string; duration: number; time: string }) => (
                  <div key={session.id} className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="font-medium text-sm">{session.patient}</p>
                          <Badge variant="secondary" className="text-xs px-2 py-0.5">
                            Completed
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{session.diagnosis}</p>
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge variant="outline" className="text-xs">{session.duration}m</Badge>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{session.time}
                    </p>
                  </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Clock className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm mb-2">No recent consultations today</p>
                    <Link href="/consultation/start">
                      <Button variant="outline" size="sm">
                        <Play className="h-3 w-3 mr-2" />
                        Start your first consultation
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Upcoming Follow-ups */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-blue-500" />
                  Upcoming Follow-ups
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {upcomingFollowUps.length > 0 ? (
                  upcomingFollowUps.slice(0, 3).map((session: any) => (
                    <div key={session.id} className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                      <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
                        <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">{session.patient}</p>
                        <p className="text-xs text-muted-foreground">{session.diagnosis}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="outline" className="text-xs">
                          {session.time}
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                    <p className="text-muted-foreground text-sm mb-2">No upcoming follow-ups</p>
                    <p className="text-xs text-muted-foreground">Follow-ups will appear here when scheduled</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Link href="/consultation/start" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <Play className="h-4 w-4 mr-2 text-emerald-500" />
                    Start New Consultation
                  </Button>
                </Link>
                <Link href="/consultation/history?scope=my" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <History className="h-4 w-4 mr-2 text-purple-500" />
                    View My Sessions
                  </Button>
                </Link>
                <Link href="/consultation/history" className="block">
                  <Button variant="outline" className="w-full justify-start">
                    <FileText className="h-4 w-4 mr-2 text-blue-500" />
                    All Consultations
                  </Button>
                </Link>
              </CardContent>
            </Card>

            {/* Current Ward Admissions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Bed className="h-4 w-4 text-rose-500" />
                  Ward Admissions
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {currentAdmissions.length > 0 ? (
                  currentAdmissions.slice(0, 3).map((admission) => (
                    <div key={admission.id} className="flex items-center gap-3 p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-100 dark:border-rose-800">
                      <div className="w-8 h-8 bg-rose-100 dark:bg-rose-800 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{admission.patient_name}</p>
                        <p className="text-xs text-muted-foreground">{admission.ward_name}</p>
                      </div>
                      <div className="text-right">
                        <Badge variant="secondary" className="text-xs">
                          {admission.length_of_stay || 0}d
                        </Badge>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-4 text-muted-foreground text-sm">
                    No current admissions
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

