"""
Django management command to seed ICD-10 codes.

Supports:
- A small built-in starter set (default)
- Full WHO ICD-10 2019 import from the official "syst_*" metadata text files
  (chapters, groups, codes) provided by the user.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Tuple

from django.core.management.base import BaseCommand
from django.db import transaction

from consultation.models import ICD10Code


def _normalize_code(raw: str) -> str:
    raw = (raw or "").strip()
    if raw.endswith(".-"):
        raw = raw[:-2]
    if raw.endswith("-"):
        raw = raw[:-1]
    return raw.strip()


def _read_lines(path: Path) -> Iterable[str]:
    # WHO files are UTF-8 plain text with one record per line.
    with path.open("r", encoding="utf-8", errors="replace") as f:
        for line in f:
            line = line.strip("\n\r")
            if not line:
                continue
            yield line


def _parse_chapters(path: Path) -> Dict[str, str]:
    # Format: "01;Certain infectious and parasitic diseases"
    out: Dict[str, str] = {}
    for line in _read_lines(path):
        parts = line.split(";")
        if len(parts) < 2:
            continue
        chapter_no = parts[0].strip()
        name = parts[1].strip()
        if chapter_no:
            out[chapter_no] = name
    return out


@dataclass(frozen=True)
class GroupRange:
    start: str
    end: str
    chapter_no: str
    name: str


def _parse_groups(path: Path) -> List[GroupRange]:
    # Format: "A00;A09;01;Intestinal infectious diseases"
    out: List[GroupRange] = []
    for line in _read_lines(path):
        parts = line.split(";")
        if len(parts) < 4:
            continue
        start, end, chapter_no, name = (p.strip() for p in parts[:4])
        if start and end and chapter_no and name:
            out.append(GroupRange(start=_normalize_code(start), end=_normalize_code(end), chapter_no=chapter_no, name=name))
    return out


def _code_in_range(code: str, start: str, end: str) -> bool:
    # ICD10 ranges compare well lexicographically when normalized (e.g. A00, A09, B99).
    # We only use this for coarse category assignment.
    return start <= code <= end


def _find_group_name(groups: List[GroupRange], chapter_no: str, code: str) -> Optional[str]:
    for g in groups:
        if g.chapter_no != chapter_no:
            continue
        if _code_in_range(code, g.start, g.end):
            return g.name
    return None


def _parse_codes(
    path: Path,
    chapters: Dict[str, str],
    groups: List[GroupRange],
) -> Iterable[Tuple[str, str, str]]:
    """
    Parses WHO syst_codes.txt.

    Observed format (semicolon-separated), with at least 9 columns.
    We use:
    - chapter: col 4 (index 3)
    - code: col 6 (index 5)
    - description: col 9 (index 8)
    """
    for line in _read_lines(path):
        parts = line.split(";")
        if len(parts) < 9:
            continue
        chapter_no = parts[3].strip()
        raw_code = parts[5].strip()
        description = parts[8].strip()

        code = _normalize_code(raw_code)
        if not code or not description:
            continue

        chapter_name = chapters.get(chapter_no, chapter_no or "Unknown")
        group_name = _find_group_name(groups, chapter_no, code) if chapter_no else None
        # IMPORTANT: `consultation.ICD10Code.category` is a CharField(max_length=100).
        # Some group names are long, so we only include the group if it fits; otherwise we fall back to chapter.
        max_len = ICD10Code._meta.get_field("category").max_length or 100
        category = chapter_name
        if group_name:
            candidate = f"{chapter_name} — {group_name}"
            category = candidate if len(candidate) <= max_len else chapter_name
        if len(category) > max_len:
            category = category[:max_len]

        yield code, description, category


class Command(BaseCommand):
    help = "Seed ICD-10 codes (starter set or full WHO ICD-10 2019 import)"

    def add_arguments(self, parser):
        parser.add_argument(
            "--full",
            action="store_true",
            help="Import full ICD-10 from WHO syst_* files (uses repo data files if no paths are provided).",
        )
        parser.add_argument(
            "--chapters",
            help="Path to icd102019syst_chapters.txt",
            default=None,
        )
        parser.add_argument(
            "--groups",
            help="Path to icd102019syst_groups.txt",
            default=None,
        )
        parser.add_argument(
            "--codes",
            help="Path to icd102019syst_codes.txt",
            default=None,
        )
        parser.add_argument(
            "--dry-run",
            action="store_true",
            help="Parse and report counts without writing to the database",
        )
        parser.add_argument(
            "--batch-size",
            type=int,
            default=2000,
            help="Bulk create/update batch size",
        )

    def handle(self, *args, **options):
        full: bool = bool(options.get("full"))
        chapters_path = options.get("chapters")
        groups_path = options.get("groups")
        codes_path = options.get("codes")
        dry_run: bool = bool(options.get("dry_run"))
        batch_size: int = int(options.get("batch_size") or 2000)

        if full and not (chapters_path and groups_path and codes_path):
            # Use repo-bundled WHO files by default when --full is requested.
            common_dir = Path(__file__).resolve().parents[2]  # backend/common
            data_dir = common_dir / "data" / "icd10"
            chapters_path = chapters_path or str(data_dir / "icd102019syst_chapters.txt")
            groups_path = groups_path or str(data_dir / "icd102019syst_groups.txt")
            codes_path = codes_path or str(data_dir / "icd102019syst_codes.txt")

        if (chapters_path and groups_path and codes_path):
            return self._seed_full_who(
                chapters=Path(chapters_path),
                groups=Path(groups_path),
                codes=Path(codes_path),
                dry_run=dry_run,
                batch_size=batch_size,
            )

        # Default: seed a small starter set (kept for dev/demo installs).
        self.stdout.write("Seeding starter ICD-10 codes (no WHO files provided)...")
        starter = [
            {"code": "A00", "description": "Cholera", "category": "Certain infectious and parasitic diseases"},
            {"code": "J00", "description": "Acute nasopharyngitis (common cold)", "category": "Diseases of the respiratory system"},
            {"code": "I10", "description": "Essential (primary) hypertension", "category": "Diseases of the circulatory system"},
            {"code": "E11", "description": "Type 2 diabetes mellitus", "category": "Endocrine, nutritional and metabolic diseases"},
        ]

        created = 0
        skipped = 0
        for row in starter:
            _, was_created = ICD10Code.objects.get_or_create(
                code=row["code"],
                defaults={"description": row["description"], "category": row["category"], "is_active": True},
            )
            if was_created:
                created += 1
            else:
                skipped += 1

        self.stdout.write(self.style.SUCCESS(f"ICD-10 starter seeding done: {created} created, {skipped} already existed"))

    def _seed_full_who(self, *, chapters: Path, groups: Path, codes: Path, dry_run: bool, batch_size: int):
        for p in (chapters, groups, codes):
            if not p.exists():
                raise FileNotFoundError(f"File not found: {p}")

        self.stdout.write("Seeding FULL ICD-10 (WHO syst_* files)...")
        self.stdout.write(f"Chapters: {chapters}")
        self.stdout.write(f"Groups:   {groups}")
        self.stdout.write(f"Codes:    {codes}")

        chapters_map = _parse_chapters(chapters)
        groups_list = _parse_groups(groups)

        # Load existing codes for upsert comparison (keyed by `code`)
        existing = ICD10Code.objects.in_bulk(field_name="code")

        to_create: List[ICD10Code] = []
        to_update: List[ICD10Code] = []

        parsed = 0
        unchanged = 0

        def flush():
            nonlocal to_create, to_update
            if dry_run:
                to_create = []
                to_update = []
                return
            if to_create:
                ICD10Code.objects.bulk_create(to_create, batch_size=batch_size, ignore_conflicts=True)
            if to_update:
                ICD10Code.objects.bulk_update(to_update, fields=["description", "category", "is_active"], batch_size=batch_size)
            to_create = []
            to_update = []

        with transaction.atomic():
            for code_value, description, category in _parse_codes(codes, chapters_map, groups_list):
                parsed += 1
                existing_obj = existing.get(code_value)
                if existing_obj is None:
                    to_create.append(ICD10Code(code=code_value, description=description, category=category, is_active=True))
                else:
                    changed = False
                    if existing_obj.description != description:
                        existing_obj.description = description
                        changed = True
                    if (existing_obj.category or "") != (category or ""):
                        existing_obj.category = category
                        changed = True
                    if existing_obj.is_active is not True:
                        existing_obj.is_active = True
                        changed = True
                    if changed:
                        to_update.append(existing_obj)
                    else:
                        unchanged += 1

                if (len(to_create) + len(to_update)) >= batch_size:
                    flush()

            flush()

            if dry_run:
                transaction.set_rollback(True)

        created_estimate = parsed - (len(existing) if existing else 0)  # approximate; conflicts ignored on create
        self.stdout.write(self.style.SUCCESS("ICD-10 WHO import completed"))
        self.stdout.write(
            f"Parsed codes: {parsed}\n"
            f"Existing codes (before): {len(existing)}\n"
            f"Unchanged: {unchanged}\n"
            f"Dry run: {dry_run}\n"
            f"Note: created/updated counts are applied in batches (see DB for exact totals)."
        )