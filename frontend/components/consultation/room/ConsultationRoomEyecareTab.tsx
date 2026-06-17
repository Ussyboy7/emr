"use client";

import { useState } from "react";
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import {
  AlertTriangle,
  CheckCircle,
  Edit,
  Eye,
  Plus,
  X,
} from 'lucide-react';
import { ConsultationOrderListCard } from '@/components/consultation/room/ConsultationOrderListCard';
import {
  ConsultationRoomPoolOrderDetailDialog,
  type PoolOrderDetail,
} from '@/components/consultation/room/ConsultationRoomPoolOrderDetailDialog';
import { countOrderDiagnoses } from '@/lib/consultation/order-diagnoses';

export type ConsultationRoomEyecareTabProps = {
  eyeOrders: any[];
  eyeOrdersFromApi: any[];
  onShowAddEyeOrder: () => void;
  onSendToEye: () => void | Promise<void>;
  onEditEyeOrder: (index: number) => void;
  onRemoveEyeOrder: (index: number) => void;
};

export function ConsultationRoomEyecareTab({
  eyeOrders,
  eyeOrdersFromApi,
  onShowAddEyeOrder,
  onSendToEye,
  onEditEyeOrder,
  onRemoveEyeOrder,
}: ConsultationRoomEyecareTabProps) {
  const [viewOrder, setViewOrder] = useState<PoolOrderDetail | null>(null);

  return (
    <TabsContent value="eyecare">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-cyan-600" />
                Eye Care Orders
              </CardTitle>
              <CardDescription>
                Order eye care evaluation — will be sent to Eye Care queue.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onShowAddEyeOrder()}>
                <Plus className="mr-2 h-4 w-4" />Add Eye Order
              </Button>
              {eyeOrders.some(p => p.status === 'Draft') && (
                <Button onClick={onSendToEye} className="bg-cyan-600 hover:bg-cyan-700">
                  <Eye className="mr-2 h-4 w-4" />
                  Send to Eye ({eyeOrders.filter(p => p.status === 'Draft').length})
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {(() => {
            const apiDisplay = (eyeOrdersFromApi || []).map((o: any) => ({
              id: o.id,
              chiefComplaint: o.chief_complaint || '',
              diagnosis: o.diagnosis || '',
              treatmentPlan: o.treatment_plan || '',
              specialInstructions: o.special_instructions || '',
              priority: o.priority || 'normal',
              status: (o.status === 'pending' ? 'Sent to Eye Care' : o.status === 'scheduled' ? 'Scheduled' : o.status === 'in_progress' ? 'In Progress' : o.status === 'completed' ? 'Completed' : String(o.status || '')) as any,
              fromApi: true,
            }));
            const draftsWithIndex = eyeOrders.map((o, i) => ({ ...o, draftIndex: i }));
            const allOrders = [...apiDisplay, ...draftsWithIndex];
            const getStatusBadge = (status: string) => {
              switch (status) {
                case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                case 'Sent to Eye Care': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
                case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                case 'In Progress': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                case 'Completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
                default: return 'bg-gray-100 text-gray-800';
              }
            };
            return allOrders.length > 0 ? (
              <div className="space-y-3">
                {allOrders.map((order: any, index: number) => {
                  const diagnosisCount = countOrderDiagnoses({
                    diagnoses: order.diagnoses,
                    diagnosisText: order.diagnosis,
                  });
                  const isDraft = order.status === 'Draft' && typeof order.draftIndex === 'number';
                  return (
                    <ConsultationOrderListCard
                      key={order.fromApi ? `api-${order.id}` : order.id || index}
                      borderClassName={
                        order.status === 'Draft'
                          ? 'border-l-gray-400'
                          : order.status === 'Completed'
                            ? 'border-l-green-500'
                            : 'border-l-cyan-500'
                      }
                      cardClassName={order.priority === 'stat' ? 'bg-rose-50 dark:bg-rose-900/10' : undefined}
                      icon={<Eye className={`h-3.5 w-3.5 ${order.priority === 'stat' ? 'text-rose-600' : 'text-cyan-600'}`} />}
                      iconWrapClassName={
                        order.priority === 'stat'
                          ? 'bg-rose-100 dark:bg-rose-900/30'
                          : 'bg-cyan-100 dark:bg-cyan-900/30'
                      }
                      title="Eye evaluation"
                      titleExtra={
                        diagnosisCount > 0 ? (
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px] text-muted-foreground">
                            {diagnosisCount} diagnosis{diagnosisCount === 1 ? '' : 'es'}
                          </Badge>
                        ) : undefined
                      }
                      badges={
                        <>
                          <Badge className={`px-1.5 py-0.5 text-xs ${getStatusBadge(order.status)}`}>
                            {order.status}
                          </Badge>
                          <Badge
                            variant={order.priority === 'stat' ? 'destructive' : order.priority === 'urgent' ? 'default' : 'secondary'}
                            className={`px-1.5 py-0.5 text-xs ${order.priority === 'stat' ? 'bg-rose-500' : order.priority === 'urgent' ? 'bg-amber-500' : ''}`}
                          >
                            {order.priority === 'stat' && <AlertTriangle className="mr-1 h-3 w-3" />}
                            {order.priority}
                          </Badge>
                        </>
                      }
                      queueHint={
                        order.status === 'Sent to Eye Care'
                          ? 'Sent to Eye Care queue • Ready for scheduling'
                          : undefined
                      }
                      actions={
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setViewOrder(order)}
                            className="text-muted-foreground hover:text-foreground"
                            title="View order details"
                          >
                            <Eye className="mr-1 h-4 w-4" />
                            View
                          </Button>
                          {isDraft ? (
                            <>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onEditEyeOrder(order.draftIndex)}
                                className="text-blue-500 hover:text-blue-600"
                                title="Edit eye order"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => onRemoveEyeOrder(order.draftIndex)}
                                className="text-rose-500 hover:text-rose-600"
                                title="Remove eye order"
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          ) : null}
                        </>
                      }
                      trailing={
                        order.status === 'Sent to Eye Care' ? (
                          <Badge className="bg-cyan-500 text-white">
                            <CheckCircle className="mr-1 h-3 w-3" />
                            Queued
                          </Badge>
                        ) : undefined
                      }
                    />
                  );
                })}
              </div>
            ) : (
              <div className="text-center py-12 bg-gradient-to-b from-cyan-50 to-cyan-100/50 dark:from-cyan-900/10 dark:to-cyan-900/5 rounded-lg border-2 border-dashed border-cyan-200 dark:border-cyan-800">
                <Eye className="h-12 w-12 mx-auto mb-3 text-cyan-500 opacity-60" />
                <p className="font-medium text-cyan-900 dark:text-cyan-100 mb-1">No eye care orders yet</p>
                <p className="text-sm text-muted-foreground mb-4">Order evaluations to be processed by Eye Care department</p>
                <Button variant="outline" size="sm" onClick={() => onShowAddEyeOrder()} className="border-cyan-300 text-cyan-700 hover:bg-cyan-100">
                  <Plus className="h-4 w-4 mr-1" />Order First Evaluation
                </Button>
              </div>
            );
          })()}
        </CardContent>
      </Card>

      <ConsultationRoomPoolOrderDetailDialog
        open={!!viewOrder}
        onOpenChange={(open) => !open && setViewOrder(null)}
        module="eyecare"
        order={viewOrder}
      />
    </TabsContent>
  );
}
