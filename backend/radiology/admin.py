"""
Admin configuration for the Radiology app.
"""
from django.contrib import admin
from .models import (
    ImagingPartner,
    RadiologyOrder,
    RadiologyStudy,
    RadiologyReport,
    RadiologyReferralDispatch,
)


@admin.register(ImagingPartner)
class ImagingPartnerAdmin(admin.ModelAdmin):
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


@admin.register(RadiologyOrder)
class RadiologyOrderAdmin(admin.ModelAdmin):
    list_display = ['order_id', 'patient', 'doctor', 'source_type', 'external_clinic', 'external_requesting_doctor_name', 'priority', 'ordered_at']
    list_filter = ['source_type', 'external_clinic', 'priority', 'ordered_at']
    search_fields = ['order_id', 'patient__surname', 'patient__first_name', 'external_requesting_doctor_name', 'manual_request_reference']


@admin.register(RadiologyStudy)
class RadiologyStudyAdmin(admin.ModelAdmin):
    list_display = ['procedure', 'order', 'status', 'modality', 'scheduled_date', 'created_at']
    list_filter = ['status', 'modality', 'processing_method']
    search_fields = ['procedure', 'order__order_id']


@admin.register(RadiologyReport)
class RadiologyReportAdmin(admin.ModelAdmin):
    list_display = ['study', 'patient', 'overall_status', 'priority', 'created_at']
    list_filter = ['overall_status', 'priority']
    search_fields = ['patient__surname', 'patient__first_name', 'study__procedure']


@admin.register(RadiologyReferralDispatch)
class RadiologyReferralDispatchAdmin(admin.ModelAdmin):
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
    raw_id_fields = ['order', 'partner', 'studies', 'issued_by', 'cancelled_by']
    fieldsets = (
        (None, {
            'fields': (
                'dispatch_id', 'order', 'partner', 'partner_name',
                'partner_address_snapshot', 'studies', 'notes',
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

