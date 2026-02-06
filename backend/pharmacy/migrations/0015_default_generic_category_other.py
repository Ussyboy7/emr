from django.db import migrations, models


def set_blank_categories(apps, schema_editor):
    GenericMedication = apps.get_model('pharmacy', 'GenericMedication')
    GenericMedication.objects.filter(category__isnull=True).update(category='Other')
    GenericMedication.objects.filter(category__exact='').update(category='Other')


def reverse_set_blank_categories(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ('pharmacy', '0014_backfill_generic_category'),
    ]

    operations = [
        migrations.AlterField(
            model_name='genericmedication',
            name='category',
            field=models.CharField(blank=True, default='Other', max_length=100),
        ),
        migrations.RunPython(set_blank_categories, reverse_set_blank_categories),
    ]

