# Generated manually for adding rejection fields to RadiologyStudy

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('radiology', '0004_rename_radiology_te_category_idx_radiology_t_categor_b51052_idx_and_more'),
    ]

    operations = [
        migrations.AddField(
            model_name='radiologystudy',
            name='rejected_at',
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name='radiologystudy',
            name='rejected_by',
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='rejected_radiology_studies', to='accounts.user'),
        ),
    ]