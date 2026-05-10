# Add address + contact_person_title to LabPartner so referral letters and
# responsibility forms can include the partner's full postal address and
# proper addressee role (e.g. "The Chief Executive Officer").

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ("laboratory", "0017_labreferraldispatch"),
    ]

    operations = [
        migrations.AddField(
            model_name="labpartner",
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
            model_name="labpartner",
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
    ]
