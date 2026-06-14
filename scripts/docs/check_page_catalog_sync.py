#!/usr/bin/env python3
"""
Verify backend page_catalog.py matches frontend lib/page-permissions.ts.

Exit 0 if in sync, 1 if mismatched (for CI / pre-commit).
"""
from __future__ import annotations

import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
TS_PATH = ROOT / "frontend" / "lib" / "page-permissions.ts"
PY_PATH = ROOT / "backend" / "permissions" / "page_catalog.py"


def _normalize(path: str) -> str:
    p = (path or "").strip().rstrip("/") or "/"
    return p


def load_frontend_page_ids() -> set[str]:
    text = TS_PATH.read_text(encoding="utf-8")
    ids = set(re.findall(r'\bid:\s*"([^"]+)"', text))
    if not ids:
        raise RuntimeError(f"No page ids found in {TS_PATH}")
    return {_normalize(i) for i in ids}


def load_backend_page_ids() -> set[str]:
    text = PY_PATH.read_text(encoding="utf-8")
    ids = set(re.findall(r'^\s*"(/[^"]+)",\s*$', text, re.MULTILINE))
    if not ids:
        raise RuntimeError(f"No page ids found in {PY_PATH}")
    return {_normalize(i) for i in ids}


def main() -> int:
    if not TS_PATH.is_file():
        print(f"Missing {TS_PATH}", file=sys.stderr)
        return 1
    if not PY_PATH.is_file():
        print(f"Missing {PY_PATH}", file=sys.stderr)
        return 1

    fe = load_frontend_page_ids()
    be = load_backend_page_ids()

    only_fe = sorted(fe - be)
    only_be = sorted(be - fe)

    if only_fe or only_be:
        print("Page catalog out of sync between frontend and backend.\n")
        if only_fe:
            print("Only in frontend/lib/page-permissions.ts:")
            for p in only_fe:
                print(f"  + {p}")
        if only_be:
            print("Only in backend/permissions/page_catalog.py:")
            for p in only_be:
                print(f"  - {p}")
        print("\nUpdate both files when adding UI pages. See docs/architecture/AUTH_AND_RBAC.md")
        return 1

    print(f"OK: {len(fe)} page ids match.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
