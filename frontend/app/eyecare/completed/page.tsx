'use client';

import { useEffect, useState } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Eye, Search, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
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
  diagnosis: string;
  treatment_plan: string;
  status: 'completed' | 'cancelled';
  ordered_at: string;
  completed_at: string | null;
}

export default function EyeClinicCompletedPage() {
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  
  const [orders, setOrders] = useState<EyeOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    loadOrders();
  }, []);

  const loadOrders = async () => {
    try {
      const data = await apiFetch<{ results?: EyeOrder[] }>('/eyecare/orders/?status=completed&page_size=100');
      setOrders(data.results || []);
    } catch (error) {
      console.error('Error loading completed eye orders:', error);
      toast.error('Failed to load completed orders');
    } finally {
      setLoading(false);
    }
  };

  const filteredOrders = orders.filter(order => {
    return order.patient_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
           order.diagnosis.toLowerCase().includes(searchTerm.toLowerCase());
  });

  const getStatusBadge = (status: string) => {
    const variantMap: Record<string, 'outline' | 'destructive'> = {
      completed: 'outline',
      cancelled: 'destructive',
    };
    
    return <Badge variant={variantMap[status]}>{status}</Badge>;
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-2">
              <Eye className="h-8 w-8 text-green-500" />
              Completed Eye Orders
            </h1>
            <p className="text-muted-foreground mt-1">History of completed and cancelled orders</p>
          </div>
        </div>

        {/* Stats */}
        <Card>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <div>
                <div className="text-3xl font-bold">{orders.length}</div>
                <p className="text-sm text-muted-foreground">Total completed/cancelled orders</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Filter */}
        <Card>
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by patient name or diagnosis..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Orders List */}
        <Card>
          <CardHeader>
            <CardTitle>Completed Orders</CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No completed orders found</p>
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
                            {getStatusBadge(order.status)}
                          </div>
                          
                          <div className="space-y-1 text-sm">
                            {order.diagnosis && (
                              <div className="flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-muted-foreground" />
                                <span>Diagnosis: {order.diagnosis}</span>
                              </div>
                            )}
                            
                            {order.treatment_plan && (
                              <div className="flex items-center gap-2">
                                <Eye className="h-4 w-4 text-muted-foreground" />
                                <span>Treatment: {order.treatment_plan}</span>
                              </div>
                            )}
                            
                            <div className="flex items-center gap-2 text-xs text-muted-foreground">
                              <CheckCircle2 className="h-3 w-3" />
                              <span>Completed: {order.completed_at ? format(new Date(order.completed_at), 'MMM d, yyyy h:mm a') : 'N/A'}</span>
                            </div>
                          </div>
                        </div>
                        
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => {}}>
                            View Details
                          </Button>
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
