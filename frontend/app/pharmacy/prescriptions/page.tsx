"use client";

import { useState, useMemo, useEffect, useRef } from 'react';
import { StandardPagination } from '@/components/shared/StandardPagination';
import { DashboardLayout } from '@/components/shared/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { pharmacyService, type Prescription as ApiPrescription, type PrescriptionItem } from '@/lib/services';
import { PHARMACY_LOCATIONS } from '@/lib/constants/pharmacy-locations';
import { PatientAvatar } from "@/components/shared/PatientAvatar";
import { Icd10DiagnosesBlock } from '@/components/medical/Icd10DiagnosesBlock';
import { joinDisplayParts } from '@/lib/utils/clinic-utils';
import { 
  ClipboardList, Search, Eye, Clock, CheckCircle2, CheckCircle, Pill, Calendar,
  AlertTriangle, Package, User, Activity, Stethoscope,
  ArrowRight, XCircle, Printer, ShieldAlert, ArrowRightLeft, Info,
  FileText, Beaker, Hash, Loader2, Tag, GitBranch
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

// Batch data caching to avoid repeated API calls
const batchCache = new Map<number, { data: any[], timestamp: number }>();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

const getCachedBatches = async (medicationId: number) => {
  const now = Date.now();
  const cached = batchCache.get(medicationId);

  if (cached && (now - cached.timestamp) < CACHE_DURATION) {
    debugPharmacy('Using cached batches for medication', medicationId);
    return cached.data;
  }

  debugPharmacy('Fetching fresh batches for medication', medicationId);
  try {
    const batches = await pharmacyService.getMedicationBatches(medicationId);
    batchCache.set(medicationId, { data: batches, timestamp: now });
    return batches;
  } catch (error) {
    console.error('Error fetching medication batches:', error);
    return [];
  }
};

// Medication details caching
const medicationCache = new Map<number, { data: any, timestamp: number }>();
const MED_CACHE_DURATION = 10 * 60 * 1000; // 10 minutes

const getCachedMedication = async (medicationId: number) => {
  const now = Date.now();
  const cached = medicationCache.get(medicationId);

  if (cached && (now - cached.timestamp) < MED_CACHE_DURATION) {
    debugPharmacy('Using cached medication details for', medicationId);
    return cached.data;
  }

  debugPharmacy('Fetching fresh medication details for', medicationId);
  try {
    const med = await pharmacyService.getMedication(medicationId);
    medicationCache.set(medicationId, { data: med, timestamp: now });
    return med;
  } catch (error) {
    console.error('Error fetching medication details:', error);
    return null;
  }
};

/** Parse prescription / line-item ids from UI state (string or number). */
const parseNumericId = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return undefined;
    const n = Number(t);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const mapApiPrescriptionStatusToUi = (s: string | undefined, fallback: string): string => {
  if (!s) return fallback;
  if (s === 'pending') return 'Pending';
  if (s === 'dispensing') return 'Processing';
  if (s === 'dispensed') return 'Dispensed';
  if (s === 'partially_dispensed') return 'Partially Dispensed';
  if (s === 'cancelled') return 'On Hold';
  return fallback;
};

const isActiveDispenseLine = (m: any) => !m?.prescribing_record_only;

/** Prescribed ingredient PK — API links dispensary rows (brand medications) to this generic. */
const resolveGenericIdForBrandSelect = (med: any): number | null => {
  const idFromUrlTail = (s: string): number | undefined => {
    const m = String(s).trim().match(/(\d+)\/?$/);
    if (!m) return undefined;
    const n = parseInt(m[1], 10);
    return Number.isFinite(n) && n > 0 ? n : undefined;
  };
  const candidates: unknown[] = [
    med?.generic,
    med?.generic_id,
    med?.medication_details?.generic_id,
    med?.medication_details?.generic,
    med?.medication_details?.type === 'generic' ? med?.medication_details?.id : undefined,
  ];
  for (const c of candidates) {
    if (c == null) continue;
    if (typeof c === 'string' && (c.includes('/') || c.includes('http'))) {
      const fromUrl = idFromUrlTail(c);
      if (fromUrl != null) return fromUrl;
    }
    const raw = typeof c === 'object' && c !== null && 'id' in c ? (c as { id: unknown }).id : c;
    const id = parseNumericId(raw);
    if (id != null && id > 0) return id;
  }
  return null;
};

/** Batch is expired only if calendar expiry is strictly before today (local). */
const isBatchExpired = (exp: string | undefined): boolean => {
  if (!exp) return false;
  const day = String(exp).split('T')[0];
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return new Date(exp) < new Date(new Date().setHours(0, 0, 0, 0));
  const expUtc = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const now = new Date();
  const todayUtc = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return expUtc < todayUtc;
};

/** DRF may return `{ results }` or a raw array for inventory list. */
const rowsFromInventoryPayload = (payload: unknown): any[] => {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  const r = payload as { results?: unknown };
  return Array.isArray(r.results) ? r.results : [];
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
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);
  const [queueStats, setQueueStats] = useState<{
    pending: number;
    processing: number;
    dispensed: number;
    total: number;
  } | null>(null);
  const [queueStatsLoading, setQueueStatsLoading] = useState(true);
  const [isLoadingPrescriptions, setIsLoadingPrescriptions] = useState(false);
  const silentPollLockRef = useRef(false);
  const userLoadInFlightRef = useRef(false);

  const [showViewModal, setShowViewModal] = useState(false);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [showSubstitutionModal, setShowSubstitutionModal] = useState(false);

  // Modal states (declared before load effects — hooks order)
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [selectedPrescriptionMedications, setSelectedPrescriptionMedications] = useState<any[]>([]);

  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);
  const [dispenseQuantities, setDispenseQuantities] = useState<Record<string, number>>({});
  const [dispenseCoverageQuantities, setDispenseCoverageQuantities] = useState<Record<string, number>>({});
  const [dispenseNotes, setDispenseNotes] = useState('');
  const [selectedBatches, setSelectedBatches] = useState<Record<string, string>>({});
  const [medicationBatches, setMedicationBatches] = useState<Record<string, MedicationBatch[]>>({});
  const [substitutionMed, setSubstitutionMed] = useState<MedicationItem | null>(null);
  const [detectedInteractions, setDetectedInteractions] = useState<DrugInteraction[]>([]);
  const [interactionAcknowledged, setInteractionAcknowledged] = useState(false);

  // Substitution form state
  const [substitutionForm, setSubstitutionForm] = useState({
    reason: '',
    selectedSubstitute: '',
    selectedSubstituteBrand: '', // When substituting with generic, pharmacist picks brand
    notes: '',
  });
  const [availableSubstitutes, setAvailableSubstitutes] = useState<SubstituteOption[]>([]);
  const [allAvailableMedications, setAllAvailableMedications] = useState<SubstituteOption[]>([]);
  const [substituteSearchQuery, setSubstituteSearchQuery] = useState('');
  const [substituteSearchResults, setSubstituteSearchResults] = useState<SubstituteOption[]>([]);
  const [substituteBrandOptions, setSubstituteBrandOptions] = useState<SubstituteOption[]>([]);
  const [isSearchingSubstitutes, setIsSearchingSubstitutes] = useState(false);
  const [isLoadingSubstituteBrands, setIsLoadingSubstituteBrands] = useState(false);
  const [brandSelectionTargetName, setBrandSelectionTargetName] = useState('');
  const [brandSelectionMode, setBrandSelectionMode] = useState<'select' | 'switch'>('select');

  // Performance optimizations - Caching and loading states
  const [isLoadingBrands, setIsLoadingBrands] = useState(false);
  const [isLoadingSubstitutes, setIsLoadingSubstitutes] = useState(false);
  const medicationsCache = useRef<SubstituteOption[] | null>(null);
  const genericsCache = useRef<SubstituteOption[] | null>(null);
  const brandSelectionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const substituteTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const brandSelectionGenericIdRef = useRef<number | null>(null);
  const dispensaryBrandSearchSeqRef = useRef(0);

  // Print functionality
  const [printing, setPrinting] = useState(false);
  const [splittingComboItemId, setSplittingComboItemId] = useState<string | null>(null);
  const [splitComboAlertOpen, setSplitComboAlertOpen] = useState(false);
  const [medToSplit, setMedToSplit] = useState<any>(null);

  // Transform medication data with status determination
  const transformMedications = (medications: any[], prescriptionStatus: string) => {
    debugPharmacy('Transforming medications:', medications);
    return medications.map((med: any) => {
      if ((med as any).prescribing_record_only || (med as any).superseded_at) {
        const record = {
          id: med.id.toString(),
          name: med.medication_name || med.medication_details?.name || '',
          dosage: med.dose || med.dosage || '',
          frequency: med.frequency || med.frequency_display || '',
          duration: med.duration || '',
          quantity: Number(med.quantity || 0),
          unit: med.unit || med.medication_details?.unit || '',
          dosage_form: med.dosage_form || med.medication_details?.form || '',
          strength: med.strength || med.medication_details?.strength || '',
          dispensed_quantity: Number(med.dispensed_quantity || 0),
          stock_dispensed_quantity: Number(med.stock_dispensed_quantity || 0),
          stock_dispensed_unit: med.stock_dispensed_unit || med.medication_details?.unit || '',
          remaining_quantity: Math.max(0, Number(med.quantity || 0) - Number(med.dispensed_quantity || 0)),
          route: med.route || med.route_display || 'Oral',
          instructions: med.instructions || '',
          status: 'Dispensed' as const,
          stockLevel: 0,
          medication_details: med.medication_details,
          type: med.medication_details?.type || 'generic',
          generic: med.generic || med.medication_details?.generic_id || null,
          medication: med.medication || med.medication_details?.medication_id || null,
          substitution: med.substitution,
          originalMedication: med.originalMedication,
          can_split_combo: false,
          combo_components: Array.isArray((med as any).combo_components) ? (med as any).combo_components : [],
          prescribing_record_only: true,
          superseded_at: (med as any).superseded_at,
          superseded_split_into_ids: Array.isArray((med as any).superseded_split_into_ids)
            ? (med as any).superseded_split_into_ids
            : [],
        };
        debugPharmacy(`Prescribing record (superseded) ${med.id}:`, record);
        return record;
      }

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
        dosage: med.dose || med.dosage || '',
        frequency: med.frequency || med.frequency_display || '',
        duration: med.duration || '',
        quantity: Number(med.quantity || 0),
        unit: med.unit || med.medication_details?.unit || '',
        dosage_form: med.dosage_form || med.medication_details?.form || '',
        strength: med.strength || med.medication_details?.strength || '',
        dispensed_quantity: Number(med.dispensed_quantity || 0),
        stock_dispensed_quantity: Number(med.stock_dispensed_quantity || 0),
        stock_dispensed_unit: med.stock_dispensed_unit || med.medication_details?.unit || '',
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
        originalMedication: med.originalMedication,
        can_split_combo: Boolean((med as any).can_split_combo),
        combo_components: Array.isArray((med as any).combo_components) ? (med as any).combo_components : [],
        prescribing_record_only: false,
      };
      
      // Debug: Log the transformed medication
      debugPharmacy(`Transformed medication ${med.id}:`, transformedMed);
      
      return transformedMed;
    });
  };

  const loadPrescriptions = async (opts?: { silent?: boolean }) => {
    const silent = opts?.silent;
    if (!silent) {
      if (userLoadInFlightRef.current) {
        return;
      }
      userLoadInFlightRef.current = true;
      setIsLoadingPrescriptions(true);
      setLoading(true);
      setError(null);
    } else {
      if (userLoadInFlightRef.current) {
        return;
      }
      if (silentPollLockRef.current) {
        return;
      }
      silentPollLockRef.current = true;
    }

    try {
      const response = await pharmacyService.getPrescriptions({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page: currentPage,
        page_size: itemsPerPage,
        search: searchQuery || undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        date_preset: dateFilter !== 'all' ? dateFilter : undefined,
      });
      setTotalCount(response.count || response.results.length);
      // Transform API data - extract patient and visit details
      const transformed = await Promise.all(response.results.map(async (rx: any) => {
        // Extract patient details from prescription or visit
        const patientDetails = rx.patient_details || {};
        const visitDetails = rx.visit_details || {};
        const patientId = rx.patient?.toString() || patientDetails.id || '';
        let patientName = rx.patient_name ?? patientDetails.name ?? '';
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
          patientObj.name = '';
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
          status:
            rx.status === 'pending'
              ? 'Pending'
              : rx.status === 'dispensing'
                ? 'Processing'
                : rx.status === 'dispensed'
                  ? 'Dispensed'
                  : rx.status === 'partially_dispensed'
                    ? 'Partially Dispensed'
                    : rx.status === 'cancelled'
                      ? 'On Hold'
                      : 'On Hold',
          priority,
          waitTime,
          clinicalNotes: rx.diagnosis || '',
          specialInstructions: rx.notes || '',
          visitNotes, // Notes / Special Instructions from visit
        };
      }));
      setPrescriptions(transformed as Prescription[]);
    } catch (err: any) {
      if (!silent) {
        setError(err.message || 'Failed to load prescriptions');
      }
      console.error('Error loading prescriptions:', err);
    } finally {
      if (!silent) {
        userLoadInFlightRef.current = false;
        setLoading(false);
        setIsLoadingPrescriptions(false);
      } else {
        silentPollLockRef.current = false;
      }
    }
  };

  const loadQueueStats = async () => {
    setQueueStatsLoading(true);
    try {
      const s = await pharmacyService.getPrescriptionQueueStats({
        search: searchQuery || undefined,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        gender: genderFilter !== 'all' ? genderFilter : undefined,
        date_preset: dateFilter !== 'all' ? dateFilter : undefined,
      });
      setQueueStats(s);
    } catch (e) {
      console.error('Failed to load prescription queue stats', e);
      setQueueStats(null);
    } finally {
      setQueueStatsLoading(false);
    }
  };

  useEffect(() => {
    void loadQueueStats();
  }, [searchQuery, statusFilter, genderFilter, dateFilter]);

  const loadQueueStatsRef = useRef(loadQueueStats);
  loadQueueStatsRef.current = loadQueueStats;

  const loadPrescriptionsRef = useRef(loadPrescriptions);
  loadPrescriptionsRef.current = loadPrescriptions;

  useEffect(() => {
    void loadPrescriptions();
  }, [currentPage, itemsPerPage, statusFilter, searchQuery, genderFilter, dateFilter]);

  useEffect(() => {
    if (showViewModal || showDispenseModal || showSubstitutionModal) {
      return;
    }
    const id = setInterval(() => {
      void loadPrescriptionsRef.current({ silent: true });
      void loadQueueStatsRef.current();
    }, 15000);
    return () => clearInterval(id);
  }, [
    currentPage,
    itemsPerPage,
    statusFilter,
    searchQuery,
    genderFilter,
    dateFilter,
    showViewModal,
    showDispenseModal,
    showSubstitutionModal,
  ]);

  // Status update functionality

  // Helper functions for filtering
  const normalizeGender = (value: unknown): string => {
    const v = String(value || '').trim().toLowerCase();
    if (v === 'm') return 'male';
    if (v === 'f') return 'female';
    return v;
  };

  const isClinicalLiquidUnit = (unit?: string): boolean => {
    const normalized = String(unit || '').trim().toLowerCase();
    return normalized === 'ml' || normalized === 'milliliter' || normalized === 'milliliters';
  };

  const isPackDispenseMedication = (med: any): boolean => {
    const inventoryUnit = String(med?.medication_details?.unit || '').trim().toLowerCase();
    const hasPackUnit = inventoryUnit === 'bottle' || inventoryUnit === 'bottles';
    return isClinicalLiquidUnit(med?.unit) && hasPackUnit;
  };

  const getPackSizeMl = (med: any): number | null => {
    const raw = Number(med?.medication_details?.pack_size);
    return Number.isFinite(raw) && raw > 0 ? raw : null;
  };

  const getDefaultDispenseQuantity = (med: any): number => {
    const remaining = Math.max(0, Number((med as any).remaining_quantity ?? med?.quantity ?? 0));
    if (!isPackDispenseMedication(med)) return remaining;
    const packSizeMl = getPackSizeMl(med);
    if (packSizeMl) return Math.max(1, Math.ceil(remaining / packSizeMl));
    return 1;
  };

  const getDefaultCoverageQuantity = (med: any): number => {
    return Math.max(0, Number((med as any).remaining_quantity ?? med?.quantity ?? 0));
  };

  /**
   * Substitute: server-side generic search.
   * Select Brand: dispensary inventory only; optional server `search`, then aggregate receipt lines by brand.
   */
  const performSubstituteSearch = async (query: string, reason?: string) => {
    setIsSearchingSubstitutes(true);
    try {
      const searchReason = reason || substitutionForm.reason;
      if (searchReason === 'brand_selection') {
        const genericId = brandSelectionGenericIdRef.current;
        if (!genericId) {
          setSubstituteSearchResults([]);
          return;
        }
        const search = query.trim().length >= 2 ? query.trim() : undefined;
        const seq = ++dispensaryBrandSearchSeqRef.current;

        const aggregateRows = (items: any[]): SubstituteOption[] => {
          const byMed = new Map<number, { med: any; stock: number; expiryDate: string; isNearExpiry: boolean }>();
          for (const item of items) {
            const med = (item as any).medication;
            const medId = typeof med === 'object' && med?.id != null ? Number(med.id) : Number((item as any).medication);
            if (!Number.isFinite(medId) || !medId) continue;
            const qty = Number(
              (item as any).quantity ?? (item as any).quantity_remaining ?? 0,
            );
            const exp = (item as any).expiry_date;
            if (isBatchExpired(exp)) continue;
            const medObj = typeof med === 'object' && med ? med : { id: medId, name: (item as any).medication_name || '', strength: '' };
            const existing = byMed.get(medId);
            if (!existing) {
              const daysToExpiry = exp ? Math.ceil((new Date(exp).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : 0;
              byMed.set(medId, {
                med: medObj,
                stock: qty,
                expiryDate: exp ? new Date(exp).toLocaleDateString() : '',
                isNearExpiry: daysToExpiry <= 90,
              });
            } else {
              existing.stock += qty;
              if (exp) {
                const existingExp = existing.expiryDate ? new Date(existing.expiryDate) : null;
                const newExp = new Date(exp);
                if (!existingExp || newExp.getTime() < existingExp.getTime()) {
                  existing.expiryDate = newExp.toLocaleDateString();
                  const daysToExpiry = Math.ceil((newExp.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  existing.isNearExpiry = daysToExpiry <= 90;
                }
              }
            }
          }
          return Array.from(byMed.values())
            .filter(({ stock }) => stock > 0)
            .map(({ med, stock, expiryDate, isNearExpiry }) => ({
              id: String(med.id),
              name: med.name,
              strength: med.strength || med.form || '',
              type: 'brand' as const,
              stock,
              expiryDate,
              daysToExpiry: 0,
              unitPrice: 0,
              isNearExpiry,
            }))
            .sort((a, b) => (Number(b.stock) || 0) - (Number(a.stock) || 0));
        };

        const baseParams = {
          location: PHARMACY_LOCATIONS.DISPENSARY,
          medication__generic: genericId,
          page: 1,
          page_size: 250,
        } as const;

        let res = await pharmacyService.getInventory({ ...baseParams, search });
        let options = aggregateRows(rowsFromInventoryPayload(res));
        if (options.length === 0 && search) {
          res = await pharmacyService.getInventory({ ...baseParams });
          options = aggregateRows(rowsFromInventoryPayload(res));
        }
        if (seq !== dispensaryBrandSearchSeqRef.current) return;
        setSubstituteSearchResults(options);
      } else {
        // Substitute: server-side search for generic drug names (like brand selection)
        const search = query.trim().length >= 2 ? query.trim() : undefined;
        const results = await pharmacyService.getGenerics({
          ...(search && { search }),
          page: 1,
          page_size: search ? 50 : 20, // Show more results when no search filter
        });
        const options: SubstituteOption[] = results.results.map((g) => ({
          id: g.id.toString(),
          name: g.name,
          strength: g.strength || '',
          type: 'generic' as const,
          stock: 0,
          expiryDate: '',
          daysToExpiry: 0,
          unitPrice: 0,
          isNearExpiry: false,
        }));
        setSubstituteSearchResults(options);
      }
    } catch (error) {
      console.error('Search failed:', error);
      setSubstituteSearchResults([]);
    } finally {
      setIsSearchingSubstitutes(false);
    }
  };

  // Load brands when pharmacist selects a generic in Substitute modal
  useEffect(() => {
    if (substitutionForm.reason === 'brand_selection' || !substitutionForm.selectedSubstitute || !substitutionMed) return;
    const selected = substituteSearchResults.find((s) => s.id === substitutionForm.selectedSubstitute);
    if (!selected || selected.type !== 'generic') {
      setSubstituteBrandOptions([]);
      setSubstitutionForm((f) => ({ ...f, selectedSubstituteBrand: '' }));
      return;
    }
    let cancelled = false;
    const loadBrands = async () => {
      setIsLoadingSubstituteBrands(true);
      setSubstituteBrandOptions([]);
      setSubstitutionForm((f) => ({ ...f, selectedSubstituteBrand: '' }));
      try {
        const brands = await pharmacyService.getAvailableBrands(Number(selected.id));
        if (cancelled) return;
        const options: SubstituteOption[] = brands.map((b: any) => ({
          id: b.id.toString(),
          name: b.name,
          strength: b.strength || '',
          type: 'brand' as const,
          stock: Math.round(Number(b.available_stock) || 0),
          expiryDate: '',
          daysToExpiry: 0,
          unitPrice: 0,
          isNearExpiry: false,
        }));
        setSubstituteBrandOptions(options);
        const bestBrand = [...options].sort((a, b) => (b.stock || 0) - (a.stock || 0))[0];
        if (bestBrand) {
          setSubstitutionForm((f) => ({ ...f, selectedSubstituteBrand: bestBrand.id }));
        }
      } catch (err) {
        if (!cancelled) setSubstituteBrandOptions([]);
      } finally {
        if (!cancelled) setIsLoadingSubstituteBrands(false);
      }
    };
    loadBrands();
    return () => { cancelled = true; };
  }, [substitutionForm.reason, substitutionForm.selectedSubstitute, substituteSearchResults, substitutionMed]);

  // Client-side: priority only (no server field on prescription yet).
  const filteredPrescriptions = useMemo(() => {
    return prescriptions.filter((prescription) => {
      if (priorityFilter !== 'all' && prescription.priority?.toLowerCase() !== priorityFilter) {
        return false;
      }
      return true;
    });
  }, [prescriptions, priorityFilter]);

  const paginatedPrescriptions = filteredPrescriptions;

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, dateFilter, priorityFilter, genderFilter]);

  const stats = useMemo(
    () => ({
      pending: queueStats?.pending ?? 0,
      processing: queueStats?.processing ?? 0,
      total: queueStats?.total ?? 0,
      dispensed: queueStats?.dispensed ?? 0,
    }),
    [queueStats],
  );

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
    try {
      const freshPrescription = await pharmacyService.getPrescription(Number(prescription.id));

      // Apply the same transformation as the prescription list
      const transformedMedications = transformMedications(freshPrescription.medications || [], freshPrescription.status);

      // Hydrate modal-friendly status from API value
      const hydratedPrescription = {
        ...prescription,
        ...(freshPrescription as any),
        medications: transformedMedications,
        status:
          freshPrescription.status === 'pending' ? 'Pending' :
          freshPrescription.status === 'dispensing' ? 'Processing' :
          freshPrescription.status === 'dispensed' ? 'Dispensed' :
          freshPrescription.status === 'partially_dispensed' ? 'Partially Dispensed' :
          prescription.status,
      };
      setSelectedPrescription(hydratedPrescription as any);
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
    let freshRx: any = null;
    try {
      freshRx = await pharmacyService.getPrescription(Number(prescription.id));
      // Mark the moment pharmacist starts attending this prescription.
      if (freshRx?.status === 'pending') {
        freshRx = await pharmacyService.updatePrescriptionStatus(Number(prescription.id), 'dispensing');
      }
    } catch (e) {
      console.error('Error fetching prescription for dispense:', e);
    }
    const uiStatus =
      freshRx?.status === 'pending' ? 'Pending' :
      freshRx?.status === 'dispensing' ? 'Processing' :
      freshRx?.status === 'dispensed' ? 'Dispensed' :
      freshRx?.status === 'partially_dispensed' ? 'Partially Dispensed' :
      prescription.status;
    const hydrated = freshRx
      ? { ...prescription, ...freshRx, status: uiStatus }
      : { ...prescription, status: uiStatus };
    setSelectedPrescription(hydrated as any);
    const transformedMedications = transformMedications(hydrated.medications || [], hydrated.status);
    setSelectedPrescriptionMedications(transformedMedications);

    const initialQuantities: Record<string, number> = {};
    const initialCoverageQuantities: Record<string, number> = {};
    const initialSelection: string[] = [];
    const initialBatches: Record<string, string> = {};
    const loadedBatches: Record<string, MedicationBatch[]> = {};
    const rxMedById = new Map<string, any>(
      Array.isArray((freshRx as any)?.medications)
        ? (freshRx as any).medications.map((m: any) => [String(m.id), m])
        : []
    );
    const lineContextByItemId = new Map<string, {
      medication_id: number | null;
      stock: number;
      default_batch_id: string | null;
      remaining_quantity: number;
      batches: Array<MedicationBatch & { id: string; receivedDate?: string; supplier?: string; unitCost?: number }>;
    }>();
    try {
      const dispenseCtx = await pharmacyService.getPrescriptionDispenseContext(Number(hydrated.id));
      for (const line of dispenseCtx.line_context || []) {
        lineContextByItemId.set(String(line.item_id), {
          medication_id: line.medication_id,
          stock: Number(line.stock || 0),
          default_batch_id: line.default_batch_id || null,
          remaining_quantity: Number(line.remaining_quantity || 0),
          batches: (line.batches || []).map((b) => ({
            id: b.id,
            batchNumber: b.batchNumber,
            quantity: Number(b.quantity || 0),
            expiryDate: b.expiryDate,
            receivedDate: b.receivedDate,
            supplier: '',
            unitCost: 0,
          })),
        });
      }
    } catch (ctxErr) {
      console.warn('Failed to load dispense context, falling back to per-item fetch:', ctxErr);
    }
    for (const med of transformedMedications.filter((m: any) => isActiveDispenseLine(m))) {
      if (med.status === 'Available' || med.status === 'Low Stock' || med.status === 'Pending') {
        initialQuantities[med.id] = getDefaultDispenseQuantity(med);
        initialCoverageQuantities[med.id] = getDefaultCoverageQuantity(med);
        if (med.status !== 'Pending') initialSelection.push(med.id);
      }
    }

    // Open immediately, then hydrate batch/stock details in background.
    setDispenseQuantities(initialQuantities);
    setDispenseCoverageQuantities(initialCoverageQuantities);
    setSelectedMedications(initialSelection);
    setSelectedBatches(initialBatches);
    setDispenseNotes('');
    setShowDispenseModal(true);

    // Load batches for each medication
    const batchPromises = transformedMedications.filter((m: any) => isActiveDispenseLine(m)).map(async (med) => {
      // Include Pending items (Generics) so they appear in the list, but don't try to load batches for them yet
      if (med.status === 'Available' || med.status === 'Low Stock' || med.status === 'Pending') {
        // Load batches for this medication
        try {
          const ctx = lineContextByItemId.get(String(med.id));
          if (ctx && Array.isArray(ctx.batches)) {
            loadedBatches[med.id] = ctx.batches;
            if (ctx.default_batch_id) {
              initialBatches[med.id] = ctx.default_batch_id;
            } else if (ctx.batches.length > 0) {
              initialBatches[med.id] = ctx.batches[0].id;
            }
            return;
          }

          const rxMed = rxMedById.get(String(med.id));
          if (rxMed && rxMed.medication) {
            const batches = await pharmacyService.getMedicationBatches(Number(rxMed.medication));
            loadedBatches[med.id] = batches;
            if (batches.length > 0) {
              initialBatches[med.id] = batches[0].id;
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
      if (m.prescribing_record_only) return m;
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
    const medNames = transformedMedications.filter((m: any) => isActiveDispenseLine(m)).map((m) => m.name).filter(Boolean);
    const interactions = await checkInteractions(medNames);
    setDetectedInteractions(interactions);
    setInteractionAcknowledged(interactions.length === 0);
    
    setSelectedBatches(initialBatches);
  };

  const handleMedicationSelection = async (medId: string, checked: boolean, quantity: number) => {
    if (checked) {
      const med = selectedPrescriptionMedications.find(m => m.id === medId);
      const defaultDispenseQty = med ? getDefaultDispenseQuantity(med) : quantity;
      const defaultCoverageQty = med ? getDefaultCoverageQuantity(med) : quantity;
      setSelectedMedications(prev => [...prev, medId]);
      setDispenseQuantities(prev => ({ ...prev, [medId]: defaultDispenseQty }));
      setDispenseCoverageQuantities(prev => ({ ...prev, [medId]: defaultCoverageQty }));
      
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
      setDispenseCoverageQuantities(prev => {
        const next = { ...prev };
        delete next[medId];
        return next;
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

    // Validate batch selection for selected medications (PARALLEL)
    const validationResults = await Promise.all(selectedMedications.map(async (medId) => {
      const med = selectedPrescriptionMedications.find(m => m.id === medId);
      // If manually selected batch exists, it's valid
      if (selectedBatches[medId]) return { medId, hasBatch: true };

      // If not manually selected, check if we can auto-select one (FEFO)
      if (med && med.status !== 'Out of Stock' && med.medication) {
        try {
          const batches = await getCachedBatches(med.medication as number);
          // If we have batches, we can auto-select, so it's not missing
          return { medId, hasBatch: batches.length > 0 };
        } catch (err) {
          console.error('Error checking batches for validation:', err);
          return { medId, hasBatch: false };
        }
      }

      // If we reach here, no batch is selected and none can be auto-selected
      return { medId, hasBatch: false };
    }));

    const missingBatches = validationResults.filter(result => !result.hasBatch);
    if (missingBatches.length > 0) {
      toast.error('No stock batches available for one or more selected medications');
      return;
    }

    // Check if quantities are valid
    const invalidQuantities = selectedMedications.filter(medId => {
      const med = selectedPrescriptionMedications.find(m => m.id === medId);
      const quantity = dispenseQuantities[medId] ?? (med ? getDefaultDispenseQuantity(med) : 0);
      const coverageQty = dispenseCoverageQuantities[medId] ?? (med ? getDefaultCoverageQuantity(med) : 0);
      return !med || quantity <= 0 || coverageQty <= 0;
    });

    if (invalidQuantities.length > 0) {
      toast.error('Please enter valid dispense and coverage quantities');
      return;
    }

    // Optimistic UI update - show immediate feedback
    setShowDispenseModal(false);
    toast.success(`Dispensing ${selectedMedications.length} medication(s)...`, {
      description: 'Please wait while we process your request'
    });

    // Proceed with dispensing in background
    proceedWithDispense().catch((error) => {
      console.error('Dispense failed:', error);
      toast.error('Dispensing failed - please try again');
      // Could add retry logic here
    });
  };

  const handleSplitComboMedication = async (med: any) => {
    const rxId = parseNumericId(selectedPrescription?.id);
    const itemId = parseNumericId(med?.id);
    if (rxId === undefined || itemId === undefined) {
      toast.error('Invalid prescription or line. Close and re-open dispensing for this prescription.');
      return;
    }
    if (splittingComboItemId) return;
    const medRowId = String(med.id);
    setSplittingComboItemId(medRowId);
    try {
      const fresh = await pharmacyService.getPrescription(rxId);
      const stillThere = (fresh.medications || []).some((m: PrescriptionItem) => Number(m.id) === itemId);
      if (!stillThere) {
        toast.info('That line is no longer on this prescription (it may have been updated).');
        const transformed = transformMedications(fresh.medications || [], fresh.status || '');
        setSelectedPrescriptionMedications(transformed);
        setSelectedMedications((prev) => prev.filter((id) => id !== medRowId));
        setSelectedBatches((prev) => {
          const next = { ...prev };
          delete next[medRowId];
          return next;
        });
        setSelectedPrescription((prev: any) =>
          prev ? { ...prev, status: mapApiPrescriptionStatusToUi(fresh.status, prev.status) } : prev
        );
        await loadPrescriptions({ silent: true });
        return;
      }

      const splitResponse: any = await pharmacyService.splitComboPrescriptionItem(rxId, itemId);
      const refreshed = await pharmacyService.getPrescription(rxId);
      const transformed = transformMedications(
        refreshed.medications || [],
        refreshed.status || String(selectedPrescription?.status ?? '')
      );
      setSelectedPrescriptionMedications(transformed);
      setSelectedMedications((prev) => prev.filter((id) => id !== medRowId));
      setSelectedBatches((prev) => {
        const next = { ...prev };
        delete next[medRowId];
        return next;
      });
      setSelectedPrescription((prev: any) =>
        prev ? { ...prev, status: mapApiPrescriptionStatusToUi(refreshed.status, prev.status) } : prev
      );
      const autoCreated = splitResponse?.split_warnings?.auto_created_components;
      if (Array.isArray(autoCreated) && autoCreated.length > 0) {
        toast.info(
          `Split completed. Auto-created placeholder generic(s): ${autoCreated.join(', ')}. Please substitute/select brands during dispensing.`
        );
      }
      toast.success(`Split ${med.name} into components`);
      await loadPrescriptions({ silent: true });
    } catch (err: any) {
      console.error('Error splitting combo medication:', err);
      const msg = String(err?.message || '');
      const isNotFound = msg.includes('not found') || err?.status === 404;
      if (isNotFound) {
        toast.error('That line no longer exists on this prescription. Refreshing from server.');
        try {
          const fresh = await pharmacyService.getPrescription(rxId);
          const transformed = transformMedications(fresh.medications || [], fresh.status || '');
          setSelectedPrescriptionMedications(transformed);
          setSelectedPrescription((prev: any) =>
            prev ? { ...prev, status: mapApiPrescriptionStatusToUi(fresh.status, prev.status) } : prev
          );
          await loadPrescriptions({ silent: true });
        } catch {
          // ignore secondary fetch errors
        }
        return;
      }
      const missing =
        (err as any)?.body &&
        typeof (err as any).body === 'string' &&
        (err as any).body.includes('missing_components');
      if (missing) {
        toast.error('Cannot split combo: one or more components are missing in Generic master');
      } else {
        toast.error(err?.message || 'Failed to split combo medication');
      }
    } finally {
      setSplittingComboItemId(null);
    }
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

        const quantity = dispenseQuantities[medId] ?? getDefaultDispenseQuantity(med);
        const coverageQuantity = dispenseCoverageQuantities[medId] ?? getDefaultCoverageQuantity(med);

        // Use manually selected batch OR fetch auto-selected batch (FEFO) from cache
        let inventoryId = selectedBatches[medId] ? parseInt(selectedBatches[medId]) : undefined;

        if (!inventoryId && med.medication) {
          try {
            const batches = await getCachedBatches(med.medication);
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
            dispenseNotes,
            coverageQuantity
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

      // Clean up state after successful dispense
      setShowDispenseModal(false);
      setSelectedPrescription(null);
      setSelectedMedications([]);
      setDispenseQuantities({});
      setDispenseCoverageQuantities({});
      setDispenseNotes('');
      setSelectedBatches({});

      // Clear batch cache for affected medications to ensure fresh data
      selectedMedications.forEach(medId => {
        const med = selectedPrescriptionMedications.find(m => m.id === medId);
        if (med?.medication) {
          batchCache.delete(med.medication as number);
        }
      });

      // Force a status recalculation on the backend first
      try {
        if (selectedPrescription?.id) {
          await pharmacyService.recalculatePrescriptionStatus(selectedPrescription.id);
        }
      } catch (recalcError) {
        console.warn('⚠️ Status recalculation failed:', recalcError);
        // Continue anyway
      }

      // Single reload after both dispensing and recalculation
      await loadPrescriptions();
    } catch (err: any) {
      const errorMessage = err.message || 'Failed to dispense medications';
      toast.error(errorMessage);
      console.error('Error dispensing medications:', err);
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
        const quantity = getDefaultDispenseQuantity(med);
        const coverageQuantity = getDefaultCoverageQuantity(med);
        const inventoryId = batchMap[med.id];
        
        try {
          await pharmacyService.dispense(
            numericPrescriptionId,
            parseInt(med.id),
            quantity,
            inventoryId,
            'Quick dispense',
            coverageQuantity
          );
        } catch (err: any) {
          console.error(`Error dispensing ${med.name}:`, err);
          throw err;
        }
      });

      await Promise.all(dispensePromises);

      toast.success(`${availableMeds.length} medication(s) dispensed successfully for ${prescription.patient.name}`);

      // Small delay to prevent UI freeze, then reload prescriptions
      setTimeout(async () => {
        try {
          await loadPrescriptions();
        } catch (err) {
          console.error('Error reloading prescriptions after dispense:', err);
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
              html, body { height: auto !important; overflow: visible !important; margin: 0; }
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
            ${[
              `<strong>Rx ID:</strong> ${prescription.id}`,
              (prescription.date || prescription.time)
                ? `<strong>Date:</strong> ${`${prescription.date || ''} ${prescription.time || ''}`.trim()}`
                : '',
              prescription.doctor ? `<strong>Doctor:</strong> ${prescription.doctor}` : '',
              prescription.clinic ? `<strong>Clinic:</strong> ${prescription.clinic}` : '',
            ].filter(Boolean).join('<br>')}
          </div>

          <div class="patient-info">
            ${[
              `<strong>Patient:</strong> ${prescription.patient.name}`,
              prescription.patient.mrn ? `<strong>Patient ID:</strong> ${prescription.patient.mrn}` : '',
              prescription.patient.allergies?.length > 0 ? `<strong>Allergies:</strong> ${prescription.patient.allergies.join(', ')}` : '',
            ].filter(Boolean).join('<br>')}
          </div>

          <div class="medication-list">
            <strong>Medications:</strong>
            ${transformedMeds.map(med => {
              const medLines = [
                `<strong>${med.name}</strong>`,
                med.dosage != null && String(med.dosage).trim() !== '' ? `Dose: ${med.dosage}` : '',
                med.quantity != null && String(med.quantity).trim() !== '' ? `Quantity: ${med.quantity}` : '',
                med.route != null && String(med.route).trim() !== '' ? `Route: ${med.route}` : '',
                med.frequency != null && String(med.frequency).trim() !== '' ? `Frequency: ${med.frequency}` : '',
                med.duration != null && String(med.duration).trim() !== '' ? `Duration: ${med.duration}` : '',
                med.instructions ? `Instructions: ${med.instructions}` : '',
              ].filter(Boolean).join('<br>');
              return `<div class="medication-item">${medLines}</div>`;
            }).join('')}
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

        {/* Stats Cards — workflow + volume */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending</p>
                  <p className="text-2xl font-bold text-amber-600 tabular-nums">
                    {queueStatsLoading ? '—' : stats.pending.toLocaleString()}
                  </p>
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
                  <p className="text-2xl font-bold text-blue-600 tabular-nums">
                    {queueStatsLoading ? '—' : stats.processing.toLocaleString()}
                  </p>
                </div>
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Total prescriptions</p>
                  <p className="text-2xl font-bold text-violet-600 tabular-nums">
                    {queueStatsLoading ? '—' : stats.total.toLocaleString()}
                  </p>
                </div>
                <Hash className="h-5 w-5 text-violet-500" />
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Dispensed</p>
                  <p className="text-2xl font-bold text-emerald-600 tabular-nums">
                    {queueStatsLoading ? '—' : stats.dispensed.toLocaleString()}
                  </p>
                </div>
                <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row sm:flex-wrap sm:items-center gap-3">
              <div className="relative flex-1 min-w-[min(100%,16rem)]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input 
                  placeholder="Search by patient name or ID..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={dateFilter} onValueChange={setDateFilter}>
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
                    <SelectItem value="dispensing">Processing</SelectItem>
                    <SelectItem value="dispensed">Dispensed</SelectItem>
                    <SelectItem value="partially_dispensed">Partially Dispensed</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                  <SelectTrigger className="w-[150px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Priority</SelectItem>
                    <SelectItem value="emergency">Emergency</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="medium">Medium</SelectItem>
                    <SelectItem value="low">Low</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={genderFilter} onValueChange={setGenderFilter}>
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
                <Button variant="outline" className="mt-4" onClick={() => void loadPrescriptions()}>Retry</Button>
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
                        <span>{rx.patient.mrn}</span>
                        <span>•</span>
                        <span>{rx.patient.age > 0 ? `${rx.patient.age}y` : 'Age unknown'} {rx.patient.gender}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{rx.doctor}</span>
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
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 bg-muted/50 rounded-lg p-4 text-sm">
                  {((selectedPrescription as any).patient_details?.patient_id || selectedPrescription.patient) && (
                    <div><span className="text-muted-foreground">Patient ID:</span> <span className="font-medium">{(selectedPrescription as any).patient_details?.patient_id || selectedPrescription.patient}</span></div>
                  )}
                  {joinDisplayParts([
                    (selectedPrescription as any).patient_details?.age,
                    (selectedPrescription as any).patient_details?.gender,
                  ]) && (
                    <div><span className="text-muted-foreground">Age/Gender:</span> <span className="font-medium">{joinDisplayParts([(selectedPrescription as any).patient_details?.age, (selectedPrescription as any).patient_details?.gender])}</span></div>
                  )}
                  {(selectedPrescription as any).patient_details?.phone && (
                    <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{(selectedPrescription as any).patient_details?.phone}</span></div>
                  )}
                  {((selectedPrescription as any).doctor_name || selectedPrescription.doctor) && (
                    <div><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">{(selectedPrescription as any).doctor_name || selectedPrescription.doctor}</span></div>
                  )}
                  {((selectedPrescription as any).visit_details?.clinic || selectedPrescription.clinic) && (
                    <div><span className="text-muted-foreground">Clinic:</span> <span className="font-medium">{(selectedPrescription as any).visit_details?.clinic || selectedPrescription.clinic}</span></div>
                  )}
                  {(selectedPrescription.prescribed_at || selectedPrescription.date || selectedPrescription.time) && (
                    <div>
                      <span className="text-muted-foreground">Date:</span>{' '}
                      <span className="font-medium">
                        {selectedPrescription.prescribed_at
                          ? `${new Date(selectedPrescription.prescribed_at).toLocaleDateString()} ${new Date(selectedPrescription.prescribed_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}`
                          : `${selectedPrescription.date || ''} ${selectedPrescription.time || ''}`.trim()}
                      </span>
                    </div>
                  )}
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

                <Icd10DiagnosesBlock diagnoses={(selectedPrescription as any).icd10_diagnoses} compact />

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
                                {med.name || med.medication_name || ''}
                                {(med as any).prescribing_record_only && (
                                  <Badge variant="outline" className="text-xs font-normal border-slate-400 text-slate-700">
                                    Original order (superseded — not dispensed)
                                  </Badge>
                                )}
                                {med.substitution && <span className="text-amber-600 text-sm">🔄 Substituted</span>}
                              </h5>
                              {joinDisplayParts([med.route, med.frequency, med.duration]) ? (
                                <p className="text-sm text-muted-foreground">{joinDisplayParts([med.route, med.frequency, med.duration])}</p>
                              ) : null}
                              {med.substitution && (
                                <p className="text-xs text-amber-700 mt-1">Originally: {med.originalMedication}</p>
                              )}
                            </div>
                          <Badge variant="outline" className={getMedicationStatusColor(med.status || '')}>
                            {med.status || ''}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                          {med.dosage != null && String(med.dosage).trim() !== '' && (
                            <div><span className="text-muted-foreground">Dose:</span> <span className="font-medium">{med.dosage}</span></div>
                          )}
                          {(med.quantity != null && String(med.quantity).trim() !== '') || (med.unit != null && String(med.unit).trim() !== '') ? (
                            <div><span className="text-muted-foreground">Prescribed:</span> <span className="font-medium">{joinDisplayParts([med.quantity, med.unit])}</span></div>
                          ) : null}
                          <div>
                            <span className="text-muted-foreground">Dispensed:</span>{' '}
                            <span className="font-medium text-blue-600">
                              {med.dispensed_quantity || med.dispensed || 0}
                              {med.unit ? ` ${med.unit}` : ''}
                              {Number(med.stock_dispensed_quantity || 0) > 0 && med.stock_dispensed_unit
                                ? ` (${med.stock_dispensed_quantity} ${med.stock_dispensed_unit})`
                                : ''}
                            </span>
                          </div>
                          <div>
                            <span className="text-muted-foreground">Remaining:</span>{' '}
                            <span className={`font-medium ${(med.quantity - (med.dispensed_quantity || med.dispensed || 0)) <= 0 ? 'text-green-600' : 'text-orange-600'}`}>
                              {Math.max(0, (med.quantity - (med.dispensed_quantity || med.dispensed || 0)))} {med.unit || ''}
                            </span>
                          </div>
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
        <Dialog open={showDispenseModal} onOpenChange={setShowDispenseModal}>
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
                      <span className="font-medium">{selectedPrescription.patient_details?.name ?? ''}</span>
                      {(() => {
                        const sub = joinDisplayParts([
                          selectedPrescription.patient_details?.patient_id
                            ? `ID: ${selectedPrescription.patient_details.patient_id}`
                            : '',
                          selectedPrescription.patient_details?.age != null &&
                          selectedPrescription.patient_details.age !== ''
                            ? `${selectedPrescription.patient_details.age}y`
                            : '',
                          selectedPrescription.patient_details?.gender,
                        ]);
                        return sub ? (
                          <span className="text-muted-foreground"> • {sub}</span>
                        ) : null;
                      })()}
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

                <Icd10DiagnosesBlock diagnoses={(selectedPrescription as any).icd10_diagnoses} compact />

                {/* Prescription Details */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-muted/30 rounded-lg p-4 text-sm">
                  {selectedPrescription.patient_details?.patient_id && (
                    <div><span className="text-muted-foreground">Patient ID:</span> <span className="font-medium">{selectedPrescription.patient_details.patient_id}</span></div>
                  )}
                  {selectedPrescription.doctor_name && (
                    <div><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">{selectedPrescription.doctor_name}</span></div>
                  )}
                  {selectedPrescription.visit_details?.clinic && (
                    <div><span className="text-muted-foreground">Clinic:</span> <span className="font-medium">{selectedPrescription.visit_details.clinic}</span></div>
                  )}
                  {(selectedPrescription.prescribed_at || selectedPrescription.date) && (
                    <div>
                      <span className="text-muted-foreground">Date:</span>{' '}
                      <span className="font-medium">
                        {selectedPrescription.prescribed_at
                          ? new Date(selectedPrescription.prescribed_at).toLocaleDateString()
                          : selectedPrescription.date}
                      </span>
                    </div>
                  )}
                </div>

                {/* Dispensing History */}
                {selectedPrescriptionMedications.some(med => isActiveDispenseLine(med) && (med.dispensed_quantity || med.dispensed || 0) > 0) && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 text-blue-700 dark:text-blue-400 font-medium mb-3">
                      <Package className="h-4 w-4" />
                      Dispensing History
                    </div>
                    <div className="space-y-2">
                      {selectedPrescriptionMedications
                        .filter(med => isActiveDispenseLine(med) && (med.dispensed_quantity || med.dispensed || 0) > 0)
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

                {selectedPrescriptionMedications.some((m: any) => m.prescribing_record_only) && (
                  <div className="rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-600 dark:bg-slate-900/40 p-4 mb-4">
                    <h4 className="font-medium mb-1 flex items-center gap-2 text-slate-800 dark:text-slate-200">
                      <FileText className="h-4 w-4" />
                      Originally prescribed (record only)
                    </h4>
                    <p className="text-xs text-muted-foreground mb-3">
                      The prescriber ordered this combination product. It was split into separate ingredient lines below—dispense those lines only.
                    </p>
                    <div className="space-y-2">
                      {selectedPrescriptionMedications
                        .filter((m: any) => m.prescribing_record_only)
                        .map((med: any) => (
                          <div
                            key={med.id}
                            className="rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-950/30 px-3 py-2 text-sm"
                          >
                            <div className="font-medium">{med.name}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {med.route} • {med.frequency} • {med.duration}
                            </div>
                            <div className="text-xs text-muted-foreground mt-0.5">
                              Qty {med.quantity} {med.unit || ''}
                              {med.strength ? ` • ${med.strength}` : ''}
                            </div>
                            {med.instructions ? (
                              <div className="text-xs mt-1 text-slate-700 dark:text-slate-300">
                                <span className="font-medium">Instructions:</span> {med.instructions}
                              </div>
                            ) : null}
                          </div>
                        ))}
                    </div>
                  </div>
                )}

                {/* Medications to Dispense */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <Pill className="h-4 w-4 text-violet-500" />
                    Medications ({selectedPrescriptionMedications.filter((med: any) => isActiveDispenseLine(med) && (med.status === 'Available' || med.status === 'Low Stock' || med.status === 'Out of Stock' || med.status === 'Partially Dispensed' || med.status === 'Pending')).length})
                  </h4>
                  <div className="space-y-3">
                    {selectedPrescriptionMedications
                      .filter(
                        (med: any) =>
                          isActiveDispenseLine(med) &&
                          (med.status === 'Available' ||
                            med.status === 'Low Stock' ||
                            med.status === 'Out of Stock' ||
                            med.status === 'Partially Dispensed' ||
                            med.status === 'Pending')
                      )
                      .map((med) => {
                      const isSelected = selectedMedications.includes(med.id);
                      const isAvailable = (med as any).status === 'Available' || (med as any).status === 'Low Stock' || (med as any).status === 'Partially Dispensed';
                      const isPendingGeneric = (med as any).status === 'Pending'; // Generics need selection
                      const needsBrandBeforeSelect = isPendingGeneric && !(med as any).medication;
                      const usesPackDispensing = isPackDispenseMedication(med);
                      const packSizeMl = getPackSizeMl(med);
                                      const batches = medicationBatches[med.id] || [];
                                      // Substitution details are displayed in UI; no runtime logging needed.
                      const hasSubstitute = false;
                      
                      return (
                        <div 
                          key={med.id} 
                          className={`border rounded-lg p-4 ${!isAvailable && !isPendingGeneric ? 'opacity-60 bg-muted/50' : isSelected ? 'border-violet-300 bg-violet-50/50 dark:bg-violet-900/10' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              disabled={needsBrandBeforeSelect || (!isAvailable && !isPendingGeneric)}
                              onCheckedChange={(checked) => handleMedicationSelection(
                                med.id,
                                checked as boolean,
                                Math.max(0, Number((med as any).remaining_quantity ?? med.quantity ?? 0))
                              )}
                              className="mt-1 h-5 w-5 flex-shrink-0"
                              id={`med-${med.id}`}
                            />
                            <div
                              className={`flex-1 ${needsBrandBeforeSelect ? 'cursor-default' : 'cursor-pointer'}`}
                              onClick={() => {
                                if (needsBrandBeforeSelect) return;
                                if (isAvailable || isPendingGeneric) {
                                  handleMedicationSelection(
                                    med.id,
                                    !isSelected,
                                    Math.max(0, Number((med as any).remaining_quantity ?? med.quantity ?? 0))
                                  );
                                }
                              }}
                            >
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <h5 className="font-medium">
                                    {med.name}
                                    {(med as any).strength &&
                                    !String(med.name || '').toLowerCase().includes(String((med as any).strength || '').toLowerCase()) && (
                                      <span className="font-normal text-muted-foreground ml-1">{(med as any).strength}</span>
                                    )}
                                  </h5>
                                  {(() => {
                                    const sub = (med as any).substitution;
                                    const original = (med as any).originalMedication;
                                    const previousBrand = sub?.previous_brand;
                                    const isFirstBrandSelection = sub?.reason === 'brand_selection' && sub?.is_first_brand_selection !== false;

                                    if (!sub && !original) return null;

                                    return (
                                      <div className="space-y-0.5">
                                        {sub?.reason === 'brand_selection' && previousBrand && (
                                          <p className="text-xs text-emerald-600 dark:text-emerald-400">
                                            {isFirstBrandSelection
                                              ? `✓ Brand selected: ${med.name}`
                                              : `🔁 Brand switched from ${previousBrand}`}
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
                                  <p className="text-xs text-muted-foreground">
                                    {med.route}
                                    {med.frequency ? ` • ${med.frequency}` : ''}
                                    {med.duration ? ` • ${med.duration}` : ''}
                                  </p>
                                  {(med as any).can_split_combo && Array.isArray((med as any).combo_components) && (med as any).combo_components.length > 1 && (
                                    <p className="text-xs text-fuchsia-600 dark:text-fuchsia-400 mt-1">
                                      Combo components: {(med as any).combo_components.join(' + ')}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge 
                                    variant="outline" 
                                    className={getMedicationStatusColor(med.status)}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    {med.status}
                                  </Badge>
                                  {/* Select Brand Button - Always available for brand selection */}
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 mr-2"
                                    disabled={isLoadingBrands}
                                    onClick={async (e) => {
                                      e.stopPropagation();

                                      // OPTIMISTIC UI: Open modal immediately
                                      setSubstitutionMed(med);
                                      setSubstituteSearchResults([]);
                                      setSubstitutionForm({
                                        reason: 'brand_selection',
                                        selectedSubstitute: '',
                                        selectedSubstituteBrand: '',
                                        notes: '',
                                      });
                                      setSubstituteSearchQuery('');
                                      setBrandSelectionTargetName('');
                                      setBrandSelectionMode('select');
                                      setShowSubstitutionModal(true);
                                       setIsLoadingBrands(true);

                                       try {
                                        let genericId = resolveGenericIdForBrandSelect(med);
                                        let targetName =
                                          (med as any).name || (med as any).medication_details?.name || '';

                                        if (!genericId && (med as any).medication) {
                                          const medDetail = await getCachedMedication(Number((med as any).medication));
                                          genericId =
                                            parseNumericId(medDetail?.generic?.id) ??
                                            resolveGenericIdForBrandSelect(medDetail) ??
                                            null;
                                          const g = medDetail?.generic as { name?: string } | undefined;
                                          targetName =
                                            (g && typeof g === 'object' && g.name) || targetName;
                                        }

                                        setBrandSelectionTargetName(targetName);
                                        brandSelectionGenericIdRef.current = genericId;

                                         if (genericId) {
                                           performSubstituteSearch('', 'brand_selection');
                                         } else {
                                          setSubstituteSearchResults([]);
                                          toast.error('Prescribed ingredient not found for this line');
                                        }
                                      } catch (err) {
                                        console.error('Failed to load brand data:', err);
                                        setSubstituteSearchResults([]);
                                        toast.error('Failed to load brands');
                                      } finally {
                                        setIsLoadingBrands(false);
                                      }
                                    }}
                                    >
                                      <>
                                        <Tag className="h-3 w-3 mr-1" />
                                        Select Brand
                                      </>
                                    </Button>

                                    {(med as any).can_split_combo && (
                                    <AlertDialog open={splitComboAlertOpen} onOpenChange={(open) => {
                                      setSplitComboAlertOpen(open);
                                      if (!open) setMedToSplit(null);
                                    }}>
                                      <AlertDialogTrigger asChild>
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          className="h-7 text-xs border-fuchsia-300 text-fuchsia-700 hover:bg-fuchsia-50 mr-2"
                                          disabled={Boolean(splittingComboItemId)}
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setMedToSplit(med);
                                          }}
                                        >
                                          {splittingComboItemId === String(med.id) ? (
                                            <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                                          ) : (
                                            <GitBranch className="h-3 w-3 mr-1" />
                                          )}
                                          Split Combo
                                        </Button>
                                      </AlertDialogTrigger>
                                      <AlertDialogContent>
                                        <AlertDialogHeader>
                                          <AlertDialogTitle>Split Combo Medication</AlertDialogTitle>
                                          <AlertDialogDescription>
                                            Split this combo into separate ingredient lines? Missing component generics will be auto-created as placeholders so you can substitute during dispensing.
                                          </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                                          <AlertDialogAction
                                            onClick={async () => {
                                              setSplitComboAlertOpen(false);
                                              await handleSplitComboMedication(medToSplit);
                                              setMedToSplit(null);
                                            }}
                                          >
                                            Split Combo
                                          </AlertDialogAction>
                                        </AlertDialogFooter>
                                      </AlertDialogContent>
                                    </AlertDialog>
                                    )}

                                    {/* Substitute Button - Always available for medication substitution */}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                      disabled={isLoadingSubstitutes}
                                    onClick={async (e) => {
                                      e.stopPropagation();

                                      // OPTIMISTIC UI: Open modal immediately
                                      setSubstitutionMed(med);
                                      setSubstituteSearchResults([]);
                                      setSubstituteBrandOptions([]);
                                      setSubstitutionForm({
                                        reason: 'out_of_stock',
                                        selectedSubstitute: '',
                                        selectedSubstituteBrand: '',
                                        notes: '',
                                      });
                                      setSubstituteSearchQuery('');
                                      brandSelectionGenericIdRef.current = null;
                                       setShowSubstitutionModal(true);

                                      // BACKGROUND LOADING: Load initial substitute options
                                      try {
                                        setIsLoadingSubstitutes(true);
                                        // performSubstituteSearch will be triggered by the modal's useEffect
                                        // when the modal opens and detect the reason change
                                      } catch (err) {
                                        console.error('Failed to initialize substitution:', err);
                                        toast.error('Failed to load substitution options');
                                      } finally {
                                        setIsLoadingSubstitutes(false);
                                      }
                                    }}
                                    >
                                      <ArrowRightLeft className="h-3 w-3 mr-1" />
                                      Substitute
                                    </Button>
                                </div>
                              </div>
                              
                              {isSelected && isAvailable && (
                                <div className="space-y-3 mt-3 pt-3 border-t" onClick={(e) => e.stopPropagation()}>
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    {/* Quantity */}
                                    <div>
                                      <Label className="text-xs">
                                        Quantity to Dispense {usesPackDispensing ? '(bottles)' : ''}
                                      </Label>
                                      {(med as any).remaining_quantity <= 0 ? (
                                        <div className="h-8 mt-1 flex items-center px-3 bg-muted text-muted-foreground text-sm rounded">
                                          Fully dispensed
                                        </div>
                                      ) : (
                                        <Input
                                          type="number"
                                          min="1"
                                          step="1"
                                          value={dispenseQuantities[med.id] ?? getDefaultDispenseQuantity(med)}
                                          onChange={(e) => {
                                            const inputValue = Math.max(1, parseInt(e.target.value) || 1);
                                            setDispenseQuantities(prev => ({
                                              ...prev,
                                              [med.id]: inputValue
                                            }));
                                          }}
                                          className="h-8 mt-1"
                                        />
                                      )}
                                      <div className="text-[10px] text-muted-foreground mt-1 space-y-1">
                                        <div>
                                          {joinDisplayParts([
                                            med.quantity != null && med.quantity !== '' ? `Prescribed: ${med.quantity}` : '',
                                            Array.isArray(batches)
                                              ? `Available: ${batches.reduce((total, b) => total + Number(b.quantity || 0), 0)}`
                                              : '',
                                          ])}
                                        </div>
                                        {usesPackDispensing && (
                                          <div>
                                            Clinical unit: {med.unit || 'ml'}
                                            {packSizeMl ? ` • Pack size: ${packSizeMl} ml per bottle` : ' • Pack size not set'}
                                          </div>
                                        )}
                                        {(med as any).dispensed_quantity > 0 && (
                                        <div className={(med as any).remaining_quantity < 0 ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}>
                                          Already dispensed: {(med as any).dispensed_quantity} • Remaining: {Math.max(0, (med as any).remaining_quantity)}
                                          {(med as any).remaining_quantity < 0 && " (Over-dispensed)"}
                                          </div>
                                        )}
                                      </div>
                                    </div>

                                    {usesPackDispensing && (
                                      <div>
                                        <Label className="text-xs">Clinical Quantity Covered ({med.unit || 'ml'})</Label>
                                        {(med as any).remaining_quantity <= 0 ? (
                                          <div className="h-8 mt-1 flex items-center px-3 bg-muted text-muted-foreground text-sm rounded">
                                            Fully covered
                                          </div>
                                        ) : (
                                          <Input
                                            type="number"
                                            min="1"
                                            value={dispenseCoverageQuantities[med.id] ?? getDefaultCoverageQuantity(med)}
                                            onChange={(e) => {
                                              const inputValue = Math.max(1, parseInt(e.target.value) || 1);
                                              setDispenseCoverageQuantities(prev => ({
                                                ...prev,
                                                [med.id]: inputValue
                                              }));
                                            }}
                                            className="h-8 mt-1"
                                          />
                                        )}
                                        <div className="text-[10px] text-muted-foreground mt-1">
                                          Use this to mark how much prescribed volume this bottle quantity covers.
                                        </div>
                                      </div>
                                    )}
                                    
                                    {/* Stock Info */}
                                    <div>
                                      <Label className="text-xs">Stock Available</Label>
                                      {(() => {
                                        const stock = Array.isArray(batches)
                                          ? batches.reduce((total, b) => total + Number(b.quantity || 0), 0)
                                          : null;
                                        if (stock === null) {
                                          return <div className="mt-1 min-h-[2.25rem] rounded bg-muted/50" aria-hidden />;
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
              <Button
                variant="outline"
                onClick={() => {
                  setShowDispenseModal(false);
                  setSelectedMedications([]);
                  setDispenseQuantities({});
                  setDispenseCoverageQuantities({});
                  setSelectedBatches({});
                }}
              >
                Cancel
              </Button>
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
                    Select Brand for Dispensing
                    {isLoadingBrands && <span className="text-xs font-normal text-muted-foreground ml-2">(Loading...)</span>}
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="h-5 w-5 text-amber-500" />
                    Substitute Medication
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
                {/* Original Medication - what the doctor ordered */}
                <div className="p-3 rounded-lg bg-muted/50 border">
                  <p className="text-xs text-muted-foreground mb-1">Original Medication (Doctor&apos;s order)</p>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium">
                        {substitutionMed.name}
                        {(substitutionMed as any).strength &&
                        !String(substitutionMed.name || '').toLowerCase().includes(String((substitutionMed as any).strength || '').toLowerCase()) && (
                          <span className="font-normal text-muted-foreground ml-1">{(substitutionMed as any).strength}</span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {substitutionMed.route}
                        {substitutionMed.frequency ? ` • ${substitutionMed.frequency}` : ''}
                        {substitutionMed.duration ? ` • ${substitutionMed.duration}` : ''}
                        {` • Qty: ${substitutionMed.quantity}`}
                      </p>
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
                    {substitutionForm.reason === 'brand_selection' ? 'Search Brand *' : 'Search Substitute Generic *'}
                  </Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={substituteSearchQuery}
                      onChange={(e) => {
                        const val = e.target.value;
                        setSubstituteSearchQuery(val);
                        // Debounced server-side search to avoid UI stalls
                        if (brandSelectionTimeoutRef.current) clearTimeout(brandSelectionTimeoutRef.current);
                        if (substituteTimeoutRef.current) clearTimeout(substituteTimeoutRef.current);
                        if (substitutionForm.reason === 'brand_selection') {
                          brandSelectionTimeoutRef.current = setTimeout(() => {
                            void performSubstituteSearch(val, 'brand_selection');
                          }, 220);
                        } else {
                          substituteTimeoutRef.current = setTimeout(() => {
                            void performSubstituteSearch(val, 'substitute');
                          }, 260);
                        }
                      }}
                      placeholder={
                        substitutionForm.reason === 'brand_selection'
                          ? 'Type to filter brands...'
                          : 'Search generics...'
                      }
                      className="pl-10"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {substitutionForm.reason === 'brand_selection'
                      ? 'Find the specific brand to dispense'
                      : 'Find an alternative generic to substitute'}
                  </p>
                </div>

                {/* Available Substitutes - Brands for Select Brand, Generics for Substitute */}
                <div className="space-y-2 max-h-[180px] overflow-y-auto border rounded-lg p-2">
                  {isSearchingSubstitutes ? (
                    <div className="flex items-center justify-center py-8 text-muted-foreground">
                      <Loader2 className="h-6 w-6 animate-spin mr-2" />
                      Searching...
                    </div>
                  ) : (() => {
                    // Both modals use substituteSearchResults from server-side search
                    const displayedOptions = substituteSearchResults;
                    return displayedOptions.length > 0 ? (
                    displayedOptions
                      .sort((a, b) => (b.stock || 0) - (a.stock || 0))
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
                              {sub.type !== 'generic' && (
                                <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                                  <span>Stock: <strong className={(sub.stock || 0) < 50 ? 'text-red-600' : 'text-emerald-600'}>{Math.round(sub.stock || 0).toLocaleString()}</strong></span>
                                  {sub.expiryDate ? (
                                    <span>Exp: <strong className={sub.isNearExpiry ? 'text-amber-600' : ''}>{sub.expiryDate}</strong></span>
                                  ) : null}
                                </div>
                              )}
                            </div>
                          ))
                  ) : substitutionForm.reason === 'brand_selection' ? (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No brands available in dispensary for this generic.
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground text-sm">
                      No generics found{substituteSearchQuery ? ` matching "${substituteSearchQuery}"` : ''}
                    </div>
                  )
                })()}
                </div>

                {/* Brand selection when substituting with generic */}
                {substitutionForm.reason !== 'brand_selection' &&
                  substituteSearchResults.find((s) => s.id === substitutionForm.selectedSubstitute)?.type === 'generic' && (
                  <div className="space-y-2">
                    <Label className="text-sm">Select brand to dispense *</Label>
                    {isLoadingSubstituteBrands ? (
                      <div className="flex items-center gap-2 py-4 text-muted-foreground">
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Loading brands...
                      </div>
                    ) : substituteBrandOptions.length > 0 ? (
                      <div className="space-y-2 max-h-[140px] overflow-y-auto border rounded-lg p-2">
                        {substituteBrandOptions.map((brand) => (
                          <div
                            key={brand.id}
                            onClick={() =>
                              setSubstitutionForm((f) => ({ ...f, selectedSubstituteBrand: brand.id }))
                            }
                            className={`p-2.5 rounded-lg border cursor-pointer transition-all ${
                              substitutionForm.selectedSubstituteBrand === brand.id
                                ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                : 'border-transparent hover:border-emerald-300 hover:bg-muted/50'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-medium text-sm">{brand.name}</span>
                              {substitutionForm.selectedSubstituteBrand === brand.id && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />
                              )}
                            </div>
                            <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                              <span>
                                Stock:{' '}
                                <strong
                                  className={
                                    (brand.stock || 0) < 50 ? 'text-red-600' : 'text-emerald-600'
                                  }
                                >
                                  {Math.round(brand.stock || 0).toLocaleString()}
                                </strong>
                              </span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground py-2">
                        No in-stock brands available for this generic.
                      </p>
                    )}
                  </div>
                )}

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
                {substitutionForm.reason &&
                  substitutionForm.selectedSubstitute &&
                  (substitutionForm.reason === 'brand_selection' ||
                    substituteSearchResults.find((s) => s.id === substitutionForm.selectedSubstitute)?.type !== 'generic' ||
                    substitutionForm.selectedSubstituteBrand) && (
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
                          <>Dispensing <strong>{(substituteSearchResults.find(s => s.id === substitutionForm.selectedSubstitute))?.name}</strong> for <strong>{substitutionMed.name}</strong></>
                        ) : (() => {
                          const sel = substituteSearchResults.find((s) => s.id === substitutionForm.selectedSubstitute);
                          const brandName =
                            sel?.type === 'generic' && substitutionForm.selectedSubstituteBrand
                              ? substituteBrandOptions.find((b) => b.id === substitutionForm.selectedSubstituteBrand)?.name
                              : sel?.name;
                          return (
                            <>
                              <strong>{substitutionMed.name}</strong> → <strong>{brandName || sel?.name}</strong>
                            </>
                          );
                        })()}
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
                disabled={
                  !substitutionForm.reason ||
                  !substitutionForm.selectedSubstitute ||
                  (substitutionForm.reason !== 'brand_selection' &&
                    substituteSearchResults.find((s) => s.id === substitutionForm.selectedSubstitute)?.type === 'generic' &&
                    !substitutionForm.selectedSubstituteBrand)
                }
                onClick={async () => {
                  if (!selectedPrescription) return;

                  // Check both availableSubstitutes (suggested) and allAvailableMedications (searched)
                  const selectedSub = substituteSearchResults.find(s => s.id === substitutionForm.selectedSubstitute);
                  if (selectedSub && substitutionMed) {
                    try {
                      let medicationIdToUse = selectedSub.id;
                      let resolvedMedicationName = selectedSub.name;

                      if (selectedSub.type === 'generic') {
                        const brandId = substitutionForm.selectedSubstituteBrand;
                        let brand = substituteBrandOptions.find((b) => b.id === brandId);
                        if (!brand && brandId) {
                          try {
                            const genericId = Number(selectedSub.id);
                            const refreshedBrands = await pharmacyService.getMedications({
                              generic: genericId,
                              page_size: 100,
                            });
                            const mapped = (refreshedBrands.results || []).map((b: any) => ({
                              id: String(b.id),
                              name: b.name || '',
                              strength: b.strength || '',
                              type: 'brand' as const,
                              stock: null,
                              expiryDate: '',
                              daysToExpiry: 0,
                              unitPrice: 0,
                              isNearExpiry: false,
                            }));
                            brand = mapped.find((b) => b.id === brandId);
                            if (mapped.length > 0) {
                              setSubstituteBrandOptions(mapped);
                            }
                          } catch (err) {
                            console.error('Failed to refresh brand list for generic substitution:', err);
                          }
                        }
                        if (!brand) {
                          toast.error(`Please select a brand to dispense for "${selectedSub.name}"`);
                          return;
                        }
                        medicationIdToUse = brand.id;
                        resolvedMedicationName = brand.name;
                      }
                      
                      // Call API to persist the substitution
                      await pharmacyService.substitutePrescriptionItem(
                        selectedPrescription.id,
                        substitutionMed.id, // prescription item ID
                        medicationIdToUse, // new medication ID
                        substitutionForm.reason,
                        substitutionForm.notes
                      );
                      
                      // Reload prescriptions list to reflect substitution in the UI
                      await loadPrescriptions();

                      const prescriptionId = parseInt(String(selectedPrescription.id)) || Number(selectedPrescription.id);
                      const refreshed = await pharmacyService.getPrescription(prescriptionId);
                      let transformed = transformMedications(refreshed.medications as any, selectedPrescription.status);

                      if (substitutionMed) {
                        const selectedMedicationDetails = await pharmacyService.getMedication(Number(medicationIdToUse));
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
                            medication_details: {
                              ...(m.medication_details || {}),
                              id: selectedMedicationDetails.id,
                              medication_id: selectedMedicationDetails.id,
                              name: selectedMedicationDetails.name,
                              unit: selectedMedicationDetails.unit || m.medication_details?.unit,
                              form: selectedMedicationDetails.form || m.medication_details?.form,
                              strength: selectedMedicationDetails.strength || m.medication_details?.strength,
                              pack_size: selectedMedicationDetails.pack_size ?? m.medication_details?.pack_size,
                              type: 'brand',
                            },
                            stockLevel: stock,
                            status,
                            substitution: {
                              reason: substitutionForm.reason,
                              medication_id: medicationIdToUse,
                              name: resolvedMedicationName,
                              ...(substitutionForm.reason === 'brand_selection'
                                ? {
                                    previous_brand: previousBrandName,
                                    is_first_brand_selection: !Boolean((substitutionMed as any).medication),
                                  }
                                : {}),
                            },
                            originalMedication: preservedOriginalMedication,
                          };
                        });
                      }

                      setSelectedPrescriptionMedications(transformed);
                      setSelectedPrescription((prev: any) => prev ? { ...prev, medications: transformed } : prev);

                      if (substitutionForm.reason === 'brand_selection') {
                        const mid = String(substitutionMed.id);
                        const updatedRow = transformed.find((m: any) => m.id === mid);
                        if (updatedRow) {
                          setSelectedMedications((prev) => (prev.includes(mid) ? prev : [...prev, mid]));
                          setDispenseQuantities((prev) => ({
                            ...prev,
                            [mid]: prev[mid] ?? getDefaultDispenseQuantity(updatedRow),
                          }));
                          setDispenseCoverageQuantities((prev) => ({
                            ...prev,
                            [mid]: prev[mid] ?? getDefaultCoverageQuantity(updatedRow),
                          }));
                        }
                      }

                      const actionType = substitutionForm.reason === 'brand_selection' ? 'Brand Selection' : 'Substitution';
                      toast.success(`${actionType}: ${substitutionMed.name} → ${resolvedMedicationName}`);
                      setShowSubstitutionModal(false);

                      // Reset form
                      setSubstitutionForm({ reason: '', selectedSubstitute: '', selectedSubstituteBrand: '', notes: '' });
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
