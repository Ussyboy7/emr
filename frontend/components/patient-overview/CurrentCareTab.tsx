"use client";

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Pill, TestTube, ScanLine, AlertCircle } from 'lucide-react';

interface PatientDetail {
  currentMedications: Array<{
    id: number;
    name: string;
    dosage: string;
    frequency: string;
    prescribedBy: string;
    startDate: string;
  }>;
  [key: string]: any;
}

interface CurrentCareTabProps {
  patientDetail: PatientDetail | null;
  prescriptions: any[];
  labResults: any[];
  imagingResults: any[];
  currentCareSubTab: string;
  onCurrentCareSubTabChange: (tab: string) => void;
}

export function CurrentCareTab({
  patientDetail,
  prescriptions,
  labResults,
  imagingResults,
  currentCareSubTab,
  onCurrentCareSubTabChange,
}: CurrentCareTabProps) {
  // Filter for active/current items
  const activeMedications = patientDetail?.currentMedications || [];
  
  const activePrescriptions = prescriptions.filter((rx: any) => 
    rx.status !== 'dispensed' && rx.status !== 'cancelled'
  );

  const pendingLabResults = labResults.filter((lab: any) => 
    lab.status === 'pending' || lab.status === 'results_ready'
  );

  const pendingImaging = imagingResults.filter((img: any) => 
    img.status === 'pending' || img.status === 'completed'
  );

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Current Care</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={currentCareSubTab} onValueChange={onCurrentCareSubTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="active-medications" className="text-xs">
                <Pill className="h-3 w-3 mr-1" />
                Active Medications ({activeMedications.length})
              </TabsTrigger>
              <TabsTrigger value="active-prescriptions" className="text-xs">
                <Pill className="h-3 w-3 mr-1" />
                Active Prescriptions ({activePrescriptions.length})
              </TabsTrigger>
              <TabsTrigger value="pending-labs" className="text-xs">
                <TestTube className="h-3 w-3 mr-1" />
                Pending Labs ({pendingLabResults.length})
              </TabsTrigger>
              <TabsTrigger value="pending-imaging" className="text-xs">
                <ScanLine className="h-3 w-3 mr-1" />
                Pending Imaging ({pendingImaging.length})
              </TabsTrigger>
            </TabsList>

            {/* Active Medications Sub-Tab */}
            <TabsContent value="active-medications" className="mt-4">
              <div className="space-y-3">
                {activeMedications.length > 0 ? (
                  activeMedications.map((med) => (
                    <Card key={med.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{med.name}</h4>
                              <Badge variant="default" className="bg-green-600">Active</Badge>
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p>Dosage: {med.dosage}</p>
                              <p>Frequency: {med.frequency}</p>
                              <p>Prescribed by: {med.prescribedBy}</p>
                              <p>Started: {new Date(med.startDate).toLocaleDateString()}</p>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No active medications</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Active Prescriptions Sub-Tab */}
            <TabsContent value="active-prescriptions" className="mt-4">
              <div className="space-y-4">
                {activePrescriptions.length > 0 ? (
                  activePrescriptions.map((rx) => (
                    <Card key={rx.id}>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium">{rx.prescriptionId}</p>
                            <p className="text-sm text-muted-foreground">{rx.date} • Prescribed by: {rx.doctor}</p>
                          </div>
                          <Badge variant="secondary">
                            {rx.status.replace('_', ' ').toUpperCase()}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {rx.medications && rx.medications.map((med: any, idx: number) => (
                            <div key={idx} className="bg-muted/50 p-3 rounded border-l-4 border-primary">
                              <div className="flex items-center justify-between mb-1">
                                <p className="font-medium">{med.name}</p>
                              </div>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <p>Dosage: {med.dosage} • Frequency: {med.frequency}</p>
                                {med.duration && <p>Duration: {med.duration}</p>}
                                <p>Quantity: {med.quantity} {med.unit}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No active prescriptions</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Pending Labs Sub-Tab */}
            <TabsContent value="pending-labs" className="mt-4">
              <div className="space-y-3">
                {pendingLabResults.length > 0 ? (
                  pendingLabResults.map((lab) => (
                    <Card key={lab.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{lab.test}</h4>
                              <Badge variant={
                                lab.status === 'results_ready' ? 'default' : 'secondary'
                              }>
                                {lab.status === 'results_ready' ? 'Results Ready' : 'Pending'}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p>Date: {lab.date}</p>
                              {lab.result && <p>Result: {lab.result}</p>}
                              {lab.orderedBy && <p>Ordered by: {lab.orderedBy}</p>}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No pending lab results</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>

            {/* Pending Imaging Sub-Tab */}
            <TabsContent value="pending-imaging" className="mt-4">
              <div className="space-y-3">
                {pendingImaging.length > 0 ? (
                  pendingImaging.map((img) => (
                    <Card key={img.id}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 space-y-2">
                            <div className="flex items-center gap-2">
                              <h4 className="font-semibold">{img.type}</h4>
                              <Badge variant={
                                img.status === 'completed' ? 'default' : 'secondary'
                              }>
                                {img.status === 'completed' ? 'Completed' : 'Pending'}
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p>Study ID: {img.studyId}</p>
                              <p>Date: {img.date}</p>
                              {img.description && <p>Description: {img.description}</p>}
                              {img.result && <p>Result: {img.result}</p>}
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center">
                      <p className="text-muted-foreground">No pending imaging studies</p>
                    </CardContent>
                  </Card>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

