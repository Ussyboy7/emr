"use client";

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Users, Stethoscope, TestTube, Pill, Calendar, Clock, Activity,
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, UserPlus,
  Play, ClipboardList, Bell, ArrowRight, Heart, Building2, Bed,
  FileText, Syringe, ScanLine
} from 'lucide-react';

// Dashboard data will be loaded from API

export default function DashboardPage() {
  // Dashboard data will be loaded from API
  const [todayStats] = useState({
    patientsToday: 0,
    patientsChange: 0,
    consultations: 0,
    consultationsChange: 0,
    labTests: 0,
    labTestsChange: 0,
    prescriptions: 0,
    prescriptionsChange: 0,
  });
  const [queueStatus] = useState({
    nursingPool: 0,
    consultationWaiting: 0,
    labPending: 0,
    pharmacyQueue: 0,
  });
  const [recentPatients] = useState<any[]>([]);
  const [criticalAlerts] = useState<any[]>([]);
  const [clinicPerformance] = useState<any[]>([]);
  const [upcomingAppointments] = useState<any[]>([]);
  const [loading] = useState(true);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Welcome Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">EMR Dashboard</h1>
            <p className="text-muted-foreground mt-1">
              {new Date().toLocaleDateString('en-NG', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link href="/medical-records/patients/new"><UserPlus className="h-4 w-4 mr-2" />Register Patient</Link>
            </Button>
            <Button asChild className="bg-emerald-600 hover:bg-emerald-700">
              <Link href="/consultation/start"><Play className="h-4 w-4 mr-2" />Start Consultation</Link>
            </Button>
          </div>
        </div>

        {/* Critical Alerts */}
        {criticalAlerts.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-3">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span className="font-semibold text-amber-700 dark:text-amber-400">Alerts Requiring Attention</span>
                <Badge variant="secondary" className="ml-auto">{criticalAlerts.length} new</Badge>
              </div>
              <div className="space-y-2">
                {criticalAlerts.map((alert, i) => (
                  <div key={i} className="flex items-center justify-between p-2 bg-background rounded-lg">
                    <div className="flex items-center gap-2">
                      {alert.type === 'lab' && <TestTube className="h-4 w-4 text-rose-500" />}
                      {alert.type === 'stock' && <Pill className="h-4 w-4 text-violet-500" />}
                      {alert.type === 'license' && <FileText className="h-4 w-4 text-blue-500" />}
                      <span className="text-sm">{alert.message}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{alert.time}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Today's Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-l-4 border-l-blue-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Patients Today</p>
                  <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{todayStats.patientsToday}</p>
                  <p className={`text-sm flex items-center gap-1 ${todayStats.patientsChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {todayStats.patientsChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(todayStats.patientsChange)}% vs yesterday
                  </p>
                </div>
                <Users className="h-10 w-10 text-blue-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-emerald-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Consultations</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{todayStats.consultations}</p>
                  <p className={`text-sm flex items-center gap-1 ${todayStats.consultationsChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {todayStats.consultationsChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(todayStats.consultationsChange)}% vs yesterday
                  </p>
                </div>
                <Stethoscope className="h-10 w-10 text-emerald-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-amber-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Lab Tests</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{todayStats.labTests}</p>
                  <p className={`text-sm flex items-center gap-1 ${todayStats.labTestsChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {todayStats.labTestsChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(todayStats.labTestsChange)}% vs yesterday
                  </p>
                </div>
                <TestTube className="h-10 w-10 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-violet-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Prescriptions</p>
                  <p className="text-3xl font-bold text-violet-600 dark:text-violet-400">{todayStats.prescriptions}</p>
                  <p className={`text-sm flex items-center gap-1 ${todayStats.prescriptionsChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {todayStats.prescriptionsChange >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                    {Math.abs(todayStats.prescriptionsChange)}% vs yesterday
                  </p>
                </div>
                <Pill className="h-10 w-10 text-violet-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Queue Status */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Link href="/nursing/pool-queue">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Nursing Pool</p>
                    <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">{queueStatus.nursingPool}</p>
                    <p className="text-xs text-muted-foreground">patients waiting</p>
                  </div>
                  <Heart className="h-8 w-8 text-rose-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/consultation/start">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Consultation</p>
                    <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{queueStatus.consultationWaiting}</p>
                    <p className="text-xs text-muted-foreground">awaiting doctor</p>
                  </div>
                  <Stethoscope className="h-8 w-8 text-emerald-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/laboratory/orders">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Lab Queue</p>
                    <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{queueStatus.labPending}</p>
                    <p className="text-xs text-muted-foreground">pending tests</p>
                  </div>
                  <TestTube className="h-8 w-8 text-amber-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          </Link>
          <Link href="/pharmacy/prescriptions">
            <Card className="hover:shadow-md transition-shadow cursor-pointer group">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">Pharmacy</p>
                    <p className="text-2xl font-bold text-violet-600 dark:text-violet-400">{queueStatus.pharmacyQueue}</p>
                    <p className="text-xs text-muted-foreground">to dispense</p>
                  </div>
                  <Pill className="h-8 w-8 text-violet-500 opacity-50 group-hover:opacity-100 transition-opacity" />
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Recent Patients */}
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
              <div className="space-y-3">
                {recentPatients.map(patient => (
                  <div key={patient.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-500 to-cyan-500 flex items-center justify-center text-white font-medium text-sm">
                        {patient.name.split(' ').map(n => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium">{patient.name}</p>
                        <p className="text-xs text-muted-foreground">{patient.id} • {patient.clinic} Clinic • {patient.time}</p>
                      </div>
                    </div>
                    <Badge variant={
                      patient.status === 'Completed' ? 'default' :
                      patient.status === 'In Consultation' ? 'secondary' :
                      'outline'
                    }>{patient.status}</Badge>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Appointments */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-teal-500" />Upcoming</CardTitle>
              <CardDescription>Next appointments</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>
        </div>

        {/* Clinic Performance */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-indigo-500" />Clinic Performance Today</CardTitle>
            <CardDescription>Patient volume and wait times by clinic</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {clinicPerformance.map(clinic => (
                <div key={clinic.name} className="p-4 bg-muted/50 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-medium">{clinic.name}</span>
                    <span className="text-lg font-bold text-foreground">{clinic.patients}</span>
                  </div>
                  <Progress value={(clinic.patients / clinic.target) * 100} className="h-2 mb-2" />
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>Target: {clinic.target}</span>
                    <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{clinic.avgWait} min wait</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <Link href="/medical-records/patients/new">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <UserPlus className="h-8 w-8 text-blue-500 mb-2" />
                <span className="text-sm font-medium">Register Patient</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/medical-records/visits/new">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <Calendar className="h-8 w-8 text-emerald-500 mb-2" />
                <span className="text-sm font-medium">Create Visit</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/consultation/start">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <Stethoscope className="h-8 w-8 text-teal-500 mb-2" />
                <span className="text-sm font-medium">Start Consultation</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/laboratory/orders">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <TestTube className="h-8 w-8 text-amber-500 mb-2" />
                <span className="text-sm font-medium">Lab Orders</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/pharmacy/prescriptions">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <Pill className="h-8 w-8 text-violet-500 mb-2" />
                <span className="text-sm font-medium">Prescriptions</span>
              </CardContent>
            </Card>
          </Link>
          <Link href="/analytics">
            <Card className="hover:shadow-md transition-shadow cursor-pointer h-full">
              <CardContent className="p-4 flex flex-col items-center justify-center text-center h-full">
                <Activity className="h-8 w-8 text-indigo-500 mb-2" />
                <span className="text-sm font-medium">Analytics</span>
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </DashboardLayout>
  );
}
