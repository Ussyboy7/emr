"use client";

import { useState, useMemo, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { analyticsService } from '@/lib/services';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, Stethoscope, TestTube, Pill, Calendar,
  Clock, Activity, Heart, FileText, Download, RefreshCw, Building2,
  AlertTriangle, CheckCircle2, UserPlus, Bed, Loader2
} from 'lucide-react';

export default function AnalyticsPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Analytics data
  const [stats, setStats] = useState({
    totalPatients: 0,
    patientsChange: 0,
    totalVisits: 0,
    visitsChange: 0,
    avgWaitTime: 0,
    waitTimeChange: 0,
    satisfaction: 0,
    satisfactionChange: 0,
  });
  const [patientVisitsData, setPatientVisitsData] = useState<any[]>([]);
  const [clinicDistribution, setClinicDistribution] = useState<any[]>([]);
  const [departmentStats, setDepartmentStats] = useState<any[]>([]);
  const [dailyTrend, setDailyTrend] = useState<any[]>([]);
  const [topDiagnoses, setTopDiagnoses] = useState<any[]>([]);
  const [labTestDistribution, setLabTestDistribution] = useState<any[]>([]);
  const [pharmacyMetrics, setPharmacyMetrics] = useState<any[]>([]);
  const [patientDemographics, setPatientDemographics] = useState<any>(null);
  const [consultationMetrics, setConsultationMetrics] = useState<any>(null);
  const [labPerformance, setLabPerformance] = useState<any>(null);
  const [pharmacyPerformance, setPharmacyPerformance] = useState<any>(null);

  useEffect(() => {
    loadAnalyticsData();
  }, [selectedPeriod]);

  const loadAnalyticsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const period = parseInt(selectedPeriod);
      
      // Load all analytics data
      const [summaryStats, visitsTrend, clinicDist, deptStats, daily, diagnoses, labDist, pharmMetrics, demographics, dashboardStats, labPerf, pharmPerf] = await Promise.all([
        analyticsService.getSummaryStats(period),
        analyticsService.getPatientVisitsTrend(period),
        analyticsService.getClinicDistribution(),
        analyticsService.getDepartmentStats(),
        analyticsService.getDailyTrend(7),
        analyticsService.getTopDiagnoses(10),
        analyticsService.getLabTestDistribution(),
        analyticsService.getPharmacyMetrics(12),
        analyticsService.getPatientDemographics().catch(() => null), // Don't fail if this endpoint doesn't exist
        apiFetch<any>('/dashboard/stats/').catch(() => null), // Load dashboard stats for consultation metrics
        apiFetch<any>('/reports/lab-performance/').catch(() => null), // Lab performance metrics
        apiFetch<any>('/reports/pharmacy-performance/').catch(() => null), // Pharmacy performance metrics
      ]);
      
      setStats(summaryStats);
      setPatientVisitsData(visitsTrend);
      setClinicDistribution(clinicDist);
      setDepartmentStats(deptStats);
      setDailyTrend(daily);
      setTopDiagnoses(diagnoses);
      setLabTestDistribution(labDist);
      setPharmacyMetrics(pharmMetrics);
      setPatientDemographics(demographics);
      setConsultationMetrics(dashboardStats?.consultation);
      setLabPerformance(labPerf);
      setPharmacyPerformance(pharmPerf);
    } catch (err: any) {
      setError(err.message || 'Failed to load analytics data');
      toast.error('Failed to load analytics. Please try again.');
      console.error('Error loading analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadAnalyticsData();
    setIsRefreshing(false);
  };

  const handleExport = () => {
    // Export functionality
    toast.info('Export functionality will be implemented');
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Activity className="h-8 w-8 text-indigo-500" />
              Analytics & Reports
            </h1>
            <p className="text-muted-foreground mt-1">Clinical performance metrics and insights</p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 3 months</SelectItem>
                <SelectItem value="365">Last year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button onClick={handleExport}><Download className="h-4 w-4 mr-2" />Export</Button>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
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
              <Card className="border-l-4 border-l-blue-500">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Patients</p>
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.totalPatients.toLocaleString()}</p>
                      <p className={`text-sm flex items-center gap-1 ${stats.patientsChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {stats.patientsChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                        {Math.abs(stats.patientsChange)}% vs last period
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
                  <p className="text-sm text-muted-foreground">Total Visits</p>
                  <p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.totalVisits.toLocaleString()}</p>
                  <p className={`text-sm flex items-center gap-1 ${stats.visitsChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {stats.visitsChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {Math.abs(stats.visitsChange)}% vs last period
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
                  <p className="text-sm text-muted-foreground">Avg Wait Time</p>
                  <p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.avgWaitTime} min</p>
                  <p className={`text-sm flex items-center gap-1 ${stats.waitTimeChange <= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {stats.waitTimeChange <= 0 ? <TrendingDown className="h-4 w-4" /> : <TrendingUp className="h-4 w-4" />}
                    {Math.abs(stats.waitTimeChange)}% vs last period
                  </p>
                </div>
                <Clock className="h-10 w-10 text-amber-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
          <Card className="border-l-4 border-l-purple-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Satisfaction</p>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">{stats.satisfaction}%</p>
                  <p className={`text-sm flex items-center gap-1 ${stats.satisfactionChange >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                    {stats.satisfactionChange >= 0 ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
                    {Math.abs(stats.satisfactionChange)}% vs last period
                  </p>
                </div>
                <Heart className="h-10 w-10 text-purple-500 opacity-50" />
              </div>
            </CardContent>
          </Card>
            </>
          )}
        </div>

        <Tabs defaultValue="overview" className="space-y-4">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="patients">Patients</TabsTrigger>
            <TabsTrigger value="clinical">Clinical</TabsTrigger>
            <TabsTrigger value="laboratory">Laboratory</TabsTrigger>
            <TabsTrigger value="pharmacy">Pharmacy</TabsTrigger>
          </TabsList>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Patient Visits Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-500" />Patient Visits Trend</CardTitle>
                  <CardDescription>Monthly visits over the past year</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : patientVisitsData.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={patientVisitsData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Area type="monotone" dataKey="visits" stackId="1" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.6} name="Total Visits" />
                        <Area type="monotone" dataKey="newPatients" stackId="2" stroke="#10b981" fill="#10b981" fillOpacity={0.6} name="New Patients" />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Clinic Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-teal-500" />Visits by Clinic</CardTitle>
                  <CardDescription>Distribution of patient visits across clinics</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : clinicDistribution.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={clinicDistribution}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                        >
                          {clinicDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Daily Activity Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-indigo-500" />Weekly Activity Pattern</CardTitle>
                <CardDescription>Daily distribution of activities</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                  </div>
                ) : dailyTrend.length === 0 ? (
                  <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                    <p>No data available</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={dailyTrend}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="day" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="patients" fill="#3b82f6" name="Patients" />
                      <Bar dataKey="consultations" fill="#10b981" name="Consultations" />
                      <Bar dataKey="labs" fill="#f59e0b" name="Lab Tests" />
                      <Bar dataKey="prescriptions" fill="#8b5cf6" name="Prescriptions" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Department Performance */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-purple-500" />Department Performance</CardTitle>
              </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[200px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : departmentStats.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {departmentStats.map(dept => (
                    <div key={dept.dept} className="flex items-center gap-4">
                      <div className="w-24 font-medium">{dept.dept}</div>
                      <div className="flex-1 space-y-1">
                        <div className="flex justify-between text-sm"><span>Volume: {dept.consultations}</span><span>Avg Wait: {dept.avgWait}min</span><span>Satisfaction: {dept.satisfaction}%</span></div>
                        <Progress value={dept.satisfaction} className="h-2" />
                      </div>
                    </div>
                      ))}
                    </div>
                  )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Patients Tab */}
          <TabsContent value="patients" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Patient Registration Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><UserPlus className="h-5 w-5 text-blue-500" />New Patient Registrations</CardTitle>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={patientVisitsData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                      <XAxis dataKey="month" />
                      <YAxis />
                      <Tooltip />
                      <Line type="monotone" dataKey="newPatients" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6' }} />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              {/* Patient Demographics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-emerald-500" />Patient Demographics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="h-[200px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : patientDemographics?.by_category ? (
                    <>
                      {Object.entries(patientDemographics.by_category).map(([category, count]: [string, any]) => {
                        const total = patientDemographics.total_patients || 1;
                        const percentage = Math.round((count / total) * 100);
                        const categoryLabel = category.charAt(0).toUpperCase() + category.slice(1).replace('_', ' ');
                        return (
                          <div key={category}>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm">{categoryLabel}</span>
                              <span className="text-sm font-medium">{percentage}%</span>
                            </div>
                            <Progress value={percentage} className="h-2" />
                          </div>
                        );
                      })}
                    </>
                  ) : (
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between mb-1"><span className="text-sm">Employees</span><span className="text-sm font-medium">65%</span></div>
                        <Progress value={65} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1"><span className="text-sm">Dependents</span><span className="text-sm font-medium">25%</span></div>
                        <Progress value={25} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1"><span className="text-sm">Retirees</span><span className="text-sm font-medium">8%</span></div>
                        <Progress value={8} className="h-2" />
                      </div>
                      <div>
                        <div className="flex justify-between mb-1"><span className="text-sm">Non-NPA</span><span className="text-sm font-medium">2%</span></div>
                        <Progress value={2} className="h-2" />
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Clinical Tab */}
          <TabsContent value="clinical" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Top Diagnoses */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-emerald-500" />Top Diagnoses</CardTitle>
                  <CardDescription>Most common diagnoses this period</CardDescription>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[200px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : topDiagnoses.length === 0 ? (
                    <div className="h-[200px] flex items-center justify-center text-muted-foreground">
                      <p>No diagnosis data available</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {topDiagnoses.map((d, i) => (
                      <div key={d.diagnosis} className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-emerald-500/10 text-emerald-600 flex items-center justify-center text-sm font-medium">{i + 1}</span>
                        <div className="flex-1">
                          <div className="flex justify-between"><span className="text-sm font-medium">{d.diagnosis}</span><span className="text-sm text-muted-foreground">{d.count} cases</span></div>
                          <Progress value={d.percentage} className="h-1.5 mt-1" />
                        </div>
                      </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Consultation Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Clock className="h-5 w-5 text-amber-500" />Consultation Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="h-[200px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-emerald-600">
                          {consultationMetrics?.completed_today || consultationMetrics?.active_sessions || '0'}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {consultationMetrics?.completed_today ? 'Consultations Today' : 'Active Sessions'}
                        </p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-amber-600">22 min</p>
                        <p className="text-sm text-muted-foreground">Avg Duration</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-blue-600">{stats.avgWaitTime || '18'} min</p>
                        <p className="text-sm text-muted-foreground">Avg Wait Time</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-purple-600">
                          {consultationMetrics?.active_sessions ? `${(60 / (stats.avgWaitTime || 22)).toFixed(1)}` : '4.5'}
                        </p>
                        <p className="text-sm text-muted-foreground">Patients/Doctor/Hour</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Laboratory Tab */}
          <TabsContent value="laboratory" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Lab Test Distribution */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Test Distribution</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : labTestDistribution.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={labTestDistribution}
                          dataKey="value"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, value }) => `${name}: ${value}`}
                        >
                          {labTestDistribution.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Lab Performance Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-teal-500" />Lab Performance</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="h-[200px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-blue-600">
                          {labPerformance?.tests_this_month?.toLocaleString() || '1,315'}
                        </p>
                        <p className="text-sm text-muted-foreground">Tests This Month</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-amber-600">
                          {labPerformance?.avg_turnaround_hours ? `${labPerformance.avg_turnaround_hours} hrs` : '4.2 hrs'}
                        </p>
                        <p className="text-sm text-muted-foreground">Avg Turnaround</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-emerald-600">
                          {labPerformance?.completion_rate ? `${labPerformance.completion_rate}%` : '98.5%'}
                        </p>
                        <p className="text-sm text-muted-foreground">Completion Rate</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-rose-600">
                          {labPerformance?.critical_values || '12'}
                        </p>
                        <p className="text-sm text-muted-foreground">Critical Values</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Pharmacy Tab */}
          <TabsContent value="pharmacy" className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Dispensing Trend */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-violet-500" />Dispensing Trend</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="h-[300px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : pharmacyMetrics.length === 0 ? (
                    <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                      <p>No data available</p>
                    </div>
                  ) : (
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={pharmacyMetrics}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="dispensed" fill="#8b5cf6" name="Dispensed" />
                        <Bar dataKey="pending" fill="#f59e0b" name="Pending" />
                      </BarChart>
                    </ResponsiveContainer>
                  )}
                </CardContent>
              </Card>

              {/* Pharmacy Metrics */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-purple-500" />Pharmacy Metrics</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {loading ? (
                    <div className="h-[200px] flex items-center justify-center">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-violet-600">
                          {pharmacyPerformance?.dispensed_this_month?.toLocaleString() || '2,980'}
                        </p>
                        <p className="text-sm text-muted-foreground">Dispensed This Month</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-amber-600">
                          {pharmacyPerformance?.pending_prescriptions || '42'}
                        </p>
                        <p className="text-sm text-muted-foreground">Pending Orders</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-emerald-600">
                          {pharmacyPerformance?.avg_wait_minutes ? `${Math.round(pharmacyPerformance.avg_wait_minutes)} min` : '15 min'}
                        </p>
                        <p className="text-sm text-muted-foreground">Avg Wait Time</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg text-center">
                        <p className="text-3xl font-bold text-rose-600">
                          {pharmacyPerformance?.low_stock_items || '8'}
                        </p>
                        <p className="text-sm text-muted-foreground">Low Stock Items</p>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
