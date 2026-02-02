/**
 * Pharmacy API service
 */
import { apiFetch, buildQueryString } from '../api-client';

export interface Prescription {
  id: number;
  prescription_id: string;
  patient: number;
  patient_name?: string;
  patient_details?: any; // Additional patient information (optional)
  doctor?: number;
  doctor_name?: string;
  visit?: number;
  clinic?: string;
  location?: string;
  date?: string;
  time?: string;
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
  unit?: string; // Made optional since transformMedications might not provide it
  dosage?: string;
  frequency?: string;
  duration?: string;
  instructions?: string;
  dispensed_quantity: number;
  is_dispensed: boolean;
  // Frontend-calculated properties
  remaining_quantity?: number;
  substitution?: any;
  originalMedication?: any;
  stockLevel?: number;
  medication_details?: any;
}

export interface Medication {
  id: number;
  name: string;
  generic_name?: string;
  code: string;
  unit: string;
  strength?: string;
  form?: string;
  category?: string;
  manufacturer?: string;
  pack_size?: number;
  prescription_required?: boolean;
  min_stock_level?: number;
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
  received_unit_type?: string;
  received_unit_quantity?: number;
  is_low_stock?: boolean;
  is_expired?: boolean;
}

export interface BatchAdjustmentHistory {
  id: number;
  batch_inventory: number;
  medication_name?: string;
  batch_number?: string;
  quantity_before: number;
  quantity_after: number;
  quantity_unit: string;
  adjustment_reason: string;
  reason_display?: string;
  adjustment_notes?: string;
  received_unit_type?: string;
  received_unit_quantity?: number;
  created_by?: number;
  created_by_name?: string;
  created_at: string;
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

export interface StockRequestItem {
  id?: number;
  request?: number;
  medication: number;
  medication_name?: string;
  quantity: number;
  unit?: string;
  fulfilled_quantity?: number;
  notes?: string;
}

export interface StockRequest {
  id: number;
  request_id: string;
  status: 'pending' | 'approved' | 'partially_fulfilled' | 'fulfilled' | 'rejected' | 'cancelled';
  from_location: string;
  to_location: string;
  requested_by?: number;
  requested_by_name?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
  items: StockRequestItem[];
}

export interface StockIssueLine {
  id: number;
  issue: number;
  medication: number;
  medication_name?: string;
  source_inventory_item: number;
  destination_inventory_item: number;
  source_batch?: string;
  source_expiry?: string;
  quantity: number;
  unit?: string;
}

export interface StockIssue {
  id: number;
  issue_id: string;
  request?: number;
  issued_by?: number;
  issued_by_name?: string;
  issued_at: string;
  notes?: string;
  lines: StockIssueLine[];
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
    consultation_session?: number;
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

  async updatePrescription(prescriptionId: number, data: Partial<Prescription>): Promise<Prescription> {
    return apiFetch<Prescription>(`/pharmacy/prescriptions/${prescriptionId}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async updatePrescriptionStatus(prescriptionId: number, status: Prescription['status'], notes?: string): Promise<Prescription> {
    return this.updatePrescription(prescriptionId, { status, notes });
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

  async substitutePrescriptionItem(
    prescriptionId: string | number,
    itemId: string | number,
    newMedicationId: string | number,
    reason: string,
    notes: string
  ): Promise<Prescription> {
    return apiFetch<Prescription>(`/pharmacy/prescriptions/${prescriptionId}/substitute-item/`, {
      method: 'POST',
      body: JSON.stringify({
        item_id: itemId,
        new_medication_id: newMedicationId,
        reason: reason,
        notes: notes
      })
    });
  }

  async markPrescriptionAsCompleted(prescriptionId: string | number): Promise<Prescription> {
    return apiFetch<Prescription>(`/pharmacy/prescriptions/${prescriptionId}/complete_dispensing/`, {
      method: 'POST'
    });
  }

  async recalculatePrescriptionStatus(prescriptionId: string | number): Promise<Prescription> {
    return apiFetch<Prescription>(`/pharmacy/prescriptions/${prescriptionId}/recalculate_status/`, {
      method: 'POST'
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
   * Get medications for prescription (from Store master list)
   * Doctor sees all available medications in the hospital
   */
  async getMedicationsForPrescription(params?: {
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: Medication[]; count: number }> {
    const query = buildQueryString(params || {});
    // Get inventory from Store location (the master list)
    const inventory = await this.getInventory({
      location: "Store",
      page_size: params?.page_size || 500,
      ...params,
    });
    
    // Extract unique medications and return
    // Since each medication may have multiple batches, deduplicate
    const medicationMap = new Map<number, Medication>();
    
    inventory.results.forEach((item: MedicationInventory) => {
      const med = item as any;
      if (med.medication && typeof med.medication === 'object') {
        medicationMap.set(med.medication.id, med.medication);
      }
    });
    
    return {
      results: Array.from(medicationMap.values()),
      count: medicationMap.size,
    };
  }

  /**
   * Create a medication (master data)
   */
  async createMedication(data: {
    name: string;
    generic_name?: string;
    code: string;
    unit: string;
    strength?: string;
    form?: string;
    category?: string;
    manufacturer?: string;
    pack_size?: number;
    prescription_required?: boolean;
    min_stock_level?: number;
    is_active?: boolean;
  }): Promise<Medication> {
    return apiFetch<Medication>('/pharmacy/medications/', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        generic_name: data.generic_name || '',
        code: data.code,
        unit: data.unit,
        strength: data.strength || '',
        form: data.form || '',
        category: data.category || '',
        manufacturer: data.manufacturer || '',
        pack_size: data.pack_size ?? null,
        prescription_required: !!data.prescription_required,
        min_stock_level: data.min_stock_level ?? 0,
        is_active: data.is_active ?? true,
      }),
    });
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
    // Use the correct inventory endpoint
    return await apiFetch<{ results: MedicationInventory[]; count: number }>(`/pharmacy/inventory/${query}`);
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
   * Get adjustment history for a batch
   */
  async getBatchAdjustmentHistory(inventoryId: number): Promise<BatchAdjustmentHistory[]> {
    return apiFetch<BatchAdjustmentHistory[]>(
      `/pharmacy/inventory/${inventoryId}/adjustment_history/`
    );
  }

  /**
   * Record a quantity adjustment for a batch
   */
  async recordBatchAdjustment(
    inventoryId: number,
    data: {
      quantity_after: number;
      adjustment_reason: string;
      adjustment_notes?: string;
    }
  ): Promise<BatchAdjustmentHistory> {
    return apiFetch<BatchAdjustmentHistory>(
      `/pharmacy/inventory/${inventoryId}/record_adjustment/`,
      {
        method: 'POST',
        body: JSON.stringify(data),
      }
    );
  }

  /**
   * Get medication field choices (dropdowns)
   */
  async getMedicationChoices(): Promise<{
    strength: Record<string, string>;
    form: Record<string, string>;
    category: Record<string, string>;
  }> {
    return apiFetch<any>('/pharmacy/medications/choices/');
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
    const url = query ? `/pharmacy/history/${query}` : '/pharmacy/history/';
    return await apiFetch<{ results: Dispense[]; count: number }>(url);
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
   * Stock requests (Inventory -> Store)
   */
  async getStockRequests(params?: {
    status?: string;
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: StockRequest[]; count: number }> {
    const query = buildQueryString(params || {});
    return apiFetch<{ results: StockRequest[]; count: number }>(`/pharmacy/stock-requests/${query}`);
  }

  async createStockRequest(data: {
    notes?: string;
    items: Array<{
      medication: number;
      quantity: number;
      unit?: string;
      notes?: string;
    }>;
  }): Promise<StockRequest> {
    return apiFetch<StockRequest>('/pharmacy/stock-requests/', {
      method: 'POST',
      body: JSON.stringify({
        from_location: 'Store',
        to_location: 'Dispensary',
        notes: data.notes || '',
        items: data.items.map((i) => ({
          medication: i.medication,
          quantity: i.quantity,
          unit: i.unit || 'unit',
          notes: i.notes || '',
        })),
      }),
    });
  }

  async approveStockRequest(id: number): Promise<StockRequest> {
    return apiFetch<StockRequest>(`/pharmacy/stock-requests/${id}/approve/`, { method: 'POST' });
  }

  async rejectStockRequest(id: number): Promise<StockRequest> {
    return apiFetch<StockRequest>(`/pharmacy/stock-requests/${id}/reject/`, { method: 'POST' });
  }

  async cancelStockRequest(id: number): Promise<StockRequest> {
    return apiFetch<StockRequest>(`/pharmacy/stock-requests/${id}/cancel/`, { method: 'POST' });
  }

  async fulfillStockRequest(id: number): Promise<{ request: StockRequest; issue: StockIssue }> {
    return apiFetch<{ request: StockRequest; issue: StockIssue }>(`/pharmacy/stock-requests/${id}/fulfill/`, {
      method: 'POST',
    });
  }

  /**
   * Get medication batches for a medication
   */
  async getMedicationBatches(medicationId: number): Promise<MedicationBatch[]> {
    const inventory = await this.getInventory({
      medication: medicationId.toString(),
      location: "Dispensary"  // Get dispensary stock for dispensing
    });
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
    if (!medicationIds || medicationIds.length < 2) {
      return [];
    }
    
    try {
      const response = await apiFetch<{ interactions: DrugInteraction[] }>(
        '/pharmacy/prescriptions/check_interactions/',
        {
          method: 'POST',
          body: JSON.stringify({ medication_ids: medicationIds }),
        }
      );
      return response.interactions || [];
    } catch (error) {
      console.error('Error checking drug interactions:', error);
      return [];
    }
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

export interface DrugInteraction {
  drug1: string;
  drug2: string;
  severity: 'Major' | 'Moderate' | 'Minor';
  description: string;
  recommendation: string;
}

export const pharmacyService = new PharmacyService();

