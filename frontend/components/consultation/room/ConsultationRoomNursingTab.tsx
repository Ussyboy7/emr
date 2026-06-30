"use client";

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { TabsContent } from '@/components/ui/tabs';
import {
  Activity,
  AlertTriangle,
  CheckCircle,
  Clock,
  Droplets,
  Edit,
  Eye,
  History,
  Loader2,
  Pill,
  Plus,
  ScanLine,
  Send,
  Syringe,
  TestTube,
  X,
} from 'lucide-react';

import type { ConsultationRoomPatient } from '@/lib/consultation/room-types';
import { getNursingOrderIcon } from '@/lib/consultation/room-nursing-helpers';

export type ConsultationRoomNursingTabProps = {
  nursingOrders: any[];
  currentPatient: ConsultationRoomPatient | null;
  draftObservationCount: number;
  onShowAddNursingOrder: () => void;
  onSendToNursing: () => void | Promise<void>;
  onEditNursingOrder: (orderId: string) => void;
  onRemoveNursingOrder: (orderId: string) => void;
};

export function ConsultationRoomNursingTab({
  nursingOrders,
  currentPatient,
  draftObservationCount,
  onShowAddNursingOrder,
  onSendToNursing,
  onEditNursingOrder,
  onRemoveNursingOrder,
}: ConsultationRoomNursingTabProps) {
  const hasDraftOrders = nursingOrders.some((order) => order.status === 'Draft');
  const shouldShowSendButton = hasDraftOrders && draftObservationCount === 0;

  return (
          <TabsContent value="nursing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Syringe className="h-5 w-5 text-cyan-500" />
                      Nursing Orders
                    </CardTitle>
                    <CardDescription>Request nursing procedures - will be sent to Nursing queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => {
                      onShowAddNursingOrder();
                    }}>
                      <Plus className="mr-2 h-4 w-4" />Add Procedure
                    </Button>
                    {nursingOrders.length > 0 && shouldShowSendButton && (
                      <Button
                        onClick={() => void onSendToNursing()}
                        className="bg-cyan-600 hover:bg-cyan-700"
                      >
                        <Syringe className="mr-2 h-4 w-4" />
                        Send to Nursing ({nursingOrders.filter(order => order.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {draftObservationCount > 0 && (
                  <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                    <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" />
                      Observation admission handoff happens on <strong>End Session</strong>. Use End Session to transfer the patient to Nursing/Ward.
                    </p>
                  </div>
                )}

                {/* Allergy Warning for Injections */}
                {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Patient Allergies: {currentPatient.allergies.join(', ')}</span>
                    </div>
                  </div>
                )}

                {nursingOrders.length > 0 ? (
                  <div className="space-y-3">
                    {nursingOrders.map((order, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Nursing': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
                          case 'In Progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getPriorityBadge = (priority: string) => {
                        switch (priority) {
                          case 'STAT': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                          case 'Urgent': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                        }
                      };
                      const getTypeBadge = (type: string) => {
                        switch (type) {
                          case 'Injection': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
                          case 'Dressing': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          case 'IV Infusion': return 'bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400';
                          default: return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
                        }
                      };
                      
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Nursing' ? 'border-l-cyan-500' : 'border-l-emerald-500'} ${order.priority === 'STAT' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${
                                  order.type === 'Injection'
                                    ? 'bg-rose-100 dark:bg-rose-900/30'
                                    : order.type === 'Dressing'
                                      ? 'bg-amber-100 dark:bg-amber-900/30'
                                      : order.type === 'IV Infusion'
                                        ? 'bg-sky-100 dark:bg-sky-900/30'
                                        : 'bg-cyan-100 dark:bg-cyan-900/30'
                                }`}>
                                  {getNursingOrderIcon(order.type)}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getTypeBadge(order.type)}`}>{order.type}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getStatusBadge(order.status)}`}>{order.status}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getPriorityBadge(order.priority)}`}>
                                      {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                  </div>
                                  
                                  {/* Type-specific details */}
                                  {order.type === 'Injection' && order.medication && (
                                    <div className="text-xs font-medium mb-0.5">
                                      {order.medication} • {order.dosage} • {order.route}
                                    </div>
                                  )}
                                  {order.type === 'Dressing' && order.woundLocation && (
                                    <div className="text-xs font-medium mb-0.5">
                                      {order.woundType ? `${order.woundType} — ` : ''}{order.woundLocation}
                                    </div>
                                  )}
                                  {order.type === 'IV Infusion' && order.medication && (
                                    <div className="text-xs font-medium mb-0.5">
                                      {order.medication}
                                      {order.dosage ? ` • ${order.dosage}` : ''}
                                    </div>
                                  )}
                                  
                                  <div className="text-xs text-muted-foreground">
                                    <strong>Instructions:</strong> {order.instructions}
                                  </div>
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEditNursingOrder(order.id)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit nursing order"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => onRemoveNursingOrder(order.id)}
                                  className="text-red-500 hover:text-red-600"
                                    title="Remove nursing order"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Nursing' && (
                                <Badge className="bg-cyan-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-cyan-50 to-cyan-100/50 dark:from-cyan-900/10 dark:to-cyan-900/5 rounded-lg border-2 border-dashed border-cyan-200 dark:border-cyan-800">
                    <Syringe className="h-12 w-12 mx-auto mb-3 text-cyan-500 opacity-60" />
                    <p className="font-medium text-cyan-900 dark:text-cyan-100 mb-1">No nursing orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add procedures to be sent to Nursing</p>
                    <Button variant="outline" size="sm" onClick={() => onShowAddNursingOrder()} className="border-cyan-300 text-cyan-700 hover:bg-cyan-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Procedure
                    </Button>
                  </div>
                )}

                {/* Nursing Workflow Info */}
                <div className="p-4 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
                  <h4 className="font-medium text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Nursing Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-cyan-100 dark:bg-cyan-900/30">Sent to Nursing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">In Progress</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    {draftObservationCount > 0
                      ? 'Observation admissions are queued when you End Session.'
                      : 'Click "Send to Nursing" to queue procedures for the nursing team.'}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
  );
}
