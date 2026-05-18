"""
Seed TemplateFieldOption records from the seed data and curated name map,
so the "Manage Result Types" UI has a starting set of options for every field
in the template catalog.

Run with:  python manage.py seed_field_options
Idempotent: re-running will upsert matching (template, field_name, value) tuples.
"""
from django.core.management.base import BaseCommand
from laboratory.models import LabTemplate, TemplateFieldOption

# Curated field options keyed by field name – same values that were historically
# hardcoded in the frontend _nameOptions map, now migrated to the database.
_FIELD_OPTIONS: dict[str, list[str]] = {
    # Urinalysis
    'Colour': ['Amber', 'Deep Amber', 'Pale Amber', 'Straw'],
    'Appearance': ['Clear', 'Turbid', 'Slightly Turbid', 'Cloudy', 'Slightly Cloudy'],
    'pH': ['1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0','5.5','6.0','6.5','7.0','7.5','8.0'],
    'Specific Gravity': ['1.000','1.005','1.010','1.015','1.020','1.025','1.030'],
    'Nitrite': ['NEGATIVE', 'POSITIVE'],
    'Glucose': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    'Ketone': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    'Proteins': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    'Bilirubin': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    'Urobilinogen': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    'Blood': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    'Leucocytes': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    'Ascorbic Acid': ['NORMAL','NEGATIVE','TRACE','+','++','+++','++++'],
    # Blood group / genotype
    'Blood Group': ['A+','A-','B+','B-','O+','O-','AB+','AB-'],
    'Rhesus': ['POSITIVE', 'NEGATIVE'],
    'Genotype': ['AA', 'AS', 'SS', 'AC', 'SC'],
    # Microscopy / qualitative
    'Pus Cells': ['NONE', 'FEW', 'MODERATE', 'MANY'],
    'Epithelial Cell': ['NONE', 'FEW', 'MODERATE', 'MANY'],
    'RBCs': ['NONE', 'FEW', 'MODERATE', 'MANY'],
    'Mucus': ['NONE', 'TRACE', '+', '++', '+++'],
    'Bacteria': ['Not Seen', 'Few', 'Moderate', 'Many'],
    'Yeast Cells': ['Not Seen', 'Seen'],
    'Cast/Crystals': ['Not Seen', 'Seen'],
    'Fungal Elements': ['Not Seen', 'Seen'],
    'Ova': ['Not Seen', 'Seen'],
    'Cyst': ['Not Seen', 'Seen'],
    'Parasites': ['Not Seen', 'Seen'],
    'Other Parasites': ['Not Seen', 'Seen'],
    'Gram Stain': ['No Organisms Seen', 'Gram Positive Cocci', 'Gram Negative Bacilli', 'Gram Positive Bacilli', 'Gram Negative Cocci', 'Mixed Growth'],
    # Noble Cup / Drug Screen
    'AMPHETAMINE (AMP)': ['NEGATIVE', 'POSITIVE'],
    'BARBITURATES (BAR)': ['NEGATIVE', 'POSITIVE'],
    'TRICYCLIC ANTIDEPRESANTS (TCA)': ['NEGATIVE', 'POSITIVE'],
    'COCAINE (COC)': ['NEGATIVE', 'POSITIVE'],
    'BENZODIAZEPINE (BZO)': ['NEGATIVE', 'POSITIVE'],
    'OPIATE (OPI)': ['NEGATIVE', 'POSITIVE'],
    'METHAMPHETAMINE (MET)': ['NEGATIVE', 'POSITIVE'],
    'MARIJUANA (THC)': ['NEGATIVE', 'POSITIVE'],
    'ECSTASY (MDMA)': ['NEGATIVE', 'POSITIVE'],
    'TRAMADOL (TML)': ['NEGATIVE', 'POSITIVE'],
    # Pregnancy
    'hCG': ['NEGATIVE', 'POSITIVE'],
    # H. Pylori
    'H. Pylori AB': ['NEGATIVE', 'POSITIVE'],
    'H. Pylori AG': ['NEGATIVE', 'POSITIVE'],
    # Serology
    'HBsAg': ['Non-Reactive', 'Reactive', 'Indeterminate'],
    'HCV': ['Non-Reactive', 'Reactive', 'Indeterminate'],
    'HIV 1/2': ['Non-Reactive', 'Reactive', 'Indeterminate'],
    'VDRL': ['Non-Reactive', 'Reactive', 'Indeterminate'],
    # Haemoglobin Genotype
    'HB Genotype': ['AA', 'AS', 'SS', 'AC', 'SC'],
}


class Command(BaseCommand):
    help = 'Seed TemplateFieldOption records from the curated field-options map'

    def handle(self, *args, **options):
        created_count = 0
        skipped_count = 0
        template_cache: dict[str, int] = {}  # code -> pk

        for t in LabTemplate.objects.iterator():
            template_cache[t.code] = t.pk

        for field_name, values in _FIELD_OPTIONS.items():
            # Find which template(s) have this field
            candidates = []
            for code, pk in template_cache.items():
                try:
                    tpl = LabTemplate.objects.get(pk=pk)
                    nr = tpl.normal_range or {}
                    if field_name in nr:
                        candidates.append((code, pk))
                except LabTemplate.DoesNotExist:
                    continue

            if not candidates:
                self.stdout.write(self.style.WARNING(
                    f'  ⚠  No template has a field named "{field_name}" – skipped'
                ))
                skipped_count += 1
                continue

            for code, pk in candidates:
                for sort_i, val in enumerate(values):
                    _, created = TemplateFieldOption.objects.update_or_create(
                        template_id=pk,
                        field_name=field_name,
                        value=val,
                        defaults={'sort_order': sort_i},
                    )
                    if created:
                        created_count += 1

        self.stdout.write(self.style.SUCCESS(
            f'\n✓ Field options seeded!\n'
            f'  Created: {created_count}\n'
            f'  Skipped (no matching field): {skipped_count}\n'
        ))
