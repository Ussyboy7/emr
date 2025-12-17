"""
Pharmacy models for the EMR system.
"""
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone


class Medication(models.Model):
    """
    Medication/drug master data.
    """
    
    CATEGORY_CHOICES = [
        ('Antibiotics', 'Antibiotics'),
        ('Analgesics', 'Analgesics'),
        ('Antimalarials', 'Antimalarials'),
        ('Antifungals', 'Antifungals'),
        ('Antivirals', 'Antivirals'),
        ('Anticonvulsants', 'Anticonvulsants'),
        ('Antipsychotics', 'Antipsychotics'),
        ('Antidepressants', 'Antidepressants'),
        ('Antihistamines', 'Antihistamines'),
        ('Cardiovascular', 'Cardiovascular'),
        ('Corticosteroids', 'Corticosteroids'),
        ('Dermatology', 'Dermatology'),
        ('Diabetes', 'Diabetes'),
        ('Diuretics', 'Diuretics'),
        ('Emergency/Critical Care', 'Emergency/Critical Care'),
        ('Gastrointestinal', 'Gastrointestinal'),
        ('Hormones', 'Hormones'),
        ('Ophthalmology', 'Ophthalmology'),
        ('Oncology', 'Oncology'),
        ('Pediatrics', 'Pediatrics'),
        ('Respiratory', 'Respiratory'),
        ('Vitamins & Supplements', 'Vitamins & Supplements'),
        ('Other', 'Other'),
    ]
    
    name = models.CharField(max_length=200)
    generic_name = models.CharField(max_length=200, blank=True)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    unit = models.CharField(max_length=50, help_text="tablet, capsule, ml, etc.")
    strength = models.CharField(max_length=100, blank=True, help_text="e.g., 500mg")
    form = models.CharField(max_length=50, blank=True, help_text="tablet, syrup, injection, etc.")
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES, blank=True, help_text="Medication category")
    manufacturer = models.CharField(max_length=200, blank=True, help_text="Manufacturer name")
    pack_size = models.IntegerField(null=True, blank=True, help_text="Number of units per pack")
    prescription_required = models.BooleanField(default=False, help_text="Requires prescription")
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'medications'
        ordering = ['name']
    
    def __str__(self):
        return f"{self.name} ({self.strength})" if self.strength else self.name


class MedicationInventory(models.Model):
    """
    Medication inventory with batch tracking.
    """
    
    medication = models.ForeignKey(Medication, on_delete=models.CASCADE, related_name='inventory_items')
    batch_number = models.CharField(max_length=100, db_index=True)
    expiry_date = models.DateField()
    quantity = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    unit = models.CharField(max_length=50)
    min_stock_level = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_stock_level = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True, help_text="Maximum stock level")
    location = models.CharField(max_length=100, blank=True)
    supplier = models.CharField(max_length=200, blank=True)
    purchase_price = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        db_table = 'medication_inventory'
        ordering = ['expiry_date']
        indexes = [
            models.Index(fields=['medication', 'batch_number']),
            models.Index(fields=['expiry_date']),
        ]
    
    def __str__(self):
        return f"{self.medication.name} - Batch {self.batch_number}"
    
    @property
    def is_low_stock(self):
        """Check if stock is below minimum level."""
        return self.quantity <= self.min_stock_level
    
    @property
    def is_expired(self):
        """Check if medication is expired."""
        return self.expiry_date < timezone.now().date()


class Prescription(models.Model):
    """
    Prescription from a doctor.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('dispensing', 'Dispensing'),
        ('partially_dispensed', 'Partially Dispensed'),
        ('dispensed', 'Dispensed'),
        ('cancelled', 'Cancelled'),
    ]
    
    prescription_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='prescriptions')
    doctor = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='prescriptions')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='prescriptions')
    
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    diagnosis = models.TextField(blank=True)
    notes = models.TextField(blank=True)
    
    prescribed_at = models.DateTimeField(auto_now_add=True)
    dispensed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_prescriptions')
    
    class Meta:
        db_table = 'prescriptions'
        ordering = ['-prescribed_at']
        indexes = [
            models.Index(fields=['prescription_id']),
            models.Index(fields=['patient', '-prescribed_at']),
            models.Index(fields=['status']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-generate prescription_id if not provided."""
        if not self.prescription_id:
            # Generate prescription ID: RX-YYYYMMDD-HHMMSS-XXXX
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            # Add random suffix to ensure uniqueness
            import random
            suffix = f"{random.randint(1000, 9999)}"
            self.prescription_id = f"RX-{timestamp}-{suffix}"
        super().save(*args, **kwargs)
    
    def recalculate_status(self):
        """Recalculate and update prescription status based on medication items."""
        from django.utils import timezone
        
        # Get all medication items
        all_items = self.medications.all()
        
        if not all_items.exists():
            # No items, keep current status or set to pending
            if self.status not in ['cancelled']:
                self.status = 'pending'
            return
        
        # Check each item and ensure is_dispensed is correctly set
        all_dispensed = True
        has_partial = False
        
        for item in all_items:
            # Update is_dispensed based on actual dispensed quantity
            if item.dispensed_quantity >= item.quantity:
                if not item.is_dispensed:
                    item.is_dispensed = True
                    item.save(update_fields=['is_dispensed'])
            else:
                all_dispensed = False
                if item.dispensed_quantity > 0:
                    has_partial = True
                if item.is_dispensed:
                    item.is_dispensed = False
                    item.save(update_fields=['is_dispensed'])
        
        # Update prescription status
        if all_dispensed:
            self.status = 'dispensed'
            if not self.dispensed_at:
                self.dispensed_at = timezone.now()
        elif has_partial:
            self.status = 'partially_dispensed'
        else:
            if self.status == 'dispensed':
                # If status was dispensed but items aren't, change to partially_dispensed
                self.status = 'partially_dispensed'
            elif self.status not in ['cancelled']:
                self.status = 'pending'
        
        self.save(update_fields=['status', 'dispensed_at'])
    
    def __str__(self):
        return f"{self.prescription_id} - {self.patient.get_full_name()}"


class PrescriptionItem(models.Model):
    """
    Individual medication item in a prescription.
    """
    
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='medications')
    medication = models.ForeignKey(Medication, on_delete=models.PROTECT, related_name='prescription_items')
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    unit = models.CharField(max_length=50)
    dosage = models.CharField(max_length=200, blank=True, help_text="e.g., 1 tablet twice daily")
    frequency = models.CharField(max_length=100, blank=True)
    duration = models.CharField(max_length=100, blank=True, help_text="e.g., 7 days")
    instructions = models.TextField(blank=True)
    
    # Dispensing information
    dispensed_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_dispensed = models.BooleanField(default=False)
    
    class Meta:
        db_table = 'prescription_items'
        ordering = ['id']
    
    def __str__(self):
        return f"{self.medication.name} - {self.quantity} {self.unit}"


class Dispense(models.Model):
    """
    Medication dispensing record.
    """
    
    dispense_id = models.CharField(max_length=50, unique=True, db_index=True)
    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name='dispenses')
    prescription_item = models.ForeignKey(PrescriptionItem, on_delete=models.CASCADE, related_name='dispenses')
    medication = models.ForeignKey(Medication, on_delete=models.PROTECT, related_name='dispenses')
    inventory_item = models.ForeignKey(MedicationInventory, on_delete=models.PROTECT, related_name='dispenses', null=True, blank=True)
    
    quantity = models.DecimalField(max_digits=10, decimal_places=2, validators=[MinValueValidator(0)])
    unit = models.CharField(max_length=50)
    batch_number = models.CharField(max_length=100, blank=True)
    
    dispensed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='dispensed_medications')
    dispensed_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)
    
    class Meta:
        db_table = 'dispenses'
        ordering = ['-dispensed_at']
        indexes = [
            models.Index(fields=['dispense_id']),
            models.Index(fields=['prescription', '-dispensed_at']),
        ]
    
    def save(self, *args, **kwargs):
        """Auto-generate dispense_id if not provided."""
        if not self.dispense_id:
            # Generate dispense ID: DISP-YYYYMMDD-HHMMSS-XXXX
            from datetime import datetime
            timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
            # Add random suffix to ensure uniqueness
            import random
            suffix = f"{random.randint(1000, 9999)}"
            self.dispense_id = f"DISP-{timestamp}-{suffix}"
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.dispense_id} - {self.medication.name}"

