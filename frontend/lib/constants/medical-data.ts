// Medical configuration data for EMR application
// This file contains medical terminology and procedure data that would typically be configurable

export interface RadiologyProcedure {
  name: string;
  category: string;
  bodyPart: string;
}

export interface ReferralFacility {
  name: string;
  type: 'Internal' | 'External';
}

export interface IVFluid {
  name: string;
  category: string;
}

// ==========================================
// ADMINISTRATION ROUTES
// ==========================================
export const ADMINISTRATION_ROUTES = [
  'Oral',
  'Sublingual',
  'Topical',
  'Inhalation',
  'Intramuscular (IM)',
  'Intravenous (IV)',
  'Subcutaneous (SC)',
  'Rectal',
  'Ophthalmic',
  'Otic'
] as const;

export const INJECTION_ROUTES = [
  'Intramuscular (IM)',
  'Intravenous (IV)',
  'Subcutaneous (SC)',
  'Intradermal (ID)'
] as const;

// ==========================================
// WOUND CARE DATA
// ==========================================
export const WOUND_TYPES = [
  'Laceration',
  'Abrasion',
  'Surgical Wound',
  'Ulcer',
  'Burn',
  'Puncture',
  'Pressure Sore',
  'Diabetic Wound',
  'Infected Wound',
  'Post-operative'
] as const;

/** Anatomical sites for wound dressing / nursing location (consultation nursing order form). */
export const WOUND_LOCATIONS = [
  'Head / scalp',
  'Face',
  'Neck',
  'Chest',
  'Abdomen',
  'Back',
  'Left upper arm',
  'Right upper arm',
  'Left forearm',
  'Right forearm',
  'Left hand',
  'Right hand',
  'Left hip',
  'Right hip',
  'Left thigh',
  'Right thigh',
  'Left knee',
  'Right knee',
  'Left lower leg',
  'Right lower leg',
  'Left foot',
  'Right foot',
  'Sacral / coccyx',
  'Other (specify in instructions)',
] as const;

export const DRESSING_SUPPLIES = [
  'Gauze',
  'Bandage',
  'Adhesive Tape',
  'Normal Saline',
  'Povidone Iodine',
  'Hydrogen Peroxide',
  'Antibiotic Ointment',
  'Wound Closure Strips',
  'Transparent Film',
  'Hydrocolloid Dressing',
  'Alginate Dressing',
  'Foam Dressing'
] as const;

// ==========================================
// IV FLUIDS
// ==========================================
export const IV_FLUIDS: IVFluid[] = [
  { name: 'Normal Saline (0.9% NaCl)', category: 'Crystalloid' },
  { name: 'Dextrose 5% in Water (D5W)', category: 'Dextrose' },
  { name: 'Dextrose Saline', category: 'Dextrose' },
  { name: 'Ringer\'s Lactate', category: 'Crystalloid' },
  { name: 'Dextrose 10% in Water', category: 'Dextrose' },
  { name: 'Half-Normal Saline (0.45% NaCl)', category: 'Crystalloid' },
];

// ==========================================
// RADIOLOGY PROCEDURES
// ==========================================
export const RADIOLOGY_PROCEDURES: RadiologyProcedure[] = [
  // X-Ray Procedures
  { name: 'Chest X-ray (PA)', category: 'X-Ray', bodyPart: 'Chest' },
  { name: 'Chest X-ray (Lateral)', category: 'X-Ray', bodyPart: 'Chest' },
  { name: 'Abdominal X-ray', category: 'X-Ray', bodyPart: 'Abdomen' },
  { name: 'Skull X-ray', category: 'X-Ray', bodyPart: 'Head' },
  { name: 'Spine X-ray (Cervical)', category: 'X-Ray', bodyPart: 'Spine' },
  { name: 'Spine X-ray (Lumbar)', category: 'X-Ray', bodyPart: 'Spine' },
  { name: 'Pelvis X-ray', category: 'X-Ray', bodyPart: 'Pelvis' },
  { name: 'Extremity X-ray', category: 'X-Ray', bodyPart: 'Limbs' },

  // Ultrasound Procedures
  { name: 'Abdominal Ultrasound', category: 'Ultrasound', bodyPart: 'Abdomen' },
  { name: 'Pelvic Ultrasound', category: 'Ultrasound', bodyPart: 'Pelvis' },
  { name: 'Obstetric Ultrasound', category: 'Ultrasound', bodyPart: 'Pelvis' },
  { name: 'Thyroid Ultrasound', category: 'Ultrasound', bodyPart: 'Neck' },
  { name: 'Breast Ultrasound', category: 'Ultrasound', bodyPart: 'Chest' },
  { name: 'Echocardiogram (Echo)', category: 'Ultrasound', bodyPart: 'Heart' },
  { name: 'Doppler Ultrasound (Vascular)', category: 'Ultrasound', bodyPart: 'Vessels' },

  // CT Scan Procedures
  { name: 'CT Scan - Head', category: 'CT Scan', bodyPart: 'Head' },
  { name: 'CT Scan - Chest', category: 'CT Scan', bodyPart: 'Chest' },
  { name: 'CT Scan - Abdomen/Pelvis', category: 'CT Scan', bodyPart: 'Abdomen' },
  { name: 'CT Scan - Spine', category: 'CT Scan', bodyPart: 'Spine' },

  // MRI Procedures
  { name: 'MRI - Brain', category: 'MRI', bodyPart: 'Head' },
  { name: 'MRI - Spine', category: 'MRI', bodyPart: 'Spine' },
  { name: 'MRI - Knee', category: 'MRI', bodyPart: 'Limbs' },
  { name: 'MRI - Shoulder', category: 'MRI', bodyPart: 'Limbs' },

  // Other Procedures
  { name: 'Mammography', category: 'Mammography', bodyPart: 'Chest' },
  { name: 'Fluoroscopy - Barium Swallow', category: 'Fluoroscopy', bodyPart: 'GI Tract' },
  { name: 'Fluoroscopy - Barium Enema', category: 'Fluoroscopy', bodyPart: 'GI Tract' },
];

// ==========================================
// REFERRAL DATA
// ==========================================
export const REFERRAL_SPECIALTIES = [
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
  'Nutrition/Dietetics'
] as const;

export const REFERRAL_FACILITIES: ReferralFacility[] = [
  // External Facilities
  { name: 'Federal Medical Centre, Ebute Meta, Lagos', type: 'External' },
  { name: 'Lagos University Teaching Hospital (LUTH)', type: 'External' },
  { name: 'Federal Medical Center, Lokoja', type: 'External' },
  { name: 'Jos University Teach Hosp. (JUTH) Jos', type: 'External' },
  { name: 'Federal Medical Center, Gombe', type: 'External' },
  { name: 'University Of Maiduguri Teaching Hospital, Maiduguri', type: 'External' },
  { name: 'Federal Medical Center, Jalingo', type: 'External' },
  { name: 'Federal Medical Center, Birnin-Kebbi', type: 'External' },
  { name: 'Aminu Kano Teaching Hospital, Kano', type: 'External' },
  { name: 'Federal Medical Center, Owo', type: 'External' },
  { name: 'Bowen University Teaching Hospital, Ogbomosho', type: 'External' },
  { name: 'Federal medical center, Asaba', type: 'External' },
  { name: 'Nigerian Navy Hospital, Calabar', type: 'External' },
  { name: 'Federal Medical Center Owerri', type: 'External' },
  { name: 'University Of Nigeria Teaching Hospital, Enugu', type: 'External' },
  { name: 'Hospital, Enugu Army Reference Hospital, Kaduna', type: 'External' },
  { name: 'Other', type: 'External' },
];

export const REFERRAL_REASONS = [
  'Specialist consultation required',
  'Advanced diagnostic workup',
  'Surgical intervention needed',
  'Second opinion requested',
  'Specialized treatment/therapy',
  'Emergency/Urgent care',
  'Follow-up care',
  'Rehabilitation services',
] as const;

// ==========================================
// UTILITY FUNCTIONS
// ==========================================
export function getRadiologyProceduresByCategory(category: string): RadiologyProcedure[] {
  return RADIOLOGY_PROCEDURES.filter(proc => proc.category === category);
}

export function getRadiologyCategories(): string[] {
  return [...new Set(RADIOLOGY_PROCEDURES.map(proc => proc.category))];
}

export function getReferralFacilitiesByType(type: 'Internal' | 'External'): ReferralFacility[] {
  return REFERRAL_FACILITIES.filter(facility => facility.type === type);
}