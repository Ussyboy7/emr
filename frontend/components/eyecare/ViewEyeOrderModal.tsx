'use client';

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Eye, Clock, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { format } from 'date-fns';
import { eyeCareService, type EyeOrder } from '@/lib/services/eye-care-service';
import { toast } from 'sonner';

interface ViewEyeOrderModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId?: number;
}

export function ViewEyeOrderModal({ open, onOpenChange, orderId }: ViewEyeOrderModalProps) {
  const [order, setOrder] = useState<EyeOrder | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (orderId && open) {
      loadOrder();
    }
  }, [orderId, open]);

  const loadOrder = async () => {
    if (!orderId) return;
    
    setLoading(true);
    try {
      const data = await eyeCareService.getOrder(orderId);
      setOrder(data);
    } catch (error: any) {
      console.error('Failed to load eye order:', error);
      toast.error('Failed to load order details');
    } finally {
      setLoading(false);
    }
  };

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5 text-blue-500" />
            Eye Care Order Details
          </DialogTitle>
          <DialogDescription>
            Comprehensive view of eye clinic examination and treatment
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Loading...</div>
        ) : order ? (
          <div className="space-y-4">
            {/* Patient Info */}
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-lg">{order.patient_name}</h3>
                  <div className="flex gap-2">
                    {getPriorityBadge(order.priority)}
                    {getStatusBadge(order.status)}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">Patient ID: {order.patient_id}</p>
              </CardContent>
            </Card>

            {/* Clinical Information */}
            <div className="grid gap-4">
              {/* Chief Complaint */}
              {order.chief_complaint && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <h4 className="font-medium mb-1">Chief Complaint</h4>
                        <p className="text-sm text-muted-foreground">{order.chief_complaint}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Visual Acuity */}
              {(order.visual_acuity_od || order.visual_acuity_os || order.visual_acuity_ou) && (
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-3 flex items-center gap-2">
                      <Eye className="h-4 w-4 text-muted-foreground" />
                      Visual Acuity
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      {order.visual_acuity_od && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">OD (Right)</div>
                          <div className="font-medium">{order.visual_acuity_od}</div>
                        </div>
                      )}
                      {order.visual_acuity_os && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">OS (Left)</div>
                          <div className="font-medium">{order.visual_acuity_os}</div>
                        </div>
                      )}
                      {order.visual_acuity_ou && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">OU (Both)</div>
                          <div className="font-medium">{order.visual_acuity_ou}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Refraction */}
              {(order.refraction_od || order.refraction_os) && (
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-3">Refraction</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {order.refraction_od && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">OD (Right)</div>
                          <div className="font-medium">{order.refraction_od}</div>
                        </div>
                      )}
                      {order.refraction_os && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">OS (Left)</div>
                          <div className="font-medium">{order.refraction_os}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* IOP */}
              {(order.iop_od || order.iop_os) && (
                <Card>
                  <CardContent className="p-4">
                    <h4 className="font-medium mb-3">Intraocular Pressure (mmHg)</h4>
                    <div className="grid grid-cols-2 gap-4">
                      {order.iop_od && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">OD (Right)</div>
                          <div className="font-medium">{order.iop_od}</div>
                        </div>
                      )}
                      {order.iop_os && (
                        <div>
                          <div className="text-xs text-muted-foreground mb-1">OS (Left)</div>
                          <div className="font-medium">{order.iop_os}</div>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Diagnosis */}
              {order.diagnosis && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-muted-foreground mt-1" />
                      <div>
                        <h4 className="font-medium mb-1">Diagnosis</h4>
                        <p className="text-sm text-muted-foreground">{order.diagnosis}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Treatment Plan */}
              {order.treatment_plan && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-1" />
                      <div>
                        <h4 className="font-medium mb-1">Treatment Plan</h4>
                        <p className="text-sm text-muted-foreground">{order.treatment_plan}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Special Instructions */}
              {order.special_instructions && (
                <Card>
                  <CardContent className="p-4">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500 mt-1" />
                      <div>
                        <h4 className="font-medium mb-1">Special Instructions</h4>
                        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{order.special_instructions}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* Timestamps */}
              <Card>
                <CardContent className="p-4">
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Clock className="h-4 w-4 text-muted-foreground" />
                    Timeline
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <span>Ordered: {format(new Date(order.ordered_at), 'MMM d, yyyy h:mm a')}</span>
                    </div>
                    {order.scheduled_at && (
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <span>Scheduled: {format(new Date(order.scheduled_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                    )}
                    {order.completed_at && (
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>Completed: {format(new Date(order.completed_at), 'MMM d, yyyy h:mm a')}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
          <div className="py-8 text-center text-muted-foreground">Order not found</div>
        )}

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
