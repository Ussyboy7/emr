"""
Radiology models for the EMR system.
"""
from django.db import models
from django.utils import timezone
from django.db.models import Max


class ImagingPartner(models.Model):
    """
    External / outsourced imaging center partners (for outsourced processing).
    Managed via Django admin or API; shown in radiology study processing UI.
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
        db_table = "radiology_outsourced_partners"
        ordering = ["sort_order", "name"]
        verbose_name = "Imaging partner (outsourced)"
        verbose_name_plural = "Imaging partners (outsourced)"

    def __str__(self):
        return self.name


class RadiologyTemplate(models.Model):
    """
    Radiology investigation templates for common imaging procedures.
    """

    CATEGORY_CHOICES = [
        ('xray', 'X-Ray'),
        ('ct', 'CT Scan'),
        ('mri', 'MRI'),
        ('ultrasound', 'Ultrasound'),
        ('mammography', 'Mammography'),
        ('fluoroscopy', 'Fluoroscopy'),
        ('angiography', 'Angiography'),
        ('nuclear', 'Nuclear Medicine'),
        ('dental', 'Dental Imaging'),
        ('interventional', 'Interventional Radiology'),
    ]

    SUBCATEGORY_CHOICES = [
        ('plain_film', 'Plain Film'),
        ('contrast_studies', 'Contrast Studies'),
        ('special_procedures', 'Special Procedures'),
        ('doppler', 'Doppler Studies'),
        ('abdominal', 'Abdominal'),
        ('cardiac', 'Cardiac'),
        ('musculoskeletal', 'Musculoskeletal'),
        ('neurological', 'Neurological'),
        ('thoracic', 'Thoracic'),
        ('vascular', 'Vascular'),
        ('oncological', 'Oncological'),
    ]

    name = models.CharField(max_length=200, help_text="Full procedure name")
    code = models.CharField(max_length=50, unique=True, db_index=True, help_text="Procedure code (e.g., XR-ABD, CT-CHEST)")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, default='xray')
    subcategory = models.CharField(max_length=50, choices=SUBCATEGORY_CHOICES, blank=True)
    description = models.TextField(blank=True, help_text="Detailed description of the procedure")
    body_part = models.CharField(max_length=100, blank=True, help_text="Primary body part/area")
    modality = models.CharField(max_length=50, blank=True, help_text="Imaging modality")

    # Technical parameters
    radiation_exposure = models.CharField(max_length=20, choices=[
        ('none', 'No Radiation'),
        ('low', 'Low Radiation'),
        ('moderate', 'Moderate Radiation'),
        ('high', 'High Radiation'),
    ], default='moderate')
    preparation_required = models.TextField(blank=True, help_text="Patient preparation instructions")

    # Clinical information
    indications = models.TextField(blank=True, help_text="Clinical indications")
    contraindications = models.TextField(blank=True, help_text="Contraindications")
    turnaround_time = models.CharField(max_length=50, blank=True, help_text="Expected turnaround time")

    # Reporting template
    report_template = models.JSONField(default=dict, blank=True, help_text="Structured reporting template")

    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'radiology_templates'
        ordering = ['category', 'name']
        indexes = [
            models.Index(fields=['category']),
            models.Index(fields=['modality']),
            models.Index(fields=['is_active']),
        ]

    def __str__(self):
        return f"{self.code} - {self.name}"


class RadiologyOrder(models.Model):
    """
    Radiology/imaging order from a doctor.
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
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='radiology_orders')
    doctor = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='ordered_radiology')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='radiology_orders')
    consultation_session = models.ForeignKey('consultation.ConsultationSession', on_delete=models.SET_NULL, null=True, blank=True, related_name='radiology_orders')

    source_type = models.CharField(max_length=30, choices=SOURCE_TYPE_CHOICES, default='internal_emr', db_index=True)
    external_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='external_radiology_orders',
        help_text='Originating clinic/facility for manual external requests.',
    )
    external_requesting_doctor_name = models.CharField(max_length=200, blank=True)
    manual_request_reference = models.CharField(max_length=100, blank=True)
    manual_request_file = models.FileField(upload_to='radiology_requests/manual/', blank=True, null=True)
    
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='routine')
    clinic = models.CharField(max_length=100, blank=True)
    clinical_notes = models.TextField(blank=True)
    provisional_diagnosis = models.TextField(blank=True)
    lmp = models.DateField(null=True, blank=True)
    
    ordered_at = models.DateTimeField(auto_now_add=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_radiology_orders')

    # Simplified workflow fields (like lab orders)
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('processing', 'Processing'),
        ('results_ready', 'Results Ready'),
        ('verified', 'Verified'),
        ('rejected', 'Rejected'),
    ]
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    report = models.TextField(blank=True, help_text="Radiology report text")
    critical = models.BooleanField(default=False, help_text="Critical findings flag")
    processed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='processed_radiology_orders')
    processed_at = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        db_table = 'radiology_orders'
        ordering = ['-ordered_at']
        indexes = [
            models.Index(fields=['source_type']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-generate order_id if not provided and normalize clinic names."""
        # Normalize clinic name before saving
        if self.clinic:
            from common.clinic_utils import normalize_clinic_name
            self.clinic = normalize_clinic_name(self.clinic)

        if not self.order_id:
            # Generate radiology order ID: BT-YY-NNNN
            current_year = timezone.now().year % 100
            prefix = f"BT-{current_year:02d}-"
            max_order_id = RadiologyOrder.objects.filter(
                order_id__startswith=prefix
            ).aggregate(Max('order_id'))['order_id__max']

            if max_order_id:
                try:
                    next_serial = int(max_order_id.split('-')[-1]) + 1
                except (ValueError, IndexError):
                    next_serial = 0
            else:
                next_serial = 0

            self.order_id = f"{prefix}{next_serial:04d}"
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.order_id} - {self.patient.get_full_name()}"


class RadiologyStudy(models.Model):
    """
    Individual imaging study within an order.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('scheduled', 'Scheduled'),
        ('acquired', 'Acquired'),
        ('processing', 'Processing'),
        ('reported', 'Reported'),
        ('verified', 'Verified'),
    ]
    
    PROCESSING_METHOD_CHOICES = [
        ('in_house', 'In-house'),
        ('outsourced', 'Outsourced'),
    ]
    
    order = models.ForeignKey(RadiologyOrder, on_delete=models.CASCADE, related_name='studies')
    template = models.ForeignKey(RadiologyTemplate, on_delete=models.SET_NULL, null=True, blank=True, related_name='studies', help_text="Standard procedure template")
    procedure = models.CharField(max_length=200)
    body_part = models.CharField(max_length=100, blank=True)
    modality = models.CharField(max_length=50, blank=True, help_text="X-Ray, CT, MRI, Ultrasound, etc.")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    
    # Scheduling
    scheduled_date = models.DateField(null=True, blank=True)
    scheduled_time = models.TimeField(null=True, blank=True)
    scheduled_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='scheduled_studies')
    
    # Acquisition
    processing_method = models.CharField(max_length=20, choices=PROCESSING_METHOD_CHOICES, blank=True, null=True)
    outsourced_facility = models.CharField(max_length=200, blank=True)
    images_count = models.IntegerField(default=0)
    technical_notes = models.TextField(blank=True)
    acquired_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='acquired_studies')
    acquired_at = models.DateTimeField(null=True, blank=True)
    
    # Reporting
    report = models.TextField(blank=True, help_text="Radiology report text")
    custom_reports = models.JSONField(default=list, blank=True, help_text="Structured report rows for Other studies")
    recommendations = models.TextField(blank=True)
    critical = models.BooleanField(default=False, help_text="Critical findings flag")
    report_file = models.FileField(upload_to='radiology_reports/', blank=True, null=True, help_text="Uploaded report file")
    reported_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='reported_studies')
    reported_at = models.DateTimeField(null=True, blank=True)
    
    # Rejection
    rejected_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='rejected_radiology_studies')
    rejected_at = models.DateTimeField(null=True, blank=True)

    # Verification
    verified_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, blank=True, related_name='verified_studies')
    verified_at = models.DateTimeField(null=True, blank=True)
    verification_notes = models.TextField(blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'radiology_studies'
        ordering = ['-created_at']
        verbose_name_plural = 'Radiology Studies'
    
    def __str__(self):
        return f"{self.procedure} - {self.order.order_id}"


class RadiologyStudyReportAttachment(models.Model):
    """File attached to one custom report row inside a radiology study."""

    study = models.ForeignKey(RadiologyStudy, on_delete=models.CASCADE, related_name='report_attachments')
    row_id = models.CharField(max_length=80, db_index=True)
    row_name = models.CharField(max_length=200, blank=True)
    file = models.FileField(upload_to='radiology_reports/attachments/')
    uploaded_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='uploaded_radiology_report_attachments',
    )
    uploaded_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        db_table = 'radiology_study_report_attachments'
        ordering = ['uploaded_at']
        indexes = [
            models.Index(fields=['study', 'row_id']),
        ]

    def __str__(self):
        return f"{self.row_name or self.row_id} attachment for {self.study}"


class RadiologyReport(models.Model):
    """
    Radiology reports awaiting verification.
    """
    
    OVERALL_STATUS_CHOICES = [
        ('normal', 'Normal'),
        ('abnormal', 'Abnormal'),
        ('critical', 'Critical'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
    ]
    
    study = models.OneToOneField(RadiologyStudy, on_delete=models.CASCADE, related_name='report_record')
    order = models.ForeignKey(RadiologyOrder, on_delete=models.CASCADE, related_name='report_records')
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='radiology_reports')
    
    overall_status = models.CharField(max_length=20, choices=OVERALL_STATUS_CHOICES, blank=True)
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'radiology_reports'
        ordering = ['-created_at']
    
    def __str__(self):
        return f"Report for {self.study.procedure} - {self.patient.get_full_name()}"


class RadiologyReferralDispatch(models.Model):
    """
    One outbound batch send-out from a `RadiologyOrder` to a single external `ImagingPartner`.

    A dispatch records "we sent these specific studies from this order to this
    imaging center on this date, and printed/emailed these documents". It is
    the long-lived audit trail for outsourced radiology work — created at the
    moment a radiographer selects "Outsourced" for one or more studies in an
    order, before films/reports come back.

    Lifecycle mirrors `laboratory.LabReferralDispatch`:
      issued       Default state. Patient/films/docs sent, results pending.
      cancelled    Withdrawn before results came back; studies stay in their
                   prior status so a fresh dispatch can be issued.
      superseded   Replaced by another dispatch (e.g. partner changed). The
                   replacement is in `superseded_by`.

    A single order can have many dispatches across time (different partners,
    re-routes after cancellation, etc.) — see `RadiologyOrder.dispatches`.
    """

    STATUS_CHOICES = [
        ('issued', 'Issued'),
        ('cancelled', 'Cancelled'),
        ('superseded', 'Superseded'),
    ]

    # Serial in the RAD-YYYY-NNNNNN format (parallel to lab's LBR-YYYY-NNNNNN
    # and consultation's REF-YYYY-NNNNNN).
    dispatch_id = models.CharField(max_length=50, unique=True, db_index=True)

    order = models.ForeignKey(
        RadiologyOrder,
        on_delete=models.CASCADE,
        related_name='dispatches',
    )

    partner = models.ForeignKey(
        ImagingPartner,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dispatches',
        help_text="External imaging center the studies were sent to. May be null for ad-hoc 'Other' partners.",
    )
    # Snapshot — preserved even if `partner` is later renamed or removed,
    # and used when the user typed an 'Other' partner name.
    partner_name = models.CharField(max_length=200)
    # Postal address copied from `ImagingPartner.address` at dispatch time so
    # PDFs always print what was current when the referral was issued (and
    # still work if the FK row is later edited or removed).
    partner_address_snapshot = models.TextField(blank=True)

    studies = models.ManyToManyField(
        RadiologyStudy,
        related_name='dispatches',
        help_text="Studies included in this dispatch.",
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
        related_name='issued_radiology_dispatches',
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    cancelled_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='cancelled_radiology_dispatches',
    )

    # Print/download tracking — drives the "did you print the docs?" nudge in
    # the dispatch confirmation panel.
    referral_letter_printed_at = models.DateTimeField(null=True, blank=True)
    responsibility_form_printed_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'radiology_referral_dispatches'
        ordering = ['-issued_at']
        indexes = [
            models.Index(fields=['order', '-issued_at']),
            models.Index(fields=['status']),
        ]
        verbose_name = "Radiology referral dispatch"
        verbose_name_plural = "Radiology referral dispatches"

    def __str__(self):
        return f"{self.dispatch_id} → {self.partner_name}"

    def save(self, *args, **kwargs):
        """Auto-generate dispatch_id (RAD-YYYY-NNNNNN) on first save."""
        if not self.dispatch_id:
            from datetime import datetime as _dt
            year = _dt.now().year
            last = (
                RadiologyReferralDispatch.objects
                .filter(dispatch_id__startswith=f'RAD-{year}-')
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
            self.dispatch_id = f'RAD-{year}-{new_num:06d}'
        super().save(*args, **kwargs)
