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

    ROOM_TYPE_CHOICES = [
        ('consultation', 'Consultation'),
        ('procedure', 'Procedure'),
        ('emergency', 'Emergency'),
        ('examination', 'Examination'),
    ]
    
    name = models.CharField(max_length=100)
    room_number = models.CharField(max_length=50, db_index=True)
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
    room_type = models.CharField(
        max_length=20,
        choices=ROOM_TYPE_CHOICES,
        default='consultation',
        db_index=True,
    )
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    capacity = models.IntegerField(default=1)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'consultation_rooms'
        ordering = ['room_number']
        constraints = [
            models.UniqueConstraint(fields=['name', 'clinic'], name='uq_room_name_per_clinic'),
            models.UniqueConstraint(fields=['room_number', 'clinic'], name='uq_room_number_per_clinic'),
        ]
        indexes = [
            models.Index(fields=['clinic', 'status']),
            models.Index(fields=['room_number']),
        ]
    
    def __str__(self):
        return f"{self.room_number} - {self.name}"


class ConsultationRoomOccupancy(models.Model):
    """
    Tracks which doctor is in a consultation room and whether they accept new patients.
    """

    STATUS_ON_SEAT = 'on_seat'
    STATUS_NOT_ACCEPTING = 'not_accepting'
    STATUS_AWAY = 'away'

    STATUS_CHOICES = [
        (STATUS_ON_SEAT, 'On Seat'),
        (STATUS_NOT_ACCEPTING, 'Not Accepting'),
        (STATUS_AWAY, 'Away'),
    ]

    room = models.ForeignKey(
        ConsultationRoom,
        on_delete=models.CASCADE,
        related_name='occupancies',
    )
    doctor = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='room_occupancies',
    )
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default=STATUS_ON_SEAT,
        db_index=True,
    )
    is_active = models.BooleanField(default=True, db_index=True)
    checked_in_at = models.DateTimeField(auto_now_add=True)
    checked_out_at = models.DateTimeField(null=True, blank=True)
    last_seen_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'consultation_room_occupancies'
        ordering = ['-checked_in_at']
        constraints = [
            models.UniqueConstraint(
                fields=['room'],
                condition=models.Q(is_active=True),
                name='uniq_active_room_occupancy',
            ),
        ]
        indexes = [
            models.Index(fields=['doctor', 'is_active']),
        ]

    def __str__(self):
        return f"{self.doctor} in {self.room} ({self.status})"


class ConsultationSession(models.Model):
    """
    Active consultation session.
    """
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('paused', 'Paused'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    session_id = models.CharField(max_length=50, unique=True, db_index=True)
    room = models.ForeignKey(ConsultationRoom, on_delete=models.PROTECT, related_name='sessions')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='consultation_sessions')
    doctor = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='consultation_sessions')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='consultation_sessions')
    location_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='consultation_sessions',
        help_text="Clinic where this consultation session takes place",
    )
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    presentation_complaint = models.TextField(blank=True, help_text="Chief complaint or presenting symptoms")
    history_of_presenting_illness = models.TextField(blank=True)
    physical_examination = models.TextField(blank=True)
    assessment = models.TextField(blank=True)
    plan = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    started_at = models.DateTimeField(auto_now_add=True)
    last_resumed_at = models.DateTimeField(null=True, blank=True)
    paused_at = models.DateTimeField(null=True, blank=True)
    active_seconds = models.PositiveIntegerField(default=0)
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

        # Auto-populate location_clinic from the room if not explicitly set
        if self.location_clinic_id is None and self.room_id:
            try:
                room = self.room
                if room.clinic_id:
                    self.location_clinic_id = room.clinic_id
            except Exception:
                pass

        if self.status == 'active' and not self.last_resumed_at:
            self.last_resumed_at = timezone.now()
        
        super().save(*args, **kwargs)

    def get_active_duration_seconds(self):
        """Total active (doctor-attending) duration in seconds, excluding paused time."""
        total = int(self.active_seconds or 0)
        if self.status == 'active' and self.last_resumed_at:
            delta = (timezone.now() - self.last_resumed_at).total_seconds()
            if delta > 0:
                total += int(delta)
        return max(0, total)
    
    def __str__(self):
        return f"{self.session_id} - {self.patient.get_full_name()}"


class PresentingComplaintCategory(models.Model):
    """Configurable category for presenting complaints library."""

    name = models.CharField(max_length=120, unique=True, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'presenting_complaint_categories'
        ordering = ['sort_order', 'name']

    def __str__(self):
        return self.name


class PresentingComplaint(models.Model):
    """Configurable presenting complaint item selectable during consultation."""

    category = models.ForeignKey(
        PresentingComplaintCategory,
        on_delete=models.PROTECT,
        related_name='complaints',
    )
    label = models.CharField(max_length=255)
    normalized_label = models.CharField(max_length=255, editable=False, db_index=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'presenting_complaints'
        ordering = ['category__sort_order', 'category__name', 'sort_order', 'label']
        constraints = [
            models.UniqueConstraint(
                fields=['category', 'normalized_label'],
                name='uniq_presenting_complaint_per_category_normalized',
            ),
        ]

    def save(self, *args, **kwargs):
        self.normalized_label = (self.label or '').strip().lower()
        super().save(*args, **kwargs)

    def __str__(self):
        return self.label


def consultation_queue_priority_for_visit(visit) -> int:
    """
    Priority tier for consultation queue ordering.
    0 = emergency (jumps ahead); 1 = normal FIFO tier (all other visit types).
    """
    if visit is not None and getattr(visit, 'visit_type', None) == 'emergency':
        return 0
    return 1


class ConsultationQueue(models.Model):
    """
    Patient queue for consultation rooms.
    
    Queue ordering: emergency patients first (priority 0), then FIFO by queued_at
    for all other visit types (priority 1). Visit type labels (follow-up, consultation,
    etc.) are shown in the UI; they do not change queue position except for emergency.
    """
    
    room = models.ForeignKey(ConsultationRoom, on_delete=models.CASCADE, related_name='queue_items')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='queue_items')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='queue_items')
    priority = models.IntegerField(
        default=1,
        help_text="0 = emergency (jumps queue); 1 = normal tier (FIFO by queued_at).",
    )
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


FACILITY_TYPE_CHOICES = [
    ('internal', 'Internal - Same Facility'),
    ('external', 'External - Other Facility'),
    ('specialist', 'Specialist Clinic'),
]


class ReferralFacility(models.Model):
    """
    Catalog of partner / receiving facilities a patient can be referred to.

    Mirrors ``laboratory.LabPartner``: a small managed list, surfaced as a
    typeahead in the referral creation form. Each ``Referral`` snapshots
    ``name`` and ``address`` onto its own row at issue time so the printed
    responsibility form keeps showing what was current when the form was
    issued, even if the catalog row is later renamed or deleted.
    """

    name = models.CharField(max_length=200, unique=True)
    code = models.CharField(
        max_length=50,
        blank=True,
        help_text="Optional short code (e.g. for reports / search).",
    )
    facility_type = models.CharField(
        max_length=20,
        choices=FACILITY_TYPE_CHOICES,
        default='external',
    )
    phone = models.CharField(max_length=50, blank=True)
    email = models.EmailField(blank=True)
    address = models.TextField(
        blank=True,
        help_text=(
            "Multi-line postal address printed on referral letters and "
            "responsibility forms (e.g. street, area, city)."
        ),
    )
    contact_person_title = models.CharField(
        max_length=100,
        blank=True,
        default="The Medical Director",
        help_text=(
            "Addressee role used in the 'To:' block on letters "
            "(e.g. 'The Medical Director', 'The Chief Executive Officer')."
        ),
    )
    specialties = models.TextField(
        blank=True,
        help_text=(
            "Optional comma-separated list of specialties this facility "
            "accepts (used to prefilter the referral typeahead)."
        ),
    )
    notes = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'referral_facilities'
        ordering = ['sort_order', 'name']
        verbose_name = 'Referral facility'
        verbose_name_plural = 'Referral facilities'

    def __str__(self):
        return self.name


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

    # Re-exposed at class level (module-level constant is the canonical source)
    # so legacy ``Referral.FACILITY_TYPE_CHOICES`` lookups keep working.
    FACILITY_TYPE_CHOICES = FACILITY_TYPE_CHOICES

    referral_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='referrals')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='referrals')
    session = models.ForeignKey(ConsultationSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='referrals')

    referred_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='referrals_made')
    specialty = models.CharField(max_length=100, help_text="Target specialty or department")
    facility_partner = models.ForeignKey(
        ReferralFacility,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='referrals',
        help_text=(
            "Catalog row for the receiving facility. May be null when the "
            "user typed a one-off facility name."
        ),
    )
    facility = models.CharField(
        max_length=200,
        help_text=(
            "Receiving facility name. Snapshot copied from "
            "``facility_partner.name`` on save when a partner is selected; "
            "free-typed for one-off referrals."
        ),
    )
    facility_address_snapshot = models.TextField(
        blank=True,
        help_text=(
            "Postal address copied from ``facility_partner.address`` at issue "
            "time so PDFs always print what was current when the referral "
            "was made."
        ),
    )
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
            from datetime import datetime
            year = datetime.now().year
            last_referral = Referral.objects.filter(
                referral_id__startswith=f'REF-{year}-'
            ).order_by('-referral_id').first()

            if last_referral:
                try:
                    last_num = int(last_referral.referral_id.split('-')[-1])
                    new_num = last_num + 1
                except (ValueError, IndexError):
                    new_num = 1
            else:
                new_num = 1

            self.referral_id = f'REF-{year}-{new_num:06d}'

        # Snapshot the partner's name + address so the printed PDF stays
        # accurate even if the facility row is later renamed or deleted.
        # Address is only copied the first time (preserves any hand-edits
        # on the snapshot afterwards). Name is copied when blank or still
        # equal to the partner's current name.
        if self.facility_partner_id:
            partner = self.facility_partner
            if partner is not None:
                if not (self.facility or '').strip():
                    self.facility = partner.name
                if not (self.facility_address_snapshot or '').strip():
                    self.facility_address_snapshot = partner.address or ''

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

    CORRECTION_REASON_CHOICES = [
        ('wrong_code', 'Wrong code selected'),
        ('non_specific', 'More specific code available'),
        ('duplicate', 'Duplicate or redundant code'),
        ('typo', 'Typo / search mistake'),
        ('other', 'Other'),
    ]

    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='diagnoses')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='diagnoses')
    session = models.ForeignKey(ConsultationSession, on_delete=models.SET_NULL, null=True, blank=True, related_name='diagnoses')

    icd10_code = models.ForeignKey(ICD10Code, on_delete=models.PROTECT, related_name='diagnoses')
    original_icd10_code = models.ForeignKey(
        ICD10Code,
        on_delete=models.PROTECT,
        null=True,
        blank=True,
        related_name='diagnoses_original',
        help_text="ICD-10 code before the first records correction (if any).",
    )
    diagnosis_text = models.TextField(blank=True, help_text="Additional diagnosis details or free text")

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='confirmed')
    certainty = models.CharField(max_length=20, choices=CERTAINTY_CHOICES, default='confirmed')

    diagnosed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='diagnoses_made')
    diagnosed_at = models.DateTimeField(auto_now_add=True)

    corrected_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='diagnoses_corrected',
    )
    corrected_at = models.DateTimeField(null=True, blank=True)
    correction_reason = models.CharField(max_length=20, choices=CORRECTION_REASON_CHOICES, blank=True)
    correction_notes = models.TextField(blank=True)

    notes = models.TextField(blank=True)

    class Meta:
        db_table = 'diagnoses'
        ordering = ['-diagnosed_at']
        unique_together = [['patient', 'visit', 'icd10_code']]

    def __str__(self):
        return f"{self.patient.get_full_name()} - {self.icd10_code.code}: {self.icd10_code.description[:50]}"
