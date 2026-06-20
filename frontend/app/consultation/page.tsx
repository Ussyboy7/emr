"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Stethoscope, Pill, FlaskConical, Clock, Activity, Plus, Eye, Hospital, ClipboardList, AlertCircle, ScanLine } from 'lucide-react';
import { peekServerTodayApi } from "@/lib/dates";
import { useRouter } from 'next/navigation';
import { consultationService, radiologyService } from '@/lib/services';
import { useConsultationPageAuth } from '@/hooks/use-consultation-page-auth';
import { isAuthenticationError } from '@/lib/auth-errors';

interface ConsultationStats {
  totalConsultations: number;
  activeSessions: number;
  prescriptions: number;
  labOrders: number;
  radiologyOrders: number;
  recentSessions: any[];
}

export default function ConsultationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { ready, currentUser, handleAuthError } = useConsultationPageAuth();

  const [stats, setStats] = useState<ConsultationStats>({
    totalConsultations: 0,
    activeSessions: 0,
    prescriptions: 0,
    labOrders: 0,
    radiologyOrders: 0,
    recentSessions: [],
  });

  useEffect(() => {
    if (!ready) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);

        const today = peekServerTodayApi();
        const doctorId = currentUser?.id ? Number(currentUser.id) : undefined;

        const [statsRes, radiologyRes, recentRes] = await Promise.all([
          consultationService.getStats(doctorId),
          radiologyService.getOrders({
            date: today,
            doctor: doctorId != null ? String(doctorId) : undefined,
            page_size: 1,
          }),
          consultationService.getSessions({
            date: today,
            doctor: doctorId,
            ordering: '-started_at',
            page_size: 3,
          }),
        ]);

        setStats({
          totalConsultations: statsRes.today.sessions,
          activeSessions: statsRes.today.active,
          prescriptions: statsRes.today.prescriptions,
          labOrders: statsRes.today.lab_orders,
          radiologyOrders: radiologyRes.count ?? 0,
          recentSessions: recentRes.results || [],
        });
      } catch (err) {
        console.error('Error loading consultation dashboard:', err);
        if (isAuthenticationError(err)) {
          handleAuthError(err);
        } else {
          setError('Failed to load consultation dashboard');
        }
      } finally {
        setLoading(false);
      }
    };

    void fetchData();
  }, [ready, currentUser?.id, handleAuthError]);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {error && (
          <Card className="border-red-500/50 bg-red-500/10">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="h-5 w-5 text-red-500 flex-shrink-0" />
              <div>
                <p className="font-medium text-red-700 dark:text-red-400">{error}</p>
                <p className="text-sm text-red-600 dark:text-red-300 mt-1">Please refresh the page or contact support if the issue persists.</p>
              </div>
            </CardContent>
          </Card>
        )}

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
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-emerald-600 hover:bg-emerald-50 shadow-md"
                  onClick={() => router.push('/consultation/start')}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Start Consultation
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => router.push('/consultation/history?scope=my')}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  My Sessions
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Today's Overview
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Loading...</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          <p className="text-2xl sm:text-3xl font-bold text-muted-foreground">--</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className={`border-l-4 ${stats.totalConsultations > 0 ? 'border-l-emerald-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Consultations</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Stethoscope className={`h-5 w-5 ${stats.totalConsultations > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.totalConsultations > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-green-600 dark:text-green-400'}`}>{stats.totalConsultations}</p>
                        </div>
                        {stats.totalConsultations === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No consultations</p>
                        ) : (
                          <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">Sessions today</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.radiologyOrders === 0 ? 'border-l-green-500' : 'border-l-cyan-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Radiology Orders</p>
                        <div className="flex items-center gap-2 mt-1">
                          <ScanLine className={`h-5 w-5 ${stats.radiologyOrders === 0 ? 'text-green-500 dark:text-green-400' : 'text-cyan-500 dark:text-cyan-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.radiologyOrders === 0 ? 'text-green-600 dark:text-green-400' : 'text-cyan-600 dark:text-cyan-400'}`}>{stats.radiologyOrders}</p>
                        </div>
                        {stats.radiologyOrders === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No radiology orders</p>
                        ) : (
                          <p className="text-xs text-cyan-600 dark:text-cyan-400 mt-1">Imaging requested</p>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.prescriptions === 0 ? 'border-l-green-500' : 'border-l-purple-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Prescriptions</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Pill className={`h-5 w-5 ${stats.prescriptions === 0 ? 'text-green-500 dark:text-green-400' : 'text-purple-500 dark:text-purple-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.prescriptions === 0 ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>{stats.prescriptions}</p>
                        </div>
                        {stats.prescriptions === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No prescriptions</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${stats.labOrders === 0 ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Lab Orders</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FlaskConical className={`h-5 w-5 ${stats.labOrders === 0 ? 'text-green-500 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${stats.labOrders === 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{stats.labOrders}</p>
                        </div>
                        {stats.labOrders === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No lab orders</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>

        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button onClick={() => router.push('/consultation/start')} className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <span className="text-xs sm:text-sm font-medium">Start New Consultation</span>
              <span className="text-[10px] sm:text-xs opacity-90">Begin patient consultation</span>
            </Button>
            <Button onClick={() => router.push('/consultation/history?scope=my')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-emerald-500/30 hover:bg-emerald-500/10 border-l-4 border-l-emerald-500">
              <Eye className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium">View My Sessions</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Review completed consultations</span>
            </Button>
            <Button onClick={() => router.push('/consultation/wards')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-blue-500/30 hover:bg-blue-500/10 border-l-4 border-l-blue-500">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Patient Queue</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Manage waiting patients</span>
            </Button>
            <Button onClick={() => router.push('/consultation/referrals')} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-purple-500/30 hover:bg-purple-500/10 border-l-4 border-l-purple-500">
              <Hospital className="h-6 w-6 text-purple-500 dark:text-purple-400" />
              <span className="text-sm font-medium">Clinical Reports</span>
              <span className="text-xs text-muted-foreground">Access patient reports</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Stethoscope className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                  Recent Consultations
                </CardTitle>
                <Badge variant="default" className={stats.totalConsultations > 0 ? "bg-emerald-500/10 text-emerald-700 border-emerald-500/20" : "bg-green-500/10 text-green-700 border-green-500/20"}>
                  {stats.totalConsultations > 0 ? `${stats.totalConsultations} Today` : "No Consultations"}
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : stats.recentSessions.length > 0 ? (
                  <div className="space-y-2">
                    {stats.recentSessions.map((session: any) => (
                      <div key={session.id} className="flex items-center justify-between p-3 rounded-lg border border-muted bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm">{session.patient_name ?? ''}</p>
                          <p className="text-xs text-muted-foreground">
                            Session {session.session_id || session.id} • {session.room_name || 'Unknown Room'}
                          </p>
                        </div>
                        <Badge variant="outline" className={
                          session.status === 'completed' ? 'border-green-500 text-green-600' : 'border-blue-500 text-blue-600'
                        }>
                          {session.status === 'completed' ? 'Completed' : 'In Progress'}
                        </Badge>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <Stethoscope className="h-8 w-8 mx-auto mb-2 text-muted-foreground/60" />
                    <p className="text-muted-foreground text-sm mb-2">No consultations today</p>
                    <p className="text-xs text-muted-foreground">Start a consultation from the queue or when a patient is sent to your room.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                Today's Summary
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm font-medium">Total Consultations:</span>
                    <Badge variant="outline">{stats.totalConsultations}</Badge>
                  </div>
                   <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                     <span className="text-sm font-medium">Radiology Orders:</span>
                     <Badge variant="outline">{stats.radiologyOrders}</Badge>
                   </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm font-medium">Prescriptions:</span>
                    <Badge variant="outline" className="text-purple-600">{stats.prescriptions}</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 rounded-lg bg-muted/30">
                    <span className="text-sm font-medium">Lab Orders:</span>
                    <Badge variant="outline" className="text-amber-600">{stats.labOrders}</Badge>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
