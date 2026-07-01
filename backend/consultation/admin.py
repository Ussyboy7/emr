"""
Admin configuration for the Consultation app.
"""
from django.contrib import admin
from .models import (
    ConsultationRoom,
    ConsultationRoomOccupancy,
    ConsultationSession,
    ConsultationQueue,
    Referral,
    ReferralFacility,
    PresentingComplaintCategory,
    PresentingComplaint,
)


@admin.register(ReferralFacility)
class ReferralFacilityAdmin(admin.ModelAdmin):
    list_display = ["name", "code", "facility_type", "is_active", "sort_order", "phone", "updated_at"]
    list_filter = ["is_active", "facility_type"]
    search_fields = ["name", "code", "email", "address", "specialties"]
    ordering = ["sort_order", "name"]
    fieldsets = (
        (None, {
            "fields": ("name", "code", "facility_type", "is_active", "sort_order"),
        }),
        ("Contact", {
            "fields": ("phone", "email", "contact_person_title", "address"),
        }),
        ("Other", {
            "fields": ("specialties", "notes"),
        }),
    )


@admin.register(ConsultationRoom)
class ConsultationRoomAdmin(admin.ModelAdmin):
    list_display = ['room_number', 'name', 'specialty', 'status', 'is_active', 'created_at']
    list_filter = ['status', 'specialty', 'is_active']
    search_fields = ['name', 'room_number', 'location']


@admin.register(ConsultationRoomOccupancy)
class ConsultationRoomOccupancyAdmin(admin.ModelAdmin):
    list_display = ['room', 'doctor', 'status', 'is_active', 'checked_in_at', 'last_seen_at']
    list_filter = ['status', 'is_active']
    search_fields = ['room__name', 'doctor__first_name', 'doctor__last_name']


@admin.register(ConsultationSession)
class ConsultationSessionAdmin(admin.ModelAdmin):
    list_display = ['session_id', 'patient', 'doctor', 'room', 'status', 'started_at']
    list_filter = ['status', 'started_at']
    search_fields = ['session_id', 'patient__surname', 'patient__first_name']


@admin.register(ConsultationQueue)
class ConsultationQueueAdmin(admin.ModelAdmin):
    list_display = ['room', 'patient', 'priority', 'is_active', 'queued_at']
    list_filter = ['is_active', 'room']
    search_fields = ['patient__surname', 'patient__first_name', 'room__name']


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ['referral_id', 'patient', 'specialty', 'facility', 'urgency', 'status', 'referred_at']
    list_filter = ['status', 'urgency', 'facility_type', 'referred_at']
    search_fields = ['referral_id', 'patient__surname', 'patient__first_name', 'specialty', 'facility']


@admin.register(PresentingComplaintCategory)
class PresentingComplaintCategoryAdmin(admin.ModelAdmin):
    list_display = ['name', 'is_active', 'sort_order', 'created_at']
    list_filter = ['is_active']
    search_fields = ['name']
    ordering = ['sort_order', 'name']


@admin.register(PresentingComplaint)
class PresentingComplaintAdmin(admin.ModelAdmin):
    list_display = ['label', 'category', 'is_active', 'sort_order', 'created_at']
    list_filter = ['is_active', 'category']
    search_fields = ['label', 'category__name']
    ordering = ['category__sort_order', 'sort_order', 'label']
