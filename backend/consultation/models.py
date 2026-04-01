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
    presentation_complaint = models.TextField(blank=True, help_text="Chief complaint or presenting symptoms")
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
        constraints = [
            # Prevent more than one active session for the same visit.
            models.UniqueConstraint(
                fields=['visit'],
                condition=models.Q(status='active', visit__isnull=False),
                name='uniq_active_consult_session_per_visit',
            ),
            # Additional guard for rows without visit linkage.
            models.UniqueConstraint(
                fields=['patient', 'room'],
                condition=models.Q(status='active'),
                name='uniq_active_consult_session_per_patient_room',
            ),
        ]
    
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
        # Only one ACTIVE queue item per room-patient combo
        # Multiple inactive items are OK (they've been processed/called)
        constraints = [
            models.UniqueConstraint(
                fields=['room', 'patient'],
                condition=models.Q(is_active=True),
                name='unique_active_queue_item'
            )
        ]
    
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
        ('submitted_to_records', 'Submitted to Records'),
        ('records_review', 'Records Review'),
        ('returned_for_correction', 'Returned for Correction'),
        ('approved_for_forms', 'Records acknowledged'),
        ('closed', 'Closed'),
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
    
    status = models.CharField(max_length=40, choices=STATUS_CHOICES, default='draft')
    notes = models.TextField(blank=True)
    
    referred_at = models.DateTimeField(auto_now_add=True)
    submitted_at = models.DateTimeField(null=True, blank=True)
    reviewed_at = models.DateTimeField(null=True, blank=True)
    approved_at = models.DateTimeField(null=True, blank=True)
    closed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_referrals')
    referral_letter_acknowledged_at = models.DateTimeField(null=True, blank=True)
    referral_letter_acknowledged_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referral_letters_acknowledged',
    )
    
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


class ResponsibilityFormIssuance(models.Model):
    """Monthly responsibility form issuances linked to a referral."""

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('expired', 'Expired'),
        ('revoked', 'Revoked'),
        ('used', 'Used'),
    ]

    referral = models.ForeignKey(Referral, on_delete=models.CASCADE, related_name='responsibility_forms')
    sequence_number = models.PositiveIntegerField(default=1)
    issue_date = models.DateTimeField(auto_now_add=True)
    valid_from = models.DateField()
    valid_to = models.DateField()
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    hospital_name_snapshot = models.CharField(max_length=200, blank=True)
    document_file = models.FileField(upload_to='referral_forms/', blank=True, null=True)
    notes = models.TextField(blank=True)
    issued_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='issued_responsibility_forms')
    records_acknowledged_at = models.DateTimeField(null=True, blank=True)
    records_acknowledged_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='responsibility_forms_acknowledged',
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'responsibility_form_issuances'
        ordering = ['-issue_date']
        constraints = [
            models.UniqueConstraint(fields=['referral', 'sequence_number'], name='uniq_referral_form_sequence'),
        ]

    def __str__(self):
        return f"{self.referral.referral_id} Form #{self.sequence_number}"


class ICD10Code(models.Model):
    """
    ICD-10 (International Classification of Diseases, 10th Revision) codes for medical diagnosis.
    """

    code = models.CharField(max_length=10, unique=True, db_index=True, help_text="ICD-10 code (e.g., A00.0, J00)")
    description = models.TextField(help_text="Full description of the diagnosis")
    category = models.CharField(max_length=100, blank=True, help_text="ICD-10 category/chapter")
    is_active = models.BooleanField(default=True, help_text="Whether this code is currently active")

    class Meta:
        db_table = 'icd10_codes'
        ordering = ['code']
        indexes = [
            models.Index(fields=['code']),
            models.Index(fields=['category']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.description[:50]}"


class Diagnosis(models.Model):
    """
    Patient diagnosis records linked to ICD-10 codes.
    """

    STATUS_CHOICES = [
        ('confirmed', 'Confirmed'),
        ('suspected', 'Suspected'),
        ('ruled_out', 'Ruled Out'),
    ]

    CERTAINTY_CHOICES = [
        ('confirmed', 'Confirmed'),
        ('probable', 'Probable'),
        ('possible', 'Possible'),
    ]

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='diagnoses')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='diagnoses')
    session = models.ForeignKey(ConsultationSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='diagnoses')

    icd10_code = models.ForeignKey(ICD10Code, on_delete=models.PROTECT, related_name='diagnoses')
    diagnosis_text = models.TextField(blank=True, help_text="Additional diagnosis details or free text")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='confirmed')
    certainty = models.CharField(max_length=20, choices=CERTAINTY_CHOICES, default='confirmed')

    diagnosed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='diagnoses_made')
    diagnosed_at = models.DateTimeField(auto_now_add=True)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'diagnoses'
        ordering = ['-diagnosed_at']
        unique_together = [['patient', 'visit', 'icd10_code']]

    def __str__(self):
        return f"{self.patient.get_full_name()} - {self.icd10_code.code}: {self.icd10_code.description[:50]}"

