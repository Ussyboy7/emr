from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ('pharmacy', '0012_sync_medication_min_stock_level'),
    ]

    operations = [
        migrations.AddField(
            model_name='genericmedication',
            name='category',
            field=models.CharField(blank=True, max_length=100),
        ),
    ]

