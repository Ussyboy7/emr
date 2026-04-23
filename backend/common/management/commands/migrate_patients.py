"""
Django management command to migrate ONLY patient registration data between environments.
Safely exports clean patient registration details from staging and imports to production.

Usage:
    # Export from staging
    python manage.py migrate_patients --export --output-file /path/to/patients_export.json

    # Import to production
    python manage.py migrate_patients --import --input-file /path/to/patients_export.json

    # Dry run import
    python manage.py migrate_patients --import --input-file /path/to/patients_export.json --dry-run
"""

import json
import os
from datetime import datetime
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from patients.models import Patient
from organization.models import Clinic
from accounts.models import User


class Command(BaseCommand):
    help = (
        "Migrate patient registration data between environments (staging → production)"
    )

    def add_arguments(self, parser):
        group = parser.add_mutually_exclusive_group(required=True)
        group.add_argument(
            "--export",
            action="store_true",
            help="Export patient registration data from current database",
        )
        group.add_argument(
            "--import",
            action="store_true",
            help="Import patient registration data to current database",
        )

        parser.add_argument(
            "--output-file",
            help="File to save exported data (for --export)",
        )
        parser.add_argument(
            "--input-file",
            help="File to read imported data from (for --import)",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Show what would be imported without actually doing it",
        )
        parser.add_argument(
            "--category",
            choices=["employee", "retiree", "nonnpa", "dependent"],
            help="Filter by patient category",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Limit number of patients to export/import",
        )

    def handle(self, *args, **options):
        if options["export"]:
            self._export_patients(options)
        elif options["import"]:
            self._import_patients(options)

    def _export_patients(self, options):
        """Export patient registration data to JSON file."""
        output_file = options.get("output_file")
        category = options.get("category")
        limit = options.get("limit")

        if not output_file:
            raise CommandError("--output-file is required for export")

        self.stdout.write(f"Exporting patient registration data to {output_file}...")

        # Get patients (only registration data, no related data)
        patients = Patient.objects.filter(is_active=True).select_related(
            "location_clinic", "principal_staff", "created_by"
        )

        if category:
            patients = patients.filter(category=category)

        if limit:
            patients = patients[:limit]

        data = {
            "exported_at": datetime.now().isoformat(),
            "total_patients": patients.count(),
            "category_filter": category,
            "patients": [],
        }

        for patient in patients:
            patient_data = self._serialize_patient(patient)
            data["patients"].append(patient_data)

        # Write to file
        os.makedirs(os.path.dirname(output_file), exist_ok=True)
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Exported {len(data['patients'])} patient registration records to {output_file}"
            )
        )

    def _import_patients(self, options):
        """Import patient registration data from JSON file."""
        input_file = options.get("input_file")
        dry_run = options.get("dry_run")
        category = options.get("category")
        limit = options.get("limit")

        if not input_file:
            raise CommandError("--input-file is required for import")

        if not os.path.exists(input_file):
            raise CommandError(f"Input file {input_file} does not exist")

        # Load data
        with open(input_file, "r", encoding="utf-8") as f:
            data = json.load(f)

        patients_data = data.get("patients", [])

        # Apply filters
        if category:
            patients_data = [p for p in patients_data if p.get("category") == category]

        if limit:
            patients_data = patients_data[:limit]

        total_patients = len(patients_data)

        if dry_run:
            self.stdout.write(
                f"DRY RUN: Would import {total_patients} patient registration records"
            )
            for patient_data in patients_data[:5]:  # Show first 5
                self.stdout.write(
                    f"  - {patient_data.get('patient_id')}: {patient_data.get('first_name')} {patient_data.get('surname')}"
                )
            if total_patients > 5:
                self.stdout.write(f"  ... and {total_patients - 5} more")
            return

        self.stdout.write(f"Importing {total_patients} patient registration records...")

        imported = 0
        skipped = 0
        errors = 0

        with transaction.atomic():
            for patient_data in patients_data:
                try:
                    if self._import_patient(patient_data):
                        imported += 1
                    else:
                        skipped += 1

                except Exception as e:
                    self.stderr.write(
                        f"Error importing patient {patient_data.get('patient_id')}: {e}"
                    )
                    errors += 1

        self.stdout.write(
            self.style.SUCCESS(
                f"✅ Import complete: {imported} imported, {skipped} skipped, {errors} errors"
            )
        )

    def _serialize_patient(self, patient):
        """Serialize patient registration data only (no related data)."""
        return {
            # Basic identification
            "patient_id": patient.patient_id,
            "category": patient.category,
            # Personal details
            "title": patient.title,
            "surname": patient.surname,
            "first_name": patient.first_name,
            "middle_name": patient.middle_name,
            "gender": patient.gender,
            "date_of_birth": patient.date_of_birth.isoformat()
            if patient.date_of_birth
            else None,
            "marital_status": patient.marital_status,
            "religion": patient.religion,
            "tribe": patient.tribe,
            "occupation": patient.occupation,
            # Employment/Organization details
            "personal_number": patient.personal_number,
            "employee_type": patient.employee_type,
            "division": patient.division,
            "location": patient.location,
            "location_clinic_code": patient.location_clinic.code
            if patient.location_clinic
            else None,
            "nonnpa_type": patient.nonnpa_type,
            "dependent_type": patient.dependent_type,
            "principal_staff_patient_id": patient.principal_staff.patient_id
            if patient.principal_staff
            else None,
            # Contact information
            "email": patient.email,
            "phone": patient.phone,
            "state_of_residence": patient.state_of_residence,
            "residential_address": patient.residential_address,
            "state_of_origin": patient.state_of_origin,
            "lga": patient.lga,
            "permanent_address": patient.permanent_address,
            # Medical information (basic)
            "blood_group": patient.blood_group,
            "genotype": patient.genotype,
            "allergies": patient.allergies,
            # Next of kin
            "nok_surname": patient.nok_surname,
            "nok_first_name": patient.nok_first_name,
            "nok_middle_name": patient.nok_middle_name,
            "nok_relationship": patient.nok_relationship,
            "nok_address": patient.nok_address,
            "nok_phone": patient.nok_phone,
            # Metadata
            "is_active": patient.is_active,
            "created_at": patient.created_at.isoformat(),
            "updated_at": patient.updated_at.isoformat(),
        }

    def _import_patient(self, patient_data):
        """Import a single patient registration record. Returns True if imported, False if skipped."""
        patient_id = patient_data["patient_id"]

        # Check if patient already exists
        if Patient.objects.filter(patient_id=patient_id).exists():
            self.stdout.write(f"Skipping existing patient: {patient_id}")
            return False

        try:
            # Create patient with registration data only
            patient = Patient.objects.create(
                patient_id=patient_id,
                category=patient_data["category"],
                # Personal details
                title=patient_data.get("title"),
                surname=patient_data["surname"],
                first_name=patient_data["first_name"],
                middle_name=patient_data.get("middle_name"),
                gender=patient_data["gender"],
                date_of_birth=patient_data.get("date_of_birth"),
                marital_status=patient_data.get("marital_status"),
                religion=patient_data.get("religion"),
                tribe=patient_data.get("tribe"),
                occupation=patient_data.get("occupation"),
                # Employment/Organization details
                personal_number=patient_data.get("personal_number"),
                employee_type=patient_data.get("employee_type"),
                division=patient_data.get("division"),
                location=patient_data.get("location"),
                location_clinic=Clinic.objects.filter(
                    code=patient_data.get("location_clinic_code")
                ).first()
                if patient_data.get("location_clinic_code")
                else None,
                nonnpa_type=patient_data.get("nonnpa_type"),
                dependent_type=patient_data.get("dependent_type"),
                principal_staff=Patient.objects.filter(
                    patient_id=patient_data.get("principal_staff_patient_id")
                ).first()
                if patient_data.get("principal_staff_patient_id")
                else None,
                # Contact information
                email=patient_data.get("email"),
                phone=patient_data.get("phone"),
                state_of_residence=patient_data.get("state_of_residence"),
                residential_address=patient_data.get("residential_address"),
                state_of_origin=patient_data.get("state_of_origin"),
                lga=patient_data.get("lga"),
                permanent_address=patient_data.get("permanent_address"),
                # Medical information (basic)
                blood_group=patient_data.get("blood_group"),
                genotype=patient_data.get("genotype"),
                allergies=patient_data.get("allergies"),
                # Next of kin
                nok_surname=patient_data.get("nok_surname"),
                nok_first_name=patient_data.get("nok_first_name"),
                nok_middle_name=patient_data.get("nok_middle_name"),
                nok_relationship=patient_data.get("nok_relationship"),
                nok_address=patient_data.get("nok_address"),
                nok_phone=patient_data.get("nok_phone"),
                # Status
                is_active=patient_data.get("is_active", True),
            )

            self.stdout.write(
                f"Imported patient: {patient_id} ({patient.get_full_name()})"
            )
            return True

        except Exception as e:
            self.stderr.write(f"Failed to import patient {patient_id}: {e}")
            return False
