"use client";

import { useState, useEffect, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from "sonner";
import { patientService, labService, pharmacyService, consultationService, radiologyService, physioService, wardService, medicalCertificateService, formatPatientGenderLabel, type Patient as ApiPatient } from '@/lib/services';
import { eyeCareService } from '@/lib/services/eye-care-service';
import { VisitDetailModal } from '@/components/shared/VisitDetailModal';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { TimelineTab } from '@/components/patient-overview/TimelineTab';
import {
  getVisitServiceClinicsDisplay,
} from '@/lib/utils/clinic-utils';
import { buildOrderedLabResultViewRows } from '@/lib/laboratory/template-utils';
import {
  User, Phone, Calendar, AlertCircle, Activity, Pill, TestTube,
  AlertTriangle, Loader2, Mail, MapPin, Droplets,
  ClipboardList, Clock, Users, UserPlus
} from 'lucide-react';

interface Patient {
  id: string;
  numericId?: number;
  name: string;
  category: string;
  personalNumber?: string;
  employeeType?: string;
  division?: string;
  age: number;
  ageDisplay?: string;
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

/** Stored registration codes → labels (matches patient registration form). */
const TITLE_CODE_TO_LABEL: Record<string, string> = {
  mr: "Mr",
  mrs: "Mrs",
  ms: "Ms",
  miss: "Miss",
  dr: "Dr",
  chief: "Chief",
  engr: "Engr",
  prof: "Prof",
  alhaji: "Alhaji",
  hajia: "Hajia",
  mallam: "Mallam",
  lady: "Lady",
};

function displayStoredTitle(code: string): string {
  if (!code?.trim()) return "";
  const k = code.toLowerCase().trim();
  return TITLE_CODE_TO_LABEL[k] || code;
}

function sentenceCaseEnum(s: string): string {
  if (!s?.trim()) return "";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

interface PatientDetail {
  id: string;
  patientId: string;
  /** Same string as API full_name / Patient.get_full_name() */
  fullName: string;
  title: string;
  firstName: string;
  lastName: string;
  middleName: string;
  dateOfBirth: string;
  age: number;
  ageDisplay?: string;
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
  employeeType: string;
  division: string;
  location: string;
  dependentType: string;
  nonNpaType: string;
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
    address: string;
  };
  nextOfKin: {
    name: string;
    relationship: string;
    phone: string;
    address: string;
  };
  residentialAddress: string;
  permanentAddress: string;
  stateOfResidence: string;
  stateOfOrigin: string;
  lga: string;
  numericId: number;
  /** From persisted medical history (registration “Medical & NOK” social section). */
  socialHistory: {
    smoking: string;
    alcohol: string;
    exercise: string;
    occupation: string;
  };
  createdAt: string;
  updatedAt: string;
  createdByName?: string | null;
  updatedByName?: string | null;
}

interface DependentPatient {
  id: number;
  patient_id: string;
  full_name?: string;
  gender: string;
  age?: number;
  age_display?: string;
  dependent_type?: string;
  phone?: string;
  personal_number?: string;
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
  const [physioOrders, setPhysioOrders] = useState<any[]>([]);
  const [eyeOrders, setEyeOrders] = useState<any[]>([]);
  const [wardAdmissions, setWardAdmissions] = useState<any[]>([]);
  const [medicalCertificates, setMedicalCertificates] = useState<any[]>([]);
  const [dependents, setDependents] = useState<DependentPatient[]>([]);
  const [dependentsLoading, setDependentsLoading] = useState(false);
  const [isAddDependentOpen, setIsAddDependentOpen] = useState(false);
  const [isCreatingDependent, setIsCreatingDependent] = useState(false);
  const [dependentForm, setDependentForm] = useState({
    dependentType: '',
    surname: '',
    firstName: '',
    middleName: '',
    gender: '',
    dateOfBirth: '',
    phone: '',
    occupation: '',
    residentialAddress: '',
  });
  const [loading, setLoading] = useState(false);
  /** Header / avatar: list prop until GET patient returns, then API full_name only */
  const [overviewPatientName, setOverviewPatientName] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  // Visit detail modal state
  const [isVisitDetailModalOpen, setIsVisitDetailModalOpen] = useState(false);
  const [selectedVisit, setSelectedVisit] = useState<Visit | null>(null);

  const formatDateTime = (iso: string) => {
    if (!iso) return null;
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return null;
      return d.toLocaleString('en-US', {
        year: 'numeric', month: 'short', day: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return null; }
  };

  const handleViewVisit = (visit: Visit) => {
    setSelectedVisit(visit);
    setIsVisitDetailModalOpen(true);
  };

  useEffect(() => {
    if (isOpen && patient) {
      setOverviewPatientName(patient.name);
    }
  }, [isOpen, patient?.id, patient?.name]);

  const canManageDependents = patientDetail?.category === 'employee' || patientDetail?.category === 'retiree';

  const getDefaultDependentType = useCallback(() => (
    patientDetail?.category === 'retiree' ? 'Retiree Dependent' : 'Employee Dependent'
  ), [patientDetail?.category]);

  const resetDependentForm = useCallback(() => {
    setDependentForm({
      dependentType: getDefaultDependentType(),
      surname: '',
      firstName: '',
      middleName: '',
      gender: '',
      dateOfBirth: '',
      phone: '',
      occupation: '',
      residentialAddress: '',
    });
  }, [getDefaultDependentType]);

  const handleAddDependent = useCallback(() => {
    if (!canManageDependents || !patientDetail?.numericId) {
      toast.error('Dependents can only be added from an employee or retiree record.');
      return;
    }
    resetDependentForm();
    setIsAddDependentOpen(true);
  }, [canManageDependents, patientDetail?.numericId, resetDependentForm]);


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
      setOverviewPatientName(apiPatient.full_name ?? '');

      // Load all patient data in parallel
      const [
        visitsData,
        vitalsData,
        labData,
        historyData,
        prescriptionsData,
        consultationsData,
        imagingData,
        physioData,
        eyeData,
        wardAdmissionsData,
        certificatesData,
      ] = await Promise.allSettled([
        patientService.getPatientVisits(numericId),
        patientService.getPatientVitals(numericId),
        labService.getOrders({ patient: numericId.toString() }),
        patientService.getPatientHistory(numericId),
        pharmacyService.getPrescriptions({ patient: numericId.toString() }),
        consultationService.getSessions({ patient: numericId }).catch(() => ({ results: [] })),
        radiologyService.getOrders({ patient: numericId.toString() }).catch(() => ({ results: [] })),
        physioService.getOrders({ patient: numericId.toString() }).catch(() => ({ results: [] })),
        eyeCareService.getOrders({ patient: numericId }).catch(() => ({ results: [] })),
        wardService.getAdmissions({ patient: numericId }).catch(() => ({ results: [] })),
        medicalCertificateService.getCertificates({ patient: numericId.toString(), page_size: 200 }).catch(() => ({ results: [] })),
      ]);

      if (apiPatient.category === 'employee' || apiPatient.category === 'retiree') {
        setDependentsLoading(true);
        try {
          const dependentsResponse = await patientService.getPatients({
            category: 'dependent',
            principal_staff: numericId,
            page_size: 100,
          });
          setDependents(dependentsResponse.results || []);
        } catch {
          setDependents([]);
        } finally {
          setDependentsLoading(false);
        }
      } else {
        setDependents([]);
        setDependentsLoading(false);
      }

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
          diagnosis: visit.diagnosis || '',
          status: visit.status || 'completed',
          clinic: visit.clinic?.name || '',
          notes: visit.clinical_notes || '',
          source: 'visit' // Mark as regular visit
        }));

        // Combine with consultation sessions for unified display
        let combinedVisits = [...transformedVisits];

        if (consultationsData.status === 'fulfilled' && consultationsData.value?.results) {
          const getSessionDateParts = (session: any) => {
            const rawDate = session.started_at || '';
            if (!rawDate) return { date: '', time: '' };
            const parsed = new Date(rawDate);
            if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
            return {
              date: parsed.toLocaleDateString(),
              time: parsed.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            };
          };

          const transformedSessions = consultationsData.value.results.map((session: any) => ({
            ...getSessionDateParts(session),
            id: `session-${session.id}`,
            numericId: session.id,
            visitId: session.session_id || session.id.toString(),
            patientId: numericId.toString(),
            type: 'Consultation',
            department: 'Consultation',
            doctor: session.doctor?.name || session.doctor_name || 'Unknown',
            diagnosis: session.assessment || '',
            status: session.status || 'completed',
            clinic: getVisitServiceClinicsDisplay({ clinic: session.clinic_name, clinics: session.visit_clinics }),
            notes: session.notes || '',
            source: 'consultation' // Mark as consultation session
          }));

          combinedVisits = [...transformedVisits, ...transformedSessions];
          // Sort by date (newest first)
          combinedVisits.sort((a, b) => new Date(b.date + ' ' + b.time).getTime() - new Date(a.date + ' ' + a.time).getTime());
        }

        setVisits(combinedVisits);
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
          height: vital.height?.toString() || '-',
          bmi: vital.bmi?.toString() || '-',
          painScale: vital.pain_scale != null && vital.pain_scale !== '' ? String(vital.pain_scale) : '',
          bloodSugar:
            vital.blood_sugar != null && vital.blood_sugar !== '' ? String(vital.blood_sugar) : '',
          randomBloodSugar:
            vital.random_blood_sugar != null && vital.random_blood_sugar !== ''
              ? String(vital.random_blood_sugar)
              : '',
          notes: vital.notes || '',
          recordedBy:
            vital.recorded_by_name ||
            (vital.recorded_by != null ? String(vital.recorded_by) : '') ||
            'Unknown',
        }));
        setVitalSigns(transformedVitals);
      }

      // Process lab results
      if (labData.status === 'fulfilled' && labData.value?.results) {
        const transformedLabResults = labData.value.results.flatMap((order: any) => 
          (order.tests || []).filter((test: any) => test.status === 'results_ready' || test.status === 'verified').map((test: any) => {
            // Extract results with units and ranges
            const results = test.results || {};
            const nr = test.template_normal_range || test.normal_range;
            const orderedRows = buildOrderedLabResultViewRows(results as Record<string, any>, nr);
            const formattedResults =
              orderedRows
                .map((r) => {
                  const range = r.normalRange?.trim() || '';
                  return `${r.parameter}: ${r.value}${r.unit ? ` ${r.unit}` : ''}${range ? ` (${range})` : ''}`;
                })
                .join(', ') || 'Pending';
            
            const overallStatus = test.overall_status;
            let healthStatus = test.status === 'verified' ? 'Completed' : 'Pending';
            if (overallStatus) {
              const s = String(overallStatus).toLowerCase();
              if (s === 'normal') healthStatus = 'Normal';
              else if (s === 'abnormal') healthStatus = 'Abnormal';
              else if (s === 'critical') healthStatus = 'Critical';
              else healthStatus = 'Completed';
            }

            const workflowStatus =
              test.status === 'verified' ? 'Verified' :
              test.status === 'results_ready' ? 'Results Ready' :
              'Pending';

            return {
              id: `${order.id}-${test.id}`,
              test: test.name || test.code || 'Unknown Test',
              category: test.sample_type || 'General',
              date: order.ordered_at ? new Date(order.ordered_at).toLocaleDateString() : '',
              result: formattedResults,
              unit: '',
              range: '',
            status: workflowStatus,
            overallStatus: healthStatus,
              orderedBy: order.doctor?.name || 'Unknown',
              verifiedBy: test.processed_by || 'Pending',
              notes: test.notes || '',
              _raw: test,
            };
          })
        );
        setLabResults(transformedLabResults);
      }

      // Consultation sessions are now processed within visits above
      if (consultationsData.status === 'fulfilled' && consultationsData.value?.results) {
        const getSessionDate = (session: any) => {
          const rawDate = session.started_at || '';
          if (!rawDate) return '';
          const parsed = new Date(rawDate);
          if (Number.isNaN(parsed.getTime())) return '';
          return parsed.toLocaleDateString();
        };
        // Sessions are already combined with visits above, just store separately if needed elsewhere
        const transformedSessions = consultationsData.value.results.map((session: any) => ({
          id: session.id?.toString() || String(session.id),
          date: getSessionDate(session),
          doctor: session.doctor?.name || session.doctor_name || 'Unknown',
          clinic: getVisitServiceClinicsDisplay({ clinic: session.clinic_name, clinics: session.visit_clinics }),
          room: session.room?.name || '',
          status: session.status || 'completed',
          notes: session.notes || '',
          diagnoses: session.diagnoses || [],
        }));
        setConsultationSessions(transformedSessions);
      }

      // Process physio orders
      if (physioData.status === 'fulfilled') {
        setPhysioOrders(physioData.value?.results || []);
      } else {
        setPhysioOrders([]);
      }

      // Process eye orders
      if (eyeData.status === 'fulfilled') {
        setEyeOrders(eyeData.value?.results || []);
      } else {
        setEyeOrders([]);
      }

      // Process ward admissions
      if (wardAdmissionsData.status === 'fulfilled') {
        setWardAdmissions(wardAdmissionsData.value?.results || []);
      } else {
        setWardAdmissions([]);
      }

      // Process persisted medical certificates
      if (certificatesData.status === 'fulfilled') {
        setMedicalCertificates(certificatesData.value?.results || []);
      } else {
        setMedicalCertificates([]);
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
                _rawOrder: order,
                _rawStudy: study,
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
      let socialHistory = { smoking: "", alcohol: "", exercise: "", occupation: "" };

      if (historyData.status === "fulfilled" && historyData.value) {
        const history = historyData.value;
        allergies = history.allergies || [];
        conditions = history.chronic_conditions || history.conditions || [];
        const sh = history.social_history;
        if (sh && typeof sh === "object") {
          socialHistory = {
            smoking: String((sh as { smoking?: string }).smoking || ""),
            alcohol: String((sh as { alcohol?: string }).alcohol || ""),
            exercise: String((sh as { exercise?: string }).exercise || ""),
            occupation: String((sh as { occupation?: string }).occupation || ""),
          };
        }
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
        fullName: apiPatient.full_name ?? '',
        title: displayStoredTitle(apiPatient.title || "") || apiPatient.title || "",
        firstName: apiPatient.first_name || '',
        lastName: apiPatient.surname || '',
        middleName: apiPatient.middle_name || '',
        dateOfBirth: formattedDateOfBirth,
        age: apiPatient.age || 0,
        ageDisplay: (apiPatient as any).age_display || undefined,
        gender: formatPatientGenderLabel(apiPatient.gender),
        maritalStatus: sentenceCaseEnum(apiPatient.marital_status || ""),
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
            const apiUrl = process.env.NEXT_PUBLIC_API_URL;
            if (!apiUrl) return photoPath;
            const baseUrl = apiUrl.replace(/\/api\/?$/, '');
            return `${baseUrl}${photoPath}`;
          }
          const apiUrl = process.env.NEXT_PUBLIC_API_URL;
          if (!apiUrl) return photoPath;
          const baseUrl = apiUrl.replace(/\/api\/?$/, '');
          return `${baseUrl}/media/${photoPath.startsWith('/') ? photoPath.slice(1) : photoPath}`;
        })(),
        category: apiPatient.category || '',
        personalNumber: apiPatient.personal_number || '',
        employeeType: apiPatient.employee_type || '',
        division: apiPatient.division || '',
        location: apiPatient.location || '',
        dependentType: apiPatient.dependent_type || '',
        nonNpaType: apiPatient.nonnpa_type || '',
        allergies,
        chronicConditions: conditions,
        currentMedications: medications,
        emergencyContact: {
          name: nokName,
          relationship: sentenceCaseEnum(apiPatient.nok_relationship || ""),
          phone: apiPatient.nok_phone || '',
          address: apiPatient.nok_address || '',
        },
        nextOfKin: {
          name: nokName,
          relationship: sentenceCaseEnum(apiPatient.nok_relationship || ""),
          phone: apiPatient.nok_phone || '',
          address: apiPatient.nok_address || '',
        },
        residentialAddress: apiPatient.residential_address || '',
        permanentAddress: apiPatient.permanent_address || '',
        stateOfResidence: apiPatient.state_of_residence || '',
        stateOfOrigin: apiPatient.state_of_origin || '',
        lga: apiPatient.lga || '',
        createdAt: apiPatient.created_at || '',
        updatedAt: apiPatient.updated_at || '',
        createdByName: (apiPatient as any).created_by_name || null,
        updatedByName: (apiPatient as any).updated_by_name || null,
        numericId,
        socialHistory,
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
    }
  }, [isOpen, patient, loadPatientData]);

  const handleCreateDependent = useCallback(async () => {
    if (!patientDetail?.numericId) {
      toast.error('Principal patient context is missing.');
      return;
    }
    if (!dependentForm.surname.trim() || !dependentForm.firstName.trim() || !dependentForm.gender || !dependentForm.dateOfBirth) {
      toast.error('Surname, first name, gender, and date of birth are required.');
      return;
    }

    setIsCreatingDependent(true);
    try {
      await patientService.createPatient({
        category: 'dependent',
        principal_staff: patientDetail.numericId,
        dependent_type: dependentForm.dependentType || getDefaultDependentType(),
        surname: dependentForm.surname.trim(),
        first_name: dependentForm.firstName.trim(),
        middle_name: dependentForm.middleName.trim(),
        gender: dependentForm.gender as 'male' | 'female',
        date_of_birth: dependentForm.dateOfBirth,
        phone: dependentForm.phone.trim(),
        occupation: dependentForm.occupation.trim(),
        residential_address: dependentForm.residentialAddress.trim(),
      });

      toast.success('Dependent registered successfully.');
      setIsAddDependentOpen(false);
      setActiveTab('dependents');
      resetDependentForm();
      await loadPatientData();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to register dependent.');
    } finally {
      setIsCreatingDependent(false);
    }
  }, [dependentForm, getDefaultDependentType, loadPatientData, patientDetail?.numericId, resetDependentForm]);


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
      <DialogContent className="w-[95vw] sm:max-w-[min(95vw,1100px)] lg:max-w-[min(96vw,1320px)] max-h-[90vh] overflow-y-auto p-0 flex flex-col">
        <DialogHeader className="px-6 pt-6 pb-4 border-b flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              {loading ? (
                <Loader2 className="h-12 w-12 animate-spin text-muted-foreground" />
              ) : (
                <PatientAvatar name={overviewPatientName} photoUrl={patient.photoUrl} size="lg" className="border-2 border-primary/20" />
              )}
              <div>
                <DialogTitle className="text-2xl font-bold">{overviewPatientName || 'Patient Details'}</DialogTitle>
                <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                  <Badge variant="outline" className={getCategoryBadge(patient.category)}>
                    {patient.category}
                  </Badge>
                  <span>{patient.id}</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
                <TabsTrigger value="dependents" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary">
                  <Users className="h-4 w-4 mr-2" />Dependents
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="overview" className="flex-1 overflow-y-auto px-6 py-4 space-y-6 mt-0">
              {patientDetail ? (
                <>
                  <div className="grid gap-4 md:grid-cols-4">
                    {[
                      { icon: Calendar, value: visits.length, label: 'Total Visits', color: 'text-blue-500' },
                      { icon: Pill, value: patientDetail.currentMedications.length, label: 'Active Meds', color: 'text-violet-500' },
                      { icon: TestTube, value: labResults.length, label: 'Lab Tests', color: 'text-amber-500' },
                      { icon: Users, value: canManageDependents ? dependents.length : 0, label: 'Dependents', color: 'text-emerald-500' },
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

                  <div className="grid gap-6 xl:grid-cols-[1.35fr_0.95fr]">
                    <div className="space-y-6">
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <ClipboardList className="h-5 w-5 text-indigo-500" />Registration Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Patient ID</p>
                            <p className="font-medium">{patientDetail.patientId}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Category</p>
                            <p className="capitalize">{patientDetail.category || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Personal Number</p>
                            <p>{patientDetail.personalNumber || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Title</p>
                            <p>{patientDetail.title?.trim() ? patientDetail.title : "Not provided"}</p>
                          </div>
                          {patientDetail.dependentType ? (
                            <div className="space-y-1">
                              <p className="text-muted-foreground">Dependent Type</p>
                              <p>{patientDetail.dependentType}</p>
                            </div>
                          ) : null}
                          {patientDetail.nonNpaType ? (
                            <div className="space-y-1">
                              <p className="text-muted-foreground">Non-NPA Type</p>
                              <p>{patientDetail.nonNpaType}</p>
                            </div>
                          ) : null}
                          <Separator className="col-span-full my-1" />
                          <div className="space-y-1 col-span-full md:col-span-1">
                            <p className="text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" /> Registered by
                            </p>
                            <p>{patientDetail.createdByName || '—'}</p>
                            {formatDateTime(patientDetail.createdAt) && (
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(patientDetail.createdAt)}
                              </p>
                            )}
                          </div>
                          <div className="space-y-1 col-span-full md:col-span-1">
                            <p className="text-muted-foreground flex items-center gap-1">
                              <User className="h-3 w-3" /> Last modified by
                            </p>
                            <p>{patientDetail.updatedByName || '—'}</p>
                            {formatDateTime(patientDetail.updatedAt) && (
                              <p className="text-xs text-muted-foreground">
                                {formatDateTime(patientDetail.updatedAt)}
                              </p>
                            )}
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <User className="h-5 w-5 text-blue-500" />Demographics
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Date of Birth</p>
                            <p>{patientDetail.dateOfBirth || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Age</p>
                            <p>{patientDetail.ageDisplay || `${patientDetail.age} years`}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Gender</p>
                            <p>{patientDetail.gender}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Marital Status</p>
                            <p>{patientDetail.maritalStatus || "Not provided"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Religion</p>
                            <p>{patientDetail.religion || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Tribe</p>
                            <p>{patientDetail.tribe || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Blood Group</p>
                            <p className="flex items-center gap-1">
                              <Droplets className="h-3 w-3 text-rose-500" />
                              {patientDetail.bloodGroup || 'Not provided'}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Genotype</p>
                            <p>{patientDetail.genotype || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <p className="text-muted-foreground">Occupation (demographics)</p>
                            <p>{patientDetail.occupation || "Not provided"}</p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <Activity className="h-5 w-5 text-slate-500" />
                            Social &amp; lifestyle
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 md:grid-cols-2 text-sm">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Smoking</p>
                            <p>{patientDetail.socialHistory.smoking || "Not provided"}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Alcohol</p>
                            <p>{patientDetail.socialHistory.alcohol || "Not provided"}</p>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <p className="text-muted-foreground">Exercise</p>
                            <p>{patientDetail.socialHistory.exercise || "Not provided"}</p>
                          </div>
                          <div className="space-y-1 md:col-span-2">
                            <p className="text-muted-foreground">Occupation (medical history)</p>
                            <p>{patientDetail.socialHistory.occupation || "Not provided"}</p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <Calendar className="h-5 w-5 text-blue-500" />Recent Visits
                          </CardTitle>
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
                                  <p className="font-medium">{visit.type}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {visit.date} {visit.doctor && visit.doctor !== 'Unknown' && `• ${visit.doctor}`} {visit.clinic && visit.clinic !== 'Unknown' && `• ${visit.clinic}`}
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
                            <MapPin className="h-5 w-5 text-emerald-500" />Contact And Address
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm">
                          <div className="flex items-center gap-2">
                            <Phone className="h-4 w-4 text-muted-foreground" />
                            <span>{patientDetail.phone || 'Not provided'}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <Mail className="h-4 w-4 text-muted-foreground" />
                            <span>{patientDetail.email || 'Not provided'}</span>
                          </div>
                          <Separator />
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Residential Address</p>
                            <p className="whitespace-pre-line">{patientDetail.residentialAddress || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Permanent Address</p>
                            <p className="whitespace-pre-line">{patientDetail.permanentAddress || 'Not provided'}</p>
                          </div>
                          <div className="grid gap-3 md:grid-cols-1">
                            <div className="space-y-1">
                              <p className="text-muted-foreground">State of Residence</p>
                              <p>{patientDetail.stateOfResidence || 'Not provided'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground">State of Origin</p>
                              <p>{patientDetail.stateOfOrigin || 'Not provided'}</p>
                            </div>
                            <div className="space-y-1">
                              <p className="text-muted-foreground">LGA</p>
                              <p>{patientDetail.lga || 'Not provided'}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2">
                            <MapPin className="h-5 w-5 text-sky-500" />Work And Organization
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid gap-3 text-sm">
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Employee Type</p>
                            <p>{patientDetail.employeeType || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Division</p>
                            <p>{patientDetail.division || 'Not provided'}</p>
                          </div>
                          <div className="space-y-1">
                            <p className="text-muted-foreground">Location</p>
                            <p>{patientDetail.location || 'Not provided'}</p>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                          <CardTitle className="flex items-center gap-2">
                            <AlertCircle className="h-5 w-5 text-rose-500" />Next Of Kin
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
                          <div>
                            <p className="text-muted-foreground">Address</p>
                            <p>{patientDetail.nextOfKin.address || 'Not provided'}</p>
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

            <TabsContent value="dependents" className="flex-1 overflow-y-auto px-6 py-4 mt-0 space-y-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="text-lg font-semibold">Dependents</h3>
                  <p className="text-sm text-muted-foreground">
                    View dependents linked to this principal record and register new dependents from here.
                  </p>
                </div>
                {canManageDependents ? (
                  <Button onClick={handleAddDependent}>
                    <UserPlus className="h-4 w-4 mr-2" />
                    Add Dependent
                  </Button>
                ) : null}
              </div>

              {!canManageDependents ? (
                <Card>
                  <CardContent className="py-8 text-center text-sm text-muted-foreground">
                    Dependents can only be managed from employee or retiree records.
                  </CardContent>
                </Card>
              ) : dependentsLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  <span className="ml-3 text-sm text-muted-foreground">Loading dependents...</span>
                </div>
              ) : dependents.length === 0 ? (
                <Card>
                  <CardContent className="py-10 text-center space-y-3">
                    <Users className="h-10 w-10 text-muted-foreground mx-auto" />
                    <div>
                      <p className="font-medium">No dependents linked</p>
                      <p className="text-sm text-muted-foreground">
                        Register the principal&apos;s dependents directly from this patient record.
                      </p>
                    </div>
                    <Button variant="outline" onClick={handleAddDependent}>
                      <UserPlus className="h-4 w-4 mr-2" />
                      Register First Dependent
                    </Button>
                  </CardContent>
                </Card>
              ) : (
                <div className="grid gap-4 md:grid-cols-2">
                  {dependents.map((dependent) => (
                    <Card key={dependent.id}>
                      <CardContent className="p-5 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="font-semibold">{dependent.full_name ?? ''}</p>
                            <p className="text-sm text-muted-foreground">{dependent.patient_id}</p>
                          </div>
                          <Badge variant="outline">
                            {dependent.dependent_type || 'Dependent'}
                          </Badge>
                        </div>
                        <div className="grid gap-2 text-sm text-muted-foreground">
                          <p>{dependent.age_display || `${dependent.age || 0} years`} • {dependent.gender}</p>
                          <p>{dependent.phone || 'No phone'}</p>
                          {dependent.personal_number ? <p>Personal Number: {dependent.personal_number}</p> : null}
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}
            </TabsContent>



            {/* CURRENT CARE TAB */}
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



      <Dialog open={isAddDependentOpen} onOpenChange={(open) => {
        setIsAddDependentOpen(open);
        if (!open) {
          resetDependentForm();
        }
      }}>
        <DialogContent className="sm:max-w-[640px]">
          <DialogHeader>
            <DialogTitle>Add Dependent</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            <Card className="border-dashed">
              <CardContent className="p-4 text-sm space-y-1">
                <p className="font-medium">{patientDetail?.fullName ?? ''}</p>
                <p className="text-muted-foreground">
                  Principal: {patientDetail?.patientId} {patientDetail?.personalNumber ? `• ${patientDetail.personalNumber}` : ''}
                </p>
              </CardContent>
            </Card>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="dependent-type">Dependent Type</Label>
                <Select
                  value={dependentForm.dependentType}
                  onValueChange={(value) => setDependentForm(prev => ({ ...prev, dependentType: value }))}
                >
                  <SelectTrigger id="dependent-type">
                    <SelectValue placeholder="Select dependent type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Employee Dependent">Employee Dependent</SelectItem>
                    <SelectItem value="Retiree Dependent">Retiree Dependent</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dependent-gender">Gender</Label>
                <Select
                  value={dependentForm.gender}
                  onValueChange={(value) => setDependentForm(prev => ({ ...prev, gender: value }))}
                >
                  <SelectTrigger id="dependent-gender">
                    <SelectValue placeholder="Select gender" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="dependent-surname">Surname</Label>
                <Input
                  id="dependent-surname"
                  value={dependentForm.surname}
                  onChange={(e) => setDependentForm(prev => ({ ...prev, surname: e.target.value }))}
                  placeholder="Surname"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dependent-first-name">First Name</Label>
                <Input
                  id="dependent-first-name"
                  value={dependentForm.firstName}
                  onChange={(e) => setDependentForm(prev => ({ ...prev, firstName: e.target.value }))}
                  placeholder="First name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dependent-middle-name">Middle Name</Label>
                <Input
                  id="dependent-middle-name"
                  value={dependentForm.middleName}
                  onChange={(e) => setDependentForm(prev => ({ ...prev, middleName: e.target.value }))}
                  placeholder="Middle name"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dependent-dob">Date Of Birth</Label>
                <Input
                  id="dependent-dob"
                  type="date"
                  value={dependentForm.dateOfBirth}
                  onChange={(e) => setDependentForm(prev => ({ ...prev, dateOfBirth: e.target.value }))}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dependent-phone">Phone</Label>
                <Input
                  id="dependent-phone"
                  value={dependentForm.phone}
                  onChange={(e) => setDependentForm(prev => ({ ...prev, phone: e.target.value }))}
                  placeholder="08012345678"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="dependent-occupation">Occupation</Label>
                <Input
                  id="dependent-occupation"
                  value={dependentForm.occupation}
                  onChange={(e) => setDependentForm(prev => ({ ...prev, occupation: e.target.value }))}
                  placeholder="Optional"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label htmlFor="dependent-address">Residential Address</Label>
                <Textarea
                  id="dependent-address"
                  value={dependentForm.residentialAddress}
                  onChange={(e) => setDependentForm(prev => ({ ...prev, residentialAddress: e.target.value }))}
                  placeholder="Residential address"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setIsAddDependentOpen(false);
                  resetDependentForm();
                }}
                disabled={isCreatingDependent}
              >
                Cancel
              </Button>
              <Button onClick={handleCreateDependent} disabled={isCreatingDependent}>
                {isCreatingDependent ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                Save Dependent
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Dialog>
  );
}
