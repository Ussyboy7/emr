"""
Admin configuration for the Physiotherapy app.
"""
from django.contrib import admin
from .models import PhysioTemplate, PhysioOrder, PhysioSession


@admin.register(PhysioTemplate)
class PhysioTemplateAdmin(admin.ModelAdmin):
    list_display = ['code', 'name', 'category', 'is_active', 'created_at']
    list_filter = ['category', 'is_active']
    search_fields = ['name', 'code', 'description']
    ordering = ['category', 'name']


@admin.register(PhysioOrder)
class PhysioOrderAdmin(admin.ModelAdmin):
    list_display = ['id', 'patient', 'diagnosis', 'status', 'ordered_at']
    list_filter = ['status']
    search_fields = ['patient__patient_id', 'diagnosis']
    ordering = ['-ordered_at']
    readonly_fields = ['ordered_at']


@admin.register(PhysioSession)
class PhysioSessionAdmin(admin.ModelAdmin):
    list_display = ['id', 'get_patient_name', 'physiotherapist', 'status', 'scheduled_at']
    list_filter = ['status', 'scheduled_at', 'physiotherapist']
    search_fields = ['order__patient__patient_id']
    ordering = ['-scheduled_at']
    readonly_fields = ['created_at']

    def get_patient_name(self, obj):
        try:
            return str(obj.order.patient)
        except:
            return "N/A"
    get_patient_name.short_description = 'Patient'