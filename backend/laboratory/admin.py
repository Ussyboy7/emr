"""
Admin configuration for the Laboratory app.
"""
from django.contrib import admin
from .models import LabTemplate, LabPartner, LabOrder, LabTest, LabReferralDispatch, LabResult


@admin.register(LabPartner)
class LabPartnerAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "is_active", "sort_order", "phone", "updated_at"]
    list_filter = ["is_active"]
    search_fields = ["name", "code", "email", "address"]
    ordering = ["sort_order", "name"]
    fieldsets = (
        (None, {
            "fields": ("name", "code", "is_active", "sort_order"),
        }),
        ("Contact", {
            "fields": ("phone", "email", "contact_person_title", "address"),
        }),
        ("Other", {
            "fields": ("notes",),
        }),
    )


@admin.register(LabTemplate)
class LabTemplateAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'sample_type', 'is_active', 'created_at']
    list_filter = ['sample_type', 'is_active']
    search_fields = ['name', 'code']


@admin.register(LabOrder)
class LabOrderAdmin(admin.ModelAdmin):
    list_display = ['order_id', 'patient', 'doctor', 'priority', 'ordered_at']
    list_filter = ['priority', 'ordered_at']
    search_fields = ['order_id', 'patient__surname', 'patient__first_name']


@admin.register(LabTest)
class LabTestAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'order', 'status', 'processing_method', 'created_at']
    list_filter = ['status', 'processing_method', 'sample_type']
    search_fields = ['name', 'code', 'order__order_id']


@admin.register(LabResult)
class LabResultAdmin(admin.ModelAdmin):
    list_display = ['test', 'patient', 'overall_status', 'priority', 'created_at']
    list_filter = ['overall_status', 'priority']
    search_fields = ['patient__surname', 'patient__first_name', 'test__name']


@admin.register(LabReferralDispatch)
class LabReferralDispatchAdmin(admin.ModelAdmin):
    list_display = [
        'dispatch_id', 'order', 'partner_name', 'status',
        'issued_by', 'issued_at',
        'referral_letter_printed_at', 'responsibility_form_printed_at',
    ]
    list_filter = ['status', 'partner', 'issued_at']
    search_fields = [
        'dispatch_id', 'order__order_id', 'partner_name',
        'order__patient__surname', 'order__patient__first_name',
    ]
    readonly_fields = [
        'dispatch_id', 'issued_at', 'cancelled_at',
        'referral_letter_printed_at', 'responsibility_form_printed_at',
        'partner_address_snapshot',
    ]
    raw_id_fields = ['order', 'partner', 'tests', 'issued_by', 'cancelled_by']
    fieldsets = (
        (None, {
            'fields': (
                'dispatch_id', 'order', 'partner', 'partner_name',
                'partner_address_snapshot', 'tests', 'notes',
            ),
        }),
        ('Lifecycle', {
            'fields': ('status', 'superseded_by', 'cancellation_reason'),
        }),
        ('Audit', {
            'fields': (
                'issued_by', 'issued_at',
                'cancelled_by', 'cancelled_at',
                'referral_letter_printed_at', 'responsibility_form_printed_at',
            ),
        }),
    )

