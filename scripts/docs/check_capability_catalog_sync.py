#!/usr/bin/env python3
"""
Verify backend permissions/capabilities.py matches frontend lib/capabilities.ts.

Exit 0 if in sync, 1 if mismatched (for CI / make docs-check).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TS_PATH = ROOT / "frontend" / "lib" / "capabilities.ts"
PY_PATH = ROOT / "backend" / "permissions" / "capabilities.py"


def load_frontend_capability_ids() -> set[str]:
    text = TS_PATH.read_text(encoding="utf-8")
    ids = set(re.findall(r'\bid:\s*"([^"]+)"', text))
    if not ids:
        raise RuntimeError(f"No capability ids found in {TS_PATH}")
    return ids


def load_backend_capability_ids() -> set[str]:
    text = PY_PATH.read_text(encoding="utf-8")
    block = re.search(
        r"CAPABILITY_CATALOG:\s*tuple\[.*?\]\s*=\s*\((.+?)\)\s*\n\s*ALL_CAPABILITY_IDS",
        text,
        re.DOTALL,
    )
    if not block:
        raise RuntimeError(f"CAPABILITY_CATALOG block not found in {PY_PATH}")
    ids = set(re.findall(r'^\s*\("([^"]+)",', block.group(1), re.MULTILINE))
    if not ids:
        raise RuntimeError(f"No capability ids found in CAPABILITY_CATALOG in {PY_PATH}")
    return ids


def _parse_ts_page_to_caps(text: str) -> dict[str, set[str]]:
    block = re.search(
        r"export const PAGE_TO_CAPABILITIES.*?=\s*\{([^}]+)\};",
        text,
        re.DOTALL,
    )
    if not block:
        raise RuntimeError("PAGE_TO_CAPABILITIES block not found in capabilities.ts")
    out: dict[str, set[str]] = {}
    for page, arr in re.findall(
        r'"([^"]+)":\s*\[([^\]]*)\]',
        block.group(1),
    ):
        caps = set(re.findall(r'"([^"]+)"', arr))
        out[page] = caps
    return out


def _parse_py_page_to_caps(text: str) -> dict[str, set[str]]:
    block = re.search(
        r"PAGE_TO_CAPABILITIES.*?=\s*\{(.+?)\n\}\n\n# Documented API",
        text,
        re.DOTALL,
    )
    if not block:
        raise RuntimeError("PAGE_TO_CAPABILITIES block not found in capabilities.py")
    out: dict[str, set[str]] = {}
    for page, body in re.findall(
        r'"(/[^"]+)":\s*frozenset\(\s*\{([^}]*)\}\s*\)',
        block.group(1),
    ):
        caps = set(re.findall(r'"([^"]+)"', body))
        out[page] = caps
    return out


def main() -> int:
    if not TS_PATH.is_file():
        print(f"Missing {TS_PATH}", file=sys.stderr)
        return 1
    if not PY_PATH.is_file():
        print(f"Missing {PY_PATH}", file=sys.stderr)
        return 1

    fe_ids = load_frontend_capability_ids()
    be_ids = load_backend_capability_ids()

    ts_text = TS_PATH.read_text(encoding="utf-8")
    py_text = PY_PATH.read_text(encoding="utf-8")
    fe_pages = _parse_ts_page_to_caps(ts_text)
    be_pages = _parse_py_page_to_caps(py_text)

    errors = False

    only_fe = sorted(fe_ids - be_ids)
    only_be = sorted(be_ids - fe_ids)
    if only_fe or only_be:
        errors = True
        print("Capability catalog out of sync between frontend and backend.\n")
        if only_fe:
            print("Only in frontend/lib/capabilities.ts:")
            for c in only_fe:
                print(f"  + {c}")
        if only_be:
            print("Only in backend/permissions/capabilities.py:")
            for c in only_be:
                print(f"  - {c}")

    page_keys_fe = set(fe_pages)
    page_keys_be = set(be_pages)
    if page_keys_fe != page_keys_be:
        errors = True
        print("\nPAGE_TO_CAPABILITIES keys differ:")
        for p in sorted(page_keys_fe - page_keys_be):
            print(f"  + FE only page: {p}")
        for p in sorted(page_keys_be - page_keys_fe):
            print(f"  - BE only page: {p}")

    for page in sorted(page_keys_fe & page_keys_be):
        if fe_pages[page] != be_pages[page]:
            errors = True
            print(f"\nPAGE_TO_CAPABILITIES mismatch for {page}:")
            print(f"  FE: {sorted(fe_pages[page])}")
            print(f"  BE: {sorted(be_pages[page])}")

    if errors:
        print("\nUpdate both files when adding capabilities. See docs/architecture/AUTH_AND_RBAC.md")
        return 1

    print(f"OK: {len(fe_ids)} capability ids and {len(fe_pages)} page mappings match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
