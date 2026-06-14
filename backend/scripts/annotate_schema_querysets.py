#!/usr/bin/env python3
"""
Inject swagger_fake_view guards into ViewSet get_queryset methods.

Usage (from backend/):
  python3 scripts/annotate_schema_querysets.py [--write]
"""
from __future__ import annotations

import argparse
import ast
import re
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parent.parent
GUARD_SNIPPET = "if getattr(self, 'swagger_fake_view', False):\n"


def first_model_in_get_queryset(func: ast.FunctionDef) -> str | None:
    for node in ast.walk(func):
        if isinstance(node, ast.Attribute) and node.attr == "objects":
            if isinstance(node.value, ast.Name):
                return node.value.id
    return None


def has_schema_guard(source: str, func: ast.FunctionDef) -> bool:
    segment = ast.get_source_segment(source, func) or ""
    return "swagger_fake_view" in segment


def process_file(path: Path, write: bool) -> int:
    source = path.read_text()
    lines = source.splitlines(keepends=True)
    tree = ast.parse(source)
    inserts: list[tuple[int, str]] = []

    for node in ast.walk(tree):
        if not isinstance(node, ast.ClassDef) or "ViewSet" not in node.name:
            continue
        for item in node.body:
            if not isinstance(item, ast.FunctionDef) or item.name != "get_queryset":
                continue
            if has_schema_guard(source, item):
                continue
            model = first_model_in_get_queryset(item)
            if not model:
                continue
            body_start = item.body[0].lineno - 1
            indent = re.match(r"^(\s*)", lines[body_start]).group(1)
            guard = (
                f"{indent}if getattr(self, 'swagger_fake_view', False):\n"
                f"{indent}    return {model}.objects.none()\n"
                f"{indent}\n"
            )
            inserts.append((body_start, guard))

    if not inserts:
        return 0

    inserts.sort(key=lambda x: x[0], reverse=True)
    for line_idx, guard in inserts:
        lines.insert(line_idx, guard)

    if write:
        path.write_text("".join(lines))
    return len(inserts)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--write", action="store_true")
    args = parser.parse_args()

    total = 0
    for path in sorted(set(BACKEND.glob("**/views.py")) | set(BACKEND.glob("**/viewsets.py"))):
        n = process_file(path, args.write)
        if n:
            print(f"{'WROTE' if args.write else 'WOULD'} {n:3d}  {path.relative_to(BACKEND)}")
            total += n
    print(f"Total get_queryset guards added: {total}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
