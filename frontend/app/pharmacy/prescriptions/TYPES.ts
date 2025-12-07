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
  route: string;
  instructions: string;
  status: 'Available' | 'Low Stock' | 'Out of Stock' | 'Dispensed' | 'Pending';
  stockLevel: number;
}

export interface Prescription {
  id: string;
  patient: PatientInfo;
  medications: MedicationItem[];
  doctor: string;
  clinic: string;
  location: string;
  date: string;
  time: string;
  status: PrescriptionStatus;
  priority: Priority;
  waitTime: number;
  clinicalNotes: string;
  specialInstructions: string;
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
  stock: number;
  expiryDate: string;
  daysToExpiry: number;
  unitPrice: number;
  isNearExpiry: boolean;
}

