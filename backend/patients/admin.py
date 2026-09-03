"""
Admin configuration for the Patients app.
"""
from django.contrib import admin
from .models import (
    Patient,
    Visit,
    VitalReading,
    MedicalHistory,
    AnnualCheckup,
    AnnualCheckupComponentDefinition,
    AnnualCheckupExemption,
    AnnualCheckupProgrammeSettings,
    PatientRecordsNote,
    PatientClinicalDocument,
)


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ['patient_id', 'get_full_name', 'category', 'gender', 'age', 'phone', 'is_active', 'is_first_time_patient', 'created_at']
    list_filter = ['category', 'gender', 'blood_group', 'is_active', 'is_first_time_patient', 'created_at']
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


@admin.register(AnnualCheckupComponentDefinition)
class AnnualCheckupComponentDefinitionAdmin(admin.ModelAdmin):
    list_display = ["code", "label", "tier", "captured_via", "sort_order", "is_active"]
    list_filter = ["tier", "captured_via", "is_active"]
    search_fields = ["code", "label"]
    ordering = ["sort_order", "label"]


@admin.register(AnnualCheckupProgrammeSettings)
class AnnualCheckupProgrammeSettingsAdmin(admin.ModelAdmin):
    list_display = ["programme_year", "updated_at", "updated_by"]
    search_fields = ["programme_year"]


@admin.register(AnnualCheckup)
class AnnualCheckupAdmin(admin.ModelAdmin):
    list_display = [
        "id",
        "patient",
        "programme_year",
        "status",
        "fitness_outcome",
        "signed_off_at",
    ]
    list_filter = ["status", "programme_year", "fitness_outcome"]
    search_fields = [
        "patient__surname",
        "patient__first_name",
        "patient__patient_id",
        "visit__visit_id",
    ]
    readonly_fields = ["created_at", "updated_at", "signed_off_at"]


@admin.register(AnnualCheckupExemption)
class AnnualCheckupExemptionAdmin(admin.ModelAdmin):
    list_display = ["patient", "programme_year", "reason", "granted_at", "granted_by"]
    list_filter = ["programme_year", "reason"]
    search_fields = [
        "patient__surname",
        "patient__first_name",
        "patient__patient_id",
        "patient__personal_number",
    ]


@admin.register(MedicalHistory)
class MedicalHistoryAdmin(admin.ModelAdmin):
    list_display = ['patient', 'updated_at', 'updated_by']
    search_fields = ['patient__surname', 'patient__first_name']
    readonly_fields = ['updated_at']


@admin.register(PatientRecordsNote)
class PatientRecordsNoteAdmin(admin.ModelAdmin):
    list_display = ['id', 'patient', 'source', 'recorded_by_name_snapshot', 'recorded_at']
    list_filter = ['source', 'recorded_at']
    search_fields = [
        'note',
        'patient__surname',
        'patient__first_name',
        'patient__patient_id',
        'recorded_by_name_snapshot',
    ]
    readonly_fields = ['recorded_at', 'recorded_by', 'recorded_by_name_snapshot', 'source']


@admin.register(PatientClinicalDocument)
class PatientClinicalDocumentAdmin(admin.ModelAdmin):
    list_display = [
        'id',
        'patient',
        'doc_type',
        'source',
        'document_date',
        'uploaded_by_name_snapshot',
        'uploaded_at',
    ]
    list_filter = ['doc_type', 'source', 'document_date']
    search_fields = [
        'title',
        'facility',
        'patient__surname',
        'patient__first_name',
        'patient__patient_id',
        'original_filename',
    ]
    readonly_fields = [
        'uploaded_at',
        'uploaded_by',
        'uploaded_by_name_snapshot',
        'original_filename',
    ]

