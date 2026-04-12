"""
Admin configuration for the Organization app.
"""
from django.contrib import admin
from .models import Clinic, Department, Room, OutpatientClinicType, FacilityOutpatientClinic


@admin.register(Clinic)
class ClinicAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'location', 'is_active', 'created_at']
    list_filter = ['is_active', 'created_at']
    search_fields = ['name', 'code', 'location']


@admin.register(Department)
class DepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'clinic', 'head', 'is_active', 'created_at']
    list_filter = ['clinic', 'is_active']
    search_fields = ['name', 'code', 'clinic__name']


@admin.register(Room)
class RoomAdmin(admin.ModelAdmin):
    list_display = ['room_number', 'name', 'clinic', 'room_type', 'status', 'is_active']
    list_filter = ['room_type', 'status', 'clinic', 'is_active']
    search_fields = ['name', 'room_number', 'location']


@admin.register(OutpatientClinicType)
class OutpatientClinicTypeAdmin(admin.ModelAdmin):
    list_display = ['name', 'code', 'sort_order', 'is_active', 'updated_at']
    list_filter = ['is_active']
    search_fields = ['name', 'code']


@admin.register(FacilityOutpatientClinic)
class FacilityOutpatientClinicAdmin(admin.ModelAdmin):
    list_display = ['facility', 'clinic_type', 'sort_order', 'is_active']
    list_filter = ['is_active', 'facility']

