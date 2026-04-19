// Common TypeScript interfaces for EMR system
// This file contains shared types used across the application

// API Response types
export interface ApiResponse<T> {
  results?: T[];
  count?: number;
  next?: string | null;
  previous?: string | null;
  [key: string]: unknown;
}

// Common entity fields
export interface BaseEntity {
  id: number | string;
  created_at?: string;
  updated_at?: string;
  is_active?: boolean;
}

// Medication related types
export interface Medication {
  id: number;
  name: string;
  generic_name?: string;
  strength?: string;
  dosage_form?: string;
  manufacturer?: string;
  min_stock_level?: number;
  max_stock_level?: number;
  current_stock?: number;
  unit_price?: number;
  requires_prescription?: boolean;
  is_active: boolean;
}

export interface MedicationBatch {
  id: number;
  medication: number | Medication;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit_cost?: number;
  supplier?: string;
  received_date: string;
}

// Patient related types
export interface Patient {
  id: number;
  first_name: string;
  last_name: string;
  middle_name?: string;
  date_of_birth: string;
  gender: 'M' | 'F' | 'O';
  phone?: string;
  email?: string;
  address?: string;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  blood_type?: string;
  allergies?: string[];
  medical_conditions?: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// Laboratory types
export interface LabOrder {
  id: number;
  patient: number | Patient;
  ordered_by: number;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: string;
  order_date: string;
  notes?: string;
  tests: LabTest[];
}

export interface LabTest {
  id: number;
  lab_order: number;
  test_name: string;
  test_code?: string;
  status: string;
  result?: string;
  result_date?: string;
  reference_range?: string;
  units?: string;
  notes?: string;
  is_abnormal?: boolean;
}

// Radiology types
export interface RadiologyOrder {
  id: number;
  patient: number | Patient;
  procedure: string;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: string;
  order_date: string;
  notes?: string;
  studies?: RadiologyStudy[];
}

export interface RadiologyStudy {
  id: number;
  radiology_order: number;
  study_date: string;
  modality: string;
  body_part: string;
  findings?: string;
  impression?: string;
  status: string;
}

// Prescription types
export interface Prescription {
  id: number;
  patient: number | Patient;
  prescribed_by: number;
  prescription_date: string;
  notes?: string;
  items: PrescriptionItem[];
  created_at?: string;
  prescribed_at?: string;
}

export interface PrescriptionItem {
  id: number;
  prescription: number;
  medication: number | Medication;
  dosage: string;
  frequency: string;
  duration: string;
  quantity: number;
  instructions?: string;
  status: string;
}

// Vital signs types
export interface VitalSigns {
  id: number;
  patient: number | Patient;
  recorded_by: number;
  recorded_at: string;
  temperature?: number;
  blood_pressure_systolic?: number;
  blood_pressure_diastolic?: number;
  heart_rate?: number;
  respiratory_rate?: number;
  oxygen_saturation?: number;
  weight?: number;
  height?: number;
  bmi?: number;
  notes?: string;
}

// Generic API parameter types
export interface PaginationParams {
  page?: number;
  page_size?: number;
  search?: string;
  ordering?: string;
}

export interface DateRangeParams {
  start_date?: string;
  end_date?: string;
  end_date_inclusive?: boolean;
}

// Error types
export interface ApiError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

// Form data types (for updates)
export type PartialUpdate<T> = {
  [K in keyof T]?: T[K];
};

// Utility types for API responses
export type ApiListResponse<T> = ApiResponse<T>;
export type ApiDetailResponse<T> = T;

// Status types
export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type Priority = 'low' | 'normal' | 'high' | 'urgent';