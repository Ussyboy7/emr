"""
Admin configuration for the Patients app.
"""
from django.contrib import admin
from .models import Patient, Visit, VitalReading, MedicalHistory


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ['patient_id', 'get_full_name', 'category', 'gender', 'age', 'phone', 'is_active', 'created_at']
    list_filter = ['category', 'gender', 'blood_group', 'is_active', 'created_at']
    search_fields = ['patient_id', 'surname', 'first_name', 'middle_name', 'personal_number', 'phone', 'email']
    readonly_fields = ['patient_id', 'created_at', 'updated_at', 'age']
    fieldsets = (
        ('Identification', {
            'fields': ('patient_id', 'category', 'is_active')
        }),
        ('Personal Information', {
            'fields': ('title', 'surname', 'first_name', 'middle_name', 'gender', 'date_of_birth', 'age', 'marital_status', 'photo')
        }),
        ('Employee/Retiree Information', {
            'fields': ('personal_number', 'employee_type', 'division', 'location'),
            'classes': ('collapse',)
        }),
        ('NonNPA Information', {
            'fields': ('nonnpa_type',),
            'classes': ('collapse',)
        }),
        ('Dependent Information', {
            'fields': ('dependent_type', 'principal_staff'),
            'classes': ('collapse',)
        }),
        ('Contact Information', {
            'fields': ('email', 'phone', 'state_of_residence', 'residential_address', 'state_of_origin', 'lga', 'permanent_address')
        }),
        ('Medical Information', {
            'fields': ('blood_group', 'genotype')
        }),
        ('Next of Kin', {
            'fields': ('nok_first_name', 'nok_middle_name', 'nok_relationship', 'nok_address', 'nok_phone'),
            'classes': ('collapse',)
        }),
        ('Metadata', {
            'fields': ('created_by', 'created_at', 'updated_at'),
            'classes': ('collapse',)
        }),
    )


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ['visit_id', 'patient', 'visit_type', 'status', 'date', 'time', 'doctor', 'clinic']
    list_filter = ['status', 'visit_type', 'clinic', 'date']
    search_fields = ['visit_id', 'patient__surname', 'patient__first_name', 'chief_complaint']
    readonly_fields = ['visit_id', 'created_at', 'updated_at']


@admin.register(VitalReading)
class VitalReadingAdmin(admin.ModelAdmin):
    list_display = ['patient', 'recorded_at', 'temperature', 'blood_pressure_systolic', 'blood_pressure_diastolic', 'heart_rate', 'recorded_by']
    list_filter = ['recorded_at']
    search_fields = ['patient__surname', 'patient__first_name']
    readonly_fields = ['recorded_at']


@admin.register(MedicalHistory)
class MedicalHistoryAdmin(admin.ModelAdmin):
    list_display = ['patient', 'updated_at', 'updated_by']
    search_fields = ['patient__surname', 'patient__first_name']
    readonly_fields = ['updated_at']

