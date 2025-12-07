"""
Admin configuration for the Appointments app.
"""
from django.contrib import admin
from .models import Appointment, AppointmentSlot


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ['appointment_id', 'patient', 'doctor', 'appointment_date', 'appointment_time', 'status', 'appointment_type']
    list_filter = ['status', 'appointment_type', 'appointment_date', 'clinic']
    search_fields = ['appointment_id', 'patient__surname', 'patient__first_name', 'doctor__username']
    date_hierarchy = 'appointment_date'


@admin.register(AppointmentSlot)
class AppointmentSlotAdmin(admin.ModelAdmin):
    list_display = ['doctor', 'day_of_week', 'start_time', 'end_time', 'clinic', 'is_available']
    list_filter = ['day_of_week', 'is_available', 'clinic']
    search_fields = ['doctor__username', 'doctor__first_name', 'doctor__last_name']

