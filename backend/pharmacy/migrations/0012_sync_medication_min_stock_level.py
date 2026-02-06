from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('pharmacy', '0011_medication_uniq_brand_per_generic'),
    ]

    operations = [
        migrations.SeparateDatabaseAndState(
            database_operations=[
                migrations.RunSQL(
                    sql="""
                        ALTER TABLE medications
                        ALTER COLUMN min_stock_level SET DEFAULT 0;
                        UPDATE medications SET min_stock_level = 0 WHERE min_stock_level IS NULL;
                    """,
                    reverse_sql="""
                        ALTER TABLE medications
                        ALTER COLUMN min_stock_level DROP DEFAULT;
                    """,
                )
            ],
            state_operations=[
                migrations.AddField(
                    model_name='medication',
                    name='min_stock_level',
                    field=models.DecimalField(decimal_places=2, default=0, max_digits=10),
                ),
            ],
        ),
    ]

