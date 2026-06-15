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

export type ConsultationRoomRadiologyTabProps = {
  radiologyOrders: any[];
  onShowAddRadiology: () => void;
  onSendToRadiology: () => void | Promise<void>;
  onEditRadiologyOrder: (orderId: string) => void;
  onRemoveRadiologyOrder: (orderId: string) => void;
};

export function ConsultationRoomRadiologyTab({
  radiologyOrders,
  onShowAddRadiology,
  onSendToRadiology,
  onEditRadiologyOrder,
  onRemoveRadiologyOrder,
}: ConsultationRoomRadiologyTabProps) {
  return (
          <TabsContent value="radiology">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ScanLine className="h-5 w-5 text-indigo-500" />
                      Radiology Orders
                    </CardTitle>
                    <CardDescription>Order imaging studies - X-rays, CT, MRI, Ultrasound</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => onShowAddRadiology()}>
                      <Plus className="mr-2 h-4 w-4" />Add Imaging
                    </Button>
                    {radiologyOrders.length > 0 && radiologyOrders.some(r => r.status === 'Draft') && (
                      <Button onClick={onSendToRadiology} className="bg-indigo-600 hover:bg-indigo-700">
                        <ScanLine className="mr-2 h-4 w-4" />
                        Send to Radiology ({radiologyOrders.filter(r => r.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {radiologyOrders.length > 0 ? (
                  <div className="space-y-3">
                    {radiologyOrders.map((order, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Radiology': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
                          case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'In Progress': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getCategoryBadge = (category: string) => {
                        switch (category) {
                          case 'X-Ray': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Ultrasound': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
                          case 'CT Scan': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
                          case 'MRI': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400';
                          default: return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
                        }
                      };
                      
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Radiology' ? 'border-l-indigo-500' : 'border-l-emerald-500'} ${order.priority === 'STAT' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className="p-1.5 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                                  <ScanLine className="h-3.5 w-3.5 text-indigo-600" />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{order.procedure}</span>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getCategoryBadge(order.category)}`}>{order.category}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getStatusBadge(order.status)}`}>{order.status}</Badge>
                                    {order.priority !== 'Routine' && (
                                      <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${order.priority === 'STAT' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}`}>
                                        {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                        {order.priority}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Body Part:</strong> {order.bodyPart}
                                  </div>
                                  {order.lmp && (
                                    <div className="text-sm text-muted-foreground mt-1">
                                      <strong>LMP:</strong> {order.lmp}
                                    </div>
                                  )}
                                  <div className="text-sm text-muted-foreground mt-1">
                                    <strong>Indication:</strong> {order.clinicalIndication}
                                  </div>
                                  {order.provisionalDiagnosis && (
                                    <div className="text-sm text-muted-foreground mt-1 p-2 bg-muted/50 rounded">
                                      <strong>Provisional Diagnosis:</strong> {order.provisionalDiagnosis}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEditRadiologyOrder(order.id)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit radiology order"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onRemoveRadiologyOrder(order.id)}
                                    className="text-red-500 hover:text-red-600"
                                    title="Remove radiology order"
                                  >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Radiology' && (
                                <Badge className="bg-indigo-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-indigo-50 to-indigo-100/50 dark:from-indigo-900/10 dark:to-indigo-900/5 rounded-lg border-2 border-dashed border-indigo-200 dark:border-indigo-800">
                    <ScanLine className="h-12 w-12 mx-auto mb-3 text-indigo-500 opacity-60" />
                    <p className="font-medium text-indigo-900 dark:text-indigo-100 mb-1">No radiology orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Order imaging studies for diagnosis</p>
                    <Button variant="outline" size="sm" onClick={() => onShowAddRadiology()} className="border-indigo-300 text-indigo-700 hover:bg-indigo-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Order
                    </Button>
                  </div>
                )}

                {/* Radiology Workflow Info */}
                <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <h4 className="font-medium text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Radiology Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-indigo-100 dark:bg-indigo-900/30">Sent to Radiology</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Scheduled</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">In Progress</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Results will be available in patient record once completed</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
  );
}
