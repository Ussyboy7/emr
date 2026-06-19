from django.db import migrations, models
import django.core.validators
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0001_initial"),
        ("organization", "0001_initial"),
        ("pharmacy", "0033_dispensary_receipt_line_location_clinic"),
    ]

    operations = [
        migrations.CreateModel(
            name="HodStockIssue",
            fields=[
                ("id", models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID")),
                ("issue_id", models.CharField(db_index=True, max_length=50, unique=True)),
                (
                    "quantity",
                    models.DecimalField(
                        decimal_places=2,
                        max_digits=10,
                        validators=[django.core.validators.MinValueValidator(0)],
                    ),
                ),
                ("unit", models.CharField(max_length=50)),
                ("batch_number", models.CharField(blank=True, max_length=100)),
                ("patient_name", models.CharField(blank=True, max_length=200)),
                ("patient_mrn", models.CharField(blank=True, max_length=100)),
                ("reason", models.CharField(blank=True, max_length=200)),
                ("notes", models.TextField(blank=True)),
                ("issued_at", models.DateTimeField(auto_now_add=True)),
                (
                    "inventory_item",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="hod_stock_issues",
                        to="pharmacy.medicationinventory",
                    ),
                ),
                (
                    "issued_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="hod_stock_issues",
                        to="accounts.user",
                    ),
                ),
                (
                    "location_clinic",
                    models.ForeignKey(
                        blank=True,
                        help_text="Care facility this HOD issue belongs to",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="hod_stock_issues",
                        to="organization.clinic",
                    ),
                ),
                (
                    "medication",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.PROTECT,
                        related_name="hod_stock_issues",
                        to="pharmacy.medication",
                    ),
                ),
            ],
            options={
                "db_table": "hod_stock_issues",
                "ordering": ["-issued_at"],
                "indexes": [
                    models.Index(fields=["issue_id"], name="hod_stock_i_issue_i_6f0f0d_idx"),
                    models.Index(fields=["-issued_at"], name="hod_stock_i_issued__8a2f1e_idx"),
                    models.Index(fields=["medication"], name="hod_stock_i_medicat_0c4b2a_idx"),
                ],
            },
        ),
    ]
