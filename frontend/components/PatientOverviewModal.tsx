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
import { PatientAvatar } from "@/components/PatientAvatar";
import { MedicalHistoryTab } from '@/components/patient-overview/MedicalHistoryTab';
import { TimelineTab } from '@/components/patient-overview/TimelineTab';
import { CurrentCareTab } from '@/components/patient-overview/CurrentCareTab';
import { 
  User, Phone, Calendar, Heart, AlertCircle, FileText, Activity, Pill, TestTube, Plus, 
  ChevronRight, AlertTriangle, Eye, Trash2, Stethoscope, Loader2, Mail, MapPin, Droplets,
  Briefcase, X, RefreshCw, ClipboardList, History, ScanLine, ChevronLeft, Download, Clock
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
  const [historySubTab, setHistorySubTab] = useState('background');
  const [currentCareSubTab, setCurrentCareSubTab] = useState('active-medications');
  
  // History tab filters and pagination
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
        } else {
          const searchResult = await patientService.getPatients({ search: patientIdStr });
          const matchedPatient = searchResult.results.find(
            p => p.patient_id === patientIdStr || p.patient_id.toUpperCase() === patientIdStr.toUpperCase()
          );
          if (!matchedPatient) {
            throw new Error(`Patient with ID "${patientIdStr}" not found`);
          }
          numericId = matchedPatient.id;
        }
        
        // Always fetch full patient details using the detailed serializer
        apiPatient = await patientService.getPatient(numericId);
      
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
          doctor: visit.doctor_name || 'Unknown',
          chiefComplaint: visit.chief_complaint || '',
          diagnosis: visit.diagnosis || '',
          status: visit.status || 'completed',
          clinic: visit.clinic?.name || '',
          notes: visit.clinical_notes || '',
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

      // Format date of birth
      let formattedDateOfBirth = '';
      if (apiPatient.date_of_birth) {
        try {
          const date = new Date(apiPatient.date_of_birth);
          if (!isNaN(date.getTime())) {
            formattedDateOfBirth = date.toLocaleDateString('en-US', { 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
          }
        } catch (e) {
          // If date parsing fails, use the original string
          formattedDateOfBirth = apiPatient.date_of_birth;
        }
      }
      
      // Format address - combine residential and permanent if both exist
      let formattedAddress = '';
      if (apiPatient.residential_address && apiPatient.permanent_address) {
        if (apiPatient.residential_address === apiPatient.permanent_address) {
          formattedAddress = apiPatient.residential_address;
        } else {
          formattedAddress = `Residential: ${apiPatient.residential_address}\nPermanent: ${apiPatient.permanent_address}`;
        }
      } else {
        formattedAddress = apiPatient.residential_address || apiPatient.permanent_address || '';
      }

      // Format next of kin name - include surname if available
      const nokFirstName = apiPatient.nok_first_name || '';
      const nokMiddleName = apiPatient.nok_middle_name || '';
      const nokSurname = apiPatient.nok_surname || '';
      const nokName = [nokFirstName, nokMiddleName, nokSurname].filter(Boolean).join(' ').trim();

      // Transform to PatientDetail
      const detail: PatientDetail = {
        id: apiPatient.id.toString(),
        patientId: apiPatient.patient_id || apiPatient.id.toString(),
        firstName: apiPatient.first_name || '',
        lastName: apiPatient.surname || '',
        middleName: apiPatient.middle_name || '',
        dateOfBirth: formattedDateOfBirth,
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
        address: formattedAddress,
        city: '',
        state: apiPatient.state_of_residence || '',
        status: 'active',
        photoUrl: (() => {
          const photoPath = apiPatient.photo;
          if (!photoPath) return '';
          // If it's already a full URL, return as is
          if (photoPath.startsWith('http://') || photoPath.startsWith('https://')) {
            return photoPath;
          }
          // Construct full URL from API base URL
          if (photoPath.startsWith('/media/')) {
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
            const baseUrl = apiUrl.replace(/\/api\/?$/, '');
            return `${baseUrl}${photoPath}`;
          }
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
          const baseUrl = apiUrl.replace(/\/api\/?$/, '');
          return `${baseUrl}/media/${photoPath.startsWith('/') ? photoPath.slice(1) : photoPath}`;
        })(),
        category: apiPatient.category || '',
        personalNumber: apiPatient.personal_number || '',
        allergies,
        chronicConditions: conditions,
        currentMedications: medications,
        emergencyContact: {
          name: nokName,
          relationship: apiPatient.nok_relationship || '',
          phone: apiPatient.nok_phone || '',
        },
        nextOfKin: {
          name: nokName,
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
      setHistorySubTab('background');
      setCurrentCareSubTab('active-medications');
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

  if (!patient) {
    return null;
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {loading ? (
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              ) : (
                <PatientAvatar name={patient.name} photoUrl={patient.photoUrl} size="lg" className="border-2 border-primary/20" />
              )}
              <div>
                <DialogTitle className="text-2xl font-bold">{patient.name || 'Patient Details'}</DialogTitle>
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

        {loading ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            <span className="ml-3 text-muted-foreground">Loading patient data...</span>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-4 border-b flex-shrink-0">
              <TabsList className="bg-muted border border-border p-1 flex-wrap h-auto gap-1">
                <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Activity className="h-4 w-4 mr-2" />Overview
                </TabsTrigger>
                <TabsTrigger value="timeline" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Clock className="h-4 w-4 mr-2" />Timeline
                </TabsTrigger>
                <TabsTrigger value="medical-history" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <History className="h-4 w-4 mr-2" />Medical History
                </TabsTrigger>
                <TabsTrigger value="current-care" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <AlertCircle className="h-4 w-4 mr-2" />Current Care
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="flex-1 overflow-y-auto px-6 py-4 space-y-6 mt-0">
                  {patientDetail ? (
                    <>
                      <div className="grid gap-6 lg:grid-cols-3">
                        <div className="space-y-6 lg:col-span-2">
                          <div className="grid grid-cols-3 gap-4">
                            {[
                              { icon: Calendar, value: visits.length, label: 'Total Visits', color: 'text-blue-500' },
                              { icon: Pill, value: patientDetail.currentMedications.length, label: 'Active Meds', color: 'text-violet-500' },
                              { icon: TestTube, value: labResults.length, label: 'Lab Tests', color: 'text-amber-500' }
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
                              <Button variant="ghost" size="sm" onClick={() => {
                                setActiveTab('medical-history');
                                setHistorySubTab('visits-consultations');
                              }}>
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
                                      <p className="font-medium">{visit.chiefComplaint || visit.type}</p>
                                      <p className="text-xs text-muted-foreground">
                                        {visit.date} {visit.doctor && visit.doctor !== 'Unknown' && `• ${visit.doctor}`}
                                      </p>
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
                                  <p className="text-sm text-muted-foreground">No allergies recorded</p>
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
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Genotype</span>
                                <span>{patientDetail.genotype || 'Not provided'}</span>
                              </div>
                              <Separator />
                              <div>
                                <p className="text-muted-foreground mb-1">Address</p>
                                {patientDetail.address ? (
                                  <p className="whitespace-pre-line">{patientDetail.address}</p>
                                ) : (
                                  <p className="text-muted-foreground">Not provided</p>
                                )}
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
                                <span>{patientDetail.phone || 'Not provided'}</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <Mail className="h-4 w-4 text-muted-foreground" />
                                <span>{patientDetail.email || 'Not provided'}</span>
                              </div>
                              {patientDetail.state && (
                                <div className="flex items-start gap-2">
                                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                                  <span>{patientDetail.state}</span>
                                </div>
                              )}
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

            {/* TIMELINE TAB */}

                {/* LAB RESULTS TAB */}

                {/* VITALS TAB */}

                {/* PRESCRIPTIONS TAB */}

            {/* TIMELINE TAB */}
            <TabsContent value="timeline" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              <TimelineTab
                visits={visits}
                consultationSessions={consultationSessions}
                labResults={labResults}
                imagingResults={imagingResults}
                prescriptions={prescriptions}
                vitalSigns={vitalSigns}
              />
            </TabsContent>

            {/* MEDICAL HISTORY TAB */}
            <TabsContent value="medical-history" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              <MedicalHistoryTab
                patientDetail={patientDetail}
                visits={visits}
                consultationSessions={consultationSessions}
                labResults={labResults}
                imagingResults={imagingResults}
                prescriptions={prescriptions}
                vitalSigns={vitalSigns}
                historySubTab={historySubTab}
                onHistorySubTabChange={setHistorySubTab}
                onViewVisit={(visit) => {
                  setSelectedVisit(visit);
                  setIsVisitDetailModalOpen(true);
                }}
                patientNumericId={patientDetail?.numericId}
                onAllergiesUpdate={(updatedAllergies) => {
                  if (patientDetail) {
                    setPatientDetail({
                      ...patientDetail,
                      allergies: updatedAllergies,
                    });
                  }
                  // Reload patient data to get latest history
                  loadPatientData();
                }}
              />
            </TabsContent>

            {/* CURRENT CARE TAB */}
            <TabsContent value="current-care" className="flex-1 overflow-y-auto px-6 py-4 mt-0">
              <CurrentCareTab
                patientDetail={patientDetail}
                prescriptions={prescriptions}
                labResults={labResults}
                imagingResults={imagingResults}
                currentCareSubTab={currentCareSubTab}
                onCurrentCareSubTabChange={setCurrentCareSubTab}
              />
            </TabsContent>
          </Tabs>
        )}
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
