"""
Consultation models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class ConsultationRoom(models.Model):
    """
    Consultation room management.
    """
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('maintenance', 'Maintenance'),
    ]
    
    name = models.CharField(max_length=100, unique=True)
    room_number = models.CharField(max_length=50, unique=True, db_index=True)
    location = models.CharField(max_length=200, blank=True)
    floor = models.CharField(max_length=50, blank=True)
    specialty = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    capacity = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'consultation_rooms'
        ordering = ['room_number']
    
    def __str__(self):
        return f"{self.room_number} - {self.name}"


class ConsultationSession(models.Model):
    """
    Active consultation session.
    """
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    session_id = models.CharField(max_length=50, unique=True, db_index=True)
    room = models.ForeignKey(ConsultationRoom, on_delete=models.PROTECT, related_name='sessions')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='consultation_sessions')
    doctor = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='consultation_sessions')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='consultation_sessions')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    chief_complaint = models.TextField(blank=True)
    history_of_presenting_illness = models.TextField(blank=True)
    physical_examination = models.TextField(blank=True)
    assessment = models.TextField(blank=True)
    plan = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    started_at = models.DateTimeField(auto_now_add=True)
    ended_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_consultations')
    
    class Meta:
        db_table = 'consultation_sessions'
        ordering = ['-started_at']
    
    def __str__(self):
        return f"{self.session_id} - {self.patient.get_full_name()}"


class ConsultationQueue(models.Model):
    """
    Patient queue for consultation rooms.
    """
    
    room = models.ForeignKey(ConsultationRoom, on_delete=models.CASCADE, related_name='queue_items')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='queue_items')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='queue_items')
    priority = models.IntegerField(default=0, help_text="Lower number = higher priority")
    notes = models.TextField(blank=True)
    queued_at = models.DateTimeField(auto_now_add=True)
    called_at = models.DateTimeField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'consultation_queue'
        ordering = ['priority', 'queued_at']
        unique_together = [['room', 'patient', 'is_active']]
    
    def __str__(self):
        return f"{self.room.name} - {self.patient.get_full_name()}"

