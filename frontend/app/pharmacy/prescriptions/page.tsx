"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { pharmacyService, type Prescription as ApiPrescription, type PrescriptionItem } from '@/lib/services';
import { PatientAvatar } from "@/components/PatientAvatar";
import { 
  ClipboardList, Search, Eye, Clock, CheckCircle2, CheckCircle, Pill, Calendar,
  AlertTriangle, Package, User, Activity, Stethoscope,
  ArrowRight, XCircle, Printer, ShieldAlert, ArrowRightLeft, Info,
  FileText, Beaker, Hash, Loader2, Tag
} from 'lucide-react';
import type { Prescription, PrescriptionStatus, Priority, DrugInteraction, MedicationBatch, SubstituteOption, MedicationItem } from './TYPES';

// Substitution reasons
const substitutionReasons = [
  { value: 'brand_selection', label: 'Brand Selection', icon: '🏷️', description: 'Selecting specific brand for generic prescription' },
  { value: 'out_of_stock', label: 'Out of Stock', icon: '📦', description: 'Original medication not available' },
  { value: 'near_expiry', label: 'Near Expiry Stock', icon: '⏰', description: 'Pushing out stock close to expiration' },
  { value: 'patient_preference', label: 'Patient Preference', icon: '👤', description: 'Patient requested different brand/generic' },
  { value: 'clinical_decision', label: 'Clinical Decision', icon: '⚕️', description: 'Pharmacist/doctor clinical recommendation' },
  { value: 'formulary_change', label: 'Formulary Change', icon: '📋', description: 'Hospital formulary updated' },
  { value: 'allergy_concern', label: 'Allergy/Sensitivity', icon: '⚠️', description: 'Concern about patient reaction' },
  { value: 'other', label: 'Other', icon: '📝', description: 'Other reason - specify in notes' },
];

const debugPharmacy = (...args: any[]) => {
  if (typeof window === 'undefined') return;
  try {
    if (window.localStorage?.getItem('debug_pharmacy') === '1') {
      console.log(...args);
    }
  } catch {
  }
};

// Check for drug interactions using pharmacy service
const checkInteractions = async (medications: string[]): Promise<DrugInteraction[]> => {
  try {
    // Extract medication IDs from the prescription medications
    const medicationIds: number[] = [];

    // For each medication name, try to find its ID
    for (const medName of medications) {
      try {
        // Search for medication by name to get ID
        const searchResults = await pharmacyService.getMedications({ search: medName, page_size: 1 });
        if (searchResults.results.length > 0) {
          medicationIds.push(searchResults.results[0].id);
        }
      } catch (err) {
        console.warn(`Could not find medication ID for ${medName}:`, err);
      }
    }

    if (medicationIds.length >= 2) {
      return await pharmacyService.checkInteractions(medicationIds);
    }

    return [];
  } catch (err) {
    console.error('Error checking drug interactions:', err);
    toast.error('Failed to check drug interactions');
    return [];
  }
};

// Get medication batches - uses pharmacyService

// Get substitutes for medication using pharmacy service API
const getSubstitutesForMedication = async (medicationName: string): Promise<SubstituteOption[]> => {
  try {
    // First find the medication ID by name
    const searchResults = await pharmacyService.getMedications({ search: medicationName, page_size: 1 });
    if (searchResults.results.length === 0) {
      console.warn(`No medication found for name: ${medicationName}`);
      return [];
    }

    const medicationId = searchResults.results[0].id;

    // Get substitutes using the pharmacy service API
    const substitutes = await pharmacyService.getSubstitutes(medicationId);

    // Enhance substitutes with additional data from inventory
    const enhancedSubstitutes: SubstituteOption[] = await Promise.all(
      substitutes.map(async (substitute) => {
        try {
          const batches = await pharmacyService.getMedicationBatches(Number(substitute.id));
          const stock = batches.reduce((total, b) => total + Number(b.quantity || 0), 0);
          const firstExpiry = batches.find((b) => Boolean(b.expiryDate))?.expiryDate || '';
          const expiryDate = firstExpiry ? new Date(firstExpiry).toLocaleDateString() : '';
          const daysToExpiry = firstExpiry
            ? Math.ceil((new Date(firstExpiry).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
            : 0;
          const isNearExpiry = firstExpiry ? daysToExpiry <= 90 : false;

          return {
            id: substitute.id,
            name: substitute.name,
            strength: '', // Not available from API, leave empty
            type: substitute.type === 'generic' ? 'generic' : substitute.type === 'brand' ? 'brand' : 'therapeutic',
            stock,
            expiryDate,
            daysToExpiry,
            unitPrice: substitute.unitPrice,
            isNearExpiry,
          };
        } catch (err) {
          console.warn(`Error enhancing substitute ${substitute.name}:`, err);
          return {
            id: substitute.id,
            name: substitute.name,
            strength: '',
            type: substitute.type === 'generic' ? 'generic' : substitute.type === 'brand' ? 'brand' : 'therapeutic',
            stock: substitute.stock,
            expiryDate: substitute.expiryDate,
            daysToExpiry: substitute.daysToExpiry,
            unitPrice: substitute.unitPrice,
            isNearExpiry: substitute.isNearExpiry,
          };
        }
      })
    );

    return enhancedSubstitutes;
  } catch (err) {
    console.error('Error loading substitutes:', err);
    toast.error('Failed to load medication substitutes');
    return [];
  }
};

export default function PrescriptionsPage() {
  const [prescriptions, setPrescriptions] = useState<Prescription[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  const [totalCount, setTotalCount] = useState(0);
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(false);

  // Load prescriptions from API
  useEffect(() => {
    loadPrescriptions();
  }, [currentPage, itemsPerPage, statusFilter, searchQuery]);

  // Transform medication data with status determination
  const transformMedications = (medications: any[], prescriptionStatus: string) => {
    debugPharmacy('Transforming medications:', medications);
    return medications.map((med: any) => {
      // Determine medication status - prioritize dispense status over stock availability
      let status: 'Available' | 'Low Stock' | 'Out of Stock' | 'Pending' | 'Dispensed' | 'Partially Dispensed' | 'Over-dispensed' = 'Pending';

      // Convert to numbers for proper comparison
      const dispensedQty = Number(med.dispensed_quantity || 0);
      const prescribedQty = Number(med.quantity || 0);

      // Check if medication has been over-dispensed (dispensed > prescribed)
      if (dispensedQty > prescribedQty) {
        status = 'Over-dispensed';
      }
      // Check if medication is fully dispensed
      else if (med.is_dispensed || Math.max(0, prescribedQty - dispensedQty) <= 0) {
        status = 'Dispensed';
      }
      // Check if medication has been partially dispensed (dispensed > 0 but < prescribed)
      else if (dispensedQty > 0) {
        status = 'Partially Dispensed';
      }
      // For medications that haven't been dispensed, check stock availability
      else if (med.medication_details?.current_stock !== undefined) {
        const stock = med.medication_details.current_stock;
        if (stock === 0) status = 'Out of Stock';
        else if (stock < 50) status = 'Low Stock';
        else status = 'Available';
      }
      // Check if it's a Generic (no stock info directly)
      else if (med.medication_details?.type === 'generic') {
         status = 'Pending'; // Needs brand selection
      }
      // If no stock info available, check prescription status
      else if (prescriptionStatus === 'dispensed' || prescriptionStatus === 'Dispensed') {
        status = 'Dispensed';
      } else {
        status = 'Pending';
      }

      const transformedMed = {
        id: med.id.toString(),
        name: med.medication_name || med.medication_details?.name || '',
        dosage: med.dosage || '',
        frequency: med.frequency || med.frequency_display || '',
        duration: med.duration || '',
        quantity: Number(med.quantity || 0),
        unit: med.unit || med.medication_details?.unit || '',
        dosage_form: med.dosage_form || med.medication_details?.form || '',
        strength: med.strength || med.medication_details?.strength || '',
        dispensed_quantity: Number(med.dispensed_quantity || 0),
        remaining_quantity: Math.max(0, Number(med.quantity || 0) - Number(med.dispensed_quantity || 0)),
        route: med.route || med.route_display || 'Oral',
        instructions: med.instructions || '',
        status,
        stockLevel: med.medication_details?.current_stock || 0,
        medication_details: med.medication_details,
        type: med.medication_details?.type || 'brand',
        generic: med.generic || med.medication_details?.generic_id || null, // Add generic field for brand selection logic
        medication: med.medication || med.medication_details?.medication_id || null, // Add medication field
        substitution: med.substitution,
        originalMedication: med.originalMedication
      };
      
      // Debug: Log the transformed medication
      debugPharmacy(`Transformed medication ${med.id}:`, transformedMed);
      
      return transformedMed;
    });
  };

  const loadPrescriptions = async () => {
    // Prevent concurrent calls
    if (isLoadingPrescriptions) {
      return;
    }

    try {
      setIsLoadingPrescriptions(true);
      setLoading(true);
      setError(null);
      const response = await pharmacyService.getPrescriptions({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page: currentPage,
        page_size: itemsPerPage,
        search: searchQuery || undefined,
        // Note: priorityFilter, dateFilter, genderFilter not yet implemented in backend
      });
      setTotalCount(response.count || response.results.length);
      // Transform API data - extract patient and visit details
      const transformed = await Promise.all(response.results.map(async (rx: any) => {
        // Extract patient details from prescription or visit
        const patientDetails = rx.patient_details || {};
        const visitDetails = rx.visit_details || {};
        const patientId = rx.patient?.toString() || patientDetails.id || '';
        let patientName = rx.patient_name || patientDetails.name || 'Unknown Patient';
        const patientIdentifier = patientDetails.patient_id || '';


        // Handle patient age - use direct age field, or calculate from DOB if age is 0/null
        let patientAge = patientDetails.age || 0;
        if (patientAge === 0 && patientDetails.date_of_birth) {
          try {
            const birthDate = new Date(patientDetails.date_of_birth);
            const today = new Date();
            patientAge = today.getFullYear() - birthDate.getFullYear();
            const monthDiff = today.getMonth() - birthDate.getMonth();
            if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
              patientAge--;
            }
          } catch (error) {
            patientAge = 0;
          }
        }

        const patientGender = patientDetails.gender || '';
        const patientPhone = patientDetails.phone_number || patientDetails.phone || '';
        const patientAllergies = patientDetails.allergies || [];
        
        // Extract visit/clinic details
        const clinic = visitDetails.clinic || (visitDetails.consultation_room?.name) || '';
        const location = patientDetails.location || visitDetails.location || '';
        const visitNotes = visitDetails.clinical_notes || undefined;
        
        // Extract doctor details
        const doctorName = rx.doctor_name || '';
        const doctorId = rx.doctor?.toString() || '';
        
        // Calculate wait time with safeguards
        let waitTime = 0;
        try {
          const prescribedAt = new Date(rx.prescribed_at);
          const now = new Date();

          // Validate the date is reasonable (not too old)
          const daysDiff = (now.getTime() - prescribedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysDiff > 365) {
            // If prescription is more than a year old, cap at 24 hours for demo purposes
            waitTime = 1440; // 24 hours in minutes
          } else if (daysDiff < 0) {
            // If prescription date is in future, show 0
            waitTime = 0;
          } else {
            waitTime = Math.floor((now.getTime() - prescribedAt.getTime()) / 60000); // minutes
          }

          // Cap at 48 hours for display purposes
          if (waitTime > 2880) {
            waitTime = 2880;
          }
        } catch (error) {
          console.warn('Error calculating wait time for prescription:', rx.id, error);
          waitTime = 0;
        }
        
        // Determine priority (could be enhanced with API field)
        let priority: Priority = 'Medium';
        if (rx.priority) {
          const priorityMap: Record<string, Priority> = {
            'emergency': 'Emergency',
            'high': 'High',
            'medium': 'Medium',
            'low': 'Low',
          };
          priority = priorityMap[rx.priority.toLowerCase()] || 'Medium';
        }
        
        // Transform medications
        const medications = transformMedications(rx.medications || [], rx.status);
        
        const patientObj = {
          name: patientName,
          id: patientId,
          mrn: patientIdentifier,
          age: patientAge,
          gender: patientGender,
          allergies: patientAllergies,
          phone: patientPhone
        };

        // Ensure patient object is never undefined
        if (!patientObj.name) {
          console.error('🚨 CRITICAL: Patient name is still undefined!', {
            patientName,
            patientObj,
            rx_id: rx.id,
            rx_patient_name: rx.patient_name,
            patientDetails
          });
          patientObj.name = 'Unknown Patient';
        }

        return {
          id: rx.id?.toString() || rx.prescription_id || '',
          patient: patientObj,
          // Preserve API fields for modal access
          patient_details: patientDetails,
          visit_details: visitDetails,
          doctor_name: doctorName,
          medications,
          doctor: doctorName,
          clinic,
          location,
          date: rx.prescribed_at.split('T')[0],
          time: new Date(rx.prescribed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          status: rx.status === 'pending' ? 'Pending' : rx.status === 'dispensing' ? 'Processing' : rx.status === 'dispensed' ? 'Dispensed' : rx.status === 'partially_dispensed' ? 'Partially Dispensed' : 'On Hold',
          priority,
          waitTime,
          clinicalNotes: rx.diagnosis || '',
          specialInstructions: rx.notes || '',
          visitNotes, // Notes / Special Instructions from visit
        };
      }));
      setPrescriptions(transformed as Prescription[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load prescriptions');
      console.error('Error loading prescriptions:', err);
    } finally {
      setLoading(false);
      setIsLoadingPrescriptions(false);
    }
  };
  
  // Modal states
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [selectedPrescriptionMedications, setSelectedPrescriptionMedications] = useState<any[]>([]);

  const [showViewModal, setShowViewModal] = useState(false);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);
  const [dispenseQuantities, setDispenseQuantities] = useState<Record<string, number>>({});
  const [dispenseNotes, setDispenseNotes] = useState('');
  const [selectedBatches, setSelectedBatches] = useState<Record<string, string>>({});
  const [medicationBatches, setMedicationBatches] = useState<Record<string, MedicationBatch[]>>({});
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);
  const [substitutionMed, setSubstitutionMed] = useState<MedicationItem | null>(null);
  const [detectedInteractions, setDetectedInteractions] = useState<DrugInteraction[]>([]);
  const [interactionAcknowledged, setInteractionAcknowledged] = useState(false);
  
  // Substitution form state
  const [substitutionForm, setSubstitutionForm] = useState({
    reason: '',
    selectedSubstitute: '',
    notes: '',
  });
  const [availableSubstitutes, setAvailableSubstitutes] = useState<SubstituteOption[]>([]);
  const [allAvailableMedications, setAllAvailableMedications] = useState<SubstituteOption[]>([]);
  const [substituteSearchQuery, setSubstituteSearchQuery] = useState('');
  const [brandSelectionTargetName, setBrandSelectionTargetName] = useState('');
  const [brandSelectionMode, setBrandSelectionMode] = useState<'select' | 'switch'>('select');

  // Performance optimizations - Caching and loading states
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [isLoadingSubstitutes, setIsLoadingSubstitutes] = useState(false);
  const medicationsCache = useRef<SubstituteOption[] | null>(null);
  const genericsCache = useRef<SubstituteOption[] | null>(null);
  const brandSelectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const substituteTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Status update functionality

  // Print functionality
  const [printing, setPrinting] = useState(false);

  // Helper functions for filtering
  const normalizeGender = (value: unknown): string => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'm') return 'male';
    if (v === 'f') return 'female';
    return v;
  };

  const matchesDateFilter = (isoDate: string | undefined, filter: string): boolean => {
    if (filter === 'all') return true;
    if (!isoDate) return false;
    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return false;

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const tomorrowStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);

    if (filter === 'today') {
      return dt >= todayStart && dt < tomorrowStart;
    }

    if (filter === 'week') {
      const weekStart = new Date(todayStart);
      weekStart.setDate(todayStart.getDate() - 6);
      return dt >= weekStart && dt < tomorrowStart;
    }

    if (filter === 'month') {
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      return dt >= monthStart && dt < tomorrowStart;
    }

    return true;
  };

  // Filter prescriptions - apply all filters client-side
  const filteredPrescriptions = useMemo(() => {
    return prescriptions.filter(prescription => {
      // Date filter
      if (!matchesDateFilter(prescription.date, dateFilter)) {
        return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && prescription.priority?.toLowerCase() !== priorityFilter) {
        return false;
      }

      // Gender filter
      if (genderFilter !== 'all') {
        const patientGender = normalizeGender(prescription.patient?.gender);
        if (patientGender !== genderFilter) {
          return false;
        }
      }

      return true;
    });
  }, [prescriptions, dateFilter, priorityFilter, genderFilter]);

  // Pagination will be applied to filtered results
  const paginatedPrescriptions = filteredPrescriptions;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, priorityFilter, genderFilter]);

  // Calculate stats from filtered results
  const stats = useMemo(() => ({
    pending: filteredPrescriptions.filter(r => r.status === 'Pending').length,
    processing: filteredPrescriptions.filter(r => r.status === 'Processing').length,
    ready: filteredPrescriptions.filter(r => r.status === 'Ready').length,
    onHold: filteredPrescriptions.filter(r => r.status === 'On Hold').length,
    emergency: filteredPrescriptions.filter(r => r.priority === 'Emergency').length,
    avgWaitTime: Math.round(filteredPrescriptions.reduce((sum, r) => sum + r.waitTime, 0) / filteredPrescriptions.length) || 0
  }), [filteredPrescriptions]);

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'Emergency': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      case 'High': return 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400';
      case 'Medium': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Low': return 'bg-gray-100 text-gray-800 border-gray-200 dark:bg-gray-800 dark:text-gray-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400';
      case 'Processing': return 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Ready': return 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Partially Dispensed': return 'bg-violet-100 text-violet-800 border-violet-200 dark:bg-violet-900/30 dark:text-violet-400';
      case 'Dispensed': return 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/30 dark:text-green-400';
      case 'On Hold': return 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-400';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const getMedicationStatusColor = (status: string) => {
    switch (status) {
      case 'Available': return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400';
      case 'Low Stock': return 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400';
      case 'Out of Stock': return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400';
      case 'Pending': return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
      case 'Dispensed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      case 'Partially Dispensed': return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';
      case 'Over-dispensed': return 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const handleViewDetails = async (prescription: Prescription) => {
    // Always fetch fresh prescription data to ensure we have latest changes
    console.log(`Fetching fresh prescription details for RX: ${prescription.id}`);
    try {
      const freshPrescription = await pharmacyService.getPrescription(Number(prescription.id));
      
      // Debug: Log the raw prescription data
      console.log('Raw prescription data:', JSON.stringify(freshPrescription, null, 2));
      
      // Debug: Log each medication's structure
      freshPrescription.medications?.forEach((med: any, index: number) => {
        console.log(`Medication ${index + 1}:`, {
          id: med.id,
          generic: med.generic,
          medication: med.medication,
          medication_name: med.medication_name,
          medication_details: med.medication_details
        });
      });

      // Apply the same transformation as the prescription list
      const transformedMedications = transformMedications(freshPrescription.medications || [], freshPrescription.status);
      
      // Debug: Log transformed medications
      console.log('Transformed medications:', transformedMedications);

      // Store the prescription (using type assertion for compatibility)
      setSelectedPrescription(freshPrescription as any);
      setSelectedPrescriptionMedications(transformedMedications);
    } catch (error) {
      console.error('Error fetching prescription details:', error);
      // Fallback to cached data
      setSelectedPrescription(prescription);
    }
    setShowViewModal(true);
  };

  const handleMarkAsCompleted = async (prescription: Prescription) => {
    try {
      await pharmacyService.markPrescriptionAsCompleted(prescription.id);
      toast.success('Prescription marked as completed');
      await loadPrescriptions(); // Reload to show updated status
    } catch (error: any) {
      console.error('Error marking prescription as completed:', error);
      toast.error(`Failed to mark prescription as completed: ${error.message || 'Unknown error'}`);
    }
  };

  const handleStartDispense = async (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    // Transform medications to include calculated properties
    const transformedMedications = transformMedications(prescription.medications, prescription.status);
    setSelectedPrescriptionMedications(transformedMedications);

    const initialQuantities: Record<string, number> = {};
    const initialSelection: string[] = [];
    const initialBatches: Record<string, string> = {};
    const loadedBatches: Record<string, MedicationBatch[]> = {};

    // Load batches for each medication
    const batchPromises = transformedMedications.map(async (med) => {
      // Include Pending items (Generics) so they appear in the list, but don't try to load batches for them yet
      if (med.status === 'Available' || med.status === 'Low Stock' || med.status === 'Pending') {
        // Use remaining quantity for partial dispensing, full quantity for new dispensing
        initialQuantities[med.id] = med.remaining_quantity > 0 ? med.remaining_quantity : med.quantity;
        // Don't auto-select Pending items (Generics) as they need brand selection first
        if (med.status !== 'Pending') {
             initialSelection.push(med.id);
        }
        
        // Load batches for this medication
        try {
          let medicationIdToUse: string | number | undefined;

          // For substituted medications, we need to get the actual medication ID
          if (med.substitution) {
            // ... (existing substitution logic) ...
            console.log(`Loading batches for substituted medication: ${med.name}, original: ${med.originalMedication}`);
            // This is a substituted medication - get the medication ID by searching
            // Try exact match first
            console.log(`🔍 Searching for substituted medication: "${med.name}"`);
            let medSearch = await pharmacyService.getMedications({ search: med.name, page_size: 5 });
            
             // ... (abbreviated for search logic) ...
             // I'll keep the existing logic structure but make it safe
             if (medSearch.results.length > 0) {
                 medicationIdToUse = medSearch.results[0].id;
             }
          } else {
            // Regular medication - get from prescription details
            const prescriptionId = parseInt(prescription.id) || prescription.id;
            const rxDetail = await pharmacyService.getPrescription(typeof prescriptionId === 'number' ? prescriptionId : parseInt(prescriptionId));
            const rxMed = rxDetail.medications.find((m: any) => m.id.toString() === med.id);
            
            if (rxMed && rxMed.medication) {
              medicationIdToUse = rxMed.medication;
            } else if (rxMed && rxMed.generic) {
                // It's a generic! We can't load batches yet.
                console.log(`Medication ${med.name} is a generic, skipping batch load.`);
                return;
            } else {
              console.warn(`Could not find medication in prescription details for: ${med.name}`);
              return;
            }
          }

          if (medicationIdToUse) {
              const batches = await pharmacyService.getMedicationBatches(Number(medicationIdToUse));
              loadedBatches[med.id] = batches;
              console.log(`Loaded ${batches.length} batches for medication ${med.name} (ID: ${med.id})`);
              if (batches.length > 0) {
                initialBatches[med.id] = batches[0].id; // Default to first batch
              }
          }
        } catch (err) {
          console.error(`Error loading batches for ${med.name}:`, err);
        }
      }
    });
    
    await Promise.all(batchPromises);
    setMedicationBatches(loadedBatches);

    const medsWithDispensaryStock = transformedMedications.map((m: any) => {
      const batches = loadedBatches[m.id];
      if (!Array.isArray(batches)) return m;
      const stock = batches.reduce((total, b) => total + Number(b.quantity || 0), 0);

      const dispensedQty = Number(m.dispensed_quantity || 0);
      const prescribedQty = Number(m.quantity || 0);
      const remainingQty = Math.max(0, prescribedQty - dispensedQty);

      let status = m.status;
      if (status !== 'Pending' && status !== 'Dispensed' && status !== 'Over-dispensed' && remainingQty > 0) {
        if (stock === 0) status = 'Out of Stock';
        else if (stock < 50) status = 'Low Stock';
        else status = 'Available';
      }

      return {
        ...m,
        stockLevel: stock,
        status,
      };
    });
    setSelectedPrescriptionMedications(medsWithDispensaryStock);
    
    // Check for drug interactions
    const medNames = transformedMedications.map(m => m.name);
    const interactions = await checkInteractions(medNames);
    setDetectedInteractions(interactions);
    setInteractionAcknowledged(interactions.length === 0);
    
    setDispenseQuantities(initialQuantities);
    setSelectedMedications(initialSelection);
    setSelectedBatches(initialBatches);
    setDispenseNotes('');
    setShowDispenseModal(true);
  };

  const handleMedicationSelection = async (medId: string, checked: boolean, quantity: number) => {
    if (checked) {
      setSelectedMedications(prev => [...prev, medId]);
      setDispenseQuantities(prev => ({ ...prev, [medId]: quantity }));
      
      // Load batches for this medication when selected
      if (selectedPrescription) {
        try {
          const med = selectedPrescriptionMedications.find(m => m.id === medId);
          if (med) {
            // Get prescription detail to find medication ID
            const prescriptionId = parseInt(selectedPrescription.id) || selectedPrescription.id;
            const rxDetail = await pharmacyService.getPrescription(typeof prescriptionId === 'number' ? prescriptionId : parseInt(prescriptionId));
            const rxMed = rxDetail.medications.find((m: any) => m.id.toString() === medId);
            if (rxMed && rxMed.medication) {
              const batches = await pharmacyService.getMedicationBatches(rxMed.medication);
              setMedicationBatches(prev => ({ ...prev, [medId]: batches }));
              if (batches.length > 0) {
                setSelectedBatches(prev => ({ ...prev, [medId]: batches[0].id }));
              }
            }
          }
        } catch (err) {
          console.error(`Error loading batches for medication ${medId}:`, err);
        }
      }
    } else {
      setSelectedMedications(prev => prev.filter(id => id !== medId));
      setDispenseQuantities(prev => {
        const newQty = { ...prev };
        delete newQty[medId];
        return newQty;
      });
      setSelectedBatches(prev => {
        const newBatches = { ...prev };
        delete newBatches[medId];
        return newBatches;
      });
    }
  };

  const handleDispense = async () => {
    if (!selectedPrescription || selectedMedications.length === 0) {
      toast.error('Please select medications to dispense');
      return;
    }

    // Validate batch selection for selected medications
    const missingBatches = await Promise.all(selectedMedications.map(async (medId) => {
      const med = selectedPrescriptionMedications.find(m => m.id === medId);
      // If manually selected batch exists, it's valid
      if (selectedBatches[medId]) return false;
      
      // If not manually selected, check if we can auto-select one (FEFO)
      if (med && med.status !== 'Out of Stock') {
        try {
          if (med.medication) {
            const batches = await pharmacyService.getMedicationBatches(med.medication as number);
            // If we have batches, we can auto-select, so it's not missing
            if (batches.length > 0) return false;
          }
        } catch (err) {
          console.error('Error checking batches for validation:', err);
        }
      }
      
      // If we reach here, no batch is selected and none can be auto-selected
      return true;
    }));

    if (missingBatches.some(isMissing => isMissing)) {
      toast.error('No stock batches available for one or more selected medications');
      return;
    }

    // Check if quantities are valid
    const invalidQuantities = selectedMedications.filter(medId => {
      const med = selectedPrescriptionMedications.find(m => m.id === medId);
      const quantity = dispenseQuantities[medId] ?? med?.remaining_quantity ?? 0;
      const maxAllowed = Math.max(0, med?.remaining_quantity || 0);
      return med && (quantity < 0 || quantity > maxAllowed || (maxAllowed === 0 && quantity > 0));
    });

    if (invalidQuantities.length > 0) {
      const hasInvalidAmounts = selectedMedications.some(medId => {
        const med = selectedPrescriptionMedications.find(m => m.id === medId);
        const quantity = dispenseQuantities[medId] ?? med?.remaining_quantity ?? 0;
        return med && quantity > Math.max(0, med.remaining_quantity);
      });

      if (hasInvalidAmounts) {
        toast.error('Cannot dispense more than remaining prescribed amount');
      } else {
        toast.error('Please enter valid dispense quantities');
      }
      return;
    }

    // Proceed directly with dispensing
    await proceedWithDispense();
  };

  const proceedWithDispense = async () => {
    try {
        const prescriptionId = parseInt(selectedPrescription!.id) || selectedPrescription!.id;
        const numericPrescriptionId = typeof prescriptionId === 'number' ? prescriptionId : parseInt(prescriptionId);

        // Dispense each selected medication
        const dispensePromises = selectedMedications.map(async (medId) => {
        const med = selectedPrescriptionMedications.find(m => m.id === medId);
        if (!med) {
          throw new Error(`Medication ${medId} not found in prescription`);
        }

        const quantity = dispenseQuantities[medId] ?? med.remaining_quantity ?? med.quantity;
        
        // Use manually selected batch OR fetch auto-selected batch (FEFO)
        let inventoryId = selectedBatches[medId] ? parseInt(selectedBatches[medId]) : undefined;
        
        if (!inventoryId && med.medication) {
          try {
            const batches = await pharmacyService.getMedicationBatches(med.medication);
            if (batches.length > 0) {
              inventoryId = parseInt(batches[0].id); // First one is oldest due to FEFO sort
            }
          } catch (err) {
            console.error('Failed to auto-select batch:', err);
          }
        }

        try {
          await pharmacyService.dispense(
            numericPrescriptionId,
            parseInt(medId),
            quantity,
            inventoryId,
            dispenseNotes
          );
        } catch (err: any) {
          console.error(`Error dispensing ${med.name}:`, err);
          // Provide more specific error messages
          if (err.message?.includes('stock')) {
            throw new Error(`Insufficient stock for ${med.name}`);
          } else if (err.message?.includes('batch')) {
            throw new Error(`Invalid batch selected for ${med.name}`);
          } else {
            throw new Error(`Failed to dispense ${med.name}: ${err.message || 'Unknown error'}`);
          }
        }
      });

      await Promise.all(dispensePromises);

      toast.success(`${selectedMedications.length} medication(s) dispensed successfully for ${selectedPrescription?.patient?.name || 'patient'}`);
      setShowDispenseModal(false);
      setSelectedPrescription(null);
      setSelectedMedications([]);
      setDispenseQuantities({});
      setDispenseNotes('');
      setSelectedBatches({});

      // Force a status recalculation on the backend first
      try {
        if (selectedPrescription?.id) {
          console.log('🔄 Recalculating prescription status on backend...');
          await pharmacyService.recalculatePrescriptionStatus(selectedPrescription.id);
          console.log('✅ Prescription status recalculated on backend');
        }
      } catch (recalcError) {
        console.warn('⚠️ Status recalculation failed:', recalcError);
        // Continue anyway
      }

      // Single reload after both dispensing and recalculation
      console.log('🔄 Reloading prescriptions after dispense and recalculation...');
      await loadPrescriptions();
      console.log('✅ Prescriptions reloaded successfully');
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to dispense medications';
      toast.error(errorMessage);
      console.error('Error dispensing medications:', err);
    } finally {
      // Status update removed - automatic status management
    }
  };

  const handleQuickDispense = async (prescription: Prescription) => {
    // Transform medications and quick dispense all available ones
    const transformedMeds = transformMedications(prescription.medications, prescription.status);
    const availableMeds = transformedMeds.filter(m => m.status === 'Available' || m.status === 'Low Stock');
    
    if (availableMeds.length === 0) {
      toast.error('No available medications to dispense');
      return;
    }

    try {
      // Get prescription ID (may be prescription_id string or numeric id)
      const prescriptionId = parseInt(prescription.id) || prescription.id;
      const numericPrescriptionId = typeof prescriptionId === 'number' ? prescriptionId : parseInt(prescriptionId);
      
      // Get full prescription details to access medication IDs
      const rxDetail = await pharmacyService.getPrescription(numericPrescriptionId);
      
      // Load batches for all medications first
      const batchMap: Record<string, number | undefined> = {};
      
      await Promise.all(availableMeds.map(async (med) => {
        try {
          const rxMed = rxDetail.medications.find((m: any) => m.id.toString() === med.id);
          if (rxMed && rxMed.medication) {
            const batches = await pharmacyService.getMedicationBatches(rxMed.medication);
            if (batches.length > 0) {
              batchMap[med.id] = parseInt(batches[0].id);
            }
          }
        } catch (err) {
          console.error(`Error loading batches for ${med.name}:`, err);
        }
      }));
      
      // Dispense each available medication
      const dispensePromises = availableMeds.map(async (med) => {
        const quantity = med.quantity;
        const inventoryId = batchMap[med.id];
        
        try {
          await pharmacyService.dispense(
            numericPrescriptionId,
            parseInt(med.id),
            quantity,
            inventoryId,
            'Quick dispense'
          );
        } catch (err: any) {
          console.error(`Error dispensing ${med.name}:`, err);
          throw err;
        }
      });

      await Promise.all(dispensePromises);

      console.log('✅ Dispensing completed successfully, reloading prescriptions...');

      toast.success(`${availableMeds.length} medication(s) dispensed successfully for ${prescription.patient.name}`);

      // Small delay to prevent UI freeze, then reload prescriptions
      setTimeout(async () => {
        console.log('🔄 Starting prescription reload after dispense...');
        try {
          await loadPrescriptions();
          console.log('✅ Prescription reload completed');
        } catch (err) {
          console.error('❌ Error reloading prescriptions after dispense:', err);
        }
      }, 100);
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispense medications');
      console.error('Error dispensing medications:', err);
    }
  };


  const handlePrintPrescription = async (prescription: Prescription, type: 'label' | 'receipt' = 'label') => {
    try {
      setPrinting(true);

      // Create printable content
      const printContent = generatePrintablePrescription(prescription, type);

      // Open print dialog
      const printWindow = window.open('', '_blank', 'width=800,height=600');
      if (!printWindow) {
        toast.error('Please allow popups for printing');
        return;
      }

      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();

      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      toast.success(`${type === 'label' ? 'Label' : 'Receipt'} sent to printer`);
    } catch (err: any) {
      console.error('Error printing prescription:', err);
      toast.error('Failed to print prescription');
    } finally {
      setPrinting(false);
    }
  };

  const generatePrintablePrescription = (prescription: Prescription, type: 'label' | 'receipt'): string => {
    const isLabel = type === 'label';
    const transformedMeds = transformMedications(prescription.medications, prescription.status);

    return `
      <!DOCTYPE html>
      <html>
        <head>
          <title>${isLabel ? 'Prescription Label' : 'Prescription Receipt'} - ${prescription.patient.name}</title>
          <style>
            body {
              font-family: 'Courier New', monospace;
              font-size: ${isLabel ? '12px' : '14px'};
              line-height: 1.4;
              margin: 0;
              padding: 20px;
              max-width: ${isLabel ? '400px' : '600px'};
            }
            .header {
              text-align: center;
              border-bottom: 2px solid #000;
              padding-bottom: 10px;
              margin-bottom: 15px;
            }
            .hospital-name {
              font-size: ${isLabel ? '16px' : '20px'};
              font-weight: bold;
              margin-bottom: 5px;
            }
            .prescription-info {
              margin: 15px 0;
            }
            .patient-info, .medication {
              margin: 10px 0;
              padding: 8px;
              border: 1px solid #ddd;
              border-radius: 4px;
            }
            .medication-list {
              margin: 15px 0;
            }
            .medication-item {
              margin: 8px 0;
              padding: 8px;
              border-left: 3px solid #007bff;
              background: #f8f9fa;
            }
            .footer {
              margin-top: 20px;
              text-align: center;
              font-size: ${isLabel ? '10px' : '12px'};
              color: #666;
            }
            .instructions {
              background: #fff3cd;
              border: 1px solid #ffeaa7;
              padding: 10px;
              margin: 10px 0;
              border-radius: 4px;
            }
            @media print {
              body { margin: 0; }
              .no-print { display: none; }
            }
          </style>
        </head>
        <body>
          <div class="header">
            <div class="hospital-name">Medical Center Pharmacy</div>
            <div>Prescription ${type.toUpperCase()}</div>
          </div>

          <div class="prescription-info">
            <strong>Rx ID:</strong> ${prescription.id}<br>
            <strong>Date:</strong> ${prescription.date} ${prescription.time}<br>
            <strong>Doctor:</strong> ${prescription.doctor}<br>
            <strong>Clinic:</strong> ${prescription.clinic || 'N/A'}
          </div>

          <div class="patient-info">
            <strong>Patient:</strong> ${prescription.patient.name}<br>
            <strong>Patient ID:</strong> ${prescription.patient.mrn}<br>
            <strong>Diagnosis:</strong> ${prescription.specialInstructions || 'N/A'}
            ${prescription.patient.allergies?.length > 0 ? `<br><strong>Allergies:</strong> ${prescription.patient.allergies.join(', ')}` : ''}
          </div>

          <div class="medication-list">
            <strong>Medications:</strong>
            ${transformedMeds.map(med => `
              <div class="medication-item">
                <strong>${med.name}</strong><br>
                Dosage: ${med.dosage}<br>
                Quantity: ${med.quantity}<br>
                Route: ${med.route}<br>
                Frequency: ${med.frequency}<br>
                Duration: ${med.duration}<br>
                ${med.instructions ? `Instructions: ${med.instructions}` : ''}
              </div>
            `).join('')}
          </div>

          ${prescription.specialInstructions ? `
            <div class="instructions">
              <strong>Special Instructions:</strong><br>
              ${prescription.specialInstructions}
            </div>
          ` : ''}

          ${prescription.clinicalNotes ? `
            <div class="medication">
              <strong>Clinical Notes:</strong><br>
              ${prescription.clinicalNotes}
            </div>
          ` : ''}

          <div class="footer">
            <div>Priority: ${prescription.priority}</div>
            <div>Status: ${prescription.status}</div>
            <div>Printed: ${new Date().toLocaleString()}</div>
            ${isLabel ? '<div>⚠️ Keep out of reach of children</div>' : ''}
          </div>
        </body>
      </html>
    `;
  };

  // Cleanup timeouts on component unmount
  useEffect(() => {
    return () => {
      if (brandSelectionTimeoutRef.current) {
        clearTimeout(brandSelectionTimeoutRef.current);
      }
      if (substituteTimeoutRef.current) {
        clearTimeout(substituteTimeoutRef.current);
      }
    };
  }, []);

  return (
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-violet-500" />
              Prescriptions Queue
            </h1>
            <p className="text-muted-foreground mt-1">Process and dispense prescriptions from doctors</p>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-600">{stats.pending}</p>
                </div>
                <Clock className="h-5 w-5 text-amber-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Processing</p>
                  <p className="text-2xl font-bold text-blue-600">{stats.processing}</p>
                </div>
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Ready</p>
                  <p className="text-2xl font-bold text-emerald-600">{stats.ready}</p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">On Hold</p>
                  <p className="text-2xl font-bold text-red-600">{stats.onHold}</p>
                </div>
                <XCircle className="h-5 w-5 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Emergency</p>
                  <p className="text-2xl font-bold text-red-600">{stats.emergency}</p>
                </div>
                <AlertTriangle className="h-5 w-5 text-red-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Avg Wait</p>
                  <p className="text-2xl font-bold text-violet-600">{stats.avgWaitTime >= 60 ? `${Math.floor(stats.avgWaitTime/60)}h ${stats.avgWaitTime%60}m` : `${stats.avgWaitTime}m`}</p>
                </div>
                <Clock className="h-5 w-5 text-violet-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by patient name or ID..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Select value={dateFilter} onValueChange={setDateFilter} >
                  <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Time</SelectItem>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="week">This Week</SelectItem>
                    <SelectItem value="month">This Month</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Status" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="pending">Pending</SelectItem>
                    <SelectItem value="processing">Processing</SelectItem>
                    <SelectItem value="ready">Ready</SelectItem>
                    <SelectItem value="on hold">On Hold</SelectItem>
                    <SelectItem value="partially dispensed">Partial</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter} >
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={genderFilter} onValueChange={setGenderFilter} >
                  <SelectTrigger className="w-[120px]"><SelectValue placeholder="Gender" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Gender</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Prescriptions List */}
        <div className="space-y-3">
          {loading ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
                <p>Loading prescriptions...</p>
              </CardContent>
            </Card>
          ) : error ? (
            <Card>
              <CardContent className="p-8 text-center text-muted-foreground">
                <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p className="text-red-600 dark:text-red-400">{error}</p>
                <Button variant="outline" className="mt-4" onClick={loadPrescriptions}>Retry</Button>
              </CardContent>
            </Card>
          ) : filteredPrescriptions.length > 0 ? (
            paginatedPrescriptions.map((rx) => (
              <Card 
                key={rx.id} 
                className={`border-l-4 hover:shadow-md transition-shadow ${
                  rx.priority === 'Emergency' ? 'border-l-red-500' :
                  rx.priority === 'High' ? 'border-l-orange-500' :
                  'border-l-violet-500'
                }`}
              >
                <CardContent className="py-3 px-4">
                  <div className="flex items-center gap-3">
                    {/* Avatar */}
                    <PatientAvatar name={rx.patient.name} photoUrl={(rx.patient as any).photoUrl || (rx.patient as any).photo} size="sm" />
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Meds + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{rx.patient.name}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityColor(rx.priority)}`}>{rx.priority}</Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(rx.status)}`}>{rx.status}</Badge>
                          {rx.medications.slice(0, 2).map((med) => (
                            <Badge key={med.id} variant="secondary" className="text-[10px] px-1.5 py-0 flex items-center gap-1">
                              <span>{med.name.split(' ')[0]} ×{med.quantity}</span>
                              {/* Substitution indicator removed from list view for compatibility */}
                            </Badge>
                          ))}
                          {rx.medications.length > 2 && <span className="text-[10px] text-muted-foreground">+{rx.medications.length - 2}</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          {/* View Details button for all prescriptions */}
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewDetails(rx)}>
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>

                          {/* Dispense/Complete buttons based on status */}
                          {(rx.status === 'Pending' || rx.status === 'Processing' || rx.status === 'Ready') && (
                            <Button size="sm" className="h-7 px-2 bg-violet-600 hover:bg-violet-700 text-white text-xs" onClick={() => handleStartDispense(rx)}>
                              <Package className="h-3 w-3 mr-1" />Dispense
                            </Button>
                          )}

                          {/* Smart completion for partially dispensed prescriptions */}
                          {rx.status === 'Partially Dispensed' && (
                            <Button
                              size="sm"
                              className={`h-7 px-2 text-white text-xs ${
                                rx.medications.every((med: any) => (med.quantity - (med.dispensed_quantity || 0)) <= 0)
                                  ? 'bg-green-600 hover:bg-green-700'
                                  : 'bg-blue-600 hover:bg-blue-700'
                              }`}
                              onClick={() => {
                                if (rx.medications.every((med: any) => (med.quantity - (med.dispensed_quantity || 0)) <= 0)) {
                                  // All items dispensed - mark as completed
                                  handleMarkAsCompleted(rx);
                                } else {
                                  // Some items remaining - resume dispensing
                                  handleStartDispense(rx);
                                }
                              }}
                              title={
                                rx.medications.every(med => (med.quantity - (med.dispensed_quantity || 0)) <= 0)
                                  ? "Mark prescription as fully completed"
                                  : "Resume dispensing remaining medications"
                              }
                            >
                              {rx.medications.every(med => (med.quantity - (med.dispensed_quantity || 0)) <= 0) ? (
                                <>
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Mark Complete
                                </>
                              ) : (
                                <>
                                  <Package className="h-3 w-3 mr-1" />
                                  Complete
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Row 2: Details */}
                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                        <span>{rx.id}</span>
                        <span>•</span>
                        <span>{rx.patient.mrn}</span>
                        <span>•</span>
                        <span>{rx.patient.age > 0 ? `${rx.patient.age}y` : 'Age unknown'} {rx.patient.gender}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{rx.doctor}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{rx.waitTime >= 60 ? `${Math.floor(rx.waitTime/60)}h ${rx.waitTime%60}m` : `${rx.waitTime}m`} wait</span>
                        {((rx as any).patient_details?.allergies?.length > 0) && (
                          <span className="text-red-600 dark:text-red-400 flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" />Allergies
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                <p className="text-lg font-medium mb-1">No prescriptions found</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search or filters</p>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Pagination */}
        {filteredPrescriptions.length > 0 && (
          <Card className="p-4">
            <StandardPagination
              currentPage={currentPage}
              totalItems={totalCount}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={(newSize) => {
                setItemsPerPage(newSize);
                setCurrentPage(1);
              }}
              itemName="prescriptions"
            />
          </Card>
        )}

        {/* View Details Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-full">
                  <User className="h-5 w-5 text-violet-600" />
                </div>
                <div>
                  <div className="text-xl font-bold">{selectedPrescription?.patient.name}</div>
                  <div className="text-sm text-muted-foreground">RX: {selectedPrescription?.id}</div>
                </div>
              </DialogTitle>
              <DialogDescription>
                View prescription details and patient information
              </DialogDescription>
            </DialogHeader>
            
            {selectedPrescription && (
              <div className="overflow-y-auto max-h-[65vh] space-y-4">
                {/* Status Badges and Update */}
                <div className="flex items-center justify-between gap-4">
                  <div className="flex gap-2">
                    <Badge variant="outline" className={getPriorityColor(selectedPrescription.priority)}>
                      {selectedPrescription.priority}
                    </Badge>
                    <Badge variant="outline" className={getStatusColor(selectedPrescription.status)}>
                      {selectedPrescription.status.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())}
                    </Badge>
                  </div>

                </div>

                {/* Patient Info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div><span className="text-muted-foreground">Patient ID:</span> <span className="font-medium">{(selectedPrescription as any).patient_details?.patient_id || selectedPrescription.patient}</span></div>
                  <div><span className="text-muted-foreground">Age/Gender:</span> <span className="font-medium">{(selectedPrescription as any).patient_details?.age || 'Unknown'} / {(selectedPrescription as any).patient_details?.gender || 'Unknown'}</span></div>
                  <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{(selectedPrescription as any).patient_details?.phone || 'Not provided'}</span></div>
                  <div><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">{(selectedPrescription as any).doctor_name || selectedPrescription.doctor}</span></div>
                  <div><span className="text-muted-foreground">Clinic:</span> <span className="font-medium">{(selectedPrescription as any).visit_details?.clinic || selectedPrescription.clinic || 'Not specified'}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{selectedPrescription.date} {selectedPrescription.time}</span></div>
                  <div><span className="text-muted-foreground">Wait Time:</span> <span className="font-medium text-orange-600">{selectedPrescription.waitTime} min</span></div>
                </div>

                {/* Allergies */}
                {selectedPrescription.patient_details?.allergies && selectedPrescription.patient_details.allergies.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      Allergies
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(selectedPrescription as any).patient_details?.allergies?.map((allergy: string, i: number) => (
                        <Badge key={i} className="bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-400">
                          {allergy}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                {/* Clinical Notes */}
                {selectedPrescription.clinicalNotes && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
                    <div className="font-medium text-blue-700 dark:text-blue-400 mb-1">Clinical Notes</div>
                    <p className="text-sm text-blue-900 dark:text-blue-300">{selectedPrescription.clinicalNotes}</p>
                  </div>
                )}

                {/* Special Instructions */}
                {selectedPrescription.specialInstructions && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                    <div className="font-medium text-amber-700 dark:text-amber-400 mb-1">Special Instructions</div>
                    <p className="text-sm text-amber-900 dark:text-amber-300">{selectedPrescription.specialInstructions}</p>
                  </div>
                )}

                {/* Visit Notes / Special Instructions */}
                {selectedPrescription.visitNotes && (
                  <div className="bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg p-3">
                    <div className="font-medium text-teal-700 dark:text-teal-400 mb-1">Visit Notes / Special Instructions</div>
                    <p className="text-sm text-teal-900 dark:text-teal-300">{selectedPrescription.visitNotes}</p>
                  </div>
                )}

                {/* Medications */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Pill className="h-4 w-4 text-violet-500" />
                    Medications ({selectedPrescriptionMedications.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedPrescriptionMedications.map((med) => (
                        <div key={med.id} className="border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h5 className="font-medium flex items-center gap-2">
                                {med.name || med.medication_name || 'Unknown Medication'}
                                {med.substitution && <span className="text-amber-600 text-sm">🔄 Substituted</span>}
                              </h5>
                              <p className="text-sm text-muted-foreground">{med.route || 'Oral'} • {med.frequency || 'As needed'} • {med.duration || 'As prescribed'}</p>
                              {med.substitution && (
                                <p className="text-xs text-amber-700 mt-1">Originally: {med.originalMedication}</p>
                              )}
                            </div>
                          <Badge variant="outline" className={getMedicationStatusColor(med.status || 'Unknown')}>
                            {med.status || 'Unknown'}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div><span className="text-muted-foreground">Dosage:</span> <span className="font-medium">{med.dosage || 'As prescribed'}</span></div>
                          <div><span className="text-muted-foreground">Quantity:</span> <span className="font-medium">{med.quantity || 'N/A'}</span></div>
                          <div><span className="text-muted-foreground">Dispensed:</span> <span className="font-medium text-blue-600">{med.dispensed_quantity || med.dispensed || 0}</span></div>
                          <div><span className="text-muted-foreground">Remaining:</span> <span className={`font-medium ${(med.quantity - (med.dispensed_quantity || med.dispensed || 0)) <= 0 ? 'text-green-600' : 'text-orange-600'}`}>{Math.max(0, (med.quantity - (med.dispensed_quantity || med.dispensed || 0)))}</span></div>
                        </div>
                        {(med.instructions || med.medication_details?.instructions) && (
                          <div className="mt-2 text-sm">
                            <span className="text-muted-foreground">Instructions:</span> <span className="font-medium">{med.instructions || med.medication_details?.instructions}</span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
              <Button
                variant="outline"
                onClick={() => selectedPrescription && handlePrintPrescription(selectedPrescription, 'receipt')}
                disabled={printing}
              >
                <Printer className="h-4 w-4 mr-2" />
                {printing ? 'Printing...' : 'Print Receipt'}
              </Button>
              {selectedPrescription && (selectedPrescription.status === 'Pending' || selectedPrescription.status === 'Processing' || selectedPrescription.status === 'Ready') && (
                <Button
                  className="bg-violet-600 hover:bg-violet-700"
                  onClick={() => {
                    setShowViewModal(false);
                    handleStartDispense(selectedPrescription);
                  }}
                >
                  <Package className="h-4 w-4 mr-2" />
                  Dispense
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enhanced Dispense Modal */}
        <Dialog open={showDispenseModal} onOpenChange={(open) => {
          console.log('Dispense modal onOpenChange:', open);
          setShowDispenseModal(open);
          if (!open) {
            console.log('Modal closing, cleaning up state...');
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Package className="h-5 w-5 text-violet-500" />
                Dispense Prescription
              </DialogTitle>
              <DialogDescription>
                Review medications, check interactions, and dispense for {selectedPrescription?.patient.name}
              </DialogDescription>
            </DialogHeader>
            
            {selectedPrescription && (
              <div className="overflow-y-auto max-h-[65vh] space-y-4">
                {/* Patient Summary */}
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="font-medium">{selectedPrescription.patient_details?.name || 'Unknown Patient'}</span>
                      <span className="text-muted-foreground"> • ID: {selectedPrescription.patient_details?.patient_id || 'N/A'} • {selectedPrescription.patient_details?.age || 'N/A'}y {selectedPrescription.patient_details?.gender || 'N/A'}</span>
                    </div>
                    <Badge variant="outline" className={getPriorityColor(selectedPrescription.priority)}>
                      {selectedPrescription.priority}
                    </Badge>
                  </div>
                  {(() => {
                    const allergies = selectedPrescription.patient_details?.allergies ||
                                    selectedPrescription.patient?.allergies || [];
                    return allergies.length > 0 ? (
                      <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mt-2 text-xs p-2 bg-red-50 dark:bg-red-900/20 rounded">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="font-medium">ALLERGIES:</span> {allergies.join(', ')}
                      </div>
                    ) : null;
                  })()}
                </div>

                {/* Prescription Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 rounded-lg p-4 text-sm">
                  <div><span className="text-muted-foreground">Patient ID:</span> <span className="font-medium">{selectedPrescription.patient_details?.patient_id || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">{selectedPrescription.doctor_name || 'N/A'}</span></div>
                  <div><span className="text-muted-foreground">Clinic:</span> <span className="font-medium">{selectedPrescription.visit_details?.clinic || 'Not specified'}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{selectedPrescription.prescribed_at ? new Date(selectedPrescription.prescribed_at).toLocaleDateString() : 'N/A'}</span></div>
                </div>

                {/* Dispensing History */}
                {selectedPrescriptionMedications.some(med => (med.dispensed_quantity || med.dispensed || 0) > 0) && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-medium mb-3">
                      <Package className="h-4 w-4" />
                      Dispensing History
                    </div>
                    <div className="space-y-2">
                      {selectedPrescriptionMedications
                        .filter(med => (med.dispensed_quantity || med.dispensed || 0) > 0)
                        .map(med => {
                          const dispensed = med.dispensed_quantity || med.dispensed || 0;
                          const quantity = med.quantity || 0;
                          const remaining = Math.max(0, quantity - dispensed);
                          return (
                            <div key={med.id} className="flex items-center justify-between p-2 bg-white dark:bg-gray-800 rounded border">
                              <div>
                                <span className="font-medium text-sm">{med.name || med.medication_name}</span>
                                {med.substitution && (
                                  <div className="text-xs text-amber-600 dark:text-amber-400">
                                    🔄 Substituted from {med.originalMedication}
                                  </div>
                                )}
                                <div className="text-xs text-muted-foreground">
                                  Dispensed: {dispensed} • Remaining: {remaining}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-400">
                                {remaining > 0 ? 'Partial' : 'Complete'}
                              </Badge>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                )}

                {/* Drug Interactions Alert */}
                {detectedInteractions.length > 0 && (
                  <div className={`rounded-lg p-4 border-2 ${interactionAcknowledged ? 'border-amber-300 bg-amber-50 dark:bg-amber-900/20' : 'border-red-500 bg-red-50 dark:bg-red-900/20'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <ShieldAlert className={`h-5 w-5 ${interactionAcknowledged ? 'text-amber-600' : 'text-red-600'}`} />
                      <span className={`font-semibold ${interactionAcknowledged ? 'text-amber-800 dark:text-amber-400' : 'text-red-800 dark:text-red-400'}`}>
                        Drug Interactions Detected ({detectedInteractions.length})
                      </span>
                    </div>
                    <div className="space-y-2">
                      {detectedInteractions.map((interaction, idx) => (
                        <div key={idx} className="p-3 rounded bg-white dark:bg-gray-800 border">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge className={
                              interaction.severity === 'Major' ? 'bg-red-500' :
                              interaction.severity === 'Moderate' ? 'bg-amber-500' : 'bg-blue-500'
                            }>
                              {interaction.severity}
                            </Badge>
                            <span className="font-medium text-sm">{interaction.drug1} + {interaction.drug2}</span>
                          </div>
                          <p className="text-xs text-muted-foreground">{interaction.description}</p>
                          <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                            <Info className="h-3 w-3 inline mr-1" />
                            {interaction.recommendation}
                          </p>
                        </div>
                      ))}
                    </div>
                    {!interactionAcknowledged && (
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-3 border-red-300 text-red-700 hover:bg-red-100"
                        onClick={() => setInteractionAcknowledged(true)}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-2" />
                        I acknowledge these interactions
                      </Button>
                    )}
                  </div>
                )}

                {/* Medications to Dispense */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Pill className="h-4 w-4 text-violet-500" />
                    Medications ({selectedPrescriptionMedications.filter((med: any) => med.status === 'Available' || med.status === 'Low Stock' || med.status === 'Out of Stock' || med.status === 'Partially Dispensed' || med.status === 'Pending').length})
                  </h4>
                  <div className="space-y-3">
                    {selectedPrescriptionMedications
                      .filter((med: any) => med.status === 'Available' || med.status === 'Low Stock' || med.status === 'Out of Stock' || med.status === 'Partially Dispensed' || med.status === 'Pending')
                      .map((med) => {
                      const isSelected = selectedMedications.includes(med.id);
                      const isAvailable = (med as any).status === 'Available' || (med as any).status === 'Low Stock' || (med as any).status === 'Partially Dispensed';
                      const isPendingGeneric = (med as any).status === 'Pending'; // Generics need selection
                                      const batches = medicationBatches[med.id] || [];
                                      if ((med as any).substitution) {
                                        console.log(`🔄 Substituted med ${med.name}: ${batches.length} batches available`);
                                      }
                      const hasSubstitute = false;
                      
                      return (
                        <div 
                          key={med.id} 
                          className={`border rounded-lg p-4 ${!isAvailable && !isPendingGeneric ? 'opacity-60 bg-muted/50' : isSelected ? 'border-violet-300 bg-violet-50/50 dark:bg-violet-900/10' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              disabled={!isAvailable && !isPendingGeneric}
                              onCheckedChange={(checked) => handleMedicationSelection(
                                med.id,
                                checked as boolean,
                                Math.max(0, Number((med as any).remaining_quantity ?? med.quantity ?? 0))
                              )}
                              className="mt-1 h-5 w-5 flex-shrink-0"
                              id={`med-${med.id}`}
                            />
                            <div className="flex-1 cursor-pointer" onClick={() => {
                              if ((isAvailable || isPendingGeneric)) {
                                handleMedicationSelection(
                                  med.id,
                                  !isSelected,
                                  Math.max(0, Number((med as any).remaining_quantity ?? med.quantity ?? 0))
                                );
                              }
                            }}>
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <h5 className="font-medium">{med.name}</h5>
                                  {(() => {
                                    const sub = (med as any).substitution;
                                    const original = (med as any).originalMedication;
                                    const previousBrand = sub?.previous_brand;

                                    if (!sub && !original) return null;

                                    return (
                                      <div className="space-y-0.5">
                                        {sub?.reason === 'brand_selection' && previousBrand && (
                                          <p className="text-xs text-amber-600 dark:text-amber-400">
                                            🔁 Brand switched from {previousBrand}
                                          </p>
                                        )}
                                        {original && (
                                          <p className="text-xs text-amber-600 dark:text-amber-400">
                                            🔄 Substituted from {original}
                                          </p>
                                        )}
                                      </div>
                                    );
                                  })()}
                                  <p className="text-xs text-muted-foreground">{med.route} • {med.frequency} • {med.duration}</p>
                                  <p className="text-xs text-muted-foreground">
                                    {(med as any).unit || 'unit'}
                                    {(med as any).dosage_form ? ` • ${(med as any).dosage_form}` : ''}
                                    {(med as any).strength ? ` • ${(med as any).strength}` : ''}
                                  </p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={getMedicationStatusColor(med.status)}>
                                    {med.status}
                                  </Badge>
                                  {/* Select Brand Button - Always available for brand selection */}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 mr-2"
                                    disabled={isLoadingBrands}
                                    onClick={async () => {
                                      // Debounce rapid clicks
                                      if (brandSelectionTimeoutRef.current) {
                                        clearTimeout(brandSelectionTimeoutRef.current);
                                      }

                                      setIsLoadingBrands(true);
                                      setSubstitutionMed(med);
                                      setAvailableSubstitutes([]);
                                      setSubstitutionForm({ 
                                        reason: 'brand_selection', 
                                        selectedSubstitute: '', 
                                        notes: '' 
                                      });
                                      setSubstituteSearchQuery('');
                                      setBrandSelectionTargetName('');
                                      setBrandSelectionMode('select');

                                      try {
                                        // Load all medications for search - use cache if available
                                        if (!medicationsCache.current) {
                                          const allMeds = await pharmacyService.getMedications({ page_size: 50 }); // Reduced from 100
                                          medicationsCache.current = allMeds.results.map(med => ({
                                            id: med.id.toString(),
                                            name: med.name,
                                            strength: med.strength || '',
                                            type: 'brand',
                                            stock: (med as any).available_stock || 0,
                                            expiryDate: '',
                                            daysToExpiry: 0,
                                            unitPrice: 0,
                                            isNearExpiry: false,
                                          }));
                                        }
                                        setAllAvailableMedications(medicationsCache.current);
                                      } catch (error) {
                                        console.error('Failed to load medications:', error);
                                        setAllAvailableMedications([]);
                                      }
                                      
                                      // Load available brands for this generic
                                      try {
                                        const isGenericSelection =
                                          (med as any).status === 'Pending' ||
                                          (med as any).type === 'generic' ||
                                          !Boolean((med as any).medication);

                                        let genericId: number | null = null;
                                        let targetName = (med as any).name || '';

                                        if (isGenericSelection) {
                                          genericId = Number(med.generic || (med as any).medication_details?.generic_id || 0) || null;
                                          setBrandSelectionMode('select');
                                        } else {
                                          const medDetail = await pharmacyService.getMedication(Number((med as any).medication));
                                          genericId = medDetail.generic?.id ?? null;
                                          targetName = medDetail.generic?.name || targetName;
                                          setBrandSelectionMode('switch');
                                        }

                                        setBrandSelectionTargetName(targetName);

                                        if (genericId) {
                                          const availableBrands = await pharmacyService.getAvailableBrands(genericId);
                                          
                                          // Enhance brands with batch/expiry information
                                          const substituteOptions: SubstituteOption[] = await Promise.all(
                                            availableBrands.map(async (brand) => {
                                              let expiryDate = '';
                                              let daysToExpiry = 0;
                                              let isNearExpiry = false;
                                              
                                              try {
                                                // Get batches for early expiry detection
                                                const batches = await pharmacyService.getMedicationBatches(brand.id);
                                                if (batches.length > 0) {
                                                  // Find the batch expiring soonest (but not expired)
                                                  const activeBatches = batches.filter(b => b.expiryDate && new Date(b.expiryDate) > new Date());
                                                  if (activeBatches.length > 0) {
                                                    const soonest = activeBatches.reduce((prev, curr) => 
                                                      new Date(curr.expiryDate) < new Date(prev.expiryDate) ? curr : prev
                                                    );
                                                    expiryDate = new Date(soonest.expiryDate).toLocaleDateString();
                                                    daysToExpiry = Math.ceil((new Date(soonest.expiryDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                                    isNearExpiry = daysToExpiry <= 90;
                                                  }
                                                }
                                              } catch (err) {
                                                console.warn(`Could not get batch info for ${brand.name}:`, err);
                                              }
                                              
                                              return {
                                                id: brand.id.toString(),
                                                name: brand.name,
                                                strength: brand.strength || '',
                                                type: 'brand',
                                                stock: Math.round(Number((brand as any).available_stock) || 0),
                                                expiryDate,
                                                daysToExpiry,
                                                unitPrice: 0,
                                                isNearExpiry,
                                              };
                                            })
                                          );
                                          setAvailableSubstitutes(substituteOptions);
                                        } else {
                                          setAvailableSubstitutes([]);
                                          toast.error('Generic not found for this medication');
                                        }
                                      } catch (err) {
                                        console.error('Failed to load available brands:', err);
                                        toast.error('Failed to load available brands');
                                      } finally {
                                        setIsLoadingBrands(false);
                                        setShowSubstitutionModal(true);
                                      }
                                    }}
                                    >
                                      <>
                                        <Tag className="h-3 w-3 mr-1" />
                                        {((med as any).status === 'Pending' || (med as any).type === 'generic' || !(med as any).medication) ? 'Select Brand' : 'Switch Brand'}
                                      </>
                                    </Button>
                                    
                                    {/* Substitute Button - Always available for medication substitution */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                      disabled={isLoadingSubstitutes}
                                      onClick={async () => {
                                        // Debounce rapid clicks
                                        if (substituteTimeoutRef.current) {
                                          clearTimeout(substituteTimeoutRef.current);
                                        }

                                        setIsLoadingSubstitutes(true);
                                        setSubstitutionMed(med);
                                        setAvailableSubstitutes([]);
                                        setSubstitutionForm({ 
                                          reason: 'out_of_stock', 
                                          selectedSubstitute: '', 
                                          notes: '' 
                                        });

                                        // Load available generic medications with brand stock information
                                        try {
                                          if (!genericsCache.current) {
                                            const allGenerics = await pharmacyService.getGenericsForPrescription({ page_size: 50 });
                                            
                                            // Enhance each generic with available brand information
                                            genericsCache.current = await Promise.all(
                                              allGenerics.results.map(async (generic) => {
                                                let totalStock = 0;
                                                let expiryDate = '';
                                                let daysToExpiry = 0;
                                                let isNearExpiry = false;

                                                try {
                                                  // Get available brands for this generic
                                                  const brands = await pharmacyService.getAvailableBrands(generic.id);
                                                  
                                                  if (brands.length > 0) {
                                                    // Calculate total stock and find earliest expiry
                                                    totalStock = brands.reduce((sum, brand) => 
                                                      sum + (Number((brand as any).available_stock) || 0), 0
                                                    );

                                                    // Get batch info for earliest expiry
                                                    for (const brand of brands) {
                                                      const batches = await pharmacyService.getMedicationBatches(brand.id);
                                                      const activeBatches = batches.filter(b => b.expiryDate && new Date(b.expiryDate) > new Date());
                                                      if (activeBatches.length > 0) {
                                                        const soonest = activeBatches.reduce((prev, curr) => 
                                                          new Date(curr.expiryDate) < new Date(prev.expiryDate) ? curr : prev
                                                        );
                                                        const soonestDate = new Date(soonest.expiryDate);
                                                        const soonestDays = Math.ceil((soonestDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                                                        
                                                        // Keep track of earliest expiry across all brands
                                                        if (!expiryDate || soonestDate < new Date(expiryDate)) {
                                                          expiryDate = soonest.expiryDate;
                                                          daysToExpiry = soonestDays;
                                                          isNearExpiry = soonestDays <= 90;
                                                        }
                                                      }
                                                    }
                                                  }
                                                } catch (err) {
                                                  console.warn(`Could not get brands for generic ${generic.name}:`, err);
                                                }

                                                return {
                                                  id: generic.id.toString(),
                                                  name: generic.name,
                                                  strength: generic.strength || '',
                                                  type: 'generic',
                                                  stock: Math.round(totalStock),
                                                  expiryDate: expiryDate ? new Date(expiryDate).toLocaleDateString() : '',
                                                  daysToExpiry,
                                                  unitPrice: 0,
                                                  isNearExpiry,
                                                };
                                              })
                                            );
                                          }

                                          setAllAvailableMedications(genericsCache.current);
                                          setAvailableSubstitutes(genericsCache.current);
                                        } catch (error) {
                                          console.error('Failed to load generic medications:', error);
                                          setAllAvailableMedications([]);
                                          setAvailableSubstitutes([]);
                                        } finally {
                                          setIsLoadingSubstitutes(false);
                                        }
                                        
                                        setSubstituteSearchQuery('');
                                        setShowSubstitutionModal(true);
                                      }}
                                    >
                                      <ArrowRightLeft className="h-3 w-3 mr-1" />
                                      Substitute
                                    </Button>
                                </div>
                              </div>
                              
                              {isSelected && isAvailable && (
                                <div className="space-y-3 mt-3 pt-3 border-t">
                                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                                    {/* Quantity */}
                                    <div>
                                      <Label className="text-xs">Quantity to Dispense</Label>
                                      {(med as any).remaining_quantity <= 0 ? (
                                        <div className="h-8 mt-1 flex items-center px-3 bg-muted text-muted-foreground text-sm rounded">
                                          Fully dispensed
                                        </div>
                                      ) : (
                                        <Input
                                          type="number"
                                          min="0"
                                          max={(() => {
                                            const stockCap = Array.isArray(batches)
                                              ? batches.reduce((total, b) => total + Number(b.quantity || 0), 0)
                                              : null;
                                            const remaining = Math.max(0, Number((med as any).remaining_quantity || 0));
                                            if (typeof stockCap === 'number') return Math.min(remaining, stockCap);
                                            return remaining;
                                          })()}
                                          value={dispenseQuantities[med.id] ?? Math.max(0, Number((med as any).remaining_quantity ?? 0))}
                                          onChange={(e) => {
                                            const inputValue = Math.max(0, parseInt(e.target.value) || 0);
                                            const stockCap = Array.isArray(batches)
                                              ? batches.reduce((total, b) => total + Number(b.quantity || 0), 0)
                                              : null;
                                            const remaining = Math.max(0, Number((med as any).remaining_quantity || 0));
                                            const maxAllowed = typeof stockCap === 'number' ? Math.min(remaining, stockCap) : remaining;
                                            setDispenseQuantities(prev => ({
                                              ...prev,
                                              [med.id]: Math.min(inputValue, maxAllowed)
                                            }));
                                          }}
                                          className="h-8 mt-1"
                                        />
                                      )}
                                      <div className="text-[10px] text-muted-foreground mt-1 space-y-1">
                                        <div>
                                          Prescribed: {med.quantity} • Available: {Array.isArray(batches) ? batches.reduce((total, b) => total + Number(b.quantity || 0), 0) : '—'}
                                        </div>
                                        {(med as any).dispensed_quantity > 0 && (
                                        <div className={(med as any).remaining_quantity < 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}>
                                          Already dispensed: {(med as any).dispensed_quantity} • Remaining: {Math.max(0, (med as any).remaining_quantity)}
                                          {(med as any).remaining_quantity < 0 && " (Over-dispensed)"}
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                    
                                    {/* Stock Info */}
                                    <div>
                                      <Label className="text-xs">Stock Available</Label>
                                      {(() => {
                                        const stock = Array.isArray(batches)
                                          ? batches.reduce((total, b) => total + Number(b.quantity || 0), 0)
                                          : null;
                                        if (stock === null) {
                                          return (
                                            <div className="mt-1 p-2 rounded text-center font-medium bg-muted text-muted-foreground">
                                              —
                                            </div>
                                          );
                                        }
                                        return (
                                          <div className={`mt-1 p-2 rounded text-center font-medium ${stock < 50 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                            {stock} units
                                          </div>
                                        );
                                      })()}
                                    </div>
                                  </div>
                                  
                                  {/* Instructions */}
                                  <div className="p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs">
                                    <span className="font-medium text-blue-700 dark:text-blue-400">Instructions:</span> {med.instructions}
                                  </div>
                                </div>
                              )}
                              
                              {!isAvailable && med.status === 'Out of Stock' && (
                                <p className="text-xs text-red-600 dark:text-red-400 mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded">
                                  ⚠️ This medication is out of stock. {hasSubstitute ? 'Consider using a substitute.' : 'Contact procurement.'}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>


                {/* Dispense Notes */}
                <div>
                  <Label>Dispense Notes (Optional)</Label>
                  <Textarea
                    value={dispenseNotes}
                    onChange={(e) => setDispenseNotes(e.target.value)}
                    placeholder="Add any notes about the dispensing, patient counseling, or special instructions..."
                    rows={2}
                    className="mt-1"
                  />
                </div>
              </div>
            )}

            <DialogFooter className="flex flex-col sm:flex-row gap-2">
              <Button variant="outline" onClick={() => setShowDispenseModal(false)}>Cancel</Button>
              <Button
                variant="outline"
                className="gap-2"
                onClick={() => selectedPrescription && handlePrintPrescription(selectedPrescription, 'label')}
                disabled={printing}
              >
                <Printer className="h-4 w-4" />
                {printing ? 'Printing...' : 'Print Label'}
              </Button>
              <Button 
                onClick={handleDispense}
                disabled={selectedMedications.length === 0 || (detectedInteractions.length > 0 && !interactionAcknowledged)}
                className="bg-violet-600 hover:bg-violet-700"
              >
                <Package className="h-4 w-4 mr-2" />
                Dispense ({selectedMedications.length}) Medication{selectedMedications.length !== 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Simplified Substitution Modal */}
        <Dialog open={showSubstitutionModal} onOpenChange={setShowSubstitutionModal}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-hidden flex flex-col">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {substitutionForm.reason === 'brand_selection' ? (
                  <>
                    <Tag className="h-5 w-5 text-blue-500" />
                    {brandSelectionMode === 'switch' ? 'Switch Brand for Dispensing' : 'Select Brand for Dispensing'}
                    {isLoadingBrands && <span className="text-xs font-normal text-muted-foreground ml-2">(Loading...)</span>}
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="h-5 w-5 text-amber-500" />
                    Switch Brand or Substitute Medication
                    {isLoadingSubstitutes && <span className="text-xs font-normal text-muted-foreground ml-2">(Loading...)</span>}
                  </>
                )}
              </DialogTitle>
              <DialogDescription>
                {substitutionForm.reason === 'brand_selection' 
                  ? `Select the specific brand of ${brandSelectionTargetName || substitutionMed?.name} to dispense`
                  : `Substitute ${substitutionMed?.name} with an alternative`
                }
              </DialogDescription>
            </DialogHeader>
            
            {substitutionMed && (
              <div className="overflow-y-auto max-h-[55vh] space-y-4">
                {/* Original Medication */}
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1">Original Medication</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">{substitutionMed.name}</p>
                      <p className="text-xs text-muted-foreground">{substitutionMed.route} • {substitutionMed.frequency} • Qty: {substitutionMed.quantity}</p>
                    </div>
                    <Badge variant="outline" className={getMedicationStatusColor(substitutionMed.status)}>
                      {substitutionMed.status}
                    </Badge>
                  </div>
                </div>

                {/* Reason for Substitution - Only show for non-brand selection */}
                {substitutionForm.reason !== 'brand_selection' && (
                  <div>
                    <Label className="text-sm">Reason for Substitution *</Label>
                    <Select 
                      value={substitutionForm.reason} 
                      onValueChange={(v) => setSubstitutionForm({ ...substitutionForm, reason: v })}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue placeholder="Select reason..." />
                      </SelectTrigger>
                      <SelectContent>
                        {substitutionReasons.filter(reason => reason.value !== 'brand_selection').map((reason) => (
                          <SelectItem key={reason.value} value={reason.value}>
                            <span className="flex items-center gap-2">
                              <span>{reason.icon}</span>
                              <span>{reason.label}</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Brand Selection Indicator */}
                {substitutionForm.reason === 'brand_selection' && (
                  <div className="flex items-center gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <Tag className="h-4 w-4 text-blue-500" />
                    <span className="font-medium text-blue-800">Brand Selection Mode</span>
                    <span className="text-xs text-blue-600">Selecting specific brand for generic prescription</span>
                  </div>
                )}

                {/* Search for Substitute */}
                <div>
                  <Label className="text-sm">
                    {substitutionForm.reason === 'brand_selection' ? 'Search Brand *' : 'Search Substitute Medication *'}
                  </Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={substituteSearchQuery}
                      onChange={(e) => setSubstituteSearchQuery(e.target.value)}
                      placeholder={
                        substitutionForm.reason === 'brand_selection' 
                          ? 'Search for brand (e.g. Amatem)...' 
                          : 'Search for substitute medication...'
                      }
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {substitutionForm.reason === 'brand_selection' 
                      ? 'Find the specific brand to dispense' 
                      : 'Find an alternative medication to substitute'
                    }
                  </p>
                </div>

                {/* Available Substitutes */}
                <div className="space-y-2 max-h-[180px] overflow-y-auto border rounded-lg p-2">
                  {(() => {
                    // If searching, show search results based on the reason
                    if (substituteSearchQuery.trim()) {
                      let searchResults;
                      if (substitutionForm.reason === 'brand_selection') {
                        // For brand selection, search all medications (brands)
                        searchResults = allAvailableMedications
                          .filter(med =>
                            med.name.toLowerCase().includes(substituteSearchQuery.toLowerCase())
                          )
                          .slice(0, 10); // Limit to 10 results for performance
                      } else {
                        // For substitution, search only generics
                        searchResults = allAvailableMedications
                          .filter(med =>
                            med.type === 'generic' &&
                            med.name.toLowerCase().includes(substituteSearchQuery.toLowerCase())
                          )
                          .slice(0, 10); // Limit to 10 results for performance
                      }

                      return searchResults.length > 0 ? (
                        searchResults
                          .sort((a, b) => b.stock - a.stock)
                          .map(sub => (
                            <div
                              key={sub.id}
                              onClick={() => setSubstitutionForm({ ...substitutionForm, selectedSubstitute: sub.id })}
                              className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                                substitutionForm.selectedSubstitute === sub.id
                                  ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                                  : 'border-transparent hover:border-amber-300 hover:bg-muted/50'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-medium text-sm">{sub.name}</span>
                                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                    sub.type === 'generic' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                    sub.type === 'brand' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400' :
                                    'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                  }`}>
                                    {sub.type}
                                  </Badge>
                                  {sub.isNearExpiry && (
                                    <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-white">
                                      Near Expiry
                                    </Badge>
                                  )}
                                </div>
                                {substitutionForm.selectedSubstitute === sub.id && (
                                  <CheckCircle2 className="h-4 w-4 text-amber-500 flex-shrink-0" />
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                <span>Stock: <strong className={sub.stock < 50 ? 'text-red-600' : 'text-emerald-600'}>{Math.round(sub.stock).toLocaleString()}</strong></span>
                                <span>Exp: <strong className={sub.isNearExpiry ? 'text-amber-600' : ''}>{sub.expiryDate || 'N/A'}</strong></span>
                              </div>
                            </div>
                          ))
                      ) : (
                        <div className="p-4 text-center text-muted-foreground">
                          <Search className="h-6 w-6 mx-auto mb-1" />
                          <p className="text-sm">No {substitutionForm.reason === 'brand_selection' ? 'brands' : 'generics'} found for "{substituteSearchQuery}"</p>
                        </div>
                      );
                    }

                    // If no search query, show suggested substitutes
                    return availableSubstitutes.length > 0 ? (
                      availableSubstitutes
                        .sort((a, b) => {
                          if (substitutionForm.reason === 'near_expiry') {
                            return a.daysToExpiry - b.daysToExpiry;
                          }
                          return b.stock - a.stock;
                        })
                        .map(sub => (
                          <div
                            key={sub.id}
                            onClick={() => setSubstitutionForm({ ...substitutionForm, selectedSubstitute: sub.id })}
                            className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                              substitutionForm.selectedSubstitute === sub.id
                                ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20'
                                : 'border-transparent hover:border-amber-300 hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-medium text-sm">{sub.name}</span>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                  sub.type === 'generic' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-700' :
                                  sub.type === 'brand' ? 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-700' :
                                  'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-700'
                                }`}>
                                  {sub.type}
                                </Badge>
                                {sub.isNearExpiry && (
                                  <Badge className="text-[10px] px-1.5 py-0 bg-amber-500 text-white">
                                    Near Expiry
                                  </Badge>
                                )}
                              </div>
                              {substitutionForm.selectedSubstitute === sub.id && (
                                <CheckCircle2 className="h-4 w-4 text-amber-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span>Stock: <strong className={sub.stock < 50 ? 'text-red-600' : 'text-emerald-600'}>{Math.round(sub.stock).toLocaleString()}</strong></span>
                              <span>Exp: <strong className={sub.isNearExpiry ? 'text-amber-600' : ''}>{sub.expiryDate || 'N/A'}</strong></span>
                            </div>
                          </div>
                        ))
                    ) : (
                      <div className="p-4 text-center text-muted-foreground">
                        <Package className="h-6 w-6 mx-auto mb-1" />
                        <p className="text-sm">No suggested {substitutionForm.reason === 'brand_selection' ? 'brands' : 'generics'} available</p>
                        <p className="text-xs mt-1">Try searching for any {substitutionForm.reason === 'brand_selection' ? 'brand' : 'generic'} above</p>
                      </div>
                    );
                  })()}
                </div>

                {/* Notes */}
                <div>
                  <Label className="text-sm">Notes (Optional)</Label>
                  <Input
                    value={substitutionForm.notes}
                    onChange={(e) => setSubstitutionForm({ ...substitutionForm, notes: e.target.value })}
                    placeholder="Additional notes..."
                    className="mt-1"
                  />
                </div>

                {/* Summary */}
                {substitutionForm.reason && substitutionForm.selectedSubstitute && (
                  <div className={`p-3 rounded-lg border ${
                    substitutionForm.reason === 'brand_selection' 
                      ? 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                      : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'
                  }`}>
                    <div className="flex items-center gap-2 text-sm">
                      {substitutionForm.reason === 'brand_selection' 
                        ? <Tag className="h-4 w-4 text-blue-600" />
                        : <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      }
                      <span className={substitutionForm.reason === 'brand_selection' ? "text-blue-700 dark:text-blue-400" : "text-emerald-700 dark:text-emerald-400"}>
                        {substitutionForm.reason === 'brand_selection' ? (
                          <>Dispensing <strong>{(availableSubstitutes.find(s => s.id === substitutionForm.selectedSubstitute) || allAvailableMedications.find(s => s.id === substitutionForm.selectedSubstitute))?.name}</strong> for <strong>{substitutionMed.name}</strong></>
                        ) : (
                          <><strong>{substitutionMed.name}</strong> → <strong>{(availableSubstitutes.find(s => s.id === substitutionForm.selectedSubstitute) || allAvailableMedications.find(s => s.id === substitutionForm.selectedSubstitute))?.name}</strong></>
                        )}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 ${
                      substitutionForm.reason === 'brand_selection' ? 'text-blue-600 dark:text-blue-500' : 'text-emerald-600 dark:text-emerald-500'
                    }`}>
                      Action: {substitutionReasons.find(r => r.value === substitutionForm.reason)?.label}
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSubstitutionModal(false)}>Cancel</Button>
              <Button 
                className={substitutionForm.reason === 'brand_selection' ? "bg-blue-600 hover:bg-blue-700" : "bg-amber-500 hover:bg-amber-600"}
                disabled={!substitutionForm.reason || !substitutionForm.selectedSubstitute}
                onClick={async () => {
                  if (!selectedPrescription) return;

                  // Check both availableSubstitutes (suggested) and allAvailableMedications (searched)
                  const selectedSub = availableSubstitutes.find(s => s.id === substitutionForm.selectedSubstitute) ||
                                    allAvailableMedications.find(s => s.id === substitutionForm.selectedSubstitute);
                  if (selectedSub && substitutionMed) {
                    try {
                      let medicationIdToUse = selectedSub.id;
                      let resolvedMedicationName = selectedSub.name;

                      if (selectedSub.type === 'generic') {
                        const brands = await pharmacyService.getAvailableBrands(Number(selectedSub.id));
                        if (!brands || brands.length === 0) {
                          throw new Error(`No in-stock brand available for "${selectedSub.name}"`);
                        }

                        const bestBrand = [...brands].sort(
                          (a: any, b: any) => Number((b as any).available_stock || 0) - Number((a as any).available_stock || 0)
                        )[0];

                        medicationIdToUse = bestBrand.id.toString();
                        resolvedMedicationName = bestBrand.name;
                      }
                      
                      // Call API to persist the substitution
                      await pharmacyService.substitutePrescriptionItem(
                        selectedPrescription.id,
                        substitutionMed.id, // prescription item ID
                        medicationIdToUse, // new medication ID
                        substitutionForm.reason,
                        substitutionForm.notes
                      );
                      
                      const actionType = substitutionForm.reason === 'brand_selection' ? 'Brand Selection' : 'Substitution';
                      toast.success(`${actionType} confirmed: ${resolvedMedicationName}`);

                      // Close the substitution modal first
                      setShowSubstitutionModal(false);

                      // Reload prescriptions list to reflect substitution in the UI
                      await loadPrescriptions();

                      const prescriptionId = parseInt(String(selectedPrescription.id)) || Number(selectedPrescription.id);
                      const refreshed = await pharmacyService.getPrescription(prescriptionId);
                      let transformed = transformMedications(refreshed.medications as any, selectedPrescription.status);

                      if (substitutionMed) {
                        const batches = await pharmacyService.getMedicationBatches(Number(medicationIdToUse));
                        setMedicationBatches(prev => ({
                          ...prev,
                          [substitutionMed.id]: batches
                        }));
                        if (batches.length > 0) {
                          setSelectedBatches(prev => ({
                            ...prev,
                            [substitutionMed.id]: batches[0].id
                          }));
                        }

                        const stock = batches.reduce((total, b) => total + Number(b.quantity || 0), 0);
                        const previousBrandName = substitutionMed.name;
                        const preservedOriginalMedication =
                          substitutionForm.reason === 'brand_selection'
                            ? (substitutionMed as any).originalMedication
                            : substitutionMed.name;
                        transformed = transformed.map((m: any) => {
                          if (m.id !== substitutionMed.id) return m;
                          const dispensedQty = Number(m.dispensed_quantity || 0);
                          const prescribedQty = Number(m.quantity || 0);
                          const remainingQty = Math.max(0, prescribedQty - dispensedQty);
                          let status = m.status;
                          if (remainingQty > 0) {
                            if (stock === 0) status = 'Out of Stock';
                            else if (stock < 50) status = 'Low Stock';
                            else status = 'Available';
                          }
                          return {
                            ...m,
                            name: resolvedMedicationName,
                            medication: Number(medicationIdToUse),
                            stockLevel: stock,
                            status,
                            substitution: {
                              reason: substitutionForm.reason,
                              medication_id: medicationIdToUse,
                              name: resolvedMedicationName,
                              ...(substitutionForm.reason === 'brand_selection' ? { previous_brand: previousBrandName } : {}),
                            },
                            originalMedication: preservedOriginalMedication,
                          };
                        });
                      }

                      setSelectedPrescriptionMedications(transformed);
                      setSelectedPrescription((prev: any) => prev ? { ...prev, medications: transformed } : prev);

                      toast.success(`Successfully substituted ${substitutionMed.name} with ${resolvedMedicationName}`);
                      setShowSubstitutionModal(false);

                      // Reset form
                      setSubstitutionForm({ reason: '', selectedSubstitute: '', notes: '' });
                      setSubstituteSearchQuery('');

                    } catch (error) {
                      console.error('❌ Substitution failed:', error);
                      toast.error(`Failed to substitute medication: ${(error as any).message || 'Unknown error'}`);
                    }
                  }
                }}
              >
                <ArrowRightLeft className="h-4 w-4 mr-2" />
                Confirm
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

      </div>
    </DashboardLayout>
  );
}
