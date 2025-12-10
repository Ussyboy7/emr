"use client";

import { useState, useMemo, useEffect } from 'react';
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
import { pharmacyService, type Prescription as ApiPrescription } from '@/lib/services';
import { 
  ClipboardList, Search, Eye, Clock, CheckCircle2, Pill, Calendar,
  AlertTriangle, Package, User, RefreshCw, Activity, Stethoscope,
  ArrowRight, XCircle, Printer, ShieldAlert, ArrowRightLeft, Info,
  FileText, Beaker, Hash, Loader2
} from 'lucide-react';
import type { Prescription, PrescriptionStatus, Priority, DrugInteraction, MedicationBatch, SubstituteOption, MedicationItem } from './TYPES';

// Substitution reasons
const substitutionReasons = [
  { value: 'out_of_stock', label: 'Out of Stock', icon: '📦', description: 'Original medication not available' },
  { value: 'near_expiry', label: 'Near Expiry Stock', icon: '⏰', description: 'Pushing out stock close to expiration' },
  { value: 'patient_preference', label: 'Patient Preference', icon: '👤', description: 'Patient requested different brand/generic' },
  { value: 'cost_savings', label: 'Cost Savings', icon: '💰', description: 'More affordable alternative available' },
  { value: 'clinical_decision', label: 'Clinical Decision', icon: '⚕️', description: 'Pharmacist/doctor clinical recommendation' },
  { value: 'formulary_change', label: 'Formulary Change', icon: '📋', description: 'Hospital formulary updated' },
  { value: 'allergy_concern', label: 'Allergy/Sensitivity', icon: '⚠️', description: 'Concern about patient reaction' },
  { value: 'other', label: 'Other', icon: '📝', description: 'Other reason - specify in notes' },
];

// Check for drug interactions - TODO: Connect to API
const checkInteractions = async (medications: string[]): Promise<DrugInteraction[]> => {
  // TODO: Implement API call for drug interaction checking
  return [];
};

// Get medication batches - uses pharmacyService

// Get substitutes for medication - uses pharmacyService
const getSubstitutesForMedication = async (medicationName: string): Promise<SubstituteOption[]> => {
  try {
    // Search for medications with similar names (generic alternatives)
    const response = await pharmacyService.getMedications({ search: medicationName, page: 1 });
    return response.results.slice(0, 10).map((m: any) => ({
      id: m.id.toString(),
      name: m.name,
      strength: m.strength || '',
      type: m.generic_name ? 'generic' : 'brand',
      stock: 0, // Would need to get from inventory
      expiryDate: '',
      daysToExpiry: 0,
      unitPrice: 0,
      isNearExpiry: false,
    }));
  } catch (err) {
    console.error('Error loading substitutes:', err);
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
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  // Load prescriptions from API
  useEffect(() => {
    loadPrescriptions();
  }, [currentPage, statusFilter]);

  const loadPrescriptions = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await pharmacyService.getPrescriptions({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        page: currentPage,
        search: searchQuery || undefined,
      });
      // Transform API data - extract patient and visit details
      const transformed = await Promise.all(response.results.map(async (rx: any) => {
        // Extract patient details from prescription or visit
        const patientDetails = rx.patient_details || {};
        const visitDetails = rx.visit_details || {};
        const patientId = rx.patient?.toString() || patientDetails.id || '';
        const patientName = rx.patient_name || patientDetails.name || 'Unknown';
        const patientMRN = patientDetails.mrn || patientDetails.patient_id || '';
        const patientAge = patientDetails.age || 0;
        const patientGender = patientDetails.gender || '';
        const patientPhone = patientDetails.phone_number || patientDetails.phone || '';
        const patientAllergies = patientDetails.allergies || [];
        
        // Extract visit/clinic details
        const clinic = visitDetails.clinic || (visitDetails.consultation_room?.name) || '';
        const location = patientDetails.location || visitDetails.location || '';
        
        // Extract doctor details
        const doctorName = rx.doctor_name || '';
        const doctorId = rx.doctor?.toString() || '';
        
        // Calculate wait time
        const prescribedAt = new Date(rx.prescribed_at);
        const now = new Date();
        const waitTimeMs = now.getTime() - prescribedAt.getTime();
        const waitTime = Math.floor(waitTimeMs / 60000); // minutes
        
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
        const medications = (rx.medications || []).map((med: any) => {
          // Determine medication status
          let status: 'Available' | 'Low Stock' | 'Out of Stock' | 'Pending' | 'Dispensed' = 'Pending';
          if (med.is_dispensed) {
            status = 'Dispensed';
          } else if (med.medication_details?.current_stock !== undefined) {
            const stock = med.medication_details.current_stock;
            if (stock === 0) status = 'Out of Stock';
            else if (stock < 50) status = 'Low Stock';
            else status = 'Available';
          } else {
            status = 'Pending';
          }
          
          return {
            id: med.id.toString(),
            name: med.medication_name || med.medication_details?.name || '',
            dosage: med.dosage || '',
            frequency: med.frequency || med.frequency_display || '',
            duration: med.duration || '',
            quantity: Number(med.quantity),
            route: med.route || med.route_display || 'Oral',
            instructions: med.instructions || '',
            status,
            stockLevel: med.medication_details?.current_stock || 0,
          };
        });
        
        return {
          id: rx.id?.toString() || rx.prescription_id || '',
          patient: { 
            name: patientName, 
            id: patientId, 
            mrn: patientMRN, 
            age: patientAge, 
            gender: patientGender, 
            allergies: patientAllergies, 
            phone: patientPhone 
          },
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
        };
      }));
      setPrescriptions(transformed as Prescription[]);
    } catch (err: any) {
      setError(err.message || 'Failed to load prescriptions');
      console.error('Error loading prescriptions:', err);
    } finally {
      setLoading(false);
    }
  };
  
  // Modal states
  const [selectedPrescription, setSelectedPrescription] = useState<Prescription | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showDispenseModal, setShowDispenseModal] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);
  const [dispenseQuantities, setDispenseQuantities] = useState<Record<string, number>>({});
  const [dispenseNotes, setDispenseNotes] = useState('');
  const [selectedBatches, setSelectedBatches] = useState<Record<string, string>>({});
  const [medicationBatches, setMedicationBatches] = useState<Record<string, MedicationBatch[]>>({});
  const [counselingChecklist, setCounselingChecklist] = useState<Record<string, boolean>>({
    dosageExplained: false,
    sideEffectsDiscussed: false,
    storageInstructions: false,
    interactionsWarned: false,
    followUpAdvised: false,
  });
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
  const [substituteSearchQuery, setSubstituteSearchQuery] = useState('');

  // Filter prescriptions
  const filteredPrescriptions = useMemo(() => {
    return prescriptions.filter(rx => {
      const matchesSearch = 
        rx.patient.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
        rx.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
        rx.patient.mrn.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'all' || rx.status.toLowerCase() === statusFilter.toLowerCase();
      const matchesPriority = priorityFilter === 'all' || rx.priority.toLowerCase() === priorityFilter.toLowerCase();
      return matchesSearch && matchesStatus && matchesPriority;
    });
  }, [prescriptions, searchQuery, statusFilter, priorityFilter]);

  // Paginated prescriptions
  const paginatedPrescriptions = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    return filteredPrescriptions.slice(startIndex, startIndex + itemsPerPage);
  }, [filteredPrescriptions, currentPage, itemsPerPage]);

  // Reset to page 1 when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, statusFilter, priorityFilter]);

  // Calculate stats
  const stats = useMemo(() => ({
    pending: prescriptions.filter(r => r.status === 'Pending').length,
    processing: prescriptions.filter(r => r.status === 'Processing').length,
    ready: prescriptions.filter(r => r.status === 'Ready').length,
    onHold: prescriptions.filter(r => r.status === 'On Hold').length,
    emergency: prescriptions.filter(r => r.priority === 'Emergency').length,
    avgWaitTime: Math.round(prescriptions.reduce((sum, r) => sum + r.waitTime, 0) / prescriptions.length) || 0
  }), [prescriptions]);

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
      case 'Dispensed': return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400';
      default: return 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400';
    }
  };

  const handleViewDetails = (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    setShowViewModal(true);
  };

  const handleStartDispense = async (prescription: Prescription) => {
    setSelectedPrescription(prescription);
    const initialQuantities: Record<string, number> = {};
    const initialSelection: string[] = [];
    const initialBatches: Record<string, string> = {};
    const loadedBatches: Record<string, MedicationBatch[]> = {};
    
    // Load batches for each medication
    const batchPromises = prescription.medications.map(async (med) => {
      if (med.status === 'Available' || med.status === 'Low Stock') {
        initialQuantities[med.id] = med.quantity;
        initialSelection.push(med.id);
        
        // Load batches for this medication
        try {
          // Get medication ID from the prescription item
          const prescriptionId = parseInt(prescription.id) || prescription.id;
          const rxDetail = await pharmacyService.getPrescription(typeof prescriptionId === 'number' ? prescriptionId : parseInt(prescriptionId));
          const rxMed = rxDetail.medications.find((m: any) => m.id.toString() === med.id);
          if (rxMed && rxMed.medication) {
            const batches = await pharmacyService.getMedicationBatches(rxMed.medication);
            loadedBatches[med.id] = batches;
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
    
    // Check for drug interactions
    const medNames = prescription.medications.map(m => m.name);
    const interactions = await checkInteractions(medNames);
    setDetectedInteractions(interactions);
    setInteractionAcknowledged(interactions.length === 0);
    
    setDispenseQuantities(initialQuantities);
    setSelectedMedications(initialSelection);
    setSelectedBatches(initialBatches);
    setDispenseNotes('');
    setCounselingChecklist({
      dosageExplained: false,
      sideEffectsDiscussed: false,
      storageInstructions: false,
      interactionsWarned: false,
      followUpAdvised: false,
    });
    setShowDispenseModal(true);
  };

  const handleMedicationSelection = async (medId: string, checked: boolean, quantity: number) => {
    if (checked) {
      setSelectedMedications(prev => [...prev, medId]);
      setDispenseQuantities(prev => ({ ...prev, [medId]: quantity }));
      
      // Load batches for this medication when selected
      if (selectedPrescription) {
        try {
          const med = selectedPrescription.medications.find(m => m.id === medId);
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

    try {
      // Get prescription ID (may be prescription_id string or numeric id)
      const prescriptionId = parseInt(selectedPrescription.id) || selectedPrescription.id;
      
      // Dispense each selected medication
      const dispensePromises = selectedMedications.map(async (medId) => {
        const med = selectedPrescription.medications.find(m => m.id === medId);
        if (!med) return;
        
        const quantity = dispenseQuantities[medId] || med.quantity;
        const inventoryId = selectedBatches[medId] ? parseInt(selectedBatches[medId]) : undefined;
        
        try {
          await pharmacyService.dispense(
            typeof prescriptionId === 'number' ? prescriptionId : parseInt(prescriptionId),
            parseInt(medId),
            quantity,
            inventoryId,
            dispenseNotes
          );
        } catch (err: any) {
          console.error(`Error dispensing ${med.name}:`, err);
          throw err;
        }
      });

      await Promise.all(dispensePromises);

      toast.success(`${selectedMedications.length} medication(s) dispensed successfully for ${selectedPrescription.patient.name}`);
      setShowDispenseModal(false);
      setSelectedPrescription(null);
      setSelectedMedications([]);
      setDispenseQuantities({});
      setDispenseNotes('');
      setSelectedBatches({});
      
      // Reload prescriptions to get updated status
      await loadPrescriptions();
    } catch (err: any) {
      toast.error(err.message || 'Failed to dispense medications');
      console.error('Error dispensing medications:', err);
    }
  };

  const handleQuickDispense = (prescription: Prescription) => {
    // Quick dispense all available medications
    const availableMeds = prescription.medications.filter(m => m.status === 'Available' || m.status === 'Low Stock');
    
    if (availableMeds.length === 0) {
      toast.error('No available medications to dispense');
      return;
    }

    setPrescriptions(prev => prev.map(rx => {
      if (rx.id === prescription.id) {
        const updatedMeds = rx.medications.map(med => ({
          ...med,
          status: (med.status === 'Available' || med.status === 'Low Stock') ? 'Dispensed' : med.status
        }));

        const allMedsDispensed = updatedMeds.every(med => med.status === 'Dispensed' || med.status === 'Out of Stock');

        return {
          ...rx,
          medications: updatedMeds,
          status: allMedsDispensed ? 'Dispensed' : 'Partially Dispensed'
        };
      }
      return rx;
    }));

    toast.success(`Prescription ${prescription.id} dispensed for ${prescription.patient.name}`);
  };

  const handleUpdateStatus = (prescriptionId: string, newStatus: PrescriptionStatus) => {
    setPrescriptions(prev => prev.map(rx => 
      rx.id === prescriptionId ? { ...rx, status: newStatus } : rx
    ));
    toast.success(`Prescription status updated to ${newStatus}`);
  };

  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
              <ClipboardList className="h-8 w-8 text-violet-500" />
              Prescriptions Queue
            </h1>
            <p className="text-muted-foreground mt-1">Process and dispense prescriptions from doctors</p>
          </div>
          <Button variant="outline" onClick={() => loadPrescriptions()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
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
                  <p className="text-2xl font-bold text-violet-600">{stats.avgWaitTime}m</p>
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
                  placeholder="Search by patient name, ID, or MRN..." 
                  value={searchQuery} 
                  onChange={(e) => setSearchQuery(e.target.value)} 
                  className="pl-10" 
                />
              </div>
              <div className="flex flex-wrap gap-2">
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
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${rx.priority === 'Emergency' ? 'bg-red-100 dark:bg-red-900/30' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
                      <span className={`font-semibold text-xs ${rx.priority === 'Emergency' ? 'text-red-600' : 'text-violet-600'}`}>
                        {rx.patient.name.split(' ').map(n => n[0]).join('')}
                      </span>
                    </div>
                    
                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      {/* Row 1: Name + Badges + Meds + Actions */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 flex-wrap min-w-0">
                          <span className="font-semibold text-foreground truncate">{rx.patient.name}</span>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityColor(rx.priority)}`}>{rx.priority}</Badge>
                          <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getStatusColor(rx.status)}`}>{rx.status}</Badge>
                          {rx.medications.slice(0, 2).map((med) => (
                            <Badge key={med.id} variant="secondary" className="text-[10px] px-1.5 py-0">
                              {med.name.split(' ')[0]} ×{med.quantity}
                            </Badge>
                          ))}
                          {rx.medications.length > 2 && <span className="text-[10px] text-muted-foreground">+{rx.medications.length - 2}</span>}
                        </div>
                        <div className="flex items-center gap-1 flex-shrink-0">
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => handleViewDetails(rx)}>
                            <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                          </Button>
                          {(rx.status === 'Pending' || rx.status === 'Processing' || rx.status === 'Ready') && (
                            <Button size="sm" className="h-7 px-2 bg-violet-600 hover:bg-violet-700 text-white text-xs" onClick={() => handleStartDispense(rx)}>
                              <Package className="h-3 w-3 mr-1" />Dispense
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
                        <span>{rx.patient.age}y {rx.patient.gender}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{rx.doctor}</span>
                        <span>•</span>
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{rx.waitTime}m wait</span>
                        {rx.patient.allergies.length > 0 && (
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
              totalItems={filteredPrescriptions.length}
              itemsPerPage={itemsPerPage}
              onPageChange={setCurrentPage}
              onItemsPerPageChange={setItemsPerPage}
              itemName="prescriptions"
            />
          </Card>
        )}

        {/* View Details Modal */}
        <Dialog open={showViewModal} onOpenChange={setShowViewModal}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
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
            </DialogHeader>
            
            {selectedPrescription && (
              <div className="overflow-y-auto max-h-[65vh] space-y-4">
                {/* Status Badges */}
                <div className="flex gap-2">
                  <Badge variant="outline" className={getPriorityColor(selectedPrescription.priority)}>
                    {selectedPrescription.priority}
                  </Badge>
                  <Badge variant="outline" className={getStatusColor(selectedPrescription.status)}>
                    {selectedPrescription.status}
                  </Badge>
                </div>

                {/* Patient Info */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 bg-muted/50 rounded-lg p-4 text-sm">
                  <div><span className="text-muted-foreground">MRN:</span> <span className="font-medium">{selectedPrescription.patient.mrn}</span></div>
                  <div><span className="text-muted-foreground">Age/Gender:</span> <span className="font-medium">{selectedPrescription.patient.age} / {selectedPrescription.patient.gender}</span></div>
                  <div><span className="text-muted-foreground">Phone:</span> <span className="font-medium">{selectedPrescription.patient.phone}</span></div>
                  <div><span className="text-muted-foreground">Doctor:</span> <span className="font-medium">{selectedPrescription.doctor}</span></div>
                  <div><span className="text-muted-foreground">Clinic:</span> <span className="font-medium">{selectedPrescription.clinic}</span></div>
                  <div><span className="text-muted-foreground">Location:</span> <span className="font-medium">{selectedPrescription.location}</span></div>
                  <div><span className="text-muted-foreground">Date:</span> <span className="font-medium">{selectedPrescription.date} {selectedPrescription.time}</span></div>
                  <div><span className="text-muted-foreground">Wait Time:</span> <span className="font-medium text-orange-600">{selectedPrescription.waitTime} min</span></div>
                </div>

                {/* Allergies */}
                {selectedPrescription.patient.allergies.length > 0 && (
                  <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400 font-medium mb-1">
                      <AlertTriangle className="h-4 w-4" />
                      Allergies
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {selectedPrescription.patient.allergies.map((allergy, i) => (
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

                {/* Medications */}
                <div>
                  <h4 className="font-semibold mb-3 flex items-center gap-2">
                    <Pill className="h-4 w-4 text-violet-500" />
                    Medications ({selectedPrescription.medications.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedPrescription.medications.map((med) => (
                      <div key={med.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h5 className="font-medium">{med.name}</h5>
                            <p className="text-sm text-muted-foreground">{med.route} • {med.frequency} • {med.duration}</p>
                          </div>
                          <Badge variant="outline" className={getMedicationStatusColor(med.status)}>
                            {med.status}
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
                          <div><span className="text-muted-foreground">Dosage:</span> <span className="font-medium">{med.dosage}</span></div>
                          <div><span className="text-muted-foreground">Quantity:</span> <span className="font-medium">{med.quantity}</span></div>
                          <div><span className="text-muted-foreground">Stock:</span> <span className={`font-medium ${med.stockLevel < 50 ? 'text-red-600' : 'text-green-600'}`}>{med.stockLevel}</span></div>
                          <div><span className="text-muted-foreground">Instructions:</span> <span className="font-medium">{med.instructions}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <DialogFooter className="flex gap-2">
              <Button variant="outline" onClick={() => setShowViewModal(false)}>Close</Button>
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
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
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
                      <span className="font-medium">{selectedPrescription.patient.name}</span>
                      <span className="text-muted-foreground"> • {selectedPrescription.patient.mrn} • {selectedPrescription.patient.age}y {selectedPrescription.patient.gender}</span>
                    </div>
                    <Badge variant="outline" className={getPriorityColor(selectedPrescription.priority)}>
                      {selectedPrescription.priority}
                    </Badge>
                  </div>
                  {selectedPrescription.patient.allergies.length > 0 && (
                    <div className="flex items-center gap-1 text-red-600 dark:text-red-400 mt-2 text-xs p-2 bg-red-50 dark:bg-red-900/20 rounded">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">ALLERGIES:</span> {selectedPrescription.patient.allergies.join(', ')}
                    </div>
                  )}
                </div>

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
                    Medications ({selectedPrescription.medications.length})
                  </h4>
                  <div className="space-y-3">
                    {selectedPrescription.medications.map((med) => {
                      const isSelected = selectedMedications.includes(med.id);
                      const isAvailable = med.status === 'Available' || med.status === 'Low Stock';
                      const batches = medicationBatches[med.id] || [];
                      const hasSubstitute = false;
                      
                      return (
                        <div 
                          key={med.id} 
                          className={`border rounded-lg p-4 ${!isAvailable ? 'opacity-60 bg-muted/50' : isSelected ? 'border-violet-300 bg-violet-50/50 dark:bg-violet-900/10' : ''}`}
                        >
                          <div className="flex items-start gap-3">
                            <Checkbox
                              checked={isSelected}
                              disabled={!isAvailable}
                              onCheckedChange={(checked) => handleMedicationSelection(med.id, checked as boolean, med.quantity)}
                              className="mt-1"
                            />
                            <div className="flex-1">
                              <div className="flex items-center justify-between mb-2">
                                <div>
                                  <h5 className="font-medium">{med.name}</h5>
                                  <p className="text-xs text-muted-foreground">{med.route} • {med.frequency} • {med.duration}</p>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline" className={getMedicationStatusColor(med.status)}>
                                    {med.status}
                                  </Badge>
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs border-amber-300 text-amber-700 hover:bg-amber-50"
                                    onClick={async () => {
                                      setSubstitutionMed(med);
                                      const substitutes = await getSubstitutesForMedication(med.name);
                                      setAvailableSubstitutes(substitutes);
                                      setSubstitutionForm({ reason: '', selectedSubstitute: '', notes: '' });
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
                                      <Input
                                        type="number"
                                        min="1"
                                        max={med.quantity}
                                        value={dispenseQuantities[med.id] || med.quantity}
                                        onChange={(e) => setDispenseQuantities(prev => ({
                                          ...prev,
                                          [med.id]: Math.min(parseInt(e.target.value) || 0, med.quantity)
                                        }))}
                                        className="h-8 mt-1"
                                      />
                                      <p className="text-[10px] text-muted-foreground mt-1">Prescribed: {med.quantity}</p>
                                    </div>
                                    
                                    {/* Batch Selection */}
                                    <div>
                                      <Label className="text-xs flex items-center gap-1">
                                        <Hash className="h-3 w-3" />
                                        Batch Number
                                      </Label>
                                      <Select 
                                        value={selectedBatches[med.id] || ''} 
                                        onValueChange={(v) => setSelectedBatches(prev => ({ ...prev, [med.id]: v }))}
                                      >
                                        <SelectTrigger className="h-8 mt-1 text-xs">
                                          <SelectValue placeholder="Select batch" />
                                        </SelectTrigger>
                                        <SelectContent>
                                          {batches.length > 0 ? (
                                            batches.map(batch => (
                                              <SelectItem key={batch.batchNumber} value={batch.batchNumber}>
                                                {batch.batchNumber} (Exp: {batch.expiryDate})
                                              </SelectItem>
                                            ))
                                          ) : (
                                            <SelectItem value="" disabled>No batches available</SelectItem>
                                          )}
                                        </SelectContent>
                                      </Select>
                                    </div>
                                    
                                    {/* Stock Info */}
                                    <div>
                                      <Label className="text-xs">Stock Available</Label>
                                      <div className={`mt-1 p-2 rounded text-center font-medium ${med.stockLevel < 50 ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                        {med.stockLevel} units
                                      </div>
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

                <Separator />

                {/* Patient Counseling Checklist */}
                <div>
                  <h4 className="font-medium mb-3 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-emerald-500" />
                    Patient Counseling Checklist
                  </h4>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { key: 'dosageExplained', label: 'Dosage & frequency explained' },
                      { key: 'sideEffectsDiscussed', label: 'Side effects discussed' },
                      { key: 'storageInstructions', label: 'Storage instructions given' },
                      { key: 'interactionsWarned', label: 'Drug interactions warned' },
                      { key: 'followUpAdvised', label: 'Follow-up advised' },
                    ].map(item => (
                      <label key={item.key} className="flex items-center gap-2 p-2 rounded border hover:bg-muted/50 cursor-pointer">
                        <Checkbox
                          checked={counselingChecklist[item.key as keyof typeof counselingChecklist]}
                          onCheckedChange={(checked) => setCounselingChecklist(prev => ({
                            ...prev,
                            [item.key]: checked as boolean
                          }))}
                        />
                        <span className="text-xs">{item.label}</span>
                      </label>
                    ))}
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
              <Button variant="outline" className="gap-2">
                <Printer className="h-4 w-4" />
                Print Label
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
          <DialogContent className="max-w-lg max-h-[85vh] overflow-hidden">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-amber-500" />
                Medication Substitution
              </DialogTitle>
              <DialogDescription>
                Substitute {substitutionMed?.name} with an alternative
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

                {/* Reason for Substitution - Simple Dropdown */}
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
                      {substitutionReasons.map((reason) => (
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

                {/* Search for Substitute */}
                <div>
                  <Label className="text-sm">Search & Select Substitute *</Label>
                  <div className="relative mt-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      value={substituteSearchQuery}
                      onChange={(e) => setSubstituteSearchQuery(e.target.value)}
                      placeholder="Search medications..."
                      className="pl-10"
                    />
                  </div>
                </div>

                {/* Available Substitutes */}
                <div className="space-y-2 max-h-[180px] overflow-y-auto border rounded-lg p-2">
                  {availableSubstitutes.length > 0 ? (
                    availableSubstitutes
                      .filter(sub => 
                        substituteSearchQuery === '' || 
                        sub.name.toLowerCase().includes(substituteSearchQuery.toLowerCase())
                      )
                      .sort((a, b) => {
                        if (substitutionForm.reason === 'near_expiry') {
                          return a.daysToExpiry - b.daysToExpiry;
                        }
                        return b.stock - a.stock;
                      })
                      .map((sub) => (
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
                            <span>Stock: <strong className={sub.stock < 50 ? 'text-red-600' : 'text-emerald-600'}>{sub.stock}</strong></span>
                            <span>Exp: <strong className={sub.isNearExpiry ? 'text-amber-600' : ''}>{sub.expiryDate}</strong></span>
                            <span>₦{sub.unitPrice}/unit</span>
                          </div>
                        </div>
                      ))
                  ) : (
                    <div className="p-4 text-center text-muted-foreground">
                      <Package className="h-6 w-6 mx-auto mb-1" />
                      <p className="text-sm">No substitutes available</p>
                    </div>
                  )}
                  {availableSubstitutes.length > 0 && 
                   availableSubstitutes.filter(sub => 
                     substituteSearchQuery === '' || 
                     sub.name.toLowerCase().includes(substituteSearchQuery.toLowerCase())
                   ).length === 0 && (
                    <div className="p-4 text-center text-muted-foreground">
                      <Search className="h-6 w-6 mx-auto mb-1" />
                      <p className="text-sm">No matches found for "{substituteSearchQuery}"</p>
                    </div>
                  )}
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
                  <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800">
                    <div className="flex items-center gap-2 text-sm">
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      <span className="text-emerald-700 dark:text-emerald-400">
                        <strong>{substitutionMed.name}</strong> → <strong>{availableSubstitutes.find(s => s.id === substitutionForm.selectedSubstitute)?.name}</strong>
                      </span>
                    </div>
                    <p className="text-xs text-emerald-600 dark:text-emerald-500 mt-1">
                      Reason: {substitutionReasons.find(r => r.value === substitutionForm.reason)?.label}
                    </p>
                  </div>
                )}
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowSubstitutionModal(false)}>Cancel</Button>
              <Button 
                className="bg-amber-500 hover:bg-amber-600"
                disabled={!substitutionForm.reason || !substitutionForm.selectedSubstitute}
                onClick={() => {
                  const selectedSub = availableSubstitutes.find(s => s.id === substitutionForm.selectedSubstitute);
                  if (selectedSub) {
                    toast.success(`Substituted ${substitutionMed?.name} with ${selectedSub.name}`);
                    setShowSubstitutionModal(false);
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
