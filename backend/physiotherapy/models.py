"""
Physiotherapy models for the EMR system.
"""
from django.db import models


class PhysioTemplate(models.Model):
    """Physiotherapy treatment templates."""
    name = models.CharField(max_length=200)
    code = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=50, default='general')
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'physio_templates'

    def __str__(self):
        return self.name


class PhysioOrder(models.Model):
    """Physiotherapy treatment orders."""
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

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='physio_orders')
    ordered_by = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='physio_orders_created')
    visit = models.ForeignKey(
        'patients.Visit',
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='physio_orders',
        help_text="Visit this physio order is associated with (for multi-clinic visits)"
    )
    consultation_session = models.ForeignKey(
        'consultation.ConsultationSession',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='physio_orders'
    )
    diagnosis = models.CharField(max_length=500, blank=True)
    chief_complaint = models.TextField(blank=True)
    treatment_goal = models.TextField(blank=True)
    special_instructions = models.TextField(blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    ordered_at = models.DateTimeField(auto_now_add=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Session tracking (physiotherapist determines session count)
    sessions_completed = models.PositiveIntegerField(default=0, help_text="Number of sessions completed so far")

    class Meta:
        db_table = 'physio_orders'
        ordering = ['-ordered_at']

    def __str__(self):
        return f"Physio Order {self.id} - {self.patient}"


class PhysioSession(models.Model):
    """Physiotherapy sessions with comprehensive assessment documentation."""
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
    ]

    # Basic session info
    order = models.ForeignKey(PhysioOrder, on_delete=models.CASCADE, related_name='sessions')
    physiotherapist = models.ForeignKey('accounts.User', on_delete=models.CASCADE, related_name='physio_sessions')
    session_number = models.PositiveIntegerField(default=1, help_text="Session number in the treatment plan (1, 2, 3, etc.)")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True, help_text="Actual session duration in minutes")
    created_at = models.DateTimeField(auto_now_add=True)

    # A. Patient Assessment (Top section)
    presenting_complaint = models.TextField(blank=True, help_text="Chief complaint and symptoms")
    pain_level_before = models.PositiveIntegerField(null=True, blank=True, help_text="Pain level 0-10 before treatment")
    pain_level_after = models.PositiveIntegerField(null=True, blank=True, help_text="Pain level 0-10 after treatment")

    # B. Medical & Social Background
    medical_history = models.TextField(blank=True, help_text="Relevant medical history")
    surgical_history = models.TextField(blank=True, help_text="Previous surgeries")
    medications = models.TextField(blank=True, help_text="Current medications")
    allergies = models.TextField(blank=True, help_text="Known allergies")
    social_history = models.TextField(blank=True, help_text="Occupation, lifestyle, support systems")
    previous_treatments = models.TextField(blank=True, help_text="Previous physiotherapy or related treatments")

    # C. Physical Examination (Core Physio Section)
    posture_gait = models.TextField(blank=True, help_text="Posture and gait assessment")
    range_of_motion = models.TextField(blank=True, help_text="Joint ROM measurements")
    muscle_strength = models.TextField(blank=True, help_text="Manual muscle testing results")
    sensation = models.TextField(blank=True, help_text="Sensory assessment findings")
    reflexes = models.TextField(blank=True, help_text="Reflex testing results")
    balance_coordination = models.TextField(blank=True, help_text="Balance and coordination assessment")
    special_tests = models.TextField(blank=True, help_text="Special orthopedic/neurological tests")

    # D. Functional Evaluation
    functional_assessment = models.TextField(blank=True, help_text="Activities of daily living assessment")
    assistive_devices = models.TextField(blank=True, help_text="Current assistive devices used")
    functional_goals = models.TextField(blank=True, help_text="Short-term and long-term functional goals")
    functional_limitations = models.TextField(blank=True, help_text="Identified functional limitations")

    # E. Clinical Reasoning
    assessment_findings = models.TextField(blank=True, help_text="Key assessment findings")
    diagnosis_impression = models.TextField(blank=True, help_text="Clinical impression and working diagnosis")
    prognosis = models.TextField(blank=True, help_text="Expected recovery timeline and prognosis")
    clinical_reasoning = models.TextField(blank=True, help_text="Rationale for treatment approach")

    # F. Treatment & Plan
    treatment_performed = models.TextField(blank=True, help_text="Treatments administered in this session")
    exercises_prescribed = models.JSONField(default=list, blank=True, help_text="Home exercise program")
    equipment_used = models.JSONField(default=list, blank=True, help_text="Equipment/modalities used")
    patient_education = models.TextField(blank=True, help_text="Education provided to patient")
    next_session_plan = models.TextField(blank=True, help_text="Plan for next session")

    # G. Session & Continuity
    session_notes = models.TextField(blank=True, help_text="Additional session notes")
    progress_notes = models.TextField(blank=True, help_text="Progress compared to previous sessions")
    recommendations = models.JSONField(default=list, blank=True, help_text="Recommendations for other healthcare providers")
    follow_up_instructions = models.TextField(blank=True, help_text="Instructions for patient between sessions")

    class Meta:
        db_table = 'physio_sessions'
        constraints = [
            models.UniqueConstraint(
                fields=['order', 'session_number'],
                name='unique_order_session_number',
            ),
        ]

    def __str__(self):
        return f"Session {self.id}"