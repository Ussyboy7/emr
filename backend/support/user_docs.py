"""Serve whitelisted user guide markdown from docs/user/."""
from __future__ import annotations

import re
from pathlib import Path

from django.conf import settings

DOCS_USER_DIR = Path(settings.BASE_DIR).parent / "docs" / "user"

USER_DOC_FILES: dict[str, str] = {
    "quick-start": "EMR_USER_QUICK_START_GUIDE.md",
    "medical-records": "ROLE_MEDICAL_RECORDS.md",
    "nursing": "ROLE_NURSING.md",
    "consultation": "ROLE_CONSULTATION.md",
    "laboratory": "ROLE_LABORATORY.md",
    "pharmacy": "ROLE_PHARMACY.md",
    "administration": "ROLE_ADMINISTRATION.md",
}


def _title_from_markdown(content: str, fallback: str) -> str:
    for line in content.splitlines():
        stripped = line.strip()
        if stripped.startswith("# "):
            return stripped[2:].strip()
    return fallback


def list_user_docs() -> list[dict]:
    items: list[dict] = []
    for slug, filename in USER_DOC_FILES.items():
        path = DOCS_USER_DIR / filename
        if not path.is_file():
            continue
        content = path.read_text(encoding="utf-8")
        title = _title_from_markdown(content, slug.replace("-", " ").title())
        items.append({"slug": slug, "title": title, "filename": filename})
    return items


def read_user_doc(slug: str) -> dict | None:
    filename = USER_DOC_FILES.get(slug)
    if not filename:
        return None
    path = (DOCS_USER_DIR / filename).resolve()
    if not path.is_file() or DOCS_USER_DIR.resolve() not in path.parents:
        return None
    content = path.read_text(encoding="utf-8")
    # Rewrite relative doc links to in-app routes where possible.
    content = re.sub(
        r"\]\(\.\./workflows/([^)]+)\)",
        r"](https://github.com/npa-emr/docs/workflows/\1)",
        content,
    )
    return {
        "slug": slug,
        "title": _title_from_markdown(content, slug.replace("-", " ").title()),
        "filename": filename,
        "content": content,
    }
