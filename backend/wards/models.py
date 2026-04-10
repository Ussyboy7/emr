"""
Ward management models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class Ward(models.Model):
    """
    Hospital ward with bed management and capacity tracking.
    """

    WARD_TYPE_CHOICES = [
        ('general', 'General Medicine'),
        ('surgical', 'Surgical'),
        ('medical', 'Medical'),
        ('pediatric', 'Pediatric'),
        ('maternity', 'Maternity'),
        ('icu', 'Intensive Care Unit'),
        ('ccu', 'Coronary Care Unit'),
        ('emergency', 'Emergency'),
        ('isolation', 'Isolation'),
        ('psychiatric', 'Psychiatric'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('maintenance', 'Under Maintenance'),
        ('closed', 'Closed'),
    ]

    ward_code = models.CharField(max_length=20, unique=True, db_index=True, help_text="Unique ward code (e.g., WARD-001)")
    name = models.CharField(max_length=100, help_text="Ward name (e.g., General Medicine Ward)")
    ward_type = models.CharField(max_length=20, choices=WARD_TYPE_CHOICES, default='general')
    floor = models.CharField(max_length=50, blank=True, help_text="Floor location")
    building = models.CharField(max_length=100, blank=True, help_text="Building name")

    # Capacity and bed management
    total_beds = models.PositiveIntegerField(default=0, help_text="Total number of beds in the ward")
    occupied_beds = models.PositiveIntegerField(default=0, help_text="Currently occupied beds")

    # Ward details
    description = models.TextField(blank=True, help_text="Ward description and facilities")
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    # Contact and supervision
    head_nurse = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='supervised_wards',
        limit_choices_to={'system_role__in': ['Nurse', 'Nursing Officer']}
    )
    phone_extension = models.CharField(max_length=20, blank=True, help_text="Ward phone extension")

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_wards'
    )

    class Meta:
        db_table = 'wards'
        ordering = ['name']
        verbose_name = 'Ward'
        verbose_name_plural = 'Wards'

    def __str__(self):
        return f"{self.name} ({self.ward_code})"

    @property
    def available_beds(self):
        """Calculate available beds."""
        return max(0, self.total_beds - self.occupied_beds)

    @property
    def occupancy_rate(self):
        """Calculate occupancy rate as percentage."""
        if self.total_beds == 0:
            return 0
        return round((self.occupied_beds / self.total_beds) * 100, 1)

    def is_bed_available(self):
        """Check if ward has available beds."""
        return self.available_beds > 0

    def can_admit_patient(self):
        """Check if ward can admit new patients."""
        return self.status == 'active' and self.is_bed_available()

    def recalculate_occupancy(self):
        """Recalculate and update the occupied beds count."""
        actual_occupied = self.beds.filter(status='occupied').count()
        if self.occupied_beds != actual_occupied:
            self.occupied_beds = actual_occupied
            self.save(update_fields=['occupied_beds'])
            return True
        return False

    @classmethod
    def fix_all_occupancy_counts(cls):
        """Fix occupancy counts for all wards."""
        wards_fixed = 0
        for ward in cls.objects.all():
            if ward.recalculate_occupancy():
                wards_fixed += 1
        return wards_fixed


class Bed(models.Model):
    """
    Individual bed within a ward.
    """

    BED_TYPE_CHOICES = [
        ('standard', 'Standard Bed'),
        ('icu', 'ICU Bed'),
        ('ventilator', 'Ventilator Bed'),
        ('isolation', 'Isolation Bed'),
        ('maternity', 'Maternity Bed'),
        ('pediatric', 'Pediatric Bed'),
    ]

    STATUS_CHOICES = [
        ('available', 'Available'),
        ('occupied', 'Occupied'),
        ('maintenance', 'Under Maintenance'),
        ('reserved', 'Reserved'),
        ('out_of_service', 'Out of Service'),
    ]

    bed_number = models.CharField(max_length=20, help_text="Bed number within the ward")
    ward = models.ForeignKey(Ward, on_delete=models.CASCADE, related_name='beds')

    bed_type = models.CharField(max_length=20, choices=BED_TYPE_CHOICES, default='standard')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='available')

    # Equipment and facilities
    has_oxygen = models.BooleanField(default=False)
    has_suction = models.BooleanField(default=False)
    has_monitor = models.BooleanField(default=False)
    has_ventilator = models.BooleanField(default=False)
    has_iv_pole = models.BooleanField(default=True)

    # Current patient (if occupied)
    current_patient = models.ForeignKey(
        'patients.Patient',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='current_bed'
    )
    admission_date = models.DateTimeField(null=True, blank=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'ward_beds'
        ordering = ['bed_number']
        unique_together = ['ward', 'bed_number']
        verbose_name = 'Bed'
        verbose_name_plural = 'Beds'

    def __str__(self):
        return f"Bed {self.bed_number} - {self.ward.name}"

    def is_available(self):
        """Check if bed is available for admission."""
        return self.status == 'available' and self.ward.status == 'active'

    def assign_patient(self, patient, admission_date=None):
        """Assign patient to this bed."""
        if not self.is_available():
            raise ValueError(f"Bed {self} is not available")

        self.current_patient = patient
        self.status = 'occupied'
        self.admission_date = admission_date or timezone.now()
        self.save()

        # Update ward occupancy
        self.ward.occupied_beds += 1
        self.ward.save()

    def discharge_patient(self):
        """Discharge patient from this bed."""
        if self.current_patient:
            self.current_patient = None
            self.status = 'available'
            self.admission_date = None
            self.save()

            # Update ward occupancy
            if self.ward.occupied_beds > 0:
                self.ward.occupied_beds -= 1
                self.ward.save()


class PatientAdmission(models.Model):
    """
    Patient admission record for ward management.
    """

    ADMISSION_TYPE_CHOICES = [
        ('observation', 'Observation (Day Care)'),
        ('daycare_observation', 'Day Care Observation'),
        ('emergency', 'Emergency'),
        ('elective', 'Elective'),
        ('transfer', 'Transfer from Another Ward'),
        ('readmission', 'Readmission'),
    ]

    STATUS_CHOICES = [
        ('admitted', 'Admitted'),
        ('pending_discharge', 'Pending Discharge'),
        ('discharged', 'Discharged'),
        ('transferred', 'Transferred'),
        ('absconded', 'Absconded'),
        ('deceased', 'Deceased'),
    ]

    DISCHARGE_TYPE_CHOICES = [
        ('regular', 'Regular Discharge'),
        ('against_medical_advice', 'Against Medical Advice'),
        ('transfer', 'Transfer to Another Facility'),
        ('deceased', 'Deceased'),
    ]

    # Admission details
    admission_id = models.CharField(max_length=50, unique=True, db_index=True, blank=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='admissions')
    visit = models.ForeignKey('patients.Visit', on_delete=models.CASCADE, related_name='admissions')

    # Ward and bed assignment
    ward = models.ForeignKey(Ward, on_delete=models.PROTECT, related_name='admissions')
    bed = models.ForeignKey(Bed, on_delete=models.SET_NULL, null=True, blank=True, related_name='admissions')

    # Admission details
    admission_type = models.CharField(max_length=20, choices=ADMISSION_TYPE_CHOICES, default='elective')
    ward_assignment = models.CharField(max_length=100, blank=True, help_text="Specific ward assignment details (e.g., 'Room 201, Bed 3')")
    admitting_doctor = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='admissions',
        limit_choices_to={'system_role__in': ['Medical Doctor', 'Consultant', 'Resident Doctor']}
    )

    # Nursing order that triggered admission (if applicable)
    nursing_order = models.ForeignKey(
        'nursing.NursingOrder',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='admissions'
    )

    # Admission information
    admission_date = models.DateTimeField(default=timezone.now)
    admission_diagnosis = models.TextField(help_text="Primary diagnosis for admission")
    presenting_complaint = models.TextField(blank=True)
    admission_notes = models.TextField(blank=True)

    # Current status
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='admitted')
    current_condition = models.TextField(blank=True, help_text="Current clinical condition")

    # Discharge information
    discharge_date = models.DateTimeField(null=True, blank=True)
    discharge_type = models.CharField(max_length=30, choices=DISCHARGE_TYPE_CHOICES, blank=True)
    discharge_diagnosis = models.TextField(blank=True)
    discharge_notes = models.TextField(blank=True)
    discharge_summary = models.TextField(blank=True)
    follow_up_instructions = models.TextField(blank=True)

    # Discharge doctor
    discharge_doctor = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='discharges',
        limit_choices_to={'system_role__in': ['Medical Doctor', 'Consultant', 'Resident Doctor']}
    )

    # Transfer information (if applicable)
    transfer_to_ward = models.ForeignKey(
        Ward,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transfers_in'
    )
    transfer_reason = models.TextField(blank=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_admissions'
    )

    class Meta:
        db_table = 'patient_admissions'
        ordering = ['-admission_date']
        verbose_name = 'Patient Admission'
        verbose_name_plural = 'Patient Admissions'

    def __str__(self):
        return f"Admission {self.admission_id} - {self.patient.get_full_name()}"

    def generate_admission_id(self):
        """
        Generate a unique admission_id in the format: ADM-YYYYMMDD-NNNN
        Example: ADM-20241207-0001
        """
        if not self.admission_id or self.admission_id == '':
            date_str = self.admission_date.strftime('%Y%m%d')
            date_obj = self.admission_date.date()

            # Count admissions on the same date
            count = PatientAdmission.objects.filter(admission_date__date=date_obj).exclude(admission_id='').count()
            sequence = str(count + 1).zfill(4)

            self.admission_id = f"ADM-{date_str}-{sequence}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate admission_id."""
        is_new = self.pk is None
        if not self.admission_id or self.admission_id == '':
            self.generate_admission_id()

        super().save(*args, **kwargs)

        # Update visit admission status for new admissions
        if is_new and self.visit and self.status == 'admitted':
            self.visit.admission_status = 'observation'
            self.visit.save()

    @property
    def length_of_stay(self):
        """Calculate length of stay in days."""
        end_date = self.discharge_date or timezone.now()
        duration = end_date - self.admission_date
        return duration.days

    @property
    def is_active(self):
        """Check if admission is currently active (admitted or awaiting discharge)."""
        return self.status in ('admitted', 'pending_discharge')

    def discharge_patient(self, discharge_type='regular', discharge_doctor=None, **kwargs):
        """Discharge the patient from the ward."""
        if self.status not in ('admitted', 'pending_discharge'):
            raise ValueError("Patient is not currently admitted")

        self.status = 'discharged'
        self.discharge_date = timezone.now()
        # Only overwrite discharge_type if not already set (preserve doctor's choice)
        if discharge_type or not self.discharge_type:
            self.discharge_type = discharge_type or 'regular'
        if discharge_doctor:
            self.discharge_doctor = discharge_doctor

        # Only update fields with non-None, non-empty values to avoid wiping
        # details the doctor already filled in during initiate_discharge.
        for key, value in kwargs.items():
            if hasattr(self, key) and value is not None:
                setattr(self, key, value)

        # Free up the bed
        if self.bed:
            self.bed.discharge_patient()

        # Update visit admission status back to outpatient
        if self.visit:
            self.visit.admission_status = 'outpatient'
            self.visit.save()

        self.save()


class WardAssignment(models.Model):
    """
    Assignment of nurses to admitted patients for care management.
    """

    ASSIGNMENT_TYPE_CHOICES = [
        ('primary', 'Primary Nurse'),
        ('secondary', 'Secondary Nurse'),
        ('shift', 'Shift Assignment'),
        ('specialist', 'Specialist Care'),
    ]

    STATUS_CHOICES = [
        ('active', 'Active'),
        ('completed', 'Completed'),
        ('transferred', 'Transferred'),
    ]

    # Assignment details
    admission = models.ForeignKey(PatientAdmission, on_delete=models.CASCADE, related_name='nurse_assignments')
    nurse = models.ForeignKey(
        'accounts.User',
        on_delete=models.CASCADE,
        related_name='ward_assignments',
        limit_choices_to={'system_role__in': ['Nurse', 'Nursing Officer', 'Midwife']}
    )

    assignment_type = models.CharField(max_length=20, choices=ASSIGNMENT_TYPE_CHOICES, default='primary')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')

    # Assignment period
    assigned_at = models.DateTimeField(default=timezone.now)
    completed_at = models.DateTimeField(null=True, blank=True)

    # Assignment details
    responsibilities = models.TextField(blank=True, help_text="Specific nursing responsibilities")
    shift_notes = models.TextField(blank=True, help_text="Shift handover notes")

    # Assigned by
    assigned_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='assigned_nurses'
    )

    class Meta:
        db_table = 'ward_assignments'
        ordering = ['-assigned_at']
        verbose_name = 'Ward Assignment'
        verbose_name_plural = 'Ward Assignments'
        unique_together = ['admission', 'nurse', 'assignment_type']

    def __str__(self):
        return f"{self.nurse.get_full_name()} - {self.admission.patient.get_full_name()} ({self.assignment_type})"

    @property
    def is_active(self):
        """Check if assignment is currently active."""
        return self.status == 'active' and self.admission.is_active

    def complete_assignment(self, notes=None):
        """Mark assignment as completed."""
        self.status = 'completed'
        self.completed_at = timezone.now()
        if notes:
            self.shift_notes = notes
        self.save()


class AdmissionObservationVital(models.Model):
    """
    Continuous observation vitals chart (temp, pulse, RR, BP, Fasting Blood Sugar, Random Blood Sugar) per ward admission.
    """

    admission = models.ForeignKey(
        PatientAdmission,
        on_delete=models.CASCADE,
        related_name="observation_vitals",
    )
    recorded_at = models.DateTimeField(default=timezone.now, db_index=True)
    temperature_c = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    pulse = models.PositiveSmallIntegerField(null=True, blank=True)
    respiratory_rate = models.PositiveSmallIntegerField(null=True, blank=True)
    bp_systolic = models.PositiveSmallIntegerField(null=True, blank=True)
    bp_diastolic = models.PositiveSmallIntegerField(null=True, blank=True)
    fbs_mmol = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    rbs_mmol = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True)
    notes = models.CharField(max_length=500, blank=True)
    recorded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="recorded_observation_vitals",
    )

    class Meta:
        db_table = "admission_observation_vitals"
        ordering = ["-recorded_at"]

    def __str__(self):
        return f"Vitals {self.recorded_at} — admission {self.admission_id}"


class AdmissionTreatmentRow(models.Model):
    """
    Treatment sheet row: drug, times, reaction, nurse and doctor initials.
    """

    admission = models.ForeignKey(
        PatientAdmission,
        on_delete=models.CASCADE,
        related_name="treatment_sheet_rows",
    )
    drug_name = models.CharField(max_length=200)
    dosage = models.CharField(max_length=200, blank=True)
    route = models.CharField(max_length=100, blank=True)
    time_administered = models.TimeField(null=True, blank=True)
    time_completed = models.TimeField(null=True, blank=True)
    drug_reaction = models.CharField(max_length=500, blank=True)
    nurse_initials = models.CharField(max_length=12, blank=True)
    doctor_initials = models.CharField(max_length=12, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="recorded_treatment_sheet_rows",
    )

    class Meta:
        db_table = "admission_treatment_sheet_rows"
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.drug_name} — admission {self.admission_id}"
