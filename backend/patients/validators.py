"""
Custom validators for the Patients app.
"""
from django.core.exceptions import ValidationError
from django.db.models import Q


def validate_personal_number_uniqueness(personal_number, patient_id=None, category=None):
    """
    Validate that personal_number is unique for Employee and Retiree categories.
    
    Args:
        personal_number (str): The personal number to validate
        patient_id (int, optional): Current patient ID (for updates)
        category (str, optional): Patient category
    
    Raises:
        ValidationError: If personal number is not unique for Employee/Retiree
    """
    if not personal_number or not category:
        return
        
    # Only enforce uniqueness for Employee and Retiree categories
    if category not in ['employee', 'retiree']:
        return
        
    from .models import Patient
    
    # Build query for existing patients with same personal number
    query = Q(personal_number__iexact=personal_number.strip()) & Q(category__in=['employee', 'retiree'])
    
    # Exclude current patient if updating
    if patient_id:
        query &= ~Q(id=patient_id)
    
    # Check if any existing patients match
    existing_count = Patient.objects.filter(query).count()
    
    if existing_count > 0:
        raise ValidationError({
            'personal_number': f'A {category.capitalize()} patient with personal number "{personal_number}" already exists.'
        })