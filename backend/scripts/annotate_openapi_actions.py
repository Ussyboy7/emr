#!/usr/bin/env python3
"""
Add @extend_schema to @action methods that lack explicit OpenAPI metadata.

Usage (from backend/):
  python scripts/annotate_openapi_actions.py [--write]

Default is dry-run. Pass --write to modify files.
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

VIEWSET_TAG = {
    "PatientViewSet": "Patients",
    "VisitViewSet": "Visits",
    "VitalReadingViewSet": "Vitals",
    "MedicalCertificateViewSet": "Patients",
    "AnnualCheckupViewSet": "HR",
    "UserViewSet": "Accounts",
    "SystemRoleViewSet": "Accounts",
    "RoleViewSet": "Permissions",
    "UserRoleViewSet": "Permissions",
    "AppointmentViewSet": "Appointments",
    "AppointmentSlotViewSet": "Appointments",
    "ActivityLogViewSet": "Audit",
    "NotificationViewSet": "Notifications",
    "NotificationPreferencesViewSet": "Notifications",
    "ClinicViewSet": "Organization",
    "DepartmentViewSet": "Organization",
    "RoomViewSet": "Organization",
    "LabOrderViewSet": "Laboratory",
    "LabTestViewSet": "Laboratory",
    "PrescriptionViewSet": "Pharmacy",
    "RadiologyOrderViewSet": "Radiology",
    "ConsultationSessionViewSet": "Consultation",
    "ReferralViewSet": "Consultation",
    "PatientAdmissionViewSet": "Wards",
    "PhysioOrderViewSet": "Physiotherapy",
    "EyeOrderViewSet": "Eyecare",
}

FILE_DEFAULT_TAG = {
    "patients/views.py": "Patients",
    "consultation/views.py": "Consultation",
    "pharmacy/views.py": "Pharmacy",
    "laboratory/views.py": "Laboratory",
    "radiology/views.py": "Radiology",
    "wards/views.py": "Wards",
    "physiotherapy/viewsets.py": "Physiotherapy",
    "eyecare/viewsets.py": "Eyecare",
    "nursing/views.py": "Nursing",
    "accounts/views.py": "Accounts",
    "hr/views.py": "HR",
    "permissions/views.py": "Permissions",
    "organization/views.py": "Organization",
    "notifications/views.py": "Notifications",
}


def humanize(name: str) -> str:
    text = name.replace("_", " ").replace("-", " ").strip()
    return text[:1].upper() + text[1:] if text else name


def action_summary(func_name: str, url_path: str | None) -> str:
    if url_path:
        return humanize(url_path)
    return humanize(func_name)


def has_extend_schema(decorator_list: list[ast.expr]) -> bool:
    for dec in decorator_list:
        if isinstance(dec, ast.Name) and dec.id == "extend_schema":
            return True
        if isinstance(dec, ast.Call):
            func = dec.func
            if isinstance(func, ast.Name) and func.id == "extend_schema":
                return True
            if isinstance(func, ast.Attribute) and func.attr == "extend_schema":
                return True
    return False


def is_action_decorator(dec: ast.expr) -> bool:
    if isinstance(dec, ast.Call):
        func = dec.func
        if isinstance(func, ast.Name) and func.id == "action":
            return True
        if isinstance(func, ast.Attribute) and func.attr == "action":
            return True
    return False


def url_path_from_action(dec: ast.Call) -> str | None:
    for kw in dec.keywords:
        if kw.arg == "url_path" and isinstance(kw.value, ast.Constant):
            return str(kw.value.value)
    return None


def process_file(path: Path, write: bool) -> int:
    rel = str(path.relative_to(BACKEND))
    source = path.read_text()
    lines = source.splitlines(keepends=True)
    tree = ast.parse(source)

    inserts: list[tuple[int, str]] = []
    default_tag = FILE_DEFAULT_TAG.get(rel, "Common")

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef):
            continue
        tag = VIEWSET_TAG.get(node.name, default_tag)
        for item in node.body:
            if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not any(is_action_decorator(d) for d in item.decorator_list):
                continue
            if has_extend_schema(item.decorator_list):
                continue

            action_dec = next(d for d in item.decorator_list if is_action_decorator(d))
            url_path = url_path_from_action(action_dec) if isinstance(action_dec, ast.Call) else None
            summary = action_summary(item.name, url_path)
            doc = ast.get_docstring(item) or ""
            desc = doc.split("\n")[0].strip().replace('"', "'")
            if desc and desc != summary:
                decorator = (
                    f'    @extend_schema(tags=["{tag}"], summary="{summary}", '
                    f'description="{desc}")\n'
                )
            else:
                decorator = f'    @extend_schema(tags=["{tag}"], summary="{summary}")\n'

            line_idx = item.decorator_list[0].lineno - 1
            inserts.append((line_idx, decorator))

    if not inserts:
        return 0

    # apply bottom-up so line numbers stay valid
    inserts.sort(key=lambda x: x[0], reverse=True)
    for line_idx, decorator in inserts:
        lines.insert(line_idx, decorator)

    ensure_extend_schema_import(lines)

    if write:
        path.write_text("".join(lines))
    return len(inserts)


def ensure_extend_schema_import(lines: list[str]) -> None:
    text = "".join(lines)
    if "extend_schema(" not in text:
        return
    if re.search(r"from drf_spectacular\.utils import [^\n]*\bextend_schema\b", text):
        return
    if re.search(r"from drf_spectacular\.utils import", text):
        for i, line in enumerate(lines):
            if line.startswith("from drf_spectacular.utils import"):
                names = line.strip().split("import", 1)[1].strip()
                if "extend_schema" not in names:
                    lines[i] = line.rstrip("\n").rstrip() + ", extend_schema\n"
                return
    for i, line in enumerate(lines):
        if line.startswith("from rest_framework") or line.startswith("from django_filters"):
            continue
        if i > 0 and (
            lines[i - 1].startswith("from rest_framework")
            or lines[i - 1].startswith("from django_filters")
            or lines[i - 1].startswith("from django.")
        ):
            lines.insert(i, "from drf_spectacular.utils import extend_schema\n")
            return
    lines.insert(0, "from drf_spectacular.utils import extend_schema\n")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    patterns = ["**/views.py", "**/viewsets.py"]
    files: list[Path] = []
    for pat in patterns:
        files.extend(BACKEND.glob(pat))

    total = 0
    for path in sorted(set(files)):
        n = process_file(path, args.write)
        if n:
            print(f"{'WROTE' if args.write else 'WOULD'} {n:3d}  {path.relative_to(BACKEND)}")
            total += n
    print(f"Total actions annotated: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
