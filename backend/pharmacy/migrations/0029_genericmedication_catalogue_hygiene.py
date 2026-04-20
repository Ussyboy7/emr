"""Catalogue hygiene for ``GenericMedication``.

Two changes, both non-destructive on a clean catalogue:

1. Drop the redundant per-column ``db_index`` on ``GenericMedication.name``.
   The model already declares ``models.Index(fields=["name"])`` in
   ``Meta.indexes``, so Django was previously creating two indexes on the
   same column. This migration removes the implicit ``*_name_<hash>_like``
   index that came from ``db_index=True`` while leaving the explicit one in
   place.

2. Add a :class:`~django.db.models.UniqueConstraint` on
   ``(name, strength, dosage_form, route)``. Different strengths/forms/routes
   of the same molecule are legitimately separate rows (e.g. Paracetamol
   500 mg tablet vs 120 mg/5 ml syrup), but two rows with an identical tuple
   are noise that lead to ambiguous prescribing.

A pre-flight audit of the local database showed zero duplicate tuples on
251 active generics before this was introduced, so the new constraint does
not require any data cleanup migration.
"""

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("pharmacy", "0028_prescriptionitem_superseded"),
    ]

    operations = [
        migrations.AlterField(
            model_name="genericmedication",
            name="name",
            field=models.CharField(max_length=200),
        ),
        migrations.AddConstraint(
            model_name="genericmedication",
            constraint=models.UniqueConstraint(
                fields=("name", "strength", "dosage_form", "route"),
                name="uniq_generic_name_strength_form_route",
            ),
        ),
    ]
