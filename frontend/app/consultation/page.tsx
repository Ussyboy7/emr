"use client";
// Updated to match Nursing dashboard exactly - v2

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Stethoscope, Users, Pill, FlaskConical, Heart, Calendar, Clock, CheckCircle2, ArrowRight, UserCheck, Activity, Plus, Eye, Hospital, ClipboardList } from 'lucide-react';
import Link from 'next/link';

export default function ConsultationPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-emerald-500 to-teal-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <Stethoscope className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Consultation Department</h1>
                  <p className="text-emerald-100">Digital consultation and patient management</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-white text-emerald-600 hover:bg-emerald-50"
                  onClick={() => window.location.href = '/consultation/new'}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Start Consultation
                </Button>
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/20"
                  onClick={() => window.location.href = '/consultation/sessions'}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  My Sessions
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Today's Overview */}
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
                          <p className="text-3xl font-bold text-muted-foreground">--</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className={`border-l-4 ${0 > 0 ? 'border-l-emerald-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Consultations</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Stethoscope className={`h-5 w-5 ${0 > 0 ? 'text-emerald-500 dark:text-emerald-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-3xl font-bold ${0 > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-green-600 dark:text-green-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No consultations</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Patients Seen</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Users className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`} />
                          <p className={`text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No patients seen</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-purple-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Prescriptions</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Pill className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-purple-500 dark:text-purple-400'}`} />
                          <p className={`text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No prescriptions</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Lab Orders</p>
                        <div className="flex items-center gap-2 mt-1">
                          <FlaskConical className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'}`} />
                          <p className={`text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
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

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500 dark:text-blue-400" />
            Quick Actions
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Button onClick={() => window.location.href = '/consultation/new'} className="h-auto py-6 flex flex-col items-center gap-3 bg-gradient-to-br from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <Plus className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Start New Consultation</span>
              <span className="text-xs opacity-90">Begin patient consultation</span>
            </Button>
            <Button onClick={() => window.location.href = '/consultation/sessions'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-emerald-500/30 hover:bg-emerald-500/10 border-l-4 border-l-emerald-500">
              <Eye className="h-6 w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-sm font-medium">View My Sessions</span>
              <span className="text-xs text-muted-foreground">Review completed consultations</span>
            </Button>
            <Button onClick={() => window.location.href = '/consultation/queue'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-blue-500/30 hover:bg-blue-500/10 border-l-4 border-l-blue-500">
              <ClipboardList className="h-6 w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-sm font-medium">Patient Queue</span>
              <span className="text-xs text-muted-foreground">Manage waiting patients</span>
            </Button>
            <Button onClick={() => window.location.href = '/consultation/reports'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-purple-500/30 hover:bg-purple-500/10 border-l-4 border-l-purple-500">
              <Hospital className="h-6 w-6 text-purple-500 dark:text-purple-400" />
              <span className="text-sm font-medium">Clinical Reports</span>
              <span className="text-xs text-muted-foreground">Access patient reports</span>
            </Button>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending Tasks */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500 dark:text-amber-400" />
                  Pending Tasks
                </CardTitle>
                <Badge variant="default" className="bg-green-500/10 text-green-700 border-green-500/20">
                  ✓ All Complete
                </Badge>
              </CardHeader>
              <CardContent className="space-y-3">
                {loading ? (
                  <div className="flex items-center justify-center p-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    <p className="text-muted-foreground text-sm mb-2">All tasks completed!</p>
                    <p className="text-xs text-muted-foreground">Great work staying on top of patient care.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Activity */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-emerald-500 dark:text-emerald-400" />
                Recent Activity
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No recent activity</p>
                  <p className="text-xs text-muted-foreground">Activity will appear here as you work</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}