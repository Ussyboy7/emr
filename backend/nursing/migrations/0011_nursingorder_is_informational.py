from django.db import migrations, models


def backfill_informational_orders(apps, schema_editor):
    NursingOrder = apps.get_model('nursing', 'NursingOrder')
    NursingOrder.objects.filter(order_type__iexact='observation admission').update(
        is_informational=True,
    )
    for order in NursingOrder.objects.filter(order_type__iexact='ward instruction').only(
        'id', 'description'
    ):
        desc = (order.description or '').lower()
        if (
            'observation admission' in desc
            or 'ward admission' in desc
            or 'day care' in desc
            or ('presenting complaint' in desc and 'diagnos' in desc)
        ):
            NursingOrder.objects.filter(pk=order.pk).update(is_informational=True)


class Migration(migrations.Migration):

    dependencies = [
        ('nursing', '0010_alter_procedure_procedure_type'),
    ]

    operations = [
        migrations.AddField(
            model_name='nursingorder',
            name='is_informational',
            field=models.BooleanField(
                default=False,
                help_text='Consultation handoff / observation admission context — not a nursing task',
            ),
        ),
        migrations.RunPython(backfill_informational_orders, migrations.RunPython.noop),
    ]
