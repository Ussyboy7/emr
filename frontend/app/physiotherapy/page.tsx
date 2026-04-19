"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Dumbbell, Calendar, Clock, CheckCircle2, Activity, ArrowRight, UserCheck, ClipboardList, TrendingUp, Plus } from 'lucide-react';
import Link from 'next/link';

export default function PhysiotherapyPage() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setLoading(false), 1000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-green-500 to-emerald-600 text-white border-0">
          <CardContent className="p-4 sm:p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-12 h-12 sm:w-16 sm:h-16 bg-white/20 rounded-full flex items-center justify-center flex-shrink-0">
                  <Dumbbell className="h-6 w-6 sm:h-8 sm:w-8 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-xl sm:text-2xl font-bold">Physiotherapy Department</h1>
                  <p className="text-sm sm:text-base text-green-100">Rehabilitation services, therapy planning, and patient recovery tracking</p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  className="bg-white text-green-600 hover:bg-green-50 shadow-md"
                  onClick={() => window.location.href = '/physiotherapy/sessions'}
                >
                  <Calendar className="h-4 w-4 mr-2" />
                  Schedule Session
                </Button>
                <Button
                  variant="outline"
                  className="border-2 border-white/90 text-white hover:bg-white/30 hover:border-white dark:border-white dark:text-white dark:hover:bg-white/20 shadow-md backdrop-blur-sm bg-white/10"
                  onClick={() => window.location.href = '/physiotherapy/patients'}
                >
                  <UserCheck className="h-4 w-4 mr-2" />
                  Patient List
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
                          <p className="text-2xl sm:text-3xl font-bold text-muted-foreground">--</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <Card className={`border-l-4 ${0 > 0 ? 'border-l-amber-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Pending Sessions</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className={`h-5 w-5 ${0 > 0 ? 'text-amber-500 dark:text-amber-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${0 > 0 ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">All caught up!</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Patients</p>
                        <div className="flex items-center gap-2 mt-1">
                          <UserCheck className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No active patients</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Completed Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No sessions completed</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${0 === 0 ? 'border-l-green-500' : 'border-l-purple-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Scheduled Tomorrow</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Calendar className={`h-5 w-5 ${0 === 0 ? 'text-green-500 dark:text-green-400' : 'text-purple-500 dark:text-purple-400'}`} />
                          <p className={`text-2xl sm:text-3xl font-bold ${0 === 0 ? 'text-green-600 dark:text-green-400' : 'text-purple-600 dark:text-purple-400'}`}>{0}</p>
                        </div>
                        {0 === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No sessions scheduled</p>
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
            <Button onClick={() => window.location.href = '/physiotherapy/sessions/new'} className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 bg-gradient-to-br from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <Plus className="h-5 w-5 sm:h-6 sm:w-6" />
              </div>
              <span className="text-xs sm:text-sm font-medium">New Session</span>
              <span className="text-[10px] sm:text-xs opacity-90">Start therapy session</span>
            </Button>
            <Button onClick={() => window.location.href = '/physiotherapy/patients'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-green-500/30 hover:bg-green-500/10 border-l-4 border-l-green-500">
              <UserCheck className="h-5 w-5 sm:h-6 sm:w-6 text-green-500 dark:text-green-400" />
              <span className="text-xs sm:text-sm font-medium">Patient Progress</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Track recovery progress</span>
            </Button>
            <Button onClick={() => window.location.href = '/physiotherapy/pool-queue'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-green-500/30 hover:bg-green-500/10 border-l-4 border-l-blue-500">
              <ClipboardList className="h-5 w-5 sm:h-6 sm:w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-xs sm:text-sm font-medium">Pool Queue</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Manage therapy pool</span>
            </Button>
            <Button onClick={() => window.location.href = '/physiotherapy/reports'} variant="outline" className="h-auto py-4 sm:py-6 flex flex-col items-center gap-2 sm:gap-3 border-green-500/30 hover:bg-green-500/10 border-l-4 border-l-emerald-500">
              <Activity className="h-5 w-5 sm:h-6 sm:w-6 text-emerald-500 dark:text-emerald-400" />
              <span className="text-xs sm:text-sm font-medium">Exercise Plans</span>
              <span className="text-[10px] sm:text-xs text-muted-foreground">Create therapy plans</span>
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
                    <p className="text-xs text-muted-foreground">Great work staying on top of physiotherapy operations.</p>
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