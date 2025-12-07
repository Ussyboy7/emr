"use client";

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { patientService, visitService } from '@/lib/services';
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
  Loader2
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

  // Data state
  const [recentPatients, setRecentPatients] = useState<any[]>([]);
  const [activeVisits, setActiveVisits] = useState<any[]>([]);

  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Load all data in parallel
        const [patientsResult, visitsResult] = await Promise.allSettled([
          patientService.getPatients({ page_size: 1 }), // Just get count
          visitService.getTodayVisits(),
        ]);

        // Process patients count
        if (patientsResult.status === 'fulfilled') {
          setTotalPatients(patientsResult.value.count);
          // Get recent patients (last 5)
          const recentResult = await patientService.getPatients({ page_size: 5 });
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
            patient: v.patient_name || `Patient ${v.patient}`,
            type: v.visit_type || 'Consultation',
            department: v.clinic || 'General',
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
    { label: 'Pending Reports', value: pendingReports.toString(), icon: FileText, color: 'text-amber-500', bgColor: 'bg-amber-500/10' },
    { label: 'Admissions', value: admissions.toString(), icon: ClipboardList, color: 'text-violet-500', bgColor: 'bg-violet-500/10' },
  ];

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Medical Records</h1>
            <p className="text-muted-foreground mt-1">
              Comprehensive patient records management with visits, diagnoses, and medical history
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" asChild>
              <Link href="/medical-records/patients">
                <Search className="h-4 w-4 mr-2" />
                Find Patient
              </Link>
            </Button>
            <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-400 hover:to-cyan-400 text-white" asChild>
              <Link href="/medical-records/patients/new">
                <Plus className="h-4 w-4 mr-2" />
                Register Patient
              </Link>
            </Button>
          </div>
        </div>

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

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {stats.map((stat) => (
            <Card key={stat.label} className="border-border bg-card">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    {loading ? (
                      <div className="flex items-center gap-2 mt-2">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                      </div>
                    ) : (
                      <p className="text-3xl font-bold text-foreground mt-2">{stat.value}</p>
                    )}
                  </div>
                  <div className={`p-3 rounded-xl ${stat.bgColor}`}>
                    <stat.icon className={`h-6 w-6 ${stat.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Quick Actions */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {quickActions.map((action) => (
            <Link key={action.title} href={action.href}>
              <Card className="border-border bg-card hover:border-primary/50 hover:shadow-md transition-all cursor-pointer h-full group">
                <CardContent className="p-6">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${action.color} flex items-center justify-center mb-4`}>
                    <action.icon className="h-6 w-6 text-white" />
                  </div>
                  <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{action.title}</h3>
                  <p className="text-sm text-muted-foreground mt-1">{action.description}</p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {/* Active Visits */}
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
                  <Link 
                    key={visit.id} 
                    href={`/medical-records/visits/${visit.id}`}
                    className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${
                        visit.status === 'In Progress' ? 'bg-emerald-500' :
                        visit.status === 'Waiting' ? 'bg-amber-500' :
                        'bg-blue-500'
                      }`} />
                      <div>
                        <p className="font-medium text-foreground">{visit.patient}</p>
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
                  </Link>
                ))
              ) : (
                <p className="text-sm text-muted-foreground text-center p-4">No active visits today</p>
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
                    href={`/medical-records/patients/${patient.id}`}
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
                <p className="text-sm text-muted-foreground text-center p-4">No recent patients</p>
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
    </DashboardLayout>
  );
}
