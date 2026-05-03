"""
Physiotherapy models.
"""
from django.db import models
from django.contrib.auth import get_user_model

User = get_user_model()


class PhysioTemplate(models.Model):
    """Physiotherapy treatment templates."""
    name = models.CharField(max_length=255)
    code = models.CharField(max_length=50, unique=True)
    category = models.CharField(max_length=100)
    description = models.TextField(blank=True)
    duration_minutes = models.PositiveIntegerField(default=30)
    equipment_needed = models.JSONField(default=list)
    contraindications = models.TextField(blank=True)
    instructions = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return f"{self.code} - {self.name}"


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
        ('low', 'Low'),
        ('normal', 'Normal'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE)
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True)
    ordered_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='physio_orders')
    consultation_session = models.ForeignKey(
        'consultation.ConsultationSession', on_delete=models.SET_NULL, null=True, blank=True
    )

    diagnosis = models.TextField()
    chief_complaint = models.TextField()
    treatment_goal = models.TextField()
    special_instructions = models.TextField(blank=True)

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='normal')

    referral_source = models.CharField(max_length=50, blank=True)

    ordered_at = models.DateTimeField(auto_now_add=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)

    sessions_completed = models.PositiveIntegerField(default=0)

    # Add defaults for other positive integer fields
    pain_level_before = models.PositiveIntegerField(null=True, blank=True)
    pain_level_after = models.PositiveIntegerField(null=True, blank=True)

    class Meta:
        ordering = ['-ordered_at']

    def __str__(self):
        return f"Physio Order for {self.patient} - {self.status}"


class PhysioSession(models.Model):
    """Individual physiotherapy sessions."""
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]

    order = models.ForeignKey(PhysioOrder, on_delete=models.CASCADE, related_name='sessions')
    physiotherapist = models.ForeignKey(User, on_delete=models.CASCADE)
    template = models.ForeignKey(PhysioTemplate, on_delete=models.SET_NULL, null=True, blank=True)

    session_number = models.PositiveIntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')

    scheduled_at = models.DateTimeField(null=True, blank=True)
    started_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    duration_minutes = models.PositiveIntegerField(null=True, blank=True)

    # Patient Assessment
    presenting_complaint = models.TextField(blank=True)
    pain_level_before = models.PositiveIntegerField(null=True, blank=True)
    pain_level_after = models.PositiveIntegerField(null=True, blank=True)

    # Medical & Social Background
    medical_history = models.TextField(blank=True)
    surgical_history = models.TextField(blank=True)
    medications = models.TextField(blank=True)
    allergies = models.TextField(blank=True)
    social_history = models.TextField(blank=True)
    previous_treatments = models.TextField(blank=True)

    # Physical Examination
    posture_gait = models.TextField(blank=True)
    range_of_motion = models.TextField(blank=True)
    muscle_strength = models.TextField(blank=True)
    sensation = models.TextField(blank=True)
    reflexes = models.TextField(blank=True)
    balance_coordination = models.TextField(blank=True)
    special_tests = models.TextField(blank=True)

    # Functional Evaluation
    functional_assessment = models.TextField(blank=True)
    assistive_devices = models.TextField(blank=True)
    functional_goals = models.TextField(blank=True)
    functional_limitations = models.TextField(blank=True)

    # Clinical Reasoning
    assessment_findings = models.TextField(blank=True)
    diagnosis_impression = models.TextField(blank=True)
    prognosis = models.TextField(blank=True)
    clinical_reasoning = models.TextField(blank=True)

    # Treatment & Plan
    treatment_performed = models.TextField(blank=True)
    exercises_prescribed = models.JSONField(default=list)
    equipment_used = models.JSONField(default=list)
    patient_education = models.TextField(blank=True)
    next_session_plan = models.TextField(blank=True)

    # Session & Continuity
    session_notes = models.TextField(blank=True)
    progress_notes = models.TextField(blank=True)
    recommendations = models.JSONField(default=list)
    follow_up_instructions = models.TextField(blank=True)

    # Legacy fields
    notes = models.TextField(blank=True)
    patient_response = models.TextField(blank=True)
    functional_improvement = models.TextField(blank=True)
    next_session_date = models.DateField(null=True, blank=True)
    follow_up_notes = models.TextField(blank=True)
    assessment = models.TextField(blank=True)
    home_exercises = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-scheduled_at', 'session_number']
        unique_together = ['order', 'session_number']

    def __str__(self):
        return f"Session {self.session_number} for {self.order.patient} - {self.status}"