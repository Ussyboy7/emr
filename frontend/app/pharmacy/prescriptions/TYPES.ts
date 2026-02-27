// Type definitions for prescriptions page - no mock data dependencies

export type PrescriptionStatus = 'Pending' | 'Processing' | 'Ready' | 'Partially Dispensed' | 'Dispensed' | 'On Hold';
export type Priority = 'Emergency' | 'High' | 'Medium' | 'Low';

export interface PatientInfo {
  name: string;
  id: string;
  mrn: string;
  age: number;
  gender: string;
  allergies: string[];
  phone: string;
}

export interface MedicationItem {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  unit?: string;
  dosage_form?: string;
  strength?: string;
  dispensed_quantity?: number;
  route: string;
  instructions: string;
  status: 'Available' | 'Low Stock' | 'Out of Stock' | 'Dispensed' | 'Pending';
  stockLevel: number;
  generic?: number; // Generic medication ID if this is a generic prescription
  medication?: number; // Selected brand medication ID
  generic_name?: string; // Generic medication name
  substitution?: boolean; // Whether this is a substituted medication
  originalMedication?: string; // Original medication name if substituted
}

export interface Prescription {
  id: string;
  patient: PatientInfo;
  medications: MedicationItem[];
  doctor: string;
  doctor_name?: string;
  clinic: string;
  location: string;
  date: string;
  time: string;
  prescribed_at?: string;
  status: PrescriptionStatus;
  priority: Priority;
  waitTime: number;
  clinicalNotes: string;
  specialInstructions: string;
  visitNotes?: string; // Notes / Special Instructions from visit
  patient_details?: any; // Additional patient details
  visit_details?: any; // Additional visit details
}

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'Major' | 'Moderate' | 'Minor';
  description: string;
  recommendation: string;
}

export interface MedicationBatch {
  batchNumber: string;
  expiryDate: string;
  quantity: number;
}

export interface SubstituteOption {
  id: string;
  name: string;
  strength: string;
  type: 'generic' | 'brand' | 'therapeutic';
  stock: number | null; // null means loading
  expiryDate: string;
  daysToExpiry: number;
  unitPrice: number;
  isNearExpiry: boolean;
}
