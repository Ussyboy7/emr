/**
 * Central export for all API services
 */
// Export types and interfaces
export type {
  LabOrder,
  LabTest,
  LabTemplate,
  LabResult,
} from './lab-service';
export type {
  Patient,
  Visit,
  VitalReading,
} from './patient-service';
export type {
  Prescription,
  PrescriptionItem,
  Medication,
  GenericMedication,
  MedicationInventory,
  Dispense,
  DrugInteraction,
  StockRequest,
  StockRequestItem,
  StockIssue,
  StockIssueLine,
} from './pharmacy-service';
export type {
  RadiologyOrder,
  RadiologyStudy,
  RadiologyReport,
  RadiologyTemplate,
} from './radiology-service';
export type {
  ConsultationStats,
  ConsultationSession,
  ConsultationQueueItem,
  ICD10Code,
  Diagnosis,
} from './consultation-service';
export type {
  PhysioOrder,
  PhysioSession,
  PhysioTemplate,
} from './physio-service';
export type { User, Role, Clinic, Department, AuditLog } from './admin-service';
export type { Room } from './room-service';
export type { MedicalCertificate, MedicalCertificatePurpose } from './medical-certificate-service';

// Export service instances
export { default as labService } from './lab-service';
export { patientService } from './patient-service';
export { pharmacyService } from './pharmacy-service';
export { radiologyService } from './radiology-service';
export { visitService } from './visit-service';
export { roomService } from './room-service';
export { analyticsService } from './analytics-service';
export { adminService } from './admin-service';
export { helpService } from './help-service';
export { referralService } from './referral-service';
export { consultationService } from './consultation-service';
export { appointmentService } from './appointment-service';
export { wardService } from './ward-service';
export { physioService } from './physio-service';
export { nursingService } from './nursing-service';

export { medicalCertificateService } from './medical-certificate-service';

// Export utility functions
export { sanitizePatientForRendering } from './patient-service';

