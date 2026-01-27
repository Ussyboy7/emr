"""
Clean retiree CSV so the output has:
  - Unique personal number (Emp. No or P/NO; one row per person)
  - Rows with Name: split into surname, first_name, middle_name.
    NAME (col 5) e.g. "BUCKNOR JOSEPH AKINKUMI" -> BUCKNOR=surname, JOSEPH=first, AKINKUMI=middle.
    If col 5 is empty or placeholder (P/NO, NAME), use Name (col 1) as surname only.
  - Rows with Gender: M or F only
  - Rows with DOB: parseable DD-Mon-YY only

Output: personal_number, surname, first_name, middle_name, gender, date_of_birth (YYYY-MM-DD).

Usage:
  python manage.py clean_retiree_data
  python manage.py clean_retiree_data --input /path/to/retiree_data.csv --output /path/to/cleaned.csv
"""
import csv
from datetime import date
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError

import patients

_MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6,
    "jul": 7, "aug": 8, "sep": 9, "oct": 10, "nov": 11, "dec": 12,
}

DEFAULT_INPUT = Path(patients.__file__).resolve().parent / "seed_data" / "retiree_data.csv"
DEFAULT_OUTPUT = Path(patients.__file__).resolve().parent / "seed_data" / "retiree_data_cleaned.csv"


def _clean(s):
    if s is None:
        return ""
    s = str(s).strip()
    if s.upper() in ("#VALUE!", "#N/A", "") or not s:
        return ""
    return s


def _parse_dob(s):
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


def _gender(s):
    raw = _clean(s).upper()
    if raw == "M":
        return "M"
    if raw == "F":
        return "F"
    return None


def _pno_from_col4(s):
    v = _clean(s)
    if not v or v.upper() in ("P/NO", "NAME"):
        return ""
    return v


def _split_name(s):
    """
    Split "SURNAME FIRSTNAME MIDDLENAME" -> (surname, first_name, middle_name).
    E.g. "BUCKNOR JOSEPH AKINKUMI" -> ("BUCKNOR", "JOSEPH", "AKINKUMI").
    1 word -> (s, "", ""); 2 -> (s, f, ""); 3 -> (s, f, m); 4+ -> (s, f, "m1 m2 ...").
    """
    s = _clean(s)
    if not s:
        return ("", "", "")
    parts = s.split()
    if len(parts) == 1:
        return (parts[0], "", "")
    if len(parts) == 2:
        return (parts[0], parts[1], "")
    return (parts[0], parts[1], " ".join(parts[2:]))


class Command(BaseCommand):
    help = "Clean retiree CSV: unique personal_number, surname, first_name, middle_name, gender, DOB."

    def add_arguments(self, parser):
        parser.add_argument("--input", "-i", type=str, default=None, help="Input CSV path.")
        parser.add_argument("--output", "-o", type=str, default=None, help="Output cleaned CSV path.")

    def handle(self, *args, **options):
        inp = Path(options["input"] or DEFAULT_INPUT)
        out = Path(options["output"] or DEFAULT_OUTPUT)

        if not inp.exists():
            raise CommandError(f"Input not found: {inp}")

        seen = set()
        cleaned = []

        with open(inp, "r", encoding="utf-8-sig", newline="") as f:
            reader = csv.reader(f)
            next(reader, None)
            for row in reader:
                if len(row) < 4:
                    continue
                emp_no = _clean(row[0])
                pno = _pno_from_col4(row[4]) if len(row) > 4 else ""
                pn = emp_no or pno
                name_col5 = _clean(row[5]) if len(row) > 5 else ""
                name_col1 = _clean(row[1])

                if name_col5 and name_col5.upper() not in ("P/NO", "NAME"):
                    surname, first, middle = _split_name(name_col5)
                    if not surname:
                        surname = name_col1
                else:
                    surname = name_col1
                    first, middle = "", ""

                g = _gender(row[2]) if len(row) > 2 else None
                dob = _parse_dob(row[3]) if len(row) > 3 else None

                if not pn or not surname or g is None or dob is None:
                    continue
                if pn in seen:
                    continue
                seen.add(pn)

                cleaned.append({
                    "personal_number": pn,
                    "surname": surname,
                    "first_name": first,
                    "middle_name": middle,
                    "gender": g,
                    "date_of_birth": dob.strftime("%Y-%m-%d"),
                })

        out.parent.mkdir(parents=True, exist_ok=True)
        with open(out, "w", encoding="utf-8", newline="") as f:
            w = csv.DictWriter(
                f,
                fieldnames=["personal_number", "surname", "first_name", "middle_name", "gender", "date_of_birth"],
            )
            w.writeheader()
            w.writerows(cleaned)

        self.stdout.write(
            self.style.SUCCESS(
                f"Cleaned: {len(cleaned)} rows -> {out}\n"
                f"  Unique personal_number: {len(cleaned)}\n"
                f"  Rows with surname: {len(cleaned)}\n"
                f"  Rows with gender (M/F): {len(cleaned)}\n"
                f"  Rows with DOB: {len(cleaned)}"
            )
        )
