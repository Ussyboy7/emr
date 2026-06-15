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

export type ConsultationRoomPrescriptionsTabProps = {
  prescriptions: any[];
  currentPatient: { allergies?: string[]; id?: string } | null;
  onAddPrescription: () => void;
  onShowRefill: () => void;
  onSendToPharmacy: () => void | Promise<void>;
  onEditPrescription: (index: number) => void;
  onRemovePrescription: (index: number) => void;
  onCancelSentPrescription: (prescriptionId?: number) => void | Promise<void>;
};

export function ConsultationRoomPrescriptionsTab({
  prescriptions,
  currentPatient,
  onAddPrescription,
  onShowRefill,
  onSendToPharmacy,
  onEditPrescription,
  onRemovePrescription,
  onCancelSentPrescription,
}: ConsultationRoomPrescriptionsTabProps) {
  return (
          <TabsContent value="prescriptions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-violet-500" />
                      Prescriptions
                    </CardTitle>
                    <CardDescription>Prescribe medications - will be sent to Pharmacy queue</CardDescription>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={() => onAddPrescription()}>
                      <Plus className="mr-2 h-4 w-4" />Add Medication
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => onShowRefill()}
                      disabled={!currentPatient?.id}
                      className="border-violet-200 text-violet-800 hover:bg-violet-50 dark:border-violet-800 dark:text-violet-200"
                    >
                      <History className="mr-2 h-4 w-4" />
                      Refill from previous
                    </Button>
                    {prescriptions.length > 0 && prescriptions.some(rx => rx.status === 'Draft') && (
                      <Button onClick={onSendToPharmacy} className="bg-violet-600 hover:bg-violet-700">
                        <Pill className="mr-2 h-4 w-4" />
                        Send to Pharmacy ({prescriptions.filter(rx => rx.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Allergy Warning */}
                {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Patient Allergies: {currentPatient.allergies.join(', ')}</span>
                    </div>
                  </div>
                )}

                {prescriptions.length > 0 ? (
                  <div className="space-y-3">
                    {prescriptions.map((rx, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Pharmacy': return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400';
                          case 'Processing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Partially Dispensed': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          case 'Dispensed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          case 'Cancelled': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getPriorityBadge = (priority: string) => {
                        switch (priority) {
                          case 'Emergency': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                          case 'Urgent': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                        }
                      };
                      
                      return (
                        <Card key={rx.id} className={`border-l-4 ${rx.status === 'Draft' ? 'border-l-gray-400' : rx.status === 'Sent to Pharmacy' ? 'border-l-violet-500' : 'border-l-emerald-500'}`}>
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex items-start gap-2 flex-1">
                                <div className={`p-1.5 rounded-full ${rx.status === 'Draft' ? 'bg-gray-100 dark:bg-gray-800' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
                                  <Pill className={`h-3.5 w-3.5 ${rx.status === 'Draft' ? 'text-gray-600' : 'text-violet-600'}`} />
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2 flex-wrap mb-0.5">
                                    <span className="font-semibold text-sm">{rx.medication}</span>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getStatusBadge(rx.status)}`}>{rx.status}</Badge>
                                    <Badge variant="outline" className={`text-xs px-1.5 py-0.5 ${getPriorityBadge(rx.priority)}`}>{rx.priority}</Badge>
                                  </div>
                                  <div className="text-xs text-muted-foreground mb-0.5">
                                    <span className="font-medium">{rx.dosage}</span> • {rx.route} • {rx.frequency} • {rx.duration}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                    <span><strong>Qty:</strong> {rx.quantity}</span>
                                    {rx.unit && <span><strong>Unit:</strong> {rx.unit}</span>}
                                    {rx.strength && <span><strong>Strength:</strong> {rx.strength}</span>}
                                    {rx.form && <span><strong>Form:</strong> {rx.form}</span>}
                                    {rx.genericName && <span><strong>Generic:</strong> {rx.genericName}</span>}
                                  </div>
                                  {rx.instructions && (
                                    <div className="text-xs text-muted-foreground mt-1 p-1.5 bg-muted/50 rounded">
                                      <strong>Instructions:</strong> {rx.instructions}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {rx.status === 'Draft' && (
                                <div className="flex gap-1">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onEditPrescription(index)}
                                    className="text-blue-500 hover:text-blue-600"
                                    title="Edit prescription"
                                  >
                                    <Edit className="h-4 w-4" />
                                  </Button>
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => onRemovePrescription(index)}
                                  className="text-red-500 hover:text-red-600"
                                    title="Remove prescription"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                                </div>
                              )}
                              {rx.status === 'Sent to Pharmacy' && (
                                <div className="flex items-center gap-1">
                                  <Badge className="bg-violet-500 text-white">
                                    <CheckCircle className="h-3 w-3 mr-1" />
                                    Queued
                                  </Badge>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => onCancelSentPrescription(rx.prescriptionId)}
                                    className="text-rose-500 hover:text-rose-600"
                                    title="Cancel prescription"
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-violet-50 to-violet-100/50 dark:from-violet-900/10 dark:to-violet-900/5 rounded-lg border-2 border-dashed border-violet-200 dark:border-violet-800">
                    <Pill className="h-12 w-12 mx-auto mb-3 text-violet-500 opacity-60" />
                    <p className="font-medium text-violet-900 dark:text-violet-100 mb-1">No prescriptions yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add medications to be sent to the Pharmacy</p>
                    <div className="flex flex-wrap gap-2 justify-center">
                      <Button variant="outline" size="sm" onClick={() => onAddPrescription()} className="border-violet-300 text-violet-700 hover:bg-violet-100">
                        <Plus className="h-4 w-4 mr-1" />Add First Medication
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onShowRefill()}
                        disabled={!currentPatient?.id}
                        className="border-violet-300 text-violet-700 hover:bg-violet-100"
                      >
                        <History className="h-4 w-4 mr-1" />Refill from previous
                      </Button>
                    </div>
                  </div>
                )}

                {/* Pharmacy Workflow Info */}
                <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                  <h4 className="font-medium text-violet-900 dark:text-violet-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Prescription Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-violet-100 dark:bg-violet-900/30">Sent to Pharmacy</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Processing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Dispensed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Click "Send to Pharmacy" to queue prescriptions for dispensing</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
  );
}
