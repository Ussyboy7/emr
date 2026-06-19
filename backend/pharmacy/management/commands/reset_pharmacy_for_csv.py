from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.db.models import Count
import csv
import os
from pharmacy.models import (
    GenericMedication,
    Medication,
    MedicationInventory,
    PrescriptionItem,
    Dispense,
    StockRequest,
    StockRequestItem,
    StockIssue,
    StockIssueLine,
    HodStockIssue,
)
from django.db import connection

class Command(BaseCommand):
    help = "Reset pharmacy data (Generics, Brands, Inventory, Store/Dispensary) and optionally import generics from CSV"

    def add_arguments(self, parser):
        parser.add_argument(
            "--csv",
            type=str,
            help="Path to GENERIC_MEDICATIONS.csv for import after reset",
        )
        parser.add_argument(
            "--purge-all",
            action="store_true",
            help="Purge dependent records (dispenses, stock requests/issues, prescription items) to allow full reset",
        )

    def handle(self, *args, **options):
        csv_path = options.get("csv")
        purge_all = options.get("purge_all", False)

        self.stdout.write(self.style.WARNING("Starting pharmacy reset..."))
        self._purge_data(purge_all=purge_all)
        if csv_path:
            self._import_generics(csv_path)
        self.stdout.write(self.style.SUCCESS("Pharmacy reset completed successfully"))

    def _purge_data(self, purge_all: bool):
        self.stdout.write("\n--- Purging Data ---")

        if purge_all:
            # Try raw TRUNCATE CASCADE first to avoid FK conflicts due to legacy table names
            self._force_truncate([
                "pharmacy_stock_issue_lines",
                "stock_issue_lines",
                "pharmacy_stock_issues",
                "stock_issues",
                "pharmacy_stock_request_items",
                "stock_request_items",
                "pharmacy_stock_requests",
                "stock_requests",
                "dispenses",
            ])

            # Delete dependent records first to avoid FK PROTECT/CASCADE issues
            self.stdout.write("Deleting Dispenses...")
            Dispense.objects.all().delete()

            self.stdout.write("Deleting HodStockIssues...")
            HodStockIssue.objects.all().delete()

            self.stdout.write("Deleting StockIssueLines...")
            StockIssueLine.objects.all().delete()
            self.stdout.write(f"Remaining StockIssueLines: {StockIssueLine.objects.count()}")
            self.stdout.write("Deleting StockIssues...")
            StockIssue.objects.all().delete()

            self.stdout.write("Deleting StockRequestItems...")
            StockRequestItem.objects.all().delete()
            self.stdout.write("Deleting StockRequests...")
            StockRequest.objects.all().delete()

            self.stdout.write("Deleting PrescriptionItems...")
            PrescriptionItem.objects.all().delete()

        # Clear inventory (Store and Dispensary)
        self._force_truncate(["medication_inventory"])
        self.stdout.write("Deleting MedicationInventory (Store/Dispensary)...")
        MedicationInventory.objects.all().delete()
        self.stdout.write(f"Remaining MedicationInventory: {MedicationInventory.objects.count()}")

        # Clear brand master list
        self._force_truncate(["medications"])
        self.stdout.write("Deleting Medications (Brands)...")
        Medication.objects.all().delete()
        self.stdout.write(f"Remaining Medications: {Medication.objects.count()}")

        # Clear generics
        self._force_truncate(["generic_medications"])
        self.stdout.write("Deleting GenericMedications...")
        GenericMedication.objects.all().delete()
        self.stdout.write(f"Remaining GenericMedications: {GenericMedication.objects.count()}")

        self.stdout.write(self.style.SUCCESS("Purge completed"))

    def _force_truncate(self, table_names):
        """Best-effort TRUNCATE CASCADE for listed tables, ignoring missing ones."""
        with connection.cursor() as cursor:
            for table in table_names:
                try:
                    cursor.execute(f'TRUNCATE TABLE "{table}" CASCADE;')
                    self.stdout.write(f"Truncated {table} (CASCADE)")
                except Exception as e:
                    # Ignore missing tables or non-critical errors
                    self.stdout.write(f"Skip truncate {table}: {e}")

    def _import_generics(self, csv_path: str):
        self.stdout.write("\n--- Importing Generics from CSV ---")

        def first_option(value: str) -> str:
            raw = (value or "").strip()
            if not raw or raw in {"-", "N/A", "n/a"}:
                return ""
            return raw.replace(";", ",").split(",")[0].strip()

        def infer_route(dosage_form: str) -> str:
            f = (dosage_form or "").strip().lower()
            if not f:
                return ""
            if any(k in f for k in ["tablet", "capsule", "syrup", "suspension", "powder", "sachet", "solution"]):
                return "Oral"
            if any(k in f for k in ["injection", "vial", "ampoule", "infusion"]):
                return "IV"
            if any(k in f for k in ["inhaler", "nebul"]):
                return "Inhalation"
            if any(k in f for k in ["cream", "ointment", "gel", "lotion"]):
                return "Topical"
            if "eye" in f or "ophthalmic" in f:
                return "Ophthalmic"
            if "ear" in f or "otic" in f:
                return "Otic"
            if "nasal" in f:
                return "Nasal"
            if "suppository" in f:
                return "Rectal"
            return ""

        # Resolve absolute path inside container or host
        path = os.path.abspath(csv_path)
        if not os.path.exists(path):
            raise CommandError(f"CSV file not found: {path}")

        created = 0
        skipped = 0

        with open(path, "r", encoding="utf-8-sig") as f:
            reader = csv.DictReader(f)
            required_cols = [
                "Generic_ID",
                "Generic_Name",
                "Active_Ingredient",
                "Category",
                "Strengths_Available",
                "Dosage_Forms",
                "Route",
            ]
            for col in required_cols:
                if col not in reader.fieldnames:
                    raise CommandError(f"CSV missing required column: {col}")

            for row in reader:
                generic_id = (row.get("Generic_ID") or "").strip()
                name = (row.get("Generic_Name") or "").strip()
                active_ingredient = (row.get("Active_Ingredient") or "").strip()
                category = (row.get("Category") or "").strip() or "Other"
                strength = first_option(row.get("Strengths_Available") or "")
                dosage_form = first_option(row.get("Dosage_Forms") or "")
                route = first_option(row.get("Route") or "") or infer_route(dosage_form) or "Oral"

                if not name:
                    skipped += 1
                    continue
                # Enforce dosage form (required for generic variant identity)
                if not dosage_form:
                    skipped += 1
                    continue

                # Use Generic_ID as atc_code surrogate to keep uniqueness stable
                atc_code = generic_id or None

                try:
                    GenericMedication.objects.create(
                        name=name,
                        active_ingredient=active_ingredient,
                        category=category,
                        strength=strength,
                        dosage_form=dosage_form,
                        route=route,
                        atc_code=atc_code,
                        is_active=True,
                    )
                    created += 1
                except Exception as e:
                    # If unique atc_code collision, fall back without atc_code
                    try:
                        GenericMedication.objects.create(
                            name=name,
                            active_ingredient=active_ingredient,
                            category=category,
                            strength=strength,
                            dosage_form=dosage_form,
                            route=route,
                            is_active=True,
                        )
                        created += 1
                    except Exception:
                        skipped += 1
                        self.stdout.write(f"Skipped '{name}': {e}")

        total = GenericMedication.objects.count()
        self.stdout.write(
            self.style.SUCCESS(
                f"Imported {created} generics (skipped {skipped}). Total generics: {total}"
            )
        )
