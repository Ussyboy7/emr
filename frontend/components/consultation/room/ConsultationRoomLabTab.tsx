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

export type ConsultationRoomLabTabProps = {
  labOrders: any[];
  onShowAddLabOrder: () => void;
  onSendToLab: () => void | Promise<void>;
  onEditLabOrder: (index: number) => void;
  onRemoveLabOrder: (index: number) => void;
};

export function ConsultationRoomLabTab({
  labOrders,
  onShowAddLabOrder,
  onSendToLab,
  onEditLabOrder,
  onRemoveLabOrder,
}: ConsultationRoomLabTabProps) {
  return (
          <TabsContent value="lab">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lab Orders</CardTitle>
                    <CardDescription>Request laboratory tests - Orders are sent to Lab Tech queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => onShowAddLabOrder()} className="bg-amber-500 hover:bg-amber-600">
                      <Plus className="mr-2 h-4 w-4" />Add Test
                    </Button>
                    {labOrders.length > 0 && labOrders.some(order => order.status === 'Draft') && (
                      <Button onClick={onSendToLab} className="bg-amber-600 hover:bg-amber-700">
                        <TestTube className="mr-2 h-4 w-4" />
                        Send to Lab ({labOrders.filter(order => order.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {labOrders.length > 0 ? (
                  <div className="space-y-3">
                    {labOrders.map((order, index) => {
                      const getLabStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Lab': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Lab' ? 'border-l-amber-500' : 'border-l-blue-500'} ${order.priority === 'STAT' ? 'bg-rose-50 dark:bg-rose-900/10' : ''}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${order.priority === 'STAT' ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                                  <TestTube className={`h-3.5 w-3.5 ${order.priority === 'STAT' ? 'text-rose-600' : 'text-amber-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{order.test}</span>
                                    {order.testId == null && (
                                      <Badge variant="outline" className="text-[10px] px-1.5 border-amber-500/50 text-amber-800 dark:text-amber-200">Custom</Badge>
                                    )}
                                    <Badge variant={order.priority === "STAT" ? "destructive" : order.priority === "Urgent" ? "default" : "secondary"} className={`text-xs px-1.5 py-0.5 ${order.priority === 'STAT' ? 'bg-rose-500' : order.priority === 'Urgent' ? 'bg-amber-500' : ''}`}>
                                      {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                    <Badge className={`text-xs px-1.5 py-0.5 ${getLabStatusBadge(order.status)}`}>{order.status}</Badge>
                                  </div>
                                  {order.notes && <p className="text-xs text-muted-foreground mb-0.5">{order.notes}</p>}
                                  {order.status === 'Sent to Lab' && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      <span>Sent to Lab Tech queue • Est. TAT: {order.priority === 'STAT' ? '30 min - 1 hour' : order.priority === 'Urgent' ? '1 - 2 hours' : '2 - 4 hours'}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEditLabOrder(index)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit lab order"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onRemoveLabOrder(index)}
                                    className="text-rose-500 hover:text-rose-600"
                                    title="Remove lab order"
                                  >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {order.status === 'Sent to Lab' && (
                                <Badge className="bg-amber-500 text-white">
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
                  <div className="text-center py-12 bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-900/10 dark:to-amber-900/5 rounded-lg border-2 border-dashed border-amber-200 dark:border-amber-800">
                    <TestTube className="h-12 w-12 mx-auto mb-3 text-amber-500 opacity-60" />
                    <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">No lab orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Order tests to be processed by the lab</p>
                    <Button variant="outline" size="sm" onClick={() => onShowAddLabOrder()} className="border-amber-300 text-amber-700 hover:bg-amber-100">
                      <Plus className="h-4 w-4 mr-1" />Order First Test
                    </Button>
                  </div>
                )}
                
                {/* Lab Workflow Info */}
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Lab Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Ordered</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-violet-100 dark:bg-violet-900/30">Collected</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Processing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">Results Ready</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Verified ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Results will appear here and in patient record once verified by Sr. Admin</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
  );
}
