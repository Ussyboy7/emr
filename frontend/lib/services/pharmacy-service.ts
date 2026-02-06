/**
 * Pharmacy API service
 */
import { apiFetch, buildQueryString } from '../api-client';
import { PHARMACY_LOCATIONS } from '@/lib/constants/pharmacy-locations';

const toFiniteNumber = (value: unknown): number | undefined => {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) return undefined;
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
};

const normalizeMedication = (med: any): Medication => {
  const minStock = toFiniteNumber(med?.min_stock_level);
  return {
    ...med,
    min_stock_level: minStock ?? 0,
  };
};

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
  medication?: number; // Optional (Brand)
  generic?: number; // Optional (Generic)
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
  generic?: {
    id: number;
    name: string;
    active_ingredient?: string;
    strength?: string;
    dosage_form?: string;
    route?: string;
    atc_code?: string | null;
  };
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

export interface GenericMedication {
  id: number;
  name: string;
  active_ingredient?: string;
  category?: string;
  strength?: string;
  dosage_form?: string;
  route?: string;
  atc_code?: string | null;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
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
  status: 'pending' | 'approved' | 'partially_fulfilled' | 'fulfilled' | 'received' | 'rejected' | 'cancelled';
  from_location: string;
  to_location: string;
  requested_by?: number;
  requested_by_name?: string;
  approved_by?: number;
  approved_by_name?: string;
  approved_at?: string;
  confirmed_by?: number;
  confirmed_by_name?: string;
  confirmed_at?: string;
  confirmed_notes?: string;
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
    return apiFetch<{ results: Prescription[]; count: number }>(`/v1/pharmacy/prescriptions/${query}`);
  }

  /**
   * Get a single prescription
   */
  async getPrescription(prescriptionId: number): Promise<Prescription> {
    return apiFetch<Prescription>(`/v1/pharmacy/prescriptions/${prescriptionId}/`);
  }

  /**
   * Create a prescription
   */
  async createPrescription(data: Partial<Prescription>): Promise<Prescription> {
    return apiFetch<Prescription>('/v1/pharmacy/prescriptions/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updatePrescription(prescriptionId: number, data: Partial<Prescription>): Promise<Prescription> {
    return apiFetch<Prescription>(`/v1/pharmacy/prescriptions/${prescriptionId}/`, {
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
    return apiFetch<Dispense>(`/v1/pharmacy/prescriptions/${prescriptionId}/dispense/`, {
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
    return apiFetch<Prescription>(`/v1/pharmacy/prescriptions/${prescriptionId}/substitute-item/`, {
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
    return apiFetch<Prescription>(`/v1/pharmacy/prescriptions/${prescriptionId}/complete_dispensing/`, {
      method: 'POST'
    });
  }

  async recalculatePrescriptionStatus(prescriptionId: string | number): Promise<Prescription> {
    return apiFetch<Prescription>(`/v1/pharmacy/prescriptions/${prescriptionId}/recalculate_status/`, {
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
    generic?: number;
  }): Promise<{ results: Medication[]; count: number }> {
    const query = buildQueryString({ ...(params || {}), __ts: Date.now() } as any);
    const res = await apiFetch<{ results: Medication[]; count: number }>(`/v1/pharmacy/medications/${query}`);
    return {
      ...res,
      results: (res.results || []).map((m: any) => normalizeMedication(m)),
    };
  }

  async getMedication(id: number): Promise<Medication> {
    const res = await apiFetch<Medication>(`/v1/pharmacy/medications/${id}/?__ts=${Date.now()}`);
    return normalizeMedication(res);
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
      location: PHARMACY_LOCATIONS.STORE,
      page_size: params?.page_size || 500,
      ...params,
    });
    
    // Extract unique medications and return
    // Since each medication may have multiple batches, deduplicate
    const medicationMap = new Map<number, Medication>();
    
    inventory.results.forEach((item: MedicationInventory) => {
      const med = item as any;
      if (med.medication && typeof med.medication === 'object') {
        medicationMap.set(med.medication.id, normalizeMedication(med.medication));
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
    generic_id?: number;
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
    const res = await apiFetch<Medication>('/v1/pharmacy/medications/', {
      method: 'POST',
      body: JSON.stringify({
        name: data.name,
        generic_id: data.generic_id ?? undefined,
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
    return normalizeMedication(res);
  }

  /**
   * Update a medication
   */
  async updateMedication(id: number, data: Partial<Medication>): Promise<Medication> {
    const res = await apiFetch<Medication>(`/v1/pharmacy/medications/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
    return normalizeMedication(res);
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
    medication__category?: string;
    stock_status?: string;
  }): Promise<{ results: MedicationInventory[]; count: number }> {
    const query = buildQueryString(params || {});
    // Use the correct inventory endpoint
    const res = await apiFetch<{ results: MedicationInventory[]; count: number }>(`/v1/pharmacy/inventory/${query}`);
    return {
      ...res,
      results: (res.results || []).map((item: any) => {
        if (item?.medication && typeof item.medication === 'object') {
          return { ...item, medication: normalizeMedication(item.medication) };
        }
        return item;
      }),
    };
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
    return apiFetch<MedicationInventory>('/v1/pharmacy/inventory/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Update inventory item
   */
  async updateInventoryItem(id: number, data: Partial<MedicationInventory>): Promise<MedicationInventory> {
    return apiFetch<MedicationInventory>(`/v1/pharmacy/inventory/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  /**
   * Get adjustment history for a batch
   */
  async getBatchAdjustmentHistory(inventoryId: number): Promise<BatchAdjustmentHistory[]> {
    return apiFetch<BatchAdjustmentHistory[]>(
      `/v1/pharmacy/inventory/${inventoryId}/adjustment_history/`
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
      `/v1/pharmacy/inventory/${inventoryId}/record_adjustment/`,
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
    return apiFetch<any>('/v1/pharmacy/medications/choices/');
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
      `/v1/pharmacy/inventory-alerts/${query}`
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
    return apiFetch<any>('/v1/pharmacy/inventory-alerts/summary/');
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
    const url = query ? `/v1/pharmacy/history/${query}` : '/v1/pharmacy/history/';
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
    return apiFetch<{ results: StockRequest[]; count: number }>(`/v1/pharmacy/stock-requests/${query}`);
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
    return apiFetch<StockRequest>('/v1/pharmacy/stock-requests/', {
      method: 'POST',
      body: JSON.stringify({
        from_location: PHARMACY_LOCATIONS.STORE,
        to_location: PHARMACY_LOCATIONS.DISPENSARY,
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
    // Fallback to PATCH if custom action is not found
    return apiFetch<StockRequest>(`/v1/pharmacy/stock-requests/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' })
    });
  }

  async rejectStockRequest(id: number): Promise<StockRequest> {
    // Fallback to PATCH if custom action is not found
    return apiFetch<StockRequest>(`/v1/pharmacy/stock-requests/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected' })
    });
  }

  async cancelStockRequest(id: number): Promise<StockRequest> {
    // Fallback to PATCH if custom action is not found
    return apiFetch<StockRequest>(`/v1/pharmacy/stock-requests/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'cancelled' })
    });
  }

  async fulfillStockRequest(id: number): Promise<{ request: StockRequest; issue: StockIssue }> {
    return apiFetch<{ request: StockRequest; issue: StockIssue }>(`/v1/pharmacy/stock-requests/${id}/fulfill/`, {
      method: 'POST',
    });
  }

  async confirmStockRequest(id: number, confirmedNotes?: string): Promise<{ message: string; request: StockRequest }> {
    return apiFetch<{ message: string; request: StockRequest }>(`/v1/pharmacy/stock-requests/${id}/confirm_receipt/`, {
      method: 'POST',
      body: JSON.stringify({ confirmed_notes: confirmedNotes || '' }),
    });
  }

  /**
   * Generics (parent medications)
   */
  async getGenerics(params?: {
    search?: string;
    route?: string;
    dosage_form?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: GenericMedication[]; count: number }> {
    const query = buildQueryString({
      ...params,
      // Add a timestamp to bust cache if needed
      __ts: Date.now()
    });
    return apiFetch<{ results: GenericMedication[]; count: number }>(`/v1/pharmacy/generics/${query}`);
  }

  /**
   * Get generics specifically for prescription creation
   * This endpoint includes available brands for each generic
   */
  async getGenericsForPrescription(params?: {
    search?: string;
    page?: number;
    page_size?: number;
  }): Promise<{ results: GenericMedication[]; count: number }> {
    const query = buildQueryString({
      ...params,
      __ts: Date.now()
    });
    console.log('[PharmacyService] Calling getGenericsForPrescription with query:', `/v1/pharmacy/generics/for_prescription/${query}`);
    try {
      const result = await apiFetch<{ results: GenericMedication[]; count: number }>(`/v1/pharmacy/generics/for_prescription/${query}`);
      console.log('[PharmacyService] getGenericsForPrescription result:', result);
      return result;
    } catch (error) {
      console.error('[PharmacyService] getGenericsForPrescription error:', error);
      throw error;
    }
  }

  async createGeneric(data: {
    name: string;
    active_ingredient?: string;
    category?: string;
    strength?: string;
    dosage_form?: string;
    route?: string;
    atc_code?: string;
  }): Promise<GenericMedication> {
    return apiFetch<GenericMedication>('/v1/pharmacy/generics/', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateGeneric(id: number, data: Partial<GenericMedication>): Promise<GenericMedication> {
    return apiFetch<GenericMedication>(`/v1/pharmacy/generics/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async deleteGeneric(id: number): Promise<void> {
    await apiFetch<void>(`/v1/pharmacy/generics/${id}/`, {
      method: 'DELETE',
    });
  }

  /**
   * Get medication batches for a medication
   */
  async getMedicationBatches(medicationId: number): Promise<MedicationBatch[]> {
    if (!medicationId) {
      console.warn('getMedicationBatches called with invalid ID:', medicationId);
      return [];
    }
    
    try {
      const inventory = await this.getInventory({
        medication: medicationId.toString(),
        location: PHARMACY_LOCATIONS.DISPENSARY,
      });
      
      return inventory.results
        .map((item: MedicationInventory) => ({
          id: item.id.toString(),
          batchNumber: item.batch_number,
          quantity: Number(item.quantity),
          expiryDate: item.expiry_date,
          receivedDate: (item as any).created_at?.split('T')[0] || '',
          supplier: item.supplier || '',
          unitCost: Number((item as any).purchase_price) || 0,
        }))
        // Sort by expiry date ascending (FEFO - First Expired First Out)
        .sort((a, b) => {
          if (!a.expiryDate) return 1;
          if (!b.expiryDate) return -1;
          return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
        });
    } catch (error) {
      console.error('Error fetching medication batches:', error);
      return [];
    }
  }

  /**
   * Get substitute medications for a medication
   */
  async getSubstitutes(medicationId: number): Promise<SubstituteOption[]> {
    // Get the medication first
    const medication = await apiFetch<Medication>(`/v1/pharmacy/medications/${medicationId}/`);
    
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
   * Get available brands for a generic medication that are in stock
   */
  async getAvailableBrands(genericId: number): Promise<Medication[]> {
    try {
      // Get medications linked to this generic that have inventory in dispensary
      const response = await apiFetch<{ results: Medication[] }>(
        `/v1/pharmacy/medications/?generic=${genericId}&page_size=100`
      );
      
      // Filter for medications that have stock in dispensary
      const medicationsWithStock = [];
      for (const med of response.results) {
        try {
          const inventory = await this.getInventory({
            medication: med.id.toString(),
            location: PHARMACY_LOCATIONS.DISPENSARY,
            page_size: 100
          });
          
          // Check if there's any non-expired stock
          const hasStock = inventory.results.some(item => 
            item.quantity > 0 && !item.is_expired
          );
          
          if (hasStock) {
            medicationsWithStock.push({
              ...med,
              available_stock: inventory.results.reduce((total, item) => 
                item.is_expired ? total : total + item.quantity, 0
              )
            });
          }
        } catch (err) {
          console.warn(`Could not check stock for ${med.name}:`, err);
        }
      }
      
      return medicationsWithStock;
    } catch (error) {
      console.error('Error fetching available brands:', error);
      return [];
    }
  }

  // Get prescription details with generic information
  async getPrescriptionWithGenerics(prescriptionId: number): Promise<any> {
    try {
      return await apiFetch<any>(`/v1/pharmacy/prescriptions/${prescriptionId}/`);
    } catch (error) {
      console.error('Error fetching prescription with generics:', error);
      throw error;
    }
  }

  // Update prescription item to select specific brand
  async selectBrandForPrescriptionItem(prescriptionItemId: number, medicationId: number): Promise<any> {
    try {
      return await apiFetch<any>(`/v1/pharmacy/prescription-items/${prescriptionItemId}/`, {
        method: 'PATCH',
        body: JSON.stringify({
          medication: medicationId
      }),
      });
    } catch (error) {
      console.error('Error selecting brand for prescription item:', error);
      throw error;
    }
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
        '/v1/pharmacy/prescriptions/check_interactions/',
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
