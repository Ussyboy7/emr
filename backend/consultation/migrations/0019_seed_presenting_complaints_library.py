from django.db import migrations


def seed_presenting_complaints(apps, schema_editor):
    PresentingComplaintCategory = apps.get_model('consultation', 'PresentingComplaintCategory')
    PresentingComplaint = apps.get_model('consultation', 'PresentingComplaint')

    from consultation.default_presenting_complaints import DEFAULT_PRESENTING_COMPLAINT_LIBRARY

    for category_index, entry in enumerate(DEFAULT_PRESENTING_COMPLAINT_LIBRARY):
        category_name = (entry.get('category') or '').strip()
        if not category_name:
            continue

        category_obj, _ = PresentingComplaintCategory.objects.get_or_create(
            name=category_name,
            defaults={
                'is_active': True,
                'sort_order': category_index,
            },
        )

        if category_obj.sort_order != category_index:
            category_obj.sort_order = category_index
            category_obj.save(update_fields=['sort_order'])

        complaints = entry.get('complaints') or []
        for complaint_index, complaint in enumerate(complaints):
            label = str(complaint or '').strip()
            if not label:
                continue
            normalized = label.lower()

            complaint_obj, created = PresentingComplaint.objects.get_or_create(
                category=category_obj,
                normalized_label=normalized,
                defaults={
                    'label': label,
                    'is_active': True,
                    'sort_order': complaint_index,
                },
            )

            if not created:
                updates = []
                if complaint_obj.label != label:
                    complaint_obj.label = label
                    updates.append('label')
                if complaint_obj.sort_order != complaint_index:
                    complaint_obj.sort_order = complaint_index
                    updates.append('sort_order')
                if updates:
                    complaint_obj.save(update_fields=updates)


def unseed_presenting_complaints(apps, schema_editor):
    PresentingComplaintCategory = apps.get_model('consultation', 'PresentingComplaintCategory')
    PresentingComplaint = apps.get_model('consultation', 'PresentingComplaint')

    from consultation.default_presenting_complaints import DEFAULT_PRESENTING_COMPLAINT_LIBRARY

    category_names = [
        (entry.get('category') or '').strip()
        for entry in DEFAULT_PRESENTING_COMPLAINT_LIBRARY
        if (entry.get('category') or '').strip()
    ]

    complaint_labels = set()
    for entry in DEFAULT_PRESENTING_COMPLAINT_LIBRARY:
        for complaint in entry.get('complaints') or []:
            label = str(complaint or '').strip()
            if label:
                complaint_labels.add(label.lower())

    categories = PresentingComplaintCategory.objects.filter(name__in=category_names)
    PresentingComplaint.objects.filter(
        category__in=categories,
        normalized_label__in=complaint_labels,
    ).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('consultation', '0018_presentingcomplaintcategory_presentingcomplaint_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_presenting_complaints, reverse_code=unseed_presenting_complaints),
    ]
