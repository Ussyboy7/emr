from django.db import migrations, models


def backfill_has_results(apps, schema_editor):
    if schema_editor.connection.vendor != "postgresql":
        return
    schema_editor.execute(
        """
        UPDATE lab_tests
        SET has_results = TRUE
        WHERE (result_file IS NOT NULL AND BTRIM(result_file) <> '')
           OR jsonb_path_exists(COALESCE(results, '{}'::jsonb), '$.* ? (@ != null && @ != "")')
        """
    )


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0031_merge_pending_same_visit_lab_orders"),
    ]

    operations = [
        migrations.AddField(
            model_name="labtest",
            name="has_results",
            field=models.BooleanField(
                db_index=True,
                default=False,
                help_text="True when structured results or a result file are present.",
            ),
        ),
        migrations.RunPython(backfill_has_results, migrations.RunPython.noop),
    ]
