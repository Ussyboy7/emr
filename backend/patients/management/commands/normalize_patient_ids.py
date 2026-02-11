from django.core.management.base import BaseCommand
from django.db import transaction
from patients.models import Patient


class Command(BaseCommand):
    help = "Normalize dependent patient IDs to ED-/RD- format based on principal category and personal number"

    @transaction.atomic
    def handle(self, *args, **options):
        dependents = Patient.objects.filter(category="dependent").select_related("principal_staff").order_by("principal_staff_id", "created_at")
        updated = 0
        skipped = 0
        errors = 0

        current_principal_id = None
        sequence_by_principal = {}

        for dep in dependents:
            principal = dep.principal_staff
            if not principal:
                skipped += 1
                continue

            base_number = (principal.personal_number or "").strip().upper()
            if not base_number:
                skipped += 1
                continue

            prefix = "ED" if principal.category == "employee" else "RD"

            seq = sequence_by_principal.get(principal.id, 0) + 1
            sequence_by_principal[principal.id] = seq

            new_id = f"{prefix}-{base_number}-{seq}"
            if dep.patient_id != new_id:
                try:
                    dep.patient_id = new_id
                    dep.save(update_fields=["patient_id"])
                    updated += 1
                except Exception as e:
                    errors += 1
                    self.stderr.write(f"Failed to update {dep.id}: {e}")

        self.stdout.write(self.style.SUCCESS(f"Normalization complete. Updated: {updated}, Skipped: {skipped}, Errors: {errors}"))
