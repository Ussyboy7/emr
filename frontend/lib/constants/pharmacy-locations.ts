export const PHARMACY_LOCATIONS = {
  STORE: "Store",
  DISPENSARY: "Dispensary",
  WARD_CARE: "Ward Care",
  HOD_STORE: "HOD Store",
} as const;

export type PharmacyLocation = (typeof PHARMACY_LOCATIONS)[keyof typeof PHARMACY_LOCATIONS];

