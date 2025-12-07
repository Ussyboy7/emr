"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Bar, BarChart, CartesianGrid, Legend, Line, LineChart, PieChart, Pie, Cell,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Area, AreaChart, RadialBarChart, RadialBar
} from 'recharts';
import {
  TrendingUp, TrendingDown, Users, Stethoscope, TestTube, Pill, Calendar,
  Clock, Activity, Heart, FileText, Download, RefreshCw, Building2,
  AlertTriangle, CheckCircle2, Target, Award, Zap, DollarSign, Bed,
  UserCheck, ArrowRight, ArrowUp, ArrowDown
} from 'lucide-react';

// Executive KPIs
const kpiData = {
  patientSatisfaction: { value: 91, target: 90, trend: 2.5 },
  avgWaitTime: { value: 22, target: 20, trend: -5.2 },
  bedOccupancy: { value: 78, target: 85, trend: 3.1 },
  staffUtilization: { value: 82, target: 80, trend: 1.8 },
  operationalEfficiency: { value: 88, target: 85, trend: 4.2 },
  clinicalOutcomes: { value: 94, target: 92, trend: 1.5 },
};

// Monthly performance data
const monthlyPerformance = [
  { month: 'Jan', patients: 3250, revenue: 125, satisfaction: 88, efficiency: 82 },
  { month: 'Feb', patients: 3480, revenue: 132, satisfaction: 89, efficiency: 84 },
  { month: 'Mar', patients: 3720, revenue: 145, satisfaction: 90, efficiency: 85 },
  { month: 'Apr', patients: 3520, revenue: 138, satisfaction: 89, efficiency: 83 },
  { month: 'May', patients: 3890, revenue: 155, satisfaction: 91, efficiency: 87 },
  { month: 'Jun', patients: 3780, revenue: 148, satisfaction: 90, efficiency: 86 },
  { month: 'Jul', patients: 4020, revenue: 162, satisfaction: 91, efficiency: 88 },
  { month: 'Aug', patients: 4250, revenue: 172, satisfaction: 92, efficiency: 89 },
  { month: 'Sep', patients: 4120, revenue: 168, satisfaction: 91, efficiency: 88 },
  { month: 'Oct', patients: 4380, revenue: 178, satisfaction: 92, efficiency: 90 },
  { month: 'Nov', patients: 4250, revenue: 175, satisfaction: 91, efficiency: 89 },
  { month: 'Dec', patients: 3980, revenue: 165, satisfaction: 90, efficiency: 87 },
];

// Department comparison
const departmentComparison = [
  { name: 'General Clinic', patients: 1850, satisfaction: 92, waitTime: 18, efficiency: 89 },
  { name: 'Eye Clinic', patients: 620, satisfaction: 94, waitTime: 15, efficiency: 91 },
  { name: 'Sickle Cell', patients: 480, satisfaction: 96, waitTime: 12, efficiency: 93 },
  { name: 'Physiotherapy', patients: 320, satisfaction: 95, waitTime: 10, efficiency: 92 },
  { name: 'Diamond Clinic', patients: 280, satisfaction: 97, waitTime: 8, efficiency: 95 },
];

// Resource utilization
const resourceUtilization = [
  { resource: 'Doctors', utilization: 85, fill: '#3b82f6' },
  { resource: 'Nurses', utilization: 92, fill: '#10b981' },
  { resource: 'Lab Techs', utilization: 78, fill: '#f59e0b' },
  { resource: 'Pharmacists', utilization: 88, fill: '#8b5cf6' },
  { resource: 'Rooms', utilization: 72, fill: '#06b6d4' },
];

// Quality indicators
const qualityIndicators = [
  { indicator: 'Patient Safety', score: 96, target: 95, status: 'above' },
  { indicator: 'Clinical Accuracy', score: 98, target: 97, status: 'above' },
  { indicator: 'Medication Safety', score: 99, target: 98, status: 'above' },
  { indicator: 'Infection Control', score: 94, target: 95, status: 'below' },
  { indicator: 'Documentation', score: 91, target: 90, status: 'above' },
  { indicator: 'Follow-up Compliance', score: 87, target: 90, status: 'below' },
];

// Top performers
const topPerformers = [
  { name: 'Dr. Amaka Eze', role: 'Physician', patients: 245, satisfaction: 98 },
  { name: 'Dr. Chidi Okafor', role: 'Physician', patients: 232, satisfaction: 97 },
  { name: 'Nurse Ada Nwosu', role: 'Senior Nurse', patients: 380, satisfaction: 96 },
  { name: 'Mr. Emeka Obi', role: 'Lab Scientist', tests: 520, accuracy: 99.5 },
  { name: 'Mrs. Fatima Ibrahim', role: 'Pharmacist', dispensed: 890, accuracy: 99.8 },
];

// Alerts and issues
const criticalAlerts = [
  { type: 'warning', message: 'Lab equipment maintenance due in 3 days', department: 'Laboratory' },
  { type: 'critical', message: '5 medications reaching critical stock level', department: 'Pharmacy' },
  { type: 'info', message: '3 staff licenses expiring next month', department: 'HR' },
  { type: 'warning', message: 'Eye clinic wait time exceeds target by 15%', department: 'Eye Clinic' },
];

export default function ExecutiveDashboardPage() {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await new Promise(r => setTimeout(r, 1500));
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
        {criticalAlerts.length > 0 && (
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
          {Object.entries(kpiData).map(([key, data]) => {
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
          })}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Performance Trend */}
          <Card className="lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Activity className="h-5 w-5 text-indigo-500" />Performance Trend</CardTitle>
              <CardDescription>Monthly patient volume and satisfaction</CardDescription>
            </CardHeader>
            <CardContent>
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
            </CardContent>
          </Card>

          {/* Resource Utilization */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-teal-500" />Resource Utilization</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {resourceUtilization.map(r => (
                  <div key={r.resource}>
                    <div className="flex justify-between text-sm mb-1">
                      <span>{r.resource}</span>
                      <span className="font-medium">{r.utilization}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="h-2 rounded-full" style={{ width: `${r.utilization}%`, backgroundColor: r.fill }} />
                    </div>
                  </div>
                ))}
              </div>
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
            </CardContent>
          </Card>

          {/* Quality Indicators */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Award className="h-5 w-5 text-amber-500" />Quality Indicators</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {qualityIndicators.map(q => (
                  <div key={q.indicator} className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${q.status === 'above' ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                    <div className="flex-1">
                      <div className="flex justify-between">
                        <span className="text-sm font-medium">{q.indicator}</span>
                        <span className={`text-sm font-bold ${q.status === 'above' ? 'text-emerald-600' : 'text-rose-600'}`}>{q.score}%</span>
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>Target: {q.target}%</span>
                        <span className={q.status === 'above' ? 'text-emerald-500' : 'text-rose-500'}>
                          {q.status === 'above' ? '+' : ''}{q.score - q.target}%
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Top Performers */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Zap className="h-5 w-5 text-yellow-500" />Top Performers This Month</CardTitle>
          </CardHeader>
          <CardContent>
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
