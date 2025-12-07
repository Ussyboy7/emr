"use client";

import { useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { 
  Pill, ClipboardList, Package, Database, AlertTriangle, Clock,
  CheckCircle2, ArrowRight, History, User, TrendingUp
} from 'lucide-react';

const stats = [
  { label: 'Pending Rx', value: 5, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
  { label: 'Dispensed Today', value: 23, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
  { label: 'Low Stock', value: 3, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  { label: 'Total Inventory', value: 156, icon: Database, color: 'text-violet-500', bg: 'bg-violet-500/10' },
];

const pendingPrescriptions = [
  { id: 'RX-001', patient: 'Adebayo Johnson', medications: ['Metformin 500mg', 'Glibenclamide 5mg'], doctor: 'Dr. Amaka', time: '10 min ago', priority: 'medium' },
  { id: 'RX-002', patient: 'Fatima Mohammed', medications: ['Methyldopa 250mg'], doctor: 'Dr. Ngozi', time: '15 min ago', priority: 'high' },
  { id: 'RX-003', patient: 'Chukwu Emeka', medications: ['Furosemide 40mg', 'Lisinopril 10mg', 'Clopidogrel 75mg'], doctor: 'Dr. Chidi', time: '20 min ago', priority: 'medium' },
  { id: 'RX-004', patient: 'Ibrahim Suleiman', medications: ['Folic Acid 5mg', 'Hydroxyurea 500mg'], doctor: 'Dr. Fatima', time: '30 min ago', priority: 'emergency' },
];

const lowStockItems = [
  { name: 'Lisinopril 10mg', stock: 45, reorderLevel: 80, status: 'Low Stock' },
  { name: 'Clopidogrel 75mg', stock: 15, reorderLevel: 50, status: 'Critical' },
  { name: 'Hydroxyurea 500mg', stock: 0, reorderLevel: 30, status: 'Out of Stock' },
];

const recentDispenses = [
  { id: 'DISP-001', patient: 'Grace Okonkwo', items: 2, pharmacist: 'Pharm. Chioma', time: '5 min ago' },
  { id: 'DISP-002', patient: 'Oluwaseun Adeleke', items: 3, pharmacist: 'Pharm. Ahmed', time: '12 min ago' },
  { id: 'DISP-003', patient: 'Aisha Yusuf', items: 2, pharmacist: 'Pharm. Chioma', time: '25 min ago' },
];

export default function PharmacyDashboardPage() {
  const router = useRouter();

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'emergency': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      case 'high': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      default: return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
    }
  };

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'Out of Stock': return 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      case 'Critical': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      default: return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400';
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <Pill className="h-8 w-8 text-violet-500" />
              Pharmacy
            </h1>
            <p className="text-muted-foreground mt-1">Prescription management, dispensing, and inventory control</p>
          </div>
        </div>

        {/* Stats */}
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

        {/* Quick Actions */}
        <div className="grid grid-cols-3 gap-4">
          <Button 
            onClick={() => router.push('/pharmacy/prescriptions')} 
            className="h-auto py-4 flex flex-col items-center gap-2 bg-gradient-to-br from-violet-500 to-purple-500 hover:from-violet-600 hover:to-purple-600 text-white"
          >
            <ClipboardList className="h-6 w-6" />
            <span>Prescriptions Queue</span>
          </Button>
          <Button 
            onClick={() => router.push('/pharmacy/history')} 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2 border-violet-500/30 hover:bg-violet-500/10"
          >
            <History className="h-6 w-6 text-violet-500" />
            <span>Dispense History</span>
          </Button>
          <Button 
            onClick={() => router.push('/pharmacy/inventory')} 
            variant="outline" 
            className="h-auto py-4 flex flex-col items-center gap-2 border-violet-500/30 hover:bg-violet-500/10"
          >
            <Database className="h-6 w-6 text-violet-500" />
            <span>Inventory</span>
          </Button>
        </div>

        {/* Main Content */}
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Pending Prescriptions */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <ClipboardList className="h-5 w-5 text-violet-500" />
                  Pending Prescriptions
                </CardTitle>
                <Button variant="ghost" size="sm" onClick={() => router.push('/pharmacy/prescriptions')}>
                  View All<ArrowRight className="h-4 w-4 ml-1" />
                </Button>
              </CardHeader>
              <CardContent className="space-y-3">
                {pendingPrescriptions.map((rx) => (
                  <div key={rx.id} className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-colors">
                    <div className="flex items-center gap-3">
                      <div className={`p-2 rounded-full ${rx.priority === 'emergency' ? 'bg-red-500/10' : 'bg-violet-500/10'}`}>
                        <User className={`h-4 w-4 ${rx.priority === 'emergency' ? 'text-red-500' : 'text-violet-500'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium text-foreground">{rx.patient}</p>
                          <Badge variant="outline" className={getPriorityColor(rx.priority)}>
                            {rx.priority === 'emergency' ? 'URGENT' : rx.priority}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">{rx.medications.join(', ')}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <p className="text-xs text-muted-foreground">{rx.doctor}</p>
                        <p className="text-xs text-muted-foreground">{rx.time}</p>
                      </div>
                      <Button size="sm" className="bg-violet-500 hover:bg-violet-600 text-white">Dispense</Button>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>

          {/* Side Panel */}
          <div className="space-y-6">
            {/* Low Stock Alert */}
            <Card className="border-amber-200 dark:border-amber-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  Stock Alerts
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {lowStockItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Reorder at: {item.reorderLevel}</p>
                    </div>
                    <Badge variant="outline" className={getStockStatusColor(item.status)}>
                      {item.stock === 0 ? 'Out' : item.stock}
                    </Badge>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => router.push('/pharmacy/inventory?filter=low')}
                >
                  View All Alerts
                </Button>
              </CardContent>
            </Card>

            {/* Recent Dispenses */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg flex items-center gap-2">
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  Recent Dispenses
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {recentDispenses.map((dispense) => (
                  <div key={dispense.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground text-sm">{dispense.patient}</p>
                      <p className="text-xs text-muted-foreground">{dispense.pharmacist} • {dispense.items} items</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{dispense.time}</span>
                  </div>
                ))}
                <Button 
                  variant="outline" 
                  className="w-full" 
                  onClick={() => router.push('/pharmacy/history')}
                >
                  View History
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
