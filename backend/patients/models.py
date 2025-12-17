"""
Patient models for the EMR system.
"""
from django.db import models
from django.core.validators import RegexValidator
from django.utils import timezone


class Patient(models.Model):
    """
    Patient demographic and personal information.
    Supports Employee, Retiree, NonNPA, and Dependent categories.
    """
    
    CATEGORY_CHOICES = [
        ('employee', 'Employee'),
        ('retiree', 'Retiree'),
        ('nonnpa', 'NonNPA'),
        ('dependent', 'Dependent'),
    ]
    
    GENDER_CHOICES = [
        ('male', 'Male'),
        ('female', 'Female'),
    ]
    
    MARITAL_STATUS_CHOICES = [
        ('single', 'Single'),
        ('married', 'Married'),
        ('divorced', 'Divorced'),
        ('widowed', 'Widowed'),
    ]
    
    BLOOD_GROUP_CHOICES = [
        ('A+', 'A+'),
        ('A-', 'A-'),
        ('B+', 'B+'),
        ('B-', 'B-'),
        ('AB+', 'AB+'),
        ('AB-', 'AB-'),
        ('O+', 'O+'),
        ('O-', 'O-'),
    ]
    
    GENOTYPE_CHOICES = [
        ('AA', 'AA'),
        ('AS', 'AS'),
        ('SS', 'SS'),
        ('AC', 'AC'),
        ('SC', 'SC'),
    ]
    
    TITLE_CHOICES = [
        ('mr', 'Mr'),
        ('mrs', 'Mrs'),
        ('ms', 'Ms'),
        ('dr', 'Dr'),
        ('chief', 'Chief'),
        ('engr', 'Engr'),
        ('prof', 'Prof'),
        ('alhaji', 'Alhaji'),
        ('hajia', 'Hajia'),
    ]
    
    # Patient Identification
    patient_id = models.CharField(max_length=50, unique=True, db_index=True)
    category = models.CharField(max_length=20, choices=CATEGORY_CHOICES, default='employee')
    
    # Personal Details
    title = models.CharField(max_length=20, choices=TITLE_CHOICES, blank=True)
    surname = models.CharField(max_length=100)
    first_name = models.CharField(max_length=100)
    middle_name = models.CharField(max_length=100, blank=True)
    gender = models.CharField(max_length=10, choices=GENDER_CHOICES)
    date_of_birth = models.DateField()
    marital_status = models.CharField(max_length=20, choices=MARITAL_STATUS_CHOICES, blank=True)
    religion = models.CharField(max_length=50, blank=True)
    tribe = models.CharField(max_length=50, blank=True)
    occupation = models.CharField(max_length=100, blank=True, null=True)  # For Dependent and Retiree only
    photo = models.ImageField(upload_to='patients/photos/', blank=True, null=True)
    
    # Employee/Retiree Specific
    personal_number = models.CharField(max_length=50, blank=True, null=True, db_index=True)
    employee_type = models.CharField(max_length=20, blank=True, null=True)  # Officer, Staff
    division = models.CharField(max_length=100, blank=True, null=True)
    location = models.CharField(max_length=100, blank=True, null=True)
    
    # NonNPA Specific
    nonnpa_type = models.CharField(max_length=50, blank=True, null=True)  # Police, IT, NYSC, etc.
    
    # Dependent Specific
    dependent_type = models.CharField(max_length=50, blank=True, null=True)  # Employee Dependent, Retiree Dependent
    principal_staff = models.ForeignKey(
        'self',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='dependents',
        limit_choices_to={'category__in': ['employee', 'retiree']}
    )
    
    # Contact Information
    email = models.EmailField(blank=True)
    phone_regex = RegexValidator(
        regex=r'^\+?1?\d{9,15}$',
        message="Phone number must be entered in the format: '+999999999'. Up to 15 digits allowed."
    )
    phone = models.CharField(validators=[phone_regex], max_length=17, blank=True)
    state_of_residence = models.CharField(max_length=100, blank=True)
    residential_address = models.TextField(blank=True)
    state_of_origin = models.CharField(max_length=100, blank=True)
    lga = models.CharField(max_length=100, blank=True)
    permanent_address = models.TextField(blank=True)
    
    # Medical Information
    blood_group = models.CharField(max_length=5, choices=BLOOD_GROUP_CHOICES, blank=True)
    genotype = models.CharField(max_length=5, choices=GENOTYPE_CHOICES, blank=True)
    allergies = models.TextField(blank=True, help_text="Known allergies (comma-separated or newline-separated)")
    
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
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_patients'
    )
    is_active = models.BooleanField(default=True)
    
    class Meta:
        db_table = 'patients'
        ordering = ['-created_at']
        indexes = [
            models.Index(fields=['patient_id']),
            models.Index(fields=['personal_number']),
            models.Index(fields=['category']),
            models.Index(fields=['surname', 'first_name']),
        ]
    
    def __str__(self):
        return f"{self.patient_id} - {self.get_full_name()}"
    
    def get_full_name(self):
        """Return the patient's full name."""
        # Capitalize title properly (handle common abbreviations)
        title_str = ''
        if self.title:
            title_lower = self.title.lower().strip()
            # Map common title abbreviations to proper capitalized form
            title_map = {
                'mr': 'Mr',
                'mrs': 'Mrs',
                'ms': 'Ms',
                'dr': 'Dr',
                'chief': 'Chief',
                'engr': 'Engr',
                'prof': 'Prof',
                'alhaji': 'Alhaji',
                'hajia': 'Hajia',
            }
            title_str = title_map.get(title_lower, self.title.title())
        
        parts = [title_str, self.first_name, self.middle_name, self.surname]
        return ' '.join(filter(None, parts))
    
    @property
    def age(self):
        """Calculate age from date of birth."""
        today = timezone.now().date()
        return today.year - self.date_of_birth.year - ((today.month, today.day) < (self.date_of_birth.month, self.date_of_birth.day))
    
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
            if self.category == 'employee':
                if not self.personal_number:
                    raise ValueError("Personal number is required for Employee patients")
                self.patient_id = f"E-{self.personal_number.strip().upper()}"
            
            elif self.category == 'retiree':
                if not self.personal_number:
                    raise ValueError("Personal number is required for Retiree patients")
                self.patient_id = f"R-{self.personal_number.strip().upper()}"
            
            elif self.category == 'nonnpa':
                if not self.nonnpa_type:
                    raise ValueError("Non-NPA type is required for Non-NPA patients")
                # Count existing Non-NPA patients of the same type to get next number
                count = Patient.objects.filter(
                    category='nonnpa',
                    nonnpa_type__iexact=self.nonnpa_type.strip()
                ).count()
                sequence = str(count + 1).zfill(2)  # Zero-padded to 2 digits (01, 02, etc.)
                self.patient_id = f"NN-{self.nonnpa_type.strip().upper()}-{sequence}"
            
            elif self.category == 'dependent':
                if not self.principal_staff_id and not self.principal_staff:
                    raise ValueError("Principal staff is required for Dependent patients")
                
                # Ensure we have the principal_staff object loaded
                if self.principal_staff_id and not self.principal_staff:
                    # Reload the principal_staff from database
                    self.principal_staff = Patient.objects.get(pk=self.principal_staff_id)
                
                # Ensure principal_staff has a patient_id
                if not self.principal_staff.patient_id:
                    # If principal doesn't have an ID yet, save it first to generate one
                    self.principal_staff.save()
                    # Reload to get the generated patient_id
                    self.principal_staff.refresh_from_db()
                
                # Get parent's patient_id
                parent_id = self.principal_staff.patient_id
                # Count existing dependents for this principal
                count = Patient.objects.filter(
                    category='dependent',
                    principal_staff_id=self.principal_staff.id
                ).count()
                sequence = str(count + 1).zfill(2)  # Zero-padded to 2 digits (01, 02, etc.)
                self.patient_id = f"{parent_id}-{sequence}"
            else:
                raise ValueError(f"Invalid patient category: {self.category}")
    
    def save(self, *args, **kwargs):
        """Override save to auto-generate patient_id for new patients."""
        # Generate patient_id only for new records
        if not self.pk:
            self.generate_patient_id()
            
            # Ensure uniqueness (handle edge cases)
            original_id = self.patient_id
            counter = 1
            while Patient.objects.filter(patient_id=self.patient_id).exists():
                # Handle collisions by incrementing sequence
                if self.category == 'dependent':
                    # For dependents, increment the sequence
                    base_id = '-'.join(original_id.split('-')[:-1])
                    self.patient_id = f"{base_id}-{str(counter + 1).zfill(2)}"
                elif self.category == 'nonnpa':
                    # For Non-NPA, increment the number
                    parts = original_id.split('-')
                    if len(parts) >= 3:
                        base = '-'.join(parts[:-1])
                        self.patient_id = f"{base}-{str(counter + 1).zfill(2)}"
                    else:
                        self.patient_id = f"{original_id}-{counter}"
                else:
                    # For employees/retirees, this shouldn't happen if personal_number is unique
                    # But handle it gracefully
                    self.patient_id = f"{original_id}-{counter}"
                counter += 1
                if counter > 100:  # Safety limit
                    raise ValueError(f"Unable to generate unique patient_id for {self.category}")
        
        super().save(*args, **kwargs)


class Visit(models.Model):
    """
    Patient visit/appointment record.
    """
    
    VISIT_TYPE_CHOICES = [
        ('consultation', 'Consultation'),
        ('follow_up', 'Follow-up'),
        ('emergency', 'Emergency'),
        ('routine', 'Routine Checkup'),
    ]
    
    STATUS_CHOICES = [
        ('scheduled', 'Scheduled'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    visit_id = models.CharField(max_length=50, unique=True, db_index=True, blank=True)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='visits')
    visit_type = models.CharField(max_length=20, choices=VISIT_TYPE_CHOICES, default='consultation')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='scheduled')
    
    # Visit Details
    date = models.DateField()
    time = models.TimeField()
    clinic = models.CharField(max_length=100, blank=True)
    location = models.CharField(max_length=100, blank=True, null=True)
    doctor = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='patient_visits',
        limit_choices_to={'system_role': 'Medical Doctor'}
    )
    chief_complaint = models.TextField(blank=True)
    clinical_notes = models.TextField(blank=True)
    
    # Metadata
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    created_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='created_visits'
    )
    
    class Meta:
        db_table = 'visits'
        ordering = ['-date', '-time']
        indexes = [
            models.Index(fields=['visit_id']),
            models.Index(fields=['patient', '-date']),
            models.Index(fields=['status']),
        ]
    
    def generate_visit_id(self):
        """
        Generate a unique visit_id in the format: VIS-YYYYMMDD-NNNN
        Example: VIS-20241207-0001
        """
        if not self.pk and (not self.visit_id or self.visit_id == ''):
            from datetime import datetime
            date_str = self.date.strftime('%Y%m%d')
            
            # Count visits on the same date to generate sequence number
            count = Visit.objects.filter(date=self.date).count()
            sequence = str(count + 1).zfill(4)  # Zero-padded to 4 digits (0001, 0002, etc.)
            
            self.visit_id = f"VIS-{date_str}-{sequence}"
    
    def save(self, *args, **kwargs):
        """Override save to auto-generate visit_id for new visits and normalize clinic names."""
        # Normalize clinic name before saving
        if self.clinic:
            from common.clinic_utils import normalize_clinic_name
            self.clinic = normalize_clinic_name(self.clinic)
        
        if not self.pk:
            self.generate_visit_id()
            
            # Ensure uniqueness (handle edge cases where multiple visits are created simultaneously)
            original_id = self.visit_id
            counter = 1
            while Visit.objects.filter(visit_id=self.visit_id).exists():
                # Handle collisions by incrementing sequence
                parts = original_id.split('-')
                if len(parts) >= 3:
                    base = '-'.join(parts[:-1])
                    self.visit_id = f"{base}-{str(int(parts[-1]) + counter).zfill(4)}"
                else:
                    # Fallback if format is unexpected
                    self.visit_id = f"{original_id}-{counter}"
                counter += 1
                if counter > 1000:  # Safety limit
                    raise ValueError(f"Unable to generate unique visit_id")
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.visit_id} - {self.patient.get_full_name()} - {self.date}"


class VitalReading(models.Model):
    """
    Patient vital signs readings.
    """
    
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name='vital_readings', null=True, blank=True)
    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name='vital_readings')
    
    # Vital Signs
    temperature = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Temperature in Celsius")
    blood_pressure_systolic = models.IntegerField(null=True, blank=True)
    blood_pressure_diastolic = models.IntegerField(null=True, blank=True)
    heart_rate = models.IntegerField(null=True, blank=True, help_text="Beats per minute")
    respiratory_rate = models.IntegerField(null=True, blank=True, help_text="Breaths per minute")
    oxygen_saturation = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="SpO2 percentage")
    weight = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Weight in kg")
    height = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Height in cm")
    bmi = models.DecimalField(max_digits=5, decimal_places=2, null=True, blank=True, help_text="Body Mass Index")
    
    # Additional Notes
    notes = models.TextField(blank=True)
    
    # Metadata
    recorded_at = models.DateTimeField(auto_now_add=True)
    recorded_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='recorded_vitals'
    )
    
    class Meta:
        db_table = 'vital_readings'
        ordering = ['-recorded_at']
        indexes = [
            models.Index(fields=['patient', '-recorded_at']),
            models.Index(fields=['visit']),
        ]
    
    def __str__(self):
        return f"Vitals for {self.patient.get_full_name()} - {self.recorded_at.strftime('%Y-%m-%d %H:%M')}"
    
    def save(self, *args, **kwargs):
        """Calculate BMI if weight and height are provided."""
        if self.weight and self.height:
            # Validate reasonable ranges (height in cm: 30-300, weight in kg: 1-500)
            if self.height < 30 or self.height > 300:
                raise ValueError(f"Height must be between 30 and 300 cm. Got: {self.height} cm")
            if self.weight < 1 or self.weight > 500:
                raise ValueError(f"Weight must be between 1 and 500 kg. Got: {self.weight} kg")
            
            height_in_meters = self.height / 100
            if height_in_meters > 0:
                calculated_bmi = round(self.weight / (height_in_meters ** 2), 2)
                # Cap BMI at 999.99 to fit within max_digits=5, decimal_places=2
                # This handles edge cases where calculation exceeds field capacity
                self.bmi = min(calculated_bmi, 999.99)
        super().save(*args, **kwargs)


class MedicalHistory(models.Model):
    """
    Patient medical history including allergies, diagnoses, medications, etc.
    """
    
    patient = models.OneToOneField(Patient, on_delete=models.CASCADE, related_name='medical_history')
    
    # Allergies
    allergies = models.JSONField(default=list, blank=True, help_text="List of allergies")
    
    # Diagnoses
    diagnoses = models.JSONField(default=list, blank=True, help_text="List of diagnoses with status")
    
    # Current Medications
    current_medications = models.JSONField(default=list, blank=True, help_text="List of current medications")
    
    # Surgical History
    surgical_history = models.JSONField(default=list, blank=True, help_text="List of past surgeries")
    
    # Family History
    family_history = models.JSONField(default=list, blank=True, help_text="Family medical history")
    
    # Social History
    social_history = models.JSONField(default=dict, blank=True, help_text="Smoking, alcohol, exercise, etc.")
    
    # Metadata
    updated_at = models.DateTimeField(auto_now=True)
    updated_by = models.ForeignKey(
        'accounts.User',
        on_delete=models.SET_NULL,
        null=True,
        related_name='updated_medical_histories'
    )
    
    class Meta:
        db_table = 'medical_history'
        verbose_name_plural = 'Medical Histories'
    
    def __str__(self):
        return f"Medical History for {self.patient.get_full_name()}"

