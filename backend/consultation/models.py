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
    clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.CASCADE,
        related_name='consultation_rooms',
        null=True,
        blank=True,
        help_text="Clinic where this consultation room is located"
    )
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
        indexes = [
            models.Index(fields=['clinic', 'status']),
            models.Index(fields=['room_number']),
        ]
    
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
    
    def save(self, *args, **kwargs):
        if not self.session_id or self.session_id.strip() == '':
            # Generate session_id: SESS-YYYYMMDD-NNNNNN
            from datetime import datetime
            date_str = datetime.now().strftime('%Y%m%d')
            # Get the last session for today
            last_session = ConsultationSession.objects.filter(
                session_id__startswith=f'SESS-{date_str}-'
            ).order_by('-session_id').first()
            
            if last_session:
                # Extract the number part and increment
                try:
                    last_num = int(last_session.session_id.split('-')[-1])
                    new_num = last_num + 1
                except (ValueError, IndexError):
                    new_num = 1
            else:
                new_num = 1
            
            self.session_id = f'SESS-{date_str}-{new_num:06d}'
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.session_id} - {self.patient.get_full_name()}"


class ConsultationQueue(models.Model):
    """
    Patient queue for consultation rooms.
    
    NOTE: Priority is automatically derived from the visit's visit_type when adding to queue.
    Users do NOT manually select priority - it's calculated from:
    - emergency -> 0 (highest)
    - follow_up -> 1
    - consultation -> 2
    - routine -> 3 (lowest)
    
    This ensures consistent queue ordering based on visit urgency.
    """
    
    room = models.ForeignKey(ConsultationRoom, on_delete=models.CASCADE, related_name='queue_items')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='queue_items')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='queue_items')
    priority = models.IntegerField(default=0, help_text="Lower number = higher priority. Automatically set from visit_type.")
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


class Referral(models.Model):
    """
    Patient referrals to other specialties or facilities.
    """
    
    URGENCY_CHOICES = [
        ('routine', 'Routine'),
        ('urgent', 'Urgent'),
        ('emergency', 'Emergency'),
    ]
    
    STATUS_CHOICES = [
        ('draft', 'Draft'),
        ('sent', 'Sent'),
        ('accepted', 'Accepted'),
        ('scheduled', 'Scheduled'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    FACILITY_TYPE_CHOICES = [
        ('internal', 'Internal - Same Facility'),
        ('external', 'External - Other Facility'),
        ('specialist', 'Specialist Clinic'),
    ]
    
    referral_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='referrals')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='referrals')
    session = models.ForeignKey(ConsultationSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='referrals')
    
    referred_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='referrals_made')
    specialty = models.CharField(max_length=100, help_text="Target specialty or department")
    facility = models.CharField(max_length=200, help_text="Target facility or clinic name")
    facility_type = models.CharField(max_length=20, choices=FACILITY_TYPE_CHOICES, default='internal')
    
    reason = models.TextField(help_text="Reason for referral")
    clinical_summary = models.TextField(blank=True, help_text="Clinical summary and relevant history")
    urgency = models.CharField(max_length=20, choices=URGENCY_CHOICES, default='routine')
    
    contact_person = models.CharField(max_length=100, blank=True)
    contact_phone = models.CharField(max_length=50, blank=True)
    contact_email = models.EmailField(blank=True)
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    
    referred_at = models.DateTimeField(auto_now_add=True)
    accepted_at = models.DateTimeField(null=True, blank=True)
    scheduled_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_referrals')
    
    class Meta:
        db_table = 'referrals'
        ordering = ['-referred_at']
    
    def save(self, *args, **kwargs):
        if not self.referral_id:
            # Generate referral_id: REF-YYYY-NNNNNN
            from datetime import datetime
            year = datetime.now().year
            # Get the last referral for this year
            last_referral = Referral.objects.filter(
                referral_id__startswith=f'REF-{year}-'
            ).order_by('-referral_id').first()
            
            if last_referral:
                # Extract the number part and increment
                try:
                    last_num = int(last_referral.referral_id.split('-')[-1])
                    new_num = last_num + 1
                except (ValueError, IndexError):
                    new_num = 1
            else:
                new_num = 1
            
            self.referral_id = f'REF-{year}-{new_num:06d}'
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.referral_id} - {self.patient.get_full_name()} to {self.specialty}"

