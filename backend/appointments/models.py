"""
Appointment scheduling models for the EMR system.
"""
from django.db import models
from django.conf import settings
from django.core.validators import MinValueValidator, MaxValueValidator


class Appointment(models.Model):
    """
    Patient appointment scheduling.
    """
    
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('confirmed', 'Confirmed'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
        ('no_show', 'No Show'),
    ]
    
    TYPE_CHOICES = [
        ('consultation', 'Consultation'),
        ('follow_up', 'Follow-up'),
        ('routine', 'Routine Checkup'),
        ('emergency', 'Emergency'),
        ('procedure', 'Procedure'),
    ]
    
    appointment_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='appointments')
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='appointments',
        limit_choices_to={'system_role': 'Medical Doctor'}
    )
    clinic = models.ForeignKey('organization.Clinic', on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    room = models.ForeignKey('organization.Room', on_delete=models.SET_NULL, null=True, blank=True, related_name='appointments')
    
    appointment_type = models.CharField(max_length=20, choices=TYPE_CHOICES, default='consultation')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    
    appointment_date = models.DateField(db_index=True)
    appointment_time = models.TimeField(db_index=True)
    duration_minutes = models.IntegerField(default=30, validators=[MinValueValidator(15), MaxValueValidator(480)])
    
    reason = models.TextField(blank=True, help_text="Reason for appointment")
    notes = models.TextField(blank=True)
    
    # Recurring appointment
    is_recurring = models.BooleanField(default=False)
    recurrence_pattern = models.CharField(max_length=50, blank=True, help_text="daily, weekly, monthly")
    recurrence_end_date = models.DateField(null=True, blank=True)
    
    # Reminders
    reminder_sent = models.BooleanField(default=False)
    reminder_sent_at = models.DateTimeField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_appointments'
    )
    
    class Meta:
        db_table = 'appointments'
        ordering = ['appointment_date', 'appointment_time']
        indexes = [
            models.Index(fields=['appointment_id']),
            models.Index(fields=['patient', 'appointment_date']),
            models.Index(fields=['doctor', 'appointment_date', 'appointment_time']),
            models.Index(fields=['status', 'appointment_date']),
        ]
    
    def __str__(self):
        return f"{self.appointment_id} - {self.patient.get_full_name()} - {self.appointment_date}"


class AppointmentSlot(models.Model):
    """
    Available appointment slots for doctors.
    """
    
    doctor = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
        related_name='appointment_slots',
        limit_choices_to={'system_role': 'Medical Doctor'}
    )
    clinic = models.ForeignKey('organization.Clinic', on_delete=models.CASCADE, related_name='appointment_slots', null=True, blank=True)
    room = models.ForeignKey('organization.Room', on_delete=models.SET_NULL, null=True, blank=True, related_name='appointment_slots')
    
    day_of_week = models.IntegerField(validators=[MinValueValidator(0), MaxValueValidator(6)], help_text="0=Monday, 6=Sunday")
    start_time = models.TimeField()
    end_time = models.TimeField()
    duration_minutes = models.IntegerField(default=30, validators=[MinValueValidator(15), MaxValueValidator(480)])
    is_available = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'appointment_slots'
        unique_together = [['doctor', 'day_of_week', 'start_time']]
        ordering = ['day_of_week', 'start_time']
    
    def __str__(self):
        days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
        return f"{self.doctor.get_full_name()} - {days[self.day_of_week]} {self.start_time}"

