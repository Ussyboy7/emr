"""
Utility functions for clinic name normalization in the backend.
This ensures consistent clinic naming across the application.
"""

# Standardized clinic names (must match frontend constants)
STANDARD_CLINICS = [
    "General",
    "Physiotherapy",
    "Eye Clinic",
    "Sickle Cell",
    "Diamond",
]


def normalize_clinic_name(clinic: str | None) -> str:
    """
    Normalize clinic name to standard format (title case).
    
    Handles various input formats and converts to canonical clinic name.
    
    Args:
        clinic: Raw clinic name from API or user input
        
    Returns:
        Normalized clinic name matching one of the standard clinics, 
        or the input in title case if no match found.
    """
    if not clinic or not clinic.strip():
        return "General"  # Default clinic
    
    trimmed = clinic.strip()
    
    # Convert to title case (first letter uppercase, rest lowercase)
    title_case = trimmed[0].upper() + trimmed[1:].lower() if trimmed else ""
    
    # Try to match against standard clinics (case-insensitive)
    for standard in STANDARD_CLINICS:
        if standard.lower() == title_case.lower() or standard.lower() == trimmed.lower():
            return standard
    
    # Handle common variations
    variations = {
        'eye': 'Eye Clinic',
        'eye clinic': 'Eye Clinic',
        'ophthalmology': 'Eye Clinic',
        'sickle cell': 'Sickle Cell',
        'sickle cell clinic': 'Sickle Cell',
        'diamond': 'Diamond',
        'diamond club': 'Diamond',
        'diamond club clinic': 'Diamond',
        'physiotherapy': 'Physiotherapy',
        'physiotherapy clinic': 'Physiotherapy',
        'general': 'General',
        'general clinic': 'General',
    }
    
    lower = trimmed.lower()
    if lower in variations:
        return variations[lower]
    
    # If no match found, return title case version
    return title_case


def is_valid_clinic(clinic: str | None) -> bool:
    """
    Check if a clinic name is valid (matches one of the standard clinics).
    
    Args:
        clinic: Clinic name to validate
        
    Returns:
        True if clinic is in the standard list
    """
    if not clinic:
        return False
    normalized = normalize_clinic_name(clinic)
    return normalized in STANDARD_CLINICS

