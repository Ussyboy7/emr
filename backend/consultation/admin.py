"""
Admin configuration for the Consultation app.
"""
from django.contrib import admin
from .models import ConsultationRoom, ConsultationSession, ConsultationQueue, Referral


@admin.register(ConsultationRoom)
class ConsultationRoomAdmin(admin.ModelAdmin):
    list_display = ['room_number', 'name', 'specialty', 'status', 'is_active', 'created_at']
    list_filter = ['status', 'specialty', 'is_active']
    search_fields = ['name', 'room_number', 'location']


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

