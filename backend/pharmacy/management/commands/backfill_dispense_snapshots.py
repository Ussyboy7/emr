from django.core.management.base import BaseCommand

from pharmacy.models import Dispense


class Command(BaseCommand):
    help = "Backfill missing dispense snapshot fields for legacy dispense rows."

    def handle(self, *args, **options):
        rows = (
            Dispense.objects
            .select_related('prescription_item', 'prescription_item__generic', 'prescription_item__medication', 'medication')
            .all()
        )
        updated = 0
        for disp in rows.iterator():
            if (
                (disp.prescribed_generic_name_snapshot or '').strip()
                and (disp.prescribed_medication_name_snapshot or '').strip()
                and (disp.prescribed_unit_snapshot or '').strip()
                and (disp.dispense_context_snapshot or '').strip()
            ):
                continue

            item = getattr(disp, 'prescription_item', None)
            prescribed_generic = getattr(getattr(item, 'generic', None), 'name', '') or ''
            prescribed_medication = getattr(getattr(item, 'medication', None), 'name', '') or ''
            prescribed_unit = getattr(item, 'unit', '') or ''

            context = 'as_selected_brand'
            try:
                if item is None:
                    context = 'as_selected_brand'
                elif not item.medication_id:
                    context = 'brand_selected_from_generic'
                elif disp.medication_id == item.medication_id:
                    context = 'as_selected_brand'
                else:
                    item_generic_id = getattr(item.medication, 'generic_id', None)
                    disp_generic_id = getattr(disp.medication, 'generic_id', None)
                    if item_generic_id and disp_generic_id and item_generic_id == disp_generic_id:
                        context = 'brand_selected_from_generic'
                    else:
                        context = 'substituted'
            except Exception:
                context = 'as_selected_brand'

            disp.prescribed_generic_name_snapshot = prescribed_generic
            disp.prescribed_medication_name_snapshot = prescribed_medication
            disp.prescribed_unit_snapshot = prescribed_unit
            disp.dispense_context_snapshot = context
            disp.save(update_fields=[
                'prescribed_generic_name_snapshot',
                'prescribed_medication_name_snapshot',
                'prescribed_unit_snapshot',
                'dispense_context_snapshot',
            ])
            updated += 1

        self.stdout.write(self.style.SUCCESS(f"Backfilled {updated} dispense row(s)."))
