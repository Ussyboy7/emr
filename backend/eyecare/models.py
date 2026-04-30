"""
Eye Care models for the EMR system.
"""
from django.db import models


class EyeOrder(models.Model):
    """Eye clinic examination/treatment orders."""
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    PRIORITY_CHOICES = [
        ('routine', 'Routine'),
        ('urgent', 'Urgent'),
        ('stat', 'STAT'),
    ]

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='eye_orders')
    ordered_by = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='eye_orders_created')
    visit = models.ForeignKey(
        'patients.Visit',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='eye_orders',
        help_text="Visit this eye order is associated with"
    )
    consultation_session = models.ForeignKey(
        'consultation.ConsultationSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='eye_orders'
    )
    
    # Eye-specific clinical fields
    chief_complaint = models.TextField(blank=True)
    visual_acuity_od = models.CharField(max_length=50, blank=True, help_text="Right eye visual acuity")
    visual_acuity_os = models.CharField(max_length=50, blank=True, help_text="Left eye visual acuity")
    visual_acuity_ou = models.CharField(max_length=50, blank=True, help_text="Both eyes visual acuity")
    refraction_od = models.CharField(max_length=100, blank=True, help_text="Right eye refraction")
    refraction_os = models.CharField(max_length=100, blank=True, help_text="Left eye refraction")
    iop_od = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Intraocular pressure OD (mmHg)")
    iop_os = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True, help_text="Intraocular pressure OS (mmHg)")
    diagnosis = models.CharField(max_length=500, blank=True)
    treatment_plan = models.TextField(blank=True)
    special_instructions = models.TextField(blank=True)
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    ordered_at = models.DateTimeField(auto_now_add=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'eye_orders'
        ordering = ['-ordered_at']

    def __str__(self):
        return f"Eye Order {self.id} - {self.patient}"


class EyeSession(models.Model):
    """Individual eye clinic session/treatment."""
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    order = models.ForeignKey(EyeOrder, on_delete=models.CASCADE, related_name='sessions')
    session_number = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    scheduled_at = models.DateTimeField()
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)
    
    # Session-specific notes
    notes = models.TextField(blank=True)
    procedures_performed = models.TextField(blank=True)
    findings = models.TextField(blank=True)
    soap_note = models.JSONField(default=dict, blank=True)
    # Legacy single file per modality (kept for backward compatibility)
    pachymetry_file = models.FileField(upload_to='eye_results/pachymetry/', blank=True, null=True)
    oct_file = models.FileField(upload_to='eye_results/oct/', blank=True, null=True)
    visual_field_file = models.FileField(upload_to='eye_results/visual_fields/', blank=True, null=True)
    
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'eye_sessions'
        ordering = ['-scheduled_at']

    def __str__(self):
        return f"Session {self.session_number} - {self.order.patient} - {self.scheduled_at.strftime('%Y-%m-%d')}"


class EyeSessionDiagnosticFile(models.Model):
    """One uploaded file for a diagnostic modality (pachymetry / OCT / visual field)."""

    CATEGORY_CHOICES = [
        ('pachymetry', 'Pachymetry'),
        ('oct', 'OCT'),
        ('visual_field', 'Visual Field'),
    ]

    session = models.ForeignKey(
        EyeSession,
        on_delete=models.CASCADE,
        related_name='diagnostic_uploads',
    )
    category = models.CharField(max_length=30, choices=CATEGORY_CHOICES, db_index=True)
    file = models.FileField(upload_to='eye_results/diagnostics/')
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'eye_session_diagnostic_files'
        ordering = ['uploaded_at', 'id']
        indexes = [
            models.Index(fields=['session', 'category']),
        ]

    def __str__(self):
        return f'{self.session_id} {self.category} {self.file.name if self.file else ""}'
