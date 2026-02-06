from collections import Counter

from django.db import migrations


def backfill_generic_category(apps, schema_editor):
    GenericMedication = apps.get_model('pharmacy', 'GenericMedication')
    Medication = apps.get_model('pharmacy', 'Medication')

    generics = GenericMedication.objects.all().only('id', 'category')
    for generic in generics:
        if getattr(generic, 'category', ''):
            continue
        categories = (
            Medication.objects.filter(generic_id=generic.id)
            .exclude(category__isnull=True)
            .exclude(category__exact='')
            .values_list('category', flat=True)
        )
        counts = Counter(list(categories))
        if not counts:
            continue
        generic.category = counts.most_common(1)[0][0]
        generic.save(update_fields=['category'])


def reverse_backfill_generic_category(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('pharmacy', '0013_genericmedication_category'),
    ]

    operations = [
        migrations.RunPython(backfill_generic_category, reverse_backfill_generic_category),
    ]

