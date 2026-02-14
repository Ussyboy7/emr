"""
Radiology models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class RadiologyTemplate(models.Model):
    """
    Radiology investigation templates for common imaging procedures.
    """

    CATEGORY_CHOICES = [
        ('xray', 'X-Ray'),
        ('ct', 'CT Scan'),
        ('mri', 'MRI'),
        ('ultrasound', 'Ultrasound'),
        ('mammography', 'Mammography'),
        ('fluoroscopy', 'Fluoroscopy'),
        ('angiography', 'Angiography'),
        ('nuclear', 'Nuclear Medicine'),
        ('dental', 'Dental Imaging'),
        ('interventional', 'Interventional Radiology'),
    ]

    SUBCATEGORY_CHOICES = [
        ('plain_film', 'Plain Film'),
        ('contrast_studies', 'Contrast Studies'),
        ('special_procedures', 'Special Procedures'),
        ('doppler', 'Doppler Studies'),
        ('abdominal', 'Abdominal'),
        ('cardiac', 'Cardiac'),
        ('musculoskeletal', 'Musculoskeletal'),
        ('neurological', 'Neurological'),
        ('thoracic', 'Thoracic'),
        ('vascular', 'Vascular'),
        ('oncological', 'Oncological'),
    ]

    name = models.CharField(max_length=200, help_text="Full procedure name")
    code = models.CharField(max_length=50, unique=True, db_index=True, help_text="Procedure code (e.g., XR-ABD, CT-CHEST)")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='xray')
    subcategory = models.CharField(max_length=50, choices=SUBCATEGORY_CHOICES, blank=True)
    description = models.TextField(blank=True, help_text="Detailed description of the procedure")
    body_part = models.CharField(max_length=100, blank=True, help_text="Primary body part/area")
    modality = models.CharField(max_length=50, blank=True, help_text="Imaging modality")

    # Technical parameters
    radiation_exposure = models.CharField(max_length=20, choices=[
        ('none', 'No Radiation'),
        ('low', 'Low Radiation'),
        ('moderate', 'Moderate Radiation'),
        ('high', 'High Radiation'),
    ], default='moderate')
    preparation_required = models.TextField(blank=True, help_text="Patient preparation instructions")

    # Clinical information
    indications = models.TextField(blank=True, help_text="Clinical indications")
    contraindications = models.TextField(blank=True, help_text="Contraindications")
    turnaround_time = models.CharField(max_length=50, blank=True, help_text="Expected turnaround time")

    # Reporting template
    report_template = models.JSONField(default=dict, blank=True, help_text="Structured reporting template")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'radiology_templates'
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['modality']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


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
    consultation_session = models.ForeignKey('consultation.ConsultationSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='radiology_orders')
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    clinic = models.CharField(max_length=100, blank=True)
    clinical_notes = models.TextField(blank=True)
    provisional_diagnosis = models.TextField(blank=True)
    lmp = models.DateField(null=True, blank=True)
    
    ordered_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_radiology_orders')

    # Simplified workflow fields (like lab orders)
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('results_ready', 'Results Ready'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    report = models.TextField(blank=True, help_text="Radiology report text")
    critical = models.BooleanField(default=False, help_text="Critical findings flag")
    processed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='processed_radiology_orders')
    processed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'radiology_orders'
        ordering = ['-ordered_at']
    
    def save(self, *args, **kwargs):
        """Auto-generate order_id if not provided and normalize clinic names."""
        # Normalize clinic name before saving
        if self.clinic:
            from common.clinic_utils import normalize_clinic_name
            self.clinic = normalize_clinic_name(self.clinic)

        if not self.order_id:
            # Generate radiology order ID: RAD-YYYYMMDD-HHMMSS-XXXX
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            # Add random suffix to ensure uniqueness
            import random
            suffix = f"{random.randint(1000, 9999)}"
            self.order_id = f"RAD-{timestamp}-{suffix}"
        super().save(*args, **kwargs)
    
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
    template = models.ForeignKey(RadiologyTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='studies', help_text="Standard procedure template")
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
    report = models.TextField(blank=True, help_text="Radiology report text")
    recommendations = models.TextField(blank=True)
    critical = models.BooleanField(default=False, help_text="Critical findings flag")
    report_file = models.FileField(upload_to='radiology_reports/', blank=True, null=True, help_text="Uploaded report file")
    reported_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='reported_studies')
    reported_at = models.DateTimeField(null=True, blank=True)
    
    # Rejection
    rejected_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='rejected_radiology_studies')
    rejected_at = models.DateTimeField(null=True, blank=True)

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
