"use client";

import React, { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, FileText, Search, Plus, Users, Activity, Clock, CheckCircle2, UserCheck, ArrowRight, Link as LinkIcon } from 'lucide-react';
import Link from 'next/link';

interface Visit {
  id: number;
  patient: string;
  type: string;
  department: string;
  status: string;
  time: string;
}

interface Patient {
  id: number;
  name: string;
  status: string;
  age: number;
  gender: string;
}

export default function MedicalRecordsPage() {
  const [loading, setLoading] = useState(true);
  const [totalPatients, setTotalPatients] = useState(0);
  const [activeVisitsToday, setActiveVisitsToday] = useState(0);
  const [scheduledToday, setScheduledToday] = useState(0);
  const [completedToday, setCompletedToday] = useState(0);
  const [activeVisits, setActiveVisits] = useState<Visit[]>([]);
  const [recentPatients, setRecentPatients] = useState<Patient[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Simulate API calls - replace with actual API calls
        setTotalPatients(125);
        setActiveVisitsToday(8);
        setScheduledToday(12);
        setCompletedToday(15);

        setActiveVisits([
          {
            id: 1,
            patient: 'John Doe',
            type: 'Consultation',
            department: 'Medical Records',
            status: 'In Progress',
            time: '2:30 PM'
          },
          {
            id: 2,
            patient: 'Jane Smith',
            type: 'Follow-up',
            department: 'Medical Records',
            status: 'Waiting',
            time: '2:45 PM'
          },
          {
            id: 3,
            patient: 'Bob Johnson',
            type: 'New Visit',
            department: 'Medical Records',
            status: 'Waiting',
            time: '3:00 PM'
          }
        ]);

        setRecentPatients([
          {
            id: 1,
            name: 'Alice Brown',
            status: 'Active',
            age: 45,
            gender: 'F'
          },
          {
            id: 2,
            name: 'Charlie Wilson',
            status: 'Active',
            age: 32,
            gender: 'M'
          },
          {
            id: 3,
            name: 'Diana Prince',
            status: 'Admitted',
            age: 28,
            gender: 'F'
          }
        ]);
      } catch (error) {
        console.error('Error fetching data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white border-0">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center">
                  <FileText className="h-8 w-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold">Medical Records Department</h1>
                  <p className="text-blue-100 dark:text-blue-200">Digital medical records management and patient documentation</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  className="bg-white text-blue-600 hover:bg-blue-50 dark:bg-white dark:text-blue-600 dark:hover:bg-blue-50"
                  onClick={() => window.location.href = '/medical-records/patients/new'}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Register Patient
                </Button>
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/20 dark:border-white dark:text-white dark:hover:bg-white/20"
                  onClick={() => window.location.href = '/medical-records/patients'}
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
                <Card className={`border-l-4 ${totalPatients > 0 ? 'border-l-blue-500' : 'border-l-green-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Total Patients</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Users className={`h-5 w-5 ${totalPatients > 0 ? 'text-blue-500 dark:text-blue-400' : 'text-green-500 dark:text-green-400'}`} />
                          <p className={`text-3xl font-bold ${totalPatients > 0 ? 'text-blue-600 dark:text-blue-400' : 'text-green-600 dark:text-green-400'}`}>{totalPatients}</p>
                        </div>
                        {totalPatients === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No patients registered</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${activeVisitsToday === 0 ? 'border-l-green-500' : 'border-l-blue-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Active Visits</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Activity className={`h-5 w-5 ${activeVisitsToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-blue-500 dark:text-blue-400'}`} />
                          <p className={`text-3xl font-bold ${activeVisitsToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-blue-600 dark:text-blue-400'}`}>{activeVisitsToday}</p>
                        </div>
                        {activeVisitsToday === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No active visits</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${scheduledToday === 0 ? 'border-l-green-500' : 'border-l-amber-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Scheduled Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Clock className={`h-5 w-5 ${scheduledToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-amber-500 dark:text-amber-400'}`} />
                          <p className={`text-3xl font-bold ${scheduledToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-amber-600 dark:text-amber-400'}`}>{scheduledToday}</p>
                        </div>
                        {scheduledToday === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No scheduled visits</p>
                        ) : null}
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className={`border-l-4 ${completedToday === 0 ? 'border-l-green-500' : 'border-l-emerald-500'}`}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Completed Today</p>
                        <div className="flex items-center gap-2 mt-1">
                          <CheckCircle2 className={`h-5 w-5 ${completedToday === 0 ? 'text-green-500 dark:text-green-400' : 'text-emerald-500 dark:text-emerald-400'}`} />
                          <p className={`text-3xl font-bold ${completedToday === 0 ? 'text-green-600 dark:text-green-400' : 'text-emerald-600 dark:text-emerald-400'}`}>{completedToday}</p>
                        </div>
                        {completedToday === 0 ? (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1">No completed visits</p>
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
            <Button onClick={() => window.location.href = '/medical-records/patients/new'} className="h-auto py-6 flex flex-col items-center gap-3 bg-gradient-to-br from-blue-500 to-cyan-500 hover:from-blue-600 hover:to-cyan-600 text-white border-l-4 border-l-white/20">
              <div className="flex items-center gap-2">
                <UserCheck className="h-6 w-6" />
              </div>
              <span className="text-sm font-medium">Register Patient</span>
              <span className="text-xs opacity-90">Create new patient records</span>
            </Button>
            <Button onClick={() => window.location.href = '/medical-records/patients'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-blue-500/30 hover:bg-blue-500/10 border-l-4 border-l-blue-500">
              <Search className="h-6 w-6 text-blue-500 dark:text-blue-400" />
              <span className="text-sm font-medium">Patient Search</span>
              <span className="text-xs text-muted-foreground">Find patients by name/ID</span>
            </Button>
            <Button onClick={() => window.location.href = '/medical-records/visits/new'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-green-500/30 hover:bg-green-500/10 border-l-4 border-l-green-500">
              <Plus className="h-6 w-6 text-green-500 dark:text-green-400" />
              <span className="text-sm font-medium">Start New Visit</span>
              <span className="text-xs text-muted-foreground">Create patient consultations</span>
            </Button>
            <Button onClick={() => window.location.href = '/medical-records/visits'} variant="outline" className="h-auto py-6 flex flex-col items-center gap-3 border-purple-500/30 hover:bg-purple-500/10 border-l-4 border-l-purple-500">
              <Activity className="h-6 w-6 text-purple-500 dark:text-purple-400" />
              <span className="text-sm font-medium">View Reports</span>
              <span className="text-xs text-muted-foreground">Medical certificates & reports</span>
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