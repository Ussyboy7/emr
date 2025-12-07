"""
Admin configuration for the Laboratory app.
"""
from django.contrib import admin
from .models import LabTemplate, LabOrder, LabTest, LabResult


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

