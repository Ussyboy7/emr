/**
 * Pharmacy API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface Prescription {
  id: number;
  prescription_id: string;
  patient: number;
  patient_name?: string;
  doctor?: number;
  doctor_name?: string;
  visit?: number;
  status: 'pending' | 'dispensing' | 'partially_dispensed' | 'dispensed' | 'cancelled';
  diagnosis?: string;
  notes?: string;
  medications: PrescriptionItem[];
  prescribed_at: string;
  dispensed_at?: string;
}

export interface PrescriptionItem {
  id: number;
  prescription: number;
  medication: number;
  medication_name?: string;
  quantity: number;
  unit: string;
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  dispensed_quantity: number;
  is_dispensed: boolean;
}

export interface Medication {
  id: number;
  name: string;
  generic_name?: string;
  code: string;
  unit: string;
  strength?: string;
  form?: string;
  is_active: boolean;
}

export interface MedicationInventory {
  id: number;
  medication: number;
  medication_name?: string;
  batch_number: string;
  expiry_date: string;
  quantity: number;
  unit: string;
  min_stock_level: number;
  location?: string;
  supplier?: string;
  is_low_stock?: boolean;
  is_expired?: boolean;
}

export interface Dispense {
  id: number;
  dispense_id: string;
  prescription: number;
  medication: number;
  medication_name?: string;
  quantity: number;
  unit: string;
  batch_number?: string;
  dispensed_by?: number;
  dispensed_by_name?: string;
  dispensed_at: string;
}

class PharmacyService {
  /**
   * Get all prescriptions
   */
  async getPrescriptions(params?: {
    patient?: string;
    doctor?: string;
    status?: string;
    search?: string;
    page?: number;
  }): Promise<{ results: Prescription[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Prescription[]; count: number }>(`/pharmacy/prescriptions/${query}`);
  }

  /**
   * Get a single prescription
   */
  async getPrescription(prescriptionId: number): Promise<Prescription> {
    return apiFetch<Prescription>(`/pharmacy/prescriptions/${prescriptionId}/`);
  }

  /**
   * Create a prescription
   */
  async createPrescription(data: Partial<Prescription>): Promise<Prescription> {
    return apiFetch<Prescription>('/pharmacy/prescriptions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Dispense medication from a prescription
   */
  async dispense(
    prescriptionId: number,
    itemId: number,
    quantity: number,
    inventoryId?: number,
    notes?: string
  ): Promise<Dispense> {
    return apiFetch<Dispense>(`/pharmacy/prescriptions/${prescriptionId}/dispense/`, {
      method: 'POST',
      body: JSON.stringify({
        item_id: itemId,
        quantity,
        inventory_id: inventoryId,
        notes: notes || '',
      }),
    });
  }

  /**
   * Get medications
   */
  async getMedications(params?: {
    form?: string;
    search?: string;
    page?: number;
  }): Promise<{ results: Medication[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Medication[]; count: number }>(`/pharmacy/medications/${query}`);
  }

  /**
   * Get medication inventory
   */
  async getInventory(params?: {
    medication?: string;
    location?: string;
    search?: string;
    page?: number;
  }): Promise<{ results: MedicationInventory[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: MedicationInventory[]; count: number }>(`/pharmacy/inventory/${query}`);
  }

  /**
   * Get inventory alerts
   */
  async getInventoryAlerts(params?: {
    type?: 'low_stock' | 'expiring' | 'expired' | 'all';
    page?: number;
  }): Promise<{ results: MedicationInventory[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: MedicationInventory[]; count: number }>(
      `/pharmacy/inventory-alerts/${query}`
    );
  }

  /**
   * Get inventory alert summary
   */
  async getInventoryAlertSummary(): Promise<{
    low_stock_count: number;
    expiring_count: number;
    expired_count: number;
    total_alerts: number;
  }> {
    return apiFetch<any>('/pharmacy/inventory-alerts/summary/');
  }

  /**
   * Get dispense history
   */
  async getDispenseHistory(params?: {
    prescription?: string;
    medication?: string;
    page?: number;
  }): Promise<{ results: Dispense[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Dispense[]; count: number }>(`/pharmacy/history/${query}`);
  }
}

export const pharmacyService = new PharmacyService();

