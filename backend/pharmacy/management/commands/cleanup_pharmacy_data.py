from django.core.management.base import BaseCommand
from pharmacy.models import GenericMedication, Medication, MedicationInventory, PrescriptionItem, Dispense
from django.db import transaction
from django.db.models import Q, Count

class Command(BaseCommand):
    help = 'Comprehensive cleanup of pharmacy data: Generics, Medications, and Inventory.'

    def handle(self, *args, **options):
        self.stdout.write(self.style.WARNING("Starting pharmacy data cleanup..."))
        
        with transaction.atomic():
            self.fix_amatem_issue()
            self.cleanup_generics()
            self.cleanup_brands()
            self.cleanup_medications()
        
        self.stdout.write(self.style.SUCCESS("Pharmacy data cleanup complete!"))

    def fix_amatem_issue(self):
        self.stdout.write("\n--- Fixing AMATEM Issue ---")
        
        # 1. Identify "AMATEM" generic (Try broader search)
        bad_generics = GenericMedication.objects.filter(
            Q(name__icontains="AMATEM") | 
            Q(name__icontains="SOFTGEL")
        )
        
        if not bad_generics.exists():
            self.stdout.write("No 'AMATEM' or 'SOFTGEL' generics found. Skipping.")
        else:
            # 2. Ensure correct generic exists
            correct_name = "Artemether Lumefantrine"
            correct_generic, created = GenericMedication.objects.get_or_create(
                name=correct_name,
                defaults={
                    'active_ingredient': "Artemether + Lumefantrine",
                    'category': "Antimalarials",
                    'is_active': True
                }
            )
            if created:
                self.stdout.write(f"Created correct generic: {correct_name}")
            else:
                self.stdout.write(f"Found correct generic: {correct_name}")

            # 3. Move Medications and Inventory
            for bad_gen in bad_generics:
                self.stdout.write(f"Processing bad generic: {bad_gen.name} (ID: {bad_gen.id})")
                self.merge_generic_relationships(bad_gen, correct_generic)
                bad_gen.delete()

    def cleanup_generics(self):
        self.stdout.write("\n--- Cleaning up Generics ---")
        
        # 1. Deduplicate by name (case insensitive)
        all_generics = GenericMedication.objects.all().order_by('id')
        seen_names = {} # name_lower -> generic_obj
        
        for gen in all_generics:
            name_key = gen.name.strip().lower()
            
            if not name_key:
                continue

            if name_key in seen_names:
                primary = seen_names[name_key]
                self.stdout.write(f"Found duplicate generic: {gen.name} (ID: {gen.id}) -> Merging into {primary.name} (ID: {primary.id})")
                
                self.merge_generic_relationships(gen, primary)
                
                # Delete duplicate
                gen.delete()
            else:
                seen_names[name_key] = gen
                
                # Standardize Name (Title Case)
                clean_name = gen.name.strip()
                if clean_name != gen.name:
                    gen.name = clean_name
                    gen.save()

    def merge_generic_relationships(self, source_gen, target_gen):
        """
        Safely move brands and prescription items from source generic to target generic.
        Handles unique constraint violations for brands.
        """
        # 1. Move Prescription Items
        PrescriptionItem.objects.filter(generic=source_gen).update(generic=target_gen)
        
        # 2. Move Brands
        source_brands = Medication.objects.filter(generic=source_gen)
        
        for brand in source_brands:
            # Check if target already has this brand name
            target_brand = Medication.objects.filter(generic=target_gen, name=brand.name).first()
            
            if target_brand:
                self.stdout.write(f"  - Merging duplicate brand: {brand.name}")
                # Merge inventory
                MedicationInventory.objects.filter(medication=brand).update(medication=target_brand)
                
                # Merge prescription items (linked to brand)
                PrescriptionItem.objects.filter(medication=brand).update(medication=target_brand)
                
                # Merge dispenses
                Dispense.objects.filter(medication=brand).update(medication=target_brand)

                # Delete source brand
                brand.delete()
            else:
                self.stdout.write(f"  - Moving brand: {brand.name}")
                brand.generic = target_gen
                brand.save()

    def cleanup_brands(self):
        self.stdout.write("\n--- Cleaning up Medications (Brands) ---")
        
        # Deduplicate brands by Name + Generic
        duplicates = Medication.objects.values('name', 'generic').annotate(count=Count('id')).filter(count__gt=1)
        
        for dup in duplicates:
            name = dup['name']
            generic_id = dup['generic']
            
            self.stdout.write(f"Found duplicate brand: {name} (Generic ID: {generic_id})")
            
            meds = Medication.objects.filter(name=name, generic_id=generic_id).order_by('id')
            if not meds.exists():
                continue
                
            primary = meds.first()
            others = meds[1:]
            
            for other in others:
                self.stdout.write(f"  - Merging {other.id} into {primary.id}")
                
                # Move Inventory
                MedicationInventory.objects.filter(medication=other).update(medication=primary)
                
                # Move Prescription Items
                PrescriptionItem.objects.filter(medication=other).update(medication=primary)
                
                # Move Dispenses
                Dispense.objects.filter(medication=other).update(medication=primary)

                # Delete duplicate
                other.delete()

    def cleanup_medications(self):
        self.stdout.write("\n--- Cleaning up Medications ---")
        # Ensure all medications have a generic
        orphaned_meds = Medication.objects.filter(generic__isnull=True)
        for med in orphaned_meds:
            # Simple heuristic: exact match
            candidates = GenericMedication.objects.filter(name__iexact=med.name)
            if candidates.exists():
                 generic = candidates.first()
                 med.generic = generic
                 med.save()
                 self.stdout.write(f"  - Auto-linked {med.name} to Generic {generic.name}")
