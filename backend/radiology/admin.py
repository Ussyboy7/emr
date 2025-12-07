"""
Admin configuration for the Radiology app.
"""
from django.contrib import admin
from .models import RadiologyOrder, RadiologyStudy, RadiologyReport


@admin.register(RadiologyOrder)
class RadiologyOrderAdmin(admin.ModelAdmin):
    list_display = ['order_id', 'patient', 'doctor', 'priority', 'ordered_at']
    list_filter = ['priority', 'ordered_at']
    search_fields = ['order_id', 'patient__surname', 'patient__first_name']


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

