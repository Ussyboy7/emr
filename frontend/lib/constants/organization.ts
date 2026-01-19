// Organization-specific configuration for EMR application
// This file contains organization-specific data that may vary between deployments

import { NPA_BRAND_NAME } from '@/lib/branding';

// ==========================================
// ORGANIZATION DETAILS
// ==========================================
export const ORGANIZATION_CONFIG = {
  name: NPA_BRAND_NAME,
  fullName: 'Nigerian Ports Authority',

  // Department names
  medicalServicesDepartment: 'Medical Services Department',
  medicalLaboratoryServices: 'Medical Laboratory Services',
  medicalServices: 'Medical Services',

  // Contact information (should be moved to environment variables in production)
  supportEmail: 'emr-support@nigerianports.gov.ng',
  contactEmail: 'medical@npa.gov.ng',

  // Geographic locations
  locations: [
    'Lagos',
    'Port Harcourt',
    'Calabar',
    'Abuja',
    'Ibadan'
  ] as const,

  // Default timezone
  timezone: 'Africa/Lagos',

  // Currency
  currency: 'NGN',

  // Date/Time formats
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
} as const;

// ==========================================
// FACILITY CONFIGURATION
// ==========================================
export const FACILITY_CONFIG = {
  // Main facility information
  name: 'NPA Medical Center',
  code: 'NPA-MC-001',
  address: 'Marina, Lagos, Nigeria',
  phone: '+234 1 234 5678',

  // Specialty departments
  departments: [
    'General Medicine',
    'Cardiology',
    'Orthopedics',
    'Neurology',
    'Dermatology',
    'ENT (Otolaryngology)',
    'Ophthalmology',
    'Psychiatry',
    'Urology',
    'Gastroenterology',
    'Pulmonology',
    'Nephrology',
    'Endocrinology',
    'Rheumatology',
    'Oncology',
    'Hematology',
    'Obstetrics & Gynecology',
    'Pediatrics',
    'General Surgery',
    'Plastic Surgery',
    'Physiotherapy',
    'Dental',
    'Nutrition/Dietetics',
    'Laboratory',
    'Radiology',
    'Pharmacy',
    'Nursing'
  ] as const,

  // Room/clinic types
  clinicTypes: [
    'General Outpatient (GOPD)',
    'Specialist Clinic',
    'Emergency Department',
    'Laboratory',
    'Radiology',
    'Pharmacy',
    'Consultation Room'
  ] as const,
} as const;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
export function getOrganizationHeader(): string {
  return `${ORGANIZATION_CONFIG.name} • ${ORGANIZATION_CONFIG.medicalServicesDepartment}`;
}

export function getOrganizationLabHeader(): string {
  return `${ORGANIZATION_CONFIG.name} • ${ORGANIZATION_CONFIG.medicalLaboratoryServices}`;
}

export function getOrganizationServicesHeader(): string {
  return `${ORGANIZATION_CONFIG.name} • ${ORGANIZATION_CONFIG.medicalServices}`;
}