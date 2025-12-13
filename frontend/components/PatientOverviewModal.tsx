"use client";

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { toast } from "sonner";
import { patientService, labService, pharmacyService, consultationService, radiologyService, type Patient as ApiPatient } from '@/lib/services';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import Link from 'next/link';
import { VisitDetailModal } from '@/components/VisitDetailModal';
import { 
  User, Phone, Calendar, Heart, AlertCircle, FileText, Activity, Pill, TestTube, Plus, 
  ChevronRight, AlertTriangle, Eye, Trash2, Stethoscope, Loader2, Mail, MapPin, Droplets,
  Briefcase, X, RefreshCw, ClipboardList, History, ScanLine, ChevronLeft, Download
} from 'lucide-react';

interface Patient {
  id: string;
  name: string;
  category: string;
  personalNumber?: string;
  employeeType?: string;
  division?: string;
  age: number;
  gender: string;
  dob: string;
  phone: string;
  email: string;
  bloodGroup: string;
  address: string;
  emergencyContact: string;
  lastVisit: string;
  totalVisits: number;
  location: string;
  photoUrl: string;
  registeredAt: string;
  primaryPatient?: string;
  relationship?: string;
  nonNpaType?: string;
}

interface PatientDetail {
  id: string;
  patientId: string;
  firstName: string;
  lastName: string;
  middleName: string;
  dateOfBirth: string;
  age: number;
  gender: string;
  maritalStatus: string;
  religion?: string;
  tribe?: string;
  occupation?: string;
  bloodGroup: string;
  genotype: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  status: string;
  photoUrl: string;
  category: string;
  personalNumber: string;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: Array<{
    id: number;
    name: string;
    dosage: string;
    frequency: string;
    prescribedBy: string;
    startDate: string;
  }>;
  emergencyContact: {
    name: string;
    relationship: string;
    phone: string;
  };
  nextOfKin: {
    name: string;
    relationship: string;
    phone: string;
  };
  numericId: number;
}

interface Visit {
  id: string;
  numericId?: number;
  visitId?: string;
  patientId: string;
  patient?: string;
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

interface PatientOverviewModalProps {
  patient: Patient | null;
  isOpen: boolean;
  onClose: () => void;
  onEdit?: (patient: Patient) => void;
}

// Helper component for patient avatar
const PatientAvatar = ({ patient, size = 'lg' }: { patient: Patient, size?: 'sm' | 'md' | 'lg' }) => {
  const sizeClasses = {
    sm: 'w-12 h-12 text-sm',
    md: 'w-16 h-16 text-lg',
    lg: 'w-20 h-20 text-xl'
  };
  
  const initials = patient.name.split(' ').map(n => n[0]).join('').toUpperCase();
  
  if (patient.photoUrl) {
    return (
      <div className={`${sizeClasses[size]} rounded-full overflow-hidden bg-muted border-2 border-primary/20`}>
        <img 
          src={patient.photoUrl} 
          alt={patient.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            const target = e.target as HTMLImageElement;
            target.style.display = 'none';
            const parent = target.parentElement;
            if (parent) {
              parent.innerHTML = `<div class="${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-bold border-2 border-primary/20">${initials}</div>`;
            }
          }}
        />
      </div>
    );
  }
  
  return (
    <div className={`${sizeClasses[size]} rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-white font-bold border-2 border-primary/20`}>
      {initials}
    </div>
  );
};

export function PatientOverviewModal({ patient, isOpen, onClose, onEdit }: PatientOverviewModalProps) {
  const [patientDetail, setPatientDetail] = useState<PatientDetail | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [labResults, setLabResults] = useState<any[]>([]);
  const [vitalSigns, setVitalSigns] = useState<any[]>([]);
  const [prescriptions, setPrescriptions] = useState<any[]>([]);
  const [consultationSessions, setConsultationSessions] = useState<any[]>([]);
  const [imagingResults, setImagingResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [historySubTab, setHistorySubTab] = useState('consultations');
  
  // History tab filters and pagination
  const [sessionDateFilter, setSessionDateFilter] = useState<string>('all');
  const [labDateFilter, setLabDateFilter] = useState<string>('all');
  const [labStatusFilter, setLabStatusFilter] = useState<string>('all');
  const [imagingDateFilter, setImagingDateFilter] = useState<string>('all');
  const [imagingStatusFilter, setImagingStatusFilter] = useState<string>('all');
  const [consultationsPage, setConsultationsPage] = useState(1);
  const [labResultsPage, setLabResultsPage] = useState(1);
  const [imagingPage, setImagingPage] = useState(1);
  const [consultationsPerPage, setConsultationsPerPage] = useState(10);
  const [labResultsPerPage, setLabResultsPerPage] = useState(10);
  const [imagingPerPage, setImagingPerPage] = useState(10);
  
  // Visit detail modal state
  const [isVisitDetailModalOpen, setIsVisitDetailModalOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);
  
  const handleViewVisit = (visit: Visit) => {
    setSelectedVisit(visit);
    setIsVisitDetailModalOpen(true);
  };

  const loadPatientData = useCallback(async () => {
    if (!patient) return;
    
    try {
      setLoading(true);
      
      // Get numeric ID for API calls
      const patientIdStr = patient.id.trim();
      let numericId: number;
      let apiPatient: ApiPatient;
      
      const parsedId = parseInt(patientIdStr, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        numericId = parsedId;
        apiPatient = await patientService.getPatient(numericId);
      } else {
        const searchResult = await patientService.getPatients({ search: patientIdStr });
        const matchedPatient = searchResult.results.find(
          p => p.patient_id === patientIdStr || p.patient_id.toUpperCase() === patientIdStr.toUpperCase()
        );
        if (!matchedPatient) {
          throw new Error(`Patient with ID "${patientIdStr}" not found`);
        }
        numericId = matchedPatient.id;
        apiPatient = matchedPatient;
      }
      
      // Load all patient data in parallel
      const [visitsData, vitalsData, labData, historyData, prescriptionsData, consultationsData, imagingData] = await Promise.allSettled([
        patientService.getPatientVisits(numericId),
        patientService.getPatientVitals(numericId),
        labService.getOrders({ patient: numericId.toString() }),
        patientService.getPatientHistory(numericId),
        pharmacyService.getPrescriptions({ patient: numericId.toString() }),
        consultationService.getSessions({ patient: numericId }).catch(() => ({ results: [] })),
        radiologyService.getOrders({ patient: numericId.toString() }).catch(() => ({ results: [] })),
      ]);

      // Process visits
      if (visitsData.status === 'fulfilled') {
        const transformedVisits = visitsData.value.map((visit: any) => ({
          id: visit.id.toString(),
          numericId: visit.id,
          visitId: visit.visit_id || visit.id.toString(),
          patientId: visit.patient?.toString() || numericId.toString(),
          date: visit.date || visit.created_at?.split('T')[0] || '',
          time: visit.created_at ? new Date(visit.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '',
          type: visit.visit_type || 'OPD',
          department: visit.department || '',
          doctor: visit.doctor?.name || visit.assigned_doctor || 'Unknown',
          chiefComplaint: visit.chief_complaint || '',
          diagnosis: visit.diagnosis || '',
          status: visit.status || 'completed',
          clinic: visit.clinic?.name || '',
        }));
        setVisits(transformedVisits);
      }

      // Process vitals
      if (vitalsData.status === 'fulfilled' && Array.isArray(vitalsData.value)) {
        const transformedVitals = vitalsData.value.map((vital: any) => ({
          id: vital.id.toString(),
          date: vital.recorded_at ? new Date(vital.recorded_at).toLocaleDateString() : '',
          time: vital.recorded_at ? new Date(vital.recorded_at).toLocaleTimeString() : '',
          bp: vital.blood_pressure_systolic && vital.blood_pressure_diastolic 
            ? `${vital.blood_pressure_systolic}/${vital.blood_pressure_diastolic}`
            : '-',
          pulse: vital.heart_rate?.toString() || '-',
          temp: vital.temperature?.toString() || '-',
          spo2: vital.oxygen_saturation?.toString() || '-',
          weight: vital.weight?.toString() || '-',
          bmi: vital.bmi?.toString() || '-',
          recordedBy: vital.recorded_by?.toString() || 'Unknown',
        }));
        setVitalSigns(transformedVitals);
      }

      // Process lab results
      if (labData.status === 'fulfilled' && labData.value?.results) {
        const transformedLabResults = labData.value.results.flatMap((order: any) => 
          (order.tests || []).filter((test: any) => test.status === 'results_ready' || test.status === 'verified').map((test: any) => {
            // Extract results with units and ranges
            const results = test.results || {};
            const resultEntries = Object.entries(results);
            const formattedResults = resultEntries.map(([key, value]: [string, any]) => {
              const unit = test.normal_range?.[key]?.unit || '';
              const range = test.normal_range?.[key]?.range || '';
              return `${key}: ${value}${unit ? ` ${unit}` : ''}${range ? ` (${range})` : ''}`;
            }).join(', ') || 'Pending';
            
            return {
              id: `${order.id}-${test.id}`,
              test: test.name || test.code || 'Unknown Test',
              category: test.sample_type || 'General',
              date: order.ordered_at ? new Date(order.ordered_at).toLocaleDateString() : '',
              result: formattedResults,
              unit: '',
              range: '',
              status: test.status === 'verified' ? 'Normal' : 'Pending',
              orderedBy: order.doctor?.name || 'Unknown',
              verifiedBy: test.processed_by || 'Pending',
              notes: test.notes || '',
            };
          })
        );
        setLabResults(transformedLabResults);
      }

      // Process consultation sessions
      if (consultationsData.status === 'fulfilled' && consultationsData.value?.results) {
        const transformedSessions = consultationsData.value.results.map((session: any) => ({
          id: session.id?.toString() || String(session.id),
          date: session.created_at ? new Date(session.created_at).toLocaleDateString() : session.date || '',
          chiefComplaint: session.chief_complaint || '',
          doctor: session.doctor?.name || session.doctor_name || 'Unknown',
          clinic: session.clinic || session.room?.name || 'General',
          room: session.room?.name || '',
          status: session.status || 'completed',
          notes: session.notes || '',
          diagnoses: session.diagnoses || [],
        }));
        setConsultationSessions(transformedSessions);
      }

      // Process imaging results - extract studies from orders
      if (imagingData.status === 'fulfilled' && imagingData.value?.results) {
        const allStudies: any[] = [];
        imagingData.value.results.forEach((order: any) => {
          if (order.studies && Array.isArray(order.studies)) {
            order.studies.forEach((study: any) => {
              allStudies.push({
                id: study.id?.toString() || String(study.id),
                studyId: order.order_id ? `${order.order_id}-${study.id}` : `IMG-${study.id}`,
                type: study.modality || study.procedure || 'Unknown',
                description: study.body_part || study.procedure || '',
                date: order.ordered_at ? new Date(order.ordered_at).toLocaleDateString() : study.created_at ? new Date(study.created_at).toLocaleDateString() : '',
                status: study.status || 'pending',
                orderedBy: order.doctor_name || order.doctor?.name || 'Unknown',
                result: study.findings || study.report || 'Pending',
                report: study.report || '',
              });
            });
          }
        });
        setImagingResults(allStudies);
      }

      // Process prescriptions
      if (prescriptionsData.status === 'fulfilled' && prescriptionsData.value?.results) {
        const transformedPrescriptions = prescriptionsData.value.results.map((rx: any) => ({
          id: rx.id.toString(),
          prescriptionId: rx.prescription_id || `RX-${rx.id}`,
          date: rx.prescribed_at ? new Date(rx.prescribed_at).toLocaleDateString() : '',
          doctor: rx.doctor_name || 'Unknown',
          status: rx.status || 'pending',
          diagnosis: rx.diagnosis || '',
          notes: rx.notes || '',
          medications: (rx.medications || []).map((med: any) => ({
            name: med.medication_name || '',
            dosage: med.dosage || '',
            frequency: med.frequency || '',
            duration: med.duration || '',
            quantity: med.quantity || 0,
            unit: med.unit || '',
            instructions: med.instructions || '',
            isDispensed: med.is_dispensed || false,
          })),
        }));
        setPrescriptions(transformedPrescriptions);
      }

      // Process history
      let allergies: string[] = [];
      let conditions: string[] = [];
      let medications: any[] = [];
      
      if (historyData.status === 'fulfilled' && historyData.value) {
        const history = historyData.value;
        allergies = history.allergies || [];
        conditions = history.chronic_conditions || history.conditions || [];
        medications = (history.medications || []).map((med: any, index: number) => ({
          id: med.id || index,
          name: med.name || med.medication_name || '',
          dosage: med.dosage || med.dose || '',
          frequency: med.frequency || med.schedule || '',
          prescribedBy: med.prescribed_by || med.prescribedBy || 'Unknown',
          startDate: med.start_date || med.startDate || new Date().toISOString().split('T')[0],
        }));
      }

      // Transform to PatientDetail
      const detail: PatientDetail = {
        id: apiPatient.id.toString(),
        patientId: apiPatient.patient_id || apiPatient.id.toString(),
        firstName: apiPatient.first_name || '',
        lastName: apiPatient.surname || '',
        middleName: apiPatient.middle_name || '',
        dateOfBirth: apiPatient.date_of_birth || '',
        age: apiPatient.age || 0,
        gender: apiPatient.gender === 'male' ? 'Male' : 'Female',
        maritalStatus: apiPatient.marital_status || '',
        religion: (apiPatient as any).religion || '',
        tribe: (apiPatient as any).tribe || '',
        occupation: (apiPatient as any).occupation || '',
        bloodGroup: apiPatient.blood_group || '',
        genotype: apiPatient.genotype || '',
        phone: apiPatient.phone || '',
        email: apiPatient.email || '',
        address: apiPatient.residential_address || apiPatient.permanent_address || '',
        city: '',
        state: apiPatient.state_of_residence || '',
        status: 'active',
        photoUrl: apiPatient.photo || '',
        category: apiPatient.category || '',
        personalNumber: apiPatient.personal_number || '',
        allergies,
        chronicConditions: conditions,
        currentMedications: medications,
        emergencyContact: {
          name: apiPatient.nok_first_name ? `${apiPatient.nok_first_name} ${apiPatient.nok_middle_name || ''}`.trim() : '',
          relationship: apiPatient.nok_relationship || '',
          phone: apiPatient.nok_phone || '',
        },
        nextOfKin: {
          name: apiPatient.nok_first_name ? `${apiPatient.nok_first_name} ${apiPatient.nok_middle_name || ''}`.trim() : '',
          relationship: apiPatient.nok_relationship || '',
          phone: apiPatient.nok_phone || '',
        },
        numericId,
      };
      
      setPatientDetail(detail);
    } catch (err: any) {
      console.error('Error loading patient data:', err);
      toast.error(err.message || 'Failed to load patient data');
    } finally {
      setLoading(false);
    }
  }, [patient]);

  useEffect(() => {
    if (isOpen && patient) {
      loadPatientData();
      setActiveTab('overview');
      setHistorySubTab('consultations');
    }
  }, [isOpen, patient, loadPatientData]);

  const getCategoryBadge = (category: string) => {
    const styles: Record<string, string> = {
      'Employee': 'border-teal-500/50 text-teal-600 dark:text-teal-400',
      'Retiree': 'border-amber-500/50 text-amber-600 dark:text-amber-400',
      'Dependent': 'border-violet-500/50 text-violet-600 dark:text-violet-400',
      'NonNPA': 'border-blue-500/50 text-blue-600 dark:text-blue-400',
    };
    return styles[category] || 'border-muted-foreground/50 text-muted-foreground';
  };

  if (!patient) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] w-full overflow-hidden flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {loading ? (
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              ) : (
                <PatientAvatar patient={patient} size="lg" />
              )}
              <div>
                <DialogTitle className="text-2xl font-bold">{patient.name}</DialogTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <Badge variant="outline" className={getCategoryBadge(patient.category)}>
                    {patient.category}
                  </Badge>
                  <span>{patient.id}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={loadPatientData} disabled={loading} title="Refresh data">
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              </Button>
              {onEdit && (
                <Button variant="outline" size="sm" onClick={() => { onClose(); onEdit(patient); }}>
                  Edit Patient
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              <span className="ml-3 text-muted-foreground">Loading patient data...</span>
            </div>
          ) : (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="h-full flex flex-col">
              <div className="px-6 pt-4 border-b">
                <TabsList className="bg-muted border border-border p-1 flex-wrap h-auto gap-1">
                  <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Activity className="h-4 w-4 mr-2" />Overview
                  </TabsTrigger>
                  <TabsTrigger value="visits" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Calendar className="h-4 w-4 mr-2" />Visits
                  </TabsTrigger>
                  <TabsTrigger value="medications" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Pill className="h-4 w-4 mr-2" />Medications
                  </TabsTrigger>
                  <TabsTrigger value="lab" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <TestTube className="h-4 w-4 mr-2" />Lab Results
                  </TabsTrigger>
                  <TabsTrigger value="vitals" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <Heart className="h-4 w-4 mr-2" />Vitals History
                  </TabsTrigger>
                  <TabsTrigger value="prescriptions" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <ClipboardList className="h-4 w-4 mr-2" />Prescriptions
                  </TabsTrigger>
                  <TabsTrigger value="history" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                    <History className="h-4 w-4 mr-2" />History
                  </TabsTrigger>
                </TabsList>
              </div>

              <div className="flex-1 overflow-y-auto px-6 py-4">
                {/* OVERVIEW TAB */}
                <TabsContent value="overview" className="space-y-6 mt-0">
                  {patientDetail ? (
                    <>
                      <div className="grid gap-6 lg:grid-cols-3">
                        <div className="space-y-6 lg:col-span-2">
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                              { icon: Calendar, value: visits.length, label: 'Total Visits', color: 'text-blue-500' },
                              { icon: Pill, value: patientDetail.currentMedications.length, label: 'Active Meds', color: 'text-violet-500' },
                              { icon: TestTube, value: labResults.length, label: 'Lab Tests', color: 'text-amber-500' },
                              { icon: AlertCircle, value: patientDetail.chronicConditions.length, label: 'Conditions', color: 'text-rose-500' }
                            ].map((stat, i) => (
                              <Card key={i}>
                                <CardContent className="p-4 text-center">
                                  <stat.icon className={`h-6 w-6 ${stat.color} mx-auto mb-2`} />
                                  <p className="text-2xl font-bold">{stat.value}</p>
                                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                                </CardContent>
                              </Card>
                            ))}
                          </div>

                          <Card>
                            <CardHeader className="flex flex-row items-center justify-between">
                              <CardTitle className="flex items-center gap-2">
                                <Calendar className="h-5 w-5 text-blue-500" />Recent Visits
                              </CardTitle>
                              <Button variant="ghost" size="sm" onClick={() => setActiveTab('visits')}>
                                View All<ChevronRight className="h-4 w-4 ml-1" />
                              </Button>
                            </CardHeader>
                            <CardContent className="space-y-3">
                              {visits.slice(0, 3).map((visit) => (
                                <div 
                                  key={visit.id} 
                                  onClick={() => handleViewVisit(visit)}
                                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-muted/50 transition-all cursor-pointer"
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-2 h-2 rounded-full ${
                                      visit.type === 'Emergency' ? 'bg-rose-500' : 
                                      visit.type === 'OPD' ? 'bg-emerald-500' : 
                                      'bg-blue-500'
                                    }`} />
                                    <div>
                                      <p className="font-medium">{visit.chiefComplaint}</p>
                                      <p className="text-xs text-muted-foreground">{visit.date} • {visit.doctor}</p>
                                    </div>
                                  </div>
                                  <Badge variant="outline">{visit.type}</Badge>
                                </div>
                              ))}
                              {visits.length === 0 && (
                                <p className="text-sm text-muted-foreground text-center py-4">No visits recorded</p>
                              )}
                            </CardContent>
                          </Card>

                          <div className="grid md:grid-cols-2 gap-6">
                            <Card>
                              <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                  <Activity className="h-5 w-5 text-rose-500" />Active Conditions
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {patientDetail.chronicConditions.length > 0 ? (
                                  patientDetail.chronicConditions.map((c, i) => (
                                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                                      <div className="w-2 h-2 rounded-full bg-rose-500" />
                                      <span>{c}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">No chronic conditions recorded</p>
                                )}
                              </CardContent>
                            </Card>
                            <Card>
                              <CardHeader>
                                <CardTitle className="flex items-center gap-2">
                                  <AlertTriangle className="h-5 w-5 text-amber-500" />Allergies
                                </CardTitle>
                              </CardHeader>
                              <CardContent className="space-y-2">
                                {patientDetail.allergies.length > 0 ? (
                                  patientDetail.allergies.map((a, i) => (
                                    <div key={i} className="flex items-center gap-2 p-2 rounded bg-destructive/10">
                                      <AlertTriangle className="h-4 w-4 text-destructive" />
                                      <span>{a}</span>
                                    </div>
                                  ))
                                ) : (
                                  <p className="text-sm text-muted-foreground">No known allergies</p>
                                )}
                              </CardContent>
                            </Card>
                          </div>
                        </div>

                        <div className="space-y-6">
                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <User className="h-5 w-5 text-blue-500" />Demographics
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-3 text-sm">
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Date of Birth</span>
                                <span>{patientDetail.dateOfBirth || 'Not provided'}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Age</span>
                                <span>{patientDetail.age} years</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Gender</span>
                                <span>{patientDetail.gender}</span>
                              </div>
                              {patientDetail.maritalStatus && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Marital Status</span>
                                  <span className="capitalize">{patientDetail.maritalStatus}</span>
                                </div>
                              )}
                              {patientDetail.religion && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Religion</span>
                                  <span>{patientDetail.religion}</span>
                                </div>
                              )}
                              {patientDetail.tribe && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Tribe</span>
                                  <span>{patientDetail.tribe}</span>
                                </div>
                              )}
                              {patientDetail.occupation && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Occupation</span>
                                  <span>{patientDetail.occupation}</span>
                                </div>
                              )}
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Blood Group</span>
                                <span className="flex items-center gap-1">
                                  <Droplets className="h-3 w-3 text-rose-500" />
                                  {patientDetail.bloodGroup || 'Not provided'}
                                </span>
                              </div>
                              <Separator />
                              <div>
                                <p className="text-muted-foreground mb-1">Address</p>
                                <p>{patientDetail.address || 'Not provided'}</p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <AlertCircle className="h-5 w-5 text-rose-500" />Next of Kin
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                              <div>
                                <p className="text-muted-foreground">Name</p>
                                <p className="font-medium">{patientDetail.nextOfKin.name || 'Not provided'}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Relationship</p>
                                <p>{patientDetail.nextOfKin.relationship || 'Not provided'}</p>
                              </div>
                              <div>
                                <p className="text-muted-foreground">Phone</p>
                                <p className="text-primary">{patientDetail.nextOfKin.phone || 'Not provided'}</p>
                              </div>
                            </CardContent>
                          </Card>

                          <Card>
                            <CardHeader>
                              <CardTitle className="flex items-center gap-2">
                                <Phone className="h-5 w-5 text-teal-500" />Contact
                              </CardTitle>
                            </CardHeader>
                            <CardContent className="space-y-2 text-sm">
                              <div className="flex items-center gap-2">
                                <Phone className="h-4 w-4 text-muted-foreground" />
                                <span>{patient.phone}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{patient.email || 'Not provided'}</span>
                              </div>
                              <div className="flex items-start gap-2">
                                <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                                <span>{patient.location || 'Not provided'}</span>
                              </div>
                            </CardContent>
                          </Card>
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-center py-12">
                      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Loading patient details...</p>
                    </div>
                  )}
                </TabsContent>

                {/* VISITS TAB */}
                <TabsContent value="visits" className="mt-0">
                  <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle>Visit History</CardTitle>
                      <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white" asChild>
                        <Link href={`/medical-records/visits/new?patient=${patient.id}`}>
                          <Plus className="h-4 w-4 mr-2" />New Visit
                        </Link>
                      </Button>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {visits.map((v) => (
                          <div 
                            key={v.id} 
                            onClick={() => handleViewVisit(v)}
                            className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/30 transition-colors cursor-pointer"
                          >
                            <div className="flex items-center gap-4">
                              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                                v.type === 'Emergency' ? 'bg-rose-100 dark:bg-rose-900/30' :
                                v.type === 'OPD' ? 'bg-emerald-100 dark:bg-emerald-900/30' :
                                'bg-blue-100 dark:bg-blue-900/30'
                              }`}>
                                <Stethoscope className={`h-5 w-5 ${
                                  v.type === 'Emergency' ? 'text-rose-600' :
                                  v.type === 'OPD' ? 'text-emerald-600' :
                                  'text-blue-600'
                                }`} />
                              </div>
                              <div>
                                <p className="font-medium">{v.chiefComplaint}</p>
                                <p className="text-sm text-muted-foreground">{v.date} • {v.doctor} • {v.department}</p>
                                {v.diagnosis && <p className="text-sm text-muted-foreground">Diagnosis: {v.diagnosis}</p>}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className={
                                v.type === 'Emergency' ? 'border-rose-500/50 text-rose-600' :
                                v.type === 'OPD' ? 'border-emerald-500/50 text-emerald-600' :
                                'border-blue-500/50 text-blue-600'
                              }>{v.type}</Badge>
                            </div>
                          </div>
                        ))}
                        {visits.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">No visits recorded</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* MEDICATIONS TAB */}
                <TabsContent value="medications" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Current Medications</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid gap-3">
                        {patientDetail?.currentMedications.map((m) => (
                          <div key={m.id} className="flex items-center justify-between p-4 rounded-lg border bg-muted/30">
                            <div className="flex items-center gap-3">
                              <Pill className="h-5 w-5 text-violet-500" />
                              <div>
                                <p className="font-medium">{m.name}</p>
                                <p className="text-sm text-muted-foreground">Dosage: {m.dosage} • Prescribed by: {m.prescribedBy}</p>
                                <p className="text-xs text-muted-foreground">Started: {m.startDate}</p>
                              </div>
                            </div>
                            <Badge className="bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30">
                              {m.frequency}
                            </Badge>
                          </div>
                        ))}
                        {(!patientDetail || patientDetail.currentMedications.length === 0) && (
                          <p className="text-sm text-muted-foreground text-center py-8">No current medications</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* LAB RESULTS TAB */}
                <TabsContent value="lab" className="mt-0 space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Lab Test Results</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {labResults.map((result) => (
                          <div key={result.id} className="p-4 rounded-lg border space-y-2">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{result.test}</p>
                                <p className="text-sm text-muted-foreground">{result.category} • {result.date}</p>
                              </div>
                              <Badge variant={result.status === 'Normal' ? 'default' : 'secondary'}>
                                {result.status}
                              </Badge>
                            </div>
                            <div className="space-y-1">
                              <p className="text-sm"><span className="font-medium">Result:</span> {result.result}</p>
                              {result.notes && (
                                <p className="text-sm text-muted-foreground"><span className="font-medium">Notes:</span> {result.notes}</p>
                              )}
                              <p className="text-xs text-muted-foreground">
                                Ordered by: {result.orderedBy} • Verified by: {result.verifiedBy}
                              </p>
                            </div>
                          </div>
                        ))}
                        {labResults.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">No lab results available</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* VITALS TAB */}
                <TabsContent value="vitals" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Vital Signs History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {vitalSigns.map((vital) => (
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
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* PRESCRIPTIONS TAB */}
                <TabsContent value="prescriptions" className="mt-0">
                  <Card>
                    <CardHeader>
                      <CardTitle>Prescription History</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {prescriptions.map((rx) => (
                          <div key={rx.id} className="p-4 rounded-lg border space-y-3">
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
                              {rx.medications.map((med: any, idx: number) => (
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
                          </div>
                        ))}
                        {prescriptions.length === 0 && (
                          <p className="text-sm text-muted-foreground text-center py-8">No prescriptions found</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* HISTORY TAB */}
                <TabsContent value="history" className="mt-0">
                  <div className="space-y-4">
                    {/* Allergies and Chronic Conditions Cards */}
                    {patientDetail && (
                      <div className="grid gap-4 lg:grid-cols-2">
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
                      </div>
                    )}

                    {/* History Tables in Tabs */}
                    <Card>
                      <CardHeader>
                        <CardTitle>Patient History</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <Tabs value={historySubTab} onValueChange={setHistorySubTab} className="w-full">
                          <TabsList className="grid w-full grid-cols-3">
                            <TabsTrigger value="consultations" className="text-xs">
                              <ClipboardList className="h-3 w-3 mr-1" />
                              Consultations ({consultationSessions.length})
                            </TabsTrigger>
                            <TabsTrigger value="labs" className="text-xs">
                              <TestTube className="h-3 w-3 mr-1" />
                              Lab Results ({labResults.length})
                            </TabsTrigger>
                            <TabsTrigger value="imaging" className="text-xs">
                              <ScanLine className="h-3 w-3 mr-1" />
                              Imaging ({imagingResults.length})
                            </TabsTrigger>
                          </TabsList>

                          {/* Consultations Sub-Tab */}
                          <TabsContent value="consultations" className="mt-4">
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
                                    <th className="px-4 py-2 text-left font-medium">Chief Complaint</th>
                                    <th className="px-4 py-2 text-left font-medium">Doctor</th>
                                    <th className="px-4 py-2 text-left font-medium">Clinic</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {consultationSessions
                                    .filter((s: any) => {
                                      if (sessionDateFilter === 'all') return true;
                                      const sessionDate = new Date(s.date);
                                      const daysAgo = Math.floor((Date.now() - sessionDate.getTime()) / (1000 * 60 * 60 * 24));
                                      return daysAgo <= parseInt(sessionDateFilter);
                                    })
                                    .slice((consultationsPage - 1) * consultationsPerPage, consultationsPage * consultationsPerPage)
                                    .map((session: any) => (
                                    <tr key={session.id} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{session.date}</td>
                                      <td className="px-4 py-3 font-medium">{session.chiefComplaint || 'N/A'}</td>
                                      <td className="px-4 py-3">{session.doctor}</td>
                                      <td className="px-4 py-3">
                                        <Badge variant="outline">{session.clinic}</Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm">
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                  {consultationSessions.length === 0 && (
                                    <tr>
                                      <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">
                                        No consultation sessions found
                                      </td>
                                    </tr>
                                  )}
                                </tbody>
                              </table>
                            </div>
                            {consultationSessions.length > 0 && (
                              <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                                <div className="flex items-center gap-4">
                                  <p className="text-sm text-muted-foreground">
                                    Showing {consultationSessions.length === 0 ? 0 : `${(consultationsPage - 1) * consultationsPerPage + 1}-${Math.min(consultationSessions.length, consultationsPage * consultationsPerPage)}`} of {consultationSessions.length}
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
                                  <Button variant="outline" size="sm" disabled={consultationsPage >= Math.ceil(consultationSessions.length / consultationsPerPage)} onClick={() => setConsultationsPage(p => p + 1)}>
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
                                    <th className="px-4 py-2 text-left font-medium">Study ID</th>
                                    <th className="px-4 py-2 text-left font-medium">Type</th>
                                    <th className="px-4 py-2 text-left font-medium">Description</th>
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
                                      <td className="px-4 py-3 font-medium">{img.studyId}</td>
                                      <td className="px-4 py-3">{img.type}</td>
                                      <td className="px-4 py-3">{img.description || 'N/A'}</td>
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
                        </Tabs>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>
              </div>
            </Tabs>
          )}
        </div>
      </DialogContent>
      
      {/* Visit Detail Modal */}
      <VisitDetailModal
        visit={selectedVisit}
        visitId={selectedVisit?.id}
        isOpen={isVisitDetailModalOpen}
        onClose={() => setIsVisitDetailModalOpen(false)}
        onVisitUpdated={() => {
          // Reload visits when visit is updated
          if (patient) {
            loadPatientData();
          }
        }}
      />
    </Dialog>
  );
}

