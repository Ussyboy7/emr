"""
Nursing models for the EMR system.
"""
from django.db import models
from django.utils import timezone


class NursingOrder(models.Model):
    """
    Nursing orders and procedures.
    """
    
    STATUS_CHOICES = [
        ('pending', 'Pending'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
        ('cancelled', 'Cancelled'),
    ]
    
    PRIORITY_CHOICES = [
        ('low', 'Low'),
        ('medium', 'Medium'),
        ('high', 'High'),
        ('urgent', 'Urgent'),
    ]
    
    order_id = models.CharField(max_length=50, unique=True, db_index=True, blank=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='nursing_orders')
    ordered_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='ordered_nursing_orders')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='nursing_orders')
    
    order_type = models.CharField(max_length=100, help_text="Medication, Procedure, Observation, etc.")
    description = models.TextField()
    frequency = models.CharField(max_length=100, blank=True)
    duration = models.CharField(max_length=100, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    priority = models.CharField(max_length=20, choices=PRIORITY_CHOICES, default='medium')
    
    ordered_at = models.DateTimeField(auto_now_add=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='created_nursing_orders')
    
    class Meta:
        db_table = 'nursing_orders'
        ordering = ['-ordered_at']
    
    def generate_order_id(self):
        """
        Generate a unique order_id in the format: NORD-YYYYMMDD-NNNN
        Example: NORD-20241207-0001
        """
        # Always generate if order_id is empty or None (safety check)
        if not self.order_id or self.order_id == '':
            # Use ordered_at if available, otherwise use current time
            order_date = self.ordered_at if self.ordered_at else timezone.now()
            date_str = order_date.strftime('%Y%m%d')
            date_obj = order_date.date()
            
            # Count orders on the same date to generate sequence number
            # Exclude empty order_ids and current object if it has a pk
            count_qs = NursingOrder.objects.filter(ordered_at__date=date_obj).exclude(order_id='')
            if self.pk:
                count_qs = count_qs.exclude(pk=self.pk)
            count = count_qs.count()
            sequence = str(count + 1).zfill(4)  # Zero-padded to 4 digits (0001, 0002, etc.)
            
            self.order_id = f"NORD-{date_str}-{sequence}"
    
    def save(self, *args, **kwargs):
        """Override save to auto-generate order_id for new orders."""
        # Always generate order_id if it's empty (for both new and existing records, though existing shouldn't need this)
        if not self.order_id or self.order_id == '':
            # Set ordered_at if not set (auto_now_add will set it, but we need it for ID generation)
            if not self.ordered_at:
                self.ordered_at = timezone.now()
            
            self.generate_order_id()
            
            # Ensure uniqueness (handle edge cases where multiple orders are created simultaneously)
            original_id = self.order_id
            counter = 1
            while NursingOrder.objects.filter(order_id=self.order_id).exclude(pk=self.pk if self.pk else None).exists():
                # Handle collisions by incrementing sequence
                parts = original_id.split('-')
                if len(parts) >= 3:
                    base = '-'.join(parts[:-1])
                    self.order_id = f"{base}-{str(int(parts[-1]) + counter).zfill(4)}"
                else:
                    # Fallback if format is unexpected
                    self.order_id = f"{original_id}-{counter}"
                counter += 1
                if counter > 1000:  # Safety limit
                    raise ValueError(f"Unable to generate unique order_id")
        
        super().save(*args, **kwargs)
    
    def __str__(self):
        return f"{self.order_id} - {self.patient.get_full_name()}"


class Procedure(models.Model):
    """
    Nursing procedures performed.
    """
    
    PROCEDURE_TYPE_CHOICES = [
        ('injection', 'Injection'),
        ('dressing', 'Dressing'),
        ('wound_care', 'Wound Care'),
        ('catheterization', 'Catheterization'),
        ('iv_insertion', 'IV Insertion'),
        ('other', 'Other'),
    ]
    
    procedure_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey('patients.Patient', on_delete=models.CASCADE, related_name='procedures')
    nursing_order = models.ForeignKey(NursingOrder, on_delete=models.SET_NULL, null=True, blank=True, related_name='procedures')
    visit = models.ForeignKey('patients.Visit', on_delete=models.SET_NULL, null=True, blank=True, related_name='procedures')
    
    procedure_type = models.CharField(max_length=50, choices=PROCEDURE_TYPE_CHOICES)
    description = models.TextField()
    site = models.CharField(max_length=200, blank=True, help_text="Body site where procedure was performed")
    notes = models.TextField(blank=True)
    
    performed_by = models.ForeignKey('accounts.User', on_delete=models.SET_NULL, null=True, related_name='performed_procedures')
    performed_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        db_table = 'procedures'
        ordering = ['-performed_at']
    
    def __str__(self):
        return f"{self.procedure_id} - {self.procedure_type} - {self.patient.get_full_name()}"

