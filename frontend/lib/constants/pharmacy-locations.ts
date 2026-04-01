export const PHARMACY_LOCATIONS = {
  STORE: "Store",
  DISPENSARY: "Dispensary",
  WARD_CARE: "Ward Care",
} as const;

export type PharmacyLocation = (typeof PHARMACY_LOCATIONS)[keyof typeof PHARMACY_LOCATIONS];

