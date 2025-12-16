/**
 * Utility functions for clinic name normalization and comparison.
 * Ensures consistent handling of clinic names across the application.
 */

import { CLINICS } from '@/lib/constants/clinics';

/**
 * Normalize clinic name to standard format (title case).
 * Handles various input formats and converts to canonical clinic name.
 * 
 * @param clinic - Raw clinic name from API or user input
 * @returns Normalized clinic name matching one of the standard clinics, or the input if no match
 */
export const normalizeClinicName = (clinic: string | null | undefined): string => {
  if (!clinic || !clinic.trim()) {
    return 'General'; // Default clinic
  }

  const trimmed = clinic.trim();
  
  // Convert to title case (first letter uppercase, rest lowercase)
  const titleCase = trimmed.charAt(0).toUpperCase() + trimmed.slice(1).toLowerCase();
  
  // Try to match against standard clinics (case-insensitive)
  const matched = CLINICS.find(c => 
    c.toLowerCase() === titleCase.toLowerCase() ||
    c.toLowerCase() === trimmed.toLowerCase()
  );
  
  if (matched) {
    return matched;
  }
  
  // Handle common variations
  const variations: Record<string, string> = {
    'eye': 'Eye Clinic',
    'eye clinic': 'Eye Clinic',
    'ophthalmology': 'Eye Clinic',
    'sickle cell': 'Sickle Cell',
    'sickle cell clinic': 'Sickle Cell',
    'diamond': 'Diamond',
    'diamond club': 'Diamond',
    'diamond club clinic': 'Diamond',
    'physiotherapy': 'Physiotherapy',
    'physiotherapy clinic': 'Physiotherapy',
    'general': 'General',
    'general clinic': 'General',
  };
  
  const lower = trimmed.toLowerCase();
  if (variations[lower]) {
    return variations[lower];
  }
  
  // If no match found, return title case version
  return titleCase;
};

/**
 * Check if two clinic names match (case-insensitive).
 * 
 * @param clinic1 - First clinic name
 * @param clinic2 - Second clinic name
 * @returns True if clinics match after normalization
 */
export const clinicMatches = (clinic1: string | null | undefined, clinic2: string | null | undefined): boolean => {
  if (!clinic1 || !clinic2) return false;
  return normalizeClinicName(clinic1) === normalizeClinicName(clinic2);
};

/**
 * Check if a clinic name is valid (matches one of the standard clinics).
 * 
 * @param clinic - Clinic name to validate
 * @returns True if clinic is in the standard list
 */
export const isValidClinic = (clinic: string | null | undefined): boolean => {
  if (!clinic) return false;
  const normalized = normalizeClinicName(clinic);
  return CLINICS.includes(normalized as any);
};

/**
 * Get clinic value for API/filter usage.
 * Normalizes the clinic name and returns it in a consistent format.
 * 
 * @param clinic - Clinic name
 * @returns Normalized clinic name for API usage
 */
export const getClinicValue = (clinic: string | null | undefined): string => {
  return normalizeClinicName(clinic);
};

