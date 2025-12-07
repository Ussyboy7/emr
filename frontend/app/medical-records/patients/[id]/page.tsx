"use client";

import { useState, useMemo, useEffect, use, useCallback } from 'react';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { patientService, labService, type Patient as ApiPatient } from '@/lib/services';
import Link from 'next/link';
import { 
  User, Phone, Calendar, Heart, AlertCircle, FileText, Activity, Pill, TestTube, Plus, 
  ChevronRight, AlertTriangle, Upload, Save, X, Download, Eye, Trash2, Camera, Mail,
  TrendingUp, TrendingDown, Minus, Clock, Stethoscope, Beaker, Printer, Filter, RefreshCw, Loader2
} from 'lucide-react';

// Constants for form fields
const titles = ['Mr', 'Mrs', 'Ms', 'Dr', 'Chief', 'Engr', 'Prof', 'Alhaji', 'Hajia'];
const maritalStatuses = ['Single', 'Married', 'Divorced', 'Widowed'];
const NOK_RELATIONSHIPS = ['Spouse', 'Parent', 'Child', 'Sibling', 'Relative', 'Friend', 'Other'];

// Nigeria States (simplified list - you can expand this)
const NIGERIA_STATES = [
  'Abia', 'Adamawa', 'Akwa Ibom', 'Anambra', 'Bauchi', 'Bayelsa', 'Benue', 'Borno',
  'Cross River', 'Delta', 'Ebonyi', 'Edo', 'Ekiti', 'Enugu', 'FCT', 'Gombe', 'Imo',
  'Jigawa', 'Kaduna', 'Kano', 'Katsina', 'Kebbi', 'Kogi', 'Kwara', 'Lagos', 'Nasarawa',
  'Niger', 'Ogun', 'Ondo', 'Osun', 'Oyo', 'Plateau', 'Rivers', 'Sokoto', 'Taraba',
  'Yobe', 'Zamfara'
];

// Type definitions
interface PatientDetail {
  id: string;
  patientId: string; // The formatted patient_id like "E-A2962"
  firstName: string;
  lastName: string;
  middleName: string;
  dateOfBirth: string;
  age: number;
  gender: string;
  maritalStatus: string;
  bloodGroup: string;
  genotype: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  occupation: string;
  religion: string;
  nationality: string;
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
  numericId: number; // Store the numeric ID for API calls
}

interface Visit {
  id: string;
  date: string;
  type: string;
  department: string;
  doctor: string;
  chiefComplaint: string;
  diagnosis: string;
  status: string;
  clinic: string;
}

export default function PatientProfilePage({ params }: { params: Promise<{ id: string }> }) {
  // Unwrap the params promise using React.use()
  const { id: patientIdParam } = use(params);
  
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [labResults, setLabResults] = useState<any[]>([]);
  const [vitalSigns, setVitalSigns] = useState<any[]>([]);
  const [consultationReports, setConsultationReports] = useState<any[]>([]);
  const [uploadedDocuments, setUploadedDocuments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('overview');

  const loadPatientData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Validate patient ID parameter
      if (!patientIdParam || typeof patientIdParam !== 'string' || patientIdParam.trim() === '') {
        throw new Error(`Invalid patient ID: ${patientIdParam || 'undefined'}`);
      }
      
      const trimmedId = patientIdParam.trim();
      
      // Check if the ID is numeric or a string (like "PAT-2024-009")
      let patientData;
      let numericPatientId: number;
      
      const parsedId = parseInt(trimmedId, 10);
      if (!isNaN(parsedId) && parsedId > 0) {
        // Numeric ID - use directly
        numericPatientId = parsedId;
        patientData = await patientService.getPatient(numericPatientId);
      } else {
        // String ID (like "PAT-2024-009") - search for patient by patient_id
        const searchResult = await patientService.getPatients({ search: trimmedId });
        if (searchResult.results.length === 0) {
          throw new Error(`Patient with ID "${trimmedId}" not found`);
        }
        // Find exact match by patient_id
        const matchedPatient = searchResult.results.find(p => p.patient_id === trimmedId);
        if (!matchedPatient) {
          throw new Error(`Patient with ID "${trimmedId}" not found`);
        }
        patientData = matchedPatient;
        numericPatientId = patientData.id;
      }
      
      // Now get visits, vitals, lab results, and history using the numeric ID
      const [visitsData, vitalsData, labData, historyData] = await Promise.allSettled([
        patientService.getPatientVisits(numericPatientId),
        patientService.getPatientVitals(numericPatientId),
        labService.getOrders({ patient: numericPatientId.toString() }),
        patientService.getPatientHistory(numericPatientId),
      ]);

      // Process vitals data (handle errors gracefully)
      if (vitalsData.status === 'fulfilled' && Array.isArray(vitalsData.value)) {
        try {
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
        } catch (vitalError) {
          console.debug('Error processing vitals:', vitalError);
          setVitalSigns([]);
        }
      } else if (vitalsData.status === 'rejected') {
        console.debug('Vitals endpoint unavailable or error:', vitalsData.reason);
        setVitalSigns([]);
      }

      // Process lab results data (handle errors gracefully)
      if (labData.status === 'fulfilled' && labData.value?.results) {
        try {
          const transformedLabResults = labData.value.results.flatMap((order: any) => 
            (order.tests || []).filter((test: any) => test.status === 'results_ready' || test.status === 'verified').map((test: any) => ({
              id: `${order.id}-${test.id}`,
              test: test.name || test.code || 'Unknown Test',
              category: test.sample_type || 'General',
              date: order.ordered_at ? new Date(order.ordered_at).toLocaleDateString() : '',
              result: test.results ? Object.values(test.results).join(', ') : 'Pending',
              unit: '',
              range: '',
              status: test.status === 'verified' ? 'Normal' : 'Pending',
              orderedBy: order.doctor?.name || 'Unknown',
              verifiedBy: test.processed_by || 'Pending',
              notes: test.notes || '',
            }))
          );
          setLabResults(transformedLabResults);
        } catch (labError) {
          console.debug('Error processing lab results:', labError);
          setLabResults([]); // Set empty array on error
        }
      } else if (labData.status === 'rejected') {
        // Lab endpoint returned error (404/500/etc) - just skip it
        console.debug('Lab orders endpoint unavailable or error:', labData.reason);
        setLabResults([]);
      }

      // Process history data (allergies, chronic conditions, medications)
      let historyAllergies: string[] = [];
      let historyConditions: string[] = [];
      let historyMedications: any[] = [];
      
      if (historyData.status === 'fulfilled' && historyData.value) {
        try {
          const history = historyData.value;
          historyAllergies = history.allergies || [];
          historyConditions = history.chronic_conditions || history.conditions || [];
          historyMedications = (history.medications || []).map((med: any, index: number) => ({
            id: med.id || index,
            name: med.name || med.medication_name || '',
            dosage: med.dosage || med.dose || '',
            frequency: med.frequency || med.schedule || '',
            prescribedBy: med.prescribed_by || med.prescribedBy || 'Unknown',
            startDate: med.start_date || med.startDate || new Date().toISOString().split('T')[0],
          }));
        } catch (historyError) {
          console.debug('Error processing history:', historyError);
          // Keep defaults (empty arrays)
        }
      } else if (historyData.status === 'rejected') {
        console.debug('History endpoint unavailable or error:', historyData.reason);
        // Keep defaults (empty arrays)
      }

      // Store raw patient data for edit form
      // Preserve photo if API doesn't return it (use functional update to access current state)
      setRawPatientData((prev: any) => {
        const updated = {
          ...patientData,
          // If API returned a photo, use it. Otherwise, preserve existing photo if it exists
          photo: patientData.photo || prev?.photo || null,
        };
        
        if (process.env.NODE_ENV === 'development') {
          console.log('📋 Setting rawPatientData:', {
            photoFromAPI: patientData.photo || 'none',
            photoFromPrev: prev?.photo || 'none',
            finalPhoto: updated.photo || 'none',
          });
        }
        
        return updated;
      });

      // Debug: Check what patient data we're getting from API
      if (process.env.NODE_ENV === 'development') {
        console.log('📋 Patient Data from API (Full Object):', JSON.stringify(patientData, null, 2));
        console.log('📋 Key Fields Check:', {
          date_of_birth: patientData.date_of_birth,
          marital_status: patientData.marital_status,
          residential_address: patientData.residential_address,
          permanent_address: patientData.permanent_address,
          lga: patientData.lga,
          state_of_residence: patientData.state_of_residence,
          nok_first_name: patientData.nok_first_name,
          nok_middle_name: patientData.nok_middle_name,
          nok_relationship: patientData.nok_relationship,
          nok_phone: patientData.nok_phone,
          photo: patientData.photo,
        });
        console.log('📋 Photo URL constructed:', (() => {
          const photo = patientData.photo;
          if (!photo || photo === '') return 'No photo';
          if (photo.startsWith('http://') || photo.startsWith('https://')) return photo;
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
          const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
          const baseWithoutApi = baseUrl.replace('/api', '');
          return photo.startsWith('/') ? `${baseWithoutApi}${photo}` : `${baseWithoutApi}/${photo}`;
        })());
      }

      // Transform patient data - handle missing name fields gracefully
      // If name fields are missing, try to use full_name or fall back to patient_id
      const firstName = patientData.first_name || (patientData as any).full_name?.split(' ')[0] || '';
      const lastName = patientData.surname || (patientData as any).full_name?.split(' ').slice(-1)[0] || '';
      const middleName = patientData.middle_name || 
        ((patientData as any).full_name?.split(' ').slice(1, -1).join(' ') || '');
      
      // If no name at all, use patient_id as fallback
      const displayName = firstName || lastName 
        ? `${lastName ? lastName + ', ' : ''}${firstName} ${middleName}`.trim()
        : patientData.patient_id || `Patient ${patientData.id}`;
      
      setPatient({
        id: patientData.id.toString(),
        patientId: patientData.patient_id || patientData.id.toString(),
        numericId: numericPatientId,
        firstName: firstName || 'Not provided',
        lastName: lastName || 'Not provided',
        middleName: middleName || '',
        dateOfBirth: (() => {
          const dob = patientData.date_of_birth;
          if (!dob || dob === null || dob === undefined || dob === '') return 'Not provided';
          try {
            const date = new Date(dob);
            if (isNaN(date.getTime())) return 'Not provided';
            return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
          } catch {
            return 'Not provided';
          }
        })(),
        age: patientData.age || 0,
        gender: (patientData.gender && patientData.gender.trim() !== '') ? patientData.gender.charAt(0).toUpperCase() + patientData.gender.slice(1).toLowerCase() : 'Not provided',
        maritalStatus: (patientData.marital_status && patientData.marital_status.trim() !== '') 
          ? patientData.marital_status.charAt(0).toUpperCase() + patientData.marital_status.slice(1).toLowerCase()
          : 'Not provided',
        bloodGroup: (patientData.blood_group && patientData.blood_group.trim() !== '') ? patientData.blood_group : 'Not provided',
        genotype: (patientData.genotype && patientData.genotype.trim() !== '') ? patientData.genotype : 'Not provided',
        phone: (patientData.phone && patientData.phone.trim() !== '') ? patientData.phone : 'Not provided',
        email: (patientData.email && patientData.email.trim() !== '') ? patientData.email : 'Not provided',
        address: (() => {
          const parts = [
            patientData.residential_address?.trim(),
            patientData.permanent_address?.trim()
          ].filter(addr => addr && addr !== '');
          return parts.length > 0 ? parts.join(', ') : 'Not provided';
        })(),
        city: (patientData.lga && patientData.lga.trim() !== '') ? patientData.lga : 'Not provided',
        state: (() => {
          const state = patientData.state_of_residence?.trim() || patientData.state_of_origin?.trim();
          return (state && state !== '') ? state : 'Not provided';
        })(),
        occupation: (patientData as any).occupation || null, // Not in backend - will be hidden
        religion: (patientData as any).religion || null, // Not in backend - will be hidden
        nationality: (patientData as any).nationality || (patientData as any).country || null, // Not in backend - will be hidden
        status: patientData.is_active ? 'Active' : 'Inactive',
        photoUrl: (() => {
          const photo = patientData.photo;
          if (!photo || photo === '' || photo === null) return '';
          
          if (process.env.NODE_ENV === 'development') {
            console.log('📸 loadPatientData - photo from API:', photo);
          }
          
          // If it's already a full URL, return as-is with cache-busting
          if (photo.startsWith('http://') || photo.startsWith('https://')) {
            const urlWithCache = `${photo}${photo.includes('?') ? '&' : '?'}t=${Date.now()}`;
            if (process.env.NODE_ENV === 'development') {
              console.log('📸 loadPatientData - Full URL constructed:', urlWithCache);
            }
            return urlWithCache;
          }
          
          // If it's a relative URL, construct full URL with API base
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
          const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
          // Remove '/api' from base URL if present since photo URLs are typically at root level
          const baseWithoutApi = baseUrl.replace('/api', '');
          // Handle relative URLs (e.g., /media/... or media/...)
          const constructedUrl = photo.startsWith('/') 
            ? `${baseWithoutApi}${photo}` 
            : `${baseWithoutApi}/${photo}`;
          
          // Add cache-busting parameter
          const urlWithCache = `${constructedUrl}${constructedUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
          
          if (process.env.NODE_ENV === 'development') {
            console.log('📸 loadPatientData - Relative URL constructed:', urlWithCache);
          }
          
          return urlWithCache;
        })(),
        category: patientData.category || '',
        personalNumber: (patientData.personal_number && patientData.personal_number.trim() !== '') ? patientData.personal_number : 'Not provided',
        allergies: historyAllergies,
        chronicConditions: historyConditions,
        currentMedications: historyMedications,
        emergencyContact: {
          name: (() => {
            const first = (patientData.nok_first_name || '').trim();
            const middle = (patientData.nok_middle_name || '').trim();
            const full = [first, middle].filter(Boolean).join(' ');
            return full || 'Not provided';
          })(),
          relationship: (patientData.nok_relationship && patientData.nok_relationship.trim() !== '') 
            ? patientData.nok_relationship.charAt(0).toUpperCase() + patientData.nok_relationship.slice(1).toLowerCase()
            : 'Not provided',
          phone: (patientData.nok_phone && patientData.nok_phone.trim() !== '') ? patientData.nok_phone : 'Not provided',
        },
        nextOfKin: {
          name: (() => {
            const first = (patientData.nok_first_name || '').trim();
            const middle = (patientData.nok_middle_name || '').trim();
            const full = [first, middle].filter(Boolean).join(' ');
            return full || 'Not provided';
          })(),
          relationship: (patientData.nok_relationship && patientData.nok_relationship.trim() !== '') 
            ? patientData.nok_relationship.charAt(0).toUpperCase() + patientData.nok_relationship.slice(1).toLowerCase()
            : 'Not provided',
          phone: (patientData.nok_phone && patientData.nok_phone.trim() !== '') ? patientData.nok_phone : 'Not provided',
        },
      });

      // Transform visits data
      // The backend returns an array of visits (not paginated)
      const visitsArray = visitsData.status === 'fulfilled' && Array.isArray(visitsData.value)
        ? visitsData.value
        : [];
      const transformedVisits = visitsArray.map((visit: any) => ({
        id: visit.id?.toString() || visit.visit_id || '',
        date: visit.date || '',  // Backend returns 'date' field
        type: visit.visit_type || '',
        department: visit.department || '',
        doctor: visit.doctor_name || visit.doctor || '',
        chiefComplaint: visit.chief_complaint || '',
        diagnosis: visit.diagnosis || visit.clinical_notes || '',
        status: visit.status || '',
        clinic: visit.clinic || '',
      }));
      setVisits(transformedVisits);
    } catch (err: any) {
      // Handle network errors more gracefully
      if (err?.name === 'NetworkError' || err?.message?.includes('Unable to connect') || err?.message?.includes('Failed to fetch')) {
        setError('Unable to connect to the server. Please ensure the backend is running on port 8001.');
        toast.error('Connection error: Backend server may not be running');
      } else if (err?.message?.includes('Authentication')) {
        setError('Authentication required. Please log in to view patient data.');
        toast.error('Authentication required');
      } else {
        setError(err.message || 'Failed to load patient data');
        toast.error(err.message || 'Failed to load patient data');
      }
      console.error('Error loading patient data:', err);
    } finally {
      setLoading(false);
    }
  }, [patientIdParam]);

  // Load patient data from API
  useEffect(() => {
    // Only load data if we have a valid patient ID
    if (patientIdParam && typeof patientIdParam === 'string' && patientIdParam.trim() !== '') {
      loadPatientData();
    } else {
      setError('Invalid patient ID');
      setLoading(false);
    }
  }, [loadPatientData, patientIdParam]);
  
  // Modal states
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isAddMedicationDialogOpen, setIsAddMedicationDialogOpen] = useState(false);
  const [isAddAllergyDialogOpen, setIsAddAllergyDialogOpen] = useState(false);
  const [isPhotoUploadDialogOpen, setIsPhotoUploadDialogOpen] = useState(false);
  const [isLabDetailModalOpen, setIsLabDetailModalOpen] = useState(false);
  const [isVitalDetailModalOpen, setIsVitalDetailModalOpen] = useState(false);
  const [isDocumentDetailModalOpen, setIsDocumentDetailModalOpen] = useState(false);
  
  const [selectedLabResult, setSelectedLabResult] = useState<typeof labResults[0] | null>(null);
  const [selectedVital, setSelectedVital] = useState<typeof vitalSigns[0] | null>(null);
  const [selectedDocument, setSelectedDocument] = useState<any>(null);
  
  // Filter states
  const [labDateFilter, setLabDateFilter] = useState('all');
  const [labStatusFilter, setLabStatusFilter] = useState('all');
  const [vitalDateFilter, setVitalDateFilter] = useState('all');
  const [docTypeFilter, setDocTypeFilter] = useState('all');
  
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [isRemovingPhoto, setIsRemovingPhoto] = useState(false);
  
  // Form states for edit dialog
  const [editForm, setEditForm] = useState<{
    title?: string;
    firstName: string;
    lastName: string;
    middleName: string;
    dateOfBirth: string;
    maritalStatus: string;
    phone: string;
    email: string;
    residentialAddress: string;
    permanentAddress: string;
    stateOfResidence: string;
    stateOfOrigin: string;
    lga: string;
    bloodGroup: string;
    genotype: string;
    nokFirstName: string;
    nokMiddleName: string;
    nokRelationship: string;
    nokAddress: string;
    nokPhone: string;
  }>({
    firstName: '',
    lastName: '',
    middleName: '',
    dateOfBirth: '',
    maritalStatus: '',
    phone: '',
    email: '',
    residentialAddress: '',
    permanentAddress: '',
    stateOfResidence: '',
    stateOfOrigin: '',
    lga: '',
    bloodGroup: '',
    genotype: '',
    nokFirstName: '',
    nokMiddleName: '',
    nokRelationship: '',
    nokAddress: '',
    nokPhone: '',
  });
  
  // Store raw patient API data for edit form
  const [rawPatientData, setRawPatientData] = useState<any>(null);
  
  // Function to update edit form from rawPatientData
  const updateEditFormFromRawData = useCallback(() => {
    if (!rawPatientData) {
      if (process.env.NODE_ENV === 'development') {
        console.log('⚠️ Cannot update edit form: rawPatientData is null');
      }
      return;
    }
    
    const patientData = rawPatientData;
    
    if (process.env.NODE_ENV === 'development') {
      console.log('🔄 Updating edit form from rawPatientData:', patientData);
    }
    
    // Parse date of birth - backend returns ISO date string
    let dobFormatted = '';
    if (patientData.date_of_birth) {
      try {
        const date = new Date(patientData.date_of_birth);
        if (!isNaN(date.getTime())) {
          dobFormatted = date.toISOString().split('T')[0];
        }
      } catch (e) {
        console.warn('Failed to parse date_of_birth:', e);
      }
    }
    
    // Normalize values to match dropdown options
    const normalizedTitle = patientData.title ? patientData.title.toLowerCase() : '';
    const normalizedMaritalStatus = patientData.marital_status ? patientData.marital_status.toLowerCase() : '';
    const normalizedNokRelationship = patientData.nok_relationship ? patientData.nok_relationship.charAt(0).toUpperCase() + patientData.nok_relationship.slice(1).toLowerCase() : '';
    
    setEditForm({
      title: normalizedTitle || '',
      firstName: patientData.first_name || '',
      lastName: patientData.surname || '',
      middleName: patientData.middle_name || '',
      dateOfBirth: dobFormatted,
      maritalStatus: normalizedMaritalStatus || '',
      phone: patientData.phone || '',
      email: patientData.email || '',
      residentialAddress: patientData.residential_address || '',
      permanentAddress: patientData.permanent_address || '',
      stateOfResidence: patientData.state_of_residence || '',
      stateOfOrigin: patientData.state_of_origin || '',
      lga: patientData.lga || '',
      bloodGroup: patientData.blood_group || '',
      genotype: patientData.genotype || '',
      nokFirstName: patientData.nok_first_name || '',
      nokMiddleName: patientData.nok_middle_name || '',
      nokRelationship: normalizedNokRelationship || '',
      nokAddress: patientData.nok_address || '',
      nokPhone: patientData.nok_phone || '',
    });
  }, [rawPatientData]);

  // Update edit form when patient data loads
  useEffect(() => {
    if (patient && rawPatientData) {
      updateEditFormFromRawData();
    }
  }, [patient, rawPatientData, updateEditFormFromRawData]);

  // Update edit form when modal opens (in case data changed)
  useEffect(() => {
    if (isEditDialogOpen && rawPatientData) {
      updateEditFormFromRawData();
    }
  }, [isEditDialogOpen, rawPatientData, updateEditFormFromRawData]);
  const [newMedication, setNewMedication] = useState({ name: '', dosage: '', frequency: '' });
  const [newAllergy, setNewAllergy] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadType, setUploadType] = useState('');

  // Filtered data
  const filteredLabResults = useMemo(() => {
    return labResults.filter(lab => {
      const matchesStatus = labStatusFilter === 'all' || lab.status.toLowerCase() === labStatusFilter;
      return matchesStatus;
    });
  }, [labStatusFilter]);

  const filteredVitals = useMemo(() => {
    return vitalSigns;
  }, [vitalDateFilter]);

  const allDocuments = [...consultationReports, ...uploadedDocuments].sort((a, b) => 
    new Date(b.date).getTime() - new Date(a.date).getTime()
  );

  const filteredDocuments = useMemo(() => {
    return allDocuments.filter(doc => {
      const matchesType = docTypeFilter === 'all' || doc.type.toLowerCase().includes(docTypeFilter);
      return matchesType;
    });
  }, [docTypeFilter, allDocuments]);

  // Stats
  const labStats = {
    total: labResults.length,
    normal: labResults.filter(l => l.status === 'Normal').length,
    abnormal: labResults.filter(l => l.status === 'Abnormal').length,
    critical: labResults.filter(l => l.status === 'Critical').length,
  };

  const vitalStats = {
    total: vitalSigns.length,
    latestBP: vitalSigns[0]?.bp || '-',
    avgPulse: Math.round(vitalSigns.reduce((sum, v) => sum + parseInt(v.pulse), 0) / vitalSigns.length),
    weightTrend: vitalSigns.length >= 2 ? (parseInt(vitalSigns[0].weight) - parseInt(vitalSigns[vitalSigns.length - 1].weight)) : 0,
  };

  const getBPStatus = (bp: string) => {
    const [systolic] = bp.split('/').map(Number);
    if (systolic >= 180) return { color: 'text-rose-600', bg: 'bg-rose-100 dark:bg-rose-900/30', label: 'Crisis' };
    if (systolic >= 140) return { color: 'text-amber-600', bg: 'bg-amber-100 dark:bg-amber-900/30', label: 'High' };
    if (systolic >= 120) return { color: 'text-blue-600', bg: 'bg-blue-100 dark:bg-blue-900/30', label: 'Elevated' };
    return { color: 'text-emerald-600', bg: 'bg-emerald-100 dark:bg-emerald-900/30', label: 'Normal' };
  };

  const handleSaveEdit = async () => {
    if (!patient?.numericId) {
      toast.error('Unable to update: Patient ID not found');
      return;
    }

    try {
      // Map frontend form fields to backend API fields (snake_case)
      const updateData: Partial<ApiPatient> = {
        title: editForm.title && editForm.title.trim() !== '' ? editForm.title.toLowerCase() : undefined,
        first_name: editForm.firstName.trim() || undefined,
        surname: editForm.lastName.trim() || undefined,
        middle_name: editForm.middleName.trim() || undefined,
        date_of_birth: editForm.dateOfBirth || undefined,
        marital_status: editForm.maritalStatus && editForm.maritalStatus.trim() !== '' 
          ? editForm.maritalStatus.toLowerCase() 
          : undefined,
        phone: editForm.phone.trim() || undefined,
        email: editForm.email.trim() || undefined,
        residential_address: editForm.residentialAddress.trim() || undefined,
        permanent_address: editForm.permanentAddress.trim() || undefined,
        state_of_residence: editForm.stateOfResidence.trim() || undefined,
        state_of_origin: editForm.stateOfOrigin.trim() || undefined,
        lga: editForm.lga.trim() || undefined,
        blood_group: editForm.bloodGroup && editForm.bloodGroup.trim() !== '' ? editForm.bloodGroup : undefined,
        genotype: editForm.genotype && editForm.genotype.trim() !== '' ? editForm.genotype : undefined,
        nok_first_name: editForm.nokFirstName.trim() || undefined,
        nok_middle_name: editForm.nokMiddleName.trim() || undefined,
        nok_relationship: editForm.nokRelationship && editForm.nokRelationship.trim() !== '' 
          ? editForm.nokRelationship.charAt(0).toUpperCase() + editForm.nokRelationship.slice(1).toLowerCase()
          : undefined,
        nok_address: editForm.nokAddress.trim() || undefined,
        nok_phone: editForm.nokPhone.trim() || undefined,
      };

      // Remove undefined values to avoid sending them
      Object.keys(updateData).forEach(key => {
        if (updateData[key as keyof typeof updateData] === undefined) {
          delete updateData[key as keyof typeof updateData];
        }
      });

      await patientService.updatePatient(patient.numericId, updateData);
      
      // Reload patient data to get updated information
      await loadPatientData();
      
      setIsEditDialogOpen(false);
      toast.success('Patient information updated successfully');
    } catch (err: any) {
      console.error('Error updating patient:', err);
      toast.error(err.message || 'Failed to update patient information');
    }
  };

  const handleAddMedication = async () => {
    if (!patient || !patient.numericId) return;
    if (!newMedication.name || !newMedication.dosage || !newMedication.frequency) {
      toast.error('Please fill in all medication fields');
      return;
    }

    try {
      // Get current history
      const currentHistory = await patientService.getPatientHistory(patient.numericId);
      
      // Update medications in history
      const updatedMedications = [
        ...(currentHistory.medications || []),
        {
          name: newMedication.name,
          dosage: newMedication.dosage,
          frequency: newMedication.frequency,
          start_date: new Date().toISOString().split('T')[0],
        }
      ];

      await patientService.updatePatientHistory(patient.numericId, {
        medications: updatedMedications,
      });

      // Update local state
      setPatient({
        ...patient,
        currentMedications: [...patient.currentMedications, { 
          id: Date.now(), 
          ...newMedication, 
          prescribedBy: 'Current User', 
          startDate: new Date().toISOString().split('T')[0] 
        }]
      });
      setNewMedication({ name: '', dosage: '', frequency: '' });
      setIsAddMedicationDialogOpen(false);
      toast.success('Medication added successfully');
    } catch (err: any) {
      console.error('Error adding medication:', err);
      toast.error(err.message || 'Failed to add medication');
    }
  };

  const handleRemoveMedication = async (id: number) => {
    if (!patient || !patient.numericId) return;

    try {
      // Get current history
      const currentHistory = await patientService.getPatientHistory(patient.numericId);
      
      // Remove medication from history
      const updatedMedications = (currentHistory.medications || []).filter((med: any, index: number) => {
        const medId = med.id || index;
        return medId !== id;
      });

      await patientService.updatePatientHistory(patient.numericId, {
        medications: updatedMedications,
      });

      // Update local state
      setPatient({
        ...patient,
        currentMedications: patient.currentMedications.filter(m => m.id !== id)
      });
      toast.success('Medication removed');
    } catch (err: any) {
      console.error('Error removing medication:', err);
      toast.error(err.message || 'Failed to remove medication');
    }
  };

  const handleAddAllergy = async () => {
    if (!patient || !patient.numericId) return;
    if (!newAllergy.trim()) {
      toast.error('Please enter an allergy');
      return;
    }

    try {
      // Get current history
      const currentHistory = await patientService.getPatientHistory(patient.numericId);
      
      // Update allergies in history
      const updatedAllergies = [
        ...(currentHistory.allergies || []),
        newAllergy.trim()
      ];

      await patientService.updatePatientHistory(patient.numericId, {
        allergies: updatedAllergies,
      });

      // Update local state
      setPatient({
        ...patient,
        allergies: [...patient.allergies, newAllergy.trim()]
      });
      setNewAllergy('');
      setIsAddAllergyDialogOpen(false);
      toast.success('Allergy added');
    } catch (err: any) {
      console.error('Error adding allergy:', err);
      toast.error(err.message || 'Failed to add allergy');
    }
  };

  const handleRemoveAllergy = async (allergy: string) => {
    if (!patient || !patient.numericId) return;

    try {
      // Get current history
      const currentHistory = await patientService.getPatientHistory(patient.numericId);
      
      // Remove allergy from history
      const updatedAllergies = (currentHistory.allergies || []).filter((a: string) => a !== allergy);

      await patientService.updatePatientHistory(patient.numericId, {
        allergies: updatedAllergies,
      });

      // Update local state
      setPatient({
        ...patient,
        allergies: patient.allergies.filter(a => a !== allergy)
      });
      toast.success('Allergy removed');
    } catch (err: any) {
      console.error('Error removing allergy:', err);
      toast.error(err.message || 'Failed to remove allergy');
    }
  };

  const handlePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        toast.error('Photo must be less than 5MB');
        return;
      }
      if (!file.type.startsWith('image/')) {
        toast.error('Please select an image file');
        return;
      }
      setPhotoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPhotoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handlePhotoUpload = async () => {
    if (!patient || !patient.numericId || !photoFile || !photoPreview) return;

    setIsUploadingPhoto(true);
    try {
      // Get valid access token using the same method as apiFetch
      const { getStoredAccessToken } = await import('@/lib/api-client');
      let token = getStoredAccessToken();
      
      // If token is expired or missing, try to refresh it
      if (!token) {
        // Try to get refresh token and refresh
        const refreshToken = localStorage.getItem('npa_ecm_refresh_token');
        if (refreshToken) {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
          const refreshResponse = await fetch(`${apiUrl}/accounts/auth/token/refresh/`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ refresh: refreshToken }),
          });
          
          if (refreshResponse.ok) {
            const data = await refreshResponse.json();
            token = data.access;
            localStorage.setItem('npa_ecm_access_token', data.access);
            if (data.refresh) {
              localStorage.setItem('npa_ecm_refresh_token', data.refresh);
            }
          }
        }
      }

      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      // Create FormData for file upload
      const formData = new FormData();
      formData.append('photo', photoFile);

      // Update patient photo via API using fetch directly (not apiFetch which uses JSON)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const photoUpdateUrl = `${baseUrl}/patients/${patient.numericId}/`;
      
      const response = await fetch(photoUpdateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          // Don't set Content-Type - browser will set it with boundary for FormData
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.photo?.[0] || errorData.detail || 'Failed to upload photo');
      }

      // Get the updated patient data from the response
      const updatedPatientData = await response.json();
      
      // Debug: Log the response to see what we're getting
      if (process.env.NODE_ENV === 'development') {
        console.log('📸 Photo upload response:', updatedPatientData);
        console.log('📸 Photo field in response:', updatedPatientData.photo);
      }
      
      // Extract photo URL from response and construct full URL
      let constructedPhotoUrl = '';
      if (updatedPatientData.photo) {
        const photo = updatedPatientData.photo;
        if (photo.startsWith('http://') || photo.startsWith('https://')) {
          constructedPhotoUrl = photo;
        } else {
          const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001';
          const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
          const baseWithoutApi = baseUrl.replace('/api', '');
          constructedPhotoUrl = photo.startsWith('/') ? `${baseWithoutApi}${photo}` : `${baseWithoutApi}/${photo}`;
        }
        // Add cache-busting parameter
        constructedPhotoUrl = `${constructedPhotoUrl}${constructedPhotoUrl.includes('?') ? '&' : '?'}t=${Date.now()}`;
      }

      // Update patient state with new photo URL immediately
      if (constructedPhotoUrl) {
        setPatient(prev => prev ? { ...prev, photoUrl: constructedPhotoUrl } : prev);
        setPhotoPreview(constructedPhotoUrl); // Update preview too
      }

      // Save the photo URL and path before reloading (in case API doesn't return it)
      const savedPhotoUrl = constructedPhotoUrl;
      // Extract photo path from response (could be full URL or relative path)
      const photoPathFromResponse = updatedPatientData.photo || '';
      // Normalize to relative path format (remove protocol and domain, keep path)
      const savedPhotoPath = photoPathFromResponse.startsWith('http') 
        ? photoPathFromResponse.replace(/^https?:\/\/[^\/]+/, '')
        : photoPathFromResponse;
      
      if (process.env.NODE_ENV === 'development') {
        console.log('📸 Photo upload successful!');
        console.log('📸 Saved photo URL:', savedPhotoUrl);
        console.log('📸 Saved photo path:', savedPhotoPath);
        console.log('📸 Photo from API response:', photoPathFromResponse);
      }
      
      // Close modal and clear form state FIRST to avoid flicker
      setIsPhotoUploadDialogOpen(false);
      setPhotoFile(null);
      setPhotoPreview(null);
      
      toast.success('Patient photo updated successfully');
      
      // Update rawPatientData with photo path BEFORE reloading
      // This ensures loadPatientData can use it if the GET endpoint doesn't return photo
      if (savedPhotoPath) {
        setRawPatientData((prev: any) => {
          if (!prev) return prev;
          if (process.env.NODE_ENV === 'development') {
            console.log('📸 Updating rawPatientData with photo path:', savedPhotoPath);
          }
          return { ...prev, photo: savedPhotoPath };
        });
      }
      
      // Reload full patient data to ensure everything is in sync
      // This will refresh all patient info from the API
      await loadPatientData();
      
      // After loadPatientData completes, restore photo URL if it was lost
      // The GET endpoint might not return the photo field, so we preserve it
      if (savedPhotoUrl) {
        // Wait a bit for state to settle after loadPatientData
        await new Promise(resolve => setTimeout(resolve, 200));
        
        setPatient(prev => {
          if (!prev) {
            if (process.env.NODE_ENV === 'development') {
              console.log('📸 Cannot restore photo: patient state is null');
            }
            return prev;
          }
          
          const currentPhoto = prev.photoUrl;
          if (process.env.NODE_ENV === 'development') {
            console.log('📸 Checking photo after reload - Current:', currentPhoto || '(empty)');
          }
          
          // Restore if photo is missing or empty
          if (!currentPhoto || currentPhoto.trim() === '' || currentPhoto === 'null' || currentPhoto === 'undefined') {
            if (process.env.NODE_ENV === 'development') {
              console.log('📸 ✅ Restoring saved photo URL:', savedPhotoUrl);
            }
            return { ...prev, photoUrl: savedPhotoUrl };
          }
          
          // Check if the current photo is different from what we uploaded
          // If so, it means the API returned a photo, use that
          if (currentPhoto !== savedPhotoUrl) {
            if (process.env.NODE_ENV === 'development') {
              console.log('📸 Using API photo URL (different from saved):', currentPhoto);
            }
          } else {
            if (process.env.NODE_ENV === 'development') {
              console.log('📸 Photo URL matches saved value, keeping current');
            }
          }
          
          return prev;
        });
        
        // Ensure rawPatientData still has the photo path
        if (savedPhotoPath) {
          setRawPatientData((prev: any) => {
            if (!prev) return prev;
            if (!prev.photo || prev.photo === '' || prev.photo === null) {
              if (process.env.NODE_ENV === 'development') {
                console.log('📸 Restoring photo path in rawPatientData:', savedPhotoPath);
              }
              return { ...prev, photo: savedPhotoPath };
            }
            return prev;
          });
        }
      }
    } catch (err: any) {
      console.error('Error uploading photo:', err);
      toast.error(err.message || 'Failed to upload photo. Please try again.');
    } finally {
      setIsUploadingPhoto(false);
    }
  };

  const handleRemovePhoto = async () => {
    if (!patient || !patient.numericId) return;

    setIsRemovingPhoto(true);
    try {
      // Get valid access token
      const { getStoredAccessToken } = await import('@/lib/api-client');
      let token = getStoredAccessToken();
      
      if (!token) {
        throw new Error('Authentication required. Please log in again.');
      }

      // Send PATCH request to remove photo (set photo to null/empty)
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8001/api';
      const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
      const photoUpdateUrl = `${baseUrl}/patients/${patient.numericId}/`;
      
      const response = await fetch(photoUpdateUrl, {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ photo: null }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to remove photo');
      }

      // Update local state
      setPatient({ ...patient, photoUrl: '' });
      setPhotoPreview(null);
      setPhotoFile(null);
      setRawPatientData((prev: any) => {
        if (!prev) return prev;
        return { ...prev, photo: null };
      });
      
      toast.success('Patient photo removed successfully');
      
      // Reload patient data to ensure sync
      await loadPatientData();
      
      // Close dialog after successful removal
      setIsPhotoUploadDialogOpen(false);
    } catch (err: any) {
      console.error('Error removing photo:', err);
      toast.error(err.message || 'Failed to remove photo. Please try again.');
    } finally {
      setIsRemovingPhoto(false);
    }
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/medical-records" className="hover:text-primary">Medical Records</Link>
          <span>/</span>
          <Link href="/medical-records/patients" className="hover:text-primary">Patients</Link>
          <span>/</span>
          <span className="text-foreground">{patient?.patientId || patient?.id || patientIdParam}</span>
        </div>

        {/* Loading State */}
        {loading && (
          <Card>
            <CardContent className="p-12 text-center">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin text-muted-foreground" />
              <p className="text-muted-foreground">Loading patient data...</p>
            </CardContent>
          </Card>
        )}

        {/* Error State */}
        {error && !loading && (
          <Card>
            <CardContent className="p-12 text-center">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 text-red-500" />
              <p className="text-red-600 dark:text-red-400 mb-4">{error}</p>
              <Button variant="outline" onClick={loadPatientData}>
                <RefreshCw className="h-4 w-4 mr-2" />Retry
              </Button>
            </CardContent>
          </Card>
        )}
        
        {/* Patient Header Card */}
        {!loading && !error && patient && (
        <>
        <Card className="border-border bg-card">
          <CardContent className="p-6">
            <div className="flex items-start gap-6">
              {/* Patient Photo */}
              <div className="relative group">
                {patient.photoUrl && patient.photoUrl.trim() !== '' ? (
                  <div className="w-24 h-24 rounded-full overflow-hidden ring-4 ring-primary/20">
                    <img 
                      src={patient.photoUrl} 
                      alt={`${patient.firstName} ${patient.lastName}`} 
                      className="w-full h-full object-cover"
                      onError={(e) => {
                        console.error('❌ Failed to load patient photo:', patient.photoUrl);
                        // Hide image on error, show fallback
                        const target = e.target as HTMLImageElement;
                        target.style.display = 'none';
                      }}
                      onLoad={() => {
                        if (process.env.NODE_ENV === 'development') {
                          console.log('✅ Patient photo loaded successfully:', patient.photoUrl);
                        }
                      }}
                      key={patient.photoUrl.split('?')[0]} // Force re-render when URL changes (remove query params for stable key)
                    />
                  </div>
                ) : (
                  <div className="w-24 h-24 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-3xl font-bold text-white ring-4 ring-primary/20">
                    {(() => {
                      const firstInitial = (patient.firstName && patient.firstName !== 'Not provided') ? patient.firstName[0] : '';
                      const lastInitial = (patient.lastName && patient.lastName !== 'Not provided') ? patient.lastName[0] : '';
                      return firstInitial || lastInitial || patient.patientId?.[0] || '?';
                    })()}
                  </div>
                )}
                <button onClick={() => setIsPhotoUploadDialogOpen(true)} className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="h-6 w-6 text-white" />
                </button>
              </div>
              
                     <div className="flex-1">
                       <div className="flex items-center gap-3 mb-1">
                         <h1 className="text-2xl font-bold text-foreground">
                           {(() => {
                             // Build display name safely
                             const parts = [];
                             if (patient.lastName && patient.lastName !== 'Not provided') parts.push(patient.lastName);
                             if (patient.firstName && patient.firstName !== 'Not provided') parts.push(patient.firstName);
                             if (patient.middleName) parts.push(patient.middleName);
                             return parts.length > 0 
                               ? parts.join(', ')
                               : patient.patientId || `Patient ${patient.id}`;
                           })()}
                         </h1>
                         <Badge variant="outline" className="border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">{patient.status}</Badge>
                         <Badge variant="outline" className="border-teal-500/50 text-teal-600 dark:text-teal-400">{patient.category}</Badge>
                       </div>
                         <p className="text-sm text-muted-foreground mb-3">
                           {patient.patientId}
                           {patient.personalNumber && patient.personalNumber !== 'Not provided' ? ` • ${patient.personalNumber}` : ''}
                           {(patient as any).division ? ` • ${(patient as any).division}` : ''}
                         </p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Age / Gender</p>
                      <p className="text-foreground font-medium">{patient.age}y / {patient.gender}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Heart className="h-4 w-4 text-rose-500" />
                    <div>
                      <p className="text-muted-foreground text-xs">Blood Group</p>
                      <p className="text-foreground font-medium">{patient.bloodGroup} | {patient.genotype}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Phone</p>
                      <p className="text-foreground font-medium">{patient.phone}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-muted-foreground text-xs">Email</p>
                      <p className="text-foreground font-medium truncate">{patient.email}</p>
                    </div>
                  </div>
                </div>
                
                {patient.allergies.length > 0 && (
                  <div className="mt-4 flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/30">
                    <AlertTriangle className="h-4 w-4 text-destructive flex-shrink-0" />
                    <span className="text-sm text-destructive font-medium">Allergies:</span>
                    <div className="flex flex-wrap gap-1">
                      {patient.allergies.map((a, i) => <Badge key={i} variant="outline" className="border-destructive/50 text-destructive bg-destructive/10">{a}</Badge>)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="bg-muted border border-border p-1 flex-wrap h-auto gap-1">
            <TabsTrigger value="overview" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Activity className="h-4 w-4 mr-2" />Overview</TabsTrigger>
            <TabsTrigger value="visits" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Calendar className="h-4 w-4 mr-2" />Visits</TabsTrigger>
            <TabsTrigger value="medications" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Pill className="h-4 w-4 mr-2" />Medications</TabsTrigger>
            <TabsTrigger value="lab" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><TestTube className="h-4 w-4 mr-2" />Lab Results</TabsTrigger>
            <TabsTrigger value="vitals" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><Heart className="h-4 w-4 mr-2" />Vitals History</TabsTrigger>
            <TabsTrigger value="documents" className="data-[state=active]:bg-primary/20 data-[state=active]:text-primary"><FileText className="h-4 w-4 mr-2" />Documents</TabsTrigger>
          </TabsList>

          {/* OVERVIEW TAB */}
          <TabsContent value="overview" className="space-y-6">
            <div className="grid gap-6 lg:grid-cols-3">
              <div className="space-y-6 lg:col-span-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {[
                    { icon: Calendar, value: visits.length, label: 'Total Visits', color: 'text-blue-500' },
                    { icon: Pill, value: patient.currentMedications.length, label: 'Active Meds', color: 'text-violet-500' },
                    { icon: TestTube, value: labResults.length, label: 'Lab Tests', color: 'text-amber-500' },
                    { icon: AlertCircle, value: patient.chronicConditions.length, label: 'Conditions', color: 'text-rose-500' }
                  ].map((stat, i) => (
                    <Card key={i} className="border-border bg-card">
                      <CardContent className="p-4 text-center">
                        <stat.icon className={`h-6 w-6 ${stat.color} mx-auto mb-2`} />
                        <p className="text-2xl font-bold text-foreground">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </CardContent>
                    </Card>
                  ))}
                </div>

                <Card className="border-border bg-card">
                  <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle className="text-foreground flex items-center gap-2"><Calendar className="h-5 w-5 text-blue-500" />Recent Visits</CardTitle>
                    <Button variant="ghost" size="sm" onClick={() => setActiveTab('visits')}>View All<ChevronRight className="h-4 w-4 ml-1" /></Button>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {visits.slice(0, 3).map((visit) => (
                      <div key={visit.id} className="flex items-center justify-between p-3 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-all">
                        <div className="flex items-center gap-3">
                          <div className={`w-2 h-2 rounded-full ${visit.type === 'Emergency' ? 'bg-rose-500' : visit.type === 'OPD' ? 'bg-emerald-500' : 'bg-blue-500'}`} />
                          <div>
                            <p className="font-medium text-foreground">{visit.chiefComplaint}</p>
                            <p className="text-xs text-muted-foreground">{visit.date} • {visit.doctor}</p>
                          </div>
                        </div>
                        <Badge variant="outline">{visit.type}</Badge>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <div className="grid md:grid-cols-2 gap-6">
                  <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-foreground flex items-center gap-2"><Activity className="h-5 w-5 text-rose-500" />Active Conditions</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {patient.chronicConditions.map((c, i) => (
                        <div key={i} className="flex items-center gap-2 p-2 rounded bg-muted/50">
                          <div className="w-2 h-2 rounded-full bg-rose-500" />
                          <span className="text-foreground">{c}</span>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                  <Card className="border-border bg-card">
                    <CardHeader className="flex flex-row items-center justify-between">
                      <CardTitle className="text-foreground flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Allergies</CardTitle>
                      <Button variant="ghost" size="sm" onClick={() => setIsAddAllergyDialogOpen(true)}><Plus className="h-4 w-4" /></Button>
                    </CardHeader>
                    <CardContent className="space-y-2">
                      {patient.allergies.map((a, i) => (
                        <div key={i} className="flex items-center justify-between p-2 rounded bg-destructive/10">
                          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /><span className="text-foreground">{a}</span></div>
                          <Button variant="ghost" size="sm" onClick={() => handleRemoveAllergy(a)}><X className="h-4 w-4" /></Button>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                </div>
              </div>

              <div className="space-y-6">
                <Card className="border-border bg-card">
                  <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><User className="h-5 w-5 text-blue-500" />Demographics</CardTitle></CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    {[
                      ['Date of Birth', patient.dateOfBirth],
                      ['Marital Status', patient.maritalStatus],
                      // Removed Occupation and Religion - not in backend model
                    ].map(([l, v], i) => (
                      <div key={i} className="flex justify-between">
                        <span className="text-muted-foreground">{l}</span>
                        <span className="text-foreground">{v || 'Not provided'}</span>
                      </div>
                    ))}
                    <div className="border-t border-border pt-3">
                      <p className="text-muted-foreground mb-1">Address</p>
                      <p className="text-foreground">
                        {patient.address && patient.address !== 'Not provided' 
                          ? [patient.address, patient.city !== 'Not provided' ? patient.city : '', patient.state !== 'Not provided' ? patient.state : ''].filter(Boolean).join(', ')
                          : 'Not provided'
                        }
                      </p>
                    </div>
                  </CardContent>
                </Card>
                <Card className="border-border bg-card">
                  <CardHeader><CardTitle className="text-foreground flex items-center gap-2"><AlertCircle className="h-5 w-5 text-rose-500" />Next of Kin</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <div><p className="text-muted-foreground">Name</p><p className="text-foreground font-medium">{patient.nextOfKin.name}</p></div>
                    <div><p className="text-muted-foreground">Relationship</p><p className="text-foreground">{patient.nextOfKin.relationship}</p></div>
                    <div><p className="text-muted-foreground">Phone</p><p className="text-primary">{patient.nextOfKin.phone}</p></div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* VISITS TAB */}
          <TabsContent value="visits">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground">Visit History</CardTitle>
                <Button className="bg-gradient-to-r from-teal-500 to-cyan-500 text-white" asChild>
                  <Link href={`/medical-records/visits/new?patient=${patient.id}`}><Plus className="h-4 w-4 mr-2" />New Visit</Link>
                </Button>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {visits.map((v) => (
                    <div key={v.id} className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
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
                          <p className="font-medium text-foreground">{v.chiefComplaint}</p>
                          <p className="text-sm text-muted-foreground">{v.date} • {v.doctor} • {v.department}</p>
                          <p className="text-sm text-muted-foreground">Diagnosis: {v.diagnosis}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          v.type === 'Emergency' ? 'border-rose-500/50 text-rose-600' :
                          v.type === 'OPD' ? 'border-emerald-500/50 text-emerald-600' :
                          'border-blue-500/50 text-blue-600'
                        }>{v.type}</Badge>
                        <Button variant="ghost" size="sm"><Eye className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* MEDICATIONS TAB */}
          <TabsContent value="medications">
            <Card className="border-border bg-card">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-foreground">Current Medications</CardTitle>
                <Button onClick={() => setIsAddMedicationDialogOpen(true)}><Plus className="h-4 w-4 mr-2" />Add Medication</Button>
              </CardHeader>
              <CardContent>
                <div className="grid gap-3">
                  {patient.currentMedications.map((m) => (
                    <div key={m.id} className="flex items-center justify-between p-4 rounded-lg border border-border bg-muted/30">
                      <div className="flex items-center gap-3">
                        <Pill className="h-5 w-5 text-violet-500" />
                        <div>
                          <p className="font-medium text-foreground">{m.name}</p>
                          <p className="text-sm text-muted-foreground">Dosage: {m.dosage} • Prescribed by: {m.prescribedBy}</p>
                          <p className="text-xs text-muted-foreground">Started: {m.startDate}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-violet-500/20 text-violet-600 dark:text-violet-400 border-violet-500/30">{m.frequency}</Badge>
                        <Button variant="ghost" size="sm" onClick={() => handleRemoveMedication(m.id)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* LAB RESULTS TAB - Enhanced */}
          <TabsContent value="lab" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Tests</p><p className="text-2xl font-bold text-blue-500">{labStats.total}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Normal</p><p className="text-2xl font-bold text-emerald-500">{labStats.normal}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Abnormal</p><p className="text-2xl font-bold text-amber-500">{labStats.abnormal}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Critical</p><p className="text-2xl font-bold text-rose-500">{labStats.critical}</p></CardContent></Card>
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3">
                  <Select value={labStatusFilter} onValueChange={setLabStatusFilter}>
                    <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Status</SelectItem>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="abnormal">Abnormal</SelectItem>
                      <SelectItem value="critical">Critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Results List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Laboratory Results</CardTitle>
                <CardDescription>Showing {filteredLabResults.length} of {labResults.length} results</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {filteredLabResults.map((lab) => (
                    <div key={lab.id} className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          lab.status === 'Critical' ? 'bg-rose-100 dark:bg-rose-900/30' :
                          lab.status === 'Abnormal' ? 'bg-amber-100 dark:bg-amber-900/30' :
                          'bg-emerald-100 dark:bg-emerald-900/30'
                        }`}>
                          <Beaker className={`h-5 w-5 ${
                            lab.status === 'Critical' ? 'text-rose-600' :
                            lab.status === 'Abnormal' ? 'text-amber-600' :
                            'text-emerald-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{lab.test}</p>
                          <p className="text-sm text-muted-foreground">{lab.date} • {lab.category}</p>
                          <p className="text-sm font-medium">{lab.result} {lab.unit} <span className="text-muted-foreground font-normal">(Range: {lab.range})</span></p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className={
                          lab.status === 'Critical' ? 'border-rose-500/50 text-rose-600 bg-rose-500/10' :
                          lab.status === 'Abnormal' ? 'border-amber-500/50 text-amber-600 bg-amber-500/10' :
                          'border-emerald-500/50 text-emerald-600 bg-emerald-500/10'
                        }>{lab.status}</Badge>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedLabResult(lab); setIsLabDetailModalOpen(true); }}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* VITALS TAB - Enhanced */}
          <TabsContent value="vitals" className="space-y-6">
            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Latest BP</p><p className={`text-2xl font-bold ${getBPStatus(vitalStats.latestBP).color}`}>{vitalStats.latestBP}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Avg Pulse</p><p className="text-2xl font-bold text-blue-500">{vitalStats.avgPulse} bpm</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Weight Trend</p><p className="text-2xl font-bold flex items-center gap-1">
                {vitalStats.weightTrend > 0 ? <TrendingUp className="h-5 w-5 text-rose-500" /> : vitalStats.weightTrend < 0 ? <TrendingDown className="h-5 w-5 text-emerald-500" /> : <Minus className="h-5 w-5 text-muted-foreground" />}
                {Math.abs(vitalStats.weightTrend)} kg
              </p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Records</p><p className="text-2xl font-bold text-violet-500">{vitalStats.total}</p></CardContent></Card>
            </div>

            {/* Vitals List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-rose-500" />Vital Signs History</CardTitle>
                <CardDescription>Complete history of patient's vital signs recordings</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {filteredVitals.map((vital) => {
                    const bpStatus = getBPStatus(vital.bp);
                    return (
                      <div key={vital.id} className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                        <div className="flex items-center gap-4">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center ${bpStatus.bg}`}>
                            <Heart className={`h-5 w-5 ${bpStatus.color}`} />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-foreground">{vital.date}</p>
                              <Badge variant="outline" className={`text-xs ${bpStatus.color}`}>{bpStatus.label}</Badge>
                            </div>
                            <div className="flex flex-wrap gap-3 text-sm text-muted-foreground">
                              <span><strong>BP:</strong> {vital.bp} mmHg</span>
                              <span><strong>Pulse:</strong> {vital.pulse} bpm</span>
                              <span><strong>Temp:</strong> {vital.temp}°C</span>
                              <span><strong>SpO2:</strong> {vital.spo2}%</span>
                              <span><strong>Weight:</strong> {vital.weight} kg</span>
                            </div>
                            <p className="text-xs text-muted-foreground mt-1">Recorded by: {vital.recordedBy} at {vital.time}</p>
                          </div>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => { setSelectedVital(vital); setIsVitalDetailModalOpen(true); }}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* DOCUMENTS TAB - Enhanced */}
          <TabsContent value="documents" className="space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Total Documents</p><p className="text-2xl font-bold text-blue-500">{allDocuments.length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Consultation Reports</p><p className="text-2xl font-bold text-teal-500">{consultationReports.length}</p></CardContent></Card>
              <Card><CardContent className="p-4"><p className="text-sm text-muted-foreground">Uploads</p><p className="text-2xl font-bold text-violet-500">{uploadedDocuments.length}</p></CardContent></Card>
              <Card><CardContent className="p-4 flex items-center justify-center"><Button onClick={() => setIsUploadDialogOpen(true)}><Upload className="h-4 w-4 mr-2" />Upload New</Button></CardContent></Card>
            </div>

            {/* Filters */}
            <Card>
              <CardContent className="p-4">
                <div className="flex flex-wrap gap-3">
                  <Select value={docTypeFilter} onValueChange={setDocTypeFilter}>
                    <SelectTrigger className="w-[180px]"><SelectValue placeholder="Document Type" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="consultation">Consultation Reports</SelectItem>
                      <SelectItem value="emergency">Emergency Reports</SelectItem>
                      <SelectItem value="external">External Reports</SelectItem>
                      <SelectItem value="insurance">Insurance</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardContent>
            </Card>

            {/* Documents List */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-500" />Documents & Reports</CardTitle>
                <CardDescription>Consultation reports and uploaded documents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3 max-h-[500px] overflow-y-auto">
                  {filteredDocuments.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-4 rounded-lg border border-border hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                          doc.type.includes('Consultation') ? 'bg-teal-100 dark:bg-teal-900/30' :
                          doc.type.includes('Emergency') ? 'bg-rose-100 dark:bg-rose-900/30' :
                          'bg-blue-100 dark:bg-blue-900/30'
                        }`}>
                          <FileText className={`h-5 w-5 ${
                            doc.type.includes('Consultation') ? 'text-teal-600' :
                            doc.type.includes('Emergency') ? 'text-rose-600' :
                            'text-blue-600'
                          }`} />
                        </div>
                        <div>
                          <p className="font-medium text-foreground">{'title' in doc ? doc.title : doc.name}</p>
                          <p className="text-sm text-muted-foreground">{doc.date} • {doc.type} • {doc.size}</p>
                          {'doctor' in doc && <p className="text-xs text-muted-foreground">By: {doc.doctor}</p>}
                          {'uploadedBy' in doc && <p className="text-xs text-muted-foreground">Uploaded by: {doc.uploadedBy}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button variant="outline" size="sm" onClick={() => { setSelectedDocument(doc); setIsDocumentDetailModalOpen(true); }}>
                          <Eye className="h-4 w-4 mr-1" />View
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => toast.info('Downloading...')}><Download className="h-4 w-4" /></Button>
                        <Button variant="ghost" size="sm" onClick={() => toast.info('Printing...')}><Printer className="h-4 w-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Lab Result Detail Modal */}
        <Dialog open={isLabDetailModalOpen} onOpenChange={setIsLabDetailModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Lab Result Details</DialogTitle>
            </DialogHeader>
            {selectedLabResult && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Test Name</p><p className="font-medium">{selectedLabResult.test}</p></div>
                  <div><p className="text-sm text-muted-foreground">Category</p><p className="font-medium">{selectedLabResult.category}</p></div>
                  <div><p className="text-sm text-muted-foreground">Date</p><p className="font-medium">{selectedLabResult.date}</p></div>
                  <div><p className="text-sm text-muted-foreground">Status</p><Badge variant="outline" className={selectedLabResult.status === 'Normal' ? 'border-emerald-500/50 text-emerald-600' : 'border-amber-500/50 text-amber-600'}>{selectedLabResult.status}</Badge></div>
                </div>
                <Separator />
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Result</p><p className="text-xl font-bold">{selectedLabResult.result} {selectedLabResult.unit}</p></div>
                  <div><p className="text-sm text-muted-foreground">Normal Range</p><p className="font-medium">{selectedLabResult.range} {selectedLabResult.unit}</p></div>
                </div>
                <Separator />
                <div><p className="text-sm text-muted-foreground">Ordered By</p><p className="font-medium">{selectedLabResult.orderedBy}</p></div>
                <div><p className="text-sm text-muted-foreground">Verified By</p><p className="font-medium">{selectedLabResult.verifiedBy}</p></div>
                {selectedLabResult.notes && <div><p className="text-sm text-muted-foreground">Notes</p><p className="text-sm">{selectedLabResult.notes}</p></div>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsLabDetailModalOpen(false)}>Close</Button>
              <Button onClick={() => toast.info('Printing...')}><Printer className="h-4 w-4 mr-2" />Print</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Vital Detail Modal */}
        <Dialog open={isVitalDetailModalOpen} onOpenChange={setIsVitalDetailModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Heart className="h-5 w-5 text-rose-500" />Vital Signs Details</DialogTitle>
            </DialogHeader>
            {selectedVital && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Date</p><p className="font-medium">{selectedVital.date}</p></div>
                  <div><p className="text-sm text-muted-foreground">Time</p><p className="font-medium">{selectedVital.time}</p></div>
                </div>
                <Separator />
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Blood Pressure</p>
                    <p className="text-xl font-bold">{selectedVital.bp}</p>
                    <p className="text-xs text-muted-foreground">mmHg</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Pulse</p>
                    <p className="text-xl font-bold">{selectedVital.pulse}</p>
                    <p className="text-xs text-muted-foreground">bpm</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Temperature</p>
                    <p className="text-xl font-bold">{selectedVital.temp}</p>
                    <p className="text-xs text-muted-foreground">°C</p>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">SpO2</p>
                    <p className="text-xl font-bold">{selectedVital.spo2}%</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">Weight</p>
                    <p className="text-xl font-bold">{selectedVital.weight} kg</p>
                  </div>
                  <div className="text-center p-3 rounded-lg bg-muted/50">
                    <p className="text-sm text-muted-foreground">BMI</p>
                    <p className="text-xl font-bold">{selectedVital.bmi}</p>
                  </div>
                </div>
                <Separator />
                <div><p className="text-sm text-muted-foreground">Recorded By</p><p className="font-medium">{selectedVital.recordedBy}</p></div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsVitalDetailModalOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Document Detail Modal */}
        <Dialog open={isDocumentDetailModalOpen} onOpenChange={setIsDocumentDetailModalOpen}>
          <DialogContent className="sm:max-w-[500px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-blue-500" />Document Details</DialogTitle>
            </DialogHeader>
            {selectedDocument && (
              <div className="space-y-4">
                <div><p className="text-sm text-muted-foreground">Title</p><p className="font-medium">{'title' in selectedDocument ? selectedDocument.title : selectedDocument.name}</p></div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Type</p><p className="font-medium">{selectedDocument.type}</p></div>
                  <div><p className="text-sm text-muted-foreground">Date</p><p className="font-medium">{selectedDocument.date}</p></div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div><p className="text-sm text-muted-foreground">Size</p><p className="font-medium">{selectedDocument.size}</p></div>
                  {'doctor' in selectedDocument && <div><p className="text-sm text-muted-foreground">Doctor</p><p className="font-medium">{selectedDocument.doctor}</p></div>}
                  {'uploadedBy' in selectedDocument && <div><p className="text-sm text-muted-foreground">Uploaded By</p><p className="font-medium">{selectedDocument.uploadedBy}</p></div>}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDocumentDetailModalOpen(false)}>Close</Button>
              <Button onClick={() => toast.info('Downloading...')}><Download className="h-4 w-4 mr-2" />Download</Button>
              <Button onClick={() => toast.info('Printing...')}><Printer className="h-4 w-4 mr-2" />Print</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Edit Patient Dialog */}
        <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
          <DialogContent className="sm:max-w-[700px] max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><User className="h-5 w-5 text-primary" />Edit Patient Information</DialogTitle>
              <DialogDescription>Update the patient's demographic and contact information.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              {/* Personal Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Personal Information</h3>
                <div className="grid grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label>Title</Label>
                          <Select value={editForm.title || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, title: v === 'none' ? '' : v }))}>
                            <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None</SelectItem>
                              {titles.map(title => <SelectItem key={title} value={title.toLowerCase()}>{title}</SelectItem>)}
                            </SelectContent>
                          </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>First Name *</Label>
                    <Input value={editForm.firstName} onChange={(e) => setEditForm(prev => ({ ...prev, firstName: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Middle Name</Label>
                    <Input value={editForm.middleName} onChange={(e) => setEditForm(prev => ({ ...prev, middleName: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Surname *</Label>
                    <Input value={editForm.lastName} onChange={(e) => setEditForm(prev => ({ ...prev, lastName: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Date of Birth</Label>
                    <Input type="date" value={editForm.dateOfBirth} onChange={(e) => setEditForm(prev => ({ ...prev, dateOfBirth: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Marital Status</Label>
                    <Select value={editForm.maritalStatus || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, maritalStatus: v === 'not-specified' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-specified">Not specified</SelectItem>
                        {maritalStatuses.map(status => <SelectItem key={status} value={status.toLowerCase()}>{status}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Contact Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Contact Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={editForm.phone} onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))} placeholder="+234..." />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input type="email" value={editForm.email} onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))} placeholder="email@example.com" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Residential Address</Label>
                  <Textarea value={editForm.residentialAddress} onChange={(e) => setEditForm(prev => ({ ...prev, residentialAddress: e.target.value }))} rows={2} placeholder="Street address" />
                </div>
                <div className="space-y-2">
                  <Label>Permanent Address</Label>
                  <Textarea value={editForm.permanentAddress} onChange={(e) => setEditForm(prev => ({ ...prev, permanentAddress: e.target.value }))} rows={2} placeholder="Permanent address (if different)" />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label>LGA</Label>
                    <Input value={editForm.lga} onChange={(e) => setEditForm(prev => ({ ...prev, lga: e.target.value }))} placeholder="Local Government Area" />
                  </div>
                  <div className="space-y-2">
                    <Label>State of Residence</Label>
                    <Select value={editForm.stateOfResidence || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, stateOfResidence: v === 'not-specified' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-specified">Not specified</SelectItem>
                        {NIGERIA_STATES.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>State of Origin</Label>
                    <Select value={editForm.stateOfOrigin || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, stateOfOrigin: v === 'not-specified' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select state" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-specified">Not specified</SelectItem>
                        {NIGERIA_STATES.map(state => <SelectItem key={state} value={state}>{state}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Medical Information */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Medical Information</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Blood Group</Label>
                    <Select value={editForm.bloodGroup || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, bloodGroup: v === 'not-specified' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-specified">Not specified</SelectItem>
                        {['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map(bg => <SelectItem key={bg} value={bg}>{bg}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Genotype</Label>
                    <Select value={editForm.genotype || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, genotype: v === 'not-specified' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-specified">Not specified</SelectItem>
                        {['AA', 'AS', 'SS', 'AC', 'SC'].map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Separator />

              {/* Next of Kin */}
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-foreground">Next of Kin</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={editForm.nokFirstName} onChange={(e) => setEditForm(prev => ({ ...prev, nokFirstName: e.target.value }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>Middle Name</Label>
                    <Input value={editForm.nokMiddleName} onChange={(e) => setEditForm(prev => ({ ...prev, nokMiddleName: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Relationship</Label>
                    <Select value={editForm.nokRelationship || undefined} onValueChange={(v) => setEditForm(prev => ({ ...prev, nokRelationship: v === 'not-specified' ? '' : v }))}>
                      <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="not-specified">Not specified</SelectItem>
                        {NOK_RELATIONSHIPS.map(rel => <SelectItem key={rel} value={rel}>{rel}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={editForm.nokPhone} onChange={(e) => setEditForm(prev => ({ ...prev, nokPhone: e.target.value }))} placeholder="+234..." />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Address</Label>
                  <Textarea value={editForm.nokAddress} onChange={(e) => setEditForm(prev => ({ ...prev, nokAddress: e.target.value }))} rows={2} placeholder="Next of kin address" />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsEditDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSaveEdit}><Save className="h-4 w-4 mr-2" />Save Changes</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Medication Dialog */}
        <Dialog open={isAddMedicationDialogOpen} onOpenChange={setIsAddMedicationDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Pill className="h-5 w-5 text-violet-500" />Add Medication</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2"><Label>Medication Name</Label><Input value={newMedication.name} onChange={(e) => setNewMedication(prev => ({ ...prev, name: e.target.value }))} placeholder="e.g., Metformin" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2"><Label>Dosage</Label><Input value={newMedication.dosage} onChange={(e) => setNewMedication(prev => ({ ...prev, dosage: e.target.value }))} placeholder="e.g., 500mg" /></div>
                <div className="space-y-2"><Label>Frequency</Label>
                  <Select value={newMedication.frequency} onValueChange={(v) => setNewMedication(prev => ({ ...prev, frequency: v }))}><SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger><SelectContent><SelectItem value="OD">Once Daily (OD)</SelectItem><SelectItem value="BD">Twice Daily (BD)</SelectItem><SelectItem value="TDS">Three Times Daily (TDS)</SelectItem><SelectItem value="QDS">Four Times Daily (QDS)</SelectItem><SelectItem value="PRN">As Needed (PRN)</SelectItem></SelectContent></Select>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddMedicationDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddMedication}><Plus className="h-4 w-4 mr-2" />Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Allergy Dialog */}
        <Dialog open={isAddAllergyDialogOpen} onOpenChange={setIsAddAllergyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-500" />Add Allergy</DialogTitle>
            </DialogHeader>
            <div className="py-4">
              <div className="space-y-2"><Label>Allergy</Label><Input value={newAllergy} onChange={(e) => setNewAllergy(e.target.value)} placeholder="e.g., Penicillin" /></div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddAllergyDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleAddAllergy}><Plus className="h-4 w-4 mr-2" />Add</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Upload Document Dialog */}
        <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Upload className="h-5 w-5 text-blue-500" />Upload Document</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="space-y-2">
                <Label>Document Type</Label>
                <Select value={uploadType} onValueChange={setUploadType}><SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger><SelectContent><SelectItem value="External Report">External Report</SelectItem><SelectItem value="Insurance">Insurance</SelectItem><SelectItem value="Referral">Referral</SelectItem><SelectItem value="Other">Other</SelectItem></SelectContent></Select>
              </div>
              <div className="space-y-2">
                <Label>File</Label>
                <Input type="file" onChange={(e) => setUploadFile(e.target.files?.[0] || null)} />
              </div>
              {uploadFile && <p className="text-sm text-muted-foreground">Selected: {uploadFile.name}</p>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsUploadDialogOpen(false)}>Cancel</Button>
              <Button onClick={() => { setIsUploadDialogOpen(false); toast.success('Document uploaded'); }} disabled={!uploadFile || !uploadType}><Upload className="h-4 w-4 mr-2" />Upload</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Photo Upload Dialog */}
        <Dialog open={isPhotoUploadDialogOpen} onOpenChange={(open) => { setIsPhotoUploadDialogOpen(open); if (!open) { setPhotoFile(null); setPhotoPreview(null); } }}>
          <DialogContent className="sm:max-w-[400px]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Camera className="h-5 w-5 text-teal-500" />Update Patient Photo</DialogTitle>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="flex justify-center">
                {photoPreview ? (
                  <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-teal-500/30"><img src={photoPreview} alt="Preview" className="w-full h-full object-cover" /></div>
                ) : patient.photoUrl ? (
                  <div className="w-32 h-32 rounded-full overflow-hidden ring-4 ring-muted"><img src={patient.photoUrl} alt="Current" className="w-full h-full object-cover" /></div>
                ) : (
                  <div className="w-32 h-32 rounded-full bg-gradient-to-br from-teal-500 to-cyan-500 flex items-center justify-center text-4xl font-bold text-white ring-4 ring-muted">{patient.firstName[0]}{patient.lastName[0]}</div>
                )}
              </div>
              <div className="space-y-2">
                <Label>Select Photo</Label>
                <Input type="file" accept="image/*" onChange={handlePhotoSelect} className="cursor-pointer" />
                <p className="text-xs text-muted-foreground">Max size: 5MB</p>
              </div>
            </div>
            <DialogFooter className="flex-col sm:flex-row gap-2">
              {patient.photoUrl && !photoPreview && (
                <Button 
                  variant="destructive" 
                  onClick={handleRemovePhoto} 
                  disabled={isRemovingPhoto || isUploadingPhoto}
                  className="w-full sm:w-auto"
                >
                  {isRemovingPhoto ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Removing...
                    </>
                  ) : (
                    <>
                      <Trash2 className="h-4 w-4 mr-2" />
                      Remove
                    </>
                  )}
                </Button>
              )}
              <div className="flex gap-2 w-full sm:w-auto">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setIsPhotoUploadDialogOpen(false);
                    setPhotoFile(null);
                    setPhotoPreview(null);
                  }} 
                  disabled={isUploadingPhoto || isRemovingPhoto}
                  className="flex-1"
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handlePhotoUpload} 
                  disabled={!photoPreview || isUploadingPhoto || isRemovingPhoto} 
                  className="flex-1"
                >
                  {isUploadingPhoto ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Save
                    </>
                  )}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        </>
        )}
      </div>
    </DashboardLayout>
  );
}
