"""
Pharmacy models for the EMR system.
"""

from django.conf import settings
from django.db import models
from django.core.validators import MinValueValidator
from django.utils import timezone


class GenericMedication(models.Model):
    """
    Parent generic medication representing active ingredient(s) and core identity.
    Variations in strength/form/route are distinct generics.
    """

    # `name` is indexed via Meta.indexes below; do not set db_index=True here
    # as that would create a redundant second index on the same column.
    name = models.CharField(max_length=200)
    active_ingredient = models.CharField(max_length=200, blank=True)
    category = models.CharField(max_length=100, blank=True, default="Other")
    strength = models.CharField(max_length=100, blank=True)
    dosage_form = models.CharField(max_length=50, blank=True)
    unit = models.CharField(
        max_length=50,
        blank=True,
        help_text="Default unit per dose, e.g. tablet, capsule, ml",
    )
    route = models.CharField(max_length=50, blank=True)
    atc_code = models.CharField(max_length=20, blank=True, null=True, unique=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "generic_medications"
        ordering = ["name"]
        indexes = [
            models.Index(fields=["name"]),
            models.Index(fields=["atc_code"]),
        ]
        constraints = [
            # A generic row is uniquely identified by its molecule + physical
            # presentation. Different strengths/forms/routes of the same drug
            # (e.g. Paracetamol 500mg tablet vs Paracetamol 120mg/5ml syrup)
            # are separate catalogue entries, but two rows with identical
            # (name, strength, dosage_form, route) would be noise.
            models.UniqueConstraint(
                fields=["name", "strength", "dosage_form", "route"],
                name="uniq_generic_name_strength_form_route",
            ),
        ]

    def __str__(self):
        return f"{self.name} {self.strength} {self.dosage_form}".strip()


class Medication(models.Model):
    """
    Medication/drug master data.
    """

    CATEGORY_CHOICES = [
        ("Antibiotics", "Antibiotics"),
        ("Antimalarials", "Antimalarials"),
        ("Antihypertensives", "Antihypertensives"),
        ("Antidiabetics", "Antidiabetics"),
        ("Analgesics", "Analgesics (painkillers)"),
        ("Antipyretics", "Antipyretics"),
        ("NSAIDs", "Anti-inflammatory drugs (NSAIDs)"),
        ("Antidepressants", "Antidepressants"),
        ("Antipsychotics", "Antipsychotics"),
        ("Anxiolytics", "Anxiolytics"),
        ("Sedatives", "Sedatives & hypnotics"),
        ("Anticonvulsants", "Anticonvulsants (antiepileptics)"),
        ("Antiemetics", "Antiemetics"),
        ("Antihistamines", "Antihistamines"),
        ("AntiAsthmatics", "Anti-asthmatics / bronchodilators"),
        ("Antitussives", "Antitussives (cough suppressants)"),
        ("Expectorants", "Expectorants"),
        ("Antacids", "Antacids"),
        ("AntiUlcer", "Anti-ulcer drugs"),
        ("Laxatives", "Laxatives"),
        ("Antidiarrhoeals", "Antidiarrhoeals"),
        ("Anthelmintics", "Anthelmintics (anti-worm)"),
        ("Antifungals", "Antifungals"),
        ("Antivirals", "Antivirals"),
        ("Antiprotozoals", "Antiprotozoals"),
        ("Antitubercular", "Antitubercular drugs"),
        ("Antiretrovirals", "Antiretrovirals (HIV drugs)"),
        ("Immunosuppressants", "Immunosuppressants"),
        ("Vaccines", "Vaccines & immunologicals"),
        ("Vitamins", "Vitamins"),
        ("Minerals", "Minerals & supplements"),
        ("Hormonal", "Hormonal drugs"),
        ("Contraceptives", "Contraceptives"),
        ("Corticosteroids", "Corticosteroids"),
        ("Diuretics", "Diuretics"),
        ("Cardiac", "Cardiac drugs (anti-arrhythmics, etc.)"),
        ("LipidLowering", "Lipid-lowering agents"),
        ("Haematinics", "Haematinics (iron, folic acid)"),
        ("Anticoagulants", "Anticoagulants"),
        ("Antiplatelet", "Antiplatelet drugs"),
        ("Antigout", "Antigout drugs"),
        ("MuscleRelaxants", "Muscle relaxants"),
        ("LocalAnaesthetics", "Local anaesthetics"),
        ("GeneralAnaesthetics", "General anaesthetics"),
        ("Ophthalmic", "Ophthalmic preparations"),
        ("Dermatological", "Dermatological agents"),
        ("ENT", "ENT preparations"),
        ("Urological", "Urological drugs"),
        ("Obstetric", "Obstetric & gynaecological drugs"),
        ("Emergency", "Emergency / resuscitation drugs"),
        ("AntiParkinson", "Anti-Parkinson’s drugs"),
        ("AntiAlzheimer", "Anti-Alzheimer’s drugs"),
        ("AntiMigraine", "Anti-migraine drugs"),
        ("Antispasmodics", "Antispasmodics"),
        ("Anticholinergics", "Anticholinergics"),
        ("Cholinergic", "Cholinergic agents"),
        ("Antifibrinolytics", "Antifibrinolytics"),
        ("Thrombolytics", "Thrombolytics"),
        ("PlasmaExpanders", "Plasma expanders"),
        ("BloodProducts", "Blood products"),
        ("Erythropoiesis", "Erythropoiesis-stimulating agents"),
        ("GrowthHormones", "Growth hormones"),
        ("Thyroid", "Thyroid & antithyroid drugs"),
        ("Osteoporosis", "Osteoporosis drugs"),
        ("CalciumRegulators", "Calcium regulators"),
        ("Bisphosphonates", "Bisphosphonates"),
        ("AntiObesity", "Anti-obesity drugs"),
        ("AppetiteStimulants", "Appetite stimulants"),
        ("ChemoAntiemetics", "Anti-emetics (chemo-related)"),
        ("Cytotoxic", "Cytotoxic / anticancer drugs"),
        ("TargetedCancer", "Targeted cancer therapies"),
        ("Radiopharmaceuticals", "Radiopharmaceuticals"),
        ("Antidotes", "Antidotes & chelating agents"),
        ("AntiSnakeVenom", "Anti-snake venom & antisera"),
        ("Immunostimulants", "Immunostimulants"),
        ("Biologicals", "Biologicals / monoclonal antibodies"),
        ("EnzymeReplacement", "Enzyme replacement therapies"),
        ("Fertility", "Fertility drugs"),
        ("Tocolytics", "Tocolytics"),
        ("Uterotonics", "Uterotonics"),
        ("ErectileDysfunction", "Erectile dysfunction drugs"),
        ("BPH", "Benign prostatic hyperplasia (BPH) drugs"),
        ("UrinaryAlkalinisers", "Urinary alkalinisers"),
        ("UrinaryAcidifiers", "Urinary acidifiers"),
        ("RespiratoryStimulants", "Respiratory stimulants"),
        ("PulmonaryHypertension", "Pulmonary hypertension drugs"),
        ("SmokingCessation", "Smoking cessation drugs"),
        ("AlcoholDependence", "Alcohol dependence drugs"),
        ("OpioidDependence", "Opioid dependence drugs"),
        ("AntiGlaucoma", "Anti-glaucoma drugs"),
        ("Mydriatics", "Mydriatics & miotics"),
        ("Otic", "Otic (ear) preparations"),
        ("NasalDecongestants", "Nasal decongestants"),
        ("Photosensitising", "Photosensitising agents"),
        ("Sunscreens", "Sunscreens & photoprotectives"),
        ("WoundCare", "Wound-care agents"),
        ("Antiseptics", "Antiseptics & disinfectants"),
        ("Diagnostic", "Diagnostic agents"),
        ("ContrastMedia", "Contrast media"),
        ("Nutritional", "Nutritional formulas / enteral feeds"),
        ("AntiLeprosy", "Anti-leprosy drugs"),
        ("AntiAmoebic", "Anti-amoebic drugs"),
        ("AntiGiardial", "Anti-giardial drugs"),
        ("AntiTrypanosomal", "Anti-trypanosomal drugs"),
        ("AntiToxoplasmosis", "Anti-toxoplasmosis drugs"),
        ("AntiCryptosporidial", "Anti-cryptosporidial drugs"),
        ("AntiOpportunistic", "Anti-opportunistic infection drugs"),
        ("Antifilarial", "Antifilarial drugs"),
        ("Antischistosomal", "Antischistosomal drugs"),
        ("Antiscabies", "Antiscabies drugs"),
        ("Antipediculosis", "Antipediculosis drugs"),
        ("AntiPruritic", "Anti-pruritic drugs"),
        ("AntiPsoriatic", "Anti-psoriatic drugs"),
        ("AntiAcne", "Anti-acne drugs"),
        ("SkinDepigmenting", "Skin depigmenting agents"),
        ("Keratolytic", "Keratolytic agents"),
        ("Emollients", "Emollients & moisturisers"),
        ("AntiDandruff", "Anti-dandruff agents"),
        ("Dental", "Dental & oral care drugs"),
        ("SalivaSubstitutes", "Saliva substitutes"),
        ("ArtificialTears", "Artificial tears"),
        ("ContactLens", "Contact-lens solutions"),
        ("NasalSaline", "Nasal saline preparations"),
        ("ThroatLozenges", "Throat lozenges & sprays"),
        ("Probiotics", "Probiotics"),
        ("Prebiotics", "Prebiotics"),
        ("DigestiveEnzymes", "Digestive enzymes"),
        ("BileAcid", "Bile acid sequestrants"),
        ("Gallstone", "Gallstone dissolution drugs"),
        ("Hepatoprotective", "Hepatoprotective agents"),
        ("PancreaticEnzymes", "Pancreatic enzyme replacements"),
        ("AntiEmeticRehydration", "Anti-emetic rehydration agents"),
        ("OralRehydration", "Oral rehydration solutions"),
        ("ParenteralNutrition", "Parenteral nutrition products"),
        ("Dialysis", "Dialysis solutions"),
        ("PeritonealDialysis", "Peritoneal dialysis fluids"),
        ("IVFluids", "Intravenous fluids"),
        ("Electrolytes", "Electrolyte preparations"),
        ("AcidBase", "Acid-base correcting agents"),
        ("Oxygen", "Oxygen & medical gases"),
        ("PlasmaSubstitutes", "Plasma substitutes"),
        ("VaccinationAdjuvants", "Vaccination adjuvants"),
        ("ColdChain", "Cold-chain biologicals"),
        ("VeterinaryCrossover", "Veterinary-human crossover drugs"),
        ("EmergencyAntidotal", "Emergency antidotal kits"),
        ("DisasterResponse", "Disaster-response medicines"),
        ("TravelMedicine", "Travel-medicine drugs"),
        ("OccupationalHealth", "Occupational-health medicines"),
        ("Geriatric", "Geriatric-specific medicines"),
        ("Paediatric", "Paediatric-specific medicines"),
        ("Other", "Other"),
    ]

    name = models.CharField(max_length=200)
    generic = models.ForeignKey(
        GenericMedication,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="brands",
    )
    generic_name = models.CharField(max_length=200, blank=True)
    code = models.CharField(max_length=50, unique=True, db_index=True)
    unit = models.CharField(max_length=50, help_text="tablet, capsule, ml, etc.")
    strength = models.CharField(max_length=100, blank=True, help_text="e.g., 500mg")
    form = models.CharField(
        max_length=50, blank=True, help_text="tablet, syrup, injection, etc."
    )
    category = models.CharField(
        max_length=100,
        choices=CATEGORY_CHOICES,
        blank=True,
        help_text="Medication category",
    )
    manufacturer = models.CharField(
        max_length=200, blank=True, help_text="Manufacturer name"
    )
    pack_size = models.IntegerField(
        null=True, blank=True, help_text="Number of units per pack"
    )
    dispense_mode = models.CharField(
        max_length=20,
        choices=[
            ("pack_only", "Whole packs only"),
            ("units_only", "Individual units only"),
            ("pack_or_units", "Pack or units (choose at issue)"),
        ],
        default="pack_or_units",
        help_text="Whether staff issue whole packs, individual units, or may choose.",
    )
    min_stock_level = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    prescription_required = models.BooleanField(
        default=False, help_text="Requires prescription"
    )
    description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "medications"
        ordering = ["name"]
        constraints = [
            models.UniqueConstraint(
                fields=["name", "generic"], name="uniq_brand_per_generic"
            )
        ]

    def __str__(self):
        return f"{self.name} ({self.strength})" if self.strength else self.name


class MedicationInventory(models.Model):
    """
    Medication inventory with batch tracking.
    """

    medication = models.ForeignKey(
        Medication, on_delete=models.CASCADE, related_name="inventory_items"
    )
    batch_number = models.CharField(max_length=100, db_index=True)
    expiry_date = models.DateField()
    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]
    )
    unit = models.CharField(max_length=50)
    min_stock_level = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    max_stock_level = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        null=True,
        blank=True,
        help_text="Maximum stock level",
    )
    location = models.CharField(max_length=100, blank=True)
    location_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='medication_inventories',
        help_text="Care facility this inventory belongs to",
    )
    supplier = models.CharField(max_length=200, blank=True)
    purchase_price = models.DecimalField(
        max_digits=10, decimal_places=2, null=True, blank=True
    )
    received_at = models.DateTimeField(
        null=True,
        blank=True,
        help_text="When stock was physically received into this location",
    )
    received_by = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="medication_inventory_receipts",
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "medication_inventory"
        ordering = ["expiry_date"]
        indexes = [
            models.Index(fields=["medication", "batch_number"]),
            models.Index(fields=["expiry_date"]),
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
        ("pending", "Pending"),
        ("dispensing", "Dispensing"),
        ("partially_dispensed", "Partially Dispensed"),
        ("dispensed", "Dispensed"),
        ("cancelled", "Cancelled"),
    ]

    prescription_id = models.CharField(max_length=50, unique=True, db_index=True)
    patient = models.ForeignKey(
        "patients.Patient", on_delete=models.CASCADE, related_name="prescriptions"
    )
    doctor = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="prescriptions",
    )
    visit = models.ForeignKey(
        "patients.Visit",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prescriptions",
    )
    consultation_session = models.ForeignKey(
        "consultation.ConsultationSession",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prescriptions",
    )
    admission = models.ForeignKey(
        "wards.PatientAdmission",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="prescriptions",
    )

    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")
    diagnosis = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    prescribed_at = models.DateTimeField(auto_now_add=True)
    dispensing_started_at = models.DateTimeField(null=True, blank=True)
    dispensed_at = models.DateTimeField(null=True, blank=True)
    created_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="created_prescriptions",
    )
    location_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='prescriptions',
        help_text="Clinic where this prescription was issued",
    )

    class Meta:
        db_table = "prescriptions"
        ordering = ["-prescribed_at"]
        indexes = [
            models.Index(fields=["prescription_id"]),
            models.Index(fields=["patient", "-prescribed_at"]),
            models.Index(fields=["status"]),
        ]

    def save(self, *args, **kwargs):
        """Auto-generate prescription_id if not provided."""
        if not self.prescription_id:
            # Generate prescription ID: RX-YYYYMMDD-HHMMSS-XXXX
            from datetime import datetime

            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            # Add random suffix to ensure uniqueness
            import random

            suffix = f"{random.randint(1000, 9999)}"
            self.prescription_id = f"RX-{timestamp}-{suffix}"

        # Track when pharmacist starts attending to this prescription.
        if self.status == "dispensing" and not self.dispensing_started_at:
            self.dispensing_started_at = timezone.now()
        super().save(*args, **kwargs)

    def recalculate_status(self):
        """Recalculate and update prescription status based on medication items."""
        from django.utils import timezone

        # Query items directly — the related manager cache can be stale after
        # dispense updates items via prescription.medications.get().
        all_items = self.medications.model.objects.filter(prescription_id=self.pk)

        if not all_items.exists():
            # No items, keep current status or set to pending
            if self.status not in ["cancelled"]:
                self.status = "pending"
            return

        active_items = [
            item for item in all_items if not getattr(item, "superseded_at", None)
        ]
        if not active_items:
            if self.status not in ["cancelled"]:
                self.status = "pending"
            self.save(update_fields=["status", "dispensing_started_at", "dispensed_at"])
            return

        # Check each item and ensure is_dispensed is correctly set
        all_dispensed = True
        has_partial = False
        any_dispensed = False

        for item in active_items:
            # Update is_dispensed based on actual dispensed quantity
            if item.dispensed_quantity >= item.quantity:
                if not item.is_dispensed:
                    item.is_dispensed = True
                    item.save(update_fields=["is_dispensed"])
            else:
                all_dispensed = False
                if item.dispensed_quantity > 0:
                    has_partial = True
                if item.is_dispensed:
                    item.is_dispensed = False
                    item.save(update_fields=["is_dispensed"])
            if item.dispensed_quantity > 0:
                any_dispensed = True

        # Update prescription status
        if all_dispensed:
            self.status = "dispensed"
            if not self.dispensed_at:
                self.dispensed_at = timezone.now()
        elif has_partial or any_dispensed:
            self.status = "partially_dispensed"
        else:
            if self.status == "dispensing":
                # Pharmacist has started attending; keep "dispensing" until items are dispensed or manually completed.
                self.status = "dispensing"
            elif self.status == "dispensed":
                # If status was dispensed but items aren't, change to partially_dispensed
                self.status = "partially_dispensed"
            elif self.status not in ["cancelled"]:
                self.status = "pending"

        self.save(update_fields=["status", "dispensing_started_at", "dispensed_at"])

    def __str__(self):
        return f"{self.prescription_id} - {self.patient.get_full_name()}"


class PrescriptionItem(models.Model):
    """
    Individual medication item in a prescription.
    """

    prescription = models.ForeignKey(
        Prescription, on_delete=models.CASCADE, related_name="medications"
    )
    # Generic medication is required for prescribing
    generic = models.ForeignKey(
        GenericMedication, on_delete=models.PROTECT, related_name="prescription_items"
    )
    # Brand medication is optional and selected during dispensing
    medication = models.ForeignKey(
        Medication,
        on_delete=models.PROTECT,
        related_name="prescription_items",
        null=True,
        blank=True,
    )

    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0.01)]
    )
    unit = models.CharField(max_length=50)
    dosage_form = models.CharField(
        max_length=100, blank=True, help_text="e.g., tablet, capsule, syrup"
    )
    strength = models.CharField(max_length=100, blank=True, help_text="e.g., 20/120mg")
    dose = models.CharField(max_length=200, blank=True, help_text="e.g., 1 tablet")
    frequency = models.CharField(max_length=100, blank=True)
    duration = models.CharField(max_length=100, blank=True, help_text="e.g., 7 days")
    route = models.CharField(max_length=50, blank=True, help_text="e.g., Oral, IV")
    instructions = models.TextField(blank=True)

    # Dispensing information
    dispensed_quantity = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    is_dispensed = models.BooleanField(default=False)

    # Combo split (and similar): line kept as read-only prescribing record; dispense new rows only.
    superseded_at = models.DateTimeField(null=True, blank=True)
    superseded_split_into_ids = models.JSONField(default=list, blank=True)

    class Meta:
        db_table = "prescription_items"
        ordering = ["id"]
        constraints = [
            models.CheckConstraint(
                check=models.Q(quantity__gt=0),
                name="prescription_item_quantity_positive",
            ),
            models.CheckConstraint(
                check=(
                    models.Q(medication__isnull=False) | models.Q(generic__isnull=False)
                ),
                name="prescription_item_medication_or_generic_required",
            ),
        ]

    def __str__(self):
        if self.medication:
            return f"{self.medication.name} - {self.quantity} {self.unit}"
        else:
            return f"{self.generic.name} - {self.quantity} {self.unit}"

    def recalculate_quantity(self):
        """Recalculate quantity based on dose, frequency, and duration."""
        import re
        from decimal import Decimal

        # Frequency mapping (same as frontend)
        frequency_map = {
            "Once daily (OD)": 1,
            "Twice daily (BD)": 2,
            "Three times daily (TDS)": 3,
            "Four times daily (QDS)": 4,
            "Every 6 hours (Q6H)": 4,
            "Every 8 hours (Q8H)": 3,
            "Every 12 hours (Q12H)": 2,
            "At bedtime (Nocte)": 1,
            "As needed (PRN)": 2,
            "Weekly": 0.14,
            "STAT (Single dose)": 0,
        }

        # Extract numeric dose value (e.g., "2" or "2 tablets" -> 2)
        dose_value = 1
        if self.dose:
            dose_match = re.search(r"(\d+(?:\.\d+)?)", str(self.dose))
            if dose_match:
                dose_value = float(dose_match.group(1))

        # Get frequency multiplier
        frequency = self.frequency or ""
        daily_doses = frequency_map.get(frequency, 1)

        # Extract duration in days
        duration_days = 1
        if self.duration:
            duration_match = re.search(r"(\d+)", str(self.duration))
            if duration_match:
                duration_days = int(duration_match.group(1))

        # Calculate quantity
        if frequency == "STAT (Single dose)":
            new_quantity = Decimal(str(dose_value))
        else:
            new_quantity = Decimal(str(dose_value * daily_doses * duration_days))

        # Only update if not dispensed or if dispensed quantity is less than new quantity
        if self.dispensed_quantity == 0 or self.dispensed_quantity < new_quantity:
            self.quantity = new_quantity
            return True
        return False


class Dispense(models.Model):
    """
    Medication dispensing record.
    """

    dispense_id = models.CharField(max_length=50, unique=True, db_index=True)
    prescription = models.ForeignKey(
        Prescription, on_delete=models.CASCADE, related_name="dispenses"
    )
    prescription_item = models.ForeignKey(
        PrescriptionItem, on_delete=models.CASCADE, related_name="dispenses"
    )
    medication = models.ForeignKey(
        Medication, on_delete=models.PROTECT, related_name="dispenses"
    )
    inventory_item = models.ForeignKey(
        MedicationInventory,
        on_delete=models.PROTECT,
        related_name="dispenses",
        null=True,
        blank=True,
    )
    dispensary_receipt_line = models.ForeignKey(
        "DispensaryReceiptLine",
        on_delete=models.PROTECT,
        related_name="dispenses",
        null=True,
        blank=True,
        help_text="Set when dispensed from Dispensary (receipt-centric inventory).",
    )

    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]
    )
    unit = models.CharField(max_length=50)
    quantity_entry_mode = models.CharField(
        max_length=10,
        choices=[("pack", "Pack"), ("units", "Units")],
        blank=True,
        default="",
        help_text="How quantity was entered at dispense time (pack vs individual units).",
    )
    batch_number = models.CharField(max_length=100, blank=True)
    prescribed_generic_name_snapshot = models.CharField(
        max_length=255, blank=True, default=""
    )
    prescribed_medication_name_snapshot = models.CharField(
        max_length=255, blank=True, default=""
    )
    prescribed_unit_snapshot = models.CharField(max_length=50, blank=True, default="")
    dispense_context_snapshot = models.CharField(max_length=50, blank=True, default="")

    dispensed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="dispensed_medications",
    )
    dispensed_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "dispenses"
        ordering = ["-dispensed_at"]
        indexes = [
            models.Index(fields=["dispense_id"]),
            models.Index(fields=["prescription", "-dispensed_at"]),
        ]

    def save(self, *args, **kwargs):
        """Auto-generate dispense_id if not provided."""
        if not self.dispense_id:
            # Generate dispense ID: DISP-YYYYMMDD-HHMMSS-XXXX
            from datetime import datetime

            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            # Add random suffix to ensure uniqueness
            import random

            suffix = f"{random.randint(1000, 9999)}"
            self.dispense_id = f"DISP-{timestamp}-{suffix}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.dispense_id} - {self.medication.name}"


class StockRequest(models.Model):
    """
    Request for stock transfer between locations (e.g., Store -> Dispensary).
    """

    STATUS_CHOICES = [
        ("pending", "Pending"),
        ("approved", "Approved"),
        ("partially_fulfilled", "Partially Fulfilled"),
        ("fulfilled", "Fulfilled"),
        ("received", "Received"),
        ("rejected", "Rejected"),
        ("cancelled", "Cancelled"),
    ]

    request_id = models.CharField(max_length=50, unique=True, db_index=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="pending")

    from_location = models.CharField(max_length=100)
    to_location = models.CharField(max_length=100)
    location_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='stock_requests',
        help_text="Care facility this stock request belongs to",
    )

    requested_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="requested_stock",
    )
    confirmed_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="confirmed_stock_requests",
    )

    confirmed_at = models.DateTimeField(null=True, blank=True)
    confirmed_notes = models.TextField(blank=True)
    notes = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "stock_requests"
        ordering = ["-created_at"]
        indexes = [
            models.Index(fields=["request_id"]),
            models.Index(fields=["status"]),
            models.Index(fields=["from_location", "to_location"]),
        ]

    def save(self, *args, **kwargs):
        if not self.request_id:
            from datetime import datetime

            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            import random

            suffix = f"{random.randint(1000, 9999)}"
            self.request_id = f"REQ-{timestamp}-{suffix}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.request_id


class StockRequestItem(models.Model):
    """
    Item within a stock request.
    """

    request = models.ForeignKey(
        StockRequest, on_delete=models.CASCADE, related_name="items"
    )
    medication = models.ForeignKey(Medication, on_delete=models.PROTECT)
    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]
    )
    fulfilled_quantity = models.DecimalField(
        max_digits=10, decimal_places=2, default=0, validators=[MinValueValidator(0)]
    )
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "stock_request_items"


class StockIssue(models.Model):
    """
    Record of stock being issued/transferred.
    """

    issue_id = models.CharField(max_length=50, unique=True, db_index=True)
    request = models.ForeignKey(
        StockRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="issues",
    )
    issued_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="issued_stock",
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    class Meta:
        db_table = "stock_issues"
        ordering = ["-issued_at"]

    def save(self, *args, **kwargs):
        if not self.issue_id:
            from datetime import datetime

            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            import random

            suffix = f"{random.randint(1000, 9999)}"
            self.issue_id = f"ISS-{timestamp}-{suffix}"
        super().save(*args, **kwargs)

    def __str__(self):
        return self.issue_id


class StockIssueLine(models.Model):
    """
    Line item for stock issue, tracking specific inventory movements.
    destination_inventory_item is null when stock is issued to Dispensary (tracked via DispensaryReceiptLine).
    """

    issue = models.ForeignKey(
        StockIssue, on_delete=models.CASCADE, related_name="lines"
    )
    medication = models.ForeignKey(Medication, on_delete=models.PROTECT)
    source_inventory_item = models.ForeignKey(
        MedicationInventory, on_delete=models.PROTECT, related_name="issues_from"
    )
    destination_inventory_item = models.ForeignKey(
        MedicationInventory,
        on_delete=models.PROTECT,
        related_name="issues_to",
        null=True,
        blank=True,
        help_text="Null when issued to Dispensary (stock tracked in DispensaryReceiptLine).",
    )
    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]
    )

    class Meta:
        db_table = "stock_issue_lines"


class DispensaryReceiptLine(models.Model):
    """
    Receipt-centric inventory for Dispensary: one row per chunk received from Central Store.
    Replaces MedicationInventory for Dispensary; stock = sum of quantity_remaining per medication.
    """

    medication = models.ForeignKey(
        Medication, on_delete=models.PROTECT, related_name="dispensary_receipt_lines"
    )
    quantity = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Total received",
    )
    quantity_remaining = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0)],
        help_text="Remaining after dispensing",
    )
    received_at = models.DateTimeField(auto_now_add=False)  # Set from issue.issued_at
    request = models.ForeignKey(
        StockRequest,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispensary_receipt_lines",
    )
    issue = models.ForeignKey(
        StockIssue,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispensary_receipt_lines",
    )
    stock_issue_line = models.OneToOneField(
        StockIssueLine,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="dispensary_receipt_line",
    )
    location_clinic = models.ForeignKey(
        'organization.Clinic',
        on_delete=models.SET_NULL,
        null=True, blank=True,
        related_name='dispensary_receipt_lines',
        help_text="Care facility this receipt line belongs to",
    )
    # Snapshot from source for display/FIFO (optional)
    batch_number = models.CharField(max_length=100, blank=True)
    expiry_date = models.DateField(null=True, blank=True)

    class Meta:
        db_table = "dispensary_receipt_lines"
        ordering = ["received_at"]
        indexes = [
            models.Index(fields=["medication"]),
            models.Index(fields=["received_at"]),
        ]

    def __str__(self):
        return f"{self.medication.name} received {self.received_at.date()} (req {self.request_id})"

    @property
    def request_id(self):
        return self.request.request_id if self.request else None


class HodStockIssue(models.Model):
    """
    Discretionary issue from the Pharmacy HOD store (not tied to a prescription).
    """

    issue_id = models.CharField(max_length=50, unique=True, db_index=True)
    medication = models.ForeignKey(
        Medication, on_delete=models.PROTECT, related_name="hod_stock_issues"
    )
    inventory_item = models.ForeignKey(
        MedicationInventory,
        on_delete=models.PROTECT,
        related_name="hod_stock_issues",
    )
    quantity = models.DecimalField(
        max_digits=10, decimal_places=2, validators=[MinValueValidator(0)]
    )
    unit = models.CharField(max_length=50)
    quantity_entry_mode = models.CharField(
        max_length=10,
        choices=[("pack", "Pack"), ("units", "Units")],
        blank=True,
        default="",
        help_text="How quantity was entered at issue time (pack vs individual units).",
    )
    batch_number = models.CharField(max_length=100, blank=True)
    patient_name = models.CharField(max_length=200, blank=True)
    patient_mrn = models.CharField(max_length=100, blank=True)
    reason = models.CharField(max_length=200, blank=True)
    notes = models.TextField(blank=True)
    issued_by = models.ForeignKey(
        "accounts.User",
        on_delete=models.SET_NULL,
        null=True,
        related_name="hod_stock_issues",
    )
    issued_at = models.DateTimeField(auto_now_add=True)
    location_clinic = models.ForeignKey(
        "organization.Clinic",
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name="hod_stock_issues",
        help_text="Care facility this HOD issue belongs to",
    )

    class Meta:
        db_table = "hod_stock_issues"
        ordering = ["-issued_at"]
        indexes = [
            models.Index(fields=["issue_id"]),
            models.Index(fields=["-issued_at"]),
            models.Index(fields=["medication"]),
        ]

    def save(self, *args, **kwargs):
        if not self.issue_id:
            from datetime import datetime
            import random

            timestamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            suffix = f"{random.randint(1000, 9999)}"
            self.issue_id = f"HOD-{timestamp}-{suffix}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.issue_id} - {self.medication.name}"
