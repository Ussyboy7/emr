"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  FlaskConical, TestTube, FileSearch, FilePlus, Clock,
  CheckCircle2, AlertTriangle, ArrowRight
} from 'lucide-react';

const stats = [
  { label: 'Pending Tests', value: 23, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { label: 'In Progress', value: 15, icon: FlaskConical, color: 'text-blue-500', bg: 'bg-blue-500/10' },
  { label: 'Results Ready', value: 42, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { label: 'Critical', value: 3, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
];

const pendingOrders = [
  { id: 'LAB-001', patient: 'Adebayo Johnson', tests: ['FBS', 'HbA1c'], priority: 'routine', time: '30 min ago' },
  { id: 'LAB-002', patient: 'Fatima Mohammed', tests: ['CBC', 'Urinalysis'], priority: 'urgent', time: '15 min ago' },
  { id: 'LAB-003', patient: 'Chukwu Emeka', tests: ['Lipid Profile', 'LFT', 'RFT'], priority: 'routine', time: '1 hour ago' },
  { id: 'LAB-004', patient: 'Grace Okonkwo', tests: ['Serum Electrolytes'], priority: 'stat', time: '5 min ago' },
];

const recentResults = [
  { patient: 'Ngozi Eze', test: 'Complete Blood Count', result: 'Normal', time: '10 min ago' },
  { patient: 'Olumide Afolabi', test: 'Fasting Blood Sugar', result: '126 mg/dL - High', time: '25 min ago' },
  { patient: 'Amina Bello', test: 'Liver Function Test', result: 'Normal', time: '45 min ago' },
];

export default function LaboratoryDashboardPage() {
  const router = useRouter();

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <FlaskConical className="h-8 w-8 text-amber-500" />
              Laboratory
            </h1>
            <p className="text-muted-foreground mt-1">Lab test ordering, specimen tracking, and results management</p>
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button onClick={() => router.push('/laboratory/orders')} className="h-auto py-4 flex flex-col items-center gap-2 bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white">
            <TestTube className="h-6 w-6" />
            <span>Lab Orders</span>
          </Button>
          <Button onClick={() => router.push('/laboratory/verification')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-amber-500/30 hover:bg-amber-500/10">
            <FileSearch className="h-6 w-6 text-amber-500" />
            <span>Verify Results</span>
          </Button>
          <Button onClick={() => router.push('/laboratory/completed')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-amber-500/30 hover:bg-amber-500/10">
            <CheckCircle2 className="h-6 w-6 text-amber-500" />
            <span>Completed Tests</span>
          </Button>
          <Button onClick={() => router.push('/laboratory/templates')} variant="outline" className="h-auto py-4 flex flex-col items-center gap-2 border-amber-500/30 hover:bg-amber-500/10">
            <FilePlus className="h-6 w-6 text-amber-500" />
            <span>Test Templates</span>
          </Button>
        </div>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg">Pending Orders</CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push('/laboratory/orders')}>View All<ArrowRight className="h-4 w-4 ml-1" /></Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${order.priority === 'stat' ? 'bg-rose-500/10' : order.priority === 'urgent' ? 'bg-amber-500/10' : 'bg-blue-500/10'}`}>
                        <TestTube className={`h-4 w-4 ${order.priority === 'stat' ? 'text-rose-500' : order.priority === 'urgent' ? 'text-amber-500' : 'text-blue-500'}`} />
                      </div>
                      <div>
                        <p className="font-medium text-foreground">{order.patient}</p>
                        <p className="text-xs text-muted-foreground">{order.tests.join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <Badge variant="outline" className={order.priority === 'stat' ? 'border-rose-500/50 text-rose-600' : order.priority === 'urgent' ? 'border-amber-500/50 text-amber-600' : ''}>
                          {order.priority.toUpperCase()}
                        </Badge>
                        <p className="text-xs text-muted-foreground mt-1">{order.time}</p>
                      </div>
                      <Button size="sm" className="bg-amber-500 hover:bg-amber-600 text-white">Process</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Recent Results</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {recentResults.map((result, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{result.patient}</p>
                    <p className="text-xs text-muted-foreground">{result.test}</p>
                    <p className={`text-xs mt-1 ${result.result.includes('High') || result.result.includes('Low') ? 'text-amber-500' : 'text-emerald-500'}`}>{result.result}</p>
                    <p className="text-xs text-muted-foreground">{result.time}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
