from django.core.management.base import BaseCommand
from pharmacy.models import GenericMedication, Medication

class Command(BaseCommand):
    help = 'Fixes bad data in GenericMedication table (specifically AMATEM)'

    def handle(self, *args, **options):
        # 1. Fix AMATEM SOFTGEL 200
        bad_name = "AMATEM SOFTGEL 200"
        correct_name = "Artemether Lumefantrine"
        
        try:
            bad_generic = GenericMedication.objects.filter(name__icontains="AMATEM").first()
            if bad_generic:
                self.stdout.write(f"Found bad generic: {bad_generic.name}")
                
                # Check if correct generic exists
                correct_generic = GenericMedication.objects.filter(name__icontains="Artemether").first()
                
                if not correct_generic:
                    self.stdout.write(f"Creating correct generic: {correct_name}")
                    correct_generic = GenericMedication.objects.create(
                        name=correct_name,
                        active_ingredient="Artemether + Lumefantrine",
                        is_active=True
                    )
                
                # Move any linked medications to the correct generic
                linked_meds = Medication.objects.filter(generic=bad_generic)
                count = linked_meds.count()
                if count > 0:
                    self.stdout.write(f"Moving {count} medications from {bad_generic.name} to {correct_generic.name}")
                    linked_meds.update(generic=correct_generic)
                
                # Delete the bad generic
                self.stdout.write(f"Deleting bad generic: {bad_generic.name}")
                bad_generic.delete()
                
                self.stdout.write(self.style.SUCCESS("Successfully fixed AMATEM generic."))
            else:
                self.stdout.write("AMATEM generic not found. Data might be clean.")

        except Exception as e:
            self.stdout.write(self.style.ERROR(f"Error fixing data: {e}"))
