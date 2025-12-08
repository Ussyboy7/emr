"use client";

import { useState, useEffect } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { labService } from '@/lib/services';
import { 
  FlaskConical, TestTube, FileSearch, FilePlus, Clock,
  CheckCircle2, AlertTriangle, ArrowRight, Loader2
} from 'lucide-react';

export default function LaboratoryDashboardPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState([
    { label: 'Pending Tests', value: 0, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
    { label: 'In Progress', value: 0, icon: FlaskConical, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { label: 'Results Ready', value: 0, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
    { label: 'Critical', value: 0, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
  ]);
  const [pendingOrders, setPendingOrders] = useState<Array<{
    id: string;
    patient: string;
    tests: string[];
    priority: string;
    time: string;
  }>>([]);
  const [recentResults, setRecentResults] = useState<Array<{
    patient: string;
    test: string;
    result: string;
    time: string;
  }>>([]);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      setLoading(true);
      
      // Load stats
      const statsData = await labService.getStats();
      setStats([
        { label: 'Pending Tests', value: statsData.pendingTests, icon: Clock, color: 'text-amber-500', bg: 'bg-amber-500/10' },
        { label: 'In Progress', value: statsData.inProgress, icon: FlaskConical, color: 'text-blue-500', bg: 'bg-blue-500/10' },
        { label: 'Results Ready', value: statsData.resultsReady, icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' },
        { label: 'Critical', value: statsData.critical, icon: AlertTriangle, color: 'text-rose-500', bg: 'bg-rose-500/10' },
      ]);

      // Load pending orders (first 4 with pending tests)
      const ordersResponse = await labService.getOrders({ page: 1 });
      const pending = ordersResponse.results
        .filter(order => order.tests.some(t => t.status === 'pending'))
        .slice(0, 4)
        .map(order => {
          const pendingTests = order.tests.filter(t => t.status === 'pending');
          const orderedAt = new Date(order.ordered_at);
          const now = new Date();
          const diffMs = now.getTime() - orderedAt.getTime();
          const diffMins = Math.floor(diffMs / 60000);
          const time = diffMins < 60 ? `${diffMins} min ago` : `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? 's' : ''} ago`;
          
          return {
            id: order.order_id,
            patient: order.patient.name,
            tests: pendingTests.map(t => t.code || t.name),
            priority: order.priority,
            time,
          };
        });
      setPendingOrders(pending);

      // Load recent results (last 3 verified tests)
      const completedResponse = await labService.getCompletedTests({ page_size: 3 });
      const recent = completedResponse.results.slice(0, 3).map((test: any) => {
        const completedAt = new Date(test.processed_at || test.verified_at || new Date());
        const now = new Date();
        const diffMs = now.getTime() - completedAt.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const time = diffMins < 60 ? `${diffMins} min ago` : `${Math.floor(diffMins / 60)} hour${Math.floor(diffMins / 60) > 1 ? 's' : ''} ago`;
        
        const overallStatus = test.overall_status || 'normal';
        const result = overallStatus === 'normal' ? 'Normal' : overallStatus === 'abnormal' ? 'Abnormal' : 'Critical';
        
        return {
          patient: test.patient_name || 'Unknown',
          test: test.name,
          result,
          time,
        };
      });
      setRecentResults(recent);
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

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
                {loading ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                    <p>Loading orders...</p>
                  </div>
                ) : pendingOrders.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <TestTube className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No pending orders</p>
                  </div>
                ) : (
                  pendingOrders.map((order) => (
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
                  ))
                )}
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-lg">Recent Results</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Loader2 className="h-8 w-8 mx-auto mb-2 animate-spin" />
                  <p>Loading results...</p>
                </div>
              ) : recentResults.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle2 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No recent results</p>
                </div>
              ) : (
                recentResults.map((result, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="p-2 rounded-full bg-emerald-500/10"><CheckCircle2 className="h-4 w-4 text-emerald-500" /></div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-foreground text-sm">{result.patient}</p>
                    <p className="text-xs text-muted-foreground">{result.test}</p>
                    <p className={`text-xs mt-1 ${result.result.includes('High') || result.result.includes('Low') ? 'text-amber-500' : 'text-emerald-500'}`}>{result.result}</p>
                    <p className="text-xs text-muted-foreground">{result.time}</p>
                  </div>
                </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
