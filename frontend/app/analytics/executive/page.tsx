"use client";

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { analyticsService } from '@/lib/services';
import { toast } from 'sonner';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, RadialBarChart, RadialBar
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, Stethoscope, TestTube, Pill, Calendar,
  Clock, Activity, Heart, FileText, Download, RefreshCw, Building2,
  AlertTriangle, CheckCircle2, Target, Award, Zap, DollarSign, Bed,
  UserCheck, ArrowRight, ArrowUp, ArrowDown, Loader2
} from 'lucide-react';

export default function ExecutiveDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [kpiData, setKpiData] = useState({
    patientSatisfaction: { value: 0, target: 90, trend: 0 },
    avgWaitTime: { value: 0, target: 20, trend: 0 },
    bedOccupancy: { value: 0, target: 85, trend: 0 },
    staffUtilization: { value: 0, target: 80, trend: 0 },
    operationalEfficiency: { value: 0, target: 85, trend: 0 },
    clinicalOutcomes: { value: 0, target: 92, trend: 0 },
  });
  const [monthlyPerformance, setMonthlyPerformance] = useState<any[]>([]);
  const [departmentComparison, setDepartmentComparison] = useState<any[]>([]);
  const [resourceUtilization, setResourceUtilization] = useState<any[]>([]);
  const [qualityIndicators, setQualityIndicators] = useState<any[]>([]);
  const [topPerformers, setTopPerformers] = useState<any[]>([]);
  const [criticalAlerts, setCriticalAlerts] = useState<any[]>([]);

  useEffect(() => {
    loadExecutiveData();
  }, [selectedPeriod]);

  const loadExecutiveData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const [kpis, monthly, deptComp, resources, quality, performers, alerts] = await Promise.all([
        analyticsService.getExecutiveKPIs(),
        analyticsService.getMonthlyPerformance(12),
        analyticsService.getDepartmentComparison(),
        analyticsService.getResourceUtilization(),
        analyticsService.getQualityIndicators(),
        analyticsService.getTopPerformers(),
        analyticsService.getCriticalAlerts(),
      ]);
      
      setKpiData(kpis);
      setMonthlyPerformance(monthly);
      setDepartmentComparison(deptComp);
      setResourceUtilization(resources);
      setQualityIndicators(quality);
      setTopPerformers(performers);
      setCriticalAlerts(alerts);
    } catch (err: any) {
      setError(err.message || 'Failed to load executive data');
      toast.error('Failed to load executive dashboard. Please try again.');
      console.error('Error loading executive data:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadExecutiveData();
    setIsRefreshing(false);
  };

  const getKPIStatus = (value: number, target: number) => {
    if (value >= target) return { color: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-500/10', icon: CheckCircle2 };
    if (value >= target * 0.9) return { color: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-500/10', icon: AlertTriangle };
    return { color: 'text-rose-600 dark:text-rose-400', bg: 'bg-rose-500/10', icon: AlertTriangle };
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Target className="h-8 w-8 text-rose-500" />
              Executive Dashboard
            </h1>
            <p className="text-muted-foreground mt-1">Key performance indicators and strategic insights</p>
          </div>
          <div className="flex gap-2">
            <Select value={selectedPeriod} onValueChange={setSelectedPeriod}>
              <SelectTrigger className="w-[150px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This Week</SelectItem>
                <SelectItem value="month">This Month</SelectItem>
                <SelectItem value="quarter">This Quarter</SelectItem>
                <SelectItem value="year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
              <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />Refresh
            </Button>
            <Button><Download className="h-4 w-4 mr-2" />Export Report</Button>
          </div>
        </div>

        {/* Critical Alerts */}
        {loading ? null : criticalAlerts.length > 0 && (
          <Card className="border-amber-500/50 bg-amber-500/5">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
                <span className="font-semibold">Attention Required</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-2">
                {criticalAlerts.map((alert, i) => (
                  <div key={i} className={`p-2 rounded-lg text-sm ${alert.type === 'critical' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : alert.type === 'warning' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-blue-500/10 text-blue-700 dark:text-blue-300'}`}>
                    <span className="font-medium">{alert.department}:</span> {alert.message}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                  <p className="text-2xl font-bold mt-1"><Loader2 className="h-6 w-6 animate-spin" /></p>
                  <p className="text-xs text-muted-foreground">Loading...</p>
                </CardContent>
              </Card>
            ))
          ) : (
            Object.entries(kpiData).map(([key, data]) => {
            const status = getKPIStatus(data.value, data.target);
            const Icon = status.icon;
            const labels: Record<string, string> = {
              patientSatisfaction: 'Patient Satisfaction',
              avgWaitTime: 'Avg Wait Time',
              bedOccupancy: 'Bed Occupancy',
              staffUtilization: 'Staff Utilization',
              operationalEfficiency: 'Op. Efficiency',
              clinicalOutcomes: 'Clinical Outcomes',
            };
            const units: Record<string, string> = { avgWaitTime: ' min', default: '%' };
            const unit = units[key] || units.default;
            
            return (
              <Card key={key} className={`${status.bg}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <Icon className={`h-5 w-5 ${status.color}`} />
                    <span className={`text-xs flex items-center gap-1 ${data.trend >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                      {data.trend >= 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {Math.abs(data.trend)}%
                    </span>
                  </div>
                  <p className={`text-2xl font-bold ${status.color}`}>{data.value}{unit}</p>
                  <p className="text-xs text-muted-foreground">{labels[key]}</p>
                  <p className="text-xs text-muted-foreground">Target: {data.target}{unit}</p>
                </CardContent>
              </Card>
            );
            })
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Performance Trend */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-indigo-500" />Performance Trend</CardTitle>
              <CardDescription>Monthly patient volume and satisfaction</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : monthlyPerformance.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <p>No data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={monthlyPerformance}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis dataKey="month" />
                    <YAxis yAxisId="left" />
                    <YAxis yAxisId="right" orientation="right" domain={[80, 100]} />
                    <Tooltip />
                    <Legend />
                    <Area yAxisId="left" type="monotone" dataKey="patients" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} name="Patients" />
                    <Line yAxisId="right" type="monotone" dataKey="satisfaction" stroke="#10b981" strokeWidth={2} dot={{ fill: '#10b981' }} name="Satisfaction %" />
                    <Line yAxisId="right" type="monotone" dataKey="efficiency" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b' }} name="Efficiency %" />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Resource Utilization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-teal-500" />Resource Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="h-[200px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && (
                <div className="space-y-4">
                  {resourceUtilization.map(r => {
                    const widthValue = `${r.utilization}%`;
                    return (
                      <div key={r.resource}>
                        <div className="flex justify-between text-sm mb-1">
                          <span>{r.resource}</span>
                          <span className="font-medium">{r.utilization}%</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-2">
                          <div className="h-2 rounded-full" style={{ width: widthValue, backgroundColor: r.fill }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Department Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Building2 className="h-5 w-5 text-purple-500" />Department Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="h-[300px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              ) : departmentComparison.length === 0 ? (
                <div className="h-[300px] flex items-center justify-center text-muted-foreground">
                  <p>No data available</p>
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={departmentComparison} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                    <XAxis type="number" />
                    <YAxis dataKey="name" type="category" width={100} />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="satisfaction" fill="#10b981" name="Satisfaction %" />
                    <Bar dataKey="efficiency" fill="#3b82f6" name="Efficiency %" />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Quality Indicators */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-amber-500" />Quality Indicators</CardTitle>
            </CardHeader>
            <CardContent>
              {loading && (
                <div className="h-[200px] flex items-center justify-center">
                  <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                </div>
              )}
              {!loading && (
                <div className="space-y-3">
                  {qualityIndicators.map(q => {
                    const dotClass = q.status === 'above' ? 'bg-emerald-500' : 'bg-rose-500';
                    const scoreClass = q.status === 'above' ? 'text-emerald-600' : 'text-rose-600';
                    const diffClass = q.status === 'above' ? 'text-emerald-500' : 'text-rose-500';
                    const dotFullClass = 'w-3 h-3 rounded-full ' + dotClass;
                    const scoreFullClass = 'text-sm font-bold ' + scoreClass;
                    const diffSign = q.status === 'above' ? '+' : '';
                    return (
                      <div key={q.indicator} className="flex items-center gap-3">
                        <div className={dotFullClass} />
                        <div className="flex-1">
                          <div className="flex justify-between">
                            <span className="text-sm font-medium">{q.indicator}</span>
                            <span className={scoreFullClass}>{q.score}%</span>
                          </div>
                          <div className="flex justify-between text-xs text-muted-foreground">
                            <span>Target: {q.target}%</span>
                            <span className={diffClass}>
                              {diffSign}{q.score - q.target}%
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-500" />Top Performers This Month</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="h-[200px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {topPerformers.map((p, i) => (
                <div key={p.name} className="p-4 bg-muted/50 rounded-lg text-center">
                  <div className="w-12 h-12 mx-auto mb-2 rounded-full bg-gradient-to-br from-yellow-400 to-orange-500 flex items-center justify-center text-white font-bold text-lg">
                    {i + 1}
                  </div>
                  <p className="font-medium text-sm">{p.name}</p>
                  <p className="text-xs text-muted-foreground">{p.role}</p>
                  <div className="mt-2 text-sm">
                    {'patients' in p && <p><span className="font-bold text-blue-600">{p.patients}</span> patients</p>}
                    {'tests' in p && <p><span className="font-bold text-amber-600">{p.tests}</span> tests</p>}
                    {'dispensed' in p && <p><span className="font-bold text-violet-600">{p.dispensed}</span> dispensed</p>}
                    {'satisfaction' in p && <p><span className="text-emerald-600">{p.satisfaction}%</span> satisfaction</p>}
                    {'accuracy' in p && <p><span className="text-emerald-600">{p.accuracy}%</span> accuracy</p>}
                  </div>
                </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
            <FileText className="h-6 w-6" />
            <span>Generate Report</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
            <Calendar className="h-6 w-6" />
            <span>Schedule Review</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
            <Users className="h-6 w-6" />
            <span>Staff Overview</span>
          </Button>
          <Button variant="outline" className="h-auto py-4 flex flex-col gap-2">
            <Building2 className="h-6 w-6" />
            <span>Facility Status</span>
          </Button>
        </div>
      </div>
    </DashboardLayout>
  );
}
