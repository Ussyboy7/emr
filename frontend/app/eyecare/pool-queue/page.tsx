'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Eye, Search, Clock, CheckCircle2, AlertTriangle, Loader2, Users, Activity } from 'lucide-react';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { apiFetch } from '@/lib/api-client';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface EyeOrder {
  id: number;
  patient: number;
  patient_name: string;
  patient_id: string;
  ordered_by: number;
  ordered_by_name?: string;
  visit?: number;
  chief_complaint: string;
  visual_acuity_od: string;
  visual_acuity_os: string;
  visual_acuity_ou: string;
  diagnosis: string;
  priority: 'routine' | 'urgent' | 'stat';
  status: 'pending' | 'scheduled' | 'in_progress' | 'completed' | 'cancelled';
  ordered_at: string;
  scheduled_at: string | null;
}

export default function EyeClinicPoolQueuePage() {
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  
  const [orders, setOrders] = useState<EyeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeTab, setActiveTab] = useState('pending');

  useEffect(() => {
    loadOrders();
  }, [activeTab]);

  const loadOrders = async () => {
    try {
      const statusParam = activeTab === 'all' ? '' : `&status=${activeTab}`;
      const data = await apiFetch<{ results?: EyeOrder[] }>(`/eyecare/orders/?page_size=100${statusParam}`);
      setOrders(data.results || []);
    } catch (error) {
      console.error('Error loading eye orders:', error);
      toast.error('Failed to load eye clinic orders');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    return order.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           order.diagnosis.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getStatusBadge = (status: string) => {
    const variantMap: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
      pending: 'secondary',
      scheduled: 'default',
      in_progress: 'default',
      completed: 'outline',
      cancelled: 'destructive',
    };
    
    return <Badge variant={variantMap[status]}>{status.replace('_', ' ')}</Badge>;
  };

  const getPriorityBadge = (priority: string) => {
    const variantMap: Record<string, 'default' | 'secondary' | 'destructive'> = {
      routine: 'secondary',
      urgent: 'default',
      stat: 'destructive',
    };
    
    return <Badge variant={variantMap[priority]}>{priority}</Badge>;
  };

  const handleStartSession = (order: EyeOrder) => {
    toast.info(`Starting session for ${order.patient_name}`);
    // TODO: Implement start session logic
  };

  const handleSchedule = (order: EyeOrder) => {
    toast.info(`Scheduling appointment for ${order.patient_name}`);
    // TODO: Implement schedule logic
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Eye className="h-8 w-8 text-blue-500" />
              Eye Clinic Pool Queue
            </h1>
            <p className="text-muted-foreground mt-1">Manage eye care appointments and sessions</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Total Orders</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{orders.length}</div>
              <p className="text-xs text-muted-foreground mt-1">All orders</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <Clock className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders.filter(o => o.status === 'pending').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Awaiting review</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders.filter(o => o.status === 'scheduled').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Upcoming</p>
            </CardContent>
          </Card>
          
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">In Progress</CardTitle>
              <Activity className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">
                {orders.filter(o => o.status === 'in_progress').length}
              </div>
              <p className="text-xs text-muted-foreground mt-1">Current sessions</p>
            </CardContent>
          </Card>
        </div>

        {/* Tabs and Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                  <TabsTrigger value="pending">Pending</TabsTrigger>
                  <TabsTrigger value="scheduled">Scheduled</TabsTrigger>
                  <TabsTrigger value="in_progress">In Progress</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by patient name..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Patient Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No orders found</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredOrders.map((order) => (
                  <Card key={order.id}>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h3 className="font-semibold text-lg">{order.patient_name}</h3>
                            <span className="text-sm text-muted-foreground">{order.patient_id}</span>
                            {getPriorityBadge(order.priority)}
                            {getStatusBadge(order.status)}
                          </div>
                          
                          <div className="space-y-1 text-sm">
                            <div className="flex items-center gap-2">
                              <Clock className="h-4 w-4 text-muted-foreground" />
                              <span>Ordered: {format(new Date(order.ordered_at), 'MMM d, yyyy h:mm a')}</span>
                            </div>
                            
                            {order.scheduled_at && (
                              <div className="flex items-center gap-2">
                                <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
                                <span>Scheduled: {format(new Date(order.scheduled_at), 'MMM d, yyyy h:mm a')}</span>
                              </div>
                            )}
                            
                            {order.chief_complaint && (
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                <span>Complaint: {order.chief_complaint}</span>
                              </div>
                            )}
                            
                            {order.diagnosis && (
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                                <span>Diagnosis: {order.diagnosis}</span>
                              </div>
                            )}
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => {}}>
                            View
                          </Button>
                          
                          {order.status === 'pending' && (
                            <Button 
                              size="sm" 
                              onClick={() => handleSchedule(order)}
                              className="bg-blue-600 hover:bg-blue-700"
                            >
                              Schedule
                            </Button>
                          )}
                          
                          {order.status === 'scheduled' && (
                            <Button 
                              size="sm" 
                              onClick={() => handleStartSession(order)}
                              className="bg-green-600 hover:bg-green-700"
                            >
                              Start Session
                            </Button>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
