from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Count
from pharmacy.models import Medication


class Command(BaseCommand):
    help = "Ensure brand_name unique per generic by deactivating/renaming duplicates"

    def handle(self, *args, **options):
        duplicates = (
            Medication.objects
            .values('name', 'generic_id')
            .annotate(c=Count('id'))
            .filter(c__gt=1, generic_id__isnull=False)
        )
        total_groups = duplicates.count()
        fixed = 0

        with transaction.atomic():
            for group in duplicates:
                qs = Medication.objects.filter(name=group['name'], generic_id=group['generic_id']).order_by('id')
                keep = qs.first()
                for idx, med in enumerate(qs[1:], start=2):
                    med.is_active = False
                    med.name = f"{med.name} (dup {idx})"
                    med.save(update_fields=['is_active', 'name'])
                    fixed += 1

        self.stdout.write(self.style.SUCCESS(f"Processed {total_groups} duplicate groups, deactivated/renamed {fixed} meds"))
