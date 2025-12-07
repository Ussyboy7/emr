"""
Nursing models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class NursingOrder(models.Model):
    """
    Nursing orders and procedures.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    order_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='nursing_orders')
    ordered_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='ordered_nursing_orders')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='nursing_orders')
    
    order_type = models.CharField(max_length=100, help_text="Medication, Procedure, Observation, etc.")
    description = models.TextField()
    frequency = models.CharField(max_length=100, blank=True)
    duration = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_nursing_orders')
    
    class Meta:
        db_table = 'nursing_orders'
        ordering = ['-ordered_at']
    
    def __str__(self):
        return f"{self.order_id} - {self.patient.get_full_name()}"


class Procedure(models.Model):
    """
    Nursing procedures performed.
    """
    
    PROCEDURE_TYPE_CHOICES = [
        ('injection', 'Injection'),
        ('dressing', 'Dressing'),
        ('wound_care', 'Wound Care'),
        ('catheterization', 'Catheterization'),
        ('iv_insertion', 'IV Insertion'),
        ('other', 'Other'),
    ]
    
    procedure_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='procedures')
    nursing_order = models.ForeignKey(NursingOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='procedures')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='procedures')
    
    procedure_type = models.CharField(max_length=50, choices=PROCEDURE_TYPE_CHOICES)
    description = models.TextField()
    site = models.CharField(max_length=200, blank=True, help_text="Body site where procedure was performed")
    notes = models.TextField(blank=True)
    
    performed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='performed_procedures')
    performed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'procedures'
        ordering = ['-performed_at']
    
    def __str__(self):
        return f"{self.procedure_id} - {self.procedure_type} - {self.patient.get_full_name()}"

