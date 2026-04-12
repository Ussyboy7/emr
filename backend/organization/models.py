"""
Organization models for the EMR system.
"""
from django.db import models
from django.conf import settings


class Clinic(models.Model):
    """
    Physical facility / site (e.g. Bode Thomas Clinic).
    OPD visit lines (GOPD, Eye Clinic, …) are OutpatientClinicType via FacilityOutpatientClinic.
    """
    
    name = models.CharField(max_length=200, unique=True, db_index=True)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    description = models.TextField(blank=True)
    location = models.CharField(max_length=200, blank=True)
    phone = models.CharField(max_length=20, blank=True)
    email = models.EmailField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'clinics'
        ordering = ['name']
        indexes = [
            models.Index(fields=['name']),
            models.Index(fields=['code']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return self.name


class OutpatientClinicType(models.Model):
    """Master catalogue of visit-level OPD clinics (GOPD, Eye Clinic, Dental, …)."""

    name = models.CharField(max_length=200, unique=True, db_index=True)
    code = models.SlugField(max_length=80, unique=True, db_index=True)
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "outpatient_clinic_types"
        ordering = ["sort_order", "name"]
        verbose_name = "Visit clinic (OPD)"
        verbose_name_plural = "Visit clinics (OPD)"

    def __str__(self):
        return self.name


class FacilityOutpatientClinic(models.Model):
    """Which OPD visit clinic types are offered at a facility."""

    facility = models.ForeignKey(
        Clinic,
        on_delete=models.CASCADE,
        related_name="outpatient_offerings",
    )
    clinic_type = models.ForeignKey(
        OutpatientClinicType,
        on_delete=models.CASCADE,
        related_name="facility_offerings",
    )
    is_active = models.BooleanField(default=True, db_index=True)
    sort_order = models.PositiveSmallIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "facility_outpatient_clinics"
        unique_together = [["facility", "clinic_type"]]
        ordering = ["sort_order", "clinic_type__name"]
        indexes = [models.Index(fields=["facility", "is_active"])]

    def __str__(self):
        return f"{self.facility.name} → {self.clinic_type.name}"


class Department(models.Model):
    """
    Department within a clinic.
    """
    
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='departments')
    name = models.CharField(max_length=200, db_index=True)
    code = models.CharField(max_length=50, db_index=True)
    description = models.TextField(blank=True)
    head = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='departments_led'
    )
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'departments'
        unique_together = [['clinic', 'name']]
        ordering = ['clinic__name', 'name']
        indexes = [
            models.Index(fields=['clinic', 'is_active']),
            models.Index(fields=['name']),
        ]
    
    def __str__(self):
        return f"{self.name} ({self.clinic.name})"


class Room(models.Model):
    """
    Room within a clinic/department.
    """
    
    TYPE_CHOICES = [
        ('consultation', 'Consultation'),
        ('procedure', 'Procedure'),
        ('emergency', 'Emergency'),
        ('examination', 'Examination'),
        ('other', 'Other'),
    ]
    
    STATUS_CHOICES = [
        ('active', 'Active'),
        ('inactive', 'Inactive'),
        ('maintenance', 'Maintenance'),
    ]
    
    name = models.CharField(max_length=200)
    room_number = models.CharField(max_length=50, unique=True, db_index=True)
    clinic = models.ForeignKey(Clinic, on_delete=models.CASCADE, related_name='rooms', null=True, blank=True)
    department = models.ForeignKey(Department, on_delete=models.SET_NULL, null=True, blank=True, related_name='rooms')
    room_type = models.CharField(max_length=50, choices=TYPE_CHOICES, default='consultation')
    location = models.CharField(max_length=200, blank=True)
    floor = models.CharField(max_length=50, blank=True)
    specialty = models.CharField(max_length=100, blank=True)
    capacity = models.IntegerField(default=1)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='active')
    is_active = models.BooleanField(default=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'rooms'
        ordering = ['room_number']
        indexes = [
            models.Index(fields=['room_number']),
            models.Index(fields=['clinic', 'status']),
            models.Index(fields=['room_type', 'status']),
        ]
    
    def __str__(self):
        return f"{self.room_number} - {self.name}"

