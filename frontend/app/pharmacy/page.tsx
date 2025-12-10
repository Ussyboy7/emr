"use client";

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useRouter } from 'next/navigation';
import { pharmacyService } from '@/lib/services';
import { 
  Pill, ClipboardList, Package, Database, AlertTriangle, Clock,
  CheckCircle2, ArrowRight, History, User, TrendingUp, Loader2
} from 'lucide-react';

export default function PharmacyDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { label: 'Pending Rx', value: 0, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'Dispensed Today', value: 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Low Stock', value: 0, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
    { label: 'Total Inventory', value: 0, icon: Database, color: 'text-violet-500', bg: 'bg-violet-500/10' },
  ]);
  const [pendingPrescriptions, setPendingPrescriptions] = useState<Array<{
    id: string;
    patient: string;
    medications: string[];
    doctor: string;
    time: string;
    priority: string;
  }>>([]);
  const [lowStockItems, setLowStockItems] = useState<Array<{
    name: string;
    stock: number;
    reorderLevel: number;
    status: string;
  }>>([]);
  const [recentDispenses, setRecentDispenses] = useState<Array<{
    id: string;
    patient: string;
    items: number;
    pharmacist: string;
    time: string;
  }>>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load stats
      const statsData = await pharmacyService.getStats();
      setStats([
        { label: 'Pending Rx', value: statsData.pendingRx, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'Dispensed Today', value: statsData.dispensedToday, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { label: 'Low Stock', value: statsData.lowStock, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
        { label: 'Total Inventory', value: statsData.totalInventory, icon: Database, color: 'text-violet-500', bg: 'bg-violet-500/10' },
      ]);

      // Load pending prescriptions (first 4)
      const prescriptionsResponse = await pharmacyService.getPrescriptions({ status: 'pending', page: 1 });
      const pending = prescriptionsResponse.results.slice(0, 4).map((rx: any) => {
        const patientName = rx.patient_name || (rx.patient_details?.name) || 'Unknown';
        const medications = (rx.medications || []).slice(0, 2).map((med: any) => 
          med.medication_name || med.medication_details?.name || ''
        );
        const doctorName = rx.doctor_name || '';
        const prescribedAt = new Date(rx.prescribed_at);
        const now = new Date();
        const diffMs = now.getTime() - prescribedAt.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const time = diffMins < 60 ? `${diffMins} min ago` : `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? 's' : ''} ago`;
        
        return {
          id: rx.prescription_id || rx.id.toString(),
          patient: patientName,
          medications,
          doctor: doctorName,
          time,
          priority: rx.priority || 'medium',
        };
      });
      setPendingPrescriptions(pending);

      // Load low stock items
      const alertsResponse = await pharmacyService.getInventoryAlerts({ type: 'low_stock', page: 1 });
      const lowStock = alertsResponse.results.slice(0, 3).map((item: any) => ({
        name: item.medication_name || 'Unknown',
        stock: Number(item.quantity),
        reorderLevel: Number(item.min_stock_level),
        status: Number(item.quantity) === 0 ? 'Out of Stock' : Number(item.quantity) <= Number(item.min_stock_level) * 0.5 ? 'Critical' : 'Low Stock',
      }));
      setLowStockItems(lowStock);

      // Load recent dispenses (last 3)
      const historyResponse = await pharmacyService.getDispenseHistory({ page: 1 });
      const recent = historyResponse.results.slice(0, 3).map((dispense: any) => {
        const dispensedAt = new Date(dispense.dispensed_at);
        const now = new Date();
        const diffMs = now.getTime() - dispensedAt.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const time = diffMins < 60 ? `${diffMins} min ago` : `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? 's' : ''} ago`;
        
        return {
          id: dispense.dispense_id || dispense.id.toString(),
          patient: dispense.patient_name || 'Unknown',
          items: 1, // Could be enhanced to count items from prescription
          pharmacist: dispense.dispensed_by_name || '',
          time,
        };
      });
      setRecentDispenses(recent);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

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
            stats.map((stat, i) => (
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
            ))
          )}
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
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading prescriptions...</p>
                  </div>
                ) : pendingPrescriptions.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <ClipboardList className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No pending prescriptions</p>
                  </div>
                ) : (
                  pendingPrescriptions.map((rx) => (
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
                      <Button 
                        size="sm" 
                        className="bg-violet-500 hover:bg-violet-600 text-white"
                        onClick={(e) => {
                          e.stopPropagation();
                          router.push(`/pharmacy/prescriptions?rx=${rx.id}`);
                        }}
                      >
                        Dispense
                      </Button>
                    </div>
                  </div>
                  ))
                )}
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
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading alerts...</p>
                  </div>
                ) : lowStockItems.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No stock alerts</p>
                  </div>
                ) : (
                  lowStockItems.map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground text-sm">{item.name}</p>
                      <p className="text-xs text-muted-foreground">Reorder at: {item.reorderLevel}</p>
                    </div>
                    <Badge variant="outline" className={getStockStatusColor(item.status)}>
                      {item.stock === 0 ? 'Out' : item.stock}
                    </Badge>
                  </div>
                  ))
                )}
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
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading history...</p>
                  </div>
                ) : recentDispenses.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No recent dispenses</p>
                  </div>
                ) : (
                  recentDispenses.map((dispense) => (
                  <div key={dispense.id} className="flex items-center justify-between p-2 rounded-lg bg-muted/50">
                    <div>
                      <p className="font-medium text-foreground text-sm">{dispense.patient}</p>
                      <p className="text-xs text-muted-foreground">{dispense.pharmacist} • {dispense.items} items</p>
                    </div>
                    <span className="text-xs text-muted-foreground">{dispense.time}</span>
                  </div>
                  ))
                )}
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
