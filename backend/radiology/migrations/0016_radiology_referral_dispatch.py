# Add outsourced-radiology referral dispatch:
#   * Extend `ImagingPartner` with `address` + `contact_person_title` so referral
#     letters and responsibility forms can include the partner's full postal
#     address and proper addressee role (mirrors `LabPartner` since lab
#     migration 0018).
#   * Create `RadiologyReferralDispatch` — order-level, batch outbound dispatches
#     to external imaging centers, mirroring `LabReferralDispatch`. Includes
#     `partner_address_snapshot` from the start (we don't need a separate
#     backfill migration since there are no existing dispatches yet).

from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        (
            "radiology",
            "0015_rename_radiology_o_source__94b0ef_idx_radiology_o_source__0107cb_idx",
        ),
    ]

    operations = [
        migrations.AddField(
            model_name="imagingpartner",
            name="address",
            field=models.TextField(
                blank=True,
                help_text=(
                    "Multi-line postal address printed on referral letters and "
                    "responsibility forms (e.g. street, area, city)."
                ),
            ),
        ),
        migrations.AddField(
            model_name="imagingpartner",
            name="contact_person_title",
            field=models.CharField(
                blank=True,
                default="The Medical Director",
                help_text=(
                    "Addressee role used in the 'To:' block on letters "
                    "(e.g. 'The Medical Director', 'The Chief Executive Officer')."
                ),
                max_length=100,
            ),
        ),
        migrations.CreateModel(
            name="RadiologyReferralDispatch",
            fields=[
                (
                    "id",
                    models.BigAutoField(
                        auto_created=True,
                        primary_key=True,
                        serialize=False,
                        verbose_name="ID",
                    ),
                ),
                ("dispatch_id", models.CharField(db_index=True, max_length=50, unique=True)),
                ("partner_name", models.CharField(max_length=200)),
                ("partner_address_snapshot", models.TextField(blank=True)),
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
                        to="radiology.radiologyorder",
                    ),
                ),
                (
                    "partner",
                    models.ForeignKey(
                        blank=True,
                        help_text=(
                            "External imaging center the studies were sent to. "
                            "May be null for ad-hoc 'Other' partners."
                        ),
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="dispatches",
                        to="radiology.imagingpartner",
                    ),
                ),
                (
                    "studies",
                    models.ManyToManyField(
                        help_text="Studies included in this dispatch.",
                        related_name="dispatches",
                        to="radiology.radiologystudy",
                    ),
                ),
                (
                    "superseded_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="supersedes",
                        to="radiology.radiologyreferraldispatch",
                    ),
                ),
                (
                    "issued_by",
                    models.ForeignKey(
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="issued_radiology_dispatches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
                (
                    "cancelled_by",
                    models.ForeignKey(
                        blank=True,
                        null=True,
                        on_delete=django.db.models.deletion.SET_NULL,
                        related_name="cancelled_radiology_dispatches",
                        to=settings.AUTH_USER_MODEL,
                    ),
                ),
            ],
            options={
                "verbose_name": "Radiology referral dispatch",
                "verbose_name_plural": "Radiology referral dispatches",
                "db_table": "radiology_referral_dispatches",
                "ordering": ["-issued_at"],
                "indexes": [
                    models.Index(
                        fields=["order", "-issued_at"],
                        name="radiology_r_order_i_7acfa1_idx",
                    ),
                    models.Index(
                        fields=["status"],
                        name="radiology_r_status_5e92b8_idx",
                    ),
                ],
            },
        ),
    ]
