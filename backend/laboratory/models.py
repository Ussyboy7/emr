"""
Laboratory models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class LabTemplate(models.Model):
    """
    Laboratory test templates for common tests.
    """
    
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    sample_type = models.CharField(max_length=50)  # Blood, Urine, Stool, etc.
    description = models.TextField(blank=True)
    normal_range = models.JSONField(default=dict, blank=True, help_text="Normal value ranges")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'lab_templates'
        ordering = ['name']
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class LabOrder(models.Model):
    """
    Laboratory test order from a doctor/consultation.
    """
    
    PRIORITY_CHOICES = [
        ('routine', 'Routine'),
        ('urgent', 'Urgent'),
        ('stat', 'STAT'),
    ]
    
    order_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='lab_orders')
    doctor = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='ordered_labs')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='lab_orders')
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    clinic = models.CharField(max_length=100, blank=True)
    clinical_notes = models.TextField(blank=True)
    
    ordered_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_lab_orders')
    
    class Meta:
        db_table = 'lab_orders'
        ordering = ['-ordered_at']
        indexes = [
            models.Index(fields=['order_id']),
            models.Index(fields=['patient', '-ordered_at']),
            models.Index(fields=['priority']),
        ]
    
    def __str__(self):
        return f"{self.order_id} - {self.patient.get_full_name()}"


class LabTest(models.Model):
    """
    Individual test within a lab order.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('sample_collected', 'Sample Collected'),
        ('processing', 'Processing'),
        ('results_ready', 'Results Ready'),
        ('verified', 'Verified'),
    ]
    
    PROCESSING_METHOD_CHOICES = [
        ('in_house', 'In-house'),
        ('outsourced', 'Outsourced'),
    ]
    
    order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='tests')
    template = models.ForeignKey(LabTemplate, on_delete=models.PROTECT, related_name='tests', null=True, blank=True)
    
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50)
    sample_type = models.CharField(max_length=50)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Processing information
    processing_method = models.CharField(max_length=20, choices=PROCESSING_METHOD_CHOICES, blank=True, null=True)
    outsourced_lab = models.CharField(max_length=200, blank=True)
    
    # Collection information
    collected_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='collected_samples')
    collected_at = models.DateTimeField(null=True, blank=True)
    
    # Processing information
    processed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='processed_tests')
    processed_at = models.DateTimeField(null=True, blank=True)
    
    # Results
    results = models.JSONField(default=dict, blank=True, help_text="Test results as key-value pairs")
    result_file = models.FileField(upload_to='lab_results/', blank=True, null=True)
    notes = models.TextField(blank=True)
    
    # Verification
    verified_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_lab_tests')
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'lab_tests'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['order', 'status']),
            models.Index(fields=['status']),
        ]
    
    def __str__(self):
        return f"{self.code} - {self.name} ({self.order.order_id})"


class LabResult(models.Model):
    """
    Verified lab results (for verification workflow).
    This is essentially a view/query model for tests with status='results_ready'.
    """
    
    test = models.OneToOneField(LabTest, on_delete=models.CASCADE, related_name='result_record')
    order = models.ForeignKey(LabOrder, on_delete=models.CASCADE, related_name='result_records')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='lab_results')
    
    # Result classification
    overall_status = models.CharField(max_length=20, choices=[
        ('normal', 'Normal'),
        ('abnormal', 'Abnormal'),
        ('critical', 'Critical'),
    ], blank=True)
    
    priority = models.CharField(max_length=20, choices=[
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ], default='medium')
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'lab_results'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Result for {self.test.name} - {self.patient.get_full_name()}"

