"""
Admin configuration for the Nursing app.
"""
from django.contrib import admin
from .models import NursingOrder, Procedure


@admin.register(NursingOrder)
class NursingOrderAdmin(admin.ModelAdmin):
    list_display = ['order_id', 'patient', 'order_type', 'status', 'priority', 'ordered_at']
    list_filter = ['status', 'priority', 'order_type', 'ordered_at']
    search_fields = ['order_id', 'patient__surname', 'patient__first_name', 'description']


@admin.register(Procedure)
class ProcedureAdmin(admin.ModelAdmin):
    list_display = ['procedure_id', 'patient', 'procedure_type', 'performed_by', 'performed_at']
    list_filter = ['procedure_type', 'performed_at']
    search_fields = ['procedure_id', 'patient__surname', 'patient__first_name', 'description']

