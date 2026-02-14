from django.db import migrations, models


def merge_findings_impression_into_report(apps, schema_editor):
    RadiologyStudy = apps.get_model('radiology', 'RadiologyStudy')
    RadiologyOrder = apps.get_model('radiology', 'RadiologyOrder')

    for study in RadiologyStudy.objects.all().only('id', 'report', 'findings', 'impression'):
        report = (study.report or '').strip()
        findings = (getattr(study, 'findings', '') or '').strip()
        impression = (getattr(study, 'impression', '') or '').strip()

        if not report and not findings and not impression:
            continue

        merged = report
        if not merged and findings:
            merged = findings
        elif findings and findings not in merged:
            merged = f"{merged}\n\n{findings}".strip()

        if impression:
            if merged:
                merged = f"{merged}\n\nImpression:\n{impression}".strip()
            else:
                merged = f"Impression:\n{impression}".strip()

        if merged != (study.report or ''):
            RadiologyStudy.objects.filter(id=study.id).update(report=merged)

    for order in RadiologyOrder.objects.all().only('id', 'report', 'findings', 'impression'):
        report = (getattr(order, 'report', '') or '').strip()
        findings = (getattr(order, 'findings', '') or '').strip()
        impression = (getattr(order, 'impression', '') or '').strip()

        if not report and not findings and not impression:
            continue

        merged = report
        if not merged and findings:
            merged = findings
        elif findings and findings not in merged:
            merged = f"{merged}\n\n{findings}".strip()

        if impression:
            if merged:
                merged = f"{merged}\n\nImpression:\n{impression}".strip()
            else:
                merged = f"Impression:\n{impression}".strip()

        if merged != (getattr(order, 'report', '') or ''):
            RadiologyOrder.objects.filter(id=order.id).update(report=merged)


class Migration(migrations.Migration):
    dependencies = [
        ('radiology', '0008_remove_contrast_required_add_provisional_diagnosis_lmp'),
    ]

    operations = [
        migrations.AlterField(
            model_name='radiologystudy',
            name='report',
            field=models.TextField(blank=True, help_text='Radiology report text'),
        ),
        migrations.AddField(
            model_name='radiologyorder',
            name='report',
            field=models.TextField(blank=True, help_text='Radiology report text'),
        ),
        migrations.RunPython(merge_findings_impression_into_report, migrations.RunPython.noop),
        migrations.RemoveField(
            model_name='radiologystudy',
            name='findings',
        ),
        migrations.RemoveField(
            model_name='radiologystudy',
            name='impression',
        ),
        migrations.RemoveField(
            model_name='radiologyorder',
            name='findings',
        ),
        migrations.RemoveField(
            model_name='radiologyorder',
            name='impression',
        ),
    ]
