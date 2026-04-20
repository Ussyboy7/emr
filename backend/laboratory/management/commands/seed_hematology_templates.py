from django.core.management.base import BaseCommand
from laboratory.models import LabTemplate
import json

HEMATOLOGY_TEMPLATE = {
    "name": "Complete Blood Count (CBC)",
    "code": "HEMATOLOGY-CBC",
    "sample_type": "whole-blood",
    "category": "Hematology",
    "description": "Complete Blood Count with 5-part differential analysis",
    "turnaround_time": "30 minutes",
    "normal_range": {
        "wbc": {
            "min": 4.0,
            "max": 11.0,
            "unit": "10^9/L",
            "critical_low": 2.0,
            "critical_high": 30.0,
        },
        "rbc": {
            "min": 4.2,
            "max": 5.4,
            "unit": "10^12/L",
            "critical_low": 2.0,
            "critical_high": 7.0,
        },
        "hgb": {
            "min": 12.0,
            "max": 16.0,
            "unit": "g/dL",
            "critical_low": 6.0,
            "critical_high": 20.0,
        },
        "hct": {
            "min": 36.0,
            "max": 46.0,
            "unit": "%",
            "critical_low": 20.0,
            "critical_high": 60.0,
        },
        "mcv": {"min": 80.0, "max": 100.0, "unit": "fL"},
        "mch": {"min": 27.0, "max": 32.0, "unit": "pg"},
        "mchc": {"min": 32.0, "max": 36.0, "unit": "g/dL"},
        "rdw": {"min": 11.5, "max": 14.5, "unit": "%"},
        "plt": {
            "min": 150.0,
            "max": 450.0,
            "unit": "10^9/L",
            "critical_low": 20.0,
            "critical_high": 1000.0,
        },
        "neutrophils": {"min": 50.0, "max": 70.0, "unit": "%", "critical_low": 10.0},
        "lymphocytes": {"min": 20.0, "max": 40.0, "unit": "%", "critical_low": 10.0},
        "monocytes": {"min": 2.0, "max": 8.0, "unit": "%"},
        "eosinophils": {"min": 1.0, "max": 4.0, "unit": "%", "critical_high": 20.0},
        "basophils": {"min": 0.0, "max": 1.0, "unit": "%"},
    },
    "is_active": True,
}

DIFFERENTIAL_TEMPLATE = {
    "name": "White Blood Cell Differential",
    "code": "HEMATOLOGY-DIFF",
    "sample_type": "whole-blood",
    "category": "Hematology",
    "description": "5-part white blood cell differential count",
    "turnaround_time": "20 minutes",
    "normal_range": {
        "neutrophils": {"min": 50.0, "max": 70.0, "unit": "%", "critical_low": 10.0},
        "lymphocytes": {"min": 20.0, "max": 40.0, "unit": "%", "critical_low": 10.0},
        "monocytes": {"min": 2.0, "max": 8.0, "unit": "%"},
        "eosinophils": {"min": 1.0, "max": 4.0, "unit": "%", "critical_high": 20.0},
        "basophils": {"min": 0.0, "max": 1.0, "unit": "%"},
    },
    "is_active": True,
}


class Command(BaseCommand):
    help = "Seed hematology lab templates for URIT 5160 integration"

    def handle(self, *args, **options):
        self.stdout.write(self.style.SUCCESS("Seeding hematology lab templates..."))

        # Create CBC template
        cbc_template, cbc_created = LabTemplate.objects.get_or_create(
            code=HEMATOLOGY_TEMPLATE["code"], defaults=HEMATOLOGY_TEMPLATE
        )

        if cbc_created:
            self.stdout.write(
                self.style.SUCCESS(f"Created CBC template: {cbc_template.name}")
            )
        else:
            # Update existing template
            for key, value in HEMATOLOGY_TEMPLATE.items():
                setattr(cbc_template, key, value)
            cbc_template.save()
            self.stdout.write(
                self.style.WARNING(
                    f"Updated existing CBC template: {cbc_template.name}"
                )
            )

        # Create Differential template
        diff_template, diff_created = LabTemplate.objects.get_or_create(
            code=DIFFERENTIAL_TEMPLATE["code"], defaults=DIFFERENTIAL_TEMPLATE
        )

        if diff_created:
            self.stdout.write(
                self.style.SUCCESS(
                    f"Created Differential template: {diff_template.name}"
                )
            )
        else:
            # Update existing template
            for key, value in DIFFERENTIAL_TEMPLATE.items():
                setattr(diff_template, key, value)
            diff_template.save()
            self.stdout.write(
                self.style.WARNING(
                    f"Updated existing Differential template: {diff_template.name}"
                )
            )

        self.stdout.write(
            self.style.SUCCESS("Hematology templates seeded successfully!")
        )
        self.stdout.write(
            self.style.INFO(
                "You can now configure the URIT 5160 analyzer to send results to the EMR system."
            )
        )
