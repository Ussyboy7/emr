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

    SOURCE_TYPE_CHOICES = [
        ('internal_emr', 'Internal EMR'),
        ('external_manual', 'External manual request'),
    ]
    
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

    source_type = models.CharField(max_length=30, choices=SOURCE_TYPE_CHOICES, default='internal_emr', db_index=True)
    external_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='external_lab_orders',
        help_text='Originating clinic/facility for manual external requests.',
    )
    external_requesting_doctor_name = models.CharField(max_length=200, blank=True)
    manual_request_reference = models.CharField(max_length=100, blank=True)
    manual_request_file = models.FileField(upload_to='lab_requests/manual/', blank=True, null=True)
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    clinic = models.CharField(max_length=100, blank=True)
    clinical_notes = models.TextField(blank=True)
    
    # One Lab ID (BT-YY-NNNN) per order; set on first sample collection, reused for all tests
    lab_number = models.CharField(max_length=20, blank=True, null=True, db_index=True)
    
    ordered_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_lab_orders')
    location_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='lab_orders',
        help_text="Clinic where this lab order was placed (requesting clinic)",
    )
    processing_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='lab_orders_processed',
        help_text="Clinic processing this lab order (defaults from requesting clinic's config, overridable)",
    )
    
    class Meta:
        db_table = 'lab_orders'
        ordering = ['-ordered_at']
        indexes = [
            models.Index(fields=['order_id']),
            models.Index(fields=['patient', '-ordered_at']),
            models.Index(fields=['priority']),
            models.Index(fields=['source_type']),
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


class LabTestResultAttachment(models.Model):
    """File attached to one custom result row inside a LabTest."""

    test = models.ForeignKey(LabTest, on_delete=models.CASCADE, related_name='result_attachments')
    row_id = models.CharField(max_length=80, db_index=True)
    row_name = models.CharField(max_length=200, blank=True)
    file = models.FileField(upload_to='lab_results/attachments/')
    uploaded_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_lab_result_attachments',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'lab_test_result_attachments'
        ordering = ['uploaded_at']
        indexes = [
            models.Index(fields=['test', 'row_id']),
        ]

    def __str__(self):
        return f"{self.row_name or self.row_id} attachment for {self.test}"


class LabReferralDispatch(models.Model):
    """
    One outbound batch send-out from a `LabOrder` to a single external `LabPartner`.

    A dispatch records "we sent these specific tests from this order to this
    partner on this date, and printed/emailed these documents". It is the
    long-lived audit trail for outsourced lab work — created at the moment a
    lab tech selects "Outsourced" for one or more tests in an order, before
    results come back.

    Lifecycle:
      issued       Default state. Sample/docs sent, results pending.
      cancelled    Withdrawn before results came back; tests stay in their
                   prior status so a fresh dispatch can be issued.
      superseded   Replaced by another dispatch (e.g. partner changed). The
                   replacement is in `superseded_by`.

    A single order can have many dispatches across time (different partners,
    re-routes after cancellation, etc.) — see `LabOrder.dispatches`.
    """

    STATUS_CHOICES = [
        ('issued', 'Issued'),
        ('cancelled', 'Cancelled'),
        ('superseded', 'Superseded'),
    ]

    # Serial in the LBR-YYYY-NNNNNN format (matches consultation REF-YYYY-NNNNNN).
    dispatch_id = models.CharField(max_length=50, unique=True, db_index=True)

    order = models.ForeignKey(
        LabOrder,
        on_delete=models.CASCADE,
        related_name='dispatches',
    )

    partner = models.ForeignKey(
        LabPartner,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dispatches',
        help_text="External lab the tests were sent to. May be null for ad-hoc 'Other' partners.",
    )
    # Snapshot — preserved even if `partner` is later renamed or removed,
    # and used when the user typed an 'Other' partner name.
    partner_name = models.CharField(max_length=200)
    # Postal address copied from `LabPartner.address` at dispatch time so PDFs
    # always print what was current when the referral was issued (and still
    # work if the FK row is later edited or removed).
    partner_address_snapshot = models.TextField(blank=True)

    tests = models.ManyToManyField(
        LabTest,
        related_name='dispatches',
        help_text="Tests included in this dispatch.",
    )

    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default='issued',
        db_index=True,
    )
    superseded_by = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supersedes',
    )
    cancellation_reason = models.TextField(blank=True)

    notes = models.TextField(blank=True)

    issued_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='issued_lab_dispatches',
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cancelled_lab_dispatches',
    )

    # Print/download tracking — drives the "did you print the docs?" nudge in
    # the dispatch confirmation panel.
    referral_letter_printed_at = models.DateTimeField(null=True, blank=True)
    responsibility_form_printed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'lab_referral_dispatches'
        ordering = ['-issued_at']
        indexes = [
            models.Index(fields=['order', '-issued_at']),
            models.Index(fields=['status']),
        ]
        verbose_name = "Lab referral dispatch"
        verbose_name_plural = "Lab referral dispatches"

    def __str__(self):
        return f"{self.dispatch_id} → {self.partner_name}"

    def save(self, *args, **kwargs):
        """Auto-generate dispatch_id (LBR-YYYY-NNNNNN) on first save."""
        if not self.dispatch_id:
            from datetime import datetime as _dt
            year = _dt.now().year
            last = (
                LabReferralDispatch.objects
                .filter(dispatch_id__startswith=f'LBR-{year}-')
                .order_by('-dispatch_id')
                .first()
            )
            if last:
                try:
                    last_num = int(last.dispatch_id.split('-')[-1])
                    new_num = last_num + 1
                except (ValueError, IndexError):
                    new_num = 1
            else:
                new_num = 1
            self.dispatch_id = f'LBR-{year}-{new_num:06d}'
        super().save(*args, **kwargs)


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


class TemplateFieldOption(models.Model):
    """
    Dropdown options for a specific field in a lab template.
    When populated, the result entry UI shows these as a Select instead of a
    free-text Input.  Managed by admins through the "Manage Result Types" UI.
    """
    template = models.ForeignKey(
        LabTemplate, on_delete=models.CASCADE, related_name='field_options'
    )
    field_name = models.CharField(max_length=255)
    value = models.CharField(max_length=255)
    sort_order = models.IntegerField(default=0)

    class Meta:
        db_table = 'lab_template_field_options'
        ordering = ['field_name', 'sort_order']
        unique_together = ['template', 'field_name', 'value']
        verbose_name = 'Template field option'
        verbose_name_plural = 'Template field options'

    def __str__(self):
        return f'{self.template.code}.{self.field_name}: {self.value}'

