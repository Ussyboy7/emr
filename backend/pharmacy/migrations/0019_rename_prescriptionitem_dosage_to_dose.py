from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0018_alter_prescriptionitem_generic'),
    ]

    operations = [
        migrations.RenameField(
            model_name='prescriptionitem',
            old_name='dosage',
            new_name='dose',
        ),
    ]

