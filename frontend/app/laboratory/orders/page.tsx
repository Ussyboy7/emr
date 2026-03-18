"use client";

import { useState, useMemo, useEffect, useCallback } from 'react';
import { StandardPagination } from '@/components/StandardPagination';
import { DashboardLayout } from '@/components/DashboardLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";
import { AdvancedDateRangeDialog } from '@/components/AdvancedDateRangeDialog';
import { labService, type LabOrder as ApiLabOrder, type LabTest as ApiLabTest } from '@/lib/services';
import { transformLabTestStatus, transformPriority, transformToBackendPriority, transformProcessingMethod, transformToBackendProcessingMethod } from '@/lib/services/transformers';
import { PatientAvatar } from "@/components/PatientAvatar";
import {
  TestTube, Search, Eye, Clock, CheckCircle2, Activity, FlaskConical, Loader2,
  Beaker, AlertTriangle, User, Calendar, FileText, Play, Stethoscope,
  ClipboardList, RefreshCw, Upload, Download, Building2, Truck, X, Droplets, Pipette, RotateCcw, XCircle, Filter
} from 'lucide-react';

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

// Safe date formatting utility
const formatDate = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Date';
    return date.toLocaleDateString();
  } catch {
    return 'Invalid Date';
  }
};

const formatTime = (dateString: string | undefined): string => {
  if (!dateString) return 'N/A';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Invalid Time';
    return date.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
  } catch {
    return 'Invalid Time';
  }
};

// Enhanced Test interface - each test is independent
interface LabTest {
  id: string;
  name: string;
  code: string;
  sampleType: 'Blood' | 'Urine' | 'Stool' | 'Sputum' | 'Swab' | 'CSF' | 'Serum' | 'Other';
  status: 'Pending' | 'Sample Collected' | 'Processing' | 'Results Ready' | 'Rejected' | 'Verified';
  processingMethod?: 'In-house' | 'Outsourced';
  outsourcedLab?: string;
  lab_number?: string;
  collectedBy?: string;
  collectedAt?: string;
  processedBy?: string;
  processedAt?: string;
  results?: Record<string, string>;
  templateNormalRange?: Record<string, any> | null;
  resultFile?: { name: string; type: string; uploadedAt: string };
  template?: string;
  rejectedBy?: string;
  rejectedAt?: string;
  verificationNotes?: string;
  notes?: string;
}

interface LabOrder {
  id: string;
  orderId: string;
  lab_number?: string;  // One Lab ID per order (BT-YY-NNNN)
  patient: {
    id: string;
    name: string;
    age: number;
    gender: string;
    personal_number?: string;
    division?: string;
    photoUrl?: string;
  };
  doctor: { id: string; name: string; specialty: string; };
  tests: LabTest[];
  priority: 'Routine' | 'Urgent' | 'STAT';
  orderedAt: string;
  clinic: string;
  clinicalNotes?: string;
}

// Helper function to transform backend order to frontend format
const transformOrder = (apiOrder: ApiLabOrder): LabOrder => {
  return {
    id: apiOrder.id.toString(),
    orderId: apiOrder.order_id,
    lab_number: (apiOrder as any).lab_number,
    patient: {
      id: apiOrder.patient.id?.toString() || '',
      name: apiOrder.patient.name || 'Unknown',
      age: apiOrder.patient.age || 0,
      gender: apiOrder.patient.gender || 'Unknown',
      personal_number: (apiOrder.patient as any).personal_number || undefined,
      division: (apiOrder.patient as any).division || undefined,
      photoUrl: (apiOrder.patient as any).photo || undefined,
    },
    doctor: {
      id: apiOrder.doctor?.id?.toString() || '',
      name: apiOrder.doctor?.name || 'Unknown',
      specialty: apiOrder.doctor?.specialty || '',
    },
    tests: (apiOrder.tests || []).map((test: ApiLabTest) => transformTest(test)),
    priority: transformPriority(apiOrder.priority) as 'Routine' | 'Urgent' | 'STAT',
    orderedAt: apiOrder.ordered_at,
    clinic: apiOrder.clinic || '',
    clinicalNotes: (() => {
      // Get clinical notes, avoiding duplication
      const notes = apiOrder.clinical_notes || '';
      // If notes contain repeated content, clean it up
      if (notes.includes('; ')) {
        const parts = notes.split('; ')
          .map(part => part.trim()) // Trim whitespace
          .filter(part => part.length > 0) // Remove empty parts
          .filter((part, index, arr) => arr.indexOf(part) === index); // Remove duplicates
        return parts.join('; ');
      }
      return notes;
    })(),
  };
};

// Helper function to transform backend test to frontend format
const transformTest = (apiTest: ApiLabTest): LabTest => {
  return {
    id: apiTest.id.toString(),
    name: apiTest.name,
    code: apiTest.code,
    sampleType: apiTest.sample_type as LabTest['sampleType'],
    status: transformLabTestStatus(apiTest.status) as LabTest['status'],
    processingMethod: apiTest.processing_method ? transformProcessingMethod(apiTest.processing_method) as 'In-house' | 'Outsourced' : undefined,
    outsourcedLab: apiTest.outsourced_lab,
    lab_number: apiTest.lab_number,
    collectedBy: apiTest.collected_by_name || apiTest.collected_by?.toString(),
    collectedAt: apiTest.collected_at,
    processedBy: apiTest.processed_by_name || apiTest.processed_by?.toString(),
    processedAt: apiTest.processed_at,
    results: apiTest.results as Record<string, string>,
    templateNormalRange: (apiTest as any).template_normal_range || null,
    resultFile: apiTest.result_file ? {
      name: typeof apiTest.result_file === 'string' ? apiTest.result_file : apiTest.result_file.name || '',
      type: typeof apiTest.result_file === 'string' ? 'application/pdf' : apiTest.result_file.type || 'application/pdf',
      uploadedAt: typeof apiTest.result_file === 'string' ? '' : apiTest.result_file.uploaded_at || '',
    } : undefined,
    template: apiTest.template?.toString(),
    rejectedBy: apiTest.rejected_by_name || apiTest.rejected_by?.toString(),
    rejectedAt: apiTest.rejected_at,
    verificationNotes: apiTest.verification_notes,
    notes: apiTest.notes,
  };
};

// Test templates for result entry
const testTemplates: Record<string, { name: string; fields: { name: string; unit: string; normalRange: string; }[] }> = {
  CBC: {
    name: 'Complete Blood Count',
    fields: [
      { name: 'WBC', unit: '×10³/μL', normalRange: '4.0-11.0' },
      { name: 'RBC', unit: '×10⁶/μL', normalRange: '4.2-5.4' },
      { name: 'Hemoglobin', unit: 'g/dL', normalRange: '13.5-17.5' },
      { name: 'Hematocrit', unit: '%', normalRange: '40-50' },
      { name: 'Platelets', unit: '×10³/μL', normalRange: '150-400' },
    ]
  },
  ESR: {
    name: 'Erythrocyte Sedimentation Rate',
    fields: [
      { name: 'ESR', unit: 'mm/hr', normalRange: '0-30' },
    ]
  },
  RETIC: {
    name: 'Reticulocyte Count',
    fields: [
      { name: 'Reticulocyte Count', unit: '%', normalRange: '0.5-2.5' },
      { name: 'Absolute Reticulocyte Count', unit: '×10⁶/μL', normalRange: '25-85' },
    ]
  },
  PLATELET: {
    name: 'Platelet Count',
    fields: [
      { name: 'Platelets', unit: '×10³/μL', normalRange: '150-450' },
    ]
  },
  COAG: {
    name: 'Coagulation Profile',
    fields: [
      { name: 'PT', unit: 'seconds', normalRange: '11-13' },
      { name: 'INR', unit: '', normalRange: '0.8-1.1' },
      { name: 'PTT', unit: 'seconds', normalRange: '25-35' },
      { name: 'Fibrinogen', unit: 'mg/dL', normalRange: '200-400' },
    ]
  },
  BT_CT: {
    name: 'Bleeding Time & Clotting Time',
    fields: [
      { name: 'Bleeding Time', unit: 'minutes', normalRange: '2-7' },
      { name: 'Clotting Time', unit: 'minutes', normalRange: '5-15' },
    ]
  },
  FBS: {
    name: 'Fasting Blood Sugar',
    fields: [
      { name: 'Glucose', unit: 'mg/dL', normalRange: '70-100' },
    ]
  },
  RBS: {
    name: 'Random Blood Sugar',
    fields: [
      { name: 'Glucose', unit: 'mg/dL', normalRange: '70-140' },
    ]
  },
  PPBS: {
    name: 'Post Prandial Blood Sugar',
    fields: [
      { name: 'Glucose', unit: 'mg/dL', normalRange: '<140' },
    ]
  },
  HBA1C: {
    name: 'Glycosylated Hemoglobin (HbA1c)',
    fields: [
      { name: 'HbA1c', unit: '%', normalRange: '<5.7' },
    ]
  },
  LIP: {
    name: 'Lipid Profile',
    fields: [
      { name: 'Total Cholesterol', unit: 'mg/dL', normalRange: '<200' },
      { name: 'LDL', unit: 'mg/dL', normalRange: '<100' },
      { name: 'HDL', unit: 'mg/dL', normalRange: '>40' },
      { name: 'Triglycerides', unit: 'mg/dL', normalRange: '<150' },
    ]
  },
  LFT: {
    name: 'Liver Function Test',
    fields: [
      { name: 'ALT', unit: 'U/L', normalRange: '7-56' },
      { name: 'AST', unit: 'U/L', normalRange: '10-40' },
      { name: 'ALP', unit: 'U/L', normalRange: '44-147' },
      { name: 'Bilirubin (Total)', unit: 'mg/dL', normalRange: '0.1-1.2' },
      { name: 'Albumin', unit: 'g/dL', normalRange: '3.5-5.0' },
    ]
  },
  CRP: {
    name: 'C-Reactive Protein',
    fields: [
      { name: 'CRP', unit: 'mg/L', normalRange: '<10' },
    ]
  },
  RA_FACTOR: {
    name: 'Rheumatoid Factor',
    fields: [
      { name: 'Rheumatoid Factor', unit: 'IU/mL', normalRange: '<15' },
    ]
  },
  TFT: {
    name: 'Thyroid Function Test',
    fields: [
      { name: 'TSH', unit: 'μIU/mL', normalRange: '0.4-4.0' },
      { name: 'T3', unit: 'ng/dL', normalRange: '60-181' },
      { name: 'T4', unit: 'μg/dL', normalRange: '4.5-11.2' },
      { name: 'Free T3', unit: 'pg/mL', normalRange: '2.0-4.4' },
      { name: 'Free T4', unit: 'ng/dL', normalRange: '0.93-1.7' },
    ]
  },
  TSH: {
    name: 'Thyroid Stimulating Hormone',
    fields: [
      { name: 'TSH', unit: 'μIU/mL', normalRange: '0.4-4.0' },
    ]
  },
  T3_T4: {
    name: 'T3 & T4',
    fields: [
      { name: 'T3', unit: 'ng/dL', normalRange: '60-181' },
      { name: 'T4', unit: 'μg/dL', normalRange: '4.5-11.2' },
      { name: 'Free T3', unit: 'pg/mL', normalRange: '2.0-4.4' },
      { name: 'Free T4', unit: 'ng/dL', normalRange: '0.93-1.7' },
    ]
  },
  RFT: {
    name: 'Renal Function Test',
    fields: [
      { name: 'Creatinine', unit: 'mg/dL', normalRange: '0.7-1.3' },
      { name: 'BUN', unit: 'mg/dL', normalRange: '7-20' },
      { name: 'eGFR', unit: 'mL/min', normalRange: '>90' },
    ]
  },
  ELEC: {
    name: 'Serum Electrolytes',
    fields: [
      { name: 'Sodium', unit: 'mmol/L', normalRange: '135-145' },
      { name: 'Potassium', unit: 'mmol/L', normalRange: '3.5-5.0' },
      { name: 'Chloride', unit: 'mmol/L', normalRange: '98-107' },
      { name: 'Bicarbonate', unit: 'mmol/L', normalRange: '22-29' },
    ]
  },
  PSA: {
    name: 'Prostate Specific Antigen',
    fields: [
      { name: 'PSA', unit: 'ng/mL', normalRange: '<4.0' },
    ]
  },
  CA125: {
    name: 'CA-125 (Ovarian Cancer Marker)',
    fields: [
      { name: 'CA-125', unit: 'U/mL', normalRange: '<35' },
    ]
  },
  CEA: {
    name: 'Carcinoembryonic Antigen',
    fields: [
      { name: 'CEA', unit: 'ng/mL', normalRange: '<2.5' },
    ]
  },
  AFP: {
    name: 'Alpha Fetoprotein',
    fields: [
      { name: 'AFP', unit: 'ng/mL', normalRange: '<10' },
    ]
  },
  MP: {
    name: 'Malaria Parasite',
    fields: [
      { name: 'Result', unit: '', normalRange: 'Negative' },
      { name: 'Parasite Count', unit: '/μL', normalRange: '0' },
      { name: 'Species', unit: '', normalRange: 'N/A' },
    ]
  },
  URINE_CS: {
    name: 'Urine Culture & Sensitivity',
    fields: [
      { name: 'Organism', unit: '', normalRange: 'No growth' },
      { name: 'Colony Count', unit: 'CFU/mL', normalRange: '<10,000' },
    ]
  },
  BLOOD_CS: {
    name: 'Blood Culture & Sensitivity',
    fields: [
      { name: 'Organism', unit: '', normalRange: 'No growth' },
      { name: 'Time to Positivity', unit: 'hours', normalRange: 'N/A' },
    ]
  },
  STOOL_CS: {
    name: 'Stool Culture & Sensitivity',
    fields: [
      { name: 'Organism', unit: '', normalRange: 'No pathogen' },
    ]
  },
  THROAT_SWAB: {
    name: 'Throat Swab Culture',
    fields: [
      { name: 'Organism', unit: '', normalRange: 'Normal flora' },
    ]
  },
  WOUND_SWAB: {
    name: 'Wound Swab Culture',
    fields: [
      { name: 'Organism', unit: '', normalRange: 'No growth' },
    ]
  },
  SPUTUM_AFB: {
    name: 'Sputum Acid Fast Bacilli',
    fields: [
      { name: 'AFB', unit: '', normalRange: 'Negative' },
      { name: 'ZN Stain', unit: '', normalRange: 'Negative' },
    ]
  },
  STOOL_MICRO: {
    name: 'Stool Microscopy',
    fields: [
      { name: 'Ova', unit: '', normalRange: 'Not seen' },
      { name: 'Cysts', unit: '', normalRange: 'Not seen' },
      { name: 'Trophozoites', unit: '', normalRange: 'Not seen' },
    ]
  },
  BLOOD_FILM: {
    name: 'Blood Film for Malaria Parasite',
    fields: [
      { name: 'Malaria Parasite', unit: '', normalRange: 'Not seen' },
      { name: 'Parasitemia', unit: '%', normalRange: '0' },
    ]
  },
  UA: {
    name: 'Urinalysis',
    fields: [
      { name: 'Appearance', unit: '', normalRange: 'Clear' },
      { name: 'pH', unit: '', normalRange: '4.5-8.0' },
      { name: 'Specific Gravity', unit: '', normalRange: '1.005-1.030' },
      { name: 'Protein', unit: '', normalRange: 'Negative' },
      { name: 'Glucose', unit: '', normalRange: 'Negative' },
      { name: 'WBC', unit: '/hpf', normalRange: '0-5' },
      { name: 'RBC', unit: '/hpf', normalRange: '0-2' },
    ]
  },
  URINE_RE: {
    name: 'Urine Routine Examination',
    fields: [
      { name: 'Color', unit: '', normalRange: 'Pale yellow' },
      { name: 'Appearance', unit: '', normalRange: 'Clear' },
      { name: 'pH', unit: '', normalRange: '4.5-8.0' },
      { name: 'Specific Gravity', unit: '', normalRange: '1.005-1.030' },
      { name: 'Protein', unit: '', normalRange: 'Negative' },
      { name: 'Glucose', unit: '', normalRange: 'Negative' },
      { name: 'Ketones', unit: '', normalRange: 'Negative' },
      { name: 'Blood', unit: '', normalRange: 'Negative' },
    ]
  },
  URINE_MICRO: {
    name: 'Urine Microscopy',
    fields: [
      { name: 'WBC', unit: '/hpf', normalRange: '0-5' },
      { name: 'RBC', unit: '/hpf', normalRange: '0-2' },
      { name: 'Epithelial Cells', unit: '/hpf', normalRange: '0-5' },
      { name: 'Casts', unit: '/hpf', normalRange: '0-2' },
      { name: 'Crystals', unit: '', normalRange: 'None' },
      { name: 'Bacteria', unit: '', normalRange: 'None' },
    ]
  },
  '24HR_PROTEIN': {
    name: '24 Hour Urinary Protein',
    fields: [
      { name: 'Result', unit: 'mg/day', normalRange: '<150' },
    ]
  },
  HIV: {
    name: 'HIV Antibody Test',
    fields: [
      { name: 'HIV Antibody', unit: '', normalRange: 'Negative' },
    ]
  },
  VDRL: {
    name: 'VDRL Test for Syphilis',
    fields: [
      { name: 'VDRL', unit: '', normalRange: 'Negative' },
    ]
  },
  HBSAG: {
    name: 'Hepatitis B Surface Antigen',
    fields: [
      { name: 'HBsAg', unit: '', normalRange: 'Negative' },
    ]
  },
  ANTI_HCV: {
    name: 'Anti-HCV (Hepatitis C)',
    fields: [
      { name: 'Anti-HCV', unit: '', normalRange: 'Negative' },
    ]
  },
  WIDAL: {
    name: 'Widal Test',
    fields: [
      { name: 'S. Typhi O', unit: '', normalRange: '<1:80' },
      { name: 'S. Typhi H', unit: '', normalRange: '<1:160' },
      { name: 'S. Paratyphi AH', unit: '', normalRange: '<1:80' },
      { name: 'S. Paratyphi BH', unit: '', normalRange: '<1:80' },
    ]
  },
  SEMEN_ANALYSIS: {
    name: 'Semen Analysis',
    fields: [
      { name: 'Volume', unit: 'mL', normalRange: '2-5' },
      { name: 'Count', unit: 'million/mL', normalRange: '15-200' },
      { name: 'Motility', unit: '%', normalRange: '>50' },
      { name: 'Morphology', unit: '%', normalRange: '>30' },
      { name: 'pH', unit: '', normalRange: '7.2-8.0' },
    ]
  },
  PAP_SMEAR: {
    name: 'Pap Smear',
    fields: [
      { name: 'Result', unit: '', normalRange: 'Negative for malignancy' },
    ]
  },
  BONE_MARROW: {
    name: 'Bone Marrow Aspiration',
    fields: [
      { name: 'Cellularity', unit: '', normalRange: 'Normal' },
      { name: 'Myeloid:Erythroid Ratio', unit: '', normalRange: '2-4:1' },
      { name: 'Megakaryocytes', unit: '', normalRange: 'Present' },
    ]
  },
  CSF_ANALYSIS: {
    name: 'CSF Analysis',
    fields: [
      { name: 'Appearance', unit: '', normalRange: 'Clear' },
      { name: 'Protein', unit: 'mg/dL', normalRange: '15-45' },
      { name: 'Glucose', unit: 'mg/dL', normalRange: '40-80' },
      { name: 'WBC', unit: '/μL', normalRange: '0-5' },
    ]
  },
  PLEURAL_FLUID: {
    name: 'Pleural Fluid Analysis',
    fields: [
      { name: 'Appearance', unit: '', normalRange: 'Clear' },
      { name: 'Protein', unit: 'g/dL', normalRange: '<3.0' },
      { name: 'Glucose', unit: 'mg/dL', normalRange: 'Similar to serum' },
      { name: 'WBC', unit: '/μL', normalRange: '<1000' },
    ]
  },
  ASCITIC_FLUID: {
    name: 'Ascitic Fluid Analysis',
    fields: [
      { name: 'Appearance', unit: '', normalRange: 'Clear' },
      { name: 'Protein', unit: 'g/dL', normalRange: '<2.5' },
      { name: 'SAAG', unit: 'g/dL', normalRange: '>1.1' },
      { name: 'WBC', unit: '/μL', normalRange: '<500' },
    ]
  },
  SYNOVIAL_FLUID: {
    name: 'Synovial Fluid Analysis',
    fields: [
      { name: 'Appearance', unit: '', normalRange: 'Clear' },
      { name: 'WBC', unit: '/μL', normalRange: '<200' },
      { name: 'PMN', unit: '%', normalRange: '<25' },
      { name: 'Glucose', unit: 'mg/dL', normalRange: 'Similar to serum' },
    ]
  },
  FSH_LH: {
    name: 'FSH & LH',
    fields: [
      { name: 'FSH', unit: 'mIU/mL', normalRange: 'Follicular: 2.5-10.2' },
      { name: 'LH', unit: 'mIU/mL', normalRange: 'Follicular: 1.9-12.5' },
    ]
  },
  PROLACTIN: {
    name: 'Prolactin',
    fields: [
      { name: 'Prolactin', unit: 'ng/mL', normalRange: '4.0-15.2' },
    ]
  },
  TESTOSTERONE: {
    name: 'Testosterone',
    fields: [
      { name: 'Testosterone', unit: 'ng/dL', normalRange: 'Male: 270-1070' },
    ]
  },
  ESTRADIOL: {
    name: 'Estradiol',
    fields: [
      { name: 'Estradiol', unit: 'pg/mL', normalRange: 'Follicular: 30-100' },
    ]
  },
  PROGESTERONE: {
    name: 'Progesterone',
    fields: [
      { name: 'Progesterone', unit: 'ng/mL', normalRange: 'Follicular: <1.5' },
    ]
  },
  CORTISOL: {
    name: 'Cortisol',
    fields: [
      { name: 'Cortisol (8 AM)', unit: 'μg/dL', normalRange: '5-25' },
    ]
  },
  DHEA_S: {
    name: 'DHEA-S',
    fields: [
      { name: 'DHEA-S', unit: 'μg/dL', normalRange: 'Male: 160-449' },
    ]
  },
  VITAMIN_D: {
    name: 'Vitamin D (25-OH)',
    fields: [
      { name: '25-OH Vitamin D', unit: 'ng/mL', normalRange: '30-100' },
    ]
  },
  VITAMIN_B12: {
    name: 'Vitamin B12',
    fields: [
      { name: 'Vitamin B12', unit: 'pg/mL', normalRange: '200-900' },
    ]
  },
  FOLIC_ACID: {
    name: 'Folic Acid',
    fields: [
      { name: 'Folic Acid', unit: 'ng/mL', normalRange: '>4.0' },
    ]
  },
  IRON_PROFILE: {
    name: 'Iron Profile',
    fields: [
      { name: 'Iron', unit: 'μg/dL', normalRange: 'Male: 65-175' },
      { name: 'TIBC', unit: 'μg/dL', normalRange: '250-450' },
      { name: 'Ferritin', unit: 'ng/mL', normalRange: '30-300' },
      { name: 'Transferrin Saturation', unit: '%', normalRange: '20-50' },
    ]
  },
  CALCIUM: {
    name: 'Calcium',
    fields: [
      { name: 'Calcium', unit: 'mg/dL', normalRange: '8.5-10.5' },
    ]
  },
  MAGNESIUM: {
    name: 'Magnesium',
    fields: [
      { name: 'Magnesium', unit: 'mg/dL', normalRange: '1.7-2.2' },
    ]
  },
  PHOSPHORUS: {
    name: 'Phosphorus',
    fields: [
      { name: 'Phosphorus', unit: 'mg/dL', normalRange: '2.5-4.5' },
    ]
  },
};

// Collection methods by sample type
const collectionMethods: Record<string, { name: string; icon: string; description: string }[]> = {
  'Blood': [
    { name: 'Venipuncture', icon: '💉', description: 'Standard blood draw from vein' },
    { name: 'Finger Prick', icon: '👆', description: 'Capillary blood from fingertip' },
    { name: 'Heel Prick', icon: '🦶', description: 'For infants - capillary from heel' },
    { name: 'Arterial', icon: '🔴', description: 'Arterial blood gas collection' },
  ],
  'Serum': [
    { name: 'Venipuncture', icon: '💉', description: 'Standard blood draw from vein' },
    { name: 'Finger Prick', icon: '👆', description: 'Capillary blood from fingertip' },
    { name: 'Heel Prick', icon: '🦶', description: 'For infants - capillary from heel' },
  ],
  'Urine': [
    { name: 'Mid-stream Clean Catch', icon: '🧪', description: 'Standard urine collection' },
    { name: 'Catheter Collection', icon: '🏥', description: 'From urinary catheter' },
    { name: '24-hour Collection', icon: '⏰', description: 'Collect all urine over 24 hours' },
    { name: 'First Morning Void', icon: '🌅', description: 'First urine of the day' },
  ],
  'Stool': [
    { name: 'Fresh Sample', icon: '📦', description: 'Collect fresh stool sample' },
    { name: 'Preservative Container', icon: '🧴', description: 'With preservative medium' },
  ],
  'Sputum': [
    { name: 'Deep Cough', icon: '💨', description: 'Cough deeply to produce sample' },
    { name: 'Induced Sputum', icon: '💧', description: 'Using nebulized saline' },
  ],
  'Swab': [
    { name: 'Nasal Swab', icon: '👃', description: 'From nasal cavity' },
    { name: 'Throat Swab', icon: '👅', description: 'From back of throat' },
    { name: 'Wound Swab', icon: '🩹', description: 'From wound site' },
    { name: 'Ear Swab', icon: '👂', description: 'From ear canal' },
  ],
  'CSF': [
    { name: 'Lumbar Puncture', icon: '🔬', description: 'Spinal tap procedure' },
  ],
};

// Outsourced lab partners
const outsourcedLabs = [
  'PathCare Labs',
  'MedLab Nigeria',
  'Synlab Nigeria',
  'Lancet Labs',
  'Alpha Medical Labs',
];

export default function LabOrdersPage() {
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('today');
  const [genderFilter, setGenderFilter] = useState('all');
  const [activeTab, setActiveTab] = useState('pending');
  const [isDateFilterDialogOpen, setIsDateFilterDialogOpen] = useState(false);
  const [dateRange, setDateRange] = useState({ from: '', to: '' });
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(50);
  const [totalCount, setTotalCount] = useState(0);

  // Dialog states
  const [selectedOrder, setSelectedOrder] = useState<LabOrder | null>(null);
  const [selectedTest, setSelectedTest] = useState<LabTest | null>(null);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isCollectDialogOpen, setIsCollectDialogOpen] = useState(false);
  const [isProcessDialogOpen, setIsProcessDialogOpen] = useState(false);
  const [isResultsDialogOpen, setIsResultsDialogOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form states
  const [selectedTestsForCollection, setSelectedTestsForCollection] = useState<string[]>([]);
  const [selectedMethod, setSelectedMethod] = useState('');
  const [collectionNotes, setCollectionNotes] = useState('');
  const [processingMethod, setProcessingMethod] = useState<'In-house' | 'Outsourced'>('In-house');
  const [selectedOutsourcedLab, setSelectedOutsourcedLab] = useState('');
  const [resultEntryMode, setResultEntryMode] = useState<'values' | 'upload'>('values');
  const [resultValues, setResultValues] = useState<Record<string, string>>({});
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);

  // Templates from API for result entry (params from Test Templates / normal_range)
  const [apiTemplatesByCode, setApiTemplatesByCode] = useState<Record<string, { name: string; fields: { name: string; unit: string; normalRange: string }[] }>>({});

  const templateFromNormalRange = (code: string, nr: any) => {
    if (!nr || typeof nr !== 'object') return undefined;
    const order = Array.isArray(nr._order) ? nr._order : null;
    const keys = order
      ? order.filter((k: any) => typeof k === 'string' && nr[k] != null)
      : Object.keys(nr).filter((k) => !k.startsWith('_'));
    const fields = keys.map((name: string) => {
      const v = nr[name];
      let normalRange = v?.range || v?.normal_range || v?.normalRange || v?.normalRangeText || '';
      if (!normalRange && v?.min != null && v?.max != null) normalRange = `${v.min}-${v.max}`;
      if (!normalRange && v?.normalRangeMin != null && v?.normalRangeMax != null) normalRange = `${v.normalRangeMin}-${v.normalRangeMax}`;
      return { name, unit: v?.unit || '', normalRange };
    });
    return fields.length ? { name: code, fields } : undefined;
  };

  // Resolve template for result entry:
  // 1) test-specific `template_normal_range` (best: always matches backend)
  // 2) templates list from API
  // 3) hardcoded fallback
  const getTemplateForTest = (test: LabTest): { name: string; fields: { name: string; unit: string; normalRange: string }[] } | undefined => {
    const fromTest = templateFromNormalRange(test.code, test.templateNormalRange);
    if (fromTest) return fromTest;
    return apiTemplatesByCode[test.code] || testTemplates[test.code];
  };

  // Calculate order progress percentage
  const getOrderProgress = (tests: LabTest[]) => {
    if (!tests || tests.length === 0) return 0;

    const statusWeights: Record<string, number> = {
      'Pending': 0,
      'Sample Collected': 25,
      'Processing': 50,
      'Results Ready': 90,
      'Verified': 100,
      'Rejected': 100  // Rejected tests are complete
    };

    const total = tests.reduce((sum, t) => {
      const weight = statusWeights[t.status] || 0;
      return sum + weight;
    }, 0);

    return Math.round(total / tests.length);
  };

  // Get progress display text and value
  const getOrderProgressDisplay = (tests: LabTest[]) => {
    if (!tests || tests.length === 0) return { text: 'No tests', value: 0 };

    const allPending = tests.every(test => test.status === 'Pending');
    const allRejected = tests.every(test => test.status === 'Rejected');
    const allVerified = tests.every(test => test.status === 'Verified');

    if (allPending) {
      return { text: 'Not Started', value: 0 };
    } else if (allRejected) {
      return { text: 'Rejected', value: 100 };
    } else if (allVerified) {
      return { text: 'Completed', value: 100 };
    } else {
      const progress = getOrderProgress(tests);
      return { text: `${progress}%`, value: progress };
    }
  };

  // Get status explanations and tooltips
  const getStatusExplanation = (status: string) => {
    const explanations = {
      'Pending': 'Test order created, waiting for sample collection',
      'Sample Collected': 'Sample has been collected and is ready for processing',
      'Processing': 'Test is being processed in the laboratory',
      'Results Ready': 'Test results are available and ready for verification',
      'Verified': 'Results have been verified by a pathologist and are final',
      'Rejected': 'Test was rejected and cannot be completed'
    };
    return explanations[status as keyof typeof explanations] || 'Unknown status';
  };

  const getOrderStatusExplanation = (tests: LabTest[]) => {
    if (!tests || tests.length === 0) return 'No tests in this order';

    const statusCounts = tests.reduce((acc, test) => {
      acc[test.status] = (acc[test.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const statusOrder = ['Pending', 'Sample Collected', 'Processing', 'Results Ready', 'Verified', 'Rejected'];
    const currentStatus = statusOrder.find(status => statusCounts[status]) || 'Unknown';

    if (tests.length === 1) {
      return getStatusExplanation(currentStatus);
    }

    const explanations = Object.entries(statusCounts)
      .map(([status, count]) => `${count} ${status.toLowerCase()}`)
      .join(', ');

    return `Order contains ${explanations}`;
  };

  // Get overall order status
  const getOrderStatus = (tests: LabTest[]) => {
    // Completed = all tests verified (final)
    if (tests.length > 0 && tests.every(t => t.status === 'Verified')) return 'Completed';
    if (tests.every(t => t.status === 'Results Ready' || t.status === 'Verified')) return 'Results Ready';
    if (tests.some(t => t.status === 'Processing')) return 'Processing';
    if (tests.some(t => t.status === 'Sample Collected')) return 'In Progress';
    return 'Pending';
  };

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

  const matchesCustomDateRange = (isoDate: string | undefined): boolean => {
    if (!dateRange.from && !dateRange.to) return true;
    if (!isoDate) return false;

    const dt = new Date(isoDate);
    if (Number.isNaN(dt.getTime())) return false;

    if (dateRange.from) {
      const from = new Date(`${dateRange.from}T00:00:00`);
      if (dt < from) return false;
    }

    if (dateRange.to) {
      const to = new Date(`${dateRange.to}T23:59:59.999`);
      if (dt > to) return false;
    }

    return true;
  };

  // Client-side filtering for all filters
  const filteredOrders = useMemo(() => {
    return orders.filter(order => {
      // Date filter
      if (!matchesDateFilter(order.orderedAt, dateFilter) || !matchesCustomDateRange(order.orderedAt)) {
        return false;
      }

      // Gender filter
      if (genderFilter !== 'all') {
        const orderGender = normalizeGender(order.patient?.gender);
        if (orderGender !== genderFilter) {
          return false;
        }
      }

      // Tab filtering (client-side for UX)
      if (activeTab === 'pending') return order.tests.some(t => t.status === 'Pending');
      if (activeTab === 'processing') return order.tests.some(t => t.status === 'Sample Collected' || t.status === 'Processing');
      if (activeTab === 'results') return order.tests.some(t => t.status === 'Results Ready');
      if (activeTab === 'rejected') return order.tests.some(t => t.status === 'Rejected');
      return true; // All tab shows everything
    });
  }, [orders, activeTab, dateFilter, genderFilter, dateRange.from, dateRange.to]);

  // With server-side pagination, orders array contains only current page results
  const paginatedOrders = filteredOrders;

  // Reset to page 1 when filters change or items per page changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery, priorityFilter, dateFilter, genderFilter, activeTab, itemsPerPage, dateRange.from, dateRange.to]);

  const clearDateRangeFilters = () => {
    setDateRange({ from: '', to: '' });
    setIsDateFilterDialogOpen(false);
  };

  // Load orders function - memoized to prevent infinite loops
  const loadOrders = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params: any = {
        page: currentPage,
        page_size: itemsPerPage,
      };
      if (priorityFilter !== 'all') {
        params.priority = transformToBackendPriority(priorityFilter);
      }
      if (searchQuery) {
        params.search = searchQuery;
      }
      // Note: dateFilter and genderFilter not yet implemented in backend

      const response = await labService.getOrders(params);
      setTotalCount(response.count || response.results.length);
      const transformedOrders = response.results.map(transformOrder);
      setOrders(transformedOrders);
    } catch (err: any) {
      let errorMessage = 'Unable to load lab orders. Please check your connection and try again.';
      let toastMessage = errorMessage;

      if (err.name === 'NetworkError') {
        errorMessage = 'Cannot connect to the laboratory system. Please ensure the server is running and try again.';
        toastMessage = 'Connection failed. Please check your internet connection.';
      } else if (err.message) {
        if (err.message.includes('401') || err.message.includes('Authentication')) {
          errorMessage = 'Your session has expired. Please log in again.';
          toastMessage = 'Session expired. Please refresh the page.';
        } else if (err.message.includes('403') || err.message.includes('permission')) {
          errorMessage = 'You do not have permission to view lab orders.';
          toastMessage = 'Access denied. Please contact your administrator.';
        } else if (err.message.includes('500') || err.message.includes('server')) {
          errorMessage = 'The laboratory system encountered an error. Please try again later.';
          toastMessage = 'Server error. Please try again in a few moments.';
        } else if (err.message.includes('timeout')) {
          errorMessage = 'The request timed out. Please check your connection and try again.';
          toastMessage = 'Request timed out. Please try again.';
        } else {
          errorMessage = `Failed to load lab orders: ${err.message}`;
          toastMessage = 'Failed to load orders. Please try again.';
        }
      }

      setError(errorMessage);
      toast.error(toastMessage);
      console.error('Error loading orders:', err);
    } finally {
      setLoading(false);
    }
  }, [currentPage, priorityFilter, searchQuery]);

  // Load orders from API when page or filters change
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  // Load Test Templates from API for result entry (so FBC, etc. use template parameters)
  const loadTemplatesForResults = useCallback(async () => {
    try {
      const { results } = await labService.getTemplates({ page_size: 1000 });
      const next: Record<string, { name: string; fields: { name: string; unit: string; normalRange: string }[] }> = {};
      for (const t of results) {
        const nr = (t as any).normal_range;
        if (!nr || typeof nr !== 'object') continue;
        const order = Array.isArray(nr._order) ? nr._order : null;
        const keys = order
          ? order.filter((k: any) => typeof k === 'string' && nr[k] != null)
          : Object.keys(nr).filter((k) => !k.startsWith('_'));
        const fields = keys.map((name: string) => {
          const v = nr[name];
          let normalRange = v.range || v.normal_range || v.normalRange || v.normalRangeText || '';
          if (!normalRange && v.min != null && v.max != null) normalRange = `${v.min}-${v.max}`;
          if (!normalRange && v.normalRangeMin != null && v.normalRangeMax != null) normalRange = `${v.normalRangeMin}-${v.normalRangeMax}`;
          return { name, unit: v.unit || '', normalRange };
        });
        if (fields.length) next[t.code] = { name: t.name, fields };
      }
      setApiTemplatesByCode(prev => ({ ...prev, ...next }));
    } catch (e) {
      console.warn('Could not load lab templates for result entry, using fallbacks:', e);
    }
  }, []);
  useEffect(() => { loadTemplatesForResults(); }, [loadTemplatesForResults]);

  const stats = useMemo(() => {
    const allTests = orders.flatMap(o => o.tests);
    return {
      pendingSamples: allTests.filter(t => t.status === 'Pending').length,
      processing: allTests.filter(t => t.status === 'Sample Collected' || t.status === 'Processing').length,
      resultsReady: allTests.filter(t => t.status === 'Results Ready').length,
      rejected: allTests.filter(t => t.status === 'Rejected').length,
      stat: orders.filter(o => o.priority === 'STAT' && o.tests.some(t => t.status !== 'Verified')).length,
    };
  }, [orders]);

  const getPriorityBadge = (priority: string) => {
    switch (priority) {
      case 'STAT': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Urgent': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      default: return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
    }
  };

  const getTestStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/50';
      case 'Sample Collected': return 'bg-violet-500/10 text-violet-600 dark:text-violet-400 border-violet-500/50';
      case 'Processing': return 'bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/50';
      case 'Results Ready': return 'bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/50';
      case 'Rejected': return 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50';
      case 'Verified': return 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/50';
      default: return 'bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/50';
    }
  };

  const getSampleTypeBadge = (sampleType: string) => {
    switch (sampleType) {
      case 'Blood': return 'bg-rose-500/10 text-rose-600 border-rose-500/30';
      case 'Urine': return 'bg-amber-500/10 text-amber-600 border-amber-500/30';
      case 'Stool': return 'bg-orange-500/10 text-orange-600 border-orange-500/30';
      case 'Sputum': return 'bg-teal-500/10 text-teal-600 border-teal-500/30';
      case 'Swab': return 'bg-indigo-500/10 text-indigo-600 border-indigo-500/30';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/30';
    }
  };

  const getOrderStatusBadge = (status: string) => {
    switch (status) {
      case 'Pending': return 'bg-gray-500/10 text-gray-600 border-gray-500/50';
      case 'In Progress': return 'bg-blue-500/10 text-blue-600 border-blue-500/50';
      case 'Processing': return 'bg-violet-500/10 text-violet-600 border-violet-500/50';
      case 'Results Ready': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50';
      case 'Completed': return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/50';
      default: return 'bg-gray-500/10 text-gray-600 border-gray-500/50';
    }
  };

  const formatTime = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  };

  const getTimeSince = (isoString: string) => {
    const diff = Date.now() - new Date(isoString).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    return `${hrs}h ago`;
  };

  // Collect samples for selected tests (single or multiple)
  const handleCollectSample = async () => {
    if (!selectedOrder || selectedTestsForCollection.length === 0) {
      toast.error('Please select at least one test');
      return;
    }
    if (!selectedMethod) {
      toast.error('Please select a collection method');
      return;
    }
    setIsSubmitting(true);

    try {
      // Collect all samples at once (assigns sequential lab numbers)
      await labService.collectSamples(
          parseInt(selectedOrder.id),
        selectedTestsForCollection.map(id => parseInt(id)),
          selectedMethod,
          collectionNotes
        );

      const count = selectedTestsForCollection.length;
      toast.success(`${count} sample${count > 1 ? 's' : ''} collected via ${selectedMethod} with shared Lab ID`);
      
      // Reload orders to get updated data
      await loadOrders();
      
      // Update selectedOrder if dialog is still open
      if (isViewDialogOpen) {
        const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
        setSelectedOrder(transformOrder(updatedOrder));
      }

      setIsCollectDialogOpen(false);
      setSelectedTestsForCollection([]);
      setSelectedMethod('');
      setCollectionNotes('');
    } catch (err: any) {
      let errorMessage = 'Failed to collect samples. Please try again.';
      if (err.message) {
        if (err.message.includes('already collected')) {
          errorMessage = 'Sample has already been collected.';
        } else if (err.message.includes('permission') || err.message.includes('403')) {
          errorMessage = 'You do not have permission to collect samples.';
        } else if (err.message.includes('not found')) {
          errorMessage = 'Sample not found. Please refresh and try again.';
        } else {
          errorMessage = `Failed to collect samples: ${err.message}`;
        }
      }
      toast.error(errorMessage);
      console.error('Error collecting samples:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Start processing for a single test
  const handleStartProcessing = async () => {
    if (!selectedOrder || !selectedTest) return;
    if (processingMethod === 'Outsourced' && !selectedOutsourcedLab) {
      toast.error('Please select an outsourced lab');
      return;
    }
    setIsSubmitting(true);

    try {
      const updatedTest = await labService.processTest(
        parseInt(selectedOrder.id),
        parseInt(selectedTest.id),
        transformToBackendProcessingMethod(processingMethod) as 'in_house' | 'outsourced',
        processingMethod === 'Outsourced' ? selectedOutsourcedLab : undefined
      );

      toast.success(`${selectedTest.name} sent for ${processingMethod.toLowerCase()} processing`);
      
      // Reload orders to get updated data
      await loadOrders();
      
      // Update selectedOrder if dialog is still open
      if (isViewDialogOpen) {
        const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
        setSelectedOrder(transformOrder(updatedOrder));
      }

      setIsProcessDialogOpen(false);
      setProcessingMethod('In-house');
      setSelectedOutsourcedLab('');
    } catch (err: any) {
      let errorMessage = 'Failed to start processing. Please try again.';
      if (err.message) {
        if (err.message.includes('already processing')) {
          errorMessage = 'Sample is already being processed.';
        } else if (err.message.includes('not collected')) {
          errorMessage = 'Sample must be collected before processing can begin.';
        } else if (err.message.includes('permission') || err.message.includes('403')) {
          errorMessage = 'You do not have permission to process samples.';
        } else {
          errorMessage = `Failed to start processing: ${err.message}`;
        }
      }
      toast.error(errorMessage);
      console.error('Error starting processing:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Submit results for a single test
  const handleSubmitResults = async () => {
    if (!selectedOrder || !selectedTest) return;
    
    if (resultEntryMode === 'values') {
      const template = getTemplateForTest(selectedTest);
      if (template) {
        const allFieldsFilled = template.fields.every(f => resultValues[f.name]);
        if (!allFieldsFilled) {
          toast.error('Please fill in all result fields');
          return;
        }

        // Check for critical values that require confirmation
        const criticalValues = template.fields.filter(field => {
          const value = resultValues[field.name];
          const numValue = parseFloat(value);
          if (isNaN(numValue)) return false;

          if (field.name.toLowerCase().includes('glucose') && selectedTest.code === 'FBS') {
            return numValue < 40 || numValue > 600;
          } else if (field.name.toLowerCase().includes('glucose') && selectedTest.code === 'RBS') {
            return numValue < 40 || numValue > 600;
          } else if (field.name.toLowerCase().includes('hemoglobin') || field.name.toLowerCase().includes('hb')) {
            return numValue < 7 || numValue > 20;
          }
          return false;
        });

        if (criticalValues.length > 0) {
          const confirmed = window.confirm(
            `Warning: This result contains ${criticalValues.length} critical ${criticalValues.length === 1 ? 'value' : 'values'} that may indicate a life-threatening condition.\n\n` +
            criticalValues.map(field => `${field.name}: ${resultValues[field.name]} ${field.unit}`).join('\n') +
            '\n\nAre you sure you want to submit these results?'
          );
          if (!confirmed) return;
        }
      }
    } else if (!uploadedFile) {
      toast.error('Please upload a result file');
      return;
    }

    setIsSubmitting(true);

    try {
      await labService.submitResults(
        parseInt(selectedOrder.id),
        parseInt(selectedTest.id),
        resultEntryMode === 'values' ? resultValues : {},
        resultEntryMode === 'upload' ? (uploadedFile || undefined) : undefined
      );

      toast.success(`Results submitted for ${selectedTest.name}. Awaiting verification.`);
      
      // Reload orders to get updated data
      await loadOrders();
      
      // Update selectedOrder if dialog is still open
      if (isViewDialogOpen) {
        const updatedOrder = await labService.getOrder(parseInt(selectedOrder.id));
        setSelectedOrder(transformOrder(updatedOrder));
      }

      setIsResultsDialogOpen(false);
      setResultValues({});
      setUploadedFile(null);
      setResultEntryMode('values');
    } catch (err: any) {
      let errorMessage = 'Failed to submit results. Please try again.';
      if (err.message) {
        if (err.message.includes('validation') || err.message.includes('invalid')) {
          errorMessage = 'Please check your results and ensure all required fields are filled correctly.';
        } else if (err.message.includes('already submitted')) {
          errorMessage = 'Results have already been submitted for this test.';
        } else if (err.message.includes('permission') || err.message.includes('403')) {
          errorMessage = 'You do not have permission to submit results.';
        } else if (err.message.includes('critical') || err.message.includes('abnormal')) {
          errorMessage = 'Critical values detected. Please confirm before submitting.';
        } else {
          errorMessage = `Failed to submit results: ${err.message}`;
        }
      }
      toast.error(errorMessage);
      console.error('Error submitting results:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const openViewDialog = (order: LabOrder) => { setSelectedOrder(order); setIsViewDialogOpen(true); };
  
  const openCollectDialog = (test: LabTest) => {
    setSelectedTest(test);
    // Pre-select the clicked test
    setSelectedTestsForCollection([test.id]);
    // Pre-select Venipuncture for blood samples
    setSelectedMethod(test.sampleType === 'Blood' ? 'Venipuncture' : '');
    setCollectionNotes('');
    // Lab ID is assigned only on Collect (one per order); reuse if order already has one
    setIsCollectDialogOpen(true);
  };
  
  const openProcessDialog = (test: LabTest) => { 
    setSelectedTest(test);
    setProcessingMethod('In-house');
    setSelectedOutsourcedLab('');
    setIsProcessDialogOpen(true); 
  };
  
  const openResultsDialog = (test: LabTest, isRework = false) => {
    setSelectedTest(test);
    
    // Initialize result values - pre-fill existing results if reworking a rejected test
    const initial: Record<string, string> = {};
    const template = getTemplateForTest(test);
    
    if (template) {
      // Start with template fields (ensures multi-parameter tests like FBC never fall back to single "Result")
      template.fields.forEach(field => { initial[field.name] = ''; });
    }
    if (isRework && test.results) {
      // Overlay existing results for rework (only matching keys; preserves full template shape)
      Object.entries(test.results).forEach(([key, value]) => {
        initial[key] = String(value);
      });
    }
    
    setResultValues(initial);
    setResultEntryMode(test.processingMethod === 'Outsourced' ? 'upload' : 'values');
    setUploadedFile(null);
    setIsResultsDialogOpen(true);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setUploadedFile(e.target.files[0]);
    }
  };

  // Simple Order Card - just basic info, click to view/manage
  const OrderCard = ({ order }: { order: LabOrder }) => {
    const orderProgressDisplay = getOrderProgressDisplay(order.tests);
    const orderStatus = getOrderStatus(order.tests);
    const isCompleted = orderStatus === 'Completed';
    
    return (
      <Card 
        className={`border-l-4 hover:shadow-md transition-shadow cursor-pointer ${order.priority === 'STAT' ? 'border-l-rose-500' : order.priority === 'Urgent' ? 'border-l-amber-500' : 'border-l-blue-500'}`}
        onClick={() => openViewDialog(order)}
      >
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            {/* Avatar */}
            <PatientAvatar name={order.patient.name} photoUrl={order.patient.photoUrl} size="sm" />
            
            {/* Info */}
            <div className="flex-1 min-w-0">
              {/* Row 1: Name + Badges */}
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 flex-wrap min-w-0">
                  <span className="font-semibold text-foreground truncate">{order.patient.name}</span>
                  <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getPriorityBadge(order.priority)}`}>
                    {order.priority === 'STAT' && <AlertTriangle className="h-2 w-2 mr-0.5" />}{order.priority}
                  </Badge>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${getOrderStatusBadge(orderStatus)} cursor-help`}>{orderStatus}</Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-xs">{getOrderStatusExplanation(order.tests)}</p>
                    </TooltipContent>
                  </Tooltip>
                  {order.tests.map(test => (
                    <Badge key={test.id} variant="secondary" className="text-[10px] px-1.5 py-0">{test.code}</Badge>
                  ))}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  {isCompleted && (
                    <div className="h-7 w-7 flex items-center justify-center rounded border border-emerald-500/50 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                  <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={(e) => { e.stopPropagation(); openViewDialog(order); }}>
                    <Eye className="h-4 w-4 text-muted-foreground hover:text-primary" />
                  </Button>
                </div>
              </div>
              
              {/* Row 2: Details */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1 flex-wrap">
                <span>{order.patient.age}y {order.patient.gender}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Stethoscope className="h-3 w-3" />{order.doctor.name}</span>
                <span>•</span>
                <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{getTimeSince(order.orderedAt)}</span>
                <span>•</span>
                <span>{order.tests.length} test{order.tests.length > 1 ? 's' : ''}</span>
                <span>•</span>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-medium text-foreground cursor-help">{orderProgressDisplay.text}</span>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs">Order progress: {orderProgressDisplay.value}% complete</p>
                  </TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <TooltipProvider>
    <DashboardLayout>
      <div className="container mx-auto p-4 sm:p-6 space-y-4 sm:space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-foreground flex items-center gap-3">
              <TestTube className="h-8 w-8 text-amber-500" />
              Lab Orders
            </h1>
            <p className="text-muted-foreground mt-1">Process tests individually - collect, process & enter results per test</p>
          </div>
          <Button variant="outline" onClick={loadOrders} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />Refresh
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-gray-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('pending')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Samples</p>
                  <p className="text-2xl sm:text-3xl font-bold text-gray-600 dark:text-gray-400">{stats.pendingSamples}</p>
                </div>
                <Beaker className="h-8 w-8 text-gray-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Test orders waiting for sample collection</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-blue-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('processing')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Processing</p>
                  <p className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.processing}</p>
                </div>
                <Activity className="h-8 w-8 text-blue-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Samples currently being processed in the lab</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-amber-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('results')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Results Ready</p>
                  <p className="text-2xl sm:text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.resultsReady}</p>
                </div>
                <FileText className="h-8 w-8 text-amber-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Test results ready for verification</p>
              </TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
          <Card className="border-l-4 border-l-rose-500 cursor-pointer hover:shadow-md" onClick={() => setActiveTab('rejected')}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.rejected}</p>
                </div>
                <XCircle className="h-8 w-8 text-rose-400" />
              </div>
            </CardContent>
          </Card>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs">Tests that were rejected and cannot be completed</p>
              </TooltipContent>
            </Tooltip>
          <Card className="border-l-4 border-l-rose-500">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">STAT Orders</p>
                  <p className="text-2xl sm:text-3xl font-bold text-rose-600 dark:text-rose-400">{stats.stat}</p>
                </div>
                <AlertTriangle className="h-8 w-8 text-rose-400" />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters & Tabs */}
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-col gap-4">
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList>
                  <TabsTrigger value="pending">Pending ({stats.pendingSamples})</TabsTrigger>
                  <TabsTrigger value="processing">Processing ({stats.processing})</TabsTrigger>
                  <TabsTrigger value="results">Results ({stats.resultsReady})</TabsTrigger>
                  <TabsTrigger value="rejected">Rejected ({stats.rejected})</TabsTrigger>
                  <TabsTrigger value="all">All</TabsTrigger>
                </TabsList>
              </Tabs>
              <div className="flex flex-col gap-4">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input 
                    placeholder="Search orders..." 
                    value={searchQuery} 
                    onChange={(e) => setSearchQuery(e.target.value)} 
                    className="pl-10" 
                  />
                </div>
                <Button variant="outline" onClick={() => setIsDateFilterDialogOpen(true)}>
                  <Filter className="h-4 w-4 mr-2" />
                  Filters
                </Button>
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
                  <Select value={priorityFilter} onValueChange={setPriorityFilter}>
                    <SelectTrigger className="w-[130px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Priority</SelectItem>
                      <SelectItem value="STAT">STAT</SelectItem>
                      <SelectItem value="Urgent">Urgent</SelectItem>
                      <SelectItem value="Routine">Routine</SelectItem>
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
            </div>
          </CardContent>
        </Card>

        <AdvancedDateRangeDialog
          open={isDateFilterDialogOpen}
          onOpenChange={setIsDateFilterDialogOpen}
          description="Apply a custom order date range to narrow down laboratory orders."
          label="Order Date Range"
          value={dateRange}
          onChange={setDateRange}
          onClear={clearDateRangeFilters}
        />

        {/* Orders List */}
        <div className="space-y-3">
          {loading ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <Loader2 className="h-12 w-12 mx-auto mb-4 animate-spin opacity-50" />
              <p>Loading orders...</p>
            </CardContent></Card>
          ) : error ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-red-600 dark:text-red-400">{error}</p>
              <Button variant="outline" className="mt-4" onClick={loadOrders}>Retry</Button>
            </CardContent></Card>
          ) : filteredOrders.length === 0 ? (
            <Card><CardContent className="p-8 text-center text-muted-foreground">
              <TestTube className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No orders found</p>
            </CardContent></Card>
          ) : (
            paginatedOrders
              .sort((a, b) => {
                const priorityOrder = { STAT: 0, Urgent: 1, Routine: 2 };
                return priorityOrder[a.priority] - priorityOrder[b.priority];
              })
              .map(order => <OrderCard key={order.id} order={order} />)
          )}
        </div>

        {/* Pagination */}
        {filteredOrders.length > 0 && (
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
              itemName="orders"
            />
            <p className="text-xs text-muted-foreground mt-2 text-center">
              Showing {filteredOrders.length} order{filteredOrders.length !== 1 ? 's' : ''} (page {currentPage} of {Math.ceil(totalCount / itemsPerPage)})
            </p>
          </Card>
        )}

        {/* View & Manage Order Dialog - All actions happen here */}
        <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[800px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-amber-500" />Manage Order</DialogTitle>
              <DialogDescription>{selectedOrder?.orderId} • Process individual tests</DialogDescription>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4 py-4">
                {/* Order Header */}
                <div className="flex items-center gap-3">
                  <Badge variant="outline" className={getPriorityBadge(selectedOrder.priority)}>{selectedOrder.priority}</Badge>
                  <span className="text-sm text-muted-foreground">{getOrderProgressDisplay(selectedOrder.tests).text} complete</span>
                  <Progress value={getOrderProgressDisplay(selectedOrder.tests).value} className="flex-1 h-2" />
                </div>
                
                {/* Patient & Doctor Info */}
                <div className="grid grid-cols-2 gap-4 p-4 rounded-lg bg-muted/50">
                  <div>
                    <p className="text-xs text-muted-foreground">Patient</p>
                    <p className="font-medium">{selectedOrder.patient.name}</p>
                    <p className="text-xs text-muted-foreground">{selectedOrder.patient.age}y {selectedOrder.patient.gender}</p>
                    {(selectedOrder.patient as any).personal_number && (
                      <p className="text-xs text-muted-foreground">Personal #: {(selectedOrder.patient as any).personal_number}</p>
                    )}
                    {(selectedOrder.patient as any).division && (
                      <p className="text-xs text-muted-foreground">Division: {(selectedOrder.patient as any).division}</p>
                    )}
                  </div>
                  <div><p className="text-xs text-muted-foreground">Ordering Doctor</p><p className="font-medium">{selectedOrder.doctor.name}</p><p className="text-xs text-muted-foreground">{selectedOrder.doctor.specialty}</p></div>
                </div>

                {selectedOrder.clinicalNotes && (
                  <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                    <p className="text-xs text-muted-foreground mb-1">Clinical Notes</p>
                    <p className="text-sm">{selectedOrder.clinicalNotes}</p>
                  </div>
                )}
                
                {/* Individual Tests - With Actions */}
                <div className="space-y-3">
                  <p className="text-sm font-medium">Tests ({selectedOrder.tests.length})</p>
                  {selectedOrder.tests.map(test => (
                    <div key={test.id} className="p-3 rounded-lg border space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge variant="outline" className={getSampleTypeBadge(test.sampleType)}>{test.sampleType}</Badge>
                          <span className="font-medium">{test.name}</span>
                          <span className="text-xs text-muted-foreground">({test.code})</span>
                          {test.processingMethod && (
                            <Badge variant="outline" className={`text-[10px] ${test.processingMethod === 'In-house' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}`}>
                              {test.processingMethod === 'In-house' ? <Building2 className="h-2.5 w-2.5 mr-0.5" /> : <Truck className="h-2.5 w-2.5 mr-0.5" />}
                              {test.processingMethod}
                            </Badge>
                          )}
                        </div>
                        <Badge variant="outline" className={getTestStatusBadge(test.status)}>{test.status}</Badge>
                      </div>
                      
                      {/* Test Details & Actions */}
                      <div className="flex items-center justify-between">
                        <div className="text-xs text-muted-foreground">
                          {test.lab_number && <span className="font-mono text-blue-600 dark:text-blue-400">Lab ID: {test.lab_number}</span>}
                          {test.collectedBy && <span className={test.lab_number ? " ml-2" : ""}>Collected by {test.collectedBy} {test.collectedAt && `at ${formatTime(test.collectedAt)}`}</span>}
                          {/* Extract collection method from notes if available */}
                          {(() => {
                            const notes = test.notes || '';
                            const methodMatch = notes.match(/Method: ([^\n]+)/);
                            return methodMatch ? <span className="ml-2">• {methodMatch[1]}</span> : null;
                          })()}
                          {test.outsourcedLab && <span className="ml-2">• {test.outsourcedLab}</span>}
                          {test.status === 'Rejected' && test.rejectedBy && (
                            <span className="ml-2">• Rejected by {test.rejectedBy} {test.rejectedAt && `at ${formatTime(test.rejectedAt)}`}</span>
                          )}
                        </div>
                        
                        {/* Action Buttons */}
                        <div className="flex gap-2">
                          {test.status === 'Pending' && (
                            <Button size="sm" onClick={() => openCollectDialog(test)} className="h-7 px-3 bg-violet-500 hover:bg-violet-600 text-white text-xs">
                              <Beaker className="h-3 w-3 mr-1" />Collect Sample
                            </Button>
                          )}
                          {test.status === 'Sample Collected' && (
                            <Button size="sm" onClick={() => openProcessDialog(test)} className="h-7 px-3 bg-blue-500 hover:bg-blue-600 text-white text-xs">
                              <Play className="h-3 w-3 mr-1" />Start Processing
                            </Button>
                          )}
                          {test.status === 'Processing' && (
                            <Button size="sm" onClick={() => openResultsDialog(test)} className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs">
                              <FileText className="h-3 w-3 mr-1" />Enter Results
                            </Button>
                          )}
                          {test.status === 'Results Ready' && (
                            <Button variant="outline" size="sm" className="h-7 px-3 text-xs text-emerald-600">
                              <CheckCircle2 className="h-3 w-3 mr-1" />Complete
                            </Button>
                          )}
                          {test.status === 'Rejected' && (
                            <Button 
                              size="sm" 
                              onClick={() => openResultsDialog(test, true)} 
                              className="h-7 px-3 bg-amber-500 hover:bg-amber-600 text-white text-xs"
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />Rework & Resubmit
                            </Button>
                          )}
                        </div>
                      </div>
                      
                      {/* Show Rejection Reason if rejected */}
                      {test.status === 'Rejected' && test.verificationNotes && (
                        <div className="mt-2 p-2 rounded bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-xs">
                          <p className="font-medium text-rose-700 dark:text-rose-400 mb-1 flex items-center gap-1">
                            <XCircle className="h-3 w-3" />
                            Rejection Reason:
                          </p>
                          <p className="text-rose-600 dark:text-rose-300">
                            {test.verificationNotes.replace('REJECTED: ', '')}
                          </p>
                          {test.rejectedBy && test.rejectedAt && (
                            <p className="text-rose-500 dark:text-rose-400 mt-1 text-[10px]">
                              Rejected by {test.rejectedBy} on {formatDate(test.rejectedAt)} at {formatTime(test.rejectedAt)}
                            </p>
                          )}
                        </div>
                      )}
                      
                      {/* Show Results if available */}
                      {test.results && (
                        <div className="mt-2 p-2 rounded bg-emerald-50 dark:bg-emerald-900/20 text-xs">
                          <p className="font-medium text-emerald-700 dark:text-emerald-400 mb-1">Results:</p>
                          <div className="grid grid-cols-2 md:grid-cols-3 gap-1">
                            {Object.entries(test.results).map(([key, value]) => (
                              <div key={key}><span className="text-muted-foreground">{key}:</span> <span className="font-medium">{value}</span></div>
                            ))}
                          </div>
                        </div>
                      )}
                      {test.resultFile && (
                        <div className="mt-2 p-2 rounded bg-indigo-50 dark:bg-indigo-900/20 text-xs flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-indigo-600" />
                            <span>{test.resultFile.name}</span>
                          </div>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="h-6 px-2 text-indigo-600"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (test.resultFile) {
                                // Construct download URL
                                const fileUrl = test.resultFile.name.startsWith('http') 
                                  ? test.resultFile.name 
                                  : `/api${test.resultFile.name}`;
                                window.open(fileUrl, '_blank');
                              }
                            }}
                          >
                            <Download className="h-3 w-3 mr-1" />Download
                          </Button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsViewDialogOpen(false)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Collect Sample Dialog */}
        <Dialog open={isCollectDialogOpen} onOpenChange={setIsCollectDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Beaker className="h-5 w-5 text-violet-500" />Collect {selectedTest?.sampleType || 'Sample'}</DialogTitle>
              <DialogDescription>Collect sample for laboratory testing</DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedTest && (
              <div className="space-y-4 py-4">
                {/* Sample Type Header */}
                <div className={`p-4 rounded-lg flex items-center gap-4 ${
                  (selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? 'bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800' :
                  selectedTest.sampleType === 'Urine' ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800' :
                  'bg-muted/50 border'
                }`}>
                  <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                    (selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? 'bg-rose-100 dark:bg-rose-800' :
                    selectedTest.sampleType === 'Urine' ? 'bg-amber-100 dark:bg-amber-800' :
                    'bg-muted'
                  }`}>
                    {(selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? (
                      <Droplets className="h-6 w-6 text-rose-600" />
                    ) : selectedTest.sampleType === 'Urine' ? (
                      <Beaker className="h-6 w-6 text-amber-600" />
                    ) : (
                      <Pipette className="h-6 w-6 text-gray-600" />
                    )}
                  </div>
                  <div className="flex-1">
                    <h3 className={`font-semibold text-lg ${
                      (selectedTest.sampleType === 'Blood' || selectedTest.sampleType === 'Serum') ? 'text-rose-700 dark:text-rose-400' :
                      selectedTest.sampleType === 'Urine' ? 'text-amber-700 dark:text-amber-400' :
                      'text-foreground'
                    }`}>{selectedTest.sampleType} Sample</h3>

                    {/* Enhanced Patient Bio Data */}
                    <div className="mt-2 space-y-1">
                      <div className="flex items-center gap-2">
                        <User className="h-3 w-3 text-muted-foreground" />
                        <span className="font-medium text-sm">{selectedOrder.patient.name}</span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>Age: {selectedOrder.patient.age}</span>
                        <span>Gender: {selectedOrder.patient.gender}</span>
                      </div>

                      {(selectedOrder.patient.personal_number || selectedOrder.patient.division) && (
                        <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          {selectedOrder.patient.personal_number && (
                            <span>Personal #: {selectedOrder.patient.personal_number}</span>
                          )}
                          {selectedOrder.patient.division && (
                            <span>Division: {selectedOrder.patient.division}</span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-sm">
                      {(() => {
                        const existingLabId = selectedOrder.lab_number || selectedOrder.tests.find(t => t.lab_number)?.lab_number;
                        return existingLabId ? (
                          <>
                            <p className="font-mono text-blue-600 dark:text-blue-400">Lab ID: {existingLabId}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              One per order. New tests will use this same Lab ID.
                            </p>
                          </>
                        ) : (
                          <p className="text-muted-foreground">Lab ID will be assigned when you collect (one per order)</p>
                        );
                      })()}
                      {selectedTestsForCollection.length > 1 && (
                        <p className="text-xs text-muted-foreground mt-1">
                          All {selectedTestsForCollection.length} tests will share the same Lab ID
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Collection Date/Time */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <Calendar className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-blue-700 dark:text-blue-400">
                    Collection Time: {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} at {new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>

                {/* Tests to Collect - Multi-select */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Tests to Collect ({selectedTest.sampleType || 'Sample'})</Label>
                  <div className="space-y-2 p-3 rounded-lg border max-h-[150px] overflow-y-auto">
                    {selectedOrder.tests
                      .filter(t => (!selectedTest.sampleType || t.sampleType === selectedTest.sampleType) && t.status === 'Pending')
                      .map(test => (
                        <div key={test.id} className="flex items-center gap-3 p-2 rounded hover:bg-muted/50">
                          <Checkbox
                            id={test.id}
                            checked={selectedTestsForCollection.includes(test.id)}
                            onCheckedChange={(checked) => {
                              if (checked) {
                                setSelectedTestsForCollection(prev => [...prev, test.id]);
                              } else {
                                setSelectedTestsForCollection(prev => prev.filter(id => id !== test.id));
                              }
                            }}
                          />
                          <label htmlFor={test.id} className="flex-1 cursor-pointer">
                            <span className="font-medium text-sm">{test.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">({test.code})</span>
                          </label>
                        </div>
                      ))
                    }
                  </div>
                  <p className="text-xs text-muted-foreground">{selectedTestsForCollection.length} test(s) selected</p>
                </div>

                {/* Collection Method Selection */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Collection Method *</Label>
                  <div className="text-xs text-muted-foreground mb-1">
                    Sample Type: {selectedTest?.sampleType || 'Unknown'}
                  </div>
                  <Select value={selectedMethod} onValueChange={setSelectedMethod}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select collection method" />
                    </SelectTrigger>
                    <SelectContent>
                    {(collectionMethods[selectedTest?.sampleType] || collectionMethods['Blood'] || []).map((method) => (
                        <SelectItem key={method.name} value={method.name}>
                        <div className="flex items-center gap-2">
                            <span>{method.icon}</span>
                            <span>{method.name}</span>
                            <span className="text-xs text-muted-foreground ml-2">- {method.description}</span>
                        </div>
                        </SelectItem>
                    ))}
                    {(collectionMethods[selectedTest?.sampleType] || collectionMethods['Blood'] || []).length === 0 && (
                      <div className="px-2 py-1 text-xs text-muted-foreground">
                        No collection methods available for {selectedTest?.sampleType || 'this sample type'}
                      </div>
                    )}
                    </SelectContent>
                  </Select>
                </div>

                {/* Additional Notes */}
                <div className="space-y-2">
                  <Label className="text-sm font-medium">Additional Notes (Optional)</Label>
                  <Input 
                    value={collectionNotes} 
                    onChange={(e) => setCollectionNotes(e.target.value)} 
                    placeholder="Any special notes about the collection..." 
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsCollectDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleCollectSample} 
                disabled={isSubmitting || selectedTestsForCollection.length === 0 || !selectedMethod} 
                className="bg-violet-500 hover:bg-violet-600"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Beaker className="h-4 w-4 mr-2" />}
                Collect {selectedTestsForCollection.length} Sample{selectedTestsForCollection.length > 1 ? 's' : ''}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Start Processing Dialog */}
        <Dialog open={isProcessDialogOpen} onOpenChange={setIsProcessDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[500px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2"><Play className="h-5 w-5 text-blue-500" />Process Test</DialogTitle>
              <DialogDescription>Choose processing method for {selectedTest?.name}</DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedTest && (
              <div className="space-y-4 py-4">
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedOrder.patient.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Test:</span><span className="font-medium">{selectedTest.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Collected By:</span><span className="font-medium">{selectedTest.collectedBy}</span></div>
                </div>
                
                <div className="space-y-3">
                  <Label>Processing Method *</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setProcessingMethod('In-house')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        processingMethod === 'In-house' 
                          ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' 
                          : 'border-muted hover:border-emerald-300'
                      }`}
                    >
                      <Building2 className={`h-6 w-6 mb-2 ${processingMethod === 'In-house' ? 'text-emerald-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">In-house</p>
                      <p className="text-xs text-muted-foreground">Process in our lab</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setProcessingMethod('Outsourced')}
                      className={`p-4 rounded-lg border-2 text-left transition-all ${
                        processingMethod === 'Outsourced' 
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
                          : 'border-muted hover:border-indigo-300'
                      }`}
                    >
                      <Truck className={`h-6 w-6 mb-2 ${processingMethod === 'Outsourced' ? 'text-indigo-600' : 'text-muted-foreground'}`} />
                      <p className="font-medium">Outsourced</p>
                      <p className="text-xs text-muted-foreground">Send to external lab</p>
                    </button>
                  </div>
                </div>

                {processingMethod === 'Outsourced' && (
                  <div className="space-y-2">
                    <Label>Select Lab Partner *</Label>
                    <Select value={selectedOutsourcedLab} onValueChange={setSelectedOutsourcedLab}>
                      <SelectTrigger><SelectValue placeholder="Choose a lab partner..." /></SelectTrigger>
                      <SelectContent>
                        {outsourcedLabs.map(lab => (
                          <SelectItem key={lab} value={lab}>{lab}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsProcessDialogOpen(false)}>Cancel</Button>
              <Button 
                onClick={handleStartProcessing} 
                disabled={isSubmitting || (processingMethod === 'Outsourced' && !selectedOutsourcedLab)} 
                className="bg-blue-500 hover:bg-blue-600"
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Play className="h-4 w-4 mr-2" />}
                Start Processing
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Enter Results Dialog */}
        <Dialog open={isResultsDialogOpen} onOpenChange={setIsResultsDialogOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-amber-500" />
                {selectedTest?.status === 'Rejected' ? 'Rework & Resubmit Results' : 'Enter Results'}
              </DialogTitle>
              <DialogDescription>
                {selectedTest?.status === 'Rejected' 
                  ? `Edit and resubmit corrected results for ${selectedTest?.name}` 
                  : `Enter results for ${selectedTest?.name}`}
              </DialogDescription>
            </DialogHeader>
            {selectedOrder && selectedTest && (
              <div className="space-y-4 py-4">
                {selectedTest.status === 'Rejected' && (
                  <div className="p-4 rounded-lg bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800">
                    <div className="flex items-start gap-3">
                      <XCircle className="h-5 w-5 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-rose-800 dark:text-rose-200">
                          Test Rejected - Requires Correction
                        </p>
                        <p className="text-sm text-rose-700 dark:text-rose-300 mt-1">
                          This test result was rejected by the pathologist. Please review and correct the values below before resubmitting.
                        </p>
                      {selectedTest.verificationNotes && (
                          <div className="mt-3 p-2 rounded bg-rose-100 dark:bg-rose-900/40 border border-rose-300 dark:border-rose-700">
                            <p className="text-xs font-medium text-rose-800 dark:text-rose-200 mb-1">Rejection Reason:</p>
                            <p className="text-xs text-rose-700 dark:text-rose-300">
                              {selectedTest.verificationNotes.replace('REJECTED: ', '').replace(/^Rejection: /i, '')}
                            </p>
                          </div>
                        )}
                        {selectedTest.rejectedBy && selectedTest.rejectedAt && (
                          <p className="text-xs text-rose-600 dark:text-rose-400 mt-2">
                            Rejected by {selectedTest.rejectedBy} on {formatDate(selectedTest.rejectedAt)} at {formatTime(selectedTest.rejectedAt)}
                    </p>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                <div className="p-4 rounded-lg bg-muted/50 space-y-2">
                  <div className="flex justify-between"><span className="text-muted-foreground">Patient:</span><span className="font-medium">{selectedOrder.patient.name}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Test:</span><span className="font-medium">{selectedTest.name} ({selectedTest.code})</span></div>
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Processing:</span>
                    <Badge variant="outline" className={selectedTest.processingMethod === 'In-house' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-indigo-500/10 text-indigo-600'}>
                      {selectedTest.processingMethod}
                      {selectedTest.outsourcedLab && ` - ${selectedTest.outsourcedLab}`}
                    </Badge>
                  </div>
                </div>

                {/* Entry Mode Toggle - Hidden for Outsourced tests */}
                {selectedTest.processingMethod !== 'Outsourced' && (
                <div className="space-y-2">
                  <Label>Result Entry Method</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setResultEntryMode('values')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        resultEntryMode === 'values' 
                          ? 'border-amber-500 bg-amber-50 dark:bg-amber-900/20' 
                          : 'border-muted hover:border-amber-300'
                      }`}
                    >
                      <p className="font-medium text-sm">Enter Values</p>
                      <p className="text-xs text-muted-foreground">Type in result values manually</p>
                    </button>
                    <button
                      type="button"
                      onClick={() => setResultEntryMode('upload')}
                      className={`p-3 rounded-lg border-2 text-left transition-all ${
                        resultEntryMode === 'upload' 
                          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' 
                          : 'border-muted hover:border-indigo-300'
                      }`}
                    >
                      <p className="font-medium text-sm">Upload File</p>
                      <p className="text-xs text-muted-foreground">Upload PDF, image, or document</p>
                    </button>
                  </div>
                </div>
                )}

                {/* Outsourced Notice */}
                {selectedTest.processingMethod === 'Outsourced' && (
                  <div className="p-4 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800">
                    <div className="flex items-center gap-3">
                      <Truck className="h-5 w-5 text-indigo-600" />
                      <div>
                        <p className="text-sm font-medium text-indigo-800 dark:text-indigo-200">
                          Outsourced Test Results
                        </p>
                        <p className="text-sm text-indigo-700 dark:text-indigo-300">
                          Results for outsourced tests must be uploaded as files. Manual value entry is not available.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {resultEntryMode === 'values' ? (
                  <Card>
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <FlaskConical className="h-4 w-4 text-amber-500" />
                        {selectedTest.name} ({selectedTest.code})
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {(() => {
                        const tpl = getTemplateForTest(selectedTest);
                        return tpl ? tpl.fields.map(field => {
                          const value = resultValues[field.name] || '';
                          const numValue = parseFloat(value);
                          let validationStatus: 'normal' | 'warning' | 'critical' = 'normal';

                          // Basic critical value validation
                          if (!isNaN(numValue) && value.trim() !== '') {
                            if (field.name.toLowerCase().includes('glucose') && selectedTest.code === 'FBS') {
                              if (numValue < 40 || numValue > 600) validationStatus = 'critical';
                              else if (numValue < 70 || numValue > 140) validationStatus = 'warning';
                            } else if (field.name.toLowerCase().includes('glucose') && selectedTest.code === 'RBS') {
                              if (numValue < 40 || numValue > 600) validationStatus = 'critical';
                              else if (numValue < 70 || numValue > 200) validationStatus = 'warning';
                            } else if (field.name.toLowerCase().includes('hemoglobin') || field.name.toLowerCase().includes('hb')) {
                              if (numValue < 7 || numValue > 20) validationStatus = 'critical';
                              else if (numValue < 12 || numValue > 16) validationStatus = 'warning';
                            }
                          }

                          return (
                            <div key={field.name} className="space-y-1">
                              <div className="grid grid-cols-3 gap-4 items-center">
                            <Label className="text-sm">{field.name}</Label>
                            <div className="flex items-center gap-2">
                              <Input
                                    value={value}
                                onChange={(e) => setResultValues(prev => ({
                                  ...prev,
                                  [field.name]: e.target.value
                                }))}
                                placeholder="Value"
                                    className={`w-24 ${
                                      validationStatus === 'critical' ? 'border-red-500 focus:border-red-500' :
                                      validationStatus === 'warning' ? 'border-amber-500 focus:border-amber-500' : ''
                                    }`}
                              />
                              <span className="text-sm text-muted-foreground">{field.unit}</span>
                            </div>
                            <span className="text-xs text-muted-foreground">Normal: {field.normalRange}</span>
                          </div>
                              {validationStatus === 'critical' && (
                                <div className="text-xs text-red-600 dark:text-red-400 flex items-center gap-1 ml-32">
                                  <AlertTriangle className="h-3 w-3" />
                                  Critical value! Please verify and confirm.
                                </div>
                              )}
                              {validationStatus === 'warning' && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 flex items-center gap-1 ml-32">
                                  <AlertTriangle className="h-3 w-3" />
                                  Abnormal value - outside normal range.
                                </div>
                              )}
                            </div>
                          );
                        }) : (
                        <div className="space-y-2">
                          <Label>Result Value</Label>
                          <Input
                            value={resultValues['Result'] || ''}
                            onChange={(e) => setResultValues({ Result: e.target.value })}
                            placeholder="Enter result..."
                          />
                        </div>
                      );
                    })()}
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    <Label>Upload Result File</Label>
                    <div className="border-2 border-dashed rounded-lg p-6 text-center">
                      {uploadedFile ? (
                        <div className="flex items-center justify-center gap-3">
                          <FileText className="h-8 w-8 text-indigo-500" />
                          <div className="text-left">
                            <p className="font-medium">{uploadedFile.name}</p>
                            <p className="text-xs text-muted-foreground">{(uploadedFile.size / 1024).toFixed(1)} KB</p>
                          </div>
                          <Button variant="ghost" size="sm" onClick={() => setUploadedFile(null)}>
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <>
                          <Upload className="h-10 w-10 mx-auto text-muted-foreground mb-2" />
                          <p className="text-sm text-muted-foreground mb-2">Drag and drop or click to upload</p>
                          <p className="text-xs text-muted-foreground">Supports PDF, Word, Images (JPG, PNG)</p>
                          <Input
                            type="file"
                            accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                            onChange={handleFileChange}
                            className="mt-3"
                          />
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsResultsDialogOpen(false)}>Cancel</Button>
              <Button onClick={handleSubmitResults} disabled={isSubmitting} className="bg-amber-500 hover:bg-amber-600">
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-2" />}
                {selectedTest?.status === 'Rejected' ? 'Resubmit Corrected Results' : 'Submit Results'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
    </TooltipProvider>
  );
}
