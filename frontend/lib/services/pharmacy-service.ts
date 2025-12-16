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
    page_size?: number;
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
    page_size?: number;
  }): Promise<{ results: Medication[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: Medication[]; count: number }>(`/pharmacy/medications/${query}`);
  }

  /**
   * Update a medication
   */
  async updateMedication(id: number, data: Partial<Medication>): Promise<Medication> {
    return apiFetch<Medication>(`/pharmacy/medications/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get medication inventory
   */
  async getInventory(params?: {
    medication?: string;
    location?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: MedicationInventory[]; count: number }> {
    const query = buildQueryString(params || {});
    // Try medication-inventory first, fallback to inventory
    try {
      return await apiFetch<{ results: MedicationInventory[]; count: number }>(`/pharmacy/medication-inventory/${query}`);
    } catch {
      return await apiFetch<{ results: MedicationInventory[]; count: number }>(`/pharmacy/inventory/${query}`);
    }
  }

  /**
   * Create/add inventory item
   */
  async createInventoryItem(data: {
    medication: number;
    batch_number: string;
    expiry_date: string;
    quantity: number;
    unit: string;
    min_stock_level?: number;
    location?: string;
    supplier?: string;
    purchase_price?: number;
  }): Promise<MedicationInventory> {
    return apiFetch<MedicationInventory>('/pharmacy/inventory/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update inventory item
   */
  async updateInventoryItem(id: number, data: Partial<MedicationInventory>): Promise<MedicationInventory> {
    return apiFetch<MedicationInventory>(`/pharmacy/inventory/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get inventory alerts
   */
  async getInventoryAlerts(params?: {
    type?: 'low_stock' | 'expiring' | 'expired' | 'all';
    page?: number;
    page_size?: number;
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
    page_size?: number;
  }): Promise<{ results: Dispense[]; count: number }> {
    const query = buildQueryString(params || {});
    // Try dispenses endpoint first, fallback to history
    try {
      return await apiFetch<{ results: Dispense[]; count: number }>(`/pharmacy/dispenses/${query}`);
    } catch {
      return await apiFetch<{ results: Dispense[]; count: number }>(`/pharmacy/history/${query}`);
    }
  }

  /**
   * Get pharmacy statistics
   */
  async getStats(): Promise<{
    pendingRx: number;
    dispensedToday: number;
    lowStock: number;
    totalInventory: number;
  }> {
    // Get pending prescriptions
    const pendingResponse = await this.getPrescriptions({ status: 'pending', page: 1 });
    const pendingRx = pendingResponse.count || pendingResponse.results.length;
    
    // Get dispensed today
    const today = new Date().toISOString().split('T')[0];
    const dispensedResponse = await this.getPrescriptions({ status: 'dispensed', page: 1 });
    const dispensedToday = dispensedResponse.results.filter((rx: Prescription) => {
      if (rx.dispensed_at) {
        return rx.dispensed_at.split('T')[0] === today;
      }
      return false;
    }).length;
    
    // Get inventory alerts
    const alertsResponse = await this.getInventoryAlertSummary();
    const lowStock = alertsResponse.low_stock_count || 0;
    
    // Get total inventory items
    const inventoryResponse = await this.getInventory({ page: 1 });
    const totalInventory = inventoryResponse.count || inventoryResponse.results.length;
    
    return {
      pendingRx,
      dispensedToday,
      lowStock,
      totalInventory,
    };
  }

  /**
   * Get medication batches for a medication
   */
  async getMedicationBatches(medicationId: number): Promise<MedicationBatch[]> {
    const inventory = await this.getInventory({ medication: medicationId.toString() });
    return inventory.results.map((item: MedicationInventory) => ({
      id: item.id.toString(),
      batchNumber: item.batch_number,
      quantity: Number(item.quantity),
      expiryDate: item.expiry_date,
      receivedDate: (item as any).created_at?.split('T')[0] || '',
      supplier: item.supplier || '',
      unitCost: Number((item as any).purchase_price) || 0,
    }));
  }

  /**
   * Get substitute medications for a medication
   */
  async getSubstitutes(medicationId: number): Promise<SubstituteOption[]> {
    // Get the medication first
    const medication = await apiFetch<Medication>(`/pharmacy/medications/${medicationId}/`);
    
    // Search for medications with same generic name or similar
    const substitutes = await this.getMedications({ 
      search: medication.generic_name || medication.name,
      page: 1 
    });
    
    // Filter out the same medication and transform
    return substitutes.results
      .filter(m => m.id !== medicationId)
      .map(m => ({
        id: m.id.toString(),
        name: m.name,
        type: m.generic_name ? 'generic' : 'brand',
        stock: 0, // Would need to get from inventory
        expiryDate: '',
        unitPrice: 0,
        isNearExpiry: false,
        daysToExpiry: 0,
      }));
  }

  /**
   * Check drug interactions
   */
  async checkInteractions(medicationIds: number[]): Promise<DrugInteraction[]> {
    // TODO: Implement API call for drug interaction checking
    // For now, return empty array
    return [];
  }
}

interface MedicationBatch {
  id: string;
  batchNumber: string;
  quantity: number;
  expiryDate: string;
  receivedDate: string;
  supplier: string;
  unitCost: number;
}

interface SubstituteOption {
  id: string;
  name: string;
  type: 'generic' | 'brand' | 'alternative';
  stock: number;
  expiryDate: string;
  unitPrice: number;
  isNearExpiry: boolean;
  daysToExpiry: number;
}

interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'Major' | 'Moderate' | 'Minor';
  description: string;
  recommendation: string;
}

export const pharmacyService = new PharmacyService();

