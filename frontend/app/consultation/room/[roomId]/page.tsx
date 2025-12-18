"use client";

import { useEffect, useState, use } from "react";
import { useRouter } from "next/navigation";
import { DashboardLayout } from "@/components/DashboardLayout";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Activity, AlertTriangle, ArrowLeft, CheckCircle, Clock, FileText, History, Loader2, MapPin, Pill, Plus, Save, Stethoscope, Syringe, TestTube, User, Users, X, Send, ScanLine, TrendingUp, TrendingDown, Minus, Building2, UserPlus, Calendar, Phone, Mail, Heart, Download, Eye, Printer, FileDown, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, ClipboardList, RefreshCw, Thermometer, CheckSquare, Square, Edit } from "lucide-react";
import { toast } from "sonner";
import { roomService, patientService, pharmacyService, labService, radiologyService, referralService, consultationService, appointmentService, type ConsultationSession } from '@/lib/services';
import { apiFetch } from '@/lib/api-client';
import { useAuthRedirect } from '@/hooks/use-auth-redirect';
import { isAuthenticationError } from '@/lib/auth-errors';
import { getPriorityLabel, getPriorityColor } from '@/lib/utils/priority';
import { PatientAvatar } from '@/components/PatientAvatar';
import { VitalsDetailModal } from '@/components/VitalsDetailModal';

// Types
interface Patient {
  id: string;
  visitId: string;
  patientId: string;
  name: string;
  age: number;
  gender: string;
  mrn: string;
  personalNumber?: string;
  allergies: string[];
  waitTime: number;
  vitalsCompleted: boolean;
  priority: "Emergency" | "High" | "Medium" | "Low";
  visitDate: string;
  visitTime: string;
  queuePosition?: number;
  bloodGroup?: string;
  genotype?: string;
  employeeType?: string;
  division?: string;
  location?: string;
  phone?: string;
  email?: string;
  occupation?: string;
  religion?: string;
  tribe?: string;
  photo?: string | null;
  vitals?: { temperature: string; bloodPressure: string; heartRate: string; respiratoryRate: string; oxygenSaturation: string; weight: string; height: string; recordedAt: string };
}

interface ConsultationRoom {
  id: string;
  name: string;
  status: "available" | "occupied";
  currentPatient?: string;
  startTime?: string;
  doctor?: string;
  specialtyFocus?: string;
  totalConsultationsToday: number;
  averageConsultationTime: number;
  queue: { patient_id: string; position: number }[];
}

// Consultation room, patient, and medication data will be loaded from API

// Medications are loaded from the API - no demo medications needed

const frequencyToDailyDoses: Record<string, number> = {
  'Once daily (OD)': 1,
  'Twice daily (BD)': 2,
  'Three times daily (TDS)': 3,
  'Four times daily (QDS)': 4,
  'Every 6 hours (Q6H)': 4,
  'Every 8 hours (Q8H)': 3,
  'Every 12 hours (Q12H)': 2,
  'At bedtime (Nocte)': 1,
  'As needed (PRN)': 2, // Estimate 2 doses per day
  'Weekly': 0.14, // 1/7
  'STAT (Single dose)': 0, // Special case
};

const routes = ['Oral', 'Sublingual', 'Topical', 'Inhalation', 'Intramuscular (IM)', 'Intravenous (IV)', 'Subcutaneous (SC)', 'Rectal', 'Ophthalmic', 'Otic'];


const injectionRoutes = ['Intramuscular (IM)', 'Intravenous (IV)', 'Subcutaneous (SC)', 'Intradermal (ID)'];

const woundTypes = ['Laceration', 'Abrasion', 'Surgical Wound', 'Ulcer', 'Burn', 'Puncture', 'Pressure Sore', 'Diabetic Wound', 'Infected Wound', 'Post-operative'];

const dressingSupplies = ['Gauze', 'Bandage', 'Adhesive Tape', 'Normal Saline', 'Povidone Iodine', 'Hydrogen Peroxide', 'Antibiotic Ointment', 'Wound Closure Strips', 'Transparent Film', 'Hydrocolloid Dressing', 'Alginate Dressing', 'Foam Dressing'];

const ivFluids = [
  { name: 'Normal Saline (0.9% NaCl)', category: 'Crystalloid' },
  { name: 'Dextrose 5% in Water (D5W)', category: 'Dextrose' },
  { name: 'Dextrose Saline', category: 'Dextrose' },
  { name: 'Ringer\'s Lactate', category: 'Crystalloid' },
  { name: 'Dextrose 10% in Water', category: 'Dextrose' },
  { name: 'Half-Normal Saline (0.45% NaCl)', category: 'Crystalloid' },
];

// Referral data
const referralSpecialties = [
  'Cardiology', 'Orthopedics', 'Neurology', 'Dermatology', 'ENT (Otolaryngology)',
  'Ophthalmology', 'Psychiatry', 'Urology', 'Gastroenterology', 'Pulmonology',
  'Nephrology', 'Endocrinology', 'Rheumatology', 'Oncology', 'Hematology',
  'Obstetrics & Gynecology', 'Pediatrics', 'General Surgery', 'Plastic Surgery',
  'Physiotherapy', 'Dental', 'Nutrition/Dietetics'
];

const referralFacilities = [
  { name: 'NPA Medical Centre - Lagos', type: 'Internal' },
  { name: 'NPA Medical Centre - Port Harcourt', type: 'Internal' },
  { name: 'NPA Medical Centre - Calabar', type: 'Internal' },
  { name: 'Lagos University Teaching Hospital (LUTH)', type: 'External' },
  { name: 'Lagos State University Teaching Hospital (LASUTH)', type: 'External' },
  { name: 'National Hospital Abuja', type: 'External' },
  { name: 'University of Port Harcourt Teaching Hospital', type: 'External' },
  { name: 'University College Hospital (UCH) Ibadan', type: 'External' },
  { name: 'St. Nicholas Hospital Lagos', type: 'External' },
  { name: 'Reddington Hospital', type: 'External' },
  { name: 'Lagoon Hospital', type: 'External' },
];

const referralReasons = [
  'Specialist consultation required',
  'Advanced diagnostic workup',
  'Surgical intervention needed',
  'Second opinion requested',
  'Specialized treatment/therapy',
  'Emergency/Urgent care',
  'Follow-up care',
  'Rehabilitation services',
];

// ICD-10 Codes for diagnosis
const icd10Codes = [
  // Infectious diseases
  { code: 'A09', name: 'Infectious gastroenteritis and colitis', category: 'Infectious' },
  { code: 'A15.0', name: 'Tuberculosis of lung', category: 'Infectious' },
  { code: 'B20', name: 'Human immunodeficiency virus [HIV] disease', category: 'Infectious' },
  { code: 'B50.9', name: 'Plasmodium falciparum malaria, unspecified', category: 'Infectious' },
  { code: 'B51.9', name: 'Plasmodium vivax malaria', category: 'Infectious' },
  { code: 'B54', name: 'Unspecified malaria', category: 'Infectious' },
  { code: 'J06.8', name: 'Acute upper respiratory infection, other specified', category: 'Infectious' },
  { code: 'J18.9', name: 'Pneumonia, unspecified organism', category: 'Infectious' },
  // Metabolic/Endocrine
  { code: 'E10.9', name: 'Type 1 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E11.9', name: 'Type 2 diabetes mellitus without complications', category: 'Endocrine' },
  { code: 'E11.65', name: 'Type 2 diabetes mellitus with hyperglycemia', category: 'Endocrine' },
  { code: 'E03.9', name: 'Hypothyroidism, unspecified', category: 'Endocrine' },
  { code: 'E05.90', name: 'Thyrotoxicosis, unspecified', category: 'Endocrine' },
  { code: 'E78.0', name: 'Pure hypercholesterolemia', category: 'Endocrine' },
  { code: 'E78.5', name: 'Hyperlipidemia, unspecified', category: 'Endocrine' },
  // Cardiovascular
  { code: 'I10', name: 'Essential (primary) hypertension', category: 'Cardiovascular' },
  { code: 'I11.9', name: 'Hypertensive heart disease without heart failure', category: 'Cardiovascular' },
  { code: 'I20.9', name: 'Angina pectoris, unspecified', category: 'Cardiovascular' },
  { code: 'I21.9', name: 'Acute myocardial infarction, unspecified', category: 'Cardiovascular' },
  { code: 'I25.10', name: 'Atherosclerotic heart disease', category: 'Cardiovascular' },
  { code: 'I48.91', name: 'Atrial fibrillation, unspecified', category: 'Cardiovascular' },
  { code: 'I50.9', name: 'Heart failure, unspecified', category: 'Cardiovascular' },
  { code: 'I63.9', name: 'Cerebral infarction, unspecified', category: 'Cardiovascular' },
  // Respiratory
  { code: 'J02.9', name: 'Acute pharyngitis, unspecified', category: 'Respiratory' },
  { code: 'J03.90', name: 'Acute tonsillitis, unspecified', category: 'Respiratory' },
  { code: 'J06.9', name: 'Acute upper respiratory infection', category: 'Respiratory' },
  { code: 'J20.9', name: 'Acute bronchitis, unspecified', category: 'Respiratory' },
  { code: 'J45.909', name: 'Unspecified asthma, uncomplicated', category: 'Respiratory' },
  { code: 'J44.9', name: 'Chronic obstructive pulmonary disease', category: 'Respiratory' },
  // Gastrointestinal
  { code: 'K21.0', name: 'Gastro-esophageal reflux disease with esophagitis', category: 'GI' },
  { code: 'K25.9', name: 'Gastric ulcer, unspecified', category: 'GI' },
  { code: 'K29.70', name: 'Gastritis, unspecified', category: 'GI' },
  { code: 'K30', name: 'Functional dyspepsia', category: 'GI' },
  { code: 'K52.9', name: 'Noninfective gastroenteritis and colitis', category: 'GI' },
  { code: 'K59.00', name: 'Constipation, unspecified', category: 'GI' },
  { code: 'K76.0', name: 'Fatty liver, not elsewhere classified', category: 'GI' },
  // Musculoskeletal
  { code: 'M54.5', name: 'Low back pain', category: 'Musculoskeletal' },
  { code: 'M54.2', name: 'Cervicalgia (neck pain)', category: 'Musculoskeletal' },
  { code: 'M25.50', name: 'Pain in unspecified joint', category: 'Musculoskeletal' },
  { code: 'M79.3', name: 'Panniculitis, unspecified', category: 'Musculoskeletal' },
  { code: 'M17.9', name: 'Osteoarthritis of knee', category: 'Musculoskeletal' },
  { code: 'M10.9', name: 'Gout, unspecified', category: 'Musculoskeletal' },
  { code: 'M94.0', name: 'Costochondritis', category: 'Musculoskeletal' },
  // Neurological
  { code: 'G43.909', name: 'Migraine, unspecified', category: 'Neurological' },
  { code: 'G44.1', name: 'Vascular headache, not elsewhere classified', category: 'Neurological' },
  { code: 'R51', name: 'Headache', category: 'Neurological' },
  { code: 'G40.909', name: 'Epilepsy, unspecified', category: 'Neurological' },
  { code: 'G20', name: 'Parkinson disease', category: 'Neurological' },
  // Genitourinary
  { code: 'N39.0', name: 'Urinary tract infection, site not specified', category: 'Genitourinary' },
  { code: 'N40.0', name: 'Benign prostatic hyperplasia', category: 'Genitourinary' },
  { code: 'N18.9', name: 'Chronic kidney disease, unspecified', category: 'Genitourinary' },
  // Mental/Behavioral
  { code: 'F32.9', name: 'Major depressive disorder, single episode', category: 'Mental' },
  { code: 'F41.1', name: 'Generalized anxiety disorder', category: 'Mental' },
  { code: 'F41.9', name: 'Anxiety disorder, unspecified', category: 'Mental' },
  { code: 'G47.00', name: 'Insomnia, unspecified', category: 'Mental' },
  // Eye
  { code: 'H52.4', name: 'Presbyopia', category: 'Eye' },
  { code: 'H10.9', name: 'Conjunctivitis, unspecified', category: 'Eye' },
  { code: 'H40.9', name: 'Glaucoma, unspecified', category: 'Eye' },
  { code: 'H25.9', name: 'Senile cataract, unspecified', category: 'Eye' },
  // Blood
  { code: 'D50.9', name: 'Iron deficiency anemia, unspecified', category: 'Blood' },
  { code: 'D57.1', name: 'Sickle-cell disease without crisis', category: 'Blood' },
  { code: 'D57.00', name: 'Sickle-cell disease with crisis', category: 'Blood' },
  // Skin
  { code: 'L30.9', name: 'Dermatitis, unspecified', category: 'Skin' },
  { code: 'B35.9', name: 'Dermatophytosis, unspecified', category: 'Skin' },
  { code: 'L50.9', name: 'Urticaria, unspecified', category: 'Skin' },
  // Symptoms/Signs
  { code: 'R50.9', name: 'Fever, unspecified', category: 'Symptoms' },
  { code: 'R05', name: 'Cough', category: 'Symptoms' },
  { code: 'R06.02', name: 'Shortness of breath', category: 'Symptoms' },
  { code: 'R07.9', name: 'Chest pain, unspecified', category: 'Symptoms' },
  { code: 'R10.9', name: 'Abdominal pain, unspecified', category: 'Symptoms' },
  { code: 'R11.2', name: 'Nausea with vomiting', category: 'Symptoms' },
  { code: 'R42', name: 'Dizziness and giddiness', category: 'Symptoms' },
  { code: 'R53.83', name: 'Fatigue', category: 'Symptoms' },
  // Injury
  { code: 'S00.93', name: 'Contusion of unspecified part of head', category: 'Injury' },
  { code: 'S61.419A', name: 'Laceration of hand', category: 'Injury' },
  { code: 'S93.40', name: 'Sprain of ankle', category: 'Injury' },
  // Pregnancy
  { code: 'Z34.00', name: 'Supervision of normal first pregnancy', category: 'Pregnancy' },
  { code: 'O09.90', name: 'Supervision of pregnancy, unspecified', category: 'Pregnancy' },
];

// Radiology data
const radiologyProcedures = [
  { name: 'Chest X-ray (PA)', category: 'X-Ray', bodyPart: 'Chest' },
  { name: 'Chest X-ray (Lateral)', category: 'X-Ray', bodyPart: 'Chest' },
  { name: 'Abdominal X-ray', category: 'X-Ray', bodyPart: 'Abdomen' },
  { name: 'Skull X-ray', category: 'X-Ray', bodyPart: 'Head' },
  { name: 'Spine X-ray (Cervical)', category: 'X-Ray', bodyPart: 'Spine' },
  { name: 'Spine X-ray (Lumbar)', category: 'X-Ray', bodyPart: 'Spine' },
  { name: 'Pelvis X-ray', category: 'X-Ray', bodyPart: 'Pelvis' },
  { name: 'Extremity X-ray', category: 'X-Ray', bodyPart: 'Limbs' },
  { name: 'Abdominal Ultrasound', category: 'Ultrasound', bodyPart: 'Abdomen' },
  { name: 'Pelvic Ultrasound', category: 'Ultrasound', bodyPart: 'Pelvis' },
  { name: 'Obstetric Ultrasound', category: 'Ultrasound', bodyPart: 'Pelvis' },
  { name: 'Thyroid Ultrasound', category: 'Ultrasound', bodyPart: 'Neck' },
  { name: 'Breast Ultrasound', category: 'Ultrasound', bodyPart: 'Chest' },
  { name: 'Echocardiogram (Echo)', category: 'Ultrasound', bodyPart: 'Heart' },
  { name: 'Doppler Ultrasound (Vascular)', category: 'Ultrasound', bodyPart: 'Vessels' },
  { name: 'CT Scan - Head', category: 'CT Scan', bodyPart: 'Head' },
  { name: 'CT Scan - Chest', category: 'CT Scan', bodyPart: 'Chest' },
  { name: 'CT Scan - Abdomen/Pelvis', category: 'CT Scan', bodyPart: 'Abdomen' },
  { name: 'CT Scan - Spine', category: 'CT Scan', bodyPart: 'Spine' },
  { name: 'MRI - Brain', category: 'MRI', bodyPart: 'Head' },
  { name: 'MRI - Spine', category: 'MRI', bodyPart: 'Spine' },
  { name: 'MRI - Knee', category: 'MRI', bodyPart: 'Limbs' },
  { name: 'MRI - Shoulder', category: 'MRI', bodyPart: 'Limbs' },
  { name: 'Mammography', category: 'Mammography', bodyPart: 'Chest' },
  { name: 'Fluoroscopy - Barium Swallow', category: 'Fluoroscopy', bodyPart: 'GI Tract' },
  { name: 'Fluoroscopy - Barium Enema', category: 'Fluoroscopy', bodyPart: 'GI Tract' },
];


// Patient medical history will be loaded from API
const demoPatientHistory: any = {
  previousVisits: [
    { id: 'V-001', date: '2024-11-15', type: 'Follow-up', clinic: 'General', doctor: 'Dr. Adebayo', diagnosis: 'Essential Hypertension (Controlled)', outcome: 'Medications refilled, follow-up in 1 month' },
    { id: 'V-002', date: '2024-10-22', type: 'Consultation', clinic: 'General', doctor: 'Dr. Okonkwo', diagnosis: 'Costochondritis', outcome: 'Prescribed NSAIDs, symptoms resolved' },
    { id: 'V-003', date: '2024-09-18', type: 'Emergency', clinic: 'General', doctor: 'Dr. Eze', diagnosis: 'Malaria (Plasmodium falciparum)', outcome: 'Treated with Artemether-Lumefantrine, recovered' },
    { id: 'V-004', date: '2024-08-05', type: 'Consultation', clinic: 'Eye', doctor: 'Dr. Adamu', diagnosis: 'Presbyopia', outcome: 'Prescribed reading glasses' },
    { id: 'V-005', date: '2024-07-12', type: 'Follow-up', clinic: 'General', doctor: 'Dr. Adebayo', diagnosis: 'Mild hypertension', outcome: 'Started on Amlodipine 5mg' },
    { id: 'V-006', date: '2024-05-20', type: 'Consultation', clinic: 'Physiotherapy', doctor: 'Dr. Bello', diagnosis: 'Lumbar strain', outcome: 'Physiotherapy sessions, improved' },
  ],
  diagnoses: [
    { code: 'I10', name: 'Essential Hypertension', status: 'Active', diagnosedDate: '2024-07-12', treatingDoctor: 'Dr. Adebayo' },
    { code: 'H52.4', name: 'Presbyopia', status: 'Active', diagnosedDate: '2024-08-05', treatingDoctor: 'Dr. Adamu' },
    { code: 'M54.5', name: 'Low Back Pain', status: 'Resolved', diagnosedDate: '2024-05-20', treatingDoctor: 'Dr. Bello' },
    { code: 'B50.9', name: 'Malaria (P. falciparum)', status: 'Resolved', diagnosedDate: '2024-09-18', treatingDoctor: 'Dr. Eze' },
  ],
  medications: [
    { name: 'Amlodipine 5mg', dosage: '1 tablet', frequency: 'Once daily', startDate: '2024-07-12', status: 'Active', prescribedBy: 'Dr. Adebayo' },
    { name: 'Lisinopril 10mg', dosage: '1 tablet', frequency: 'Once daily', startDate: '2024-11-15', status: 'Active', prescribedBy: 'Dr. Adebayo' },
    { name: 'Artemether-Lumefantrine', dosage: '4 tablets', frequency: 'Twice daily x 3 days', startDate: '2024-09-18', endDate: '2024-09-21', status: 'Completed', prescribedBy: 'Dr. Eze' },
    { name: 'Ibuprofen 400mg', dosage: '1 tablet', frequency: 'Three times daily', startDate: '2024-10-22', endDate: '2024-10-29', status: 'Completed', prescribedBy: 'Dr. Okonkwo' },
    { name: 'Diclofenac Gel', dosage: 'Apply to affected area', frequency: 'Twice daily', startDate: '2024-05-20', endDate: '2024-06-20', status: 'Completed', prescribedBy: 'Dr. Bello' },
  ],
  prescriptions: [
    { id: 'RX-2024-001', date: '2024-11-15', prescriptionId: 'RX-001', doctor: 'Dr. Adebayo', status: 'dispensed', diagnosis: 'Essential Hypertension', medications: ['Amlodipine 5mg', 'Lisinopril 10mg'], notes: 'Continue current medications' },
    { id: 'RX-2024-002', date: '2024-10-22', prescriptionId: 'RX-002', doctor: 'Dr. Okonkwo', status: 'dispensed', diagnosis: 'Costochondritis', medications: ['Ibuprofen 400mg'], notes: 'Take with food' },
    { id: 'RX-2024-003', date: '2024-09-18', prescriptionId: 'RX-003', doctor: 'Dr. Eze', status: 'dispensed', diagnosis: 'Malaria', medications: ['Artemether-Lumefantrine', 'Paracetamol 1g'], notes: 'Complete full course' },
    { id: 'RX-2024-004', date: '2024-08-05', prescriptionId: 'RX-004', doctor: 'Dr. Adamu', status: 'dispensed', diagnosis: 'Presbyopia', medications: ['Reading Glasses'], notes: 'Use for reading only' },
    { id: 'RX-2024-005', date: '2024-07-12', prescriptionId: 'RX-005', doctor: 'Dr. Adebayo', status: 'dispensed', diagnosis: 'Mild Hypertension', medications: ['Amlodipine 5mg'], notes: 'Start medication' },
    { id: 'RX-2024-006', date: '2024-05-20', prescriptionId: 'RX-006', doctor: 'Dr. Bello', status: 'dispensed', diagnosis: 'Lumbar Strain', medications: ['Diclofenac Gel'], notes: 'Apply to affected area' },
  ],
  labResults: [
    { 
      id: 'LAB-2024-001',
      date: '2024-11-15', 
      test: 'Lipid Profile', 
      category: 'Chemistry',
      result: 'Total Cholesterol: 195 mg/dL, LDL: 120, HDL: 48, Triglycerides: 135', 
      status: 'Normal', 
      orderedBy: 'Dr. Adebayo',
      performedBy: 'Lab Tech Amaka',
      verifiedBy: 'Dr. Okoro (Pathologist)',
      specimenType: 'Blood (Serum)',
      collectedAt: '2024-11-15 08:30',
      reportedAt: '2024-11-15 14:00',
      parameters: [
        { name: 'Total Cholesterol', value: '195', unit: 'mg/dL', normalRange: '<200', status: 'Normal' },
        { name: 'LDL Cholesterol', value: '120', unit: 'mg/dL', normalRange: '<100', status: 'Borderline' },
        { name: 'HDL Cholesterol', value: '48', unit: 'mg/dL', normalRange: '>40', status: 'Normal' },
        { name: 'Triglycerides', value: '135', unit: 'mg/dL', normalRange: '<150', status: 'Normal' },
        { name: 'VLDL', value: '27', unit: 'mg/dL', normalRange: '<30', status: 'Normal' },
      ],
      interpretation: 'Lipid profile within acceptable limits. LDL slightly elevated but below intervention threshold. Continue lifestyle modifications.',
      clinicalNotes: 'Patient fasted for 12 hours prior to test.',
      pdfUrl: '/documents/lab-LAB-2024-001.pdf'
    },
    { 
      id: 'LAB-2024-002',
      date: '2024-11-15', 
      test: 'Renal Function Test', 
      category: 'Chemistry',
      result: 'Creatinine: 1.0 mg/dL, BUN: 15 mg/dL, eGFR: 85', 
      status: 'Normal', 
      orderedBy: 'Dr. Adebayo',
      performedBy: 'Lab Tech Amaka',
      verifiedBy: 'Dr. Okoro (Pathologist)',
      specimenType: 'Blood (Serum)',
      collectedAt: '2024-11-15 08:30',
      reportedAt: '2024-11-15 14:00',
      parameters: [
        { name: 'Creatinine', value: '1.0', unit: 'mg/dL', normalRange: '0.7-1.3', status: 'Normal' },
        { name: 'Blood Urea Nitrogen (BUN)', value: '15', unit: 'mg/dL', normalRange: '7-20', status: 'Normal' },
        { name: 'eGFR', value: '85', unit: 'mL/min/1.73m²', normalRange: '>60', status: 'Normal' },
        { name: 'BUN/Creatinine Ratio', value: '15', unit: '', normalRange: '10-20', status: 'Normal' },
      ],
      interpretation: 'Renal function is normal. No evidence of kidney impairment.',
      clinicalNotes: 'Baseline for hypertension monitoring.',
      pdfUrl: '/documents/lab-LAB-2024-002.pdf'
    },
    { 
      id: 'LAB-2024-003',
      date: '2024-09-18', 
      test: 'Malaria Parasite', 
      category: 'Microbiology',
      result: 'Positive - P. falciparum ++', 
      status: 'Abnormal', 
      orderedBy: 'Dr. Eze',
      performedBy: 'Lab Tech Chidi',
      verifiedBy: 'Dr. Nwosu (Microbiologist)',
      specimenType: 'Blood (EDTA)',
      collectedAt: '2024-09-18 09:15',
      reportedAt: '2024-09-18 10:00',
      parameters: [
        { name: 'Malaria Parasite (Thick Film)', value: 'Positive', unit: '', normalRange: 'Negative', status: 'Abnormal' },
        { name: 'Malaria Parasite (Thin Film)', value: 'P. falciparum', unit: '', normalRange: 'Negative', status: 'Abnormal' },
        { name: 'Parasite Density', value: '++', unit: '', normalRange: 'Negative', status: 'Abnormal' },
        { name: 'mRDT', value: 'Positive', unit: '', normalRange: 'Negative', status: 'Abnormal' },
      ],
      interpretation: 'POSITIVE for Plasmodium falciparum malaria. Moderate parasitemia. Recommend ACT treatment.',
      clinicalNotes: 'Patient presented with fever and chills. Recent travel to endemic area.',
      pdfUrl: '/documents/lab-LAB-2024-003.pdf',
      criticalValue: true
    },
    { 
      id: 'LAB-2024-004',
      date: '2024-09-18', 
      test: 'Complete Blood Count', 
      category: 'Hematology',
      result: 'Hb: 12.5 g/dL, WBC: 9,500, Platelets: 180,000', 
      status: 'Normal', 
      orderedBy: 'Dr. Eze',
      performedBy: 'Lab Tech Chidi',
      verifiedBy: 'Dr. Okoro (Pathologist)',
      specimenType: 'Blood (EDTA)',
      collectedAt: '2024-09-18 09:15',
      reportedAt: '2024-09-18 11:00',
      parameters: [
        { name: 'Hemoglobin', value: '12.5', unit: 'g/dL', normalRange: '12-16', status: 'Normal' },
        { name: 'Hematocrit', value: '38', unit: '%', normalRange: '36-48', status: 'Normal' },
        { name: 'WBC', value: '9,500', unit: '/µL', normalRange: '4,000-11,000', status: 'Normal' },
        { name: 'Neutrophils', value: '65', unit: '%', normalRange: '40-70', status: 'Normal' },
        { name: 'Lymphocytes', value: '28', unit: '%', normalRange: '20-40', status: 'Normal' },
        { name: 'Monocytes', value: '5', unit: '%', normalRange: '2-8', status: 'Normal' },
        { name: 'Eosinophils', value: '1', unit: '%', normalRange: '1-4', status: 'Normal' },
        { name: 'Basophils', value: '1', unit: '%', normalRange: '0-1', status: 'Normal' },
        { name: 'Platelets', value: '180,000', unit: '/µL', normalRange: '150,000-400,000', status: 'Normal' },
        { name: 'RBC', value: '4.5', unit: 'million/µL', normalRange: '4.0-5.5', status: 'Normal' },
        { name: 'MCV', value: '84', unit: 'fL', normalRange: '80-100', status: 'Normal' },
        { name: 'MCH', value: '28', unit: 'pg', normalRange: '27-33', status: 'Normal' },
        { name: 'MCHC', value: '33', unit: 'g/dL', normalRange: '32-36', status: 'Normal' },
      ],
      interpretation: 'Complete blood count is within normal limits. No evidence of anemia or infection.',
      clinicalNotes: 'Ordered alongside malaria parasite test.',
      pdfUrl: '/documents/lab-LAB-2024-004.pdf'
    },
    { 
      id: 'LAB-2024-005',
      date: '2024-07-12', 
      test: 'Fasting Blood Sugar', 
      category: 'Chemistry',
      result: '95 mg/dL', 
      status: 'Normal', 
      orderedBy: 'Dr. Adebayo',
      performedBy: 'Lab Tech Amaka',
      verifiedBy: 'Dr. Okoro (Pathologist)',
      specimenType: 'Blood (Fluoride)',
      collectedAt: '2024-07-12 07:45',
      reportedAt: '2024-07-12 09:00',
      parameters: [
        { name: 'Fasting Blood Glucose', value: '95', unit: 'mg/dL', normalRange: '70-100', status: 'Normal' },
      ],
      interpretation: 'Fasting blood glucose is normal. No evidence of diabetes.',
      clinicalNotes: 'Patient fasted for 10 hours.',
      pdfUrl: '/documents/lab-LAB-2024-005.pdf'
    },
    { 
      id: 'LAB-2024-006',
      date: '2024-07-12', 
      test: 'HbA1c', 
      category: 'Chemistry',
      result: '5.4%', 
      status: 'Normal', 
      orderedBy: 'Dr. Adebayo',
      performedBy: 'Lab Tech Amaka',
      verifiedBy: 'Dr. Okoro (Pathologist)',
      specimenType: 'Blood (EDTA)',
      collectedAt: '2024-07-12 07:45',
      reportedAt: '2024-07-12 14:00',
      parameters: [
        { name: 'Glycated Hemoglobin (HbA1c)', value: '5.4', unit: '%', normalRange: '<5.7', status: 'Normal' },
        { name: 'Estimated Average Glucose', value: '108', unit: 'mg/dL', normalRange: '', status: 'Normal' },
      ],
      interpretation: 'HbA1c is normal, indicating good glycemic control over the past 3 months.',
      clinicalNotes: 'Baseline for new patient.',
      pdfUrl: '/documents/lab-LAB-2024-006.pdf'
    },
  ],
  imagingResults: [
    { date: '2024-10-22', procedure: 'Chest X-ray (PA)', finding: 'No active lung disease. Heart size normal.', status: 'Normal', performedAt: 'NPA Medical Centre Lagos' },
    { date: '2024-05-20', procedure: 'Lumbar Spine X-ray', finding: 'Mild degenerative changes at L4-L5. No fracture or dislocation.', status: 'Abnormal', performedAt: 'NPA Medical Centre Lagos' },
  ],
  allergies: ['Penicillin'],
  surgicalHistory: [
    { procedure: 'Appendectomy', date: '2015-03-15', hospital: 'Lagos University Teaching Hospital' },
  ],
  familyHistory: [
    { relation: 'Father', condition: 'Hypertension, Type 2 Diabetes' },
    { relation: 'Mother', condition: 'Breast Cancer (survived)' },
    { relation: 'Sibling', condition: 'Asthma' },
  ],
  socialHistory: {
    smoking: 'Never',
    alcohol: 'Occasional (social)',
    exercise: '2-3 times per week',
    occupation: 'Senior Engineer - NPA',
  },
};

// Past consultation sessions will be loaded from API
const demoConsultationSessions: any[] = [
  {
    id: 'CS-2024-001',
    date: '2024-11-15',
    time: '10:30 - 11:15',
    duration: '45 min',
    clinic: 'General',
    room: 'Consultation Room 1',
    doctor: 'Dr. Adebayo Ogundimu',
    doctorSpecialty: 'Internal Medicine',
    patient: { name: 'Oluwaseun Adeyemi', patientId: 'NPA-2024-001', age: 45, gender: 'Male' },
    vitals: { temperature: '37.2°C', bloodPressure: '135/88', heartRate: '82 bpm', respiratoryRate: '18/min', oxygenSaturation: '97%', weight: '82.5 kg' },
    medicalNotes: {
      historyOfPresentIllness: 'Patient returns for routine hypertension follow-up. Reports occasional mild headaches in the morning. No chest pain, shortness of breath, or palpitations. Compliant with medications.',
      physicalExamination: 'General: Alert, oriented, no acute distress. CV: Regular rhythm, no murmurs. Lungs: Clear bilateral. Extremities: No edema.',
      diagnosis: 'Essential Hypertension (I10) - Controlled',
      assessment: 'Blood pressure slightly elevated today. Patient reports stress at work. Overall control acceptable.',
      plan: '1. Continue Amlodipine 5mg OD\n2. Add Lisinopril 10mg OD\n3. Lifestyle modifications discussed\n4. Follow-up in 1 month\n5. Repeat lipid profile'
    },
    prescriptions: [
      { medication: 'Amlodipine 5mg', dosage: '1 tablet', frequency: 'Once daily', duration: '30 days', quantity: 30 },
      { medication: 'Lisinopril 10mg', dosage: '1 tablet', frequency: 'Once daily', duration: '30 days', quantity: 30 }
    ],
    labOrders: [
      { test: 'Lipid Profile', priority: 'Routine', status: 'Completed' },
      { test: 'Renal Function Test', priority: 'Routine', status: 'Completed' }
    ],
    nursingOrders: [],
    referrals: [],
    radiologyOrders: [],
    followUp: { date: '2024-12-15', reason: 'BP review and lab results' },
    outcome: 'Stable, medications adjusted',
    pdfGenerated: true,
    pdfUrl: '/documents/consultation-CS-2024-001.pdf'
  },
  {
    id: 'CS-2024-002',
    date: '2024-10-22',
    time: '14:45 - 15:30',
    duration: '45 min',
    clinic: 'General',
    room: 'Consultation Room 2',
    doctor: 'Dr. Chukwuma Okonkwo',
    doctorSpecialty: 'General Practice',
    patient: { name: 'Oluwaseun Adeyemi', patientId: 'NPA-2024-001', age: 45, gender: 'Male' },
    vitals: { temperature: '36.5°C', bloodPressure: '128/82', heartRate: '75 bpm', respiratoryRate: '16/min', oxygenSaturation: '99%', weight: '83 kg' },
    medicalNotes: {
      historyOfPresentIllness: 'Patient presents with left-sided chest discomfort for 2 days. Pain is sharp, localized, worsens with movement and deep breathing. No radiation. No SOB, palpitations, or diaphoresis. Started after moving heavy boxes at home.',
      physicalExamination: 'General: Comfortable at rest. CV: Regular rhythm, normal S1S2, no murmurs. Chest: Tenderness over left costochondral junction, reproducible with palpation. Lungs: Clear.',
      diagnosis: 'Costochondritis (M94.0)',
      assessment: 'Musculoskeletal chest pain, likely costochondritis from recent physical activity. No cardiac etiology suspected.',
      plan: '1. Ibuprofen 400mg TDS for 7 days\n2. Local heat application\n3. Avoid heavy lifting\n4. Chest X-ray to rule out other causes\n5. Return if symptoms worsen or persist'
    },
    prescriptions: [
      { medication: 'Ibuprofen 400mg', dosage: '1 tablet', frequency: 'Three times daily', duration: '7 days', quantity: 21 }
    ],
    labOrders: [],
    nursingOrders: [],
    referrals: [],
    radiologyOrders: [
      { procedure: 'Chest X-ray (PA)', priority: 'Routine', status: 'Completed', finding: 'Normal' }
    ],
    followUp: { date: '2024-10-29', reason: 'Review if symptoms persist' },
    outcome: 'Resolved with treatment',
    pdfGenerated: true,
    pdfUrl: '/documents/consultation-CS-2024-002.pdf'
  },
  {
    id: 'CS-2024-003',
    date: '2024-09-18',
    time: '09:00 - 10:00',
    duration: '60 min',
    clinic: 'General',
    room: 'Emergency Room 1',
    doctor: 'Dr. Emeka Eze',
    doctorSpecialty: 'Emergency Medicine',
    patient: { name: 'Oluwaseun Adeyemi', patientId: 'NPA-2024-001', age: 45, gender: 'Male' },
    vitals: { temperature: '38.1°C', bloodPressure: '140/92', heartRate: '92 bpm', respiratoryRate: '20/min', oxygenSaturation: '96%', weight: '81 kg' },
    medicalNotes: {
      historyOfPresentIllness: 'Patient presents to ER with high-grade fever (38.5°C at home), severe headache, generalized body aches, and chills for 1 day. Reports recent travel to malaria-endemic area. No cough, vomiting, or diarrhea.',
      physicalExamination: 'General: Ill-looking, febrile, mild dehydration. HEENT: No jaundice, no neck stiffness. Chest: Clear. Abdomen: Soft, mild hepatosplenomegaly. Skin: No rash.',
      diagnosis: 'Malaria - Plasmodium falciparum (B50.9)',
      assessment: 'Uncomplicated P. falciparum malaria confirmed by rapid test. No features of severe malaria.',
      plan: '1. Artemether-Lumefantrine (Coartem) 4 tabs BD x 3 days\n2. Paracetamol 1g QDS for fever\n3. ORS for hydration\n4. Blood for MP and CBC\n5. Review in 48 hours'
    },
    prescriptions: [
      { medication: 'Artemether-Lumefantrine', dosage: '4 tablets', frequency: 'Twice daily', duration: '3 days', quantity: 24 },
      { medication: 'Paracetamol 1g', dosage: '1 tablet', frequency: 'Four times daily', duration: '3 days', quantity: 12 }
    ],
    labOrders: [
      { test: 'Malaria Parasite', priority: 'Urgent', status: 'Completed', result: 'Positive - P. falciparum ++' },
      { test: 'Complete Blood Count', priority: 'Urgent', status: 'Completed', result: 'Normal' }
    ],
    nursingOrders: [
      { type: 'IV Infusion', instructions: 'Normal Saline 1L over 4 hours' }
    ],
    referrals: [],
    radiologyOrders: [],
    followUp: { date: '2024-09-20', reason: 'Review response to treatment' },
    outcome: 'Recovered after treatment',
    pdfGenerated: true,
    pdfUrl: '/documents/consultation-CS-2024-003.pdf'
  }
];

// Medical timeline for patient
const demoMedicalTimeline = [
  { date: '2024-11-28', time: '09:15', event: 'Visit Started', type: 'visit', description: 'Current consultation - Recurring headaches' },
  { date: '2024-11-15', time: '10:30', event: 'Follow-up Visit', type: 'visit', description: 'Hypertension follow-up, medications adjusted' },
  { date: '2024-11-15', time: '11:00', event: 'Lab Results', type: 'lab', description: 'Lipid Profile & RFT - All normal' },
  { date: '2024-10-22', time: '14:45', event: 'Consultation', type: 'visit', description: 'Chest discomfort - Costochondritis diagnosed' },
  { date: '2024-10-22', time: '15:30', event: 'Imaging', type: 'imaging', description: 'Chest X-ray - Normal findings' },
  { date: '2024-09-18', time: '09:00', event: 'Emergency Visit', type: 'emergency', description: 'Fever & malaise - Malaria diagnosed and treated' },
  { date: '2024-09-18', time: '09:30', event: 'Lab Results', type: 'lab', description: 'Malaria Parasite Positive, CBC normal' },
  { date: '2024-08-05', time: '11:20', event: 'Eye Clinic', type: 'visit', description: 'Presbyopia diagnosed, reading glasses prescribed' },
  { date: '2024-07-12', time: '08:45', event: 'Annual Checkup', type: 'visit', description: 'Mild hypertension detected, started on Amlodipine' },
  { date: '2024-05-20', time: '10:00', event: 'Physiotherapy', type: 'visit', description: 'Lower back pain, physiotherapy started' },
  { date: '2024-05-20', time: '10:30', event: 'Imaging', type: 'imaging', description: 'Lumbar X-ray - Mild degenerative changes' },
];

// Priority utility functions are now imported from @/lib/utils/priority

export default function RoomPage({ params }: { params: Promise<{ roomId: string }> }) {
  const router = useRouter();
  const resolvedParams = use(params);
  const roomId = resolvedParams.roomId;

  const [room, setRoom] = useState<ConsultationRoom | null>(null);
  const [patients, setPatients] = useState<Patient[]>([]);
  const [currentPatient, setCurrentPatient] = useState<Patient | null>(null);
  const [sessionActive, setSessionActive] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [sessionStartTime, setSessionStartTime] = useState<Date | null>(null);
  const [sessionDuration, setSessionDuration] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<unknown | null>(null);
  useAuthRedirect(authError);
  const [activeTab, setActiveTab] = useState("notes");
  const [showEndDialog, setShowEndDialog] = useState(false);
  const [showRoomQueueDialog, setShowRoomQueueDialog] = useState(false);
  const [isEnding, setIsEnding] = useState(false);
  const [followUpRequired, setFollowUpRequired] = useState(false);
  const [followUpDate, setFollowUpDate] = useState("");
  const [followUpReason, setFollowUpReason] = useState("");
  const [medicalNotes, setMedicalNotes] = useState({ historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
  const [diagnoses, setDiagnoses] = useState<{ id: string; code: string; name: string; type: 'Primary' | 'Secondary' | 'Differential'; notes: string }[]>([]);
  const [medicalHistory, setMedicalHistory] = useState({
    allergies: [] as string[],
    diagnoses: [] as Array<{ code?: string; name: string; status: string; diagnosedDate?: string; treatingDoctor?: string }>,
    surgicalHistory: [] as Array<{ procedure: string; date: string; hospital: string }>,
    familyHistory: [] as Array<{ relation: string; condition: string }>,
    socialHistory: {
      smoking: '',
      alcohol: '',
      exercise: '',
      occupation: '',
    },
  });
  const [showEditMedicalHistory, setShowEditMedicalHistory] = useState(false);
  const [loadingMedicalHistory, setLoadingMedicalHistory] = useState(false);
  const [showAddDiagnosis, setShowAddDiagnosis] = useState(false);
  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [showDiagnosisDropdown, setShowDiagnosisDropdown] = useState(false);
  const [selectedDiagnosisType, setSelectedDiagnosisType] = useState<'Primary' | 'Secondary' | 'Differential'>('Primary');
  const [diagnosisNotes, setDiagnosisNotes] = useState('');
  const [prescriptions, setPrescriptions] = useState<{ 
    id: string;
    medication: string; 
    medicationId?: number; // Store the actual medication ID from database
    genericName: string;
    dosage: string; 
    frequency: string; 
    duration: string; 
    quantity: number;
    route: string;
    instructions: string;
    priority: string;
    status: 'Draft' | 'Sent to Pharmacy' | 'Processing' | 'Dispensed';
  }[]>([]);
  const [showAddPrescription, setShowAddPrescription] = useState(false);
  const [newPrescription, setNewPrescription] = useState({ 
    medication: "", 
    medicationId: undefined as number | undefined, // Store medication ID
    genericName: "",
    dosage: "", 
    frequency: "", 
    duration: "", 
    durationDays: 0,
    quantity: 0,
    route: "Oral",
    instructions: "",
    priority: "Routine"
  });
  const [medicationSearch, setMedicationSearch] = useState("");
  const [showMedicationDropdown, setShowMedicationDropdown] = useState(false);
  const [selectedMedications, setSelectedMedications] = useState<Set<number>>(new Set()); // Track selected medication IDs for multi-select
  const [medicationConfigs, setMedicationConfigs] = useState<Map<number, {
    dosage: string;
    frequency: string;
    duration: string;
    durationDays: number;
    quantity: number;
    route: string;
    instructions: string;
    priority: string;
  }>>(new Map()); // Store individual configuration for each selected medication
  const [prescriptionsSentToPharmacy, setPrescriptionsSentToPharmacy] = useState(false);
  const [medications, setMedications] = useState<any[]>([]); // Store real medications from API
  const [loadingMedications, setLoadingMedications] = useState(false);
  const [labOrders, setLabOrders] = useState<{ 
    id: string;
    test: string; 
    testId?: number; // Template ID
    code?: string;
    sampleType?: string;
    priority: string; 
    notes: string;
    status: 'Draft' | 'Sent to Lab';
  }[]>([]);
  const [showAddLabOrder, setShowAddLabOrder] = useState(false);
  const [newLabOrder, setNewLabOrder] = useState({ test: "", priority: "Routine", notes: "" });
  const [labTemplates, setLabTemplates] = useState<any[]>([]);
  const [loadingLabTemplates, setLoadingLabTemplates] = useState(false);
  const [labTemplateSearch, setLabTemplateSearch] = useState("");
  const [showLabTemplateDropdown, setShowLabTemplateDropdown] = useState(false);
  const [selectedLabTemplates, setSelectedLabTemplates] = useState<Set<number>>(new Set());
  const [nursingOrders, setNursingOrders] = useState<{
    id: string;
    type: 'Injection' | 'Dressing';
    medication?: string;
    dosage?: string;
    route?: string;
    woundLocation?: string;
    woundType?: string;
    supplies?: string;
    instructions: string;
    priority: 'Routine' | 'Urgent' | 'STAT';
    status: 'Draft' | 'Sent to Nursing' | 'In Progress' | 'Completed';
  }[]>([]);
  const [showAddNursingOrder, setShowAddNursingOrder] = useState(false);
  const [newNursingOrder, setNewNursingOrder] = useState({
    type: "" as string,
    medication: "",
    dosage: "",
    route: "Intramuscular (IM)",
    woundLocation: "",
    woundType: "",
    supplies: "",
    instructions: "",
    priority: "Routine"
  });
  const [injectionMedications, setInjectionMedications] = useState<Array<{ id: number; name: string; category?: string; strength?: string; generic_name?: string }>>([]);
  const [loadingInjectionMedications, setLoadingInjectionMedications] = useState(false);

  // Load injection medications from API
  useEffect(() => {
    const loadInjectionMedications = async () => {
      try {
        setLoadingInjectionMedications(true);
        // Fetch medications with form filter for injections
        // Try common injection form variations
        const formFilters = ['injection', 'injectable', 'injections', 'ampoule', 'vial', 'syringe'];
        let allMedications: Array<{ id: number; name: string; category?: string; strength?: string; generic_name?: string }> = [];
        
        // Try fetching with each form filter
        for (const form of formFilters) {
          try {
            const response = await pharmacyService.getMedications({ 
              form: form,
              page_size: 1000 
            });
            if (response.results && response.results.length > 0) {
              allMedications = [
                ...allMedications,
                ...response.results
                  .filter((m: any) => !allMedications.some(existing => existing.id === m.id))
                  .map((m: any) => ({
                    id: m.id,
                    name: m.name,
                    category: m.category || '',
                    strength: m.strength || '',
                    generic_name: m.generic_name || '',
                  }))
              ];
            }
          } catch (formErr) {
            // Continue to next form filter
            continue;
          }
        }
        
        // If no results from form filters, try fetching all medications and filtering by name/unit
        if (allMedications.length === 0) {
          try {
            const allResponse = await pharmacyService.getMedications({ page_size: 1000 });
            if (allResponse.results && allResponse.results.length > 0) {
              // Filter for medications that are likely injections (by unit or name)
              const injectionKeywords = ['injection', 'inj', 'amp', 'vial', 'ml'];
              allMedications = allResponse.results
                .filter((m: any) => {
                  const nameLower = (m.name || '').toLowerCase();
                  const unitLower = (m.unit || '').toLowerCase();
                  const formLower = (m.form || '').toLowerCase();
                  return injectionKeywords.some(keyword => 
                    nameLower.includes(keyword) || 
                    unitLower.includes(keyword) || 
                    formLower.includes(keyword)
                  );
                })
                .map((m: any) => ({
                  id: m.id,
                  name: m.name,
                  category: m.category || '',
                  strength: m.strength || '',
                  generic_name: m.generic_name || '',
                }));
            }
          } catch (allErr) {
            console.warn('Failed to load all medications:', allErr);
          }
        }
        
        // Set medications from API (empty array if none found)
        setInjectionMedications(allMedications);
        if (allMedications.length > 0) {
          console.log(`[Nursing Orders] Loaded ${allMedications.length} injection medications from API`);
        } else {
          console.warn('[Nursing Orders] No injection medications found in API');
        }
      } catch (err) {
        console.error('Failed to load injection medications:', err);
        toast.error('Failed to load injection medications. Please try again.');
        setInjectionMedications([]);
      } finally {
        setLoadingInjectionMedications(false);
      }
    };

    loadInjectionMedications();
  }, []);

  // Referral state
  const [referrals, setReferrals] = useState<{
    id: string;
    specialty: string;
    facility: string;
    facilityType: string;
    reason: string;
    urgency: 'Routine' | 'Urgent' | 'Emergency';
    clinicalSummary: string;
    contactPerson?: string;
    contactPhone?: string;
    status: 'Draft' | 'Sent' | 'Accepted' | 'Scheduled' | 'Completed';
  }[]>([]);
  const [showAddReferral, setShowAddReferral] = useState(false);
  const [newReferral, setNewReferral] = useState({
    specialty: "",
    facility: "",
    facilityType: "",
    reason: "",
    urgency: "Routine",
    clinicalSummary: "",
    contactPerson: "",
    contactPhone: ""
  });

  // Radiology state
  const [radiologyOrders, setRadiologyOrders] = useState<{
    id: string;
    procedure: string;
    category: string;
    bodyPart: string;
    clinicalIndication: string;
    priority: 'Routine' | 'Urgent' | 'STAT';
    contrastRequired: boolean;
    specialInstructions?: string;
    status: 'Draft' | 'Sent to Radiology' | 'Scheduled' | 'In Progress' | 'Completed';
  }[]>([]);
  const [showAddRadiology, setShowAddRadiology] = useState(false);
  const [newRadiology, setNewRadiology] = useState({
    procedure: "",
    category: "",
    bodyPart: "",
    clinicalIndication: "",
    priority: "Routine",
    contrastRequired: false,
    specialInstructions: ""
  });

  // Consultation session viewer state
  const [selectedSession, setSelectedSession] = useState<any | null>(null);
  const [showSessionViewer, setShowSessionViewer] = useState(false);
  const [expandedSessions, setExpandedSessions] = useState<string[]>([]);

  // Lab result viewer state
  const [selectedLabResult, setSelectedLabResult] = useState<any | null>(null);
  const [showLabResultViewer, setShowLabResultViewer] = useState(false);
  const [expandedLabResults, setExpandedLabResults] = useState<string[]>([]);

  const [selectedPrescription, setSelectedPrescription] = useState<any | null>(null);
  const [showPrescriptionViewer, setShowPrescriptionViewer] = useState(false);
  
  // Vitals detail modal state
  const [selectedVital, setSelectedVital] = useState<any | null>(null);
  const [isVitalsDetailModalOpen, setIsVitalsDetailModalOpen] = useState(false);
  const [vitalsHistory, setVitalsHistory] = useState<any[]>([]);
  const [loadingVitals, setLoadingVitals] = useState(false);
  
  // View vitals details
  const viewVitalsDetails = (vital: any) => {
    setSelectedVital(vital);
    setIsVitalsDetailModalOpen(true);
  };

  // History tab filters
  const [sessionDateFilter, setSessionDateFilter] = useState<string>('all');
  const [labDateFilter, setLabDateFilter] = useState<string>('all');
  const [labStatusFilter, setLabStatusFilter] = useState<string>('all');
  const [imagingDateFilter, setImagingDateFilter] = useState<string>('all');
  const [imagingStatusFilter, setImagingStatusFilter] = useState<string>('all');
  const [vitalsDateFilter, setVitalsDateFilter] = useState<string>('all');
  const [prescriptionsDateFilter, setPrescriptionsDateFilter] = useState<string>('all');
  const [prescriptionsStatusFilter, setPrescriptionsStatusFilter] = useState<string>('all');
  
  // Pagination state
  const [consultationsPage, setConsultationsPage] = useState(1);
  const [labResultsPage, setLabResultsPage] = useState(1);
  const [imagingPage, setImagingPage] = useState(1);
  const [vitalsPage, setVitalsPage] = useState(1);
  const [prescriptionsPage, setPrescriptionsPage] = useState(1);
  const [consultationsPerPage, setConsultationsPerPage] = useState(10);
  const [labResultsPerPage, setLabResultsPerPage] = useState(10);
  const [imagingPerPage, setImagingPerPage] = useState(10);
  const [vitalsPerPage, setVitalsPerPage] = useState(10);
  const [prescriptionsPerPage, setPrescriptionsPerPage] = useState(10);

  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  
  // Function to refresh only the queue data (for modal refresh)
  const refreshQueueData = async () => {
    setIsRefreshingQueue(true);
    try {
      const numericRoomId = parseInt(roomId);
      if (isNaN(numericRoomId)) {
        return;
      }
      
      // Load queue items for this room
      let queueItems: any[] = [];
      try {
        const roomQueueResult = await apiFetch<any[]>(`/consultation/rooms/${numericRoomId}/queue/`);
        queueItems = Array.isArray(roomQueueResult) ? roomQueueResult : [];
      } catch (err) {
        try {
          const queueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?room=${numericRoomId}&is_active=true&page_size=1000`);
          queueItems = queueResult.results || [];
        } catch (filterErr) {
          const allQueueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?is_active=true&page_size=1000`);
          const allItems = allQueueResult.results || [];
          queueItems = allItems.filter((item: any) => {
            const itemRoomId = typeof item.room === 'number' ? item.room : parseInt(item.room);
            return itemRoomId === numericRoomId;
          });
        }
      }
      
      // Sort queue by priority
      const sortedQueue = queueItems.sort((a, b) => {
        if (a.priority !== b.priority) {
          return a.priority - b.priority;
        }
        return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
      });
      
      // Transform queue items to Patient objects
      const transformedPatients = await Promise.all(sortedQueue.map(async (item: any, index: number) => {
        try {
          const patient = await patientService.getPatient(item.patient);
          
          let visitDate = new Date().toISOString().split('T')[0];
          let visitTime = new Date().toTimeString().slice(0, 5);
            if (item.visit) {
              try {
                const visit = await apiFetch(`/visits/${item.visit}/`) as {
                  date?: string;
                  time?: string;
                };
                visitDate = visit.date || visitDate;
                visitTime = visit.time || visitTime;
              } catch (err) {
                console.warn('Could not load visit details:', err);
              }
            }
            
            let vitalsData = null;
            if (item.visit) {
              try {
                const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${item.visit}&ordering=-recorded_at`);
                vitalsData = vitalsResult.results?.[0] || null;
              } catch (err) {
                console.warn('Could not load vitals:', err);
              }
            }
            
            const queuedAt = new Date(item.queued_at);
            const waitTime = Math.floor((Date.now() - queuedAt.getTime()) / (1000 * 60));
            
            const getPriority = (priorityNum: number): Patient['priority'] => {
              return getPriorityLabel(priorityNum);
            };
            
            return {
              id: String(item.patient),
              visitId: item.visit ? String(item.visit) : '',
              patientId: patient.patient_id || String(patient.id),
              name: patient.full_name || `${patient.first_name} ${patient.surname}`,
              age: patient.age || 0,
              gender: patient.gender || '',
              mrn: patient.patient_id || '',
              personalNumber: patient.personal_number || '',
              allergies: [],
            waitTime: waitTime > 0 ? waitTime : 0,
            vitalsCompleted: !!vitalsData,
            priority: getPriority(typeof item.priority === 'number' ? item.priority : parseInt(item.priority) || 0),
            visitDate,
            visitTime,
            queuePosition: index + 1,
            bloodGroup: patient.blood_group || undefined,
            genotype: patient.genotype || undefined,
            employeeType: (patient as any).employee_type || undefined,
            division: (patient as any).division || undefined,
            location: (patient as any).location || undefined,
            phone: (patient as any).phone || undefined,
            email: (patient as any).email || undefined,
            occupation: (patient as any).occupation || undefined,
            religion: (patient as any).religion || undefined,
            tribe: (patient as any).tribe || undefined,
            photo: (patient as any).photo || null,
            vitals: vitalsData ? {
              temperature: vitalsData.temperature?.toString() || '',
              bloodPressure: `${vitalsData.blood_pressure_systolic || ''}/${vitalsData.blood_pressure_diastolic || ''}`,
              heartRate: vitalsData.heart_rate?.toString() || '',
              respiratoryRate: vitalsData.respiratory_rate?.toString() || '',
              oxygenSaturation: vitalsData.oxygen_saturation?.toString() || '',
              weight: vitalsData.weight?.toString() || '',
              height: vitalsData.height?.toString() || '',
              recordedAt: vitalsData.recorded_at || new Date().toISOString(),
            } : undefined,
          } as Patient;
        } catch (err) {
          console.error(`Error loading patient ${item.patient}:`, err);
          return null;
        }
      }));
      
      // Filter out any null results
      const validPatients = transformedPatients.filter((p): p is Patient => p !== null);
      setPatients(validPatients);
    } catch (err: any) {
      console.error('Error refreshing queue:', err);
      toast.error('Failed to refresh queue');
    } finally {
      setIsRefreshingQueue(false);
    }
  };
  
  const loadRoomData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Convert roomId to integer (it might be a string from URL)
      const numericRoomId = parseInt(roomId);
      if (isNaN(numericRoomId)) {
        setError('Invalid room ID');
        setLoading(false);
        return;
      }
      
      // Load room details
      const roomData = await roomService.getRoom(numericRoomId);
      
      // Load queue items for this room
      // Try the room-specific queue endpoint first, then fallback to filtered query
      let queueItems: any[] = [];
      try {
        // Try the room-specific queue endpoint: /consultation/rooms/{id}/queue/
        console.log(`Attempting to load queue from /consultation/rooms/${numericRoomId}/queue/`);
        const roomQueueResult = await apiFetch<any[]>(`/consultation/rooms/${numericRoomId}/queue/`);
        queueItems = Array.isArray(roomQueueResult) ? roomQueueResult : [];
        console.log(`Room-specific endpoint returned ${queueItems.length} items:`, roomQueueResult);
      } catch (err) {
        console.warn('Room-specific queue endpoint failed, trying filtered endpoint:', err);
        // Fallback: Use filtered queue endpoint
        try {
          const queueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?room=${numericRoomId}&is_active=true&page_size=1000`);
          queueItems = queueResult.results || [];
          console.log(`Filtered endpoint returned ${queueItems.length} items:`, queueResult);
        } catch (filterErr) {
          console.warn('Filtered queue endpoint failed, loading all queue items:', filterErr);
          // Last resort: Load all and filter client-side
          const allQueueResult = await apiFetch<{ results: any[] }>(`/consultation/queue/?is_active=true&page_size=1000`);
          const allItems = allQueueResult.results || [];
          console.log(`Loaded ${allItems.length} total active queue items, filtering for room ${numericRoomId}`);
          // Filter by room client-side
          queueItems = allItems.filter((item: any) => {
            const itemRoomId = typeof item.room === 'number' ? item.room : parseInt(item.room);
            const matches = itemRoomId === numericRoomId;
            if (!matches && allItems.length > 0) {
              console.log(`Queue item ${item.id} has room ${itemRoomId} (expected ${numericRoomId})`);
            }
            return matches;
          });
          console.log(`After filtering, found ${queueItems.length} items for room ${numericRoomId}`);
        }
      }
      
      console.log(`Final: Loaded ${queueItems.length} queue items for room ${numericRoomId}`, queueItems);
        
        // Sort queue by priority (lower number = higher priority), then by queued_at
        const sortedQueue = queueItems.sort((a, b) => {
          if (a.priority !== b.priority) {
            return a.priority - b.priority;
          }
          return new Date(a.queued_at).getTime() - new Date(b.queued_at).getTime();
        });
        
        // Transform queue items to Patient objects
        const transformedPatients = await Promise.all(sortedQueue.map(async (item: any, index: number) => {
          try {
            // Get patient details
            const patient = await patientService.getPatient(item.patient);
            
            // Get visit details if available
            let visitDate = new Date().toISOString().split('T')[0];
            let visitTime = new Date().toTimeString().slice(0, 5);
            
            if (item.visit) {
              try {
                const visit = await apiFetch(`/visits/${item.visit}/`) as {
                  date?: string;
                  time?: string;
                };
                visitDate = visit.date || visitDate;
                visitTime = visit.time || visitTime;
              } catch (err) {
                console.warn('Could not load visit details:', err);
              }
            }
            
            // Get vitals if available
            let vitalsData = null;
            if (item.visit) {
              try {
                const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${item.visit}&ordering=-recorded_at`);
                vitalsData = vitalsResult.results?.[0] || null;
              } catch (err) {
                console.warn('Could not load vitals:', err);
              }
            }
            
            // Calculate wait time
            const queuedAt = new Date(item.queued_at);
            const waitTime = Math.floor((Date.now() - queuedAt.getTime()) / (1000 * 60));
            
            // Map priority (integer) to string using centralized utility
            // NOTE: Priority comes from ConsultationQueue model and was automatically set based on visit_type
            // when the patient was added to the queue. No manual priority selection is needed.
            const getPriority = (priorityNum: number): Patient['priority'] => {
              return getPriorityLabel(priorityNum);
            };
            
            return {
              id: String(item.patient), // Use patient ID from queue, not queue item ID
              visitId: item.visit ? String(item.visit) : '',
              patientId: patient.patient_id || String(patient.id), // Display ID (e.g., "PAT-2024-001")
              name: patient.full_name || `${patient.first_name} ${patient.surname}`,
              age: patient.age || 0,
              gender: patient.gender || '',
              mrn: patient.patient_id || '',
              personalNumber: patient.personal_number || '',
              allergies: patient.allergies ? patient.allergies.split(/[,\n]/).map(a => a.trim()).filter(a => a) : [],
              waitTime: waitTime > 0 ? waitTime : 0,
              vitalsCompleted: !!vitalsData,
              priority: getPriority(typeof item.priority === 'number' ? item.priority : parseInt(item.priority) || 0), // Default to 0 (Emergency) to match backend default
              visitDate,
              visitTime,
              queuePosition: index + 1,
              bloodGroup: patient.blood_group || undefined,
              genotype: patient.genotype || undefined,
              employeeType: (patient as any).employee_type || undefined,
              division: (patient as any).division || undefined,
              location: (patient as any).location || undefined,
              phone: (patient as any).phone || undefined,
              email: (patient as any).email || undefined,
              occupation: (patient as any).occupation || undefined,
              religion: (patient as any).religion || undefined,
              tribe: (patient as any).tribe || undefined,
              vitals: vitalsData ? {
                temperature: vitalsData.temperature?.toString() || '',
                bloodPressure: `${vitalsData.blood_pressure_systolic || ''}/${vitalsData.blood_pressure_diastolic || ''}`,
                heartRate: vitalsData.heart_rate?.toString() || '',
                respiratoryRate: vitalsData.respiratory_rate?.toString() || '',
                oxygenSaturation: vitalsData.oxygen_saturation?.toString() || '',
                weight: vitalsData.weight?.toString() || '',
                height: vitalsData.height?.toString() || '',
                recordedAt: vitalsData.recorded_at || new Date().toISOString(),
              } : undefined,
            } as Patient;
          } catch (err) {
            console.error(`Error loading patient ${item.patient}:`, err);
            return null;
          }
        }));
        
        const validPatients = transformedPatients.filter((p): p is Patient => p !== null);
        
        // Transform room data
        const transformedRoom: ConsultationRoom = {
          id: String(roomData.id),
          name: roomData.name,
          status: roomData.status?.toLowerCase() === 'active' ? 'available' as const : 'occupied' as const,
          currentPatient: validPatients.length > 0 ? validPatients[0].name : undefined,
          startTime: undefined,
          doctor: (roomData as any).assigned_doctor || undefined,
          specialtyFocus: roomData.specialty || 'General Practice',
          totalConsultationsToday: 0, // TODO: Calculate from visits
          averageConsultationTime: 0, // TODO: Calculate from sessions
          queue: sortedQueue.map((item: any, index: number) => ({
            patient_id: String(item.patient),
            position: index + 1,
          })),
        };
        
        setRoom(transformedRoom);
        setPatients(validPatients);
        
        // Check for active session and restore it
        const activeSession = (roomData as any).active_session;
        if (activeSession && activeSession.id) {
          console.log('Found active session, restoring...', activeSession);
          await restoreActiveSession(activeSession.id);
        }
      } catch (err) {
        console.error('Error loading room data:', err);
        if (isAuthenticationError(err)) {
          setAuthError(err);
        } else {
          setError('Failed to load consultation room. Please try again.');
        }
      } finally {
        setLoading(false);
      }
    };
  
  // Function to restore active session
  const restoreActiveSession = async (sessionId: number) => {
    try {
      console.log('Restoring active session:', sessionId);
      
      // Load full session data
      const session: ConsultationSession = await consultationService.getSession(sessionId);
      console.log('Loaded session data:', session);
      
      // Load patient data
      const patient = await patientService.getPatient(session.patient);
      console.log('Loaded patient data:', patient);
      
      // Load visit data if available
      let visitData: any = null;
      let visitId: string | number | null = null;
      if (session.visit) {
        visitId = session.visit;
        try {
          visitData = await apiFetch(`/visits/${visitId}/`);
          console.log('Loaded visit data:', visitData);
        } catch (visitErr) {
          console.warn('Could not load visit data:', visitErr);
        }
      }
      
      // Restore patient state
      const restoredPatient: Patient = {
        id: String(patient.id),
        visitId: visitId ? String(visitId) : '',
        patientId: patient.patient_id || String(patient.id),
        name: patient.full_name || `${patient.first_name} ${patient.surname}`,
        age: patient.age || 0,
        gender: patient.gender || '',
        mrn: patient.patient_id || '',
        personalNumber: (patient as any).personal_number,
        allergies: patient.allergies ? patient.allergies.split(/[,\n]/).map(a => a.trim()).filter(a => a) : [],
        waitTime: 0,
        vitalsCompleted: false,
        priority: 'Medium' as const,
        visitDate: visitData?.date || new Date().toISOString().split('T')[0],
        visitTime: visitData?.time || '',
        bloodGroup: (patient as any).blood_group,
        genotype: (patient as any).genotype,
        employeeType: (patient as any).employee_type,
        division: (patient as any).division,
        location: (patient as any).location,
        phone: (patient as any).phone,
        email: (patient as any).email,
        occupation: (patient as any).occupation,
        religion: (patient as any).religion,
        tribe: (patient as any).tribe,
        photo: (patient as any).photo || null,
      };
      
      // Load vitals if available
      if (visitId) {
        try {
          const vitalsResult = await apiFetch<{ results: any[] }>(`/vitals/?visit=${visitId}&page_size=100`);
          const latestVitals = vitalsResult.results?.[0];
          if (latestVitals) {
            restoredPatient.vitals = {
              temperature: latestVitals.temperature || '',
              bloodPressure: latestVitals.systolic_bp && latestVitals.diastolic_bp 
                ? `${latestVitals.systolic_bp}/${latestVitals.diastolic_bp}` 
                : '',
              heartRate: latestVitals.heart_rate || '',
              respiratoryRate: latestVitals.respiratory_rate || '',
              oxygenSaturation: latestVitals.oxygen_saturation || '',
              weight: latestVitals.weight || '',
              height: latestVitals.height || '',
              recordedAt: latestVitals.recorded_at || '',
            };
            restoredPatient.vitalsCompleted = true;
          }
        } catch (vitalsErr) {
          console.warn('Could not load vitals:', vitalsErr);
        }
      }
      
      // Restore session state
      setCurrentPatient(restoredPatient);
      setSessionActive(true);
      setSessionId(session.id);
      setSessionStartTime(new Date(session.started_at));
      
      // Calculate session duration
      const now = new Date();
      const startTime = new Date(session.started_at);
      const minutes = Math.floor((now.getTime() - startTime.getTime()) / (1000 * 60));
      setSessionDuration(minutes);
      
      // Restore medical notes
      setMedicalNotes({
        historyOfPresentIllness: session.history_of_presenting_illness || '',
        physicalExamination: session.physical_examination || '',
        assessment: session.assessment || '',
        plan: session.plan || '',
      });
      
      // Load medical history
      try {
        const numericPatientId = typeof patient.id === 'number' ? patient.id : parseInt(patient.id, 10);
        const history = await patientService.getPatientHistory(numericPatientId);
        setMedicalHistory({
          allergies: Array.isArray(history.allergies) ? history.allergies : [],
          diagnoses: Array.isArray(history.diagnoses) ? history.diagnoses : [],
          surgicalHistory: Array.isArray(history.surgical_history) ? history.surgical_history : [],
          familyHistory: Array.isArray(history.family_history) ? history.family_history : [],
          socialHistory: {
            smoking: history.social_history?.smoking || '',
            alcohol: history.social_history?.alcohol || '',
            exercise: history.social_history?.exercise || '',
            occupation: history.social_history?.occupation || '',
          },
        });
      } catch (historyErr) {
        console.warn('Could not load medical history:', historyErr);
        setMedicalHistory({
          allergies: [],
          diagnoses: [],
          surgicalHistory: [],
          familyHistory: [],
          socialHistory: { smoking: '', alcohol: '', exercise: '', occupation: '' },
        });
      }
      
      // Load prescriptions if visit exists
      if (visitId) {
        try {
          const prescriptionsResult = await apiFetch<{ results: any[] }>(`/pharmacy/prescriptions/?visit=${visitId}&page_size=100`);
          // Transform prescriptions for the UI
          const transformedPrescriptions = prescriptionsResult.results?.flatMap((rx: any) => 
            (rx.medications || []).map((item: any) => ({
              id: `RX-${rx.id}-${item.id}`,
              medication: item.medication?.name || 'Unknown',
              medicationId: item.medication?.id,
              genericName: item.medication?.generic_name || '',
              dosage: item.dosage || '',
              frequency: item.frequency || '',
              duration: item.duration || '',
              quantity: item.quantity || 0,
              route: item.route || 'Oral',
              instructions: item.instructions || '',
              priority: item.priority || 'Routine',
              status: rx.status === 'dispensed' ? 'Dispensed' : rx.status === 'partially_dispensed' ? 'Partially Dispensed' : 'Draft',
            })) || []
          ) || [];
          setPrescriptions(transformedPrescriptions);
        } catch (prescriptionErr) {
          console.warn('Could not load prescriptions:', prescriptionErr);
        }
      }
      
      // Load lab orders if visit exists
      if (visitId) {
        try {
          const labOrdersResult = await apiFetch<{ results: any[] }>(`/laboratory/orders/?visit=${visitId}&page_size=100`);
          // Transform lab orders - each order has multiple tests
          const transformedLabOrders: typeof labOrders = [];
          labOrdersResult.results?.forEach((order: any) => {
            // Each order can have multiple tests
            (order.tests || []).forEach((test: any) => {
              transformedLabOrders.push({
                id: `LAB-${order.id}-${test.id}`,
                test: test.name || 'Unknown Test',
                testId: test.template,
                code: test.code,
                sampleType: test.sample_type,
                priority: order.priority === 'routine' ? 'Routine' : order.priority === 'urgent' ? 'Urgent' : 'STAT',
                notes: test.notes || order.clinical_notes || '',
                status: 'Sent to Lab' as const, // Already sent if loaded from API
              });
            });
          });
          setLabOrders(transformedLabOrders);
        } catch (labErr) {
          console.warn('Could not load lab orders:', labErr);
        }
      }
      
      // Load radiology orders if visit exists
      if (visitId) {
        try {
          const radiologyOrdersResult = await apiFetch<{ results: any[] }>(`/radiology/orders/?visit=${visitId}&page_size=100`);
          // Transform radiology orders - each order has multiple studies
          const transformedRadiologyOrders: typeof radiologyOrders = [];
          radiologyOrdersResult.results?.forEach((order: any) => {
            // Each order can have multiple studies
            (order.studies || []).forEach((study: any) => {
              transformedRadiologyOrders.push({
                id: `RAD-${order.id}-${study.id}`,
                procedure: study.procedure || 'Unknown Procedure',
                category: study.modality || 'X-Ray',
                bodyPart: study.body_part || '',
                clinicalIndication: order.clinical_notes || '',
                priority: order.priority === 'routine' ? 'Routine' : order.priority === 'urgent' ? 'Urgent' : 'STAT',
                contrastRequired: false, // Not stored in backend model
                specialInstructions: study.technical_notes || undefined,
                status: 'Sent to Radiology' as const, // Already sent if loaded from API
              });
            });
          });
          setRadiologyOrders(transformedRadiologyOrders);
        } catch (radiologyErr) {
          console.warn('Could not load radiology orders:', radiologyErr);
        }
      }
      
      toast.success(`Restored active session with ${restoredPatient.name}`);
      console.log('Session restored successfully');
    } catch (err: any) {
      console.error('Error restoring active session:', err);
      toast.error('Failed to restore active session. You may need to start a new session.');
      // Don't throw - allow the page to load normally
    }
  };
  
  useEffect(() => {
    loadRoomData();
  }, [roomId]);

  // Load medications from API when component mounts
  useEffect(() => {
    const loadMedications = async () => {
      try {
        setLoadingMedications(true);
        const response = await pharmacyService.getMedications({ page_size: 1000 });
        const loadedMeds = response.results || [];
        setMedications(loadedMeds);
        console.log(`[Consultation] Loaded ${loadedMeds.length} medications from API`);
        // Debug: Check if paracetamol is in the list
        const paracetamolMeds = loadedMeds.filter((m: any) => m.name?.toLowerCase().includes('paracetamol'));
        if (paracetamolMeds.length > 0) {
          console.log(`[Consultation] Found ${paracetamolMeds.length} paracetamol medications:`, paracetamolMeds.map((m: any) => m.name));
        }
      } catch (err) {
        console.error('Failed to load medications:', err);
        toast.error('Failed to load medications. Using fallback list.');
        // Keep medications as empty array if loading fails
      } finally {
        setLoadingMedications(false);
      }
    };
    loadMedications();
  }, []);

  // Load lab templates from API when component mounts
  useEffect(() => {
    const loadLabTemplates = async () => {
      try {
        setLoadingLabTemplates(true);
        const templates = await labService.getTemplates();
        setLabTemplates(templates);
        console.log(`[Consultation] Loaded ${templates.length} lab templates from API`);
      } catch (err) {
        console.error('Failed to load lab templates:', err);
        toast.error('Failed to load lab templates. Some tests may not be available.');
      } finally {
        setLoadingLabTemplates(false);
      }
    };
    
    loadLabTemplates();
  }, []);

  // Close lab template dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (showLabTemplateDropdown && !target.closest('[data-lab-template-dropdown]')) {
        setShowLabTemplateDropdown(false);
      }
    };
    
    if (showLabTemplateDropdown) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showLabTemplateDropdown]);
  
  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await loadRoomData();
      toast.success('Queue refreshed');
    } catch (err) {
      console.error('Error refreshing:', err);
      toast.error('Failed to refresh queue');
    } finally {
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    if (!sessionActive || !sessionStartTime) return;
    const interval = setInterval(() => {
      const now = new Date();
      const minutes = Math.floor((now.getTime() - sessionStartTime.getTime()) / (1000 * 60));
      setSessionDuration(minutes);
    }, 60000);
    return () => clearInterval(interval);
  }, [sessionActive, sessionStartTime]);

  // Auto-save medical notes every 30 seconds
  useEffect(() => {
    if (!sessionActive || !sessionId) return;
    
    const autoSave = async () => {
      try {
        await consultationService.updateSession(sessionId, {
          history_of_presenting_illness: medicalNotes.historyOfPresentIllness || '',
          physical_examination: medicalNotes.physicalExamination || '',
          assessment: medicalNotes.assessment || '',
          plan: medicalNotes.plan || '',
        });
        console.log('Auto-saved medical notes');
      } catch (err) {
        console.error('Auto-save failed:', err);
        // Don't show error to user - silent fail for auto-save
      }
    };
    
    // Save immediately on mount if there's data
    if (medicalNotes.historyOfPresentIllness || medicalNotes.physicalExamination || 
        medicalNotes.assessment || medicalNotes.plan) {
      autoSave();
    }
    
    // Then save every 30 seconds
    const interval = setInterval(autoSave, 30000);
    return () => clearInterval(interval);
  }, [sessionActive, sessionId, medicalNotes]);

  const handleStartSession = async (patient: Patient) => {
    try {
      // Check if there's already an active session
      if (sessionActive && sessionId) {
        const confirmed = window.confirm(
          `There is already an active session with ${currentPatient?.name || 'a patient'}. ` +
          `Do you want to end that session and start a new one with ${patient.name}?`
        );
        if (!confirmed) {
          return;
        }
        // End the current session first
        try {
          await consultationService.endSession(sessionId);
        } catch (endErr) {
          console.warn('Error ending previous session:', endErr);
          // Continue anyway - backend will handle conflicts
        }
      }
      
      // Create consultation session in backend
      const numericRoomId = parseInt(roomId);
      // patient.id is now the actual patient database ID (from queue item.patient)
      // patient.patientId is the display ID (e.g., "PAT-2024-001")
      const numericPatientId = parseInt(patient.id);
      const numericVisitId = patient.visitId ? parseInt(patient.visitId) : null;
      
      if (isNaN(numericRoomId) || isNaN(numericPatientId)) {
        toast.error('Invalid room or patient ID');
        console.error('Room ID:', numericRoomId, 'Patient ID:', numericPatientId, 'Patient object:', patient);
        return;
      }
      
      const sessionData = await apiFetch<{ id: number }>('/consultation/sessions/', {
        method: 'POST',
        body: JSON.stringify({
          room: numericRoomId,
          patient: numericPatientId,
          visit: numericVisitId,
          status: 'active', // Valid choices: 'active', 'completed', 'cancelled'
          // Note: priority is for ConsultationQueue, not ConsultationSession
        }),
      });
      
      setCurrentPatient(patient);
      setSessionActive(true);
      setSessionId(sessionData.id);
      setSessionStartTime(new Date());
      setSessionDuration(0);
      
      // Reset form states for new session
      setMedicalNotes({ historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
      setDiagnoses([]);
      setPrescriptions([]);
      setLabOrders([]); // Reset lab orders when starting new session
      setNursingOrders([]);
      setReferrals([]);
      setRadiologyOrders([]);
      setFollowUpRequired(false);
      setFollowUpDate("");
      setFollowUpReason("");
      
      // Load medical history for the patient
      try {
        const history = await patientService.getPatientHistory(numericPatientId);
        setMedicalHistory({
          allergies: Array.isArray(history.allergies) ? history.allergies : [],
          diagnoses: Array.isArray(history.diagnoses) ? history.diagnoses : [],
          surgicalHistory: Array.isArray(history.surgical_history) ? history.surgical_history : [],
          familyHistory: Array.isArray(history.family_history) ? history.family_history : [],
          socialHistory: {
            smoking: history.social_history?.smoking || '',
            alcohol: history.social_history?.alcohol || '',
            exercise: history.social_history?.exercise || '',
            occupation: history.social_history?.occupation || '',
          },
        });
      } catch (historyErr) {
        console.warn('Could not load medical history:', historyErr);
        setMedicalHistory({
          allergies: [],
          diagnoses: [],
          surgicalHistory: [],
          familyHistory: [],
          socialHistory: { smoking: '', alcohol: '', exercise: '', occupation: '' },
        });
      }
      
      // Load vitals history
      try {
        setLoadingVitals(true);
        const vitals = await patientService.getPatientVitals(numericPatientId);
        // Transform vitals to match the format expected by the UI
        const transformedVitals = vitals.map((v: any) => ({
          id: v.id?.toString() || '',
          date: v.recorded_at ? new Date(v.recorded_at).toLocaleDateString() : '',
          time: v.recorded_at ? new Date(v.recorded_at).toLocaleTimeString() : '',
          temperature: v.temperature?.toString() || '',
          bloodPressure: v.blood_pressure_systolic && v.blood_pressure_diastolic 
            ? `${v.blood_pressure_systolic}/${v.blood_pressure_diastolic}` 
            : '',
          heartRate: v.heart_rate?.toString() || '',
          respiratoryRate: v.respiratory_rate?.toString() || '',
          oxygenSaturation: v.oxygen_saturation?.toString() || '',
          weight: v.weight?.toString() || '',
          height: v.height?.toString() || '',
          recordedBy: v.recorded_by_name || 'Unknown',
          // For VitalsDetailModal
          recordedAt: v.recorded_at || '',
          bloodPressureSystolic: v.blood_pressure_systolic?.toString() || '',
          bloodPressureDiastolic: v.blood_pressure_diastolic?.toString() || '',
          pulse: v.heart_rate?.toString() || '',
          bmi: v.bmi?.toString() || '',
          notes: v.notes || '',
        }));
        setVitalsHistory(transformedVitals);
      } catch (vitalsErr) {
        console.warn('Could not load vitals:', vitalsErr);
        setVitalsHistory([]);
      } finally {
        setLoadingVitals(false);
      }
      
      toast.success(`Session started with ${patient.name}`);
    } catch (err: any) {
      console.error('Error starting session:', err);
      toast.error(err.message || 'Failed to start consultation session');
    }
  };

  // Generate consultation session PDF
  const generateSessionPDF = () => {
    if (!currentPatient) return null;
    
    const sessionId = `CS-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`;
    const sessionData = {
      id: sessionId,
      date: new Date().toISOString().split('T')[0],
      time: sessionStartTime ? `${new Date(sessionStartTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })} - ${new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}` : '',
      duration: `${sessionDuration} min`,
      clinic: 'General', // This would come from context
      room: room?.name || 'Unknown',
      doctor: 'Dr. Current User', // This would come from auth context
      doctorSpecialty: room?.specialtyFocus || 'General Practice',
      patient: {
        name: currentPatient.name,
        patientId: currentPatient.patientId,
        age: currentPatient.age,
        gender: currentPatient.gender
      },
      vitals: currentPatient.vitals,
      medicalNotes: medicalNotes,
      prescriptions: prescriptions,
      labOrders: labOrders,
      nursingOrders: nursingOrders,
      referrals: referrals,
      radiologyOrders: radiologyOrders,
      followUp: followUpRequired ? { date: followUpDate, reason: followUpReason } : null,
      pdfGenerated: true,
      pdfUrl: `/documents/consultation-${sessionId}.pdf`
    };
    
    // In a real implementation, this would call an API to generate the PDF
    // For now, we'll simulate PDF generation
    console.log('Generating PDF for session:', sessionData);
    return sessionData;
  };

  // View session details
  const viewSessionDetails = (session: any) => {
    setSelectedSession(session);
    setShowSessionViewer(true);
  };

  // Toggle session expansion in history
  const toggleSessionExpansion = (sessionId: string) => {
    setExpandedSessions(prev => 
      prev.includes(sessionId) 
        ? prev.filter(id => id !== sessionId)
        : [...prev, sessionId]
    );
  };

  // Download session PDF
  const downloadSessionPDF = (session: any) => {
    // In a real implementation, this would download the actual PDF
    toast.success(`Downloading consultation report: ${session.id}`, {
      description: `Session from ${session.date}`
    });
  };

  // Print session
  const printSession = (session: any) => {
    // In a real implementation, this would open print dialog
    toast.info(`Opening print dialog for ${session.id}`);
    window.print();
  };

  // View lab result details
  const viewLabResultDetails = (labResult: any) => {
    setSelectedLabResult(labResult);
    setShowLabResultViewer(true);
  };

  // View prescription details
  const viewPrescriptionDetails = (prescription: any) => {
    setSelectedPrescription(prescription);
    setShowPrescriptionViewer(true);
  };

  // Toggle lab result expansion in history
  const toggleLabResultExpansion = (labId: string) => {
    setExpandedLabResults(prev => 
      prev.includes(labId) 
        ? prev.filter(id => id !== labId)
        : [...prev, labId]
    );
  };

  // Download lab result PDF
  const downloadLabResultPDF = (labResult: any) => {
    toast.success(`Downloading lab report: ${labResult.id}`, {
      description: `${labResult.test} from ${labResult.date}`
    });
  };

  // Print lab result
  const printLabResult = (labResult: any) => {
    toast.info(`Opening print dialog for ${labResult.id}`);
    window.print();
  };

  // Get parameter status color
  const getParameterStatusColor = (status: string) => {
    switch (status) {
      case 'Normal': return 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20';
      case 'Abnormal': return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'Borderline': return 'text-amber-600 bg-amber-50 dark:bg-amber-900/20';
      case 'Critical': return 'text-red-700 bg-red-100 dark:bg-red-900/30 font-bold';
      default: return 'text-gray-600 bg-gray-50 dark:bg-gray-900/20';
    }
  };

  const confirmEndSession = async () => {
    setIsEnding(true);
    
    try {
      if (!sessionId) {
        throw new Error('No active session to end');
      }

      // Step 1: Save all medical notes and data to the session before ending
      const sessionUpdateData: any = {
        history_of_presenting_illness: medicalNotes.historyOfPresentIllness || '',
        physical_examination: medicalNotes.physicalExamination || '',
        assessment: medicalNotes.assessment || '',
        plan: medicalNotes.plan || '',
        notes: '', // Will be populated with diagnosis and follow-up info below
      };

      // Add diagnosis summary to notes if available
      if (diagnoses.length > 0) {
        const diagnosisSummary = diagnoses
          .filter(d => d.type === 'Primary')
          .map(d => `${d.code}: ${d.name}`)
          .join('; ');
        if (diagnosisSummary) {
          sessionUpdateData.notes = sessionUpdateData.notes 
            ? `${sessionUpdateData.notes}\n\nDiagnosis: ${diagnosisSummary}`
            : `Diagnosis: ${diagnosisSummary}`;
        }
      }

      // Add follow-up information to notes if scheduled
      if (followUpRequired && followUpDate && followUpReason) {
        const followUpNote = `\n\nFollow-up Appointment:\nDate: ${followUpDate}\nReason: ${followUpReason}`;
        sessionUpdateData.notes = sessionUpdateData.notes 
          ? `${sessionUpdateData.notes}${followUpNote}`
          : followUpNote.trim();
        
        // Create follow-up appointment
        if (currentPatient && sessionId) {
          try {
            const patientId = typeof currentPatient.id === 'string' ? parseInt(currentPatient.id, 10) : currentPatient.id;
            const doctorId = undefined; // Doctor ID can be set later or obtained from room/context
            await appointmentService.createAppointment({
              patient: patientId,
              doctor: doctorId,
              clinic: undefined, // Clinic can be obtained from room context if needed
              room: typeof room?.id === 'number' ? room.id : (typeof roomId === 'string' ? parseInt(roomId, 10) : undefined),
              appointment_type: 'follow_up',
              appointment_date: followUpDate,
              appointment_time: '09:00', // Default time, can be made configurable
              duration_minutes: 30,
              reason: followUpReason,
              notes: `Follow-up from consultation session ${sessionId}. ${sessionUpdateData.notes || ''}`,
            });
          } catch (apptError) {
            console.warn('Failed to create follow-up appointment:', apptError);
            // Continue - follow-up info is still saved in session notes as fallback
          }
        }
      }

      // Update session with all medical data
      try {
        if (!sessionId) throw new Error('Session ID is required');
        await consultationService.updateSession(sessionId, sessionUpdateData);
        console.log('Session data saved successfully');
      } catch (err) {
        console.error('Error saving session data:', err);
        toast.error('Failed to save session data. Please try again.');
        setIsEnding(false);
        return;
      }

      // Step 2: Deactivate queue item if patient was in queue
      if (currentPatient?.id) {
        try {
          const queueData = await consultationService.getQueue({
            room: parseInt(roomId),
            patient: typeof currentPatient.id === 'string' ? parseInt(currentPatient.id) : currentPatient.id,
            is_active: true,
          });
          
          if (queueData.results && queueData.results.length > 0) {
            const queueItem = queueData.results[0];
            await apiFetch(`/consultation/queue/${queueItem.id}/`, {
              method: 'PATCH',
              body: JSON.stringify({ is_active: false }),
            });
            console.log('Queue item deactivated');
          }
        } catch (err) {
          console.error('Error deactivating queue item:', err);
          // Don't fail the entire process if queue deactivation fails
        }
      }

      // Step 3: End the session using the dedicated endpoint
      try {
        if (!sessionId) throw new Error('Session ID is required');
        await consultationService.endSession(sessionId);
        console.log('Session ended successfully');
      } catch (err: any) {
        console.error('Error ending session:', err);
        throw new Error(err.message || 'Failed to end session');
      }
      
      // Generate PDF for the session
      const sessionPDF = generateSessionPDF();
      if (sessionPDF) {
        toast.success("Consultation report generated", {
          description: `Session ${sessionPDF.id} saved to patient history`,
          action: {
            label: "View",
            onClick: () => console.log("View PDF", sessionPDF.pdfUrl)
          }
        });
      }
      
      toast.success("Consultation session completed successfully");
      setPatients((prev) => prev.filter((p) => p.id !== currentPatient?.id));
      if (room) {
        setRoom({ ...room, totalConsultationsToday: room.totalConsultationsToday + 1, averageConsultationTime: Math.round((room.averageConsultationTime * room.totalConsultationsToday + sessionDuration) / (room.totalConsultationsToday + 1)) });
      }
      setCurrentPatient(null);
      setSessionActive(false);
      setSessionId(null);
      setSessionStartTime(null);
      setSessionDuration(0);
      setMedicalNotes({ historyOfPresentIllness: "", physicalExamination: "", assessment: "", plan: "" });
      setDiagnoses([]);
      setPrescriptions([]);
      setLabOrders([]); // Reset lab orders when starting new session
      setNursingOrders([]);
      setReferrals([]);
      setRadiologyOrders([]);
      setFollowUpRequired(false);
      setFollowUpDate("");
      setFollowUpReason("");
      setShowEndDialog(false);
    } catch (err: any) {
      console.error('Error ending session:', err);
      toast.error(err.message || 'Failed to end session properly');
    } finally {
      setIsEnding(false);
    }
  };

  const addPrescription = () => { 
    // Validate required fields
    if (!newPrescription.medication || !newPrescription.dosage || !newPrescription.frequency) {
      toast.error("Please fill in all required fields (medication, dosage, frequency)");
      return;
    }

    // CRITICAL: Ensure medicationId is present and is a valid number
    if (!newPrescription.medicationId || isNaN(Number(newPrescription.medicationId))) {
      toast.error("Please select a valid medication from the list. Medication ID is missing or invalid.");
      return;
    }

    const rxId = `RX-${Date.now()}`;
    const dailyDoses = frequencyToDailyDoses[newPrescription.frequency] || 1;
    const calculatedQty = newPrescription.frequency === 'STAT (Single dose)' 
      ? 1 
      : Math.ceil(dailyDoses * newPrescription.durationDays);
    
    setPrescriptions([...prescriptions, {
      id: rxId,
      medication: newPrescription.medication,
      medicationId: Number(newPrescription.medicationId), // Ensure it's a number
      genericName: newPrescription.genericName,
      dosage: newPrescription.dosage,
      frequency: newPrescription.frequency,
      duration: newPrescription.duration,
      quantity: calculatedQty || newPrescription.quantity,
      route: newPrescription.route,
      instructions: newPrescription.instructions,
      priority: newPrescription.priority,
      status: 'Draft'
    }]); 
    setNewPrescription({ medication: "", medicationId: undefined, genericName: "", dosage: "", frequency: "", duration: "", durationDays: 0, quantity: 0, route: "Oral", instructions: "", priority: "Routine" }); 
    setMedicationSearch("");
    setShowAddPrescription(false); 
    toast.success("Prescription added to order"); 
  };

  const sendPrescriptionsToPharmacy = async () => {
    if (prescriptions.length === 0) {
      toast.error("No prescriptions to send");
      return;
    }
    const draftPrescriptions = prescriptions.filter(rx => rx.status === 'Draft');
    if (draftPrescriptions.length === 0) {
      toast.info("All prescriptions have already been sent to pharmacy");
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      // Build items array for ONE prescription with ALL medications
      const prescriptionItems: any[] = [];
      const skippedMedications: string[] = [];
      
      for (const rx of draftPrescriptions) {
        // Use the stored medication ID, or try to find it from medications list
        let medicationId: number | undefined = rx.medicationId;
        
        if (!medicationId) {
          // Fallback: try to find medication by name
          const medication = medications.find((m: any) => m.name === rx.medication);
          if (medication) {
            medicationId = typeof medication.id === 'string' ? parseInt(medication.id, 10) : medication.id;
          } else {
            skippedMedications.push(rx.medication);
            continue; // Skip this medication
          }
        }
        
        // Ensure medicationId is a number
        const numericMedicationId = typeof medicationId === 'string' ? parseInt(medicationId, 10) : medicationId;
        
        if (!numericMedicationId || isNaN(numericMedicationId) || numericMedicationId === 0) {
          skippedMedications.push(rx.medication);
          continue; // Skip this medication
        }
        
        // Find medication details for unit
        const medication = medications.find((m: any) => {
          const mId = typeof m.id === 'string' ? parseInt(m.id, 10) : m.id;
          return mId === numericMedicationId;
        });
        const unit = medication?.unit || 'tablet'; // Default to 'tablet' if not found
        
        // Add to items array
        prescriptionItems.push({
          medication: numericMedicationId,
          quantity: rx.quantity,
          unit: unit,
          dosage: rx.dosage,
          frequency: rx.frequency,
          duration: rx.duration,
          instructions: rx.instructions,
        });
      }
      
      // Show warning if some medications were skipped
      if (skippedMedications.length > 0) {
        toast.warning(`Skipped ${skippedMedications.length} invalid medication(s): ${skippedMedications.join(', ')}`);
      }
      
      // Create ONE prescription with ALL items
      if (prescriptionItems.length === 0) {
        toast.error('No valid medications to send. Please check your prescription items.');
        return;
      }
      
      try {
        await pharmacyService.createPrescription({
          patient: numericPatientId,
          visit: numericVisitId || undefined,
          doctor: sessionId ? undefined : undefined, // Will be set from request user in backend
          diagnosis: diagnoses.length > 0 ? diagnoses.filter(d => d.type === 'Primary').map(d => `${d.code}: ${d.name}`).join('; ') : undefined,
          notes: medicalNotes.assessment || undefined,
          items: prescriptionItems, // Send ALL items in ONE prescription
        } as any);
        
        toast.success(`Prescription with ${prescriptionItems.length} medication(s) sent to Pharmacy queue`, {
          description: `Patient: ${currentPatient?.name}`,
          action: {
            label: "View in Pharmacy",
            onClick: () => window.open('/pharmacy/prescriptions', '_blank')
          }
        });
      } catch (err: any) {
        console.error('Error creating prescription:', err);
        toast.error(`Failed to send prescription to pharmacy: ${err.message || 'Unknown error'}`);
        return; // Don't update status if creation failed
      }
      
      setPrescriptions(prev => prev.map(rx => rx.status === 'Draft' ? { ...rx, status: 'Sent to Pharmacy' } : rx));
      setPrescriptionsSentToPharmacy(true);
    } catch (err: any) {
      console.error('Error sending prescriptions:', err);
      toast.error(err.message || 'Failed to send prescriptions to pharmacy');
    }
  };

  const toggleMedicationSelection = (med: any) => {
    // CRITICAL: Ensure medication ID is a valid number
    let medicationId: number | undefined;
    if (typeof med.id === 'number') {
      medicationId = med.id;
    } else if (typeof med.id === 'string') {
      const parsed = parseInt(med.id, 10);
      if (!isNaN(parsed) && parsed > 0) {
        medicationId = parsed;
      } else {
        toast.error("Please select a medication from the database. Demo medications cannot be used.");
        return;
      }
    } else {
      toast.error("Invalid medication ID. Please select a valid medication.");
      return;
    }
    
    // Check for allergies when selecting
    const isAllergyRisk = currentPatient?.allergies.some(allergy => 
      med.name.toLowerCase().includes(allergy.toLowerCase()) || 
      (med.generic_name || med.genericName || '').toLowerCase().includes(allergy.toLowerCase())
    );
    
    if (isAllergyRisk && medicationId !== undefined && !selectedMedications.has(medicationId)) {
      const confirmed = window.confirm(`⚠️ Allergy Alert: Patient is allergic to ${currentPatient?.allergies.join(', ')}. This medication may be contraindicated. Do you want to proceed?`);
      if (!confirmed) {
        return;
      }
    }
    
    // Toggle selection
    setSelectedMedications(prev => {
      const newSet = new Set(prev);
      if (newSet.has(medicationId!)) {
        // Remove medication and its config
        newSet.delete(medicationId!);
        setMedicationConfigs(prevConfigs => {
          const newConfigs = new Map(prevConfigs);
          newConfigs.delete(medicationId!);
          return newConfigs;
        });
      } else {
        // Add medication with sensible defaults based on form
        newSet.add(medicationId!);
        setMedicationConfigs(prevConfigs => {
          const newConfigs = new Map(prevConfigs);
          const form = med.form || med.dosageForm || 'tablet';
          // Set sensible defaults based on medication form
          const defaultDosage = form.toLowerCase().includes('tablet') || form.toLowerCase().includes('capsule') 
            ? `1 ${form.toLowerCase()}`
            : form.toLowerCase().includes('syrup') || form.toLowerCase().includes('suspension')
            ? '5ml'
            : form.toLowerCase().includes('injection') || form.toLowerCase().includes('vial')
            ? '1 vial'
            : `1 ${form.toLowerCase()}`;
          
          const defaultRoute = form.toLowerCase().includes('injection') || form.toLowerCase().includes('vial')
            ? 'IV'
            : 'Oral';
          
          newConfigs.set(medicationId!, {
            dosage: defaultDosage,
            frequency: 'Once daily (OD)',
            duration: '',
            durationDays: 0,
            quantity: 0,
            route: defaultRoute,
            instructions: '',
            priority: 'Routine',
          });
          return newConfigs;
        });
      }
      return newSet;
    });
  };

  const selectMedication = (med: any) => {
    // For single select (backward compatibility) - toggle selection instead
    toggleMedicationSelection(med);
  };

  const updateMedicationConfig = (medicationId: number, field: string, value: any) => {
    setMedicationConfigs(prev => {
      const newConfigs = new Map(prev);
      const currentConfig = newConfigs.get(medicationId) || {
        dosage: '',
        frequency: 'Once daily (OD)',
        duration: '',
        durationDays: 0,
        quantity: 0,
        route: 'Oral',
        instructions: '',
        priority: 'Routine',
      };
      
      const updatedConfig = { ...currentConfig, [field]: value };
      
      // Auto-calculate quantity when frequency or durationDays changes
      if (field === 'frequency' || field === 'durationDays') {
        const dailyDoses = frequencyToDailyDoses[updatedConfig.frequency] || 1;
        updatedConfig.quantity = updatedConfig.frequency === 'STAT (Single dose)' 
          ? 1 
          : Math.ceil(dailyDoses * updatedConfig.durationDays);
      }
      
      // Auto-update duration string when durationDays changes
      if (field === 'durationDays') {
        updatedConfig.duration = value > 0 ? `${value} days` : '';
      }
      
      newConfigs.set(medicationId, updatedConfig);
      return newConfigs;
    });
  };

  const addSelectedMedicationsToPrescription = () => {
    if (selectedMedications.size === 0) {
      toast.error("Please select at least one medication");
      return;
    }
    
    // Validate all selected medications have required fields
    const invalidMeds: string[] = [];
    Array.from(selectedMedications).forEach(medId => {
      const config = medicationConfigs.get(medId);
      const med = medications.find((m: any) => {
        const mId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
        return mId === medId;
      });
      
      if (!config || !config.dosage || !config.frequency || (!config.durationDays && config.frequency !== 'STAT (Single dose)')) {
        if (med) invalidMeds.push(med.name);
      }
    });
    
    if (invalidMeds.length > 0) {
      toast.error(`Please fill in all required fields (dosage, frequency, duration) for: ${invalidMeds.join(', ')}`);
      return;
    }
    
    const selectedMeds = medications.filter((m: any) => {
      const mId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
      return selectedMedications.has(mId);
    });
    
    // Add all selected medications to prescriptions list with their individual configs
    const newPrescriptions: {
      id: string;
      medication: string;
      medicationId?: number;
      genericName: string;
      dosage: string;
      frequency: string;
      duration: string;
      quantity: number;
      route: string;
      instructions: string;
      priority: string;
      status: 'Draft' | 'Sent to Pharmacy' | 'Processing' | 'Dispensed';
    }[] = selectedMeds.map((med: any) => {
      const medicationId = typeof med.id === 'number' ? med.id : parseInt(med.id, 10);
      const config = medicationConfigs.get(medicationId)!;
      const rxId = `RX-${Date.now()}-${medicationId}`;
      
      return {
        id: rxId,
        medication: med.name,
        medicationId: medicationId,
        genericName: med.generic_name || med.genericName || '',
        dosage: config.dosage,
        frequency: config.frequency,
        duration: config.duration,
        quantity: config.quantity,
        route: config.route,
        instructions: config.instructions,
        priority: config.priority,
        status: 'Draft' as const
      };
    });
    
    setPrescriptions([...prescriptions, ...newPrescriptions]);
    
    // Reset form and selections
    setSelectedMedications(new Set());
    setMedicationConfigs(new Map());
    setNewPrescription({ medication: "", medicationId: undefined, genericName: "", dosage: "", frequency: "", duration: "", durationDays: 0, quantity: 0, route: "Oral", instructions: "", priority: "Routine" });
    setMedicationSearch("");
    setShowAddPrescription(false);
    
    toast.success(`${selectedMeds.length} medication(s) added to prescription order`);
  };

  const calculateQuantity = (frequency: string, durationDays: number) => {
    if (frequency === 'STAT (Single dose)') return 1;
    const dailyDoses = frequencyToDailyDoses[frequency] || 1;
    return Math.ceil(dailyDoses * durationDays);
  };

  // CRITICAL: Only use real medications from API - do NOT use demo medications
  // Demo medications have string IDs which cannot be used for prescriptions
  const availableMedications = medications.length > 0 ? medications : [];
  const filteredMedications = medicationSearch 
    ? availableMedications.filter((med: any) => {
        const searchTerm = medicationSearch.toLowerCase().trim();
        if (!searchTerm) return true; // Show all if search is empty
        
        const name = (med.name || '').toLowerCase();
        const genericName = ((med.generic_name || med.genericName || '')).toLowerCase();
        const category = ((med.category || '')).toLowerCase();
        const form = ((med.form || med.dosageForm || '')).toLowerCase();
        const code = ((med.code || '')).toLowerCase();
        
        return name.includes(searchTerm) ||
               genericName.includes(searchTerm) ||
               category.includes(searchTerm) ||
               form.includes(searchTerm) ||
               code.includes(searchTerm);
      })
    : availableMedications;
  // Toggle lab template selection
  const toggleLabTemplateSelection = (template: any) => {
    const templateId = template.id;
    setSelectedLabTemplates(prev => {
      const newSet = new Set(prev);
      if (newSet.has(templateId)) {
        newSet.delete(templateId);
      } else {
        newSet.add(templateId);
      }
      return newSet;
    });
  };

  // Add selected lab templates to draft order (like prescriptions)
  const addLabOrder = () => {
    if (selectedLabTemplates.size === 0) {
      toast.error('Please select at least one test');
      return;
    }
    
    // Get selected templates
    const selectedTemplates = labTemplates.filter(t => selectedLabTemplates.has(t.id));
    
    // Add to draft lab orders (not sent yet)
    const newOrders = selectedTemplates.map(template => ({
      id: `LAB-${Date.now()}-${template.id}`,
      test: template.name,
      testId: template.id,
      code: template.code,
      sampleType: template.sample_type || 'Blood',
      priority: newLabOrder.priority,
      notes: newLabOrder.notes,
      status: 'Draft' as const,
    }));
    
    setLabOrders([...labOrders, ...newOrders]);
    setSelectedLabTemplates(new Set());
    setLabTemplateSearch("");
    setNewLabOrder({ test: "", priority: "Routine", notes: "" });
    setShowAddLabOrder(false);
    toast.success(`${selectedTemplates.length} test(s) added to order`);
  };

  // Send all draft lab orders to lab (like sendPrescriptionsToPharmacy)
  const sendLabOrdersToLab = async () => {
    const draftOrders = labOrders.filter(order => order.status === 'Draft');
    
    if (draftOrders.length === 0) {
      toast.info("No draft lab orders to send");
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      // Group tests by priority (use the most urgent priority for the order)
      const priorityOrder: Record<string, number> = { 'STAT': 0, 'Urgent': 1, 'Routine': 2 };
      const orderPriority = draftOrders.reduce((highest, order) => {
        const currentPriority = priorityOrder[order.priority] ?? 2;
        const highestPriority = priorityOrder[highest] ?? 2;
        return currentPriority < highestPriority ? order.priority : highest;
      }, 'Routine');
      
      // Combine all notes (or use the first one)
      const combinedNotes = draftOrders.map(o => o.notes).filter(n => n).join('; ') || undefined;
      
      // Create lab order in backend with all selected tests
      const priorityMap: Record<string, 'routine' | 'urgent' | 'stat'> = {
        'Routine': 'routine',
        'Urgent': 'urgent',
        'STAT': 'stat',
      };
      
      const testsData = draftOrders.map(order => ({
        name: order.test,
        code: order.code || order.test.substring(0, 10).toUpperCase().replace(/\s/g, '_'),
        sample_type: order.sampleType || 'Blood',
        template: order.testId, // Link to template
        status: 'pending',
        notes: order.notes || '',
      }));
      
      await labService.createOrder({
        patient: numericPatientId as any,
        visit: numericVisitId || undefined,
        priority: priorityMap[orderPriority] || 'routine',
        clinical_notes: combinedNotes,
        tests_data: testsData as any,
      } as any);
      
      // Update status of sent orders
      setLabOrders(prev => prev.map(order => 
        draftOrders.some(draft => draft.id === order.id)
          ? { ...order, status: 'Sent to Lab' as const }
          : order
      ));
      
      toast.success(`${draftOrders.length} test(s) sent to laboratory`);
    } catch (err: any) {
      console.error('Error creating lab order:', err);
      toast.error(err.message || 'Failed to send lab order');
    }
  };

  // Filter lab templates based on search
  const filteredLabTemplates = labTemplates.filter(template => {
    if (!labTemplateSearch.trim()) return true;
    const search = labTemplateSearch.toLowerCase();
    return (
      template.name?.toLowerCase().includes(search) ||
      template.code?.toLowerCase().includes(search) ||
      template.sample_type?.toLowerCase().includes(search) ||
      (template.description && template.description.toLowerCase().includes(search))
    );
  }).slice(0, 20); // Limit to 20 results for performance
  
  // Add nursing order to draft (like prescriptions, lab orders, and radiology orders)
  const addNursingOrder = () => {
    if (!newNursingOrder.type || !newNursingOrder.instructions) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    // Validate type-specific required fields
    if (newNursingOrder.type === 'Injection' && !newNursingOrder.medication) {
      toast.error('Please select a medication for injection');
      return;
    }
    if (newNursingOrder.type === 'Dressing' && !newNursingOrder.woundLocation) {
      toast.error('Please specify wound location for dressing');
      return;
    }
    
    const orderId = `NO-${Date.now()}`;
    
    // Add to draft nursing orders (not sent yet)
    setNursingOrders([...nursingOrders, {
      id: orderId,
      type: newNursingOrder.type as 'Injection' | 'Dressing',
      medication: newNursingOrder.medication || undefined,
      dosage: newNursingOrder.dosage || undefined,
      route: newNursingOrder.route || undefined,
      woundLocation: newNursingOrder.woundLocation || undefined,
      woundType: newNursingOrder.woundType || undefined,
      supplies: newNursingOrder.supplies || undefined,
      instructions: newNursingOrder.instructions,
      priority: newNursingOrder.priority as 'Routine' | 'Urgent' | 'STAT',
      status: 'Draft'
    }]);
    
    setNewNursingOrder({ type: "", medication: "", dosage: "", route: "Intramuscular (IM)", woundLocation: "", woundType: "", supplies: "", instructions: "", priority: "Routine" });
    setShowAddNursingOrder(false);
    toast.success("Nursing order added to draft");
  };

  // Send all draft nursing orders to nursing (like sendPrescriptionsToPharmacy, sendLabOrdersToLab, sendRadiologyOrders)
  const sendNursingOrdersToNursing = async () => {
    const draftOrders = nursingOrders.filter(order => order.status === 'Draft');
    
    if (draftOrders.length === 0) {
      toast.info("No draft nursing orders to send");
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      const priorityMap: Record<string, 'low' | 'medium' | 'high' | 'urgent'> = {
        'Routine': 'low',
        'Urgent': 'high',
        'STAT': 'urgent',
      };
      
      // Send each draft order to backend
      const sendPromises = draftOrders.map(async (order) => {
        // Build description from order details
        let description = order.instructions;
        if (order.type === 'Injection' && order.medication) {
          description = `${order.medication} - ${order.dosage || ''} via ${order.route || ''}. ${order.instructions}`;
        } else if (order.type === 'Dressing') {
          description = `${order.woundType || 'Wound'} dressing at ${order.woundLocation || 'site'}. Supplies: ${order.supplies || 'Standard'}. ${order.instructions}`;
        }
        
        return apiFetch('/nursing/orders/', {
          method: 'POST',
          body: JSON.stringify({
            patient: numericPatientId,
            visit: numericVisitId || undefined,
            order_type: order.type,
            description: description,
            frequency: order.type === 'Injection' ? 'As ordered' : '',
            duration: '',
            status: 'pending',
            priority: priorityMap[order.priority] || 'medium',
          }),
        });
      });
      
      await Promise.all(sendPromises);
      
      // Update status of sent orders
      setNursingOrders(prev => prev.map(order => 
        draftOrders.some(draft => draft.id === order.id)
          ? { ...order, status: 'Sent to Nursing' as const }
          : order
      ));
      
      toast.success(`${draftOrders.length} nursing order(s) sent to Nursing Procedures queue`);
    } catch (err: any) {
      console.error('Error creating nursing orders:', err);
      toast.error(err.message || 'Failed to send nursing orders');
    }
  };

  const getNursingOrderIcon = (type: string) => {
    switch (type) {
      case 'Injection': return <Syringe className="h-4 w-4 text-rose-600" />;
      case 'Dressing': return <Activity className="h-4 w-4 text-amber-600" />;
      default: return <Syringe className="h-4 w-4 text-cyan-600" />;
    }
  };

  // Referral functions
  const addReferral = async () => {
    if (!newReferral.specialty || !newReferral.facility || !newReferral.reason) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      const urgencyMap: Record<string, 'routine' | 'urgent' | 'emergency'> = {
        'Routine': 'routine',
        'Urgent': 'urgent',
        'Emergency': 'emergency',
      };
      
      const facilityTypeMap: Record<string, 'internal' | 'external' | 'specialist'> = {
        'Internal': 'internal',
        'External': 'external',
        'Specialist': 'specialist',
      };
      
      // Create referral in backend
      const createdReferral = await referralService.createReferral({
        patient: numericPatientId,
        visit: numericVisitId || undefined,
        session: sessionId,
        specialty: newReferral.specialty,
        facility: newReferral.facility,
        facility_type: facilityTypeMap[newReferral.facilityType] || 'internal',
        reason: newReferral.reason,
        clinical_summary: newReferral.clinicalSummary || undefined,
        urgency: urgencyMap[newReferral.urgency] || 'routine',
        contact_person: newReferral.contactPerson || undefined,
        contact_phone: newReferral.contactPhone || undefined,
        status: 'sent',
      });
      
      const referralId = `REF-${Date.now()}`;
      setReferrals([...referrals, {
        id: referralId,
        specialty: newReferral.specialty,
        facility: newReferral.facility,
        facilityType: newReferral.facilityType,
        reason: newReferral.reason,
        urgency: newReferral.urgency as 'Routine' | 'Urgent' | 'Emergency',
        clinicalSummary: newReferral.clinicalSummary,
        contactPerson: newReferral.contactPerson || undefined,
        contactPhone: newReferral.contactPhone || undefined,
        status: 'Sent'
      }]);
      setNewReferral({ specialty: "", facility: "", facilityType: "", reason: "", urgency: "Routine", clinicalSummary: "", contactPerson: "", contactPhone: "" });
      setShowAddReferral(false);
      toast.success("Referral sent successfully");
    } catch (err: any) {
      console.error('Error creating referral:', err);
      toast.error(err.message || 'Failed to create referral');
    }
  };

  const sendReferrals = () => {
    // Note: Referrals are now sent directly when added via addReferral
    // This function is kept for backward compatibility but referrals are sent immediately
    if (referrals.length === 0) {
      toast.error("No referrals to send");
      return;
    }
    const draftReferrals = referrals.filter(r => r.status === 'Draft');
    if (draftReferrals.length === 0) {
      toast.info("All referrals have already been sent");
      return;
    }
    // Referrals are now sent immediately when created, so this is just a status update
    setReferrals(prev => prev.map(r => r.status === 'Draft' ? { ...r, status: 'Sent' } : r));
    toast.success(`${draftReferrals.length} referral(s) already sent successfully`, {
      description: `Patient: ${currentPatient?.name}`
    });
  };

  // Radiology functions
  // Add radiology order to draft (like prescriptions and lab orders)
  const addRadiologyOrder = () => {
    if (!newRadiology.procedure || !newRadiology.clinicalIndication) {
      toast.error('Please fill in all required fields');
      return;
    }
    
    const selectedProcedure = radiologyProcedures.find(p => p.name === newRadiology.procedure);
    const orderId = `RAD-${Date.now()}`;
    
    // Add to draft radiology orders (not sent yet)
    setRadiologyOrders([...radiologyOrders, {
      id: orderId,
      procedure: newRadiology.procedure,
      category: selectedProcedure?.category || newRadiology.category,
      bodyPart: selectedProcedure?.bodyPart || newRadiology.bodyPart,
      clinicalIndication: newRadiology.clinicalIndication,
      priority: newRadiology.priority as 'Routine' | 'Urgent' | 'STAT',
      contrastRequired: newRadiology.contrastRequired,
      specialInstructions: newRadiology.specialInstructions || undefined,
      status: 'Draft'
    }]);
    
    setNewRadiology({ procedure: "", category: "", bodyPart: "", clinicalIndication: "", priority: "Routine", contrastRequired: false, specialInstructions: "" });
    setShowAddRadiology(false);
    toast.success("Radiology order added to draft");
  };

  // Send all draft radiology orders to radiology (like sendPrescriptionsToPharmacy and sendLabOrdersToLab)
  const sendRadiologyOrders = async () => {
    const draftOrders = radiologyOrders.filter(r => r.status === 'Draft');
    
    if (draftOrders.length === 0) {
      toast.info("No draft radiology orders to send");
      return;
    }
    
    if (!currentPatient || !sessionId) {
      toast.error('No active session. Please start a consultation session first.');
      return;
    }
    
    try {
      // currentPatient.id is the actual patient database ID
      const numericPatientId = parseInt(currentPatient.id);
      const numericVisitId = currentPatient.visitId ? parseInt(currentPatient.visitId) : null;
      
      if (isNaN(numericPatientId)) {
        toast.error('Invalid patient ID');
        return;
      }
      
      // Group studies by priority (use the most urgent priority for the order)
      const priorityOrder: Record<string, number> = { 'STAT': 0, 'Urgent': 1, 'Routine': 2 };
      const orderPriority = draftOrders.reduce((highest, order) => {
        const currentPriority = priorityOrder[order.priority] ?? 2;
        const highestPriority = priorityOrder[highest] ?? 2;
        return currentPriority < highestPriority ? order.priority : highest;
      }, 'Routine');
      
      // Combine all clinical indications (or use the first one)
      const combinedClinicalNotes = draftOrders.map(o => o.clinicalIndication).filter(n => n).join('; ') || undefined;
      const combinedSpecialInstructions = draftOrders.map(o => o.specialInstructions).filter(n => n).join('; ') || undefined;
      
      const priorityMap: Record<string, 'routine' | 'urgent' | 'stat'> = {
        'Routine': 'routine',
        'Urgent': 'urgent',
        'STAT': 'stat',
      };
      
      // Create all studies for the order
      const studiesData = draftOrders.map(order => {
        const selectedProcedure = radiologyProcedures.find(p => p.name === order.procedure);
        return {
          procedure: order.procedure,
          body_part: selectedProcedure?.bodyPart || order.bodyPart || '',
          modality: selectedProcedure?.category || order.category || 'X-Ray',
          status: 'pending',
          technical_notes: order.specialInstructions || undefined,
        };
      });
      
      // Create radiology order in backend with all selected studies
      await radiologyService.createOrder({
        patient: numericPatientId,
        visit: numericVisitId || undefined,
        priority: priorityMap[orderPriority] || 'routine',
        clinical_notes: combinedClinicalNotes,
        studies: studiesData as any,
      });
      
      // Update status of sent orders
      setRadiologyOrders(prev => prev.map(order => 
        draftOrders.some(draft => draft.id === order.id)
          ? { ...order, status: 'Sent to Radiology' as const }
          : order
      ));
      
      toast.success(`${draftOrders.length} study/studies sent to Radiology department`);
    } catch (err: any) {
      console.error('Error creating radiology order:', err);
      toast.error(err.message || 'Failed to send radiology order');
    }
  };

  // Vitals trend helper
  const getVitalTrend = (currentValue: string, previousValue: string, type: 'temp' | 'bp' | 'hr' | 'rr' | 'spo2') => {
    const current = parseFloat(currentValue);
    const previous = parseFloat(previousValue);
    if (isNaN(current) || isNaN(previous)) return null;
    
    const diff = current - previous;
    if (Math.abs(diff) < 0.5) return { icon: <Minus className="h-3 w-3 text-gray-400" />, trend: 'stable' };
    if (diff > 0) return { icon: <TrendingUp className="h-3 w-3 text-red-500" />, trend: 'up' };
    return { icon: <TrendingDown className="h-3 w-3 text-blue-500" />, trend: 'down' };
  };

  if (loading) { 
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-500 mx-auto mb-4" />
            <p className="text-muted-foreground">Loading consultation room...</p>
          </div>
        </div>
      </DashboardLayout>
    ); 
  }
  
  if (error) {
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-2xl font-bold text-red-600 mb-2">Error Loading Room</h2>
            <p className="text-muted-foreground mb-4">{error}</p>
            <Button onClick={() => router.push("/consultation/start")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to Room Selection
            </Button>
          </div>
        </div>
      </DashboardLayout>
    );
  }
  
  if (!room) { 
    return (
      <DashboardLayout>
        <div className="flex items-center justify-center h-[80vh]">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-red-600 mb-4">Room Not Found</h2>
            <p className="text-muted-foreground mb-4">The consultation room could not be found.</p>
            <Button onClick={() => router.push("/consultation/start")}>
              <ArrowLeft className="mr-2 h-4 w-4" />Back to Room Selection
            </Button>
          </div>
        </div>
      </DashboardLayout>
    ); 
  }

  if (!sessionActive || !currentPatient) {
    const emergencyPatients = patients.filter((p) => p.priority === "Emergency");
    const highPriorityPatients = patients.filter((p) => p.priority === "High");
    const avgWaitTime = patients.length > 0 ? Math.round(patients.reduce((sum, p) => sum + p.waitTime, 0) / patients.length) : 0;

    return (
      <DashboardLayout>
        <div className="container mx-auto p-6 space-y-6">
          {/* Header Section */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h1 className="text-3xl font-bold text-foreground flex items-center gap-3">
                <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-lg flex items-center justify-center text-white text-xl font-bold shadow-lg">
                  {room.name.charAt(0)}
                </div>
                {room.name}
              </h1>
              <p className="text-muted-foreground mt-1">
                Consultation Room • {room.specialtyFocus || "General Practice"} • {room.doctor || "No doctor assigned"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleRefresh} disabled={isRefreshing}>
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
                {isRefreshing ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Button variant="outline" onClick={() => router.push("/consultation/start")}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Exit Room
              </Button>
            </div>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Card className="border-l-4 border-l-blue-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Patients in Queue</p><p className="text-2xl font-bold text-blue-600 dark:text-blue-400">{patients.length}</p></div><Users className="h-8 w-8 text-blue-500" /></div></CardContent></Card>
            <Card className="border-l-4 border-l-red-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Emergency</p><p className="text-2xl font-bold text-red-600 dark:text-red-400">{emergencyPatients.length}</p></div><AlertTriangle className="h-8 w-8 text-red-500" /></div></CardContent></Card>
            <Card className="border-l-4 border-l-orange-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">High Priority</p><p className="text-2xl font-bold text-orange-600 dark:text-orange-400">{highPriorityPatients.length}</p></div><Clock className="h-8 w-8 text-orange-500" /></div></CardContent></Card>
            <Card className="border-l-4 border-l-purple-500"><CardContent className="p-4"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Avg Wait Time</p><p className="text-2xl font-bold text-purple-600 dark:text-purple-400">{avgWaitTime} min</p></div><Activity className="h-8 w-8 text-purple-500" /></div></CardContent></Card>
          </div>

          {patients.length > 0 && (
            <Card className="bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border-emerald-200 dark:border-emerald-800">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-600 rounded-full flex items-center justify-center"><Stethoscope className="h-5 w-5 text-white" /></div>
                    <div><div className="font-medium text-gray-900 dark:text-white">Ready to consult?</div><div className="text-sm text-gray-600 dark:text-gray-400">{patients.length} patient{patients.length !== 1 ? "s" : ""} waiting for consultation</div></div>
                  </div>
                  <Button size="lg" onClick={() => handleStartSession(patients[0])} className="bg-emerald-600 hover:bg-emerald-700 shadow-lg">Start with Next Patient</Button>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><div className="flex items-center justify-between"><CardTitle>Patient Queue</CardTitle><Badge variant="secondary">{patients.length} waiting</Badge></div></CardHeader>
            <CardContent>
              {patients.length > 0 ? (
                <div className="space-y-3">
                  {patients.map((patient, index) => (
                    <Card key={patient.id} className={`hover:shadow-lg transition-all cursor-pointer ${patient.priority === "Emergency" ? "border-l-4 border-l-red-500 bg-red-50 dark:bg-red-900/10" : patient.priority === "High" ? "border-l-4 border-l-orange-500" : ""}`}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-3 flex-1">
                            <div className="w-10 h-10 bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 rounded-full flex items-center justify-center text-gray-700 dark:text-gray-200 font-bold">{index + 1}</div>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="font-semibold text-lg">{patient.name}</div>
                                <Badge className={getPriorityColor(patient.priority)}>{patient.priority}</Badge>
                                {patient.vitalsCompleted && <Badge className="bg-green-100 text-green-800 border-green-300 dark:bg-green-900/30 dark:text-green-400" variant="outline">✓ Vitals Done</Badge>}
                              </div>
                              <div className="flex items-center gap-4 text-xs text-muted-foreground">
                                <span className="flex items-center gap-1"><User className="h-3 w-3" />{patient.age}y, {patient.gender}</span>
                                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />Waiting {patient.waitTime} min</span>
                                <span className="flex items-center gap-1"><FileText className="h-3 w-3" />{patient.mrn}</span>
                              </div>
                              {patient.allergies.length > 0 && <div className="mt-2 flex items-center gap-1 text-xs"><AlertTriangle className="h-3 w-3 text-red-500" /><span className="text-red-600 dark:text-red-400 font-medium">Allergies: {patient.allergies.join(", ")}</span></div>}
                            </div>
                          </div>
                          <Button onClick={() => handleStartSession(patient)} className="bg-emerald-600 hover:bg-emerald-700 shadow-md"><Stethoscope className="mr-2 h-4 w-4" />Start Session</Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-16 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                  <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto mb-4"><Users className="h-10 w-10 text-muted-foreground" /></div>
                  <div className="text-xl font-medium mb-2">No Patients Waiting</div>
                  <div className="text-sm text-muted-foreground mb-4">Your queue is empty. Patients will appear here when sent from nursing.</div>
                  <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground"><CheckCircle className="h-4 w-4" /><span>Room ready for new patients</span></div>
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><Activity className="h-5 w-5 text-blue-600" />Today's Activity</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Consultations Completed</span><span className="text-2xl font-bold text-blue-600 dark:text-blue-400">{room.totalConsultationsToday}</span></div><div className="flex items-center justify-between p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Average Consultation Time</span><span className="text-2xl font-bold text-purple-600 dark:text-purple-400">{room.averageConsultationTime} min</span></div></CardContent></Card>
            <Card><CardHeader><CardTitle className="text-lg flex items-center gap-2"><MapPin className="h-5 w-5 text-emerald-600" />Room Info</CardTitle></CardHeader><CardContent className="space-y-3"><div className="flex items-center justify-between p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Doctor</span><span className="text-sm font-bold text-emerald-600 dark:text-emerald-400">{room.doctor}</span></div><div className="flex items-center justify-between p-3 bg-teal-50 dark:bg-teal-900/20 rounded-lg"><span className="text-sm text-muted-foreground">Specialty</span><span className="text-sm font-bold text-teal-600 dark:text-teal-400">{room.specialtyFocus || "General"}</span></div></CardContent></Card>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  // Active Session View
  return (
    <DashboardLayout>
      <div className="container mx-auto p-6 space-y-6">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground">Consultation Session</h1>
            <p className="text-muted-foreground mt-1">Room: {room.name} • {room.doctor}</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              <span>Session Duration: {sessionDuration} min</span>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowRoomQueueDialog(true)}>
              <Users className="mr-2 h-4 w-4" />
              Room Queue ({patients.length})
            </Button>
            <Button variant="destructive" onClick={() => setShowEndDialog(true)}>
              End Session
            </Button>
          </div>
        </div>

        {/* Patient Info Card */}
        <Card>
          <CardHeader className="pb-4">
            <div className="flex items-start gap-6">
              <PatientAvatar 
                name={currentPatient.name} 
                photoUrl={currentPatient.photo || null}
                size="lg"
              />
              <div className="flex-1">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <CardTitle className="text-2xl mb-1">{currentPatient.name}</CardTitle>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span><strong>Patient ID:</strong> {currentPatient.patientId}</span>
                      <span><strong>Age:</strong> {currentPatient.age} years</span>
                      <span><strong>Gender:</strong> {currentPatient.gender}</span>
                    </div>
                  </div>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400">
                    Session Active
                  </Badge>
                </div>
                <div className="space-y-3">
                  {/* Medical Information */}
                  {(currentPatient.bloodGroup || currentPatient.genotype) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {currentPatient.bloodGroup && (
                        <div>
                          <span className="text-muted-foreground">Blood Group:</span>
                          <span className="ml-2 font-semibold text-red-600">{currentPatient.bloodGroup}</span>
                        </div>
                      )}
                      {currentPatient.genotype && (
                        <div>
                          <span className="text-muted-foreground">Genotype:</span>
                          <span className="ml-2 font-semibold text-green-600">{currentPatient.genotype}</span>
                        </div>
                      )}
                      {currentPatient.religion && (
                        <div>
                          <span className="text-muted-foreground">Religion:</span>
                          <span className="ml-2 font-semibold">{currentPatient.religion}</span>
                        </div>
                      )}
                      {currentPatient.tribe && (
                        <div>
                          <span className="text-muted-foreground">Tribe:</span>
                          <span className="ml-2 font-semibold">{currentPatient.tribe}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Employment/Organization Information */}
                  {(currentPatient.division || currentPatient.location || currentPatient.employeeType || currentPatient.occupation) && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      {currentPatient.division && (
                        <div>
                          <span className="text-muted-foreground">Division:</span>
                          <span className="ml-2 font-semibold">{currentPatient.division}</span>
                        </div>
                      )}
                      {currentPatient.location && (
                        <div>
                          <span className="text-muted-foreground">Location:</span>
                          <span className="ml-2 font-semibold">{currentPatient.location}</span>
                        </div>
                      )}
                      {currentPatient.employeeType && (
                        <div>
                          <span className="text-muted-foreground">Employee Type:</span>
                          <span className="ml-2 font-semibold">{currentPatient.employeeType}</span>
                        </div>
                      )}
                      {currentPatient.occupation && (
                        <div>
                          <span className="text-muted-foreground">Occupation:</span>
                          <span className="ml-2 font-semibold">{currentPatient.occupation}</span>
                        </div>
                      )}
                    </div>
                  )}
                  
                  {/* Contact Information */}
                  {(currentPatient.phone || currentPatient.email) && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                      {currentPatient.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Phone:</span>
                          <span className="font-semibold">{currentPatient.phone}</span>
                        </div>
                      )}
                      {currentPatient.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-4 w-4 text-muted-foreground" />
                          <span className="text-muted-foreground">Email:</span>
                          <span className="font-semibold">{currentPatient.email}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                {currentPatient.allergies.length > 0 && (
                  <div className="mt-3 p-2 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                    <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Allergies: {currentPatient.allergies.join(", ")}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </CardHeader>
        </Card>

        {/* Vitals Card */}
        {currentPatient.vitals && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="h-5 w-5 text-blue-600" />
                Current Vitals
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                <div className="text-center p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Temperature</div>
                  <div className="text-lg font-bold text-blue-600">{currentPatient.vitals.temperature}°C</div>
                </div>
                <div className="text-center p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Blood Pressure</div>
                  <div className="text-lg font-bold text-red-600">{currentPatient.vitals.bloodPressure}</div>
                </div>
                <div className="text-center p-3 bg-pink-50 dark:bg-pink-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Heart Rate</div>
                  <div className="text-lg font-bold text-pink-600">{currentPatient.vitals.heartRate} bpm</div>
                </div>
                <div className="text-center p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Resp. Rate</div>
                  <div className="text-lg font-bold text-cyan-600">{currentPatient.vitals.respiratoryRate}/min</div>
                </div>
                <div className="text-center p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">SpO2</div>
                  <div className="text-lg font-bold text-emerald-600">{currentPatient.vitals.oxygenSaturation}%</div>
                </div>
                <div className="text-center p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Weight</div>
                  <div className="text-lg font-bold text-purple-600">{currentPatient.vitals.weight} kg</div>
                </div>
                <div className="text-center p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg">
                  <div className="text-xs text-muted-foreground">Height</div>
                  <div className="text-lg font-bold text-orange-600">{currentPatient.vitals.height} cm</div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-7">
            <TabsTrigger value="notes" className="flex items-center gap-1">
              <FileText className="h-4 w-4" />
              <span className="hidden lg:inline">Notes</span>
            </TabsTrigger>
            <TabsTrigger value="prescriptions" className="flex items-center gap-1">
              <Pill className="h-4 w-4" />
              <span className="hidden lg:inline">Prescriptions</span>
            </TabsTrigger>
            <TabsTrigger value="lab" className="flex items-center gap-1">
              <TestTube className="h-4 w-4" />
              <span className="hidden lg:inline">Lab</span>
            </TabsTrigger>
            <TabsTrigger value="radiology" className="flex items-center gap-1">
              <ScanLine className="h-4 w-4" />
              <span className="hidden lg:inline">Radiology</span>
            </TabsTrigger>
            <TabsTrigger value="nursing" className="flex items-center gap-1">
              <Syringe className="h-4 w-4" />
              <span className="hidden lg:inline">Nursing</span>
            </TabsTrigger>
            <TabsTrigger value="referral" className="flex items-center gap-1">
              <Send className="h-4 w-4" />
              <span className="hidden lg:inline">Referral</span>
            </TabsTrigger>
            <TabsTrigger value="history" className="flex items-center gap-1">
              <History className="h-4 w-4" />
              <span className="hidden lg:inline">History</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="notes">
            <Card>
              <CardHeader><CardTitle>Medical Notes</CardTitle><CardDescription>Document the consultation findings and plan</CardDescription></CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2"><Label>History of Present Illness</Label><Textarea value={medicalNotes.historyOfPresentIllness} onChange={(e) => setMedicalNotes({ ...medicalNotes, historyOfPresentIllness: e.target.value })} placeholder="Detailed history..." rows={4} /></div>
                <div className="space-y-2"><Label>Physical Examination</Label><Textarea value={medicalNotes.physicalExamination} onChange={(e) => setMedicalNotes({ ...medicalNotes, physicalExamination: e.target.value })} placeholder="Examination findings..." rows={4} /></div>
                
                {/* ICD-10 Diagnosis Section */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">Diagnosis (ICD-10)</Label>
                    <Button variant="outline" size="sm" onClick={() => setShowAddDiagnosis(true)}>
                      <Plus className="h-4 w-4 mr-1" />Add Diagnosis
                    </Button>
                  </div>
                  
                  {diagnoses.length === 0 ? (
                    <div className="p-4 rounded-lg border border-dashed text-center text-muted-foreground">
                      <Stethoscope className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p className="text-sm">No diagnoses added yet</p>
                      <p className="text-xs">Click "Add Diagnosis" to search and add ICD-10 codes</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {diagnoses.map((dx, index) => (
                        <div key={dx.id} className={`p-3 rounded-lg border flex items-start justify-between gap-3 ${
                          dx.type === 'Primary' ? 'bg-rose-50 dark:bg-rose-900/20 border-rose-200 dark:border-rose-800' :
                          dx.type === 'Secondary' ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' :
                          'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'
                        }`}>
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className={`text-xs ${
                                dx.type === 'Primary' ? 'bg-rose-500/10 text-rose-600 border-rose-500/30' :
                                dx.type === 'Secondary' ? 'bg-amber-500/10 text-amber-600 border-amber-500/30' :
                                'bg-blue-500/10 text-blue-600 border-blue-500/30'
                              }`}>{dx.type}</Badge>
                              <span className="font-mono text-sm font-medium">{dx.code}</span>
                            </div>
                            <p className="text-sm font-medium">{dx.name}</p>
                            {dx.notes && <p className="text-xs text-muted-foreground mt-1">{dx.notes}</p>}
                          </div>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setDiagnoses(diagnoses.filter(d => d.id !== dx.id))}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2"><Label>Assessment</Label><Textarea value={medicalNotes.assessment} onChange={(e) => setMedicalNotes({ ...medicalNotes, assessment: e.target.value })} placeholder="Clinical assessment and reasoning..." rows={3} /></div>
                <div className="space-y-2"><Label>Plan</Label><Textarea value={medicalNotes.plan} onChange={(e) => setMedicalNotes({ ...medicalNotes, plan: e.target.value })} placeholder="Treatment plan, follow-up instructions..." rows={4} /></div>
                <Button 
                  className="w-full" 
                  onClick={async () => {
                    if (!sessionId) {
                      toast.error('No active session. Please start a consultation session first.');
                      return;
                    }
                    
                    try {
                      // Update the consultation session with medical notes
                      const sessionData = {
                        history_of_presenting_illness: medicalNotes.historyOfPresentIllness || '',
                        physical_examination: medicalNotes.physicalExamination || '',
                        assessment: medicalNotes.assessment || '',
                        plan: medicalNotes.plan || '',
                        notes: diagnoses.length > 0 ? diagnoses.filter(d => d.type === 'Primary').map(d => `${d.code}: ${d.name}`).join('; ') : '',
                      };
                      
                      await consultationService.updateSession(sessionId, sessionData);
                      toast.success('Medical notes saved successfully');
                    } catch (err: any) {
                      console.error('Error saving medical notes:', err);
                      toast.error(err.message || 'Failed to save medical notes');
                    }
                  }}
                >
                  <Save className="mr-2 h-4 w-4" />Save Medical Notes
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="prescriptions">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-violet-500" />
                      Prescriptions
                    </CardTitle>
                    <CardDescription>Prescribe medications - will be sent to Pharmacy queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddPrescription(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Medication
                    </Button>
                    {prescriptions.length > 0 && prescriptions.some(rx => rx.status === 'Draft') && (
                      <Button onClick={sendPrescriptionsToPharmacy} className="bg-violet-600 hover:bg-violet-700">
                        <Pill className="mr-2 h-4 w-4" />
                        Send to Pharmacy ({prescriptions.filter(rx => rx.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Allergy Warning */}
                {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Patient Allergies: {currentPatient.allergies.join(', ')}</span>
                    </div>
                  </div>
                )}

                {prescriptions.length > 0 ? (
                  <div className="space-y-3">
                    {prescriptions.map((rx, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Pharmacy': return 'bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400';
                          case 'Processing': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Dispensed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getPriorityBadge = (priority: string) => {
                        switch (priority) {
                          case 'Emergency': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                          case 'Urgent': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                        }
                      };
                      
                      return (
                        <Card key={rx.id} className={`border-l-4 ${rx.status === 'Draft' ? 'border-l-gray-400' : rx.status === 'Sent to Pharmacy' ? 'border-l-violet-500' : 'border-l-emerald-500'}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1">
                                <div className={`p-2 rounded-full ${rx.status === 'Draft' ? 'bg-gray-100 dark:bg-gray-800' : 'bg-violet-100 dark:bg-violet-900/30'}`}>
                                  <Pill className={`h-4 w-4 ${rx.status === 'Draft' ? 'text-gray-600' : 'text-violet-600'}`} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-semibold">{rx.medication}</span>
                                    <Badge variant="outline" className={getStatusBadge(rx.status)}>{rx.status}</Badge>
                                    <Badge variant="outline" className={getPriorityBadge(rx.priority)}>{rx.priority}</Badge>
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <span className="font-medium">{rx.dosage}</span> • {rx.route} • {rx.frequency} • {rx.duration}
                                  </div>
                                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                    <span><strong>Qty:</strong> {rx.quantity}</span>
                                    {rx.genericName && <span><strong>Generic:</strong> {rx.genericName}</span>}
                                  </div>
                                  {rx.instructions && (
                                    <div className="text-sm text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
                                      <strong>Instructions:</strong> {rx.instructions}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {rx.status === 'Draft' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setPrescriptions(prescriptions.filter((_, i) => i !== index))}
                                  className="text-red-500 hover:text-red-600"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {rx.status === 'Sent to Pharmacy' && (
                                <Badge className="bg-violet-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-violet-50 to-violet-100/50 dark:from-violet-900/10 dark:to-violet-900/5 rounded-lg border-2 border-dashed border-violet-200 dark:border-violet-800">
                    <Pill className="h-12 w-12 mx-auto mb-3 text-violet-500 opacity-60" />
                    <p className="font-medium text-violet-900 dark:text-violet-100 mb-1">No prescriptions yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add medications to be sent to the Pharmacy</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddPrescription(true)} className="border-violet-300 text-violet-700 hover:bg-violet-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Medication
                    </Button>
                  </div>
                )}

                {/* Pharmacy Workflow Info */}
                <div className="p-4 rounded-lg bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800">
                  <h4 className="font-medium text-violet-900 dark:text-violet-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Prescription Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-violet-700 dark:text-violet-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-violet-100 dark:bg-violet-900/30">Sent to Pharmacy</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Processing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Dispensed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Click "Send to Pharmacy" to queue prescriptions for dispensing</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="lab">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Lab Orders</CardTitle>
                    <CardDescription>Request laboratory tests - Orders are sent to Lab Tech queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={() => setShowAddLabOrder(true)} className="bg-amber-500 hover:bg-amber-600">
                      <Plus className="mr-2 h-4 w-4" />Add Test
                    </Button>
                    {labOrders.length > 0 && labOrders.some(order => order.status === 'Draft') && (
                      <Button onClick={sendLabOrdersToLab} className="bg-amber-600 hover:bg-amber-700">
                        <TestTube className="mr-2 h-4 w-4" />
                        Send to Lab ({labOrders.filter(order => order.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {labOrders.length > 0 ? (
                  <div className="space-y-3">
                    {labOrders.map((order, index) => {
                      const getLabStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Lab': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Lab' ? 'border-l-amber-500' : 'border-l-blue-500'} ${order.priority === 'STAT' ? 'bg-rose-50 dark:bg-rose-900/10' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1">
                                <div className={`p-2 rounded-full ${order.priority === 'STAT' ? 'bg-rose-100 dark:bg-rose-900/30' : 'bg-amber-100 dark:bg-amber-900/30'}`}>
                                  <TestTube className={`h-4 w-4 ${order.priority === 'STAT' ? 'text-rose-600' : 'text-amber-600'}`} />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="font-semibold">{order.test}</span>
                                    <Badge variant={order.priority === "STAT" ? "destructive" : order.priority === "Urgent" ? "default" : "secondary"} className={order.priority === 'STAT' ? 'bg-rose-500' : order.priority === 'Urgent' ? 'bg-amber-500' : ''}>
                                      {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                    <Badge className={getLabStatusBadge(order.status)}>{order.status}</Badge>
                                  </div>
                                  {order.notes && <p className="text-sm text-muted-foreground mt-1">{order.notes}</p>}
                                  {order.status === 'Sent to Lab' && (
                                    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                                      <Clock className="h-3 w-3" />
                                      <span>Sent to Lab Tech queue • Est. TAT: {order.priority === 'STAT' ? '30 min - 1 hour' : order.priority === 'Urgent' ? '1 - 2 hours' : '2 - 4 hours'}</span>
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <Button variant="ghost" size="sm" onClick={() => setLabOrders(labOrders.filter((_, i) => i !== index))} className="text-rose-500 hover:text-rose-600">
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {order.status === 'Sent to Lab' && (
                                <Badge className="bg-amber-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-amber-50 to-amber-100/50 dark:from-amber-900/10 dark:to-amber-900/5 rounded-lg border-2 border-dashed border-amber-200 dark:border-amber-800">
                    <TestTube className="h-12 w-12 mx-auto mb-3 text-amber-500 opacity-60" />
                    <p className="font-medium text-amber-900 dark:text-amber-100 mb-1">No lab orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Order tests to be processed by the lab</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddLabOrder(true)} className="border-amber-300 text-amber-700 hover:bg-amber-100">
                      <Plus className="h-4 w-4 mr-1" />Order First Test
                    </Button>
                  </div>
                )}
                
                {/* Lab Workflow Info */}
                <div className="p-4 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <h4 className="font-medium text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Lab Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Ordered</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-violet-100 dark:bg-violet-900/30">Collected</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Processing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">Results Ready</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Verified ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Results will appear here and in patient record once verified by Sr. Admin</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="nursing">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Syringe className="h-5 w-5 text-cyan-500" />
                      Nursing Orders
                    </CardTitle>
                    <CardDescription>Request nursing procedures - will be sent to Nursing queue</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddNursingOrder(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Procedure
                    </Button>
                    {nursingOrders.length > 0 && nursingOrders.some(order => order.status === 'Draft') && (
                      <Button onClick={sendNursingOrdersToNursing} className="bg-cyan-600 hover:bg-cyan-700">
                        <Syringe className="mr-2 h-4 w-4" />
                        Send to Nursing ({nursingOrders.filter(order => order.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Allergy Warning for Injections */}
                {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
                  <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                    <div className="flex items-center gap-2 text-red-700 dark:text-red-400">
                      <AlertTriangle className="h-4 w-4" />
                      <span className="font-medium">Patient Allergies: {currentPatient.allergies.join(', ')}</span>
                    </div>
                  </div>
                )}

                {nursingOrders.length > 0 ? (
                  <div className="space-y-3">
                    {nursingOrders.map((order, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Nursing': return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
                          case 'In Progress': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getPriorityBadge = (priority: string) => {
                        switch (priority) {
                          case 'STAT': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400';
                          case 'Urgent': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                        }
                      };
                      const getTypeBadge = (type: string) => {
                        switch (type) {
                          case 'Injection': return 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400';
                          case 'Dressing': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          default: return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900/30 dark:text-cyan-400';
                        }
                      };
                      
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Nursing' ? 'border-l-cyan-500' : 'border-l-emerald-500'} ${order.priority === 'STAT' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1">
                                <div className={`p-2 rounded-full ${order.type === 'Injection' ? 'bg-rose-100 dark:bg-rose-900/30' : order.type === 'Dressing' ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-cyan-100 dark:bg-cyan-900/30'}`}>
                                  {getNursingOrderIcon(order.type)}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <Badge variant="outline" className={getTypeBadge(order.type)}>{order.type}</Badge>
                                    <Badge variant="outline" className={getStatusBadge(order.status)}>{order.status}</Badge>
                                    <Badge variant="outline" className={getPriorityBadge(order.priority)}>
                                      {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                      {order.priority}
                                    </Badge>
                                  </div>
                                  
                                  {/* Type-specific details */}
                                  {order.type === 'Injection' && order.medication && (
                                    <div className="text-sm font-medium mb-1">
                                      {order.medication} • {order.dosage} • {order.route}
                                    </div>
                                  )}
                                  {order.type === 'Dressing' && order.woundLocation && (
                                    <div className="text-sm font-medium mb-1">
                                      {order.woundType} - {order.woundLocation}
                                      {order.supplies && <span className="text-muted-foreground"> • Supplies: {order.supplies}</span>}
                                    </div>
                                  )}
                                  
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Instructions:</strong> {order.instructions}
                                  </div>
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <Button 
                                  variant="ghost" 
                                  size="sm" 
                                  onClick={() => setNursingOrders(nursingOrders.filter(o => o.id !== order.id))}
                                  className="text-red-500 hover:text-red-600"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {order.status === 'Sent to Nursing' && (
                                <Badge className="bg-cyan-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />
                                  Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-cyan-50 to-cyan-100/50 dark:from-cyan-900/10 dark:to-cyan-900/5 rounded-lg border-2 border-dashed border-cyan-200 dark:border-cyan-800">
                    <Syringe className="h-12 w-12 mx-auto mb-3 text-cyan-500 opacity-60" />
                    <p className="font-medium text-cyan-900 dark:text-cyan-100 mb-1">No nursing orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Add procedures to be sent to Nursing</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddNursingOrder(true)} className="border-cyan-300 text-cyan-700 hover:bg-cyan-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Procedure
                    </Button>
                  </div>
                )}

                {/* Nursing Workflow Info */}
                <div className="p-4 rounded-lg bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800">
                  <h4 className="font-medium text-cyan-900 dark:text-cyan-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Nursing Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-cyan-700 dark:text-cyan-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-cyan-100 dark:bg-cyan-900/30">Sent to Nursing</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">In Progress</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Click "Send to Nursing" to queue procedures for the nursing team</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="radiology">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <ScanLine className="h-5 w-5 text-indigo-500" />
                      Radiology Orders
                    </CardTitle>
                    <CardDescription>Order imaging studies - X-rays, CT, MRI, Ultrasound</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddRadiology(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Imaging
                    </Button>
                    {radiologyOrders.length > 0 && radiologyOrders.some(r => r.status === 'Draft') && (
                      <Button onClick={sendRadiologyOrders} className="bg-indigo-600 hover:bg-indigo-700">
                        <ScanLine className="mr-2 h-4 w-4" />
                        Send to Radiology ({radiologyOrders.filter(r => r.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {radiologyOrders.length > 0 ? (
                  <div className="space-y-3">
                    {radiologyOrders.map((order, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent to Radiology': return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
                          case 'Scheduled': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'In Progress': return 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      const getCategoryBadge = (category: string) => {
                        switch (category) {
                          case 'X-Ray': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Ultrasound': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
                          case 'CT Scan': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400';
                          case 'MRI': return 'bg-pink-100 text-pink-800 dark:bg-pink-900/30 dark:text-pink-400';
                          default: return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-400';
                        }
                      };
                      
                      return (
                        <Card key={order.id} className={`border-l-4 ${order.status === 'Draft' ? 'border-l-gray-400' : order.status === 'Sent to Radiology' ? 'border-l-indigo-500' : 'border-l-emerald-500'} ${order.priority === 'STAT' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1">
                                <div className="p-2 rounded-full bg-indigo-100 dark:bg-indigo-900/30">
                                  <ScanLine className="h-4 w-4 text-indigo-600" />
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-semibold">{order.procedure}</span>
                                    <Badge variant="outline" className={getCategoryBadge(order.category)}>{order.category}</Badge>
                                    <Badge variant="outline" className={getStatusBadge(order.status)}>{order.status}</Badge>
                                    {order.priority !== 'Routine' && (
                                      <Badge variant="outline" className={order.priority === 'STAT' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                                        {order.priority === 'STAT' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                        {order.priority}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Body Part:</strong> {order.bodyPart}
                                    {order.contrastRequired && <span className="ml-2 text-amber-600 font-medium">• Contrast Required</span>}
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    <strong>Indication:</strong> {order.clinicalIndication}
                                  </div>
                                  {order.specialInstructions && (
                                    <div className="text-sm text-muted-foreground mt-1 p-2 bg-muted/50 rounded">
                                      <strong>Special Instructions:</strong> {order.specialInstructions}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {order.status === 'Draft' && (
                                <Button variant="ghost" size="sm" onClick={() => setRadiologyOrders(radiologyOrders.filter(o => o.id !== order.id))} className="text-red-500 hover:text-red-600">
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {order.status === 'Sent to Radiology' && (
                                <Badge className="bg-indigo-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />Queued
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-indigo-50 to-indigo-100/50 dark:from-indigo-900/10 dark:to-indigo-900/5 rounded-lg border-2 border-dashed border-indigo-200 dark:border-indigo-800">
                    <ScanLine className="h-12 w-12 mx-auto mb-3 text-indigo-500 opacity-60" />
                    <p className="font-medium text-indigo-900 dark:text-indigo-100 mb-1">No radiology orders yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Order imaging studies for diagnosis</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddRadiology(true)} className="border-indigo-300 text-indigo-700 hover:bg-indigo-100">
                      <Plus className="h-4 w-4 mr-1" />Add First Order
                    </Button>
                  </div>
                )}

                {/* Radiology Workflow Info */}
                <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                  <h4 className="font-medium text-indigo-900 dark:text-indigo-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Radiology Order Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-indigo-700 dark:text-indigo-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-indigo-100 dark:bg-indigo-900/30">Sent to Radiology</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Scheduled</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-amber-100 dark:bg-amber-900/30">In Progress</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Results will be available in patient record once completed</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="referral">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <Send className="h-5 w-5 text-teal-500" />
                      Referrals
                    </CardTitle>
                    <CardDescription>Refer patient to specialists or other facilities</CardDescription>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setShowAddReferral(true)}>
                      <Plus className="mr-2 h-4 w-4" />Add Referral
                    </Button>
                    {referrals.length > 0 && referrals.some(r => r.status === 'Draft') && (
                      <Button onClick={sendReferrals} className="bg-teal-600 hover:bg-teal-700">
                        <Send className="mr-2 h-4 w-4" />
                        Send Referrals ({referrals.filter(r => r.status === 'Draft').length})
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {referrals.length > 0 ? (
                  <div className="space-y-3">
                    {referrals.map((referral, index) => {
                      const getStatusBadge = (status: string) => {
                        switch (status) {
                          case 'Draft': return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
                          case 'Sent': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-400';
                          case 'Accepted': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
                          case 'Scheduled': return 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
                          case 'Completed': return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400';
                          default: return 'bg-gray-100 text-gray-800';
                        }
                      };
                      
                      return (
                        <Card key={referral.id} className={`border-l-4 ${referral.status === 'Draft' ? 'border-l-gray-400' : referral.status === 'Sent' ? 'border-l-teal-500' : 'border-l-emerald-500'} ${referral.urgency === 'Emergency' ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                          <CardContent className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex items-start gap-3 flex-1">
                                <div className={`p-2 rounded-full ${referral.facilityType === 'External' ? 'bg-orange-100 dark:bg-orange-900/30' : 'bg-teal-100 dark:bg-teal-900/30'}`}>
                                  {referral.facilityType === 'External' ? <Building2 className="h-4 w-4 text-orange-600" /> : <UserPlus className="h-4 w-4 text-teal-600" />}
                                </div>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 flex-wrap mb-1">
                                    <span className="font-semibold">{referral.specialty}</span>
                                    <Badge variant="outline" className={getStatusBadge(referral.status)}>{referral.status}</Badge>
                                    <Badge variant="outline" className={referral.facilityType === 'External' ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800'}>
                                      {referral.facilityType}
                                    </Badge>
                                    {referral.urgency !== 'Routine' && (
                                      <Badge variant="outline" className={referral.urgency === 'Emergency' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-800'}>
                                        {referral.urgency === 'Emergency' && <AlertTriangle className="h-3 w-3 mr-1" />}
                                        {referral.urgency}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">
                                    <strong>Facility:</strong> {referral.facility}
                                  </div>
                                  <div className="text-sm text-muted-foreground mt-1">
                                    <strong>Reason:</strong> {referral.reason}
                                  </div>
                                  {referral.clinicalSummary && (
                                    <div className="text-sm text-muted-foreground mt-2 p-2 bg-muted/50 rounded">
                                      <strong>Clinical Summary:</strong> {referral.clinicalSummary}
                                    </div>
                                  )}
                                  {(referral.contactPerson || referral.contactPhone) && (
                                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                      {referral.contactPerson && <span className="flex items-center gap-1"><User className="h-3 w-3" />{referral.contactPerson}</span>}
                                      {referral.contactPhone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{referral.contactPhone}</span>}
                                    </div>
                                  )}
                                </div>
                              </div>
                              {referral.status === 'Draft' && (
                                <Button variant="ghost" size="sm" onClick={() => setReferrals(referrals.filter((_, i) => i !== index))} className="text-red-500 hover:text-red-600">
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                              {referral.status === 'Sent' && (
                                <Badge className="bg-teal-500 text-white">
                                  <CheckCircle className="h-3 w-3 mr-1" />Sent
                                </Badge>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-12 bg-gradient-to-b from-teal-50 to-teal-100/50 dark:from-teal-900/10 dark:to-teal-900/5 rounded-lg border-2 border-dashed border-teal-200 dark:border-teal-800">
                    <Send className="h-12 w-12 mx-auto mb-3 text-teal-500 opacity-60" />
                    <p className="font-medium text-teal-900 dark:text-teal-100 mb-1">No referrals yet</p>
                    <p className="text-sm text-muted-foreground mb-4">Refer patient to specialists or other facilities</p>
                    <Button variant="outline" size="sm" onClick={() => setShowAddReferral(true)} className="border-teal-300 text-teal-700 hover:bg-teal-100">
                      <Plus className="h-4 w-4 mr-1" />Add Referral
                    </Button>
                  </div>
                )}

                {/* Referral Workflow Info */}
                <div className="p-4 rounded-lg bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800">
                  <h4 className="font-medium text-teal-900 dark:text-teal-100 mb-2 flex items-center gap-2">
                    <Activity className="h-4 w-4" />Referral Workflow
                  </h4>
                  <div className="flex items-center gap-2 text-xs text-teal-700 dark:text-teal-300 flex-wrap">
                    <Badge variant="outline" className="bg-gray-100 dark:bg-gray-800">Draft</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-teal-100 dark:bg-teal-900/30">Sent</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-blue-100 dark:bg-blue-900/30">Accepted</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-purple-100 dark:bg-purple-900/30">Scheduled</Badge>
                    <span>→</span>
                    <Badge variant="outline" className="bg-emerald-100 dark:bg-emerald-900/30">Completed ✓</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">Referral letter will be generated and sent to the facility</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="history">
            <div className="space-y-4">
              {/* Top Row: Allergies + Chronic Conditions Side by Side */}
              <div className="grid gap-4 lg:grid-cols-2">
                {/* Allergies Card */}
                <Card className={`${medicalHistory.allergies && medicalHistory.allergies.length > 0 ? 'border-red-300 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10' : 'border-muted'}`}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <AlertTriangle className={`h-4 w-4 ${medicalHistory.allergies && medicalHistory.allergies.length > 0 ? 'text-red-500' : 'text-muted-foreground'}`} />
                      Allergies
                      {medicalHistory.allergies && medicalHistory.allergies.length > 0 && (
                        <Badge variant="outline" className="ml-auto bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
                          {medicalHistory.allergies.length}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {medicalHistory.allergies && medicalHistory.allergies.length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {medicalHistory.allergies.map((allergy: string, index: number) => (
                          <Badge key={index} className="bg-red-600 text-white hover:bg-red-700">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            {allergy}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p>No known allergies</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Chronic Conditions Card */}
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm flex items-center gap-2">
                      <Stethoscope className="h-4 w-4 text-amber-500" />
                      Chronic Conditions
                      {medicalHistory.diagnoses && medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length > 0 && (
                        <Badge variant="outline" className="ml-auto bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
                          {medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length}
                        </Badge>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {medicalHistory.diagnoses && medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').length > 0 ? (
                      <div className="flex flex-wrap gap-2">
                        {medicalHistory.diagnoses.filter((d: { status: string }) => d.status === 'Active').map((diagnosis: { name: string; code?: string; diagnosedDate?: string }, index: number) => (
                          <div key={index} className="p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                                {diagnosis.code || 'N/A'}
                              </Badge>
                              <span className="font-medium text-sm">{diagnosis.name}</span>
                            </div>
                            {diagnosis.diagnosedDate && (
                              <div className="text-xs text-muted-foreground mt-1">
                                Diagnosed: {diagnosis.diagnosedDate}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-sm text-muted-foreground">
                        <Stethoscope className="h-6 w-6 mx-auto mb-2 opacity-50" />
                        <p>No chronic conditions</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* History Tables in Tabs */}
              <Card>
                <CardHeader className="pb-0">
                  <Tabs defaultValue="consultations" className="w-full">
                    <TabsList className="grid w-full grid-cols-6">
                      <TabsTrigger value="consultations" className="text-xs">
                        <ClipboardList className="h-3 w-3 mr-1" />
                        Consultations ({demoConsultationSessions.length})
                      </TabsTrigger>
                      <TabsTrigger value="labs" className="text-xs">
                        <TestTube className="h-3 w-3 mr-1" />
                        Lab Results ({demoPatientHistory.labResults.length})
                      </TabsTrigger>
                      <TabsTrigger value="imaging" className="text-xs">
                        <ScanLine className="h-3 w-3 mr-1" />
                        Imaging ({demoPatientHistory.imagingResults.length})
                      </TabsTrigger>
                      <TabsTrigger value="prescriptions" className="text-xs">
                        <Pill className="h-3 w-3 mr-1" />
                        Prescriptions ({demoPatientHistory.prescriptions.length})
                      </TabsTrigger>
                      <TabsTrigger value="vitals" className="text-xs">
                        <Heart className="h-3 w-3 mr-1" />
                        Vitals ({vitalsHistory.length})
                      </TabsTrigger>
                      <TabsTrigger value="background" className="text-xs">
                        <User className="h-3 w-3 mr-1" />
                        Background
                      </TabsTrigger>
                    </TabsList>

                    {/* Consultations Tab */}
                    <TabsContent value="consultations" className="mt-4">
                      {(() => {
                        const totalConsultations = demoConsultationSessions.length;
                        const totalConsultationPages = Math.ceil(totalConsultations / consultationsPerPage);
                        const paginatedConsultations = demoConsultationSessions.slice(
                          (consultationsPage - 1) * consultationsPerPage, 
                          consultationsPage * consultationsPerPage
                        );
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <select
                                value={sessionDateFilter}
                                onChange={(e) => { setSessionDateFilter(e.target.value); setConsultationsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Time</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                              </select>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Doctor</th>
                                    <th className="px-4 py-2 text-left font-medium">Clinic</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedConsultations.map((session) => (
                                    <tr key={session.id} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{session.date}</td>
                                      <td className="px-4 py-3">{session.doctor}</td>
                                      <td className="px-4 py-3">
                                        <Badge variant="outline">{session.clinic}</Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => viewSessionDetails(session)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalConsultations === 0 ? 0 : `${(consultationsPage - 1) * consultationsPerPage + 1}-${Math.min(totalConsultations, consultationsPage * consultationsPerPage)}`} of {totalConsultations}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(consultationsPerPage)} onValueChange={(value) => { setConsultationsPerPage(Number(value)); setConsultationsPage(1); }}>
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
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={consultationsPage === 1} onClick={() => setConsultationsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalConsultationPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalConsultationPages <= 5) pageNum = i + 1;
                                    else if (consultationsPage <= 3) pageNum = i + 1;
                                    else if (consultationsPage >= totalConsultationPages - 2) pageNum = totalConsultationPages - 4 + i;
                                    else pageNum = consultationsPage - 2 + i;
                                    if (pageNum > totalConsultationPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={consultationsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setConsultationsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={consultationsPage >= totalConsultationPages} onClick={() => setConsultationsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Lab Results Tab */}
                    <TabsContent value="labs" className="mt-4">
                      {(() => {
                        const filteredLabs = demoPatientHistory.labResults.filter((lab: { status: string }) => labStatusFilter === 'all' || lab.status === labStatusFilter);
                        const totalLabs = filteredLabs.length;
                        const totalLabPages = Math.ceil(totalLabs / labResultsPerPage);
                        const paginatedLabs = filteredLabs.slice((labResultsPage - 1) * labResultsPerPage, labResultsPage * labResultsPerPage);
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <select
                                  value={labDateFilter}
                                  onChange={(e) => { setLabDateFilter(e.target.value); setLabResultsPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Time</option>
                                  <option value="30">Last 30 Days</option>
                                  <option value="90">Last 3 Months</option>
                                  <option value="365">Last Year</option>
                                </select>
                                <select
                                  value={labStatusFilter}
                                  onChange={(e) => { setLabStatusFilter(e.target.value); setLabResultsPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Status</option>
                                  <option value="Normal">Normal</option>
                                  <option value="Abnormal">Abnormal</option>
                                </select>
                              </div>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Test</th>
                                    <th className="px-4 py-2 text-left font-medium">Category</th>
                                    <th className="px-4 py-2 text-center font-medium">Status</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedLabs.map((lab: { id: string; date: string; test: string; category?: string; criticalValue?: boolean; status: string; result?: string }) => (
                                    <tr key={lab.id} className={`hover:bg-muted/30 ${lab.criticalValue ? 'bg-red-50 dark:bg-red-900/10' : ''}`}>
                                      <td className="px-4 py-3 text-muted-foreground">{lab.date}</td>
                                      <td className="px-4 py-3 font-medium">
                                        {lab.test}
                                        {lab.criticalValue && <AlertTriangle className="h-3 w-3 text-red-500 inline ml-2" />}
                                      </td>
                                      <td className="px-4 py-3">{lab.category}</td>
                                      <td className="px-4 py-3 text-center">
                                        <Badge className={lab.status === 'Normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                                          {lab.status}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => viewLabResultDetails(lab)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalLabs === 0 ? 0 : `${(labResultsPage - 1) * labResultsPerPage + 1}-${Math.min(totalLabs, labResultsPage * labResultsPerPage)}`} of {totalLabs}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(labResultsPerPage)} onValueChange={(value) => { setLabResultsPerPage(Number(value)); setLabResultsPage(1); }}>
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
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={labResultsPage === 1} onClick={() => setLabResultsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalLabPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalLabPages <= 5) pageNum = i + 1;
                                    else if (labResultsPage <= 3) pageNum = i + 1;
                                    else if (labResultsPage >= totalLabPages - 2) pageNum = totalLabPages - 4 + i;
                                    else pageNum = labResultsPage - 2 + i;
                                    if (pageNum > totalLabPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={labResultsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setLabResultsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={labResultsPage >= totalLabPages || totalLabPages === 0} onClick={() => setLabResultsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Imaging Tab */}
                    <TabsContent value="imaging" className="mt-4">
                      {(() => {
                        const filteredImaging = demoPatientHistory.imagingResults.filter((img: { status: string }) => imagingStatusFilter === 'all' || img.status === imagingStatusFilter);
                        const totalImaging = filteredImaging.length;
                        const totalImagingPages = Math.ceil(totalImaging / imagingPerPage);
                        const paginatedImaging = filteredImaging.slice((imagingPage - 1) * imagingPerPage, imagingPage * imagingPerPage);
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-3">
                                <select
                                  value={imagingDateFilter}
                                  onChange={(e) => { setImagingDateFilter(e.target.value); setImagingPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Time</option>
                                  <option value="30">Last 30 Days</option>
                                  <option value="90">Last 3 Months</option>
                                  <option value="365">Last Year</option>
                                </select>
                                <select
                                  value={imagingStatusFilter}
                                  onChange={(e) => { setImagingStatusFilter(e.target.value); setImagingPage(1); }}
                                  className="text-sm border rounded-md px-3 py-1.5 bg-background"
                                >
                                  <option value="all">All Status</option>
                                  <option value="Normal">Normal</option>
                                  <option value="Abnormal">Abnormal</option>
                                </select>
                              </div>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Procedure</th>
                                    <th className="px-4 py-2 text-left font-medium">Finding</th>
                                    <th className="px-4 py-2 text-center font-medium">Status</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedImaging.map((img: { date: string; study?: string; procedure: string; finding?: string; status: string; result?: string }, index: number) => (
                                    <tr key={index} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{img.date}</td>
                                      <td className="px-4 py-3 font-medium">{img.procedure}</td>
                                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]">{img.finding || ''}</td>
                                      <td className="px-4 py-3 text-center">
                                        <Badge className={img.status === 'Normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}>
                                          {img.status}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => toast.info(`Viewing ${img.procedure}`)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalImaging === 0 ? 0 : `${(imagingPage - 1) * imagingPerPage + 1}-${Math.min(totalImaging, imagingPage * imagingPerPage)}`} of {totalImaging}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(imagingPerPage)} onValueChange={(value) => { setImagingPerPage(Number(value)); setImagingPage(1); }}>
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
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={imagingPage === 1} onClick={() => setImagingPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalImagingPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalImagingPages <= 5) pageNum = i + 1;
                                    else if (imagingPage <= 3) pageNum = i + 1;
                                    else if (imagingPage >= totalImagingPages - 2) pageNum = totalImagingPages - 4 + i;
                                    else pageNum = imagingPage - 2 + i;
                                    if (pageNum > totalImagingPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={imagingPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setImagingPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={imagingPage >= totalImagingPages || totalImagingPages === 0} onClick={() => setImagingPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Prescriptions Tab */}
                    <TabsContent value="prescriptions" className="mt-4">
                      {(() => {
                        // Filter prescriptions based on date and status filters
                        let filteredPrescriptions = [...demoPatientHistory.prescriptions];
                        
                        // Apply date filter
                        if (prescriptionsDateFilter !== 'all') {
                          const days = parseInt(prescriptionsDateFilter);
                          const cutoffDate = new Date();
                          cutoffDate.setDate(cutoffDate.getDate() - days);
                          filteredPrescriptions = filteredPrescriptions.filter(p => {
                            const prescriptionDate = new Date(p.date);
                            return prescriptionDate >= cutoffDate;
                          });
                        }
                        
                        // Apply status filter
                        if (prescriptionsStatusFilter !== 'all') {
                          filteredPrescriptions = filteredPrescriptions.filter(p => p.status === prescriptionsStatusFilter);
                        }
                        
                        const totalPrescriptions = filteredPrescriptions.length;
                        const totalPrescriptionsPages = Math.ceil(totalPrescriptions / prescriptionsPerPage);
                        const paginatedPrescriptions = filteredPrescriptions.slice(
                          (prescriptionsPage - 1) * prescriptionsPerPage, 
                          prescriptionsPage * prescriptionsPerPage
                        );
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3 gap-2">
                              <select
                                value={prescriptionsDateFilter}
                                onChange={(e) => { setPrescriptionsDateFilter(e.target.value); setPrescriptionsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Time</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                              </select>
                              <select
                                value={prescriptionsStatusFilter}
                                onChange={(e) => { setPrescriptionsStatusFilter(e.target.value); setPrescriptionsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Status</option>
                                <option value="pending">Pending</option>
                                <option value="partially_dispensed">Partially Dispensed</option>
                                <option value="dispensed">Dispensed</option>
                              </select>
                            </div>
                            <div className="border rounded-lg overflow-hidden">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50">
                                  <tr>
                                    <th className="px-4 py-2 text-left font-medium">Date</th>
                                    <th className="px-4 py-2 text-left font-medium">Prescription ID</th>
                                    <th className="px-4 py-2 text-left font-medium">Doctor</th>
                                    <th className="px-4 py-2 text-left font-medium">Diagnosis</th>
                                    <th className="px-4 py-2 text-left font-medium">Medications</th>
                                    <th className="px-4 py-2 text-center font-medium">Status</th>
                                    <th className="px-4 py-2 text-center font-medium">Action</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y">
                                  {paginatedPrescriptions.map((prescription) => (
                                    <tr key={prescription.id} className="hover:bg-muted/30">
                                      <td className="px-4 py-3 text-muted-foreground">{prescription.date}</td>
                                      <td className="px-4 py-3">
                                        <Badge variant="outline">{prescription.prescriptionId}</Badge>
                                      </td>
                                      <td className="px-4 py-3">{prescription.doctor}</td>
                                      <td className="px-4 py-3">{prescription.diagnosis}</td>
                                      <td className="px-4 py-3">
                                        <div className="flex flex-wrap gap-1">
                                          {prescription.medications.map((med: string, idx: number) => (
                                            <Badge key={idx} variant="outline" className="text-xs">
                                              {med}
                                            </Badge>
                                          ))}
                                        </div>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Badge 
                                          variant="outline" 
                                          className={
                                            prescription.status === 'dispensed' 
                                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                              : prescription.status === 'partially_dispensed'
                                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                              : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                                          }
                                        >
                                          {prescription.status === 'dispensed' ? 'Dispensed' : 
                                           prescription.status === 'partially_dispensed' ? 'Partially Dispensed' : 
                                           'Pending'}
                                        </Badge>
                                      </td>
                                      <td className="px-4 py-3 text-center">
                                        <Button variant="ghost" size="sm" onClick={() => viewPrescriptionDetails(prescription)}>
                                          <Eye className="h-4 w-4 mr-1" /> View
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {/* Pagination */}
                            <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalPrescriptions === 0 ? 0 : `${(prescriptionsPage - 1) * prescriptionsPerPage + 1}-${Math.min(totalPrescriptions, prescriptionsPage * prescriptionsPerPage)}`} of {totalPrescriptions}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(prescriptionsPerPage)} onValueChange={(value) => { setPrescriptionsPerPage(Number(value)); setPrescriptionsPage(1); }}>
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
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={prescriptionsPage === 1} onClick={() => setPrescriptionsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalPrescriptionsPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalPrescriptionsPages <= 5) pageNum = i + 1;
                                    else if (prescriptionsPage <= 3) pageNum = i + 1;
                                    else if (prescriptionsPage >= totalPrescriptionsPages - 2) pageNum = totalPrescriptionsPages - 4 + i;
                                    else pageNum = prescriptionsPage - 2 + i;
                                    if (pageNum > totalPrescriptionsPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={prescriptionsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setPrescriptionsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={prescriptionsPage >= totalPrescriptionsPages || totalPrescriptionsPages === 0} onClick={() => setPrescriptionsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Vitals Tab */}
                    <TabsContent value="vitals" className="mt-4">
                      {(() => {
                        // Filter vitals based on date filter
                        let filteredVitals = [...vitalsHistory];
                        if (vitalsDateFilter !== 'all') {
                          const days = parseInt(vitalsDateFilter);
                          const cutoffDate = new Date();
                          cutoffDate.setDate(cutoffDate.getDate() - days);
                          filteredVitals = filteredVitals.filter(v => {
                            if (!v.recordedAt) return false;
                            const vitalDate = new Date(v.recordedAt);
                            return vitalDate >= cutoffDate;
                          });
                        }

                        const totalVitals = filteredVitals.length;
                        const totalVitalsPages = Math.ceil(totalVitals / vitalsPerPage);
                        const paginatedVitals = filteredVitals.slice(
                          (vitalsPage - 1) * vitalsPerPage, 
                          vitalsPage * vitalsPerPage
                        );
                        
                        return (
                          <>
                            <div className="flex items-center justify-between mb-3">
                              <select
                                value={vitalsDateFilter}
                                onChange={(e) => { setVitalsDateFilter(e.target.value); setVitalsPage(1); }}
                                className="text-sm border rounded-md px-3 py-1.5 bg-background"
                              >
                                <option value="all">All Time</option>
                                <option value="30">Last 30 Days</option>
                                <option value="90">Last 3 Months</option>
                                <option value="365">Last Year</option>
                              </select>
                            </div>
                            {loadingVitals ? (
                              <div className="text-center py-12">
                                <Loader2 className="h-8 w-8 mx-auto mb-3 animate-spin text-muted-foreground" />
                                <p className="text-sm text-muted-foreground">Loading vitals...</p>
                              </div>
                            ) : paginatedVitals.length === 0 ? (
                              <div className="text-center py-12 bg-gradient-to-b from-muted/30 to-background rounded-lg border-2 border-dashed border-muted">
                                <Heart className="h-12 w-12 mx-auto mb-3 text-muted-foreground opacity-50" />
                                <p className="font-medium text-muted-foreground mb-1">No vitals records found</p>
                                <p className="text-sm text-muted-foreground">Vitals will appear here once recorded</p>
                              </div>
                            ) : (
                              <div className="border rounded-lg overflow-hidden">
                                <table className="w-full text-sm">
                                  <thead className="bg-muted/50">
                                    <tr>
                                      <th className="px-4 py-2 text-left font-medium">Date</th>
                                      <th className="px-4 py-2 text-left font-medium">Summary</th>
                                      <th className="px-4 py-2 text-left font-medium">Recorded By</th>
                                      <th className="px-4 py-2 text-center font-medium">Action</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y">
                                    {paginatedVitals.map((vital) => (
                                      <tr key={vital.id} className="hover:bg-muted/30">
                                        <td className="px-4 py-3 text-muted-foreground">
                                          <div className="font-medium">{vital.date}</div>
                                          <div className="text-xs text-muted-foreground">{vital.time}</div>
                                        </td>
                                        <td className="px-4 py-3">
                                          <div className="flex flex-wrap gap-2 text-xs">
                                            {vital.temperature && (
                                              <Badge variant="outline" className="text-xs">
                                                T: {vital.temperature}°C
                                              </Badge>
                                            )}
                                            {vital.bloodPressure && (
                                              <Badge variant="outline" className="text-xs">
                                                BP: {vital.bloodPressure}
                                              </Badge>
                                            )}
                                            {vital.heartRate && (
                                              <Badge variant="outline" className="text-xs">
                                                HR: {vital.heartRate} bpm
                                              </Badge>
                                            )}
                                            {vital.oxygenSaturation && (
                                              <Badge variant="outline" className="text-xs">
                                                SpO2: {vital.oxygenSaturation}%
                                              </Badge>
                                            )}
                                          </div>
                                        </td>
                                        <td className="px-4 py-3 text-muted-foreground text-sm">{vital.recordedBy}</td>
                                        <td className="px-4 py-3 text-center">
                                          <Button variant="ghost" size="sm" onClick={() => viewVitalsDetails(vital)}>
                                            <Eye className="h-4 w-4 mr-1" /> View
                                          </Button>
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            )}
                            {/* Pagination */}
                            {totalVitals > 0 && (
                              <div className="flex flex-col gap-3 border-t border-border/60 pt-3 mt-3 md:flex-row md:items-center md:justify-between">
                              <div className="flex items-center gap-4">
                                <p className="text-sm text-muted-foreground">
                                  Showing {totalVitals === 0 ? 0 : `${(vitalsPage - 1) * vitalsPerPage + 1}-${Math.min(totalVitals, vitalsPage * vitalsPerPage)}`} of {totalVitals}
                                </p>
                                <div className="flex items-center gap-2">
                                  <label className="text-sm text-muted-foreground">Per page:</label>
                                  <Select value={String(vitalsPerPage)} onValueChange={(value) => { setVitalsPerPage(Number(value)); setVitalsPage(1); }}>
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
                              </div>
                              <div className="flex items-center gap-2">
                                <Button variant="outline" size="sm" disabled={vitalsPage === 1} onClick={() => setVitalsPage(p => p - 1)}>
                                  <ChevronLeft className="h-4 w-4" />
                                  Previous
                                </Button>
                                <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalVitalsPages) }, (_, i) => {
                                    let pageNum: number;
                                    if (totalVitalsPages <= 5) pageNum = i + 1;
                                    else if (vitalsPage <= 3) pageNum = i + 1;
                                    else if (vitalsPage >= totalVitalsPages - 2) pageNum = totalVitalsPages - 4 + i;
                                    else pageNum = vitalsPage - 2 + i;
                                    if (pageNum > totalVitalsPages || pageNum < 1) return null;
                                    return (
                                      <Button key={pageNum} variant={vitalsPage === pageNum ? "default" : "outline"} size="sm" className="w-8 h-8 p-0" onClick={() => setVitalsPage(pageNum)}>
                                        {pageNum}
                                      </Button>
                                    );
                                  })}
                                </div>
                                <Button variant="outline" size="sm" disabled={vitalsPage >= totalVitalsPages || totalVitalsPages === 0} onClick={() => setVitalsPage(p => p + 1)}>
                                  Next
                                  <ChevronRight className="h-4 w-4" />
                                </Button>
                              </div>
                            </div>
                            )}
                          </>
                        );
                      })()}
                    </TabsContent>

                    {/* Background Tab */}
                    <TabsContent value="background" className="mt-4">
                      <div className="flex justify-end mb-4">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowEditMedicalHistory(true)}
                          disabled={!currentPatient}
                        >
                          <Edit className="h-4 w-4 mr-2" />
                          Edit Medical History
                        </Button>
                      </div>
                      <div className="grid gap-4 md:grid-cols-2">
                        {/* Surgical History */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Activity className="h-4 w-4 text-rose-500" />
                              Surgical History
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {medicalHistory.surgicalHistory && medicalHistory.surgicalHistory.length > 0 ? (
                              <div className="space-y-3">
                                {medicalHistory.surgicalHistory.map((surgery: { procedure: string; date: string; hospital?: string }, index: number) => (
                                  <div key={index} className="p-3 bg-rose-50 dark:bg-rose-900/20 rounded-lg border border-rose-200 dark:border-rose-800">
                                    <div className="flex items-start justify-between mb-1">
                                      <span className="font-medium text-sm">{surgery.procedure}</span>
                                      <Badge variant="outline" className="text-xs">{surgery.date}</Badge>
                                    </div>
                                    {surgery.hospital && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        <MapPin className="h-3 w-3 inline mr-1" />
                                        {surgery.hospital}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-sm text-muted-foreground">
                                <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No surgical history recorded</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Family History */}
                        <Card>
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <Users className="h-4 w-4 text-blue-500" />
                              Family History
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            {medicalHistory.familyHistory && medicalHistory.familyHistory.length > 0 ? (
                              <div className="space-y-3">
                                {medicalHistory.familyHistory.map((fh: { relation: string; condition: string }, index: number) => (
                                  <div key={index} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                                    <div className="flex items-start justify-between">
                                      <div className="flex-1">
                                        <div className="font-medium text-sm mb-1">{fh.relation}</div>
                                        <div className="text-xs text-muted-foreground">{fh.condition}</div>
                                      </div>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-8 text-sm text-muted-foreground">
                                <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                                <p>No family history recorded</p>
                              </div>
                            )}
                          </CardContent>
                        </Card>

                        {/* Social History */}
                        <Card className="md:col-span-2">
                          <CardHeader className="pb-2">
                            <CardTitle className="text-sm flex items-center gap-2">
                              <User className="h-4 w-4 text-emerald-500" />
                              Social History
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                              <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
                                <div className="text-xs text-muted-foreground mb-2">Smoking</div>
                                <div className="font-semibold text-emerald-700 dark:text-emerald-300">{medicalHistory.socialHistory?.smoking || 'Not recorded'}</div>
                              </div>
                              <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-center">
                                <div className="text-xs text-muted-foreground mb-2">Alcohol</div>
                                <div className="font-semibold text-blue-700 dark:text-blue-300">{medicalHistory.socialHistory?.alcohol || 'Not recorded'}</div>
                              </div>
                              <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800 text-center">
                                <div className="text-xs text-muted-foreground mb-2">Exercise</div>
                                <div className="font-semibold text-purple-700 dark:text-purple-300">{medicalHistory.socialHistory?.exercise || 'Not recorded'}</div>
                              </div>
                              {medicalHistory.socialHistory?.occupation && (
                                <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
                                  <div className="text-xs text-muted-foreground mb-2">Occupation</div>
                                  <div className="font-semibold text-amber-700 dark:text-amber-300">{medicalHistory.socialHistory.occupation}</div>
                                </div>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      </div>
                    </TabsContent>
                  </Tabs>
                </CardHeader>
              </Card>
            </div>
          </TabsContent>
        </Tabs>

        {/* Add Diagnosis Dialog */}
        <Dialog open={showAddDiagnosis} onOpenChange={(open) => { setShowAddDiagnosis(open); if (!open) { setDiagnosisSearch(""); setShowDiagnosisDropdown(false); setDiagnosisNotes(""); } }}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Stethoscope className="h-5 w-5 text-rose-500" />
                Add Diagnosis
              </DialogTitle>
              <DialogDescription>
                Search and add ICD-10 diagnosis codes for {currentPatient?.name}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              {/* Diagnosis Type */}
              <div className="space-y-2">
                <Label>Diagnosis Type *</Label>
                <Select value={selectedDiagnosisType} onValueChange={(v: 'Primary' | 'Secondary' | 'Differential') => setSelectedDiagnosisType(v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Primary">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-rose-500"></div>
                        Primary - Main diagnosis
                      </div>
                    </SelectItem>
                    <SelectItem value="Secondary">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-500"></div>
                        Secondary - Contributing condition
                      </div>
                    </SelectItem>
                    <SelectItem value="Differential">
                      <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                        Differential - Possible diagnosis
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              
              {/* ICD-10 Search */}
              <div className="space-y-2">
                <Label>Search ICD-10 Code *</Label>
                <div className="relative">
                  <Input 
                    value={diagnosisSearch} 
                    onChange={(e) => {
                      setDiagnosisSearch(e.target.value);
                      setShowDiagnosisDropdown(true);
                    }}
                    onFocus={() => setShowDiagnosisDropdown(true)}
                    placeholder="Search by code or condition name (e.g., I10 or Hypertension)..." 
                  />
                  {showDiagnosisDropdown && diagnosisSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[250px] overflow-y-auto">
                      {icd10Codes
                        .filter(dx => 
                          dx.code.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                          dx.name.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                          dx.category.toLowerCase().includes(diagnosisSearch.toLowerCase())
                        )
                        .slice(0, 15)
                        .map((dx, index) => (
                          <div 
                            key={`${dx.code}-${index}`}
                            onClick={() => {
                              const newDx = {
                                id: `dx-${Date.now()}`,
                                code: dx.code,
                                name: dx.name,
                                type: selectedDiagnosisType,
                                notes: diagnosisNotes
                              };
                              setDiagnoses([...diagnoses, newDx]);
                              setDiagnosisSearch("");
                              setShowDiagnosisDropdown(false);
                              setDiagnosisNotes("");
                              setShowAddDiagnosis(false);
                              toast.success(`Added: ${dx.code} - ${dx.name}`);
                            }}
                            className="p-2 hover:bg-muted cursor-pointer"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <div className="font-medium text-sm flex items-center gap-2">
                                  <span className="font-mono bg-muted px-1.5 py-0.5 rounded text-xs">{dx.code}</span>
                                  {dx.name}
                                </div>
                              </div>
                              <Badge variant="outline" className="text-xs">{dx.category}</Badge>
                            </div>
                          </div>
                        ))
                      }
                      {icd10Codes.filter(dx => 
                        dx.code.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                        dx.name.toLowerCase().includes(diagnosisSearch.toLowerCase()) ||
                        dx.category.toLowerCase().includes(diagnosisSearch.toLowerCase())
                      ).length === 0 && (
                        <div className="p-4 text-center text-muted-foreground text-sm">
                          No matching ICD-10 codes found
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Additional Notes */}
              <div className="space-y-2">
                <Label>Additional Notes (Optional)</Label>
                <Textarea 
                  value={diagnosisNotes} 
                  onChange={(e) => setDiagnosisNotes(e.target.value)} 
                  placeholder="Add any specific notes about this diagnosis..."
                  rows={2}
                />
              </div>
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddDiagnosis(false)}>Cancel</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddPrescription} onOpenChange={(open) => { 
          setShowAddPrescription(open); 
          if (!open) { 
            setMedicationSearch("");
            setSelectedMedications(new Set()); // Clear selections when closing
            setMedicationConfigs(new Map()); // Clear configs when closing
            setShowMedicationDropdown(false); 
          }
        }}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pill className="h-5 w-5 text-violet-500" />
                Add Prescription
              </DialogTitle>
              <DialogDescription>
                Search and select medications, then configure dosage details for each individually. All selected medications will be sent as one prescription order to Pharmacy queue.
              </DialogDescription>
            </DialogHeader>
            
            {/* Allergy Warning in Dialog */}
            {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span><strong>Allergies:</strong> {currentPatient.allergies.join(', ')}</span>
                </div>
              </div>
            )}
            
            <div className="space-y-4 py-2">
              {/* Medication Search */}
              <div className="space-y-2">
                <Label>Medication *</Label>
                <p className="text-xs text-muted-foreground mb-2">
                  Search medications by name, generic name, or category. Select multiple medications to add to this prescription order.
                </p>
                <div className="relative">
                  <Input 
                    value={medicationSearch} 
                    onChange={(e) => {
                      setMedicationSearch(e.target.value);
                      // Only show dropdown when user types something
                      if (e.target.value.trim().length > 0) {
                        setShowMedicationDropdown(true);
                      } else {
                        setShowMedicationDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      // Only show dropdown if user has already typed something
                      if (medicationSearch.trim().length > 0) {
                        setShowMedicationDropdown(true);
                      }
                    }}
                    onBlur={() => {
                      // Delay hiding dropdown to allow click on items
                      setTimeout(() => setShowMedicationDropdown(false), 200);
                    }}
                    placeholder="Search by name, generic name, or category..." 
                  />
                  {loadingMedications && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-4 text-center text-sm text-muted-foreground">
                      Loading medications...
                    </div>
                  )}
                  {!loadingMedications && showMedicationDropdown && filteredMedications.length > 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg max-h-[300px] overflow-y-auto">
                      {filteredMedications.length > 20 && (
                        <div className="p-2 text-xs text-muted-foreground border-b">
                          Showing {Math.min(20, filteredMedications.length)} of {filteredMedications.length} medications
                        </div>
                      )}
                      {filteredMedications.slice(0, 20).map((med) => {
                        // Handle both API medications (generic_name, form) and demo medications (genericName, dosageForm)
                        const genericName = med.generic_name || med.genericName || '';
                        const form = med.form || med.dosageForm || '';
                        const category = med.category || '';
                        const medicationId = typeof med.id === 'number' ? med.id : parseInt(med.id, 10);
                        const isSelected = selectedMedications.has(medicationId);
                        const isAllergyRisk = currentPatient?.allergies.some(allergy => 
                          med.name?.toLowerCase().includes(allergy.toLowerCase()) || 
                          genericName.toLowerCase().includes(allergy.toLowerCase())
                        );
                        return (
                          <div 
                            key={med.id}
                            onClick={() => toggleMedicationSelection(med)}
                            className={`p-2 hover:bg-muted cursor-pointer flex items-center justify-between ${isAllergyRisk ? 'bg-red-50 dark:bg-red-900/20' : ''} ${isSelected ? 'bg-primary/10 dark:bg-primary/20' : ''}`}
                          >
                            <div className="flex items-center gap-2 flex-1">
                              <Checkbox 
                                checked={isSelected}
                                onCheckedChange={() => toggleMedicationSelection(med)}
                                onClick={(e) => e.stopPropagation()}
                                className="flex-shrink-0"
                              />
                              <div className="flex-1">
                                <div className="font-medium text-sm flex items-center gap-2">
                                  {med.name}
                                  {isAllergyRisk && <AlertTriangle className="h-3 w-3 text-red-500" />}
                                </div>
                                <div className="text-xs text-muted-foreground">
                                  {genericName && `${genericName} • `}
                                  {category && `${category} • `}
                                  {form || 'N/A'}
                                </div>
                              </div>
                            </div>
                            {med.stockLevel !== undefined && (
                              <Badge variant="outline" className={med.stockLevel === 0 ? 'bg-red-100 text-red-700' : med.stockLevel < 50 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700'}>
                                {med.stockLevel === 0 ? 'Out' : med.stockLevel}
                              </Badge>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!loadingMedications && showMedicationDropdown && filteredMedications.length === 0 && medicationSearch && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-4 text-center text-sm text-muted-foreground">
                      No medications found matching "{medicationSearch}"
                    </div>
                  )}
                  {!loadingMedications && showMedicationDropdown && filteredMedications.length === 0 && !medicationSearch && medications.length === 0 && (
                    <div className="absolute z-50 w-full mt-1 bg-background border rounded-md shadow-lg p-4 text-center text-sm text-muted-foreground">
                      No medications available. Please check if medications are loaded.
                    </div>
                  )}
                </div>
              </div>
            </div>
            
            {/* Selected Medications List with Individual Configuration */}
            {selectedMedications.size > 0 && (
              <div className="space-y-4 border-t pt-4 mt-4">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <Label className="text-sm font-semibold">
                      Selected Medications ({selectedMedications.size})
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Configure dosage details for each medication below. All medications will be sent as one prescription order.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelectedMedications(new Set());
                      setMedicationConfigs(new Map());
                    }}
                  >
                    Clear All
                  </Button>
                </div>
                <div className="max-h-[400px] overflow-y-auto space-y-3">
                  {Array.from(selectedMedications).map((medId) => {
                    const med = medications.find((m: any) => {
                      const mId = typeof m.id === 'number' ? m.id : parseInt(m.id, 10);
                      return mId === medId;
                    });
                    if (!med) return null;
                    const config = medicationConfigs.get(medId) || {
                      dosage: '',
                      frequency: 'Once daily (OD)',
                      duration: '',
                      durationDays: 0,
                      quantity: 0,
                      route: 'Oral',
                      instructions: '',
                      priority: 'Routine',
                    };
                    const dailyDoses = frequencyToDailyDoses[config.frequency] || 1;
                    const calculatedQty = config.frequency === 'STAT (Single dose)' 
                      ? 1 
                      : Math.ceil(dailyDoses * config.durationDays);
                    return (
                      <div key={medId} className={`border rounded-lg p-3 space-y-3 ${
                        (!config.dosage || !config.frequency || (!config.durationDays && config.frequency !== 'STAT (Single dose)')) 
                          ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-300 dark:border-amber-800' 
                          : 'bg-muted/30'
                      }`}>
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="font-medium text-sm flex items-center gap-2">
                              {med.name}
                              {(!config.dosage || !config.frequency || (!config.durationDays && config.frequency !== 'STAT (Single dose)')) && (
                                <Badge variant="outline" className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                                  Incomplete
                                </Badge>
                              )}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {med.generic_name || med.genericName || ''} • {med.form || med.dosageForm || 'N/A'}
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedMedications(prev => {
                                const newSet = new Set(prev);
                                newSet.delete(medId);
                                return newSet;
                              });
                              setMedicationConfigs(prev => {
                                const newConfigs = new Map(prev);
                                newConfigs.delete(medId);
                                return newConfigs;
                              });
                            }}
                            className="h-6 w-6 p-0"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                        
                        {/* Individual Configuration for each medication */}
                        <div className="grid grid-cols-2 gap-2 text-xs">
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Dosage <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              value={config.dosage}
                              onChange={(e) => updateMedicationConfig(medId, 'dosage', e.target.value)}
                              placeholder="e.g., 1 tablet"
                              className={`h-8 text-xs ${!config.dosage ? 'border-amber-300 dark:border-amber-700' : ''}`}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Route <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={config.route}
                              onValueChange={(v) => updateMedicationConfig(medId, 'route', v)}
                            >
                              <SelectTrigger className={`h-8 text-xs ${!config.route ? 'border-amber-300 dark:border-amber-700' : ''}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {routes.map(route => (
                                  <SelectItem key={route} value={route} className="text-xs">{route}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Frequency <span className="text-red-500">*</span>
                            </Label>
                            <Select
                              value={config.frequency}
                              onValueChange={(v) => updateMedicationConfig(medId, 'frequency', v)}
                            >
                              <SelectTrigger className={`h-8 text-xs ${!config.frequency ? 'border-amber-300 dark:border-amber-700' : ''}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Once daily (OD)" className="text-xs">Once daily (OD)</SelectItem>
                                <SelectItem value="Twice daily (BD)" className="text-xs">Twice daily (BD)</SelectItem>
                                <SelectItem value="Three times daily (TDS)" className="text-xs">Three times daily (TDS)</SelectItem>
                                <SelectItem value="Four times daily (QDS)" className="text-xs">Four times daily (QDS)</SelectItem>
                                <SelectItem value="Every 6 hours (Q6H)" className="text-xs">Every 6 hours (Q6H)</SelectItem>
                                <SelectItem value="Every 8 hours (Q8H)" className="text-xs">Every 8 hours (Q8H)</SelectItem>
                                <SelectItem value="Every 12 hours (Q12H)" className="text-xs">Every 12 hours (Q12H)</SelectItem>
                                <SelectItem value="At bedtime (Nocte)" className="text-xs">At bedtime (Nocte)</SelectItem>
                                <SelectItem value="As needed (PRN)" className="text-xs">As needed (PRN)</SelectItem>
                                <SelectItem value="Weekly" className="text-xs">Weekly</SelectItem>
                                <SelectItem value="STAT (Single dose)" className="text-xs">STAT (Single dose)</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">
                              Duration (days) <span className="text-red-500">*</span>
                              {config.frequency === 'STAT (Single dose)' && (
                                <span className="text-muted-foreground ml-1">(Auto: 1)</span>
                              )}
                            </Label>
                            <Input
                              type="number"
                              min="1"
                              value={config.durationDays || ''}
                              onChange={(e) => {
                                const days = parseInt(e.target.value) || 0;
                                updateMedicationConfig(medId, 'durationDays', days);
                              }}
                              placeholder="e.g., 7"
                              className={`h-8 text-xs ${!config.durationDays && config.frequency !== 'STAT (Single dose)' ? 'border-amber-300 dark:border-amber-700' : ''}`}
                              disabled={config.frequency === 'STAT (Single dose)'}
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Calculated Quantity</Label>
                            <div className="h-8 px-2 border rounded-md text-xs bg-muted/50 flex items-center justify-between">
                              <span className="font-medium">{calculatedQty || config.quantity || '—'}</span>
                              {calculatedQty > 0 && (
                                <span className="text-muted-foreground text-[10px]">
                                  ({config.frequency} × {config.durationDays} days)
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Priority</Label>
                            <Select
                              value={config.priority}
                              onValueChange={(v) => updateMedicationConfig(medId, 'priority', v)}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="Routine" className="text-xs">Routine</SelectItem>
                                <SelectItem value="Urgent" className="text-xs">Urgent</SelectItem>
                                <SelectItem value="Emergency" className="text-xs">Emergency</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label className="text-xs">Special Instructions</Label>
                          <Textarea
                            value={config.instructions}
                            onChange={(e) => updateMedicationConfig(medId, 'instructions', e.target.value)}
                            placeholder="e.g., Take after meals..."
                            rows={2}
                            className="text-xs"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button 
                variant="outline" 
                onClick={() => { 
                  setShowAddPrescription(false); 
                  setMedicationSearch("");
                  setSelectedMedications(new Set());
                }}
              >
                Cancel
              </Button>
              {selectedMedications.size > 0 ? (
                <Button 
                  onClick={addSelectedMedicationsToPrescription}
                  className="bg-violet-600 hover:bg-violet-700"
                  disabled={Array.from(selectedMedications).some(medId => {
                    const config = medicationConfigs.get(medId);
                    return !config || !config.dosage || !config.frequency || (!config.durationDays && config.frequency !== 'STAT (Single dose)');
                  })}
                >
                  <Pill className="h-4 w-4 mr-2" />
                  Add {selectedMedications.size} Medication{selectedMedications.size > 1 ? 's' : ''} to Order
                </Button>
              ) : (
                <Button 
                  onClick={addPrescription} 
                  disabled={!newPrescription.medication || !newPrescription.dosage || !newPrescription.frequency}
                  className="bg-violet-600 hover:bg-violet-700"
                >
                  <Pill className="h-4 w-4 mr-2" />
                  Add to Prescription Order
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog 
          open={showAddLabOrder} 
          onOpenChange={(open) => {
            setShowAddLabOrder(open);
            if (!open) {
              setSelectedLabTemplates(new Set());
              setLabTemplateSearch("");
              setShowLabTemplateDropdown(false);
            }
          }}
        >
          <DialogContent className="w-[95vw] sm:max-w-[700px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><TestTube className="h-5 w-5 text-amber-500" />Order Lab Test(s)</DialogTitle>
              <DialogDescription>Select one or more laboratory tests to order - will be sent to Lab Tech queue</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>Search and Select Tests *</Label>
                <div className="relative" data-lab-template-dropdown>
                  <Input
                    placeholder="Search tests by name, code, or sample type..."
                    value={labTemplateSearch}
                    onChange={(e) => {
                      const searchValue = e.target.value;
                      setLabTemplateSearch(searchValue);
                      // Only show dropdown if user has typed something
                      if (searchValue.trim()) {
                        setShowLabTemplateDropdown(true);
                      } else {
                        setShowLabTemplateDropdown(false);
                      }
                    }}
                    onFocus={() => {
                      // Only show dropdown if there's search text
                      if (labTemplateSearch.trim()) {
                        setShowLabTemplateDropdown(true);
                      }
                    }}
                  />
                  {showLabTemplateDropdown && labTemplateSearch.trim() && (
                    <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border rounded-md shadow-lg max-h-[300px] overflow-y-auto" data-lab-template-dropdown>
                      {loadingLabTemplates ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          <Loader2 className="h-4 w-4 animate-spin mx-auto mb-2" />
                          Loading tests...
                        </div>
                      ) : filteredLabTemplates.length === 0 ? (
                        <div className="p-4 text-center text-sm text-muted-foreground">
                          No tests found. Try a different search term.
                        </div>
                      ) : (
                        filteredLabTemplates.map((template) => {
                          const isSelected = selectedLabTemplates.has(template.id);
                          return (
                            <div
                              key={template.id}
                              onClick={() => toggleLabTemplateSelection(template)}
                              className={`p-3 hover:bg-muted cursor-pointer border-b last:border-b-0 flex items-start gap-3 ${
                                isSelected ? 'bg-amber-50 dark:bg-amber-900/20' : ''
                              }`}
                            >
                              <Checkbox checked={isSelected} onCheckedChange={() => toggleLabTemplateSelection(template)} />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-sm">{template.name}</div>
                                <div className="text-xs text-muted-foreground mt-1">
                                  {template.code} • {template.sample_type}
                                </div>
                                {template.description && (
                                  <div className="text-xs text-muted-foreground mt-1 line-clamp-1">
                                    {template.description}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
                {selectedLabTemplates.size > 0 && (
                  <div className="mt-2 space-y-2">
                    <div className="text-sm font-medium">Selected Tests ({selectedLabTemplates.size}):</div>
                    <div className="flex flex-wrap gap-2">
                      {labTemplates
                        .filter(t => selectedLabTemplates.has(t.id))
                        .map(template => (
                          <Badge key={template.id} variant="secondary" className="flex items-center gap-1">
                            {template.name}
                            <X
                              className="h-3 w-3 cursor-pointer"
                              onClick={() => toggleLabTemplateSelection(template)}
                            />
                          </Badge>
                        ))}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedLabTemplates(new Set())}
                      className="text-xs"
                    >
                      Clear All
                    </Button>
                  </div>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newLabOrder.priority} onValueChange={(v) => setNewLabOrder({ ...newLabOrder, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine"><div className="flex items-center gap-2"><Badge className="bg-blue-100 text-blue-800">Routine</Badge><span className="text-xs text-muted-foreground">Standard TAT</span></div></SelectItem>
                      <SelectItem value="Urgent"><div className="flex items-center gap-2"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge><span className="text-xs text-muted-foreground">Priority processing</span></div></SelectItem>
                      <SelectItem value="STAT"><div className="flex items-center gap-2"><Badge className="bg-rose-100 text-rose-800">STAT</Badge><span className="text-xs text-muted-foreground">Immediate - Emergency</span></div></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Est. TAT</Label>
                  <div className="h-10 px-3 py-2 border rounded-md text-sm text-muted-foreground bg-muted/50 flex items-center">
                    {newLabOrder.priority === 'STAT' ? '30 min - 1 hour' : newLabOrder.priority === 'Urgent' ? '1 - 2 hours' : '2 - 4 hours'}
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Clinical Notes / Indication</Label>
                <Textarea value={newLabOrder.notes} onChange={(e) => setNewLabOrder({ ...newLabOrder, notes: e.target.value })} placeholder="Reason for test, clinical context, specific instructions for lab..." rows={3} />
              </div>
              {newLabOrder.priority === 'STAT' && (
                <div className="p-3 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                  <p className="text-sm text-rose-700 dark:text-rose-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    STAT orders are for emergencies only. Lab will prioritize immediately.
                  </p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setShowAddLabOrder(false);
                setSelectedLabTemplates(new Set());
                setLabTemplateSearch("");
                setShowLabTemplateDropdown(false);
              }}>
                Cancel
              </Button>
              <Button 
                onClick={addLabOrder} 
                disabled={selectedLabTemplates.size === 0} 
                className="bg-amber-500 hover:bg-amber-600"
              >
                <TestTube className="h-4 w-4 mr-2" />
                Add {selectedLabTemplates.size > 0 ? `${selectedLabTemplates.size} Test(s)` : 'Test(s)'} to Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showAddNursingOrder} onOpenChange={setShowAddNursingOrder}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Syringe className="h-5 w-5 text-cyan-500" />
                Add Nursing Order
              </DialogTitle>
              <DialogDescription>
                Add nursing procedure to order - will be sent to Nursing queue
              </DialogDescription>
            </DialogHeader>
            
            {/* Allergy Warning in Dialog */}
            {currentPatient?.allergies && currentPatient.allergies.length > 0 && (
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <div className="flex items-center gap-2 text-red-700 dark:text-red-400 text-sm">
                  <AlertTriangle className="h-4 w-4" />
                  <span><strong>Allergies:</strong> {currentPatient.allergies.join(', ')}</span>
                </div>
              </div>
            )}
            
            <div className="space-y-4 py-2">
              {/* Procedure Type */}
              <div className="space-y-2">
                <Label>Procedure Type *</Label>
                <Select 
                  value={newNursingOrder.type} 
                  onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, type: v, medication: "", dosage: "", woundLocation: "", woundType: "", supplies: "" })}
                >
                  <SelectTrigger><SelectValue placeholder="Select procedure type" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Injection">
                      <div className="flex items-center gap-2">
                        <Syringe className="h-4 w-4 text-rose-500" />
                        Injection
                      </div>
                    </SelectItem>
                    <SelectItem value="Dressing">
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-amber-500" />
                        Wound Dressing
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Injection-specific fields */}
              {newNursingOrder.type === 'Injection' && (
                <>
                  <div className="space-y-2">
                    <Label>Medication *</Label>
                    <Select 
                      value={newNursingOrder.medication} 
                      onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, medication: v })}
                      disabled={loadingInjectionMedications}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder={loadingInjectionMedications ? "Loading medications..." : "Select medication"} />
                      </SelectTrigger>
                      <SelectContent className="max-h-[250px]">
                        {injectionMedications.map(med => {
                          // Format display name: "Name Strength" (e.g., "Diclofenac 75mg")
                          const displayName = med.strength 
                            ? `${med.name} ${med.strength}`.trim()
                            : med.name;
                          return (
                            <SelectItem key={med.id || med.name} value={displayName}>
                              <div className="flex items-center justify-between w-full">
                                <span>{displayName}</span>
                                {med.category && (
                                  <span className="text-xs text-muted-foreground ml-2">{med.category}</span>
                                )}
                              </div>
                            </SelectItem>
                          );
                        })}
                        {injectionMedications.length === 0 && !loadingInjectionMedications && (
                          <SelectItem value="" disabled>No medications available</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {loadingInjectionMedications && (
                      <p className="text-xs text-muted-foreground">Loading medications from database...</p>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Dosage</Label>
                      <Input 
                        value={newNursingOrder.dosage} 
                        onChange={(e) => setNewNursingOrder({ ...newNursingOrder, dosage: e.target.value })}
                        placeholder="e.g., 1 amp, 2ml"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Route</Label>
                      <Select value={newNursingOrder.route} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, route: v })}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {injectionRoutes.map(route => (
                            <SelectItem key={route} value={route}>{route}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </>
              )}

              {/* Dressing-specific fields */}
              {newNursingOrder.type === 'Dressing' && (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Wound Type</Label>
                      <Select value={newNursingOrder.woundType} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, woundType: v })}>
                        <SelectTrigger><SelectValue placeholder="Select wound type" /></SelectTrigger>
                        <SelectContent>
                          {woundTypes.map(type => (
                            <SelectItem key={type} value={type}>{type}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Location</Label>
                      <Input 
                        value={newNursingOrder.woundLocation} 
                        onChange={(e) => setNewNursingOrder({ ...newNursingOrder, woundLocation: e.target.value })}
                        placeholder="e.g., Left forearm, Right knee"
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>Supplies Needed</Label>
                    <Input 
                      value={newNursingOrder.supplies} 
                      onChange={(e) => setNewNursingOrder({ ...newNursingOrder, supplies: e.target.value })}
                      placeholder="e.g., Gauze, Normal Saline, Antibiotic ointment"
                    />
                    <p className="text-xs text-muted-foreground">
                      Common supplies: {dressingSupplies.slice(0, 5).join(', ')}...
                    </p>
                  </div>
                </>
              )}

              {/* IV Infusion-specific fields */}
              {newNursingOrder.type === 'IV Infusion' && (
                <>
                  <div className="space-y-2">
                    <Label>IV Fluid *</Label>
                    <Select value={newNursingOrder.medication} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, medication: v })}>
                      <SelectTrigger><SelectValue placeholder="Select IV fluid" /></SelectTrigger>
                      <SelectContent>
                        {ivFluids.map(fluid => (
                          <SelectItem key={fluid.name} value={fluid.name}>
                            <div className="flex items-center justify-between w-full">
                              <span>{fluid.name}</span>
                              <span className="text-xs text-muted-foreground ml-2">{fluid.category}</span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Volume/Rate</Label>
                    <Input 
                      value={newNursingOrder.dosage} 
                      onChange={(e) => setNewNursingOrder({ ...newNursingOrder, dosage: e.target.value })}
                      placeholder="e.g., 500ml over 4 hours, 1L at 20 drops/min"
                    />
                  </div>
                </>
              )}

              {/* Priority */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newNursingOrder.priority} onValueChange={(v) => setNewNursingOrder({ ...newNursingOrder, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-blue-100 text-blue-800">Routine</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="Urgent">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-amber-100 text-amber-800">Urgent</Badge>
                        </div>
                      </SelectItem>
                      <SelectItem value="STAT">
                        <div className="flex items-center gap-2">
                          <Badge className="bg-red-100 text-red-800">STAT</Badge>
                          <span className="text-xs text-muted-foreground">Immediate</span>
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {/* Instructions */}
              <div className="space-y-2">
                <Label>Instructions *</Label>
                <Textarea 
                  value={newNursingOrder.instructions} 
                  onChange={(e) => setNewNursingOrder({ ...newNursingOrder, instructions: e.target.value })} 
                  placeholder="Detailed instructions for the nursing team..."
                  rows={3}
                />
              </div>

              {/* STAT Warning */}
              {newNursingOrder.priority === 'STAT' && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    STAT orders require immediate attention from the nursing team.
                  </p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddNursingOrder(false)}>Cancel</Button>
              <Button 
                onClick={addNursingOrder}
                disabled={!newNursingOrder.type || !newNursingOrder.instructions || (newNursingOrder.type === 'Injection' && !newNursingOrder.medication) || (newNursingOrder.type === 'Dressing' && !newNursingOrder.woundLocation)}
                className="bg-cyan-600 hover:bg-cyan-700"
              >
                <Syringe className="h-4 w-4 mr-2" />
                Add to Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Radiology Order Dialog */}
        <Dialog open={showAddRadiology} onOpenChange={setShowAddRadiology}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <ScanLine className="h-5 w-5 text-indigo-500" />
                Order Imaging Study
              </DialogTitle>
              <DialogDescription>
                Add imaging study to order - will be sent to Radiology queue
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              {/* Procedure Selection */}
              <div className="space-y-2">
                <Label>Imaging Procedure *</Label>
                <Select 
                  value={newRadiology.procedure} 
                  onValueChange={(v) => {
                    const proc = radiologyProcedures.find(p => p.name === v);
                    setNewRadiology({ 
                      ...newRadiology, 
                      procedure: v,
                      category: proc?.category || "",
                      bodyPart: proc?.bodyPart || ""
                    });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select procedure..." /></SelectTrigger>
                  <SelectContent className="max-h-[300px]">
                    <SelectItem disabled value="xray-header" className="font-bold text-xs text-muted-foreground">── X-RAY ──</SelectItem>
                    {radiologyProcedures.filter(p => p.category === 'X-Ray').map(proc => (
                      <SelectItem key={proc.name} value={proc.name}>{proc.name}</SelectItem>
                    ))}
                    <SelectItem disabled value="us-header" className="font-bold text-xs text-muted-foreground">── ULTRASOUND ──</SelectItem>
                    {radiologyProcedures.filter(p => p.category === 'Ultrasound').map(proc => (
                      <SelectItem key={proc.name} value={proc.name}>{proc.name}</SelectItem>
                    ))}
                    <SelectItem disabled value="ct-header" className="font-bold text-xs text-muted-foreground">── CT SCAN ──</SelectItem>
                    {radiologyProcedures.filter(p => p.category === 'CT Scan').map(proc => (
                      <SelectItem key={proc.name} value={proc.name}>{proc.name}</SelectItem>
                    ))}
                    <SelectItem disabled value="mri-header" className="font-bold text-xs text-muted-foreground">── MRI ──</SelectItem>
                    {radiologyProcedures.filter(p => p.category === 'MRI').map(proc => (
                      <SelectItem key={proc.name} value={proc.name}>{proc.name}</SelectItem>
                    ))}
                    <SelectItem disabled value="other-header" className="font-bold text-xs text-muted-foreground">── OTHER ──</SelectItem>
                    {radiologyProcedures.filter(p => !['X-Ray', 'Ultrasound', 'CT Scan', 'MRI'].includes(p.category)).map(proc => (
                      <SelectItem key={proc.name} value={proc.name}>{proc.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newRadiology.category && (
                  <div className="flex gap-2 text-xs">
                    <Badge variant="outline">{newRadiology.category}</Badge>
                    <Badge variant="outline">{newRadiology.bodyPart}</Badge>
                  </div>
                )}
              </div>

              {/* Priority and Contrast */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Priority</Label>
                  <Select value={newRadiology.priority} onValueChange={(v) => setNewRadiology({ ...newRadiology, priority: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine"><Badge className="bg-blue-100 text-blue-800">Routine</Badge></SelectItem>
                      <SelectItem value="Urgent"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge></SelectItem>
                      <SelectItem value="STAT"><Badge className="bg-red-100 text-red-800">STAT</Badge></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Contrast Required?</Label>
                  <Select 
                    value={newRadiology.contrastRequired ? "yes" : "no"} 
                    onValueChange={(v) => setNewRadiology({ ...newRadiology, contrastRequired: v === "yes" })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes - With Contrast</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Clinical Indication */}
              <div className="space-y-2">
                <Label>Clinical Indication / Reason *</Label>
                <Textarea 
                  value={newRadiology.clinicalIndication}
                  onChange={(e) => setNewRadiology({ ...newRadiology, clinicalIndication: e.target.value })}
                  placeholder="Reason for imaging, clinical findings, suspected diagnosis..."
                  rows={3}
                />
              </div>

              {/* Special Instructions */}
              <div className="space-y-2">
                <Label>Special Instructions</Label>
                <Textarea 
                  value={newRadiology.specialInstructions}
                  onChange={(e) => setNewRadiology({ ...newRadiology, specialInstructions: e.target.value })}
                  placeholder="Any special requirements, patient preparation, or notes for radiologist..."
                  rows={2}
                />
              </div>

              {newRadiology.contrastRequired && (
                <div className="p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm text-amber-700 dark:text-amber-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Patient will need kidney function test before contrast administration
                  </p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddRadiology(false)}>Cancel</Button>
              <Button 
                onClick={addRadiologyOrder}
                disabled={!newRadiology.procedure || !newRadiology.clinicalIndication}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <ScanLine className="h-4 w-4 mr-2" />
                Add to Order
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Add Referral Dialog */}
        <Dialog open={showAddReferral} onOpenChange={setShowAddReferral}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Send className="h-5 w-5 text-teal-500" />
                Create Referral
              </DialogTitle>
              <DialogDescription>
                Refer {currentPatient?.name} to a specialist or facility
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 py-2">
              {/* Specialty and Facility */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Specialty *</Label>
                  <Select value={newReferral.specialty} onValueChange={(v) => setNewReferral({ ...newReferral, specialty: v })}>
                    <SelectTrigger><SelectValue placeholder="Select specialty" /></SelectTrigger>
                    <SelectContent className="max-h-[250px]">
                      {referralSpecialties.map(spec => (
                        <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Urgency</Label>
                  <Select value={newReferral.urgency} onValueChange={(v) => setNewReferral({ ...newReferral, urgency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Routine"><Badge className="bg-blue-100 text-blue-800">Routine</Badge></SelectItem>
                      <SelectItem value="Urgent"><Badge className="bg-amber-100 text-amber-800">Urgent</Badge></SelectItem>
                      <SelectItem value="Emergency"><Badge className="bg-red-100 text-red-800">Emergency</Badge></SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Facility Selection */}
              <div className="space-y-2">
                <Label>Referral Facility *</Label>
                <Select 
                  value={newReferral.facility} 
                  onValueChange={(v) => {
                    const fac = referralFacilities.find(f => f.name === v);
                    setNewReferral({ ...newReferral, facility: v, facilityType: fac?.type || "" });
                  }}
                >
                  <SelectTrigger><SelectValue placeholder="Select facility" /></SelectTrigger>
                  <SelectContent className="max-h-[250px]">
                    <SelectItem disabled value="internal-header" className="font-bold text-xs text-muted-foreground">── INTERNAL (NPA) ──</SelectItem>
                    {referralFacilities.filter(f => f.type === 'Internal').map(fac => (
                      <SelectItem key={fac.name} value={fac.name}>{fac.name}</SelectItem>
                    ))}
                    <SelectItem disabled value="external-header" className="font-bold text-xs text-muted-foreground">── EXTERNAL ──</SelectItem>
                    {referralFacilities.filter(f => f.type === 'External').map(fac => (
                      <SelectItem key={fac.name} value={fac.name}>{fac.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {newReferral.facilityType && (
                  <Badge variant="outline" className={newReferral.facilityType === 'External' ? 'bg-orange-100 text-orange-800' : 'bg-teal-100 text-teal-800'}>
                    {newReferral.facilityType} Referral
                  </Badge>
                )}
              </div>

              {/* Reason for Referral */}
              <div className="space-y-2">
                <Label>Reason for Referral *</Label>
                <Select value={newReferral.reason} onValueChange={(v) => setNewReferral({ ...newReferral, reason: v })}>
                  <SelectTrigger><SelectValue placeholder="Select reason" /></SelectTrigger>
                  <SelectContent>
                    {referralReasons.map(reason => (
                      <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clinical Summary */}
              <div className="space-y-2">
                <Label>Clinical Summary</Label>
                <Textarea 
                  value={newReferral.clinicalSummary}
                  onChange={(e) => setNewReferral({ ...newReferral, clinicalSummary: e.target.value })}
                  placeholder="Brief summary of patient's condition, relevant history, and reason for referral..."
                  rows={3}
                />
              </div>

              {/* Contact Information (Optional) */}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Contact Person (Optional)</Label>
                  <Input 
                    value={newReferral.contactPerson}
                    onChange={(e) => setNewReferral({ ...newReferral, contactPerson: e.target.value })}
                    placeholder="Dr. / Nurse name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Contact Phone (Optional)</Label>
                  <Input 
                    value={newReferral.contactPhone}
                    onChange={(e) => setNewReferral({ ...newReferral, contactPhone: e.target.value })}
                    placeholder="e.g., 08012345678"
                  />
                </div>
              </div>

              {newReferral.urgency === 'Emergency' && (
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4" />
                    Emergency referrals require immediate coordination with the receiving facility
                  </p>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowAddReferral(false)}>Cancel</Button>
              <Button 
                onClick={addReferral}
                disabled={!newReferral.specialty || !newReferral.facility || !newReferral.reason}
                className="bg-teal-600 hover:bg-teal-700"
              >
                <Send className="h-4 w-4 mr-2" />
                Add Referral
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <AlertDialog open={showEndDialog} onOpenChange={setShowEndDialog}>
          <AlertDialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <AlertDialogHeader><AlertDialogTitle>End Consultation Session?</AlertDialogTitle><AlertDialogDescription>Are you sure you want to end the consultation session with {currentPatient?.name}? The session data will be saved and you will return to the room queue.</AlertDialogDescription></AlertDialogHeader>
            <div className="space-y-4 my-4">
              <div className="space-y-3">
                <div className="flex items-center space-x-2"><input type="checkbox" id="followUp" checked={followUpRequired} onChange={(e) => setFollowUpRequired(e.target.checked)} className="rounded border-gray-300" /><label htmlFor="followUp" className="text-sm font-medium">Schedule follow-up appointment</label></div>
                {followUpRequired && (<div className="grid gap-3 md:grid-cols-2"><div className="space-y-2"><label className="text-sm font-medium">Follow-up Date</label><Input type="date" value={followUpDate} onChange={(e) => setFollowUpDate(e.target.value)} min={new Date().toISOString().split("T")[0]} /></div><div className="space-y-2"><label className="text-sm font-medium">Reason</label><Input value={followUpReason} onChange={(e) => setFollowUpReason(e.target.value)} placeholder="e.g., Review lab results" /></div></div>)}
              </div>
              <div className="bg-muted/50 p-3 rounded-md"><h4 className="text-sm font-medium mb-2">Session Summary</h4><div className="text-xs text-muted-foreground space-y-1"><div>Patient: {currentPatient?.name}</div><div>Duration: {sessionDuration} min</div><div>Room: {room?.name}</div><div>Prescriptions: {prescriptions.length}</div><div>Lab Orders: {labOrders.length}</div><div>Radiology Orders: {radiologyOrders.length}</div><div>Nursing Orders: {nursingOrders.length}</div><div>Referrals: {referrals.length}</div>{followUpRequired && <div>Follow-up: {followUpDate} - {followUpReason}</div>}</div></div>
            </div>
            <AlertDialogFooter><AlertDialogCancel disabled={isEnding}>Cancel</AlertDialogCancel><AlertDialogAction onClick={confirmEndSession} disabled={isEnding}>{isEnding ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Ending Session...</> : "End Session & Return to Queue"}</AlertDialogAction></AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Room Queue Dialog */}
        <Dialog open={showRoomQueueDialog} onOpenChange={setShowRoomQueueDialog}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Users className="h-5 w-5 text-emerald-500" />
                Room Queue - {room?.name || 'Consultation Room'}
              </DialogTitle>
              <DialogDescription>
                Patients waiting in queue for this room ({patients.length} {patients.length === 1 ? 'patient' : 'patients'})
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4 mt-4">
              {patients.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Users className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p className="text-lg font-medium">No patients in queue</p>
                  <p className="text-sm">The queue is currently empty for this room.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {patients.map((patient, index) => {
                    const priorityColor = 
                      patient.priority === 'Emergency' ? 'border-rose-500/50 text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20' :
                      patient.priority === 'High' ? 'border-orange-500/50 text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-900/20' :
                      patient.priority === 'Medium' ? 'border-amber-500/50 text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20' :
                      'border-gray-500/50 text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-gray-900/20';
                    
                    const isCurrentPatient = currentPatient?.id === patient.id;
                    
                    return (
                      <div
                        key={patient.id}
                        className={`p-4 rounded-lg border-2 transition-all ${
                          isCurrentPatient
                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                            : 'border-border hover:border-emerald-300 hover:bg-muted/50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex items-start gap-4 flex-1">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold text-lg ${
                              isCurrentPatient
                                ? 'bg-gradient-to-br from-emerald-500 to-teal-500'
                                : 'bg-gradient-to-br from-blue-500 to-cyan-500'
                            }`}>
                              {patient.name.split(' ').map(n => n[0]).join('').substring(0, 2)}
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <h4 className="font-semibold text-lg">{patient.name}</h4>
                                {isCurrentPatient && (
                                  <Badge variant="outline" className="bg-emerald-500 text-white border-emerald-600">
                                    In Consultation
                                  </Badge>
                                )}
                                <Badge variant="outline" className={priorityColor}>
                                  {patient.priority}
                                </Badge>
                              </div>
                              <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm text-muted-foreground mb-2">
                                <div>
                                  <span className="font-medium">Patient ID:</span> {patient.patientId}
                                </div>
                                <div>
                                  <span className="font-medium">Age:</span> {patient.age} years
                                </div>
                                <div>
                                  <span className="font-medium">Gender:</span> {patient.gender}
                                </div>
                                <div>
                                  <span className="font-medium">Wait Time:</span>{' '}
                                  <span className="text-amber-600 dark:text-amber-400 font-medium">
                                    {patient.waitTime} min
                                  </span>
                                </div>
                              </div>
                              {patient.vitals && (
                                <div className="mt-2 flex items-center gap-4 text-xs text-muted-foreground">
                                  {patient.vitals.temperature && (
                                    <span className="flex items-center gap-1">
                                      <Thermometer className="h-3 w-3" />
                                      Temp: {patient.vitals.temperature}°C
                                    </span>
                                  )}
                                  {patient.vitals.bloodPressure && (
                                    <span className="flex items-center gap-1">
                                      <Heart className="h-3 w-3" />
                                      BP: {patient.vitals.bloodPressure}
                                    </span>
                                  )}
                                  {patient.vitals.heartRate && (
                                    <span className="flex items-center gap-1">
                                      <Activity className="h-3 w-3" />
                                      HR: {patient.vitals.heartRate} bpm
                                    </span>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <div className="text-right">
                              <div className="text-xs text-muted-foreground mb-1">Position</div>
                              <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
                                #{index + 1}
                              </div>
                            </div>
                            {!isCurrentPatient && (
                              <Button
                                size="sm"
                                onClick={() => {
                                  setShowRoomQueueDialog(false);
                                  handleStartSession(patient);
                                }}
                                className="bg-emerald-500 hover:bg-emerald-600 text-white"
                              >
                                <Stethoscope className="h-4 w-4 mr-1" />
                                Start
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowRoomQueueDialog(false)}>
                Close
              </Button>
              <Button
                type="button"
                disabled={isRefreshingQueue}
                onClick={async (e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  // Refresh only queue data, not the entire page
                  try {
                    await refreshQueueData();
                    toast.success('Queue refreshed');
                  } catch (error) {
                    // Error already handled in refreshQueueData
                  }
                }}
                variant="default"
              >
                <RefreshCw className={`h-4 w-4 mr-2 ${isRefreshingQueue ? 'animate-spin' : ''}`} />
                {isRefreshingQueue ? 'Refreshing...' : 'Refresh Queue'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Session Viewer Dialog */}
        <Dialog open={showSessionViewer} onOpenChange={setShowSessionViewer}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            {selectedSession && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="flex items-center gap-3">
                        <FileText className="h-5 w-5 text-emerald-500" />
                        Consultation Report
                        <Badge variant="outline" className="bg-emerald-50 text-emerald-700">
                          {selectedSession.id}
                        </Badge>
                      </DialogTitle>
                      <DialogDescription>
                        {selectedSession.date} • {selectedSession.time} • {selectedSession.clinic} Clinic
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => downloadSessionPDF(selectedSession)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => printSession(selectedSession)}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Header Info */}
                  <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg">
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">PATIENT INFORMATION</h4>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <User className="h-4 w-4 text-muted-foreground" />
                          <span className="font-medium">{selectedSession.patient.name}</span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          ID: {selectedSession.patient.patientId} • {selectedSession.patient.age}y • {selectedSession.patient.gender}
                        </div>
                      </div>
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-muted-foreground mb-2">CONSULTATION DETAILS</h4>
                      <div className="space-y-1 text-sm">
                        <div><strong>Doctor:</strong> {selectedSession.doctor}</div>
                        <div><strong>Specialty:</strong> {selectedSession.doctorSpecialty}</div>
                        <div><strong>Duration:</strong> {selectedSession.duration}</div>
                        <div><strong>Room:</strong> {selectedSession.room}</div>
                      </div>
                    </div>
                  </div>

                  {/* Vitals */}
                  <div>
                    <h4 className="text-sm font-semibold text-blue-600 mb-2">VITAL SIGNS</h4>
                    <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
                      {Object.entries(selectedSession.vitals).map(([key, value]: [string, unknown]) => (
                        <div key={key} className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-center border border-blue-200 dark:border-blue-800">
                          <div className="text-xs text-muted-foreground capitalize">{key.replace(/([A-Z])/g, ' $1')}</div>
                          <div className="font-medium">{String(value)}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Medical Notes */}
                  <div className="space-y-4">
                    <h4 className="text-sm font-semibold text-amber-600">CLINICAL NOTES</h4>
                    
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">History of Present Illness</label>
                      <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{selectedSession.medicalNotes.historyOfPresentIllness}</p>
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Physical Examination</label>
                      <p className="mt-1 p-3 bg-muted/30 rounded-lg text-sm">{selectedSession.medicalNotes.physicalExamination}</p>
                    </div>
                    
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Diagnosis</label>
                        <p className="mt-1 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg text-sm border border-amber-200 dark:border-amber-800 font-medium">
                          {selectedSession.medicalNotes.diagnosis}
                        </p>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-muted-foreground">Assessment</label>
                        <p className="mt-1 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg text-sm border border-blue-200 dark:border-blue-800">
                          {selectedSession.medicalNotes.assessment}
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <label className="text-xs font-medium text-muted-foreground">Treatment Plan</label>
                      <p className="mt-1 p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg text-sm border border-emerald-200 dark:border-emerald-800 whitespace-pre-line">
                        {selectedSession.medicalNotes.plan}
                      </p>
                    </div>
                  </div>

                  {/* Prescriptions */}
                  {selectedSession.prescriptions.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-violet-600 mb-2 flex items-center gap-2">
                        <Pill className="h-4 w-4" />
                        PRESCRIPTIONS
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-violet-50 dark:bg-violet-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Medication</th>
                              <th className="px-3 py-2 text-left font-medium">Dosage</th>
                              <th className="px-3 py-2 text-left font-medium">Frequency</th>
                              <th className="px-3 py-2 text-left font-medium">Duration</th>
                              <th className="px-3 py-2 text-center font-medium">Qty</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {selectedSession.prescriptions.map((rx: { medication: string; dosage: string; frequency: string; duration: string; quantity: number }, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 font-medium">{rx.medication}</td>
                                <td className="px-3 py-2">{rx.dosage}</td>
                                <td className="px-3 py-2">{rx.frequency}</td>
                                <td className="px-3 py-2">{rx.duration}</td>
                                <td className="px-3 py-2 text-center">{rx.quantity}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Lab Orders */}
                  {selectedSession.labOrders.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-amber-600 mb-2 flex items-center gap-2">
                        <TestTube className="h-4 w-4" />
                        LABORATORY ORDERS
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-amber-50 dark:bg-amber-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Test</th>
                              <th className="px-3 py-2 text-left font-medium">Priority</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2 text-left font-medium">Result</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {selectedSession.labOrders.map((lab: { test: string; status: string; priority?: string }, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 font-medium">{lab.test}</td>
                                <td className="px-3 py-2">{lab.priority}</td>
                                <td className="px-3 py-2">
                                  <Badge className="bg-emerald-100 text-emerald-800">{lab.status}</Badge>
                                </td>
                                <td className="px-3 py-2 text-sm">{(lab as { result?: string }).result || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Radiology Orders */}
                  {selectedSession.radiologyOrders.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-indigo-600 mb-2 flex items-center gap-2">
                        <ScanLine className="h-4 w-4" />
                        RADIOLOGY ORDERS
                      </h4>
                      <div className="border rounded-lg overflow-hidden">
                        <table className="w-full text-sm">
                          <thead className="bg-indigo-50 dark:bg-indigo-900/20">
                            <tr>
                              <th className="px-3 py-2 text-left font-medium">Procedure</th>
                              <th className="px-3 py-2 text-left font-medium">Priority</th>
                              <th className="px-3 py-2 text-left font-medium">Status</th>
                              <th className="px-3 py-2 text-left font-medium">Finding</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y">
                            {selectedSession.radiologyOrders.map((img: { procedure: string; priority?: string; status: string; finding?: string }, index: number) => (
                              <tr key={index}>
                                <td className="px-3 py-2 font-medium">{img.procedure}</td>
                                <td className="px-3 py-2">{img.priority || '-'}</td>
                                <td className="px-3 py-2">
                                  <Badge className="bg-emerald-100 text-emerald-800">{img.status}</Badge>
                                </td>
                                <td className="px-3 py-2 text-sm">{img.finding || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  {/* Nursing Orders */}
                  {selectedSession.nursingOrders.length > 0 && (
                    <div>
                      <h4 className="text-sm font-semibold text-cyan-600 mb-2 flex items-center gap-2">
                        <Syringe className="h-4 w-4" />
                        NURSING ORDERS
                      </h4>
                      <div className="space-y-2">
                        {selectedSession.nursingOrders.map((no: { type: string; instructions: string; status?: string }, index: number) => (
                          <div key={index} className="p-3 bg-cyan-50 dark:bg-cyan-900/20 rounded-lg border border-cyan-200 dark:border-cyan-800">
                            <div className="font-medium">{no.type}</div>
                            <div className="text-sm text-muted-foreground">{no.instructions}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Follow-up */}
                  {selectedSession.followUp && (
                    <div>
                      <h4 className="text-sm font-semibold text-blue-600 mb-2 flex items-center gap-2">
                        <Calendar className="h-4 w-4" />
                        FOLLOW-UP APPOINTMENT
                      </h4>
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                        <div className="font-medium">{selectedSession.followUp.date}</div>
                        <div className="text-sm text-muted-foreground">{selectedSession.followUp.reason}</div>
                      </div>
                    </div>
                  )}

                  {/* Outcome */}
                  <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    <h4 className="text-sm font-semibold text-emerald-600 mb-1">SESSION OUTCOME</h4>
                    <p className="text-sm">{selectedSession.outcome}</p>
                  </div>

                  {/* Footer */}
                  <div className="border-t pt-4 text-xs text-muted-foreground">
                    <div className="flex justify-between">
                      <span>Generated: {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}</span>
                      <span>Document ID: {selectedSession.id}</span>
                    </div>
                    <div className="mt-2 text-center">
                      <strong>Nigerian Ports Authority</strong> • Medical Services Department
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Lab Result Viewer Dialog */}
        <Dialog open={showLabResultViewer} onOpenChange={setShowLabResultViewer}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            {selectedLabResult && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <DialogTitle className="flex items-center gap-3">
                        <TestTube className="h-5 w-5 text-amber-500" />
                        Laboratory Report
                        <Badge variant="outline" className="bg-amber-50 text-amber-700">
                          {selectedLabResult.id}
                        </Badge>
                        {selectedLabResult.criticalValue && (
                          <Badge className="bg-red-600 text-white">
                            <AlertTriangle className="h-3 w-3 mr-1" />
                            Critical Value
                          </Badge>
                        )}
                      </DialogTitle>
                      <DialogDescription>
                        {selectedLabResult.date} • {selectedLabResult.category} • {selectedLabResult.test}
                      </DialogDescription>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" size="sm" onClick={() => downloadLabResultPDF(selectedLabResult)}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => printLabResult(selectedLabResult)}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                </DialogHeader>

                <div className="space-y-6 py-4">
                  {/* Header - Test Info */}
                  <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                    <div className="grid md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">TEST INFORMATION</h4>
                        <div className="space-y-1 text-sm">
                          <div><strong>Test Name:</strong> {selectedLabResult.test}</div>
                          <div><strong>Category:</strong> {selectedLabResult.category}</div>
                          <div><strong>Specimen Type:</strong> {selectedLabResult.specimenType}</div>
                          <div className="flex items-center gap-2">
                            <strong>Overall Status:</strong>
                            <Badge className={selectedLabResult.status === 'Normal' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}>
                              {selectedLabResult.status}
                            </Badge>
                          </div>
                        </div>
                      </div>
                      <div>
                        <h4 className="text-sm font-semibold text-amber-700 dark:text-amber-400 mb-2">PROCESSING DETAILS</h4>
                        <div className="space-y-1 text-sm">
                          <div><strong>Ordered By:</strong> {selectedLabResult.orderedBy}</div>
                          <div><strong>Collected:</strong> {selectedLabResult.collectedAt}</div>
                          <div><strong>Reported:</strong> {selectedLabResult.reportedAt}</div>
                          <div><strong>Performed By:</strong> {selectedLabResult.performedBy}</div>
                          <div><strong>Verified By:</strong> {selectedLabResult.verifiedBy}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Test Parameters */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Activity className="h-4 w-4" />
                      TEST RESULTS
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-3 text-left font-semibold">Parameter</th>
                            <th className="px-4 py-3 text-center font-semibold">Result</th>
                            <th className="px-4 py-3 text-center font-semibold">Unit</th>
                            <th className="px-4 py-3 text-center font-semibold">Reference Range</th>
                            <th className="px-4 py-3 text-center font-semibold">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedLabResult.parameters.map((param: { name: string; value: string; unit: string; status: string; referenceRange?: string; normalRange?: string }, index: number) => (
                            <tr key={index} className={param.status !== 'Normal' ? 'bg-red-50/50 dark:bg-red-900/10' : ''}>
                              <td className="px-4 py-3 font-medium">{param.name}</td>
                              <td className={`px-4 py-3 text-center font-bold ${param.status === 'Abnormal' ? 'text-red-600' : param.status === 'Borderline' ? 'text-amber-600' : ''}`}>
                                {param.value}
                              </td>
                              <td className="px-4 py-3 text-center text-muted-foreground">{param.unit}</td>
                              <td className="px-4 py-3 text-center text-muted-foreground">{param.normalRange || param.referenceRange || '-'}</td>
                              <td className="px-4 py-3 text-center">
                                <Badge className={getParameterStatusColor(param.status)}>
                                  {param.status}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Summary Result */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">SUMMARY</h4>
                    <p className="p-3 bg-muted/30 rounded-lg border text-sm font-medium">
                      {selectedLabResult.result}
                    </p>
                  </div>

                  {/* Interpretation */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">INTERPRETATION</h4>
                    <p className={`p-4 rounded-lg border text-sm ${selectedLabResult.status === 'Abnormal' ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800' : 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800'}`}>
                      {selectedLabResult.interpretation}
                    </p>
                  </div>

                  {/* Clinical Notes */}
                  {selectedLabResult.clinicalNotes && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">CLINICAL NOTES</h4>
                      <p className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                        {selectedLabResult.clinicalNotes}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="border-t pt-4">
                    <div className="grid md:grid-cols-3 gap-4 text-xs text-muted-foreground">
                      <div>
                        <strong>Performed By:</strong><br />
                        {selectedLabResult.performedBy}
                      </div>
                      <div>
                        <strong>Verified By:</strong><br />
                        {selectedLabResult.verifiedBy}
                      </div>
                      <div className="text-right">
                        <strong>Report Generated:</strong><br />
                        {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
                      </div>
                    </div>
                    <div className="mt-4 text-center text-xs text-muted-foreground">
                      <strong>Nigerian Ports Authority</strong> • Medical Laboratory Services<br />
                      Document ID: {selectedLabResult.id}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Prescription Viewer Modal */}
        <Dialog open={showPrescriptionViewer} onOpenChange={setShowPrescriptionViewer}>
          <DialogContent className="w-[95vw] sm:max-w-[1000px] max-h-[90vh] overflow-y-auto">
            {selectedPrescription && (
              <>
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle className="flex items-center gap-2">
                      <Pill className="h-5 w-5 text-violet-500" />
                      Prescription Details
                      <Badge variant="outline" className="ml-2">
                        {selectedPrescription.prescriptionId}
                      </Badge>
                    </DialogTitle>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => {}}>
                        <Download className="h-4 w-4 mr-1" />
                        Download
                      </Button>
                      <Button variant="outline" size="sm" onClick={() => {}}>
                        <Printer className="h-4 w-4 mr-1" />
                        Print
                      </Button>
                    </div>
                  </div>
                  <DialogDescription>
                    {selectedPrescription.date} • {selectedPrescription.doctor} • {selectedPrescription.diagnosis}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-6 mt-4">
                  {/* Prescription Information */}
                  <div>
                    <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">PRESCRIPTION INFORMATION</h4>
                    <div className="grid md:grid-cols-2 gap-4 p-4 bg-muted/30 rounded-lg border">
                      <div>
                        <div><strong>Prescription ID:</strong> {selectedPrescription.prescriptionId}</div>
                        <div><strong>Date:</strong> {selectedPrescription.date}</div>
                        <div><strong>Doctor:</strong> {selectedPrescription.doctor}</div>
                      </div>
                      <div>
                        <div><strong>Diagnosis:</strong> {selectedPrescription.diagnosis}</div>
                        <div className="flex items-center gap-2 mt-2">
                          <strong>Status:</strong>
                          <Badge 
                            variant="outline" 
                            className={
                              selectedPrescription.status === 'dispensed' 
                                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : selectedPrescription.status === 'partially_dispensed'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400'
                                : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300'
                            }
                          >
                            {selectedPrescription.status === 'dispensed' ? 'Dispensed' : 
                             selectedPrescription.status === 'partially_dispensed' ? 'Partially Dispensed' : 
                             'Pending'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Medications */}
                  <div>
                    <h4 className="text-sm font-semibold text-violet-600 mb-3 flex items-center gap-2">
                      <Pill className="h-4 w-4" />
                      PRESCRIBED MEDICATIONS
                    </h4>
                    <div className="border rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-muted/50">
                          <tr>
                            <th className="px-4 py-2 text-left font-medium">Medication</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {selectedPrescription.medications.map((med: string, index: number) => (
                            <tr key={index} className="hover:bg-muted/30">
                              <td className="px-4 py-3">
                                <Badge variant="outline" className="text-sm">
                                  {med}
                                </Badge>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Notes */}
                  {selectedPrescription.notes && (
                    <div>
                      <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">NOTES</h4>
                      <p className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800 text-sm">
                        {selectedPrescription.notes}
                      </p>
                    </div>
                  )}

                  {/* Footer */}
                  <div className="border-t pt-4">
                    <div className="text-center text-xs text-muted-foreground">
                      <strong>Nigerian Ports Authority</strong> • Medical Services<br />
                      Document ID: {selectedPrescription.id}
                    </div>
                  </div>
                </div>
              </>
            )}
          </DialogContent>
        </Dialog>

        {/* Edit Medical History Dialog */}
        <Dialog open={showEditMedicalHistory} onOpenChange={setShowEditMedicalHistory}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-blue-500" />
                Edit Medical History
              </DialogTitle>
              <DialogDescription>
                Update surgical history, family history, and social history for {currentPatient?.name}
              </DialogDescription>
            </DialogHeader>
            
            {loadingMedicalHistory ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
                <span className="ml-3 text-muted-foreground">Loading medical history...</span>
              </div>
            ) : (
              <div className="space-y-6 py-4">
                {/* Allergies */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Allergies</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        const newAllergy = prompt('Enter allergy name:');
                        if (newAllergy && newAllergy.trim()) {
                          setMedicalHistory(prev => ({
                            ...prev,
                            allergies: [...prev.allergies, newAllergy.trim()],
                          }));
                        }
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Allergy
                    </Button>
                  </div>
                  {medicalHistory.allergies.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No allergies recorded</p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {medicalHistory.allergies.map((allergy, index) => (
                        <Badge key={index} className="bg-red-600 text-white hover:bg-red-700 pr-1">
                          <AlertTriangle className="h-3 w-3 mr-1" />
                          {allergy}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setMedicalHistory(prev => ({
                                ...prev,
                                allergies: prev.allergies.filter((_, i) => i !== index),
                              }));
                            }}
                            className="h-4 w-4 p-0 ml-1 hover:bg-red-800"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Chronic Conditions (Diagnoses) */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Chronic Conditions</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMedicalHistory(prev => ({
                          ...prev,
                          diagnoses: [...prev.diagnoses, { name: '', code: '', status: 'Active', diagnosedDate: '' }],
                        }));
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Condition
                    </Button>
                  </div>
                  {medicalHistory.diagnoses.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No chronic conditions recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {medicalHistory.diagnoses.map((diagnosis, index) => (
                        <div key={index} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Condition #{index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  diagnoses: prev.diagnoses.filter((_, i) => i !== index),
                                }));
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">ICD-10 Code</Label>
                              <Input
                                value={diagnosis.code || ''}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.diagnoses];
                                  updated[index].code = e.target.value;
                                  setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                                }}
                                placeholder="e.g., I10"
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Status</Label>
                              <Select
                                value={diagnosis.status}
                                onValueChange={(value) => {
                                  const updated = [...medicalHistory.diagnoses];
                                  updated[index].status = value;
                                  setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Active">Active</SelectItem>
                                  <SelectItem value="Resolved">Resolved</SelectItem>
                                  <SelectItem value="Controlled">Controlled</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Condition Name</Label>
                            <Input
                              value={diagnosis.name}
                              onChange={(e) => {
                                const updated = [...medicalHistory.diagnoses];
                                updated[index].name = e.target.value;
                                setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                              }}
                              placeholder="e.g., Essential Hypertension"
                              className="h-8 text-xs"
                            />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">Diagnosed Date</Label>
                            <Input
                              type="date"
                              value={diagnosis.diagnosedDate || ''}
                              onChange={(e) => {
                                const updated = [...medicalHistory.diagnoses];
                                updated[index].diagnosedDate = e.target.value;
                                setMedicalHistory(prev => ({ ...prev, diagnoses: updated }));
                              }}
                              className="h-8 text-xs"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Surgical History */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Surgical History</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMedicalHistory(prev => ({
                          ...prev,
                          surgicalHistory: [...prev.surgicalHistory, { procedure: '', date: '', hospital: '' }],
                        }));
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Surgery
                    </Button>
                  </div>
                  {medicalHistory.surgicalHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No surgical history recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {medicalHistory.surgicalHistory.map((surgery, index) => (
                        <div key={index} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Surgery #{index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  surgicalHistory: prev.surgicalHistory.filter((_, i) => i !== index),
                                }));
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Procedure</Label>
                              <Input
                                value={surgery.procedure}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.surgicalHistory];
                                  updated[index].procedure = e.target.value;
                                  setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                                }}
                                placeholder="e.g., Appendectomy"
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Date</Label>
                              <Input
                                type="date"
                                value={surgery.date}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.surgicalHistory];
                                  updated[index].date = e.target.value;
                                  setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                                }}
                                className="h-8 text-xs"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Hospital</Label>
                              <Input
                                value={surgery.hospital}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.surgicalHistory];
                                  updated[index].hospital = e.target.value;
                                  setMedicalHistory(prev => ({ ...prev, surgicalHistory: updated }));
                                }}
                                placeholder="Hospital name"
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Family History */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-medium">Family History</Label>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setMedicalHistory(prev => ({
                          ...prev,
                          familyHistory: [...prev.familyHistory, { relation: '', condition: '' }],
                        }));
                      }}
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add Family Member
                    </Button>
                  </div>
                  {medicalHistory.familyHistory.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No family history recorded</p>
                  ) : (
                    <div className="space-y-2">
                      {medicalHistory.familyHistory.map((family, index) => (
                        <div key={index} className="p-3 border rounded-lg space-y-2">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium text-muted-foreground">Family Member #{index + 1}</span>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setMedicalHistory(prev => ({
                                  ...prev,
                                  familyHistory: prev.familyHistory.filter((_, i) => i !== index),
                                }));
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                              <Label className="text-xs">Relation</Label>
                              <Select
                                value={family.relation}
                                onValueChange={(value) => {
                                  const updated = [...medicalHistory.familyHistory];
                                  updated[index].relation = value;
                                  setMedicalHistory(prev => ({ ...prev, familyHistory: updated }));
                                }}
                              >
                                <SelectTrigger className="h-8 text-xs">
                                  <SelectValue placeholder="Select relation" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Father">Father</SelectItem>
                                  <SelectItem value="Mother">Mother</SelectItem>
                                  <SelectItem value="Sibling">Sibling</SelectItem>
                                  <SelectItem value="Grandfather">Grandfather</SelectItem>
                                  <SelectItem value="Grandmother">Grandmother</SelectItem>
                                  <SelectItem value="Uncle">Uncle</SelectItem>
                                  <SelectItem value="Aunt">Aunt</SelectItem>
                                  <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs">Condition</Label>
                              <Input
                                value={family.condition}
                                onChange={(e) => {
                                  const updated = [...medicalHistory.familyHistory];
                                  updated[index].condition = e.target.value;
                                  setMedicalHistory(prev => ({ ...prev, familyHistory: updated }));
                                }}
                                placeholder="e.g., Hypertension, Type 2 Diabetes"
                                className="h-8 text-xs"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <Separator />

                {/* Social History */}
                <div className="space-y-3">
                  <Label className="text-sm font-medium">Social History</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label className="text-xs">Smoking</Label>
                      <Select
                        value={medicalHistory.socialHistory.smoking}
                        onValueChange={(value) => {
                          setMedicalHistory(prev => ({
                            ...prev,
                            socialHistory: { ...prev.socialHistory, smoking: value },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Never">Never</SelectItem>
                          <SelectItem value="Former">Former</SelectItem>
                          <SelectItem value="Current">Current</SelectItem>
                          <SelectItem value="Occasional">Occasional</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Alcohol</Label>
                      <Select
                        value={medicalHistory.socialHistory.alcohol}
                        onValueChange={(value) => {
                          setMedicalHistory(prev => ({
                            ...prev,
                            socialHistory: { ...prev.socialHistory, alcohol: value },
                          }));
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Select" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Never">Never</SelectItem>
                          <SelectItem value="Occasional">Occasional (social)</SelectItem>
                          <SelectItem value="Regular">Regular</SelectItem>
                          <SelectItem value="Heavy">Heavy</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Exercise</Label>
                      <Input
                        value={medicalHistory.socialHistory.exercise}
                        onChange={(e) => {
                          setMedicalHistory(prev => ({
                            ...prev,
                            socialHistory: { ...prev.socialHistory, exercise: e.target.value },
                          }));
                        }}
                        placeholder="e.g., 2-3 times per week"
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Occupation</Label>
                      <Input
                        value={medicalHistory.socialHistory.occupation}
                        onChange={(e) => {
                          setMedicalHistory(prev => ({
                            ...prev,
                            socialHistory: { ...prev.socialHistory, occupation: e.target.value },
                          }));
                        }}
                        placeholder="e.g., Senior Engineer - NPA"
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEditMedicalHistory(false)}>
                Cancel
              </Button>
              <Button 
                onClick={async () => {
                  if (!currentPatient) return;
                  setLoadingMedicalHistory(true);
                  try {
                    // Get numeric patient ID
                    const patientIdStr = currentPatient.patientId || currentPatient.id;
                    let numericPatientId: number;
                    const parsedId = parseInt(patientIdStr, 10);
                    if (!isNaN(parsedId) && parsedId > 0) {
                      numericPatientId = parsedId;
                    } else {
                      const searchResult = await patientService.getPatients({ search: patientIdStr });
                      const matchedPatient = searchResult.results.find(
                        p => p.patient_id === patientIdStr || p.patient_id.toUpperCase() === patientIdStr.toUpperCase()
                      );
                      if (!matchedPatient) {
                        throw new Error(`Patient with ID "${patientIdStr}" not found`);
                      }
                      numericPatientId = matchedPatient.id;
                    }
                    
                    await patientService.updatePatientHistory(numericPatientId, {
                      allergies: medicalHistory.allergies,
                      diagnoses: medicalHistory.diagnoses,
                      surgical_history: medicalHistory.surgicalHistory,
                      family_history: medicalHistory.familyHistory,
                      social_history: medicalHistory.socialHistory,
                    });
                    
                    toast.success('Medical history updated successfully');
                    setShowEditMedicalHistory(false);
                  } catch (err: any) {
                    console.error('Error updating medical history:', err);
                    toast.error(err.message || 'Failed to update medical history');
                  } finally {
                    setLoadingMedicalHistory(false);
                  }
                }}
                disabled={loadingMedicalHistory}
              >
                {loadingMedicalHistory ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </>
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Vitals Detail Modal */}
        <VitalsDetailModal
          isOpen={isVitalsDetailModalOpen}
          onClose={() => setIsVitalsDetailModalOpen(false)}
          vitals={selectedVital}
          patientName={currentPatient?.name || 'Patient'}
        />
      </div>
    </DashboardLayout>
  );
}

