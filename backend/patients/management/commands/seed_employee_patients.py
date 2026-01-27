"""
Seed employee patients from:
  - CSV: columns Personal Number, Full Name, Surname, Middle name, First name.
  - Or built-in list if no CSV.

Full Name format: "SURNAME, TITLE FIRSTNAME [MIDDLENAME]".
Gender from title: Mr/Mallam/Alhaji/Sir->male; Mrs/Miss/Ms/Hajia/Lady->female; else random.

Usage:
  python manage.py seed_employee_patients --file /path/to/emr_employees_data.csv
  python manage.py seed_employee_patients   # uses patients/seed_data/emr_employees_data.csv if present
  python manage.py seed_employee_patients --file /path/to/file.csv --dry-run --limit 10
  python manage.py seed_employee_patients --file /path/to/file.csv --reset
"""
import csv
import random
from datetime import date, timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.contrib.auth import get_user_model

import patients
from patients.models import Patient
from patients.seed_data.employee_names import (
    EMPLOYEE_SEED_NAMES,
    TITLE_TO_MODEL,
    TITLE_TO_GENDER,
)

User = get_user_model()

DEFAULT_CSV = Path(patients.__file__).resolve().parent / "seed_data" / "emr_employees_data.csv"


# CSV columns: 0=Personal Number, 1=Full Name, 2=Surname, 3=Middle name, 4=First name (Title First), 5=First name (clean)
# Col 2 often has trailing comma; col 4 can be "Mrs. OYEAMA"; col 5 is clean first or #VALUE!

def _clean(s):
    if s is None:
        return ""
    s = str(s).strip()
    if s.upper() == "#VALUE!" or s == "":
        return ""
    return s


def _parse_full_name(full):
    """Parse 'SURNAME, TITLE FIRSTNAME [MIDDLENAME]' -> (surname, title_raw, first, middle)."""
    full = (full or "").strip()
    if ", " not in full:
        return ("", "", "", "")
    surname, rest = full.split(", ", 1)
    surname = surname.strip()
    rest = rest.strip()
    parts = rest.split()
    if not parts:
        return (surname, "", "", "")
    title_raw = parts[0].rstrip(".").lower()
    if len(parts) == 1:
        return (surname, title_raw, "", "")
    if len(parts) == 2:
        return (surname, title_raw, parts[1], "")
    return (surname, title_raw, parts[1], " ".join(parts[2:]))


def _first_from_col4(s):
    """Col 4 is 'Title Firstname' (e.g. 'Mrs. OYEAMA') or 'Mr.' alone. Return first name or ''."""
    s = _clean(s)
    if not s:
        return ""
    parts = s.split()
    if not parts:
        return ""
    last = parts[-1].rstrip(".").lower()
    titles = {"mr", "mrs", "ms", "miss", "dr", "prof", "chief", "alhaji", "hajia", "mallam", "sir", "lady"}
    if last in titles:
        return ""  # "Mr." or "JEGA, Mrs." -> no first name here
    return parts[-1]  # "Mrs. OYEAMA" -> OYEAMA


def _load_csv(path):
    """
    Load and clean CSV. Columns: 0=Personal Number, 1=Full Name, 2=Surname, 3=Middle, 4=First (Title+First), 5=First (clean).
    - Surname: from Full Name; fallback col 2 with trailing comma stripped.
    - First: from Full Name; else col 5; else last word of col 4; else col 3 (Excel puts first in Middle when no middle).
    - Middle: from Full Name; else col 3, but not if we used col 3 as first.
    """
    path = Path(path)
    if not path.exists():
        raise CommandError(f"CSV not found: {path}")
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        next(reader, None)  # skip header
        for row in reader:
            if len(row) < 2:
                continue
            pn = _clean(row[0])
            if not pn:
                continue
            full = _clean(row[1])
            surname, title_raw, first, middle = _parse_full_name(full)

            # Surname: fallback col 2, strip trailing comma
            if not surname and len(row) > 2:
                surname = _clean(row[2]).rstrip(",").strip()

            # First: try col 5 (clean), then last word of col 4 ("Mrs. OYEAMA" -> OYEAMA), then col 3
            if not first and len(row) > 5:
                first = _clean(row[5])
            if not first and len(row) > 4:
                first = _first_from_col4(row[4])
            if not first and len(row) > 3:
                first = _clean(row[3])

            # Middle: from parse, or col 3 only if we didn't use it as first
            if not middle and len(row) > 3:
                c3 = _clean(row[3])
                if c3 and c3 != first:
                    middle = c3

            yield {
                "personal_number": pn,
                "surname": surname,
                "first_name": first,
                "middle_name": middle,
                "title_raw": title_raw,
            }


class Command(BaseCommand):
    help = "Seed employee patients from CSV (Personal Number, Full Name, ...) or built-in list."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file",
            "-f",
            type=str,
            default=None,
            help="Path to CSV. Default: patients/seed_data/emr_employees_data.csv",
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Print what would be created without writing.",
        )
        parser.add_argument(
            "--limit",
            type=int,
            default=None,
            help="Max number of employees to create (default: all).",
        )
        parser.add_argument(
            "--reset",
            action="store_true",
            help="CSV: delete employees with these personal_numbers before re-import. Built-in: delete SEED*.",
        )
        parser.add_argument(
            "--personal-number-prefix",
            type=str,
            default="SEED",
            help="For built-in list only; default SEED.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options["limit"]
        reset = options["reset"]
        prefix = (options["personal_number_prefix"] or "SEED").strip().upper()

        # Resolve CSV path
        csv_path = Path(options["file"]) if options.get("file") else DEFAULT_CSV
        use_csv = csv_path.exists()

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN – no changes will be saved."))

        with transaction.atomic():
            if use_csv:
                rows = list(_load_csv(csv_path))
                if limit and limit > 0:
                    rows = rows[:limit]
                self.stdout.write(f"Loaded {len(rows)} rows from CSV.")
                if reset and not dry_run:
                    pn_set = [r["personal_number"] for r in rows if r.get("personal_number")]
                    deleted, _ = Patient.objects.filter(
                        category="employee", personal_number__in=pn_set
                    ).delete()
                    self.stdout.write(self.style.WARNING(f"Removed {deleted} existing employee(s) for re-import."))
                elif reset and dry_run:
                    pn_set = [r["personal_number"] for r in rows if r.get("personal_number")]
                    cnt = Patient.objects.filter(category="employee", personal_number__in=pn_set).count()
                    self.stdout.write(self.style.WARNING(f"Would remove {cnt} existing employee(s)."))
                created, skipped = self._seed_from_rows(rows, dry_run, from_csv=True)
            else:
                if options.get("file"):
                    raise CommandError(f"CSV not found: {csv_path}")
                # Built-in
                if reset and not dry_run:
                    deleted, _ = Patient.objects.filter(
                        category="employee", personal_number__startswith=prefix
                    ).delete()
                    self.stdout.write(self.style.WARNING(f"Removed {deleted} existing SEED* employee(s)."))
                elif reset and dry_run:
                    cnt = Patient.objects.filter(
                        category="employee", personal_number__startswith=prefix
                    ).count()
                    self.stdout.write(self.style.WARNING(f"Would remove {cnt} SEED* employee(s)."))
                created, skipped = self._seed_from_builtin(dry_run, limit, prefix)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete: {created} created, {skipped} skipped (duplicate, empty name, or invalid)."
            )
        )

    def _seed_from_rows(self, rows, dry_run, from_csv=True):
        created_by = (
            User.objects.filter(is_superuser=True).first()
            or User.objects.filter(is_staff=True).first()
        )
        today = date.today()
        max_birth = today - timedelta(days=365 * 25)
        min_birth = today - timedelta(days=365 * 58)
        created = 0
        skipped = 0

        for r in rows:
            pn = r.get("personal_number") or ""
            surname = (r.get("surname") or "").strip()
            first = (r.get("first_name") or "").strip()
            middle = (r.get("middle_name") or "").strip()
            title_raw = (r.get("title_raw") or "").strip().lower()

            if not pn or not surname:
                skipped += 1
                continue

            model_title = TITLE_TO_MODEL.get(title_raw, "")
            gender = TITLE_TO_GENDER.get(title_raw)
            if gender is None:
                gender = random.choice(["male", "female"])

            if Patient.objects.filter(category="employee", personal_number=pn).exists():
                skipped += 1
                continue

            if not first:
                first = middle
                middle = ""

            dob = min_birth + timedelta(days=random.randint(0, (max_birth - min_birth).days))

            if dry_run:
                self.stdout.write(f"  [DRY] {pn} {model_title or '-'} {first} {middle} {surname} gender={gender}")
                created += 1
                continue

            try:
                Patient.objects.create(
                    category="employee",
                    personal_number=pn,
                    title=model_title if model_title else "",
                    surname=surname,
                    first_name=first or "-",
                    middle_name=middle,
                    gender=gender,
                    date_of_birth=dob,
                    created_by=created_by,
                )
                created += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed {pn} {surname}: {e}"))
                skipped += 1

        return created, skipped

    def _seed_from_builtin(self, dry_run, limit, personal_number_prefix):
        created_by = (
            User.objects.filter(is_superuser=True).first()
            or User.objects.filter(is_staff=True).first()
        )
        existing = set(
            Patient.objects.filter(
                category="employee",
                personal_number__startswith=personal_number_prefix,
            ).values_list("personal_number", flat=True)
        )
        today = date.today()
        max_birth = today - timedelta(days=365 * 25)
        min_birth = today - timedelta(days=365 * 58)
        to_process = EMPLOYEE_SEED_NAMES
        if limit and limit > 0:
            to_process = to_process[:limit]
        created = 0
        skipped = 0
        seq = 0

        for row in to_process:
            title_raw = (row.get("title") or "").strip().rstrip(".").lower()
            first = (row.get("first_name") or "").strip()
            middle = (row.get("middle_name") or "").strip()
            surname = (row.get("surname") or "").strip()

            if not first or not surname:
                skipped += 1
                continue

            model_title = TITLE_TO_MODEL.get(title_raw, "")
            gender = TITLE_TO_GENDER.get(title_raw)
            if gender is None:
                gender = random.choice(["male", "female"])

            while True:
                seq += 1
                pn = f"{personal_number_prefix}{seq:04d}"
                if pn not in existing:
                    existing.add(pn)
                    break

            if Patient.objects.filter(category="employee", personal_number=pn).exists():
                skipped += 1
                continue

            dob = min_birth + timedelta(days=random.randint(0, (max_birth - min_birth).days))

            if dry_run:
                self.stdout.write(
                    f"  [DRY] {model_title or '-'} {first} {middle} {surname} gender={gender} pn={pn}"
                )
                created += 1
                continue

            try:
                Patient.objects.create(
                    category="employee",
                    personal_number=pn,
                    title=model_title if model_title else "",
                    surname=surname,
                    first_name=first,
                    middle_name=middle,
                    gender=gender,
                    date_of_birth=dob,
                    created_by=created_by,
                )
                created += 1
            except Exception as e:
                self.stdout.write(self.style.ERROR(f"Failed {first} {surname}: {e}"))
                skipped += 1

        return created, skipped
