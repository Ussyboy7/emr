"""
Admin configuration for the Pharmacy app.
"""
from django.contrib import admin
from .models import Medication, MedicationInventory, Prescription, PrescriptionItem, Dispense


@admin.register(Medication)
class MedicationAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'generic_name', 'form', 'is_active', 'created_at']
    list_filter = ['form', 'is_active']
    search_fields = ['name', 'generic_name', 'code']


@admin.register(MedicationInventory)
class MedicationInventoryAdmin(admin.ModelAdmin):
    list_display = ['medication', 'batch_number', 'quantity', 'expiry_date', 'is_low_stock', 'is_expired']
    list_filter = ['expiry_date', 'location']
    search_fields = ['medication__name', 'batch_number']


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ['prescription_id', 'patient', 'doctor', 'status', 'prescribed_at']
    list_filter = ['status', 'prescribed_at']
    search_fields = ['prescription_id', 'patient__surname', 'patient__first_name']


@admin.register(PrescriptionItem)
class PrescriptionItemAdmin(admin.ModelAdmin):
    list_display = ['prescription', 'medication', 'quantity', 'unit', 'is_dispensed']
    list_filter = ['is_dispensed']
    search_fields = ['prescription__prescription_id', 'medication__name']


@admin.register(Dispense)
class DispenseAdmin(admin.ModelAdmin):
    list_display = ['dispense_id', 'medication', 'quantity', 'dispensed_by', 'dispensed_at']
    list_filter = ['dispensed_at']
    search_fields = ['dispense_id', 'medication__name', 'prescription__prescription_id']

