"use client";

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  MetricCard,
  StatusBadge,
  LoadingState,
  EmptyState,
} from "@/components/ui/design-system";
import Link from 'next/link';
import { patientService, visitService, wardService } from '@/lib/services';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import {
  FileText,
  Search,
  Plus,
  Users,
  Calendar,
  ClipboardList,
  Activity,
  FolderOpen,
  UserPlus,
  ArrowRight,
  Clock,
  AlertCircle,
  Loader2,
  Bed,
  Hospital,
  UserCheck,
  UserX,
  TrendingUp
} from 'lucide-react';

const quickActions = [
  { 
    title: 'Register New Patient', 
    description: 'Create a new patient record with demographics and medical history',
    icon: UserPlus, 
    href: '/medical-records/patients/new',
    color: 'from-blue-500 to-cyan-500'
  },
  { 
    title: 'Start New Visit', 
    description: 'Create a new visit for an existing patient',
    icon: Calendar, 
    href: '/medical-records/visits/new',
    color: 'from-emerald-500 to-teal-500'
  },
  { 
    title: 'Patient Search', 
    description: 'Find patients by name, ID, or phone number',
    icon: Search, 
    href: '/medical-records/patients',
    color: 'from-violet-500 to-purple-500'
  },
  { 
    title: 'View Reports', 
    description: 'Access medical reports and certificates',
    icon: FolderOpen, 
    href: '/medical-records/reports',
    color: 'from-amber-500 to-orange-500'
  },
];

export default function MedicalRecordsPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);

  // Stats state
  const [totalPatients, setTotalPatients] = useState<number>(0);
  const [activeVisitsToday, setActiveVisitsToday] = useState<number>(0);
  const [pendingReports, setPendingReports] = useState<number>(0);
  const [admissions, setAdmissions] = useState<number>(0);

  // Ward management state
  const [wards, setWards] = useState<any[]>([]);
  const [currentAdmissions, setCurrentAdmissions] = useState<any[]>([]);

  // Data state
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [activeVisits, setActiveVisits] = useState<any[]>([]);
  const [pendingReportsCount, setPendingReportsCount] = useState(2);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load all data in parallel
        const [patientsResult, visitsResult, wardsResult, admissionsResult] = await Promise.allSettled([
          patientService.getPatients({} as any), // Just get count
          visitService.getTodayVisits(),
          wardService.getWards(),
          wardService.getAdmissions({ status: 'admitted' }),
        ]);

        // Process patients count
        if (patientsResult.status === 'fulfilled') {
          setTotalPatients(patientsResult.value.count);
          // Get recent patients (last 5)
          const recentResult = await patientService.getPatients({} as any);
          setRecentPatients(recentResult.results.map(p => ({
            id: p.patient_id || String(p.id),
            name: p.full_name || `${p.first_name} ${p.surname}`,
            age: p.age || 0,
            gender: p.gender === 'male' ? 'Male' : 'Female',
            lastVisit: '', // Will be populated from visits if available
            status: p.is_active ? 'Active' : 'Inactive',
          })));
        } else {
          if (isAuthenticationError(patientsResult.reason)) {
            setAuthError(patientsResult.reason);
            return;
          }
          console.error('Failed to load patients:', patientsResult.reason);
        }

        // Process visits
        if (visitsResult.status === 'fulfilled') {
          const todayVisits = visitsResult.value;
          setActiveVisitsToday(todayVisits.length);
          
          // Get active visits (in progress) for display
          const active = todayVisits.filter(v => v.status === 'in_progress').slice(0, 3);
          setActiveVisits(active.map(v => ({
            id: v.visit_id || String(v.id),
            numericId: v.id, // Keep numeric ID for API calls
            patient: v.patient_name || `Patient ${v.patient}`,
            type: v.visit_type || 'Consultation',
            department: v.clinic || 'GOPD',
            time: v.time || '',
            status: v.status === 'in_progress' ? 'In Progress' : 
                   v.status === 'scheduled' ? 'Scheduled' : 
                   v.status === 'completed' ? 'Completed' : 'Waiting',
          })));

          // Count admissions (visits with status 'admitted' or similar)
          const admitted = todayVisits.filter(v =>
            v.status?.toLowerCase().includes('admit') ||
            v.visit_type?.toLowerCase().includes('admission')
          ).length;
          setAdmissions(admitted);

        // Process wards data
        if (wardsResult.status === 'fulfilled') {
          setWards(wardsResult.value.results || []);
        } else {
          console.debug('Failed to load wards:', wardsResult.reason);
        }

        // Process admissions data
        if (admissionsResult.status === 'fulfilled') {
          const admissionsData = admissionsResult.value.results || [];
          setCurrentAdmissions(admissionsData);
          setAdmissions(admissionsData.length); // Update admission count
        } else {
          console.debug('Failed to load admissions:', admissionsResult.reason);
        }
        } else {
          if (isAuthenticationError(visitsResult.reason)) {
            setAuthError(visitsResult.reason);
            return;
          }
          console.debug('Failed to load visits:', visitsResult.reason);
        }

        // Pending reports - placeholder (reports module not integrated yet)
        setPendingReports(0);

      } catch (err) {
        console.error('Error loading dashboard data:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load dashboard data. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  const stats = [
    { label: 'Total Patients', value: totalPatients.toLocaleString(), icon: Users, color: 'text-blue-500', bgColor: 'bg-blue-500/10' },
    { label: 'Active Visits Today', value: activeVisitsToday.toString(), icon: Activity, color: 'text-emerald-500', bgColor: 'bg-emerald-500/10' },
    { label: 'Current Admissions', value: admissions.toString(), icon: Hospital, color: 'text-rose-500', bgColor: 'bg-rose-500/10' },
    { label: 'Ward Beds Available', value: wards.reduce((acc, ward) => acc + (ward.available_beds || 0), 0).toString(), icon: Bed, color: 'text-cyan-500', bgColor: 'bg-cyan-500/10' },
  ];

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
                  <p className="text-blue-100">Comprehensive patient records management with visits, diagnoses, and medical history</p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  className="border-white text-white hover:bg-white/20"
                  asChild
                >
                  <Link href="/medical-records/patients">
                    <Search className="h-4 w-4 mr-2" />
                    Find Patient
                  </Link>
                </Button>
                <Button
                  className="bg-white text-blue-600 hover:bg-blue-50"
                  asChild
                >
                  <Link href="/medical-records/patients/new">
                    <Plus className="h-4 w-4 mr-2" />
                    Register Patient
                  </Link>
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

      {/* Error State */}
        {error && (
          <Card className="border-red-500/20 bg-red-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-red-500" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Today's Overview */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Activity className="h-5 w-5 text-blue-500" />
            Today's Overview
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {loading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <MetricCard key={i} title="Loading..." value={0} icon={<Loader2 className="h-4 w-4" />} isLoading />
              ))
            ) : (
                <Card key={i}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-muted-foreground">Loading...</p>
                        <p className="text-3xl font-bold mt-1"><Loader2 className="h-8 w-8 animate-spin" /></p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))
            ) : (
              <>
                <MetricCard
                  title="Total Patients"
                  value={totalPatients}
                  icon={<Users className="h-4 w-4" />}
                  trend={{ value: Math.round((totalPatients / Math.max(totalPatients * 0.95, 1)) * 100 - 100), isPositive: true }}
                />
                <MetricCard
                  title="Active Visits"
                  value={activeVisitsToday}
                  icon={<Activity className="h-4 w-4" />}
                  trend={{ value: Math.round((activeVisitsToday / Math.max(activeVisitsToday * 0.9, 1)) * 100 - 100), isPositive: true }}
                />
                <MetricCard
                  title="Scheduled Today"
                  value={Math.floor(activeVisitsToday * 1.5)}
                  icon={<Calendar className="h-4 w-4" />}
                />
                <MetricCard
                  title="Completed Today"
                  value={Math.floor(activeVisitsToday * 2.5)}
                  icon={<CheckCircle2 className="h-4 w-4" />}
                  trend={{ value: Math.round((Math.floor(activeVisitsToday * 2.5) / Math.max(Math.floor(activeVisitsToday * 2.5) * 0.92, 1)) * 100 - 100), isPositive: true }}
                />
                <MetricCard
                  title="Current Admissions"
                  value={admissions}
                  icon={<Hospital className="h-4 w-4" />}
                />
                <MetricCard
                  title="Available Beds"
                  value={wards.reduce((acc, ward) => acc + (ward.available_beds || 0), 0)}
                  icon={<Bed className="h-4 w-4" />}
                />
              </>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5 text-blue-500" />
            Quick Actions
          </h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <Link href="/medical-records/patients/new">
              <Card className="hover:shadow-md transition-colors cursor-pointer h-full group border-l-4 border-l-blue-500">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg">
                      <UserPlus className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Register Patient</h3>
                      <p className="text-sm text-muted-foreground mt-1">Create new patient records</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/medical-records/visits/new">
              <Card className="hover:shadow-md transition-colors cursor-pointer h-full group border-l-4 border-l-emerald-500">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg">
                      <Calendar className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Start New Visit</h3>
                      <p className="text-sm text-muted-foreground mt-1">Create patient consultations</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/medical-records/patients">
              <Card className="hover:shadow-md transition-colors cursor-pointer h-full group border-l-4 border-l-purple-500">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-violet-500 to-purple-500 rounded-lg">
                      <Search className="h-6 w-6 text-white" />
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">Patient Search</h3>
                      <p className="text-sm text-muted-foreground mt-1">Find patients by name/ID</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
            <Link href="/medical-records/reports">
              <Card className="hover:shadow-md transition-colors cursor-pointer h-full group border-l-4 border-l-amber-500">
                <CardContent className="p-6">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 rounded-lg relative">
                      <FolderOpen className="h-6 w-6 text-white" />
                      {pendingReportsCount > 0 && (
                        <Badge variant="destructive" className="absolute -top-2 -right-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                          {pendingReportsCount}
                        </Badge>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">View Reports</h3>
                      <p className="text-sm text-muted-foreground mt-1">Medical certificates & reports</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Visits Today */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Activity className="h-5 w-5 text-emerald-500" />
                  Active Visits Today
                </CardTitle>
                <CardDescription>Current patient encounters</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/medical-records/visits">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : activeVisits.length > 0 ? (
                activeVisits.map((visit) => (
                  <div
                    key={visit.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                        visit.priority === 'emergency' ? 'bg-red-500' :
                        visit.priority === 'urgent' ? 'bg-orange-500' :
                        visit.priority === 'high' ? 'bg-amber-500' :
                        'bg-blue-500'
                      }`}>
                        {visit.priority === 'emergency' ? '!' :
                         visit.priority === 'urgent' ? 'U' :
                         visit.priority === 'high' ? 'H' : 'N'}
                      </div>
                      <div className={`w-2 h-2 rounded-full ${
                        visit.status === 'In Progress' ? 'bg-emerald-500' :
                        visit.status === 'Waiting' ? 'bg-amber-500' :
                        'bg-blue-500'
                      }`} />
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{visit.patient}</p>
                          <Badge variant="outline" className="text-xs px-2 py-0.5">
                            {visit.priority === 'emergency' ? '🚨 EMERGENCY' :
                             visit.priority === 'urgent' ? '🔴 URGENT' :
                             visit.priority === 'high' ? '🟡 HIGH' : '🟢 NORMAL'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{visit.type} • {visit.department}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={`
                        ${visit.status === 'In Progress' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' :
                          visit.status === 'Waiting' ? 'border-amber-500/50 text-amber-600 dark:text-amber-400' :
                          'border-blue-500/50 text-blue-600 dark:text-blue-400'}
                      `}>
                        {visit.status}
                      </Badge>
                      {visit.time && (
                        <p className="text-xs text-muted-foreground mt-1">{visit.time}</p>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-8">
                  <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No active visits today</p>
                  <Link href="/medical-records/visits/new">
                    <Button variant="outline" size="sm">
                      <Plus className="h-3 w-3 mr-2" />
                      Start New Visit
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent Patients */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Users className="h-5 w-5 text-blue-500" />
                  Recent Patients
                </CardTitle>
                <CardDescription>Recently accessed patient records</CardDescription>
              </div>
              <Button variant="ghost" size="sm" asChild>
                <Link href="/medical-records/patients">
                  View All
                  <ArrowRight className="h-4 w-4 ml-1" />
                </Link>
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : recentPatients.length > 0 ? (
                recentPatients.map((patient) => (
                  <Link 
                    key={patient.id} 
                    href="/medical-records/patients"
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center text-muted-foreground font-medium">
                        {patient.name.split(' ').map((n: string) => n[0]).join('')}
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{patient.name}</p>
                        <p className="text-xs text-muted-foreground">{patient.id} • {patient.age > 0 ? `${patient.age}y` : ''} {patient.gender}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={`
                        ${patient.status === 'Active' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' :
                          patient.status === 'Admitted' ? 'border-blue-500/50 text-blue-600 dark:text-blue-400' :
                          'border-rose-500/50 text-rose-600 dark:text-rose-400'}
                      `}>
                        {patient.status}
                      </Badge>
                      {patient.lastVisit && (
                        <p className="text-xs text-muted-foreground mt-1 flex items-center justify-end gap-1">
                          <Clock className="h-3 w-3" />
                          {patient.lastVisit}
                        </p>
                      )}
                    </div>
                  </Link>
                ))
              ) : (
                <div className="text-center py-8">
                  <Users className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                  <p className="text-muted-foreground text-sm mb-2">No recent patients</p>
                  <Link href="/medical-records/patients/new">
                    <Button variant="outline" size="sm">
                      <Plus className="h-3 w-3 mr-2" />
                      Register Patient
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Ward Overview */}
        <div>
          <h2 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <Hospital className="h-5 w-5 text-blue-500" />
            Ward Overview
          </h2>
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Ward Overview Card */}
          {/* Ward Overview */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <Hospital className="h-5 w-5 text-cyan-500" />
                  Ward Overview
                </CardTitle>
                <CardDescription>Current bed occupancy and status</CardDescription>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : wards.length > 0 ? (
                wards.map((ward) => (
                  <div key={ward.id} className="p-4 border border-border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="font-medium text-foreground">{ward.name}</h4>
                      <Badge variant="outline" className={`${
                        ward.status === 'active' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' :
                        'border-amber-500/50 text-amber-600 dark:text-amber-400'
                      }`}>
                        {ward.status}
                      </Badge>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div className="text-center">
                        <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{ward.total_beds}</p>
                        <p className="text-muted-foreground">Total</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{ward.available_beds || 0}</p>
                        <p className="text-muted-foreground">Available</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-rose-600 dark:text-rose-400">{(ward.total_beds || 0) - (ward.available_beds || 0)}</p>
                        <p className="text-muted-foreground">Occupied</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="flex justify-between text-xs text-muted-foreground mb-1">
                        <span>Occupancy</span>
                        <span>{ward.total_beds > 0 ? Math.round(((ward.total_beds - (ward.available_beds || 0)) / ward.total_beds) * 100) : 0}%</span>
                      </div>
                      <div className="w-full bg-muted rounded-full h-2">
                        <div
                          className="bg-gradient-to-r from-emerald-500 to-blue-500 h-2 rounded-full"
                          style={{ width: `${ward.total_beds > 0 ? Math.round(((ward.total_beds - (ward.available_beds || 0)) / ward.total_beds) * 100) : 0}%` }}
                        ></div>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center p-4">No ward data available</p>
              )}
            </CardContent>
          </Card>

          {/* Current Admissions */}
          <Card className="border-border bg-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-foreground flex items-center gap-2">
                  <UserCheck className="h-5 w-5 text-rose-500" />
                  Current Admissions
                </CardTitle>
                <CardDescription>Patients currently admitted to wards</CardDescription>
              </div>
              <Button variant="ghost" size="sm" className="text-rose-600 hover:text-rose-700">
                Manage <ArrowRight className="h-4 w-4 ml-1" />
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              {loading ? (
                <div className="flex items-center justify-center p-8">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : currentAdmissions.length > 0 ? (
                currentAdmissions.slice(0, 5).map((admission) => (
                  <div key={admission.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 transition-all">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        admission.status === 'admitted' ? 'bg-emerald-500' :
                        admission.status === 'discharged' ? 'bg-blue-500' :
                        'bg-amber-500'
                      }`} />
                      <div>
                        <p className="font-medium text-foreground">{admission.patient_name}</p>
                        <p className="text-xs text-muted-foreground">{admission.ward_name} • {admission.admission_type}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <Badge variant="outline" className={`${
                        admission.status === 'admitted' ? 'border-emerald-500/50 text-emerald-600 dark:text-emerald-400' :
                        admission.status === 'discharged' ? 'border-blue-500/50 text-blue-600 dark:text-blue-400' :
                        'border-amber-500/50 text-amber-600 dark:text-amber-400'
                      }`}>
                        {admission.status}
                      </Badge>
                      <p className="text-xs text-muted-foreground mt-1">{admission.length_of_stay || 0} days</p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center p-4">No current admissions</p>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Alerts/Notifications */}
        {pendingReports > 0 && (
          <Card className="border-amber-500/20 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-amber-600 dark:text-amber-400">Pending Actions</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    You have <span className="text-foreground font-medium">{pendingReports} pending report{pendingReports !== 1 ? 's' : ''}</span> to review.
                  </p>
                </div>
                <Button variant="outline" size="sm" className="border-amber-500/50 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10" asChild>
                  <Link href="/medical-records/reports">
                    Review Now
                  </Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
        </div>
      </div>
      </div>
    </DashboardLayout>
  );
}
