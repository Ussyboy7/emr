"use client";

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  FileText, Stethoscope, TestTube, ScanLine, Pill, Heart,
  AlertTriangle, Users, User, Eye, ChevronLeft, ChevronRight
} from 'lucide-react';

interface PatientDetail {
  allergies: string[];
  chronicConditions: string[];
  [key: string]: any;
}

interface Visit {
  id: string;
  numericId?: number;
  visitId?: string;
  patientId: string;
  date: string;
  time: string;
  type: string;
  department: string;
  doctor: string;
  chiefComplaint?: string;
  diagnosis?: string;
  notes?: string;
  status: string;
  clinic: string;
}

interface MedicalHistoryTabProps {
  patientDetail: PatientDetail | null;
  visits: Visit[];
  consultationSessions: any[];
  labResults: any[];
  imagingResults: any[];
  prescriptions: any[];
  vitalSigns: any[];
  historySubTab: string;
  onHistorySubTabChange: (tab: string) => void;
  onViewVisit?: (visit: Visit) => void;
}

export function MedicalHistoryTab({
  patientDetail,
  visits,
  consultationSessions,
  labResults,
  imagingResults,
  prescriptions,
  vitalSigns,
  historySubTab,
  onHistorySubTabChange,
  onViewVisit,
}: MedicalHistoryTabProps) {
  // Filter and pagination state
  const [sessionDateFilter, setSessionDateFilter] = useState<string>('all');
  const [labDateFilter, setLabDateFilter] = useState<string>('all');
  const [labStatusFilter, setLabStatusFilter] = useState<string>('all');
  const [imagingDateFilter, setImagingDateFilter] = useState<string>('all');
  const [imagingStatusFilter, setImagingStatusFilter] = useState<string>('all');
  const [prescriptionsDateFilter, setPrescriptionsDateFilter] = useState<string>('all');
  const [prescriptionsStatusFilter, setPrescriptionsStatusFilter] = useState<string>('all');
  const [vitalsDateFilter, setVitalsDateFilter] = useState<string>('all');
  
  const [consultationsPage, setConsultationsPage] = useState(1);
  const [labResultsPage, setLabResultsPage] = useState(1);
  const [imagingPage, setImagingPage] = useState(1);
  const [prescriptionsPage, setPrescriptionsPage] = useState(1);
  const [vitalsPage, setVitalsPage] = useState(1);
  
  const [consultationsPerPage, setConsultationsPerPage] = useState(10);
  const [labResultsPerPage, setLabResultsPerPage] = useState(10);
  const [imagingPerPage, setImagingPerPage] = useState(10);
  const [prescriptionsPerPage, setPrescriptionsPerPage] = useState(10);
  const [vitalsPerPage, setVitalsPerPage] = useState(10);

  // Combined visits and consultations for visits-consultations tab
  const allVisitsAndConsultations = [
    ...visits.map(v => ({ ...v, type: 'visit' })),
    ...consultationSessions.map(c => ({ ...c, type: 'consultation' })),
  ].sort((a, b) => {
    const dateA = new Date(a.date || a.created_at || '').getTime();
    const dateB = new Date(b.date || b.created_at || '').getTime();
    return dateB - dateA; // Newest first
  });

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>Medical History</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs value={historySubTab} onValueChange={onHistorySubTabChange} className="w-full">
            <TabsList className="grid w-full grid-cols-6">
              <TabsTrigger value="background" className="text-xs">
                <FileText className="h-3 w-3 mr-1" />
                Background
              </TabsTrigger>
              <TabsTrigger value="visits-consultations" className="text-xs">
                <Stethoscope className="h-3 w-3 mr-1" />
                Visits & Consultations ({visits.length + consultationSessions.length})
              </TabsTrigger>
              <TabsTrigger value="labs" className="text-xs">
                <TestTube className="h-3 w-3 mr-1" />
                Lab Results ({labResults.length})
              </TabsTrigger>
              <TabsTrigger value="imaging" className="text-xs">
                <ScanLine className="h-3 w-3 mr-1" />
                Imaging ({imagingResults.length})
              </TabsTrigger>
              <TabsTrigger value="prescriptions" className="text-xs">
                <Pill className="h-3 w-3 mr-1" />
                Prescriptions ({prescriptions.length})
              </TabsTrigger>
              <TabsTrigger value="vitals" className="text-xs">
                <Heart className="h-3 w-3 mr-1" />
                Vitals ({vitalSigns.length})
              </TabsTrigger>
            </TabsList>

            {/* Background Sub-Tab */}
            <TabsContent value="background" className="mt-4">
              {patientDetail && (
                <div className="space-y-4">
                  {/* Allergies Card */}
                  <Card className={patientDetail.allergies.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : ''}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <AlertTriangle className={`h-4 w-4 ${patientDetail.allergies.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                        Allergies
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {patientDetail.allergies.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {patientDetail.allergies.map((allergy: string, index: number) => (
                            <Badge key={index} className="bg-red-600 text-white">{allergy}</Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No known allergies</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Chronic Conditions Card */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Stethoscope className="h-4 w-4 text-amber-500" />
                        Chronic Conditions
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {patientDetail.chronicConditions.length > 0 ? (
                        <div className="flex flex-wrap gap-2">
                          {patientDetail.chronicConditions.map((condition: string, index: number) => (
                            <Badge key={index} variant="outline" className="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-400">
                              {condition}
                            </Badge>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground">No chronic conditions</p>
                      )}
                    </CardContent>
                  </Card>

                  {/* Family History Card */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <Users className="h-4 w-4 text-blue-500" />
                        Family History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">Family history information will be displayed here</p>
                    </CardContent>
                  </Card>

                  {/* Social History Card */}
                  <Card>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm flex items-center gap-2">
                        <User className="h-4 w-4 text-green-500" />
                        Social History
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-muted-foreground">Social history information will be displayed here</p>
                    </CardContent>
                  </Card>
                </div>
              )}
            </TabsContent>

            {/* Visits & Consultations Sub-Tab */}
            <TabsContent value="visits-consultations" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <Select value={sessionDateFilter} onValueChange={(v) => { setSessionDateFilter(v); setConsultationsPage(1); }}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="90">Last 3 Months</SelectItem>
                    <SelectItem value="365">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Type</th>
                      <th className="px-4 py-2 text-left font-medium">Chief Complaint</th>
                      <th className="px-4 py-2 text-left font-medium">Doctor</th>
                      <th className="px-4 py-2 text-left font-medium">Clinic</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {allVisitsAndConsultations
                      .filter((item: any) => {
                        if (sessionDateFilter === 'all') return true;
                        const itemDate = new Date(item.date || item.created_at || '');
                        const daysAgo = Math.floor((Date.now() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
                        return daysAgo <= parseInt(sessionDateFilter);
                      })
                      .slice((consultationsPage - 1) * consultationsPerPage, consultationsPage * consultationsPerPage)
                      .map((item: any) => (
                      <tr key={item.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{item.date || (item.created_at ? new Date(item.created_at).toLocaleDateString() : '')}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{item.type === 'visit' ? item.type : 'Consultation'}</Badge>
                        </td>
                        <td className="px-4 py-3 font-medium">{item.chiefComplaint || item.chief_complaint || 'N/A'}</td>
                        <td className="px-4 py-3">{item.doctor || item.doctor_name || 'Unknown'}</td>
                        <td className="px-4 py-3">
                          <Badge variant="outline">{item.clinic || item.clinic_name || 'N/A'}</Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          {onViewVisit && item.type === 'visit' ? (
                            <Button variant="ghost" size="sm" onClick={() => onViewVisit(item)}>
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4 mr-1" /> View
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                    {allVisitsAndConsultations.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No visits or consultations found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {allVisitsAndConsultations.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {allVisitsAndConsultations.length === 0 ? 0 : `${(consultationsPage - 1) * consultationsPerPage + 1}-${Math.min(allVisitsAndConsultations.length, consultationsPage * consultationsPerPage)}`} of {allVisitsAndConsultations.length}
                    </p>
                    <Select value={String(consultationsPerPage)} onValueChange={(v) => { setConsultationsPerPage(Number(v)); setConsultationsPage(1); }}>
                      <SelectTrigger className="w-16 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={consultationsPage === 1} onClick={() => setConsultationsPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={consultationsPage >= Math.ceil(allVisitsAndConsultations.length / consultationsPerPage)} onClick={() => setConsultationsPage(p => p + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Lab Results Sub-Tab */}
            <TabsContent value="labs" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Select value={labDateFilter} onValueChange={(v) => { setLabDateFilter(v); setLabResultsPage(1); }}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="30">Last 30 Days</SelectItem>
                      <SelectItem value="90">Last 3 Months</SelectItem>
                      <SelectItem value="365">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={labStatusFilter} onValueChange={(v) => { setLabStatusFilter(v); setLabResultsPage(1); }}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="results_ready">Results Ready</SelectItem>
                      <SelectItem value="verified">Verified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Test</th>
                      <th className="px-4 py-2 text-left font-medium">Result</th>
                      <th className="px-4 py-2 text-center font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {labResults
                      .filter((lab: any) => {
                        if (labStatusFilter !== 'all' && lab.status.toLowerCase() !== labStatusFilter.toLowerCase()) return false;
                        if (labDateFilter === 'all') return true;
                        const labDate = new Date(lab.date);
                        const daysAgo = Math.floor((Date.now() - labDate.getTime()) / (1000 * 60 * 60 * 24));
                        return daysAgo <= parseInt(labDateFilter);
                      })
                      .slice((labResultsPage - 1) * labResultsPerPage, labResultsPage * labResultsPerPage)
                      .map((lab: any) => (
                      <tr key={lab.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{lab.date}</td>
                        <td className="px-4 py-3 font-medium">{lab.test}</td>
                        <td className="px-4 py-3">{lab.result || 'Pending'}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={lab.status === 'Normal' || lab.status === 'verified' ? 'default' : 'secondary'}>
                            {lab.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {labResults.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                          No lab results found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {labResults.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {labResults.length === 0 ? 0 : `${(labResultsPage - 1) * labResultsPerPage + 1}-${Math.min(labResults.length, labResultsPage * labResultsPerPage)}`} of {labResults.length}
                    </p>
                    <Select value={String(labResultsPerPage)} onValueChange={(v) => { setLabResultsPerPage(Number(v)); setLabResultsPage(1); }}>
                      <SelectTrigger className="w-16 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={labResultsPage === 1} onClick={() => setLabResultsPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={labResultsPage >= Math.ceil(labResults.length / labResultsPerPage)} onClick={() => setLabResultsPage(p => p + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Imaging Sub-Tab */}
            <TabsContent value="imaging" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Select value={imagingDateFilter} onValueChange={(v) => { setImagingDateFilter(v); setImagingPage(1); }}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="30">Last 30 Days</SelectItem>
                      <SelectItem value="90">Last 3 Months</SelectItem>
                      <SelectItem value="365">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={imagingStatusFilter} onValueChange={(v) => { setImagingStatusFilter(v); setImagingPage(1); }}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="completed">Completed</SelectItem>
                      <SelectItem value="reported">Reported</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="px-4 py-2 text-left font-medium">Date</th>
                      <th className="px-4 py-2 text-left font-medium">Type</th>
                      <th className="px-4 py-2 text-left font-medium">Description</th>
                      <th className="px-4 py-2 text-left font-medium">Result</th>
                      <th className="px-4 py-2 text-center font-medium">Status</th>
                      <th className="px-4 py-2 text-center font-medium">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {imagingResults
                      .filter((img: any) => {
                        if (imagingStatusFilter !== 'all' && img.status.toLowerCase() !== imagingStatusFilter.toLowerCase()) return false;
                        if (imagingDateFilter === 'all') return true;
                        const imgDate = new Date(img.date);
                        const daysAgo = Math.floor((Date.now() - imgDate.getTime()) / (1000 * 60 * 60 * 24));
                        return daysAgo <= parseInt(imagingDateFilter);
                      })
                      .slice((imagingPage - 1) * imagingPerPage, imagingPage * imagingPerPage)
                      .map((img: any) => (
                      <tr key={img.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">{img.date}</td>
                        <td className="px-4 py-3 font-medium">{img.type}</td>
                        <td className="px-4 py-3">{img.description}</td>
                        <td className="px-4 py-3">{img.result || 'Pending'}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={img.status === 'completed' || img.status === 'reported' ? 'default' : 'secondary'}>
                            {img.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <Button variant="ghost" size="sm">
                            <Eye className="h-4 w-4 mr-1" /> View
                          </Button>
                        </td>
                      </tr>
                    ))}
                    {imagingResults.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                          No imaging studies found
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              {imagingResults.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {imagingResults.length === 0 ? 0 : `${(imagingPage - 1) * imagingPerPage + 1}-${Math.min(imagingResults.length, imagingPage * imagingPerPage)}`} of {imagingResults.length}
                    </p>
                    <Select value={String(imagingPerPage)} onValueChange={(v) => { setImagingPerPage(Number(v)); setImagingPage(1); }}>
                      <SelectTrigger className="w-16 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={imagingPage === 1} onClick={() => setImagingPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={imagingPage >= Math.ceil(imagingResults.length / imagingPerPage)} onClick={() => setImagingPage(p => p + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Prescriptions Sub-Tab */}
            <TabsContent value="prescriptions" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <Select value={prescriptionsDateFilter} onValueChange={(v) => { setPrescriptionsDateFilter(v); setPrescriptionsPage(1); }}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Time</SelectItem>
                      <SelectItem value="30">Last 30 Days</SelectItem>
                      <SelectItem value="90">Last 3 Months</SelectItem>
                      <SelectItem value="365">Last Year</SelectItem>
                    </SelectContent>
                  </Select>
                  <Select value={prescriptionsStatusFilter} onValueChange={(v) => { setPrescriptionsStatusFilter(v); setPrescriptionsPage(1); }}>
                    <SelectTrigger className="w-[130px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="pending">Pending</SelectItem>
                      <SelectItem value="dispensing">Dispensing</SelectItem>
                      <SelectItem value="dispensed">Dispensed</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="space-y-4">
                {prescriptions
                  .filter((rx: any) => {
                    if (prescriptionsStatusFilter !== 'all' && rx.status.toLowerCase() !== prescriptionsStatusFilter.toLowerCase()) return false;
                    if (prescriptionsDateFilter === 'all') return true;
                    const rxDate = new Date(rx.date);
                    const daysAgo = Math.floor((Date.now() - rxDate.getTime()) / (1000 * 60 * 60 * 24));
                    return daysAgo <= parseInt(prescriptionsDateFilter);
                  })
                  .slice((prescriptionsPage - 1) * prescriptionsPerPage, prescriptionsPage * prescriptionsPerPage)
                  .map((rx: any) => (
                  <Card key={rx.id}>
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{rx.prescriptionId}</p>
                          <p className="text-sm text-muted-foreground">{rx.date} • Prescribed by: {rx.doctor}</p>
                          {rx.diagnosis && (
                            <p className="text-sm text-muted-foreground mt-1">Diagnosis: {rx.diagnosis}</p>
                          )}
                        </div>
                        <Badge variant={
                          rx.status === 'dispensed' ? 'default' :
                          rx.status === 'partially_dispensed' ? 'secondary' :
                          rx.status === 'cancelled' ? 'destructive' :
                          'outline'
                        }>
                          {rx.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <div className="space-y-2">
                        {rx.medications && rx.medications.map((med: any, idx: number) => (
                          <div key={idx} className="bg-muted/50 p-3 rounded border-l-4 border-primary">
                            <div className="flex items-center justify-between mb-1">
                              <p className="font-medium">{med.name}</p>
                              {med.isDispensed && (
                                <Badge variant="default" className="text-xs">Dispensed</Badge>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground space-y-1">
                              <p>Dosage: {med.dosage} • Frequency: {med.frequency}</p>
                              {med.duration && <p>Duration: {med.duration}</p>}
                              <p>Quantity: {med.quantity} {med.unit}</p>
                              {med.instructions && <p>Instructions: {med.instructions}</p>}
                            </div>
                          </div>
                        ))}
                      </div>
                      {rx.notes && (
                        <div className="bg-amber-50 dark:bg-amber-900/20 p-2 rounded text-sm">
                          <span className="font-medium">Notes:</span> {rx.notes}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
                {prescriptions.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No prescriptions found</p>
                )}
              </div>
              {prescriptions.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {prescriptions.length === 0 ? 0 : `${(prescriptionsPage - 1) * prescriptionsPerPage + 1}-${Math.min(prescriptions.length, prescriptionsPage * prescriptionsPerPage)}`} of {prescriptions.length}
                    </p>
                    <Select value={String(prescriptionsPerPage)} onValueChange={(v) => { setPrescriptionsPerPage(Number(v)); setPrescriptionsPage(1); }}>
                      <SelectTrigger className="w-16 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={prescriptionsPage === 1} onClick={() => setPrescriptionsPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={prescriptionsPage >= Math.ceil(prescriptions.length / prescriptionsPerPage)} onClick={() => setPrescriptionsPage(p => p + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>

            {/* Vitals Sub-Tab */}
            <TabsContent value="vitals" className="mt-4">
              <div className="flex items-center justify-between mb-3">
                <Select value={vitalsDateFilter} onValueChange={(v) => { setVitalsDateFilter(v); setVitalsPage(1); }}>
                  <SelectTrigger className="w-[150px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="30">Last 30 Days</SelectItem>
                    <SelectItem value="90">Last 3 Months</SelectItem>
                    <SelectItem value="365">Last Year</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                {vitalSigns
                  .filter((vital: any) => {
                    if (vitalsDateFilter === 'all') return true;
                    const vitalDate = new Date(vital.date);
                    const daysAgo = Math.floor((Date.now() - vitalDate.getTime()) / (1000 * 60 * 60 * 24));
                    return daysAgo <= parseInt(vitalsDateFilter);
                  })
                  .slice((vitalsPage - 1) * vitalsPerPage, vitalsPage * vitalsPerPage)
                  .map((vital: any) => (
                  <div key={vital.id} className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4 p-4 rounded-lg border">
                    <div>
                      <p className="text-xs text-muted-foreground">Date/Time</p>
                      <p className="font-medium text-sm">{vital.date}</p>
                      <p className="font-medium text-xs">{vital.time}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Blood Pressure</p>
                      <p className="font-medium">{vital.bp}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Pulse</p>
                      <p className="font-medium">{vital.pulse} bpm</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Temperature</p>
                      <p className="font-medium">{vital.temp}°C</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">SPO2</p>
                      <p className="font-medium">{vital.spo2}%</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Weight</p>
                      <p className="font-medium">{vital.weight} kg</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">BMI</p>
                      <p className="font-medium">{vital.bmi}</p>
                    </div>
                  </div>
                ))}
                {vitalSigns.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No vital signs recorded</p>
                )}
              </div>
              {vitalSigns.length > 0 && (
                <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                  <div className="flex items-center gap-4">
                    <p className="text-sm text-muted-foreground">
                      Showing {vitalSigns.length === 0 ? 0 : `${(vitalsPage - 1) * vitalsPerPage + 1}-${Math.min(vitalSigns.length, vitalsPage * vitalsPerPage)}`} of {vitalSigns.length}
                    </p>
                    <Select value={String(vitalsPerPage)} onValueChange={(v) => { setVitalsPerPage(Number(v)); setVitalsPage(1); }}>
                      <SelectTrigger className="w-16 h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="5">5</SelectItem>
                        <SelectItem value="10">10</SelectItem>
                        <SelectItem value="25">25</SelectItem>
                        <SelectItem value="50">50</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" disabled={vitalsPage === 1} onClick={() => setVitalsPage(p => p - 1)}>
                      <ChevronLeft className="h-4 w-4" />
                      Previous
                    </Button>
                    <Button variant="outline" size="sm" disabled={vitalsPage >= Math.ceil(vitalSigns.length / vitalsPerPage)} onClick={() => setVitalsPage(p => p + 1)}>
                      Next
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}

