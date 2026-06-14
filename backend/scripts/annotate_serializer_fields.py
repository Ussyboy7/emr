#!/usr/bin/env python3
"""
Add @extend_schema_field(OpenApiTypes.STR) to SerializerMethodField getters
that lack explicit OpenAPI typing.

Usage (from backend/):
  python3 scripts/annotate_serializer_fields.py [--write]
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent

# field_name -> OpenAPI type expression (override defaults)
FIELD_TYPE_OVERRIDES: dict[str, str] = {
    "permissions": """{
    "type": "object",
    "properties": {
        "pages": {"type": "array", "items": {"type": "string"}},
        "actions": {"type": "object", "additionalProperties": {"type": "integer"}},
    },
}""",
    "clinics_ids": '{"type": "array", "items": {"type": "integer"}}',
    "multi_clinic_enabled": "OpenApiTypes.BOOL",
    "active_clinic_id": '{"type": "integer", "nullable": True}',
    "is_overdue": "OpenApiTypes.BOOL",
    "is_critical": "OpenApiTypes.BOOL",
    "can_edit": "OpenApiTypes.BOOL",
    "can_delete": "OpenApiTypes.BOOL",
    "count": "OpenApiTypes.INT",
    "total": "OpenApiTypes.INT",
    "duration_minutes": "OpenApiTypes.INT",
    "age": "OpenApiTypes.INT",
    "age_years": "OpenApiTypes.INT",
    "items": '{"type": "array", "items": {"type": "object"}}',
    "options": '{"type": "array", "items": {"type": "string"}}',
    "labels": '{"type": "array", "items": {"type": "string"}}',
    "ids": '{"type": "array", "items": {"type": "integer"}}',
}


def method_field_names(class_node: ast.ClassDef) -> set[str]:
    names: set[str] = set()
    for item in class_node.body:
        if not isinstance(item, ast.Assign):
            continue
        for target in item.targets:
            if not isinstance(target, ast.Name):
                continue
            if isinstance(item.value, ast.Call):
                func = item.value.func
                if isinstance(func, ast.Attribute) and func.attr == "SerializerMethodField":
                    names.add(target.id)
    return names


def has_extend_schema_field(decorator_list: list[ast.expr]) -> bool:
    for dec in decorator_list:
        if isinstance(dec, ast.Call):
            func = dec.func
            if isinstance(func, ast.Name) and func.id == "extend_schema_field":
                return True
            if isinstance(func, ast.Attribute) and func.attr == "extend_schema_field":
                return True
    return False


def schema_type_for(method_name: str, method_fields: set[str]) -> str:
    if not method_name.startswith("get_"):
        return "OpenApiTypes.STR"
    field = method_name[4:]
    if field in FIELD_TYPE_OVERRIDES:
        return FIELD_TYPE_OVERRIDES[field]
    if field.endswith("_ids") or field.endswith("_list"):
        return '{"type": "array", "items": {"type": "integer"}}'
    if field.endswith("_count") or field.endswith("_total"):
        return "OpenApiTypes.INT"
    if field.startswith("is_") or field.endswith("_enabled") or field.endswith("_flag"):
        return "OpenApiTypes.BOOL"
    if field in method_fields:
        return "OpenApiTypes.STR"
    return "OpenApiTypes.STR"


def process_file(path: Path, write: bool) -> int:
    source = path.read_text()
    lines = source.splitlines(keepends=True)
    tree = ast.parse(source)

    inserts: list[tuple[int, str]] = []
    needs_openapi_types = False

    for node in tree.body:
        if not isinstance(node, ast.ClassDef):
            continue
        if not node.name.endswith("Serializer"):
            continue
        method_fields = method_field_names(node)
        for item in node.body:
            if not isinstance(item, (ast.FunctionDef, ast.AsyncFunctionDef)):
                continue
            if not item.name.startswith("get_"):
                continue
            if has_extend_schema_field(item.decorator_list):
                continue
            field = item.name[4:]
            if field not in method_fields and field not in FIELD_TYPE_OVERRIDES:
                continue
            schema_type = schema_type_for(item.name, method_fields)
            if "OpenApiTypes." in schema_type:
                needs_openapi_types = True
            if schema_type.startswith("{"):
                decorator = f"    @extend_schema_field({schema_type})\n"
            else:
                decorator = f"    @extend_schema_field({schema_type})\n"
            line_idx = item.lineno - 1
            inserts.append((line_idx, decorator))

    if not inserts:
        return 0

    inserts.sort(key=lambda x: x[0], reverse=True)
    for line_idx, decorator in inserts:
        lines.insert(line_idx, decorator)

    ensure_imports(lines, needs_openapi_types)

    if write:
        path.write_text("".join(lines))
    return len(inserts)


def ensure_imports(lines: list[str], needs_openapi_types: bool) -> None:
    text = "".join(lines)
    if "extend_schema_field(" not in text:
        return

    if not re.search(r"from drf_spectacular\.utils import [^\n]*\bextend_schema_field\b", text):
        if re.search(r"from drf_spectacular\.utils import", text):
            for i, line in enumerate(lines):
                if line.startswith("from drf_spectacular.utils import"):
                    if "extend_schema_field" not in line:
                        lines[i] = line.rstrip("\n").rstrip() + ", extend_schema_field\n"
                    break
        else:
            for i, line in enumerate(lines):
                if line.startswith("from rest_framework"):
                    lines.insert(i + 1, "from drf_spectacular.utils import extend_schema_field\n")
                    break
            else:
                lines.insert(0, "from drf_spectacular.utils import extend_schema_field\n")

    if needs_openapi_types and "OpenApiTypes" in text:
        if not re.search(r"from drf_spectacular\.types import OpenApiTypes", text):
            for i, line in enumerate(lines):
                if line.startswith("from drf_spectacular.utils import"):
                    lines.insert(i + 1, "from drf_spectacular.types import OpenApiTypes\n")
                    break


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    files = sorted(BACKEND.glob("**/serializers.py"))
    total = 0
    for path in files:
        n = process_file(path, args.write)
        if n:
            print(f"{'WROTE' if args.write else 'WOULD'} {n:3d}  {path.relative_to(BACKEND)}")
            total += n
    print(f"Total getter methods annotated: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
