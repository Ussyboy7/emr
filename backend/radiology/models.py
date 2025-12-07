"""
Radiology models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class RadiologyOrder(models.Model):
    """
    Radiology/imaging order from a doctor.
    """
    
    PRIORITY_CHOICES = [
        ('routine', 'Routine'),
        ('urgent', 'Urgent'),
        ('stat', 'STAT'),
    ]
    
    order_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='radiology_orders')
    doctor = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='ordered_radiology')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='radiology_orders')
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    clinic = models.CharField(max_length=100, blank=True)
    clinical_notes = models.TextField(blank=True)
    
    ordered_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_radiology_orders')
    
    class Meta:
        db_table = 'radiology_orders'
        ordering = ['-ordered_at']
    
    def __str__(self):
        return f"{self.order_id} - {self.patient.get_full_name()}"


class RadiologyStudy(models.Model):
    """
    Individual imaging study within an order.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('scheduled', 'Scheduled'),
        ('acquired', 'Acquired'),
        ('processing', 'Processing'),
        ('reported', 'Reported'),
        ('verified', 'Verified'),
    ]
    
    PROCESSING_METHOD_CHOICES = [
        ('in_house', 'In-house'),
        ('outsourced', 'Outsourced'),
    ]
    
    order = models.ForeignKey(RadiologyOrder, on_delete=models.CASCADE, related_name='studies')
    procedure = models.CharField(max_length=200)
    body_part = models.CharField(max_length=100, blank=True)
    modality = models.CharField(max_length=50, blank=True, help_text="X-Ray, CT, MRI, Ultrasound, etc.")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Scheduling
    scheduled_date = models.DateField(null=True, blank=True)
    scheduled_time = models.TimeField(null=True, blank=True)
    scheduled_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='scheduled_studies')
    
    # Acquisition
    processing_method = models.CharField(max_length=20, choices=PROCESSING_METHOD_CHOICES, blank=True, null=True)
    outsourced_facility = models.CharField(max_length=200, blank=True)
    images_count = models.IntegerField(default=0)
    technical_notes = models.TextField(blank=True)
    acquired_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='acquired_studies')
    acquired_at = models.DateTimeField(null=True, blank=True)
    
    # Reporting
    report = models.TextField(blank=True)
    findings = models.TextField(blank=True)
    impression = models.TextField(blank=True)
    recommendations = models.TextField(blank=True)
    reported_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='reported_studies')
    reported_at = models.DateTimeField(null=True, blank=True)
    
    # Verification
    verified_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_studies')
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'radiology_studies'
        ordering = ['-created_at']
        verbose_name_plural = 'Radiology Studies'
    
    def __str__(self):
        return f"{self.procedure} - {self.order.order_id}"


class RadiologyReport(models.Model):
    """
    Radiology reports awaiting verification.
    """
    
    OVERALL_STATUS_CHOICES = [
        ('normal', 'Normal'),
        ('abnormal', 'Abnormal'),
        ('critical', 'Critical'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]
    
    study = models.OneToOneField(RadiologyStudy, on_delete=models.CASCADE, related_name='report_record')
    order = models.ForeignKey(RadiologyOrder, on_delete=models.CASCADE, related_name='report_records')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='radiology_reports')
    
    overall_status = models.CharField(max_length=20, choices=OVERALL_STATUS_CHOICES, blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'radiology_reports'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Report for {self.study.procedure} - {self.patient.get_full_name()}"

