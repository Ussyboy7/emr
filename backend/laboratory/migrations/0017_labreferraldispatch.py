# Add LabReferralDispatch — order-level, batch outbound dispatches to external labs
# (replaces the old per-LabResult referral_letter / test_order generation flow).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("laboratory", "0016_rename_lab_orders_source__e9899c_idx_lab_orders_source__e9248c_idx"),
    ]

    operations = [
        migrations.CreateModel(
            name="LabReferralDispatch",
            fields=[
                (
                    "id",
                    models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name="ID"),
                ),
                ("dispatch_id", models.CharField(db_index=True, max_length=50, unique=True)),
                ("partner_name", models.CharField(max_length=200)),
                (
                    "status",
                    models.CharField(
                        choices=[
                            ("issued", "Issued"),
                            ("cancelled", "Cancelled"),
                            ("superseded", "Superseded"),
                        ],
                        db_index=True,
                        default="issued",
                        max_length=20,
                    ),
                ),
                ("cancellation_reason", models.TextField(blank=True)),
                ("notes", models.TextField(blank=True)),
                ("issued_at", models.DateTimeField(auto_now_add=True)),
                ("cancelled_at", models.DateTimeField(blank=True, null=True)),
                ("referral_letter_printed_at", models.DateTimeField(blank=True, null=True)),
                ("responsibility_form_printed_at", models.DateTimeField(blank=True, null=True)),
                (
                    "order",
                    models.ForeignKey(
                        on_delete=django.db.models.deletion.CASCADE,
                        related_name="dispatches",
                        to="laboratory.laborder",
                    ),
                ),
                (
                    "partner",
                    models.ForeignKey(
                        blank=True,
                        help_text="External lab the tests were sent to. May be null for ad-hoc 'Other' partners.",
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="dispatches",
                        to="laboratory.labpartner",
                    ),
                ),
                (
                    "tests",
                    models.ManyToManyField(
                        help_text="Tests included in this dispatch.",
                        related_name="dispatches",
                        to="laboratory.labtest",
                    ),
                ),
                (
                    "superseded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="supersedes",
                        to="laboratory.labreferraldispatch",
                    ),
                ),
                (
                    "issued_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issued_lab_dispatches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "cancelled_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="cancelled_lab_dispatches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Lab referral dispatch",
                "verbose_name_plural": "Lab referral dispatches",
                "db_table": "lab_referral_dispatches",
                "ordering": ["-issued_at"],
                "indexes": [
                    models.Index(fields=["order", "-issued_at"], name="lab_referra_order_i_a4aac7_idx"),
                    models.Index(fields=["status"], name="lab_referra_status_580c1c_idx"),
                ],
            },
        ),
    ]
