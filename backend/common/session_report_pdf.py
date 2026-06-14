"""Server-side PDF generation for clinical session reports (ReportLab)."""
from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def _styles():
    base = getSampleStyleSheet()
    title = ParagraphStyle(
        name="RepTitle",
        parent=base["Heading1"],
        fontSize=14,
        spaceAfter=12,
        textColor=colors.HexColor("#1e40af"),
    )
    h2 = ParagraphStyle(
        name="RepH2",
        parent=base["Heading2"],
        fontSize=11,
        spaceAfter=6,
        spaceBefore=10,
        textColor=colors.HexColor("#0f766e"),
    )
    body = ParagraphStyle(name="RepBody", parent=base["Normal"], fontSize=9, leading=12)
    small = ParagraphStyle(name="RepSmall", parent=base["Normal"], fontSize=8, textColor=colors.grey, leading=10)
    return {"title": title, "h2": h2, "body": body, "small": small}


def _p(text: str, style) -> Paragraph:
    raw = str(text).strip() if text is not None else ""
    if not raw:
        raw = "—"
    safe = escape(raw).replace("\n", "<br/>")
    return Paragraph(safe, style)


def _meta_table(rows: list[tuple[str, str]], body_style) -> Table:
    data = [[Paragraph(f"<b>{escape(k)}</b>", body_style), _p(v, body_style)] for k, v in rows]
    t = Table(data, colWidths=[1.5 * inch, 5 * inch])
    t.setStyle(
        TableStyle(
            [
                ("VALIGN", (0, 0), (-1, -1), "TOP"),
                ("LINEBELOW", (0, 0), (-1, -2), 0.25, colors.lightgrey),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]
        )
    )
    return t


def build_physio_session_pdf_bytes(session) -> bytes:
    """session: physiotherapy.models.PhysioSession with order and patient select_related."""
    buf = BytesIO()
    doc = SimpleDocTemplate(buf, pagesize=letter, rightMargin=48, leftMargin=48, topMargin=48, bottomMargin=48)
    st = _styles()
    story = []

    order = getattr(session, "order", None)
    patient = order.patient if order else None
    pname = patient.get_full_name() if patient else ""
    pid = patient.patient_id if patient else ""

    pt_name = "—"
    if session.physiotherapist:
        u = session.physiotherapist
        pt_name = u.get_full_name() if callable(getattr(u, "get_full_name", None)) else str(u)
        if not pt_name:
            pt_name = getattr(u, "username", str(u.pk))

    story.append(_p("Physiotherapy — Session Report", st["title"]))
    story.append(_p(f"Session #{session.session_number}  •  PHY-{session.id}", st["small"]))
    story.append(Spacer(1, 8))

    meta = [
        ("Patient", pname or "—"),
        ("Patient ID", pid or "—"),
        ("Physiotherapist", pt_name),
        ("Scheduled", session.scheduled_at.isoformat() if session.scheduled_at else "—"),
        ("Completed", session.completed_at.isoformat() if session.completed_at else "—"),
    ]
    if order and order.diagnosis:
        meta.append(("Diagnosis", order.diagnosis))
    story.append(_meta_table(meta, st["body"]))
    story.append(Spacer(1, 12))

    for title, text in [
        ("Presenting complaint", session.presenting_complaint),
        (
            "Pain (before → after)",
            f"{session.pain_level_before if session.pain_level_before is not None else '—'} → "
            f"{session.pain_level_after if session.pain_level_after is not None else '—'}",
        ),
        ("Medical history", session.medical_history),
        ("Treatment performed", session.treatment_performed),
        ("Progress notes", session.progress_notes),
        ("Next session plan", session.next_session_plan),
        ("Follow-up instructions", session.follow_up_instructions),
    ]:
        story.append(_p(title, st["h2"]))
        story.append(_p(text or "—", st["body"]))

    doc.build(story)
    return buf.getvalue()
