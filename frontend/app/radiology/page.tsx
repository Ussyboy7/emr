"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { 
  ScanLine, FileBarChart, Image as ImageIcon, Clock,
  CheckCircle2, AlertTriangle, ArrowRight, Activity, ClipboardList
} from 'lucide-react';

const stats = [
  { label: 'Pending Orders', value: 3, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { label: 'In Progress', value: 2, icon: Activity, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { label: 'Awaiting Report', value: 4, icon: FileBarChart, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  { label: 'Critical Findings', value: 1, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
];

const pendingOrders = [
  { id: 'RAD-2024-001', patient: 'Adebayo Johnson', procedure: 'Chest X-Ray PA/Lateral', priority: 'Urgent', time: '30m ago', orderedBy: 'Dr. Amaka Obi' },
  { id: 'RAD-2024-002', patient: 'Fatima Mohammed', procedure: 'Abdominal Ultrasound', priority: 'Routine', time: '45m ago', orderedBy: 'Dr. Ngozi Eze' },
  { id: 'RAD-2024-003', patient: 'Chukwu Emeka', procedure: 'CT Head without Contrast', priority: 'STAT', time: '5m ago', orderedBy: 'Dr. Chidi Okafor' },
];

const recentReports = [
  { patient: 'Ngozi Eze', study: 'Mammography Bilateral', finding: 'BI-RADS 1: Negative', radiologist: 'Dr. Obi', time: '15m ago', status: 'Verified' },
  { patient: 'Grace Okonkwo', study: 'Lumbar Spine X-Ray', finding: 'Degenerative disc disease L4-L5', radiologist: 'Dr. Obi', time: '30m ago', status: 'Verified' },
  { patient: 'Ibrahim Suleiman', study: 'MRI Brain with Contrast', finding: 'Acute left MCA territory infarct', radiologist: 'Dr. Adeyemi', time: '1h ago', status: 'Critical', critical: true },
];

export default function RadiologyDashboardPage() {
  const router = useRouter();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ScanLine className="h-8 w-8 text-cyan-500" />
              Radiology
            </h1>
            <p className="text-muted-foreground mt-1">Medical imaging, study processing, and radiologist reporting</p>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-muted-foreground">{stat.label}</p>
                    <p className={`text-3xl font-bold ${stat.color} mt-1`}>{stat.value}</p>
                  </div>
                  <div className={`p-3 rounded-full ${stat.bg}`}><stat.icon className={`h-5 w-5 ${stat.color}`} /></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Button onClick={() => router.push('/radiology/studies')} className="h-auto py-4 flex flex-col items-center gap-2 bg-gradient-to-br from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600 text-white">
            <ClipboardList className="h-6 w-6" />
            <span>Orders Queue</span>
            <span className="text-xs opacity-80">Process incoming orders</span>
          </Button>
          <Button onClick={() => router.push('/radiology/reports')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-cyan-500/30 hover:bg-cyan-500/10">
            <FileBarChart className="h-6 w-6 text-cyan-500" />
            <span>Reports</span>
            <span className="text-xs text-muted-foreground">Create & verify reports</span>
          </Button>
          <Button onClick={() => router.push('/radiology/viewer')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-cyan-500/30 hover:bg-cyan-500/10">
            <ImageIcon className="h-6 w-6 text-cyan-500" />
            <span>Image Viewer</span>
            <span className="text-xs text-muted-foreground">View DICOM images</span>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Clock className="h-5 w-5 text-amber-500" />
                  Pending Orders
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push('/radiology/studies')}>
                  View All<ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingOrders.map((order) => (
                  <div 
                    key={order.id} 
                    className={`flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors ${
                      order.priority === 'STAT' ? 'border-l-4 border-l-rose-500 bg-rose-50/50 dark:bg-rose-900/10' : 
                      order.priority === 'Urgent' ? 'border-l-4 border-l-orange-500' : 
                      'border-l-4 border-l-cyan-500'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                        order.priority === 'STAT' ? 'bg-rose-100 dark:bg-rose-900/30' : 
                        order.priority === 'Urgent' ? 'bg-orange-100 dark:bg-orange-900/30' : 
                        'bg-cyan-100 dark:bg-cyan-900/30'
                      }`}>
                        <ScanLine className={`h-5 w-5 ${
                          order.priority === 'STAT' ? 'text-rose-500' : 
                          order.priority === 'Urgent' ? 'text-orange-500' : 
                          'text-cyan-500'
                        }`} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{order.patient}</p>
                        <p className="text-xs text-muted-foreground">{order.procedure}</p>
                        <p className="text-xs text-muted-foreground">By {order.orderedBy}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Badge variant="outline" className={
                          order.priority === 'STAT' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' : 
                          order.priority === 'Urgent' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 
                          ''
                        }>
                          {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                          {order.priority}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">{order.time}</p>
                      </div>
                      <Button size="sm" className="bg-cyan-500 hover:bg-cyan-600 text-white">Process</Button>
                    </div>
                  </div>
                ))}
                {pendingOrders.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-12 w-12 mx-auto mb-2 opacity-50" />
                    <p>No pending orders</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <FileBarChart className="h-5 w-5 text-emerald-500" />
                Recent Reports
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {recentReports.map((report, i) => (
                <div key={i} className={`flex items-start gap-3 ${report.critical ? 'p-2 rounded-lg bg-rose-50 dark:bg-rose-900/10 border border-rose-200 dark:border-rose-800' : ''}`}>
                  <div className={`p-2 rounded-full ${report.critical ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                    {report.critical ? (
                      <AlertTriangle className="h-4 w-4 text-rose-500" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{report.patient}</p>
                    <p className="text-xs text-muted-foreground">{report.study}</p>
                    <p className={`text-xs mt-1 ${report.critical ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-emerald-600 dark:text-emerald-400'}`}>
                      {report.finding}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-xs text-muted-foreground">{report.radiologist}</span>
                      <span className="text-xs text-muted-foreground">•</span>
                      <span className="text-xs text-muted-foreground">{report.time}</span>
                    </div>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Workflow Info */}
        <Card className="border-dashed">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-3">
              <Activity className="h-4 w-4" />
              <span className="font-medium">Radiology Workflow</span>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className="bg-amber-50 dark:bg-amber-900/20">1. Receive Order</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="bg-cyan-50 dark:bg-cyan-900/20">2. Schedule</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="bg-blue-50 dark:bg-blue-900/20">3. Perform Study</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="bg-violet-50 dark:bg-violet-900/20">4. Upload Images</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="bg-purple-50 dark:bg-purple-900/20">5. Create Report</Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className="bg-emerald-50 dark:bg-emerald-900/20">6. Verify & Send</Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
