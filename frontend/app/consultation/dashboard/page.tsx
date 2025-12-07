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
  ArrowRight, History, Play, Award, Target, BarChart3, PieChart, Loader2,
  Pill, FlaskConical, Syringe, FileText, CalendarDays, Timer
} from "lucide-react";

// Doctor dashboard data will be loaded from API

// Placeholder for current doctor - will be loaded from API/auth context
const CURRENT_DOCTOR = {
  name: "Dr. Loading...",
  specialty: "General Practice",
  location: "Main Clinic",
  employeeId: "EMP001"
};

export default function DoctorDashboardPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<any>(null);
  
  // Dashboard data will be loaded from API
  useEffect(() => {
    // TODO: Load dashboard data from API
    setLoading(false);
  }, []);

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

  const totalClinicSessions = stats.clinicBreakdown.reduce((acc: number, c: { clinic: string; count: number }) => acc + c.count, 0);

  return (
    <DashboardLayout>
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        {/* Doctor Profile Header */}
        <Card className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center">
                  <User className="h-10 w-10 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">{CURRENT_DOCTOR.name}</h1>
                  <p className="text-emerald-100">{CURRENT_DOCTOR.specialty} • {CURRENT_DOCTOR.location}</p>
                  <p className="text-emerald-200 text-sm">{CURRENT_DOCTOR.employeeId}</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Link href="/consultation/start">
                  <Button className="bg-white text-emerald-600 hover:bg-emerald-50">
                    <Play className="h-4 w-4 mr-2" />
                    Start Consultation
                  </Button>
                </Link>
                <Link href="/consultation/history?scope=my">
                  <Button variant="outline" className="border-white text-white hover:bg-white/20">
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
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <Card className="border-l-4 border-l-blue-500">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.today.sessions}</p>
                <p className="text-xs text-muted-foreground">Sessions</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-emerald-500">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.today.patients}</p>
                <p className="text-xs text-muted-foreground">Patients</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-purple-500">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.today.avgDuration}</p>
                <p className="text-xs text-muted-foreground">Avg Min</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-pink-500">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-pink-600 dark:text-pink-400">{stats.today.prescriptions}</p>
                <p className="text-xs text-muted-foreground">Prescriptions</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-amber-500">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.today.labOrders}</p>
                <p className="text-xs text-muted-foreground">Lab Orders</p>
              </CardContent>
            </Card>
            <Card className="border-l-4 border-l-orange-500">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-orange-600 dark:text-orange-400">{stats.today.nursingOrders}</p>
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
                <CardDescription>{stats.week.sessions} sessions • {stats.week.patients} patients</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {stats.week.byDay.map((day: { day: string; count: number }) => (
                    <div key={day.day} className="flex items-center gap-3">
                      <span className="w-10 text-sm text-muted-foreground">{day.day}</span>
                      <div className="flex-1 bg-muted rounded-full h-6 overflow-hidden">
                        <div
                          className="bg-gradient-to-r from-blue-500 to-emerald-500 h-full rounded-full flex items-center justify-end pr-2"
                          style={{ width: `${(day.count / 20) * 100}%` }}
                        >
                          <span className="text-xs text-white font-medium">{day.count}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Monthly Summary */}
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-purple-500" />
                    This Month
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.month.sessions}</p>
                      <p className="text-xs text-muted-foreground">Sessions</p>
                    </div>
                    <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.month.patients}</p>
                      <p className="text-xs text-muted-foreground">Patients</p>
                    </div>
                    <div className="text-center p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-pink-600 dark:text-pink-400">{stats.month.prescriptions}</p>
                      <p className="text-xs text-muted-foreground">Prescriptions</p>
                    </div>
                    <div className="text-center p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                      <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.month.labOrders}</p>
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
                    {stats.clinicBreakdown.map((clinic: { clinic: string; count: number }) => (
                      <div key={clinic.clinic}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{clinic.clinic}</span>
                          <span className="text-muted-foreground">{clinic.count} ({Math.round((clinic.count / totalClinicSessions) * 100)}%)</span>
                        </div>
                        <Progress value={(clinic.count / totalClinicSessions) * 100} className="h-2" />
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Performance Metrics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Award className="h-5 w-5 text-amber-500" />
                  Performance Metrics
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-900/20 dark:to-yellow-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Award className="h-5 w-5 text-amber-500" />
                      <span className="text-2xl font-bold text-amber-600 dark:text-amber-400">{stats.performance.rating}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Rating</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-emerald-50 to-green-50 dark:from-emerald-900/20 dark:to-green-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Target className="h-5 w-5 text-emerald-500" />
                      <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{stats.performance.completionRate}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Completion</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-900/20 dark:to-cyan-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Timer className="h-5 w-5 text-blue-500" />
                      <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.performance.avgWaitTime}m</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Avg Wait</p>
                  </div>
                  <div className="text-center p-4 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                    <div className="flex items-center justify-center gap-1 mb-1">
                      <Users className="h-5 w-5 text-purple-500" />
                      <span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{stats.performance.patientSatisfaction}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground">Satisfaction</p>
                  </div>
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
                {stats.recentSessions.map((session: { id: string; patient: string; diagnosis: string; duration: number; time: string }) => (
                  <div key={session.id} className="p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors cursor-pointer">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium text-sm">{session.patient}</p>
                        <p className="text-xs text-muted-foreground">{session.diagnosis}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">{session.duration}m</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />{session.time}
                    </p>
                  </div>
                ))}
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
                {stats.upcomingFollowups.map((followup: { patient: string; reason: string; date: string }, idx: number) => (
                  <div key={idx} className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                    <div className="w-10 h-10 bg-blue-100 dark:bg-blue-800 rounded-full flex items-center justify-center">
                      <User className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div className="flex-1">
                      <p className="font-medium text-sm">{followup.patient}</p>
                      <p className="text-xs text-muted-foreground">{followup.reason}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-medium text-blue-600 dark:text-blue-400">
                        {new Date(followup.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                      </p>
                    </div>
                  </div>
                ))}
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
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}

