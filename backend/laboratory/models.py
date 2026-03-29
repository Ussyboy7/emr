"""
Laboratory models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class LabTemplate(models.Model):
    """
    Laboratory test templates for common tests.
    """
    
    CATEGORY_CHOICES = [
        ('hematology', 'Hematology'),
        ('chemistry', 'Chemistry'),
        ('microbiology', 'Microbiology'),
        ('immunology', 'Immunology'),
        ('endocrinology', 'Endocrinology'),
        ('toxicology', 'Toxicology'),
        ('urinalysis', 'Urinalysis'),
        ('parasitology', 'Parasitology'),
        ('histopathology', 'Histopathology'),
        ('serology', 'Serology'),
        ('molecular', 'Molecular Biology'),
        ('cytology', 'Cytology'),
    ]

    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='chemistry')
    sample_type = models.CharField(max_length=50)  # Blood, Urine, Stool, etc.
    description = models.TextField(blank=True)
    normal_range = models.JSONField(default=dict, blank=True, help_text="Normal value ranges")
    turnaround_time = models.CharField(max_length=50, blank=True, help_text="Expected turnaround time (e.g., '30 min', '2 hours', '1 day')")
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'lab_templates'
        ordering = ['name']
    
    def __str__(self):
        return f"{self.code} - {self.name}"


class LabPartner(models.Model):
    """
    External / outsourced laboratory partners (for outsourced processing).
    Managed via Django admin or API; shown in lab order processing UI.
    """

    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(
        max_length=50,
        blank=True,
        help_text="Optional short code (e.g. for reports)",
    )
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "lab_outsourced_partners"
        ordering = ["sort_order", "name"]
        verbose_name = "Lab partner (outsourced)"
        verbose_name_plural = "Lab partners (outsourced)"

    def __str__(self):
        return self.name


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
    consultation_session = models.ForeignKey('consultation.ConsultationSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='lab_orders')
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    clinic = models.CharField(max_length=100, blank=True)
    clinical_notes = models.TextField(blank=True)
    
    # One Lab ID (BT-YY-NNNN) per order; set on first sample collection, reused for all tests
    lab_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    
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

    def _resolve_clinic_raw(self) -> str:
        """
        Prefer explicit LabOrder.clinic; otherwise infer from linked visit or consultation room.
        Consultation flows often omit `clinic` on create — this keeps reports/filters accurate.
        """
        c = (self.clinic or "").strip()
        if c:
            return c
        if self.visit_id:
            try:
                visit = self.visit
                vc = getattr(visit, "clinic", None) if visit else None
                if vc and str(vc).strip():
                    return str(vc).strip()
            except Exception:
                pass
        if self.consultation_session_id:
            try:
                sess = self.consultation_session
                org_clinic = getattr(getattr(sess, "room", None), "clinic", None)
                name = getattr(org_clinic, "name", None) if org_clinic else None
                if name and str(name).strip():
                    return str(name).strip()
            except Exception:
                pass
        return ""

    def get_clinic_for_display(self) -> str:
        raw = self._resolve_clinic_raw()
        if not raw:
            return ""
        from common.clinic_utils import normalize_clinic_name

        return normalize_clinic_name(raw)

    def save(self, *args, **kwargs):
        """Auto-generate order_id if not provided; resolve and normalize clinic."""
        self.clinic = self.get_clinic_for_display()

        if not self.order_id:
            # Generate lab order ID: LAB-YYYYMMDD-HHMMSS-XXXX
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            # Add random suffix to ensure uniqueness
            import random
            suffix = f"{random.randint(1000, 9999)}"
            self.order_id = f"LAB-{timestamp}-{suffix}"
        super().save(*args, **kwargs)
    
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
        ('rejected', 'Rejected'),
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

    # Lab ID (Lab #): BT-YY-NNNN, generated when sample is collected. Identifies the
    # patient/sample at the lab. One Lab ID per order: all tests in the order share it.
    # Not unique: multiple tests can have the same lab_number.
    lab_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    
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
    
    # Rejection tracking
    rejected_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='rejected_lab_tests')
    rejected_at = models.DateTimeField(null=True, blank=True)
    
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

