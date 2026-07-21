"""
Patient models for the EMR system.
"""

from django.db import models
from django.core.validators import RegexValidator, MinValueValidator, MaxValueValidator
from django.utils import timezone
from .validators import validate_personal_number_uniqueness


class Patient(models.Model):
    """
    Patient demographic and personal information.
    Supports Employee, Retiree, NonNPA, and Dependent categories.
    """

    CATEGORY_CHOICES = [
        ("employee", "Employee"),
        ("retiree", "Retiree"),
        ("nonnpa", "NonNPA"),
        ("dependent", "Dependent"),
    ]

    GENDER_CHOICES = [
        ("male", "Male"),
        ("female", "Female"),
    ]

    MARITAL_STATUS_CHOICES = [
        ("single", "Single"),
        ("married", "Married"),
        ("divorced", "Divorced"),
        ("widowed", "Widowed"),
    ]

    BLOOD_GROUP_CHOICES = [
        ("A+", "A+"),
        ("A-", "A-"),
        ("B+", "B+"),
        ("B-", "B-"),
        ("AB+", "AB+"),
        ("AB-", "AB-"),
        ("O+", "O+"),
        ("O-", "O-"),
    ]

    GENOTYPE_CHOICES = [
        ("AA", "AA"),
        ("AS", "AS"),
        ("SS", "SS"),
        ("AC", "AC"),
        ("SC", "SC"),
    ]

    TITLE_CHOICES = [
        ("mr", "Mr"),
        ("mrs", "Mrs"),
        ("ms", "Ms"),
        ("master", "Master"),
        ("miss", "Miss"),
        ("dr", "Dr"),
        ("chief", "Chief"),
        ("engr", "Engr"),
        ("prof", "Prof"),
        ("alhaji", "Alhaji"),
        ("hajia", "Hajia"),
        ("mallam", "Mallam"),
        ("lady", "Lady"),
    ]

    # Patient Identification
    patient_id = models.CharField(max_length=50, unique=True, db_index=True)
    category = models.CharField(
        max_length=20, choices=CATEGORY_CHOICES, default="employee"
    )

    # Personal Details
    title = models.CharField(max_length=20, choices=TITLE_CHOICES, blank=True)
    surname = models.CharField(max_length=100)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()
    marital_status = models.CharField(
        max_length=20, choices=MARITAL_STATUS_CHOICES, blank=True
    )
    religion = models.CharField(max_length=50, blank=True)
    tribe = models.CharField(max_length=50, blank=True)
    occupation = models.CharField(
        max_length=100, blank=True, null=True
    )  # For Dependent and Retiree only
    photo = models.ImageField(upload_to="patients/photos/", blank=True, null=True)

    # Employee/Retiree Specific
    personal_number = models.CharField(
        max_length=50, blank=True, null=True, db_index=True
    )
    employee_type = models.CharField(
        max_length=20, blank=True, null=True
    )  # Officer, Staff
    division = models.CharField(max_length=100, blank=True, null=True)
    location = models.CharField(max_length=100, blank=True, null=True)
    location_clinic = models.ForeignKey(
        "organization.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="patients",
        help_text="Clinic/facility from Clinics & Departments (replaces free-text location when set)",
    )

    # NonNPA Specific
    nonnpa_type = models.CharField(
        max_length=50, blank=True, null=True
    )  # Police, IT, NYSC, etc.

    # Dependent Specific
    dependent_type = models.CharField(
        max_length=50, blank=True, null=True
    )  # Employee Dependent, Retiree Dependent
    principal_staff = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dependents",
        limit_choices_to={"category__in": ["employee", "retiree"]},
    )

    # Contact Information
    email = models.EmailField(blank=True)
    phone_regex = RegexValidator(
        regex=r"^\+?1?\d{9,15}$",
        message="Phone number must be entered in the format: '+999999999'. Up to 15 digits allowed.",
    )
    phone = models.CharField(validators=[phone_regex], max_length=17, blank=True)
    state_of_residence = models.CharField(max_length=100, blank=True)
    residential_address = models.TextField(blank=True)
    state_of_origin = models.CharField(max_length=100, blank=True)
    lga = models.CharField(max_length=100, blank=True)
    permanent_address = models.TextField(blank=True)

    # Medical Information
    blood_group = models.CharField(
        max_length=5, choices=BLOOD_GROUP_CHOICES, blank=True
    )
    genotype = models.CharField(max_length=5, choices=GENOTYPE_CHOICES, blank=True)
    allergies = models.TextField(
        blank=True, help_text="Known allergies (comma-separated or newline-separated)"
    )

    # Next of Kin
    nok_surname = models.CharField(max_length=100, blank=True)
    nok_first_name = models.CharField(max_length=100, blank=True)
    nok_middle_name = models.CharField(max_length=100, blank=True)
    nok_relationship = models.CharField(max_length=50, blank=True)
    nok_address = models.TextField(blank=True)
    nok_phone = models.CharField(validators=[phone_regex], max_length=17, blank=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_patients",
    )
    updated_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="updated_patients",
    )
    is_active = models.BooleanField(default=True)

    # Merge support. If merged_into is set, this record has been folded into
    # another patient. Clinical FKs were re-pointed at merge time; this row
    # is kept for audit only and filtered from default list endpoints.
    merged_into = models.ForeignKey(
        "self",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="merged_records",
        help_text="If set, this record was merged into the referenced patient.",
    )
    merged_at = models.DateTimeField(null=True, blank=True)
    merge_reason = models.TextField(blank=True)

    class Meta:
        db_table = "patients"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["patient_id"]),
            models.Index(fields=["personal_number"]),
            models.Index(fields=["category"]),
            models.Index(fields=["surname", "first_name"]),
        ]

    def __str__(self):
        return f"{self.patient_id} - {self.get_full_name()}"

    def get_full_name(self):
        """
        Canonical display name from stored fields only (no client-side reordering needed):
        optional title, then surname, first name, and middle name separated by spaces (empty parts omitted).
        """
        title_display = None
        if self.title:
            title_lower = str(self.title).lower().strip()
            title_map = {
                "mr": "Mr",
                "mrs": "Mrs",
                "ms": "Ms",
                "master": "Master",
                "miss": "Miss",
                "dr": "Dr",
                "chief": "Chief",
                "engr": "Engr",
                "prof": "Prof",
                "alhaji": "Alhaji",
                "hajia": "Hajia",
                "mallam": "Mallam",
                "lady": "Lady",
            }
            title_display = title_map.get(title_lower, str(self.title).title())

        segments = []
        for value in (self.surname, self.first_name, self.middle_name):
            if value:
                s = str(value).strip()
                if s:
                    segments.append(s)
        core = " ".join(segments)

        if title_display and core:
            return f"{title_display} {core}"
        if title_display:
            return title_display
        return core

    def get_age_components(self):
        """Return medically useful age components as years and months."""
        today = timezone.now().date()
        if not self.date_of_birth or self.date_of_birth > today:
            return 0, 0

        years = today.year - self.date_of_birth.year
        months = today.month - self.date_of_birth.month

        if today.day < self.date_of_birth.day:
            months -= 1

        if months < 0:
            years -= 1
            months += 12

        if years < 0:
            return 0, 0

        return years, months

    @property
    def age(self):
        """Return completed years for compatibility with existing consumers."""
        years, _months = self.get_age_components()
        return years

    @property
    def age_display(self):
        """Return a medically useful age string using years and months."""
        years, months = self.get_age_components()

        if years <= 0:
            return f"{months} month{'s' if months != 1 else ''}"

        if months <= 0:
            return f"{years} year{'s' if years != 1 else ''}"

        return f"{years} year{'s' if years != 1 else ''} {months} month{'s' if months != 1 else ''}"

    def generate_patient_id(self):
        """
        Generate patient ID based on category:
        - Employee: E-{personal_number} (e.g., E-A2962)
        - Retiree: R-{personal_number} (e.g., R-A2962)
        - Non-NPA: NN-{type}-{number} (e.g., NN-NYSC-01)
        - Dependent: {parent_patient_id}-{sequence} (e.g., E-A2962-01)
        """
        # Only generate if this is a new record (no pk) and patient_id is not set
        if not self.pk and not self.patient_id:
            if self.category == "employee":
                if not self.personal_number:
                    raise ValueError(
                        "Personal number is required for Employee patients"
                    )
                self.patient_id = f"E-{self.personal_number.strip().upper()}"

            elif self.category == "retiree":
                if not self.personal_number:
                    raise ValueError("Personal number is required for Retiree patients")
                self.patient_id = f"R-{self.personal_number.strip().upper()}"

            elif self.category == "nonnpa":
                if not self.nonnpa_type:
                    raise ValueError("Non-NPA type is required for Non-NPA patients")
                # Count existing Non-NPA patients of the same type to get next number
                count = Patient.objects.filter(
                    category="nonnpa", nonnpa_type__iexact=self.nonnpa_type.strip()
                ).count()
                sequence = str(count + 1).zfill(
                    2
                )  # Zero-padded to 2 digits (01, 02, etc.)
                self.patient_id = f"NN-{self.nonnpa_type.strip().upper()}-{sequence}"

            elif self.category == "dependent":
                if not self.principal_staff_id and not self.principal_staff:
                    raise ValueError(
                        "Principal staff is required for Dependent patients"
                    )

                # Ensure we have the principal_staff object loaded
                if self.principal_staff_id and not self.principal_staff:
                    # Reload the principal_staff from database
                    self.principal_staff = Patient.objects.get(
                        pk=self.principal_staff_id
                    )

                # Validate that principal_staff is an employee or retiree
                if self.principal_staff.category not in ["employee", "retiree"]:
                    raise ValueError(
                        f"Principal staff must be an employee or retiree. Found category: {self.principal_staff.category}"
                    )

                # Ensure principal_staff has a patient_id
                if not self.principal_staff.patient_id:
                    # If principal doesn't have an ID yet, save it first to generate one
                    self.principal_staff.save()
                    # Reload to get the generated patient_id
                    self.principal_staff.refresh_from_db()

                # Determine dependent prefix and base from principal
                parent_category = self.principal_staff.category
                base_number = (
                    (self.principal_staff.personal_number or "").strip().upper()
                )
                if not base_number:
                    raise ValueError(
                        "Principal personal number is required to generate dependent patient_id"
                    )
                prefix = "ED" if parent_category == "employee" else "RD"
                # Count existing dependents for this principal
                count = Patient.objects.filter(
                    category="dependent", principal_staff_id=self.principal_staff.id
                ).count()
                sequence = str(count + 1)  # No zero padding
                self.patient_id = f"{prefix}-{base_number}-{sequence}"
            else:
                raise ValueError(f"Invalid patient category: {self.category}")

    def regenerate_patient_id(self):
        """
        Regenerate patient ID when category changes (e.g., Employee → Retiree).
        This method updates the patient_id for existing records.
        """
        old_patient_id = self.patient_id

        if self.category == "employee":
            if not self.personal_number:
                raise ValueError("Personal number is required for Employee patients")
            self.patient_id = f"E-{self.personal_number.strip().upper()}"

        elif self.category == "retiree":
            if not self.personal_number:
                raise ValueError("Personal number is required for Retiree patients")
            self.patient_id = f"R-{self.personal_number.strip().upper()}"

        elif self.category == "nonnpa":
            if not self.nonnpa_type:
                raise ValueError("Non-NPA type is required for Non-NPA patients")
            # For existing records, try to preserve the sequence if possible
            if old_patient_id and old_patient_id.startswith("NN-"):
                # Keep existing sequence
                parts = old_patient_id.split("-")
                if len(parts) >= 3:
                    sequence = parts[-1]
                    self.patient_id = (
                        f"NN-{self.nonnpa_type.strip().upper()}-{sequence}"
                    )
                else:
                    # Generate new sequence
                    count = Patient.objects.filter(
                        category="nonnpa", nonnpa_type__iexact=self.nonnpa_type.strip()
                    ).count()
                    sequence = str(count + 1).zfill(2)
                    self.patient_id = (
                        f"NN-{self.nonnpa_type.strip().upper()}-{sequence}"
                    )
            else:
                # Generate new sequence
                count = Patient.objects.filter(
                    category="nonnpa", nonnpa_type__iexact=self.nonnpa_type.strip()
                ).count()
                sequence = str(count + 1).zfill(2)
                self.patient_id = f"NN-{self.nonnpa_type.strip().upper()}-{sequence}"

        elif self.category == "dependent":
            if not self.principal_staff:
                raise ValueError("Principal staff is required for Dependent patients")
            # For existing dependents, regenerate based on current principal
            parent_category = self.principal_staff.category
            base_number = (self.principal_staff.personal_number or "").strip().upper()
            prefix = "ED" if parent_category == "employee" else "RD"
            # Find the sequence for this dependent among siblings
            siblings = Patient.objects.filter(
                category="dependent", principal_staff=self.principal_staff
            ).order_by("created_at")

            sequence = 1
            for sibling in siblings:
                if sibling.pk == self.pk:
                    break
                sequence += 1

            self.patient_id = f"{prefix}-{base_number}-{sequence}"

        return old_patient_id != self.patient_id  # Return True if ID changed

    def clean(self):
        """Validate model fields before saving."""
        super().clean()

        # Validate personal number uniqueness for Employee/Retiree
        if self.personal_number and self.category in ["employee", "retiree"]:
            validate_personal_number_uniqueness(
                self.personal_number, patient_id=self.pk, category=self.category
            )

    def save(self, *args, **kwargs):
        """Override save to auto-generate patient_id for new patients."""
        # Validate before saving
        self.clean()

        # Generate patient_id only for new records
        if not self.pk:
            self.generate_patient_id()

            # Ensure uniqueness (handle edge cases)
            original_id = self.patient_id
            counter = 1
            while Patient.objects.filter(patient_id=self.patient_id).exists():
                # Handle collisions by incrementing sequence
                if self.category == "dependent":
                    # For dependents, increment the sequence (no zero padding)
                    base_id = "-".join(original_id.split("-")[:-1])
                    self.patient_id = f"{base_id}-{str(counter + 1)}"
                elif self.category == "nonnpa":
                    # For Non-NPA, increment the number
                    parts = original_id.split("-")
                    if len(parts) >= 3:
                        base = "-".join(parts[:-1])
                        self.patient_id = f"{base}-{str(counter + 1).zfill(2)}"
                    else:
                        self.patient_id = f"{original_id}-{counter}"
                else:
                    # This should never happen due to validation, but handle gracefully
                    raise ValueError(
                        f"Unable to generate unique patient_id for {self.category}"
                    )
                counter += 1
                if counter > 100:  # Safety limit
                    raise ValueError(
                        f"Unable to generate unique patient_id for {self.category}"
                    )
        else:
            from patients.principal_ids import align_principal_patient_id

            aligned_fields = align_principal_patient_id(self)
            update_fields = kwargs.get("update_fields")
            if update_fields is not None and aligned_fields:
                kwargs["update_fields"] = list(set(update_fields) | set(aligned_fields))

        super().save(*args, **kwargs)


class Visit(models.Model):
    """
    Patient visit/appointment record.
    """

    VISIT_TYPE_CHOICES = [
        ("consultation", "Consultation"),
        ("follow_up", "Follow-up"),
        ("emergency", "Emergency"),
        ("routine", "Routine Checkup"),
        ("responsibility_form", "Responsibility Form"),
        ("annual_checkup", "Annual Check-up"),
        ("nursing_procedure", "Nursing Procedure"),
    ]

    STATUS_CHOICES = [
        ("scheduled", "Scheduled"),
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    ADMISSION_STATUS_CHOICES = [
        ("outpatient", "Outpatient"),
        ("observation", "Observation/Short Stay"),
        ("admitted", "Ward Admission"),
        ("day_case", "Day Case"),
    ]

    visit_id = models.CharField(max_length=50, unique=True, db_index=True, blank=True)
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name="visits"
    )
    visit_type = models.CharField(
        max_length=20, choices=VISIT_TYPE_CHOICES, default="consultation"
    )
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="scheduled"
    )
    admission_status = models.CharField(
        max_length=20, choices=ADMISSION_STATUS_CHOICES, default="outpatient"
    )

    # Visit Details
    date = models.DateField()
    time = models.TimeField()
    clinic = models.CharField(
        max_length=100, blank=True
    )  # Primary clinic (for backward compatibility)
    clinics = models.JSONField(
        default=list, blank=True
    )  # List of all clinics for this visit
    completed_clinics = models.JSONField(
        default=list, blank=True
    )  # Clinics that have been completed
    location = models.CharField(max_length=100, blank=True, null=True)
    location_clinic = models.ForeignKey(
        "organization.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="visits",
        help_text="Clinic/facility from Clinics & Departments (replaces free-text location when set)",
    )
    doctor = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="patient_visits",
        limit_choices_to={"system_role": "Medical Doctor"},
    )
    clinical_notes = models.TextField(blank=True)

    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_visits",
    )

    class Meta:
        db_table = "visits"
        ordering = ["-date", "-time"]
        indexes = [
            models.Index(fields=["visit_id"]),
            models.Index(fields=["patient", "-date"]),
            models.Index(fields=["status"]),
        ]

    def generate_visit_id(self):
        """
        Generate a unique visit_id in the format: VIS-YYYYMMDD-NNNN
        Example: VIS-20241207-0001
        """
        if not self.pk and (not self.visit_id or self.visit_id == ""):
            from datetime import datetime

            date_str = self.date.strftime("%Y%m%d")

            # Count visits on the same date to generate sequence number
            count = Visit.objects.filter(date=self.date).count()
            sequence = str(count + 1).zfill(
                4
            )  # Zero-padded to 4 digits (0001, 0002, etc.)

            self.visit_id = f"VIS-{date_str}-{sequence}"

    def save(self, *args, **kwargs):
        """Override save to auto-generate visit_id, normalize clinic names, and handle multi-clinic."""
        from common.clinic_utils import normalize_clinic_name

        if self.clinic:
            self.clinic = normalize_clinic_name(self.clinic)

        if self.clinics:
            self.clinics = list(
                dict.fromkeys(
                    normalize_clinic_name(str(c))
                    for c in self.clinics
                    if c is not None and str(c).strip()
                )
            )
        if self.completed_clinics:
            self.completed_clinics = list(
                dict.fromkeys(
                    normalize_clinic_name(str(c))
                    for c in self.completed_clinics
                    if c is not None and str(c).strip()
                )
            )

        # Sync clinics list with primary clinic field
        clinics_list = self.clinics or []
        if self.clinic and self.clinic not in clinics_list:
            if not clinics_list:
                self.clinics = [self.clinic]
            else:
                self.clinics = [*clinics_list, self.clinic]

        # Ensure uniqueness of clinics
        if self.clinics:
            self.clinics = list(
                dict.fromkeys(self.clinics)
            )  # Remove duplicates while preserving order

        if not self.pk:
            self.generate_visit_id()

            # Handle collisions gracefully (should be rare)
            original_id = self.visit_id
            counter = 1
            while Visit.objects.filter(visit_id=self.visit_id).exists():
                # Handle collisions by incrementing sequence
                parts = original_id.split("-")
                if len(parts) >= 3:
                    base = "-".join(parts[:-1])
                    self.visit_id = f"{base}-{str(int(parts[-1]) + counter).zfill(4)}"
                else:
                    # Fallback if format is unexpected
                    self.visit_id = f"{original_id}-{counter}"
                counter += 1
                if counter > 1000:  # Safety limit
                    raise ValueError(f"Unable to generate unique visit_id")

        super().save(*args, **kwargs)

    @property
    def pending_clinics(self):
        """Return list of clinics not yet completed."""
        return [c for c in self.clinics if c not in self.completed_clinics]

    @property
    def is_fully_completed(self):
        """Check if all clinics have been completed."""
        return bool(self.clinics) and len(self.completed_clinics) == len(self.clinics)

    def __str__(self):
        return f"{self.visit_id} - {self.patient.get_full_name()} - {self.date}"


class VitalReading(models.Model):
    """
    Patient vital signs readings.
    """

    visit = models.ForeignKey(
        Visit,
        on_delete=models.CASCADE,
        related_name="vital_readings",
        null=True,
        blank=True,
    )
    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name="vital_readings"
    )

    # Vital Signs
    temperature = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Temperature in Celsius",
    )
    blood_pressure_systolic = models.IntegerField(null=True, blank=True)
    blood_pressure_diastolic = models.IntegerField(null=True, blank=True)
    heart_rate = models.IntegerField(
        null=True, blank=True, help_text="Beats per minute"
    )
    respiratory_rate = models.IntegerField(
        null=True, blank=True, help_text="Breaths per minute"
    )
    oxygen_saturation = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="SpO2 percentage",
    )
    weight = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, help_text="Weight in kg"
    )
    height = models.DecimalField(
        max_digits=5, decimal_places=2, null=True, blank=True, help_text="Height in cm"
    )
    bmi = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Body Mass Index",
    )
    pain_scale = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        validators=[MinValueValidator(0), MaxValueValidator(10)],
        help_text="Pain scale from 0 to 10",
    )
    blood_sugar = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Random blood sugar (RBS) in mg/dL",
    )
    random_blood_sugar = models.DecimalField(
        max_digits=6,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Random blood sugar (RBS) in mg/dL",
    )

    # Additional Notes
    notes = models.TextField(blank=True)

    # Metadata
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="recorded_vitals",
    )

    class Meta:
        db_table = "vital_readings"
        ordering = ["-recorded_at"]
        indexes = [
            models.Index(fields=["patient", "-recorded_at"]),
            models.Index(fields=["visit"]),
        ]

    def __str__(self):
        return f"Vitals for {self.patient.get_full_name()} - {self.recorded_at.strftime('%Y-%m-%d %H:%M')}"

    def save(self, *args, **kwargs):
        """Calculate BMI if weight and height are provided."""
        if self.weight and self.height:
            # Validate reasonable ranges (height in cm: 30-300, weight in kg: 1-500)
            if self.height < 30 or self.height > 300:
                raise ValueError(
                    f"Height must be between 30 and 300 cm. Got: {self.height} cm"
                )
            if self.weight < 1 or self.weight > 500:
                raise ValueError(
                    f"Weight must be between 1 and 500 kg. Got: {self.weight} kg"
                )

            height_in_meters = self.height / 100
            if height_in_meters > 0:
                calculated_bmi = round(self.weight / (height_in_meters**2), 2)
                # Cap BMI at 999.99 to fit within max_digits=5, decimal_places=2
                # This handles edge cases where calculation exceeds field capacity
                self.bmi = min(calculated_bmi, 999.99)
        super().save(*args, **kwargs)


class MedicalHistory(models.Model):
    """
    Patient medical history including allergies, diagnoses, medications, etc.
    """

    patient = models.OneToOneField(
        Patient, on_delete=models.CASCADE, related_name="medical_history"
    )

    # Allergies
    allergies = models.JSONField(
        default=list, blank=True, help_text="List of allergies"
    )

    # Diagnoses
    diagnoses = models.JSONField(
        default=list, blank=True, help_text="List of diagnoses with status"
    )

    # Current Medications
    current_medications = models.JSONField(
        default=list, blank=True, help_text="List of current medications"
    )

    # Surgical History
    surgical_history = models.JSONField(
        default=list, blank=True, help_text="List of past surgeries"
    )

    # Family History
    family_history = models.JSONField(
        default=list, blank=True, help_text="Family medical history"
    )

    # Social History
    social_history = models.JSONField(
        default=dict, blank=True, help_text="Smoking, alcohol, exercise, etc."
    )

    # Metadata
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="updated_medical_histories",
    )

    class Meta:
        db_table = "medical_history"
        verbose_name_plural = "Medical Histories"

    def __str__(self):
        return f"Medical History for {self.patient.get_full_name()}"


class AnnualCheckupComponentDefinition(models.Model):
    """Master catalog entry for annual check-up investigations / clinical steps."""

    CAPTURED_VIA_CHOICES = [
        ("vitals", "Vitals"),
        ("laboratory", "Laboratory"),
        ("radiology", "Radiology"),
        ("eyecare", "Eye care"),
        ("consultation", "Consultation"),
        ("medical_history", "Medical history"),
        ("patient_record", "Patient record"),
        ("annual_checkup", "Annual check-up"),
    ]
    TIER_CHOICES = [
        ("A", "Tier A"),
        ("B", "Tier B"),
        ("C", "Tier C"),
    ]

    code = models.CharField(max_length=50, unique=True)
    label = models.CharField(max_length=200)
    captured_via = models.CharField(max_length=30, choices=CAPTURED_VIA_CHOICES)
    tier = models.CharField(max_length=1, choices=TIER_CHOICES, default="A")
    sort_order = models.PositiveSmallIntegerField(default=0)
    is_active = models.BooleanField(default=True)
    skippable = models.BooleanField(default=True)
    lab_template_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="LabTemplate.code values used for ordering and auto-completion.",
    )
    radiology_template_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="RadiologyTemplate.code values for ordering and auto-completion.",
    )
    name_aliases = models.JSONField(
        default=list,
        blank=True,
        help_text="Lowercase aliases for matching existing orders/results.",
    )

    class Meta:
        db_table = "annual_checkup_component_definitions"
        ordering = ["sort_order", "label"]

    def __str__(self):
        return f"{self.label} ({self.code})"


class AnnualCheckupProgrammeSettings(models.Model):
    """Per-year programme defaults — which catalog items are pre-ticked for new visits."""

    programme_year = models.PositiveSmallIntegerField(unique=True)
    default_selected_codes = models.JSONField(
        default=list,
        blank=True,
        help_text="Component codes pre-selected when a new annual check-up visit starts.",
    )
    updated_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="annual_checkup_programme_updates",
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "annual_checkup_programme_settings"
        ordering = ["-programme_year"]

    def __str__(self):
        return f"Annual check-up programme {self.programme_year}"


class AnnualCheckup(models.Model):
    """
    Programme wrapper for employee annual check-up visits.

    Clinical work happens on the linked Visit; this record tracks compliance
    components, fitness outcome, and the signed clinical report PDF.
    """

    STATUS_CHOICES = [
        ("in_progress", "In Progress"),
        ("completed", "Completed"),
        ("cancelled", "Cancelled"),
    ]

    FITNESS_OUTCOME_CHOICES = [
        ("fit", "Fit for duty"),
        ("fit_with_conditions", "Fit with conditions"),
        ("temporarily_unfit", "Temporarily unfit"),
        ("unfit", "Unfit for duty"),
    ]

    visit = models.OneToOneField(
        Visit,
        on_delete=models.PROTECT,
        related_name="annual_checkup",
    )
    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="annual_checkups",
    )
    programme_year = models.PositiveSmallIntegerField()
    status = models.CharField(
        max_length=20, choices=STATUS_CHOICES, default="in_progress"
    )
    fitness_outcome = models.CharField(
        max_length=30, choices=FITNESS_OUTCOME_CHOICES, blank=True
    )
    outcome_notes = models.TextField(
        blank=True,
        help_text="HR-safe fitness guidance (non-clinical wording).",
    )
    signed_off_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="signed_annual_checkups",
        limit_choices_to={"system_role": "Medical Doctor"},
    )
    signed_off_at = models.DateTimeField(null=True, blank=True)
    sign_off_override_reason = models.TextField(
        blank=True,
        help_text="Reason incomplete components were overridden at sign-off.",
    )
    components_required = models.JSONField(default=list, blank=True)
    components_completed = models.JSONField(default=list, blank=True)
    component_overrides = models.JSONField(
        default=dict,
        blank=True,
        help_text="Manually marked complete: {component_code: reason}.",
    )
    report_pdf = models.FileField(
        upload_to="annual_checkups/reports/",
        blank=True,
        null=True,
    )
    outcome_letter_pdf = models.FileField(
        upload_to="annual_checkups/outcome_letters/",
        blank=True,
        null=True,
        help_text="HR-safe fit-for-duty letter (no clinical detail).",
    )
    next_due_date = models.DateField(
        null=True,
        blank=True,
        help_text="Suggested date for next programme-year check-up.",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "annual_checkups"
        ordering = ["-programme_year", "-created_at"]
        indexes = [
            models.Index(fields=["patient", "programme_year"]),
            models.Index(fields=["status", "programme_year"]),
        ]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "programme_year"],
                condition=models.Q(status__in=["in_progress", "completed"]),
                name="uniq_active_annual_checkup_per_patient_year",
            ),
        ]

    def __str__(self):
        return (
            f"Annual check-up {self.programme_year} — "
            f"{self.patient.get_full_name()} ({self.status})"
        )


class AnnualCheckupExemption(models.Model):
    """HR-managed exemption from the annual check-up programme for a given year."""

    REASON_CHOICES = [
        ("maternity", "Maternity"),
        ("on_leave", "On leave"),
        ("secondment", "Secondment"),
        ("medical", "Medical deferral"),
        ("other", "Other"),
    ]

    patient = models.ForeignKey(
        Patient,
        on_delete=models.CASCADE,
        related_name="annual_checkup_exemptions",
    )
    programme_year = models.PositiveSmallIntegerField()
    reason = models.CharField(max_length=30, choices=REASON_CHOICES)
    notes = models.TextField(blank=True)
    granted_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="granted_annual_checkup_exemptions",
    )
    granted_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "annual_checkup_exemptions"
        ordering = ["-programme_year", "-granted_at"]
        constraints = [
            models.UniqueConstraint(
                fields=["patient", "programme_year"],
                name="uniq_annual_checkup_exemption_per_patient_year",
            ),
        ]

    def __str__(self):
        return (
            f"Exemption {self.programme_year} — {self.patient.get_full_name()} "
            f"({self.get_reason_display()})"
        )


class MedicalCertificate(models.Model):
    """
    Persisted medical certificate records (fitness/illness/travel/employment).
    PDF generation/storage is handled separately; we store issuance details + validity.
    """

    PURPOSE_CHOICES = [
        ("fitness", "Fitness Certificate"),
        ("illness", "Illness / Sick Leave"),
        ("travel", "Travel Medical"),
        ("employment", "Employment Medical"),
    ]

    patient = models.ForeignKey(
        Patient, on_delete=models.CASCADE, related_name="medical_certificates"
    )
    purpose = models.CharField(max_length=20, choices=PURPOSE_CHOICES)

    valid_from = models.DateField()
    valid_to = models.DateField()

    # Explicit sick leave duration (calendar days) for illness / sick leave certificates — used for HR reporting.
    sick_leave_days = models.PositiveSmallIntegerField(null=True, blank=True)

    findings = models.TextField(blank=True)
    recommendations = models.TextField(blank=True)

    certificate_number = models.CharField(max_length=50, unique=True, db_index=True)
    issued_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="issued_medical_certificates",
    )
    issued_at = models.DateTimeField(auto_now_add=True)

    # Snapshot fields to keep printed certificates stable even if patient name changes.
    patient_name_snapshot = models.CharField(max_length=200, blank=True)
    patient_id_snapshot = models.CharField(max_length=50, blank=True)
    patient_category_snapshot = models.CharField(max_length=20, blank=True)

    doctor_name_snapshot = models.CharField(max_length=200, blank=True)

    class Meta:
        db_table = "medical_certificates"
        ordering = ["-issued_at"]

    def __str__(self) -> str:
        return f"{self.certificate_number} - {self.patient_id_snapshot}"

    def _generate_certificate_number(self) -> str:
        year = timezone.now().year
        prefix = f"MC-{year}-"
        last = (
            MedicalCertificate.objects.filter(certificate_number__startswith=prefix)
            .order_by("-certificate_number")
            .first()
        )
        if last and last.certificate_number:
            try:
                last_num = int(last.certificate_number.split("-")[-1])
                new_num = last_num + 1
            except (ValueError, IndexError):
                new_num = 1
        else:
            new_num = 1
        return f"{prefix}{new_num:06d}"

    def save(self, *args, **kwargs):
        if not self.certificate_number:
            self.certificate_number = self._generate_certificate_number()

        # Populate snapshot fields best-effort.
        if self.patient_id_snapshot == "" or self.patient_name_snapshot == "":
            try:
                self.patient_id_snapshot = self.patient.patient_id
                self.patient_name_snapshot = self.patient.get_full_name()
                self.patient_category_snapshot = self.patient.category
            except Exception:
                # Keep whatever was provided; do not hard-fail certificate issuance.
                pass

        if self.doctor_name_snapshot == "" and self.issued_by:
            try:
                self.doctor_name_snapshot = self.issued_by.get_full_name()
            except Exception:
                self.doctor_name_snapshot = str(self.issued_by)

        super().save(*args, **kwargs)


class PatientMerge(models.Model):
    """
    Audit row for a patient merge event.

    Soft merge: the loser's clinical FKs (visits, lab orders, prescriptions,
    consultations, etc.) are re-pointed to the winner at the time of merge.
    The loser's row is kept (tombstoned) with `is_active=False` and a
    `merged_into` pointer so the original patient_id is preserved in
    `loser_snapshot` and a tombstone `patient_id` like
    `MERGED-{loser.id}-{date}` is assigned to free the unique constraint.

    Reversible: the audit row + snapshots + tombstoned loser row are
    sufficient to reverse the merge (re-activate loser, re-point FKs back).
    """

    winner = models.ForeignKey(
        Patient, on_delete=models.PROTECT, related_name="merge_winner_rows"
    )
    loser = models.ForeignKey(
        Patient, on_delete=models.PROTECT, related_name="merge_loser_rows"
    )
    merged_by = models.ForeignKey(
        "accounts.User", on_delete=models.PROTECT, related_name="patient_merges"
    )
    merged_at = models.DateTimeField(auto_now_add=True)
    reason = models.TextField(help_text="Why these records were merged.")

    # Full snapshots of both records at the time of merge (preserved forever).
    winner_snapshot = models.JSONField()
    loser_snapshot = models.JSONField()

    # Counters — one per related model that had rows re-pointed.
    visits_repointed = models.PositiveIntegerField(default=0)
    vital_readings_repointed = models.PositiveIntegerField(default=0)
    lab_orders_repointed = models.PositiveIntegerField(default=0)
    lab_results_repointed = models.PositiveIntegerField(default=0)
    prescriptions_repointed = models.PositiveIntegerField(default=0)
    consult_sessions_repointed = models.PositiveIntegerField(default=0)
    queue_items_repointed = models.PositiveIntegerField(default=0)
    referrals_repointed = models.PositiveIntegerField(default=0)
    diagnoses_repointed = models.PositiveIntegerField(default=0)
    admissions_repointed = models.PositiveIntegerField(default=0)
    physio_orders_repointed = models.PositiveIntegerField(default=0)
    eye_orders_repointed = models.PositiveIntegerField(default=0)
    nursing_orders_repointed = models.PositiveIntegerField(default=0)
    procedures_repointed = models.PositiveIntegerField(default=0)
    radiology_orders_repointed = models.PositiveIntegerField(default=0)
    radiology_reports_repointed = models.PositiveIntegerField(default=0)
    appointments_repointed = models.PositiveIntegerField(default=0)
    medical_certs_repointed = models.PositiveIntegerField(default=0)
    medical_history_repointed = models.PositiveIntegerField(default=0)
    medical_history_merged = models.PositiveIntegerField(default=0)
    dependents_repointed = models.PositiveIntegerField(default=0)

    # Row-IDs re-pointed at merge time, keyed by model name, e.g.
    # {"Visit": [1, 2], "VitalReading": [3], "MedicalHistory": {"pk": 6, "action": "repoint"}}.
    # Populated so un-merge can accurately revert without timestamp heuristics.
    repointed_rows = models.JSONField(default=dict, blank=True)

    class Meta:
        db_table = "patient_merges"
        ordering = ["-merged_at"]
        indexes = [
            models.Index(fields=["winner"]),
            models.Index(fields=["loser"]),
            models.Index(fields=["merged_at"]),
        ]

    def __str__(self):
        return f"Merge #{self.id}: {self.loser.patient_id} → {self.winner.patient_id}"
