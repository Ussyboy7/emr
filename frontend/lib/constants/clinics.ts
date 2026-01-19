/**
 * Standardized clinic constants for the EMR system.
 * This is the single source of truth for clinic names across the application.
 */

export const CLINICS = [
  "GOPD",
  "Physiotherapy",
  "Eye Clinic",
  "Sickle Cell",
  "Diamond",
  "Healthron",
  "Dental",
] as const;

export type ClinicName = typeof CLINICS[number];

/**
 * Clinic display labels (for UI where more descriptive names are needed)
 */
export const CLINIC_LABELS: Record<ClinicName, string> = {
  "GOPD": "General Out-Patient Department",
  "Physiotherapy": "Physiotherapy Clinic",
  "Eye Clinic": "Eye Clinic",
  "Sickle Cell": "Sickle Cell Clinic",
  "Diamond": "Diamond Club Clinic",
  "Healthron": "Healthron Clinic",
  "Dental": "Dental Clinic",
};

/**
 * Get all clinics including "All Clinics" option for filters
 */
export const getAllClinicsWithAll = (): string[] => {
  return ["All Clinics", ...CLINICS];
};

/**
 * Get clinic label for display
 */
export const getClinicLabel = (clinic: string): string => {
  return CLINIC_LABELS[clinic as ClinicName] || clinic;
};

