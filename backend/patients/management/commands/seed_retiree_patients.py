"""
Seed retiree patients from CSV.

Supports two formats:
1) Raw: Emp. No, Name, Gender, Date of Birth, P/NO, NAME
   - Emp. No and P/NO = personal number; Name = surname; Gender M/F; DOB = DD-Mon-YY.
2) Cleaned: personal_number, surname, first_name, middle_name, gender, date_of_birth
   - From clean_retiree_data; date_of_birth = YYYY-MM-DD.

Skips rows where personal_number already exists. Use --reset to delete before re-import.

Usage:
  python manage.py seed_retiree_patients
  python manage.py seed_retiree_patients --file /path/to/retiree_data_cleaned.csv
  python manage.py seed_retiree_patients --reset
"""
import csv
from datetime import date, datetime
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.contrib.auth import get_user_model

import patients
from patients.models import Patient

User = get_user_model()

_SEED_DIR = Path(patients.__file__).resolve().parent / "seed_data"
DEFAULT_CSV = _SEED_DIR / "retiree_data_cleaned.csv"
FALLBACK_CSV = _SEED_DIR / "retiree_data.csv"

# Month abbreviation -> 1-12
_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}


def _clean(s):
    if s is None:
        return ""
    s = str(s).strip()
    if s.upper() in ("#VALUE!", "#N/A", "") or not s:
        return ""
    return s


def _parse_dob(s):
    """
    Parse DD-Mon-YY or D-Mon-YY (e.g. 25-Nov-25, 5-Sep-36).
    Year 00-99 -> 1900+yy. Returns date or None if invalid.
    """
    s = _clean(s)
    if not s:
        return None
    parts = s.split("-")
    if len(parts) != 3:
        return None
    try:
        day = int(parts[0])
        mon = _MONTHS.get(parts[1][:3].lower())
        yy = int(parts[2])
        if mon is None or day < 1 or day > 31:
            return None
        year = 1900 + yy if 0 <= yy <= 99 else 1900
        return date(year, mon, day)
    except (ValueError, TypeError, IndexError):
        return None


def _parse_dob_iso(s):
    """Parse YYYY-MM-DD. Returns date or None."""
    s = _clean(s)
    if not s or len(s) != 10:
        return None
    try:
        return datetime.strptime(s, "%Y-%m-%d").date()
    except ValueError:
        return None


def _gender(s):
    raw = _clean(s).upper()
    if raw == "M":
        return "male"
    if raw == "F":
        return "female"
    return None


def _pno_from_col4(s):
    """P/NO (col 4) is also personal number. Use only if not the literal 'P/NO' or 'NAME'."""
    v = _clean(s)
    if not v or v.upper() in ("P/NO", "NAME"):
        return ""
    return v


def _load_csv(path):
    """
    Yield dicts: personal_number, surname, first_name, middle_name, gender, date_of_birth.
    Auto-detects: cleaned (header has personal_number, surname) vs raw (Emp. No, Name, ...).
    """
    path = Path(path)
    if not path.exists():
        raise CommandError(f"CSV not found: {path}")
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.reader(f)
        header = next(reader, None)
        if not header:
            return
        is_cleaned = "personal_number" in header and "surname" in header

        if is_cleaned:
            for row in reader:
                if len(row) < len(header):
                    row = row + [""] * (len(header) - len(row))
                d = dict(zip(header, row[: len(header)]))
                pn = _clean(d.get("personal_number") or "")
                surname = _clean(d.get("surname") or "")
                g = _gender(d.get("gender") or "")
                dob = _parse_dob_iso(d.get("date_of_birth") or "")
                if not pn or not surname or g is None or dob is None:
                    continue
                yield {
                    "personal_number": pn,
                    "surname": surname,
                    "first_name": _clean(d.get("first_name") or ""),
                    "middle_name": _clean(d.get("middle_name") or ""),
                    "gender": g,
                    "date_of_birth": dob,
                }
        else:
            for row in reader:
                if len(row) < 4:
                    continue
                emp_no = _clean(row[0])
                pno = _pno_from_col4(row[4]) if len(row) > 4 else ""
                pn = emp_no or pno
                name_col1 = _clean(row[1])
                # Use col 1 (Name) as the source of truth. Col 5 (NAME) in the raw CSV
                # often contains repeated placeholder values that do not match this row.
                parts = (name_col1 or "").split(None, 2)
                if len(parts) == 1:
                    surname, first, middle = parts[0], "", ""
                elif len(parts) == 2:
                    surname, first, middle = parts[0], parts[1], ""
                else:
                    surname, first, middle = parts[0], parts[1], (parts[2] if len(parts) > 2 else "")
                if not pn or not surname:
                    continue
                g = _gender(row[2]) if len(row) > 2 else None
                dob = _parse_dob(row[3]) if len(row) > 3 else None
                if not dob or g is None:
                    continue
                yield {
                    "personal_number": pn,
                    "surname": surname,
                    "first_name": first,
                    "middle_name": middle,
                    "gender": g,
                    "date_of_birth": dob,
                }


class Command(BaseCommand):
    help = "Seed retiree patients from CSV (Emp. No, Name, Gender, Date of Birth, ...)."

    def add_arguments(self, parser):
        parser.add_argument(
            "--file", "-f",
            type=str,
            default=None,
            help="Path to CSV. Default: retiree_data_cleaned.csv if present, else retiree_data.csv",
        )
        parser.add_argument("--dry-run", action="store_true", help="Print only, no DB writes.")
        parser.add_argument("--limit", type=int, default=None, help="Max rows to process.")
        parser.add_argument(
            "--reset",
            action="store_true",
            help="Delete retirees with these personal_numbers before re-import.",
        )

    def handle(self, *args, **options):
        dry_run = options["dry_run"]
        limit = options["limit"]
        reset = options["reset"]
        csv_path = Path(options["file"]) if options.get("file") else (DEFAULT_CSV if DEFAULT_CSV.exists() else FALLBACK_CSV)

        if not csv_path.exists():
            raise CommandError(f"CSV not found: {csv_path}")

        if dry_run:
            self.stdout.write(self.style.WARNING("DRY RUN – no changes will be saved."))

        rows = list(_load_csv(csv_path))
        if limit and limit > 0:
            rows = rows[:limit]
        self.stdout.write(f"Loaded {len(rows)} rows from CSV.")

        with transaction.atomic():
            if reset and not dry_run:
                pns = [r["personal_number"] for r in rows if r.get("personal_number")]
                deleted, _ = Patient.objects.filter(
                    category="retiree", personal_number__in=pns
                ).delete()
                self.stdout.write(self.style.WARNING(f"Removed {deleted} existing retiree(s) for re-import."))
            elif reset and dry_run:
                pns = [r["personal_number"] for r in rows if r.get("personal_number")]
                cnt = Patient.objects.filter(category="retiree", personal_number__in=pns).count()
                self.stdout.write(self.style.WARNING(f"Would remove {cnt} existing retiree(s)."))

            created, skipped = self._seed(rows, dry_run)

        self.stdout.write(
            self.style.SUCCESS(
                f"Seed complete: {created} created, {skipped} skipped (duplicate, missing/invalid gender, or invalid)."
            )
        )

    def _seed(self, rows, dry_run):
        created_by = (
            User.objects.filter(is_superuser=True).first()
            or User.objects.filter(is_staff=True).first()
        )
        created = 0
        skipped = 0

        for r in rows:
            pn = _clean(r.get("personal_number") or "")
            surname = _clean(r.get("surname") or "")
            gender = r.get("gender")
            dob = r.get("date_of_birth")

            if not pn or not surname or not dob:
                skipped += 1
                continue
            if gender is None:
                skipped += 1
                continue

            if Patient.objects.filter(category="retiree", personal_number=pn).exists():
                skipped += 1
                continue

            if dry_run:
                self.stdout.write(f"  [DRY] R-{pn} {surname} dob={dob} gender={gender}")
                created += 1
                continue

            first = _clean(r.get("first_name") or "")
            middle = _clean(r.get("middle_name") or "")
            if not first:
                first = "-"

            try:
                Patient.objects.create(
                    category="retiree",
                    personal_number=pn,
                    surname=surname,
                    first_name=first,
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
