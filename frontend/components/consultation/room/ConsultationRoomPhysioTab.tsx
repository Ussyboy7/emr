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

export type ConsultationRoomPhysioTabProps = {
  physioOrders: any[];
  physioOrdersFromApi: any[];
  onShowAddPhysio: () => void;
  onSendToPhysio: () => void | Promise<void>;
  onEditPhysioOrder: (index: number) => void;
  onRemovePhysioOrder: (index: number) => void;
};

export function ConsultationRoomPhysioTab({
  physioOrders,
  physioOrdersFromApi,
  onShowAddPhysio,
  onSendToPhysio,
  onEditPhysioOrder,
  onRemovePhysioOrder,
}: ConsultationRoomPhysioTabProps) {
  return (
          <TabsContent value="physiotherapy">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="h-5 w-5 text-emerald-500" />
                      Physiotherapy Orders
                    </CardTitle>
                    <CardDescription>
                      Order physiotherapy treatment sessions — will be sent to Physiotherapy pool queue.
                    </CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => onShowAddPhysio()}>
                      <Plus className="mr-2 h-4 w-4" />Add Physio Order
                    </Button>
                    {physioOrders.some(p => p.status === 'Draft') && (
                      <Button onClick={onSendToPhysio} className="bg-emerald-600 hover:bg-emerald-700">
                        <Activity className="mr-2 h-4 w-4" />
                        Send to Physio ({physioOrders.filter(p => p.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {(() => {
                  const apiDisplay = (physioOrdersFromApi || []).map((o: any) => ({
                    id: o.id, historyClinicalFindings: o.history_clinical_findings || '', diagnosis: o.diagnosis, drugHistory: o.drug_history || '', specialInstructions: o.special_instructions, priority: o.priority || 'normal',
                    status: (o.status === 'pending' ? 'Sent to Physiotherapy' : o.status === 'scheduled' ? 'Scheduled' : o.status === 'in_progress' ? 'In Progress' : o.status === 'completed' ? 'Completed' : String(o.status || '')) as any,
                    fromApi: true
                  }));
                  const draftsWithIndex = physioOrders.map((o, i) => ({ ...o, draftIndex: i }));
                  const allOrders = [...apiDisplay, ...draftsWithIndex];
                  const getStatusBadge = (status: string) => {
                    switch (status) {
                      case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                      case 'Sent to Physiotherapy': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                      case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                      case 'In Progress': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                      case 'Completed': return 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400';
                      default: return 'bg-gray-100 text-gray-800';
                    }
                  };
                  const getPriorityBadge = (priority: string) => {
                    switch (priority) {
                      case 'stat': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                      case 'urgent': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
                      case 'routine': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                      default: return 'bg-gray-100 text-gray-800';
                    }
                  };
                  return allOrders.length > 0 ? (
                    <div className="space-y-3">
                      {allOrders.map((order: any, index: number) => (
                        <Card key={order.fromApi ? `api-${order.id}` : order.id || index} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Physiotherapy' ? 'border-l-emerald-500' : order.status === 'Completed' ? 'border-l-green-500' : 'border-l-emerald-500'} ${order.priority === 'stat' ? 'bg-rose-50 dark:bg-rose-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${order.priority === 'stat' ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-emerald-100 dark:bg-emerald-900/30'}`}>
                                  <Activity className={`h-3.5 w-3.5 ${order.priority === 'stat' ? 'text-rose-600' : 'text-emerald-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{order.diagnosis || 'Physiotherapy Treatment'}</span>
                                    <Badge variant={order.priority === "stat" ? "destructive" : order.priority === "urgent" ? "default" : "secondary"} className={`text-xs px-1.5 py-0.5 ${order.priority === 'stat' ? 'bg-rose-500' : order.priority === 'urgent' ? 'bg-amber-500' : ''}`}>
                                      {order.priority === 'stat' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                    <Badge className={`text-xs px-1.5 py-0.5 ${getStatusBadge(order.status)}`}>{order.status}</Badge>
                                  </div>
                                  {order.historyClinicalFindings && <p className="text-xs text-muted-foreground mb-0.5">{order.historyClinicalFindings}</p>}
                                  {order.drugHistory && <p className="text-xs text-muted-foreground">{order.drugHistory}</p>}
                                  {order.status === 'Sent to Physiotherapy' && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                                      <Clock className="h-3 w-3" />
                                      <span>Sent to Physio queue • Ready for scheduling</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && typeof order.draftIndex === 'number' && (
                                <div className="flex gap-1">
                                  <Button variant="ghost" size="sm" onClick={() => onEditPhysioOrder(order.draftIndex)} className="text-blue-500 hover:text-blue-600" title="Edit physio order">
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => onRemovePhysioOrder(order.draftIndex)} className="text-rose-500 hover:text-rose-600" title="Remove physio order">
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Physiotherapy' && (
                                <Badge className="bg-emerald-500 text-white"><CheckCircle className="h-3 w-3 mr-1" />Queued</Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-12 bg-gradient-to-b from-emerald-50 to-emerald-100/50 dark:from-emerald-900/10 dark:to-emerald-900/5 rounded-lg border-2 border-dashed border-emerald-200 dark:border-emerald-800">
                      <Activity className="h-12 w-12 mx-auto mb-3 text-emerald-500 opacity-60" />
                      <p className="font-medium text-emerald-900 dark:text-emerald-100 mb-1">No physiotherapy orders yet</p>
                      <p className="text-sm text-muted-foreground mb-4">Order treatments to be processed by physiotherapy</p>
                      <Button variant="outline" size="sm" onClick={() => onShowAddPhysio()} className="border-emerald-300 text-emerald-700 hover:bg-emerald-100">
                        <Plus className="h-4 w-4 mr-1" />Order First Treatment
                      </Button>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          </TabsContent>
  );
}
