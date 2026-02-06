export const PHARMACY_LOCATIONS = {
  STORE: "Store",
  DISPENSARY: "Dispensary",
} as const;

export type PharmacyLocation = (typeof PHARMACY_LOCATIONS)[keyof typeof PHARMACY_LOCATIONS];

