"""
PDF builder for ward admission summaries.

Renders a single, chronological narrative covering everything that happened
during a ward admission — the doctor's intake, nursing assignments, observation
vitals, treatment sheet, doctor's orders (with pharmacy fill status),
progress notes, lab + radiology orders, the discharge plan, the nurse's
exit sign-out, and any external referral / escort handover.

Usage::

    from wards.pdfs import build_admission_summary_pdf
    pdf_bytes = build_admission_summary_pdf(admission)

The function returns the rendered PDF as bytes; callers decide whether to
stream the response or persist a snapshot to ``MEDIA_ROOT``.
"""

from __future__ import annotations

from io import BytesIO
from xml.sax.saxutils import escape as _escape

from django.utils import timezone

from reportlab.lib import colors
from reportlab.lib.units import inch, mm
from reportlab.platypus import (
    HRFlowable,
    KeepTogether,
    PageBreak,
    Paragraph,
    Spacer,
    Table,
    TableStyle,
)

from common.date_display import format_display_date, format_display_datetime
from common.pdf import (
    COLOR_ABNORMAL,
    COLOR_ACCENT,
    COLOR_BODY,
    COLOR_CRITICAL,
    COLOR_LIGHT_BG,
    COLOR_LINE,
    COLOR_MUTED,
    FONT_BODY,
    FONT_BOLD,
    FONT_BOLD_ITALIC,
    FONT_ITALIC,
    NPADocument,
    body_paragraph,
    centered_section_title,
    certification_paragraph,
    data_table,
    italic_paragraph,
    label_paragraph,
    npa_styles,
    patient_info_block,
    section_heading,
    signature_block,
    small_paragraph,
)


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

DEPARTMENT_LINE = "WARD MANAGEMENT"


def _fmt_dt(dt) -> str:
    if not dt:
        return "—"
    try:
        return format_display_datetime(dt)
    except Exception:
        return str(dt)


def _fmt_date(dt) -> str:
    if not dt:
        return "—"
    try:
        formatted = format_display_date(dt)
        return formatted or "—"
    except Exception:
        return str(dt)


def _fmt_time(t) -> str:
    if not t:
        return "—"
    try:
        return t.strftime("%H:%M")
    except Exception:
        return str(t)


def _or_dash(value) -> str:
    if value in (None, ""):
        return "—"
    return str(value)


def _humanize(choice_value: str | None) -> str:
    """Turn `discharged_with` etc. snake_case codes into readable labels."""
    if not choice_value:
        return "—"
    return str(choice_value).replace("_", " ").capitalize()


def _length_of_stay_phrase(days: int) -> str:
    if days <= 0:
        return "Same day"
    return f"{days} day{'s' if days != 1 else ''}"


# ---------------------------------------------------------------------------
# Builder
# ---------------------------------------------------------------------------


def build_admission_summary_pdf(admission) -> bytes:
    """
    Render a Ward Admission Summary PDF for the given ``PatientAdmission``.

    Pulls cross-app data (pharmacy, lab, radiology, nursing, consultation)
    bounded by the admission's visit + admission date so the summary stays
    scoped to *this* hospitalisation episode.
    """
    buffer = BytesIO()
    document_title = f"Admission Summary {admission.admission_id}"
    doc = NPADocument(
        buffer,
        department=DEPARTMENT_LINE,
        document_title=document_title,
    )

    styles = npa_styles()
    page_width = doc.usable_width

    is_finalised = admission.status == "discharged"
    is_pending = admission.status == "pending_discharge"

    story: list = []

    # ------------------------------------------------------------------
    # Title bar
    # ------------------------------------------------------------------
    story.append(centered_section_title("WARD ADMISSION SUMMARY"))

    # Status banner — mirrors the admission state. Interim / pending copies
    # are clearly labelled so a printout doesn't get filed as the final.
    if is_finalised:
        banner_text = "FINAL · Admission discharged"
        banner_color = COLOR_ACCENT
    elif is_pending:
        banner_text = "INTERIM · Pending nurse discharge confirmation"
        banner_color = COLOR_ABNORMAL
    else:
        banner_text = "INTERIM · Patient currently admitted"
        banner_color = COLOR_CRITICAL

    banner = Table(
        [[Paragraph(_escape(banner_text), styles["label"])]],
        colWidths=[page_width],
    )
    banner.setStyle(
        TableStyle(
            [
                ("BACKGROUND", (0, 0), (-1, -1), COLOR_LIGHT_BG),
                ("TEXTCOLOR", (0, 0), (-1, -1), banner_color),
                ("ALIGN", (0, 0), (-1, -1), "CENTER"),
                ("LEFTPADDING", (0, 0), (-1, -1), 6),
                ("RIGHTPADDING", (0, 0), (-1, -1), 6),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LINEABOVE", (0, 0), (-1, 0), 0.5, banner_color),
                ("LINEBELOW", (0, 0), (-1, 0), 0.5, banner_color),
            ]
        )
    )
    story.append(Spacer(1, 4))
    story.append(banner)
    story.append(Spacer(1, 8))

    # ------------------------------------------------------------------
    # Patient / admission identity (3-column header block)
    # ------------------------------------------------------------------
    patient = admission.patient

    age_phrase = ""
    try:
        years = patient.calculate_age() if hasattr(patient, "calculate_age") else None
        age_phrase = f"{years} yrs" if isinstance(years, int) else ""
    except Exception:
        age_phrase = ""

    left_col = [
        ("Patient", patient.get_full_name()),
        ("Patient ID", getattr(patient, "patient_id", "") or "—"),
        ("Personal No.", getattr(patient, "personal_number", "") or "—"),
        ("Sex / Age", " · ".join([x for x in [getattr(patient, "gender", "") or "", age_phrase] if x]) or "—"),
    ]
    middle_col = [
        ("Admission ID", admission.admission_id or "—"),
        ("Ward", admission.ward.name if admission.ward_id else "—"),
        ("Bed", getattr(admission.bed, "bed_number", "") if admission.bed_id else "—"),
        ("Type", _humanize(admission.admission_type)),
    ]
    right_col = [
        ("Admitted", _fmt_dt(admission.admission_date)),
        (
            "Discharged",
            _fmt_dt(admission.discharge_date) if admission.discharge_date else "—",
        ),
        ("Length of stay", _length_of_stay_phrase(admission.length_of_stay)),
        (
            "Admitting Dr.",
            admission.admitting_doctor.get_full_name() if admission.admitting_doctor_id else "—",
        ),
    ]
    story.append(patient_info_block(left_col, middle_col, right_col, width=page_width))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.6, color=COLOR_LINE))
    story.append(Spacer(1, 4))

    # ------------------------------------------------------------------
    # 1. Admission details
    # ------------------------------------------------------------------
    story.append(section_heading("1. Admission"))
    story.append(_kv("Diagnosis", admission.admission_diagnosis or "—"))
    if admission.presenting_complaint:
        story.append(_kv("Presenting complaint", admission.presenting_complaint))
    if admission.admission_notes:
        story.append(_kv("Notes", admission.admission_notes))

    # ------------------------------------------------------------------
    # 2. Nursing assignments
    # ------------------------------------------------------------------
    story.append(section_heading("2. Nursing assignments"))
    nurse_rows = list(
        admission.nurse_assignments.select_related("nurse").order_by("-assigned_at")
    )
    if nurse_rows:
        rows = [
            [
                _humanize(a.assignment_type),
                a.nurse.get_full_name() if a.nurse_id else "—",
                _humanize(a.status),
                _fmt_dt(a.assigned_at),
                _fmt_dt(a.completed_at) if a.completed_at else "—",
            ]
            for a in nurse_rows
        ]
        story.append(
            data_table(
                ["Role", "Nurse", "Status", "Assigned", "Completed"],
                rows,
                col_widths=[
                    page_width * 0.18,
                    page_width * 0.30,
                    page_width * 0.14,
                    page_width * 0.19,
                    page_width * 0.19,
                ],
                italic_col=None,
            )
        )
    else:
        story.append(italic_paragraph("No nurse assignments recorded for this admission."))

    # ------------------------------------------------------------------
    # 3. Observations / vitals chart
    # ------------------------------------------------------------------
    story.append(section_heading("3. Observation chart"))
    vitals = list(
        admission.observation_vitals.select_related("recorded_by").order_by("recorded_at")
    )
    if vitals:
        rows = []
        for v in vitals:
            bp = (
                f"{v.bp_systolic}/{v.bp_diastolic}"
                if v.bp_systolic and v.bp_diastolic
                else "—"
            )
            rows.append([
                _fmt_dt(v.recorded_at),
                _or_dash(v.temperature_c),
                _or_dash(v.pulse),
                _or_dash(v.respiratory_rate),
                bp,
                _or_dash(v.fbs_mmol),
                _or_dash(v.rbs_mmol),
                v.notes or "",
                v.recorded_by.get_full_name() if v.recorded_by_id else "—",
            ])
        story.append(
            data_table(
                ["Time", "T°C", "Pulse", "RR", "BP", "FBS", "RBS", "Notes", "By"],
                rows,
                col_widths=[
                    page_width * 0.16,
                    page_width * 0.06,
                    page_width * 0.07,
                    page_width * 0.06,
                    page_width * 0.10,
                    page_width * 0.07,
                    page_width * 0.07,
                    page_width * 0.27,
                    page_width * 0.14,
                ],
                italic_col=None,
            )
        )
    else:
        story.append(italic_paragraph("No vitals recorded."))

    # ------------------------------------------------------------------
    # 4. Treatment sheet
    # ------------------------------------------------------------------
    story.append(section_heading("4. Treatment sheet"))
    treats = list(
        admission.treatment_sheet_rows.select_related("recorded_by").order_by("created_at")
    )
    if treats:
        rows = [
            [
                t.drug_name or "—",
                t.dosage or "—",
                t.route or "—",
                _fmt_time(t.time_administered),
                _fmt_time(t.time_completed),
                t.drug_reaction or "—",
                t.nurse_initials or "—",
                t.doctor_initials or "—",
            ]
            for t in treats
        ]
        story.append(
            data_table(
                ["Drug", "Dose", "Route", "Given", "Done", "Reaction", "Nurse", "Doctor"],
                rows,
                col_widths=[
                    page_width * 0.20,
                    page_width * 0.10,
                    page_width * 0.10,
                    page_width * 0.09,
                    page_width * 0.09,
                    page_width * 0.20,
                    page_width * 0.11,
                    page_width * 0.11,
                ],
                italic_col=None,
            )
        )
    else:
        story.append(italic_paragraph("No treatment sheet entries recorded."))

    # ------------------------------------------------------------------
    # 5. Doctor's orders (nursing-side + pharmacy)
    # ------------------------------------------------------------------
    story.append(section_heading("5. Doctor's orders"))

    nursing_orders = _load_nursing_orders(admission)
    if nursing_orders:
        story.append(label_paragraph("Nursing orders (procedures, dressings, instructions)"))
        rows = [
            [
                _humanize(o.get("order_type")),
                _humanize(o.get("status")),
                _humanize(o.get("priority")),
                _fmt_dt(o.get("ordered_at")),
                o.get("description", ""),
            ]
            for o in nursing_orders
        ]
        story.append(
            data_table(
                ["Type", "Status", "Priority", "Ordered", "Description"],
                rows,
                col_widths=[
                    page_width * 0.13,
                    page_width * 0.13,
                    page_width * 0.11,
                    page_width * 0.18,
                    page_width * 0.45,
                ],
                italic_col=None,
            )
        )
        story.append(Spacer(1, 4))
    else:
        story.append(italic_paragraph("No nursing orders recorded."))

    pharmacy_rx = _load_pharmacy(admission)
    if pharmacy_rx:
        story.append(Spacer(1, 4))
        story.append(label_paragraph("Pharmacy prescriptions (ordered + dispensed)"))
        rows = []
        for rx in pharmacy_rx:
            for item in rx["items"]:
                rows.append([
                    rx["prescription_id"],
                    _fmt_dt(rx["prescribed_at"]),
                    item["name"],
                    item["dose"],
                    item["route"],
                    item["frequency"],
                    item["duration"],
                    item["fill"],
                ])
        story.append(
            data_table(
                ["Rx", "Ordered", "Drug", "Dose", "Route", "Freq", "Duration", "Dispense"],
                rows,
                col_widths=[
                    page_width * 0.12,
                    page_width * 0.14,
                    page_width * 0.20,
                    page_width * 0.09,
                    page_width * 0.09,
                    page_width * 0.10,
                    page_width * 0.11,
                    page_width * 0.15,
                ],
                italic_col=None,
            )
        )

    # ------------------------------------------------------------------
    # 6. Lab orders + results
    # ------------------------------------------------------------------
    lab_rows = _load_lab(admission)
    if lab_rows:
        story.append(section_heading("6. Laboratory"))
        rows = [
            [
                lr["order_number"],
                _fmt_dt(lr["ordered_at"]),
                lr["test_name"],
                _humanize(lr["status"]),
                lr["result_summary"],
            ]
            for lr in lab_rows
        ]
        story.append(
            data_table(
                ["Order", "Ordered", "Test", "Status", "Result"],
                rows,
                col_widths=[
                    page_width * 0.13,
                    page_width * 0.16,
                    page_width * 0.25,
                    page_width * 0.14,
                    page_width * 0.32,
                ],
                italic_col=None,
            )
        )

    # ------------------------------------------------------------------
    # 7. Radiology
    # ------------------------------------------------------------------
    rad_rows = _load_radiology(admission)
    if rad_rows:
        story.append(section_heading("7. Radiology"))
        rows = [
            [
                r["order_number"],
                _fmt_dt(r["ordered_at"]),
                r["procedure"],
                _humanize(r["status"]),
                r["report_summary"],
            ]
            for r in rad_rows
        ]
        story.append(
            data_table(
                ["Order", "Ordered", "Procedure", "Status", "Report"],
                rows,
                col_widths=[
                    page_width * 0.13,
                    page_width * 0.16,
                    page_width * 0.25,
                    page_width * 0.14,
                    page_width * 0.32,
                ],
                italic_col=None,
            )
        )

    # ------------------------------------------------------------------
    # 8. Progress notes (currently appended to admission_notes)
    # ------------------------------------------------------------------
    if admission.admission_notes:
        story.append(section_heading("8. Progress notes"))
        for chunk in [c for c in admission.admission_notes.split("\n\n") if c.strip()]:
            story.append(body_paragraph(chunk))
            story.append(Spacer(1, 2))

    # ------------------------------------------------------------------
    # 9. Discharge
    # ------------------------------------------------------------------
    story.append(section_heading("9. Discharge plan"))
    if admission.discharge_date or admission.discharge_diagnosis or admission.discharge_summary:
        story.append(_kv("Type", _humanize(admission.discharge_type)))
        if admission.discharge_diagnosis:
            story.append(_kv("Final diagnosis", admission.discharge_diagnosis))
        if admission.discharge_summary:
            story.append(_kv("Summary", admission.discharge_summary))
        if admission.discharge_notes:
            story.append(_kv("Notes", admission.discharge_notes))
        if admission.follow_up_instructions:
            story.append(_kv("Follow-up", admission.follow_up_instructions))
        if admission.discharge_doctor_id:
            story.append(_kv("Discharging doctor", admission.discharge_doctor.get_full_name()))
        story.append(_kv("Discharge date", _fmt_dt(admission.discharge_date)))
    else:
        story.append(italic_paragraph("Discharge has not been initiated."))

    # ------------------------------------------------------------------
    # 10. Nurse exit / sign-out
    # ------------------------------------------------------------------
    if (
        admission.nurse_exit_summary
        or admission.physically_left_at
        or admission.confirmed_by_nurse_id
        or admission.discharged_with
        or admission.companion_name
    ):
        story.append(section_heading("10. Nurse exit / sign-out"))
        if admission.nurse_exit_summary:
            story.append(_kv("Exit summary", admission.nurse_exit_summary))
        if admission.discharged_with:
            story.append(_kv("Discharged with", _humanize(admission.discharged_with)))
        if admission.companion_name:
            story.append(
                _kv(
                    "Companion",
                    " · ".join(
                        [x for x in (
                            admission.companion_name,
                            admission.companion_relationship,
                            admission.companion_phone,
                        ) if x]
                    ),
                )
            )
        if admission.physically_left_at:
            story.append(_kv("Patient left at", _fmt_dt(admission.physically_left_at)))
        if admission.confirmed_by_nurse_id:
            story.append(_kv("Confirmed by", admission.confirmed_by_nurse.get_full_name()))

    # ------------------------------------------------------------------
    # 11. External referral & escort
    # ------------------------------------------------------------------
    escort = getattr(admission, "escort", None)
    if escort:
        story.append(section_heading("11. External referral & escort"))

        # Referral block
        ref = escort.referral
        if ref:
            story.append(label_paragraph("Referral"))
            story.append(_kv("Referral ID", ref.referral_id))
            story.append(_kv("Receiving facility", ref.facility or "—"))
            if ref.facility_address_snapshot:
                story.append(_kv("Address", ref.facility_address_snapshot))
            story.append(_kv("Specialty", ref.specialty or "—"))
            story.append(_kv("Urgency", _humanize(ref.urgency)))
            if ref.reason:
                story.append(_kv("Reason", ref.reason))
            if ref.clinical_summary:
                story.append(_kv("Clinical summary", ref.clinical_summary))
            contact_bits = [
                x for x in (ref.contact_person, ref.contact_phone, ref.contact_email) if x
            ]
            if contact_bits:
                story.append(_kv("Receiving contact", " · ".join(contact_bits)))
            if ref.referred_by_id:
                story.append(_kv("Referred by", ref.referred_by.get_full_name()))
            story.append(Spacer(1, 4))

        # Escort block
        story.append(label_paragraph("Escort"))
        story.append(
            _kv(
                "Primary escort nurse",
                escort.primary_nurse.get_full_name() if escort.primary_nurse_id else "—",
            )
        )
        additional = [u.get_full_name() for u in escort.additional_nurses.all()]
        if additional:
            story.append(_kv("Additional escorts", ", ".join(additional)))
        story.append(_kv("Transport", _humanize(escort.transport_mode)))
        story.append(_kv("Departed", _fmt_dt(escort.departure_at)))
        if escort.handover_summary:
            story.append(_kv("Handover summary", escort.handover_summary))

        # Arrival
        story.append(Spacer(1, 4))
        story.append(label_paragraph("Arrival / handover confirmation"))
        if escort.arrival_confirmed_at:
            story.append(_kv("Confirmed at", _fmt_dt(escort.arrival_confirmed_at)))
            story.append(
                _kv(
                    "Confirmed by",
                    escort.arrival_confirmed_by.get_full_name() if escort.arrival_confirmed_by_id else "—",
                )
            )
            story.append(_kv("Outcome", _humanize(escort.arrival_call_outcome)))
            if escort.arrival_notes:
                story.append(_kv("Notes", escort.arrival_notes))
        else:
            story.append(italic_paragraph("Awaiting confirmation from receiving facility."))

    # ------------------------------------------------------------------
    # Signature block
    # ------------------------------------------------------------------
    story.append(Spacer(1, 16))
    story.append(
        signature_block(
            left_role="Discharging Doctor",
            left_name=(
                admission.discharge_doctor.get_full_name()
                if admission.discharge_doctor_id
                else admission.admitting_doctor.get_full_name() if admission.admitting_doctor_id else ""
            ),
            right_role="Confirming Nurse",
            right_name=(
                admission.confirmed_by_nurse.get_full_name()
                if admission.confirmed_by_nurse_id
                else ""
            ),
            width=page_width,
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        small_paragraph(
            "This summary aggregates ward, pharmacy, laboratory and radiology "
            "activity for the stated admission. Mid-stay copies are marked "
            "INTERIM; the FINAL copy is generated when the nurse confirms "
            "discharge."
        )
    )

    doc.build(story, document_serial=admission.admission_id or "")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Cross-app data loaders (kept here so the builder reads top-down)
# ---------------------------------------------------------------------------


def _kv(label: str, value: str) -> Paragraph:
    """Single label / value paragraph used for the narrative blocks."""
    safe_label = _escape(str(label))
    safe_value = _escape("" if value in (None, "") else str(value)).replace("\n", "<br/>")
    return Paragraph(
        f'<font name="{FONT_BOLD}">{safe_label}:</font> {safe_value}',
        npa_styles()["body"],
    )


def _load_nursing_orders(admission) -> list[dict]:
    try:
        from nursing.models import NursingOrder
    except Exception:
        return []
    qs = NursingOrder.objects.filter(admission=admission).order_by("ordered_at")
    return [
        {
            "order_type": getattr(o, "order_type", "") or "",
            "status": getattr(o, "status", "") or "",
            "priority": getattr(o, "priority", "") or "",
            "ordered_at": getattr(o, "ordered_at", None),
            "description": (getattr(o, "description", "") or "")[:300],
        }
        for o in qs
    ]


def _load_pharmacy(admission) -> list[dict]:
    """Prescriptions on this admission's visit, with per-item dispense status."""
    if not admission.visit_id:
        return []
    try:
        from pharmacy.models import Prescription
    except Exception:
        return []

    prescriptions = (
        Prescription.objects.filter(visit_id=admission.visit_id)
        .filter(prescribed_at__gte=admission.admission_date)
        .order_by("prescribed_at")
        .prefetch_related("medications__generic")
    )
    out = []
    for rx in prescriptions:
        items = []
        for it in rx.medications.all():
            generic = getattr(it, "generic", None)
            name = (
                getattr(generic, "name", "")
                or getattr(it, "generic_name", "")
                or "—"
            )
            dose = getattr(it, "dose", "") or "—"
            route = getattr(it, "route", "") or getattr(generic, "route", "") or "—"
            frequency = getattr(it, "frequency", "") or "—"
            duration = getattr(it, "duration", "") or "—"

            qty = getattr(it, "quantity", None)
            dispensed_qty = getattr(it, "dispensed_quantity", None)
            is_dispensed = bool(getattr(it, "is_dispensed", False))

            try:
                qty_f = float(qty) if qty is not None else None
                disp_f = float(dispensed_qty) if dispensed_qty is not None else 0.0
                if qty_f and disp_f >= qty_f:
                    fill = f"Dispensed ({disp_f:g}/{qty_f:g})"
                elif disp_f > 0:
                    fill = f"Partial ({disp_f:g}/{qty_f:g})" if qty_f else f"Partial ({disp_f:g})"
                elif is_dispensed:
                    fill = "Dispensed"
                else:
                    fill = "Pending"
            except Exception:
                fill = "Dispensed" if is_dispensed else "Pending"

            unit = getattr(it, "unit", "") or ""
            qty_str = f"{qty}" if qty is not None else "—"
            items.append({
                "name": name,
                "dose": str(dose),
                "route": str(route),
                "frequency": str(frequency),
                "duration": str(duration),
                "fill": f"{fill} · qty {qty_str}{(' ' + unit) if unit else ''}",
            })
        if not items:
            continue
        out.append({
            "prescription_id": rx.prescription_id or f"RX-{rx.id}",
            "prescribed_at": rx.prescribed_at,
            "items": items,
        })
    return out


def _load_lab(admission) -> list[dict]:
    """Lab tests ordered during this admission (one row per test)."""
    if not admission.visit_id:
        return []
    try:
        from laboratory.models import LabOrder
    except Exception:
        return []

    orders = (
        LabOrder.objects.filter(visit_id=admission.visit_id)
        .filter(ordered_at__gte=admission.admission_date)
        .order_by("ordered_at")
        .prefetch_related("tests")
    )
    rows = []
    for order in orders:
        order_no = (
            getattr(order, "order_number", "")
            or getattr(order, "order_id", "")
            or f"LAB-{order.id}"
        )
        tests = list(getattr(order, "tests").all()) if hasattr(order, "tests") else []
        if not tests:
            rows.append({
                "order_number": order_no,
                "ordered_at": order.ordered_at,
                "test_name": "—",
                "status": getattr(order, "status", "") or "",
                "result_summary": "",
            })
            continue
        for t in tests:
            name = (
                getattr(getattr(t, "test_catalog", None), "name", "")
                or getattr(t, "test_name", "")
                or "—"
            )
            result_value = getattr(t, "result_value", None)
            result_unit = getattr(t, "result_unit", "") or ""
            interp = getattr(t, "result_interpretation", "") or ""
            summary_bits = []
            if result_value not in (None, ""):
                summary_bits.append(
                    f"{result_value} {result_unit}".strip()
                )
            if interp:
                summary_bits.append(interp)
            rows.append({
                "order_number": order_no,
                "ordered_at": order.ordered_at,
                "test_name": name,
                "status": getattr(t, "status", "") or "",
                "result_summary": " · ".join(summary_bits)[:160],
            })
    return rows


def build_patient_discharge_slip_pdf(admission) -> bytes:
    """
    Render a short, patient-friendly Discharge Slip — the handout the
    patient takes home with them.

    Intentionally small and plain-language: the multi-page chart-copy
    "Admission Summary" is the document for clinicians and records;
    this is for the patient. It carries one section per box on the slip:

        * What you came in for
        * What we found
        * Medicines to take home (filled prescriptions only)
        * What to do next (follow-up instructions)
        * When to come back urgently
        * Who to contact

    Available only after discharge — the calling view is responsible
    for that gate.
    """
    buffer = BytesIO()
    document_title = f"Discharge Slip {admission.admission_id}"
    doc = NPADocument(
        buffer,
        department=DEPARTMENT_LINE,
        document_title=document_title,
    )

    styles = npa_styles()
    page_width = doc.usable_width

    story: list = []
    story.append(centered_section_title("PATIENT DISCHARGE SLIP"))

    # Header — patient + admitting/discharging context, kept minimal.
    patient = admission.patient
    age_phrase = ""
    try:
        years = patient.calculate_age() if hasattr(patient, "calculate_age") else None
        age_phrase = f"{years} yrs" if isinstance(years, int) else ""
    except Exception:
        age_phrase = ""

    left_col = [
        ("Patient", patient.get_full_name()),
        ("Patient ID", getattr(patient, "patient_id", "") or "—"),
        ("Sex / Age", " · ".join([x for x in [getattr(patient, "gender", "") or "", age_phrase] if x]) or "—"),
    ]
    middle_col = [
        ("Admission ID", admission.admission_id or "—"),
        ("Ward", admission.ward.name if admission.ward_id else "—"),
        ("Length of stay", _length_of_stay_phrase(admission.length_of_stay)),
    ]
    right_col = [
        ("Admitted", _fmt_date(admission.admission_date)),
        ("Discharged", _fmt_date(admission.discharge_date) if admission.discharge_date else "—"),
        (
            "Discharging Dr.",
            admission.discharge_doctor.get_full_name() if admission.discharge_doctor_id else (
                admission.admitting_doctor.get_full_name() if admission.admitting_doctor_id else "—"
            ),
        ),
    ]
    story.append(patient_info_block(left_col, middle_col, right_col, width=page_width))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.6, color=COLOR_LINE))
    story.append(Spacer(1, 4))

    # 1. What you came in for
    story.append(section_heading("Why you came in"))
    if admission.presenting_complaint:
        story.append(body_paragraph(admission.presenting_complaint))
    if admission.admission_diagnosis:
        story.append(body_paragraph(admission.admission_diagnosis))
    if not admission.presenting_complaint and not admission.admission_diagnosis:
        story.append(italic_paragraph("—"))

    # 2. What we found
    story.append(section_heading("What we found / how it was managed"))
    if admission.discharge_diagnosis:
        story.append(_kv("Final diagnosis", admission.discharge_diagnosis))
    if admission.discharge_summary:
        story.append(body_paragraph(admission.discharge_summary))
    if not admission.discharge_diagnosis and not admission.discharge_summary:
        story.append(italic_paragraph("Speak to your doctor for clinical details."))

    # 3. Medicines to take home — only items with positive dispensed_quantity
    story.append(section_heading("Medicines to take home"))
    take_home_rows: list[list[str]] = []
    pharmacy_rx = _load_pharmacy(admission)
    for rx in pharmacy_rx:
        for item in rx["items"]:
            # Use a coarse heuristic: include the row if dispense info
            # mentions Dispensed/Partial. Fully Pending lines aren't with
            # the patient yet.
            fill_lower = (item.get("fill") or "").lower()
            if "dispensed" in fill_lower or "partial" in fill_lower:
                take_home_rows.append([
                    item["name"],
                    item["dose"],
                    item["frequency"],
                    item["route"],
                    item["duration"],
                ])
    if take_home_rows:
        story.append(
            data_table(
                ["Medicine", "Dose", "How often", "Route", "Duration"],
                take_home_rows,
                col_widths=[
                    page_width * 0.32,
                    page_width * 0.14,
                    page_width * 0.20,
                    page_width * 0.14,
                    page_width * 0.20,
                ],
                italic_col=None,
            )
        )
        story.append(small_paragraph(
            "Take exactly as written. Finish any antibiotic course even if you feel better. "
            "Bring this slip when you collect repeats from pharmacy."
        ))
    else:
        story.append(italic_paragraph("No medicines to take home from this admission."))

    # 4. What to do next
    story.append(section_heading("What to do next"))
    if admission.follow_up_instructions:
        story.append(body_paragraph(admission.follow_up_instructions))
    else:
        story.append(italic_paragraph("Follow up with your doctor as advised."))

    # 5. Come back urgently if…
    story.append(section_heading("Come back urgently if you notice"))
    story.append(body_paragraph(
        "Severe pain, fever > 38.5°C, breathlessness, persistent vomiting, "
        "bleeding, swelling at a wound, fainting, or any concern that worries you."
    ))

    # 6. Escort destination (only if patient was transferred to another facility)
    escort = getattr(admission, "escort", None)
    if escort and (escort.facility_name_snapshot or escort.facility_name):
        story.append(section_heading("You were transferred to"))
        story.append(_kv("Facility", escort.facility_name_snapshot or escort.facility_name))
        if escort.referral and escort.referral.facility_address_snapshot:
            story.append(_kv("Address", escort.referral.facility_address_snapshot))
        if escort.referral and (escort.referral.contact_person or escort.referral.contact_phone):
            story.append(
                _kv(
                    "Receiving contact",
                    " · ".join(
                        [x for x in (escort.referral.contact_person, escort.referral.contact_phone) if x]
                    ),
                )
            )

    # Signature — the doctor's confidence stamp on the patient handout.
    story.append(Spacer(1, 16))
    story.append(
        signature_block(
            left_role="Discharging Doctor",
            left_name=(
                admission.discharge_doctor.get_full_name()
                if admission.discharge_doctor_id
                else admission.admitting_doctor.get_full_name() if admission.admitting_doctor_id else ""
            ),
            right_role="Confirming Nurse",
            right_name=(
                admission.confirmed_by_nurse.get_full_name()
                if admission.confirmed_by_nurse_id
                else ""
            ),
            width=page_width,
        )
    )
    story.append(Spacer(1, 8))
    story.append(small_paragraph(
        "Bring this slip to all follow-up visits. The full clinical record is "
        "kept in your hospital file."
    ))

    doc.build(story, document_serial=admission.admission_id or "")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Referral letter
# ---------------------------------------------------------------------------


def build_referral_letter_pdf(admission) -> bytes:
    """
    Render a formal Referral Letter from the referring doctor to the
    receiving facility.

    Requires that the admission has an external referral linked
    (i.e. ``admission.escort`` with a ``referral`` row). The view layer
    is responsible for that gate so this function can stay focused on
    rendering.
    """
    buffer = BytesIO()
    document_title = f"Referral Letter {admission.admission_id}"
    doc = NPADocument(
        buffer,
        department=DEPARTMENT_LINE,
        document_title=document_title,
    )

    styles = npa_styles()
    page_width = doc.usable_width

    escort = getattr(admission, "escort", None)
    referral = getattr(escort, "referral", None) if escort else None

    story: list = []
    story.append(centered_section_title("REFERRAL LETTER"))
    story.append(Spacer(1, 6))

    # ---------------- date + To-block --------------------------------
    story.append(
        Paragraph(
            f'<font name="{FONT_BOLD}">Date:</font> {_escape(_fmt_date(timezone.now()))}',
            styles["body"],
        )
    )
    story.append(Spacer(1, 4))

    if referral:
        to_lines = [f'<font name="{FONT_BOLD}">To:</font> {_escape(referral.facility or "—")}']
        if getattr(referral, "facility_address_snapshot", "") or "":
            to_lines.append(_escape(referral.facility_address_snapshot))
        attn_bits = []
        if getattr(referral, "contact_person", "") or "":
            attn_bits.append(f"Attn: {referral.contact_person}")
        if getattr(referral, "specialty", "") or "":
            attn_bits.append(f"Dept. of {referral.specialty}")
        if attn_bits:
            to_lines.append(_escape(" · ".join(attn_bits)))
        story.append(Paragraph("<br/>".join(to_lines), styles["body"]))
    else:
        story.append(Paragraph(
            f'<font name="{FONT_BOLD}">To:</font> [Receiving facility — not yet specified]',
            styles["body"],
        ))
    story.append(Spacer(1, 6))

    # ---------------- subject line -----------------------------------
    patient = admission.patient
    age_phrase = ""
    try:
        years = patient.calculate_age() if hasattr(patient, "calculate_age") else None
        age_phrase = f"{years} yrs" if isinstance(years, int) else ""
    except Exception:
        age_phrase = ""

    re_bits = [patient.get_full_name()]
    if getattr(patient, "patient_id", ""):
        re_bits.append(f"ID {patient.patient_id}")
    if getattr(patient, "gender", "") or age_phrase:
        re_bits.append(" · ".join([x for x in [getattr(patient, "gender", "") or "", age_phrase] if x]))
    if admission.admission_id:
        re_bits.append(f"Admission {admission.admission_id}")
    story.append(
        Paragraph(
            f'<font name="{FONT_BOLD}">RE:</font> {_escape(" · ".join(re_bits))}',
            styles["body"],
        )
    )
    story.append(Spacer(1, 4))
    story.append(HRFlowable(width="100%", thickness=0.6, color=COLOR_LINE))
    story.append(Spacer(1, 6))

    # ---------------- salutation + opening ---------------------------
    salutation = "Dear Colleague,"
    if referral and getattr(referral, "contact_person", ""):
        salutation = f"Dear Dr. {referral.contact_person},"
    story.append(body_paragraph(salutation))
    story.append(Spacer(1, 2))

    opening_bits = ["I am referring the above-named patient"]
    if referral and getattr(referral, "specialty", ""):
        opening_bits.append(f"to the {referral.specialty} department")
    if referral and getattr(referral, "urgency", ""):
        urgency_word = _humanize(referral.urgency).lower()
        opening_bits.append(f"on a {urgency_word} basis")
    opening_bits.append("for your kind opinion and continued management.")
    story.append(body_paragraph(" ".join(opening_bits)))

    # ---------------- 1. Brief history -------------------------------
    story.append(section_heading("Brief history"))
    story.append(_kv("Admitted", _fmt_dt(admission.admission_date)))
    story.append(_kv("Length of stay", _length_of_stay_phrase(admission.length_of_stay)))
    if admission.presenting_complaint:
        story.append(_kv("Presenting complaint", admission.presenting_complaint))
    if admission.admission_diagnosis:
        story.append(_kv("Working diagnosis on admission", admission.admission_diagnosis))

    # ---------------- 2. Investigations ------------------------------
    lab_rows = _load_lab(admission)
    rad_rows = _load_radiology(admission)
    if lab_rows or rad_rows:
        story.append(section_heading("Investigations performed"))
    if lab_rows:
        story.append(label_paragraph("Laboratory"))
        lab_text = ", ".join(
            f"{r['test_name']} ({r['result_summary'] or _humanize(r['status']) or '—'})"
            for r in lab_rows[:30]
        )
        story.append(body_paragraph(lab_text))
        story.append(Spacer(1, 2))
    if rad_rows:
        story.append(label_paragraph("Radiology"))
        rad_text = ", ".join(
            f"{r['procedure']} ({r['report_summary'] or _humanize(r['status']) or '—'})"
            for r in rad_rows[:20]
        )
        story.append(body_paragraph(rad_text))

    # ---------------- 3. Treatment given -----------------------------
    pharmacy_rx = _load_pharmacy(admission)
    treats = list(
        admission.treatment_sheet_rows.select_related("recorded_by").order_by("created_at")
    )
    if pharmacy_rx or treats:
        story.append(section_heading("Treatment given"))
    if pharmacy_rx:
        story.append(label_paragraph("Prescriptions"))
        flat_items = []
        for rx in pharmacy_rx:
            for it in rx["items"]:
                bits = [it["name"]]
                if it["dose"] and it["dose"] != "—":
                    bits.append(it["dose"])
                if it["frequency"] and it["frequency"] != "—":
                    bits.append(it["frequency"])
                if it["duration"] and it["duration"] != "—":
                    bits.append(f"× {it['duration']}")
                flat_items.append(" ".join(bits))
        if flat_items:
            story.append(body_paragraph("; ".join(flat_items[:25])))
    if treats:
        story.append(Spacer(1, 2))
        story.append(label_paragraph("Treatments / procedures on the ward"))
        ts_summary = "; ".join(
            f"{t.drug_name or '—'} {t.dosage or ''} {t.route or ''}".strip()
            for t in treats[:25]
        )
        story.append(body_paragraph(ts_summary))

    # ---------------- 4. Current condition ---------------------------
    story.append(section_heading("Current condition"))
    last_vitals = (
        admission.observation_vitals
        .select_related("recorded_by")
        .order_by("-recorded_at")
        .first()
    )
    if last_vitals:
        bp = (
            f"{last_vitals.bp_systolic}/{last_vitals.bp_diastolic}"
            if last_vitals.bp_systolic and last_vitals.bp_diastolic
            else None
        )
        vitals_bits = []
        if last_vitals.temperature_c:
            vitals_bits.append(f"T {last_vitals.temperature_c}°C")
        if last_vitals.pulse:
            vitals_bits.append(f"P {last_vitals.pulse}")
        if last_vitals.respiratory_rate:
            vitals_bits.append(f"RR {last_vitals.respiratory_rate}")
        if bp:
            vitals_bits.append(f"BP {bp}")
        if vitals_bits:
            story.append(
                _kv(
                    f"Latest vitals ({_fmt_dt(last_vitals.recorded_at)})",
                    " · ".join(vitals_bits),
                )
            )
    if admission.current_condition:
        story.append(_kv("Current condition", _humanize(admission.current_condition)))
    if admission.discharge_diagnosis:
        story.append(_kv("Working / final diagnosis", admission.discharge_diagnosis))
    if admission.discharge_summary:
        story.append(_kv("Summary", admission.discharge_summary))

    # ---------------- 5. Reason for referral -------------------------
    if referral and (getattr(referral, "reason", "") or getattr(referral, "clinical_summary", "")):
        story.append(section_heading("Reason for referral"))
        if getattr(referral, "reason", ""):
            story.append(_kv("Reason", referral.reason))
        if getattr(referral, "clinical_summary", ""):
            story.append(body_paragraph(referral.clinical_summary))

    # ---------------- closing + signature ----------------------------
    story.append(Spacer(1, 8))
    story.append(body_paragraph(
        "Kindly continue the patient's management as you see fit. "
        "I will be glad to provide any further information you may require, "
        "and remain available for joint follow-up."
    ))
    story.append(Spacer(1, 4))
    story.append(body_paragraph("Yours sincerely,"))

    referring_doctor_name = ""
    if referral and getattr(referral, "referred_by_id", None):
        try:
            referring_doctor_name = referral.referred_by.get_full_name()
        except Exception:
            referring_doctor_name = ""
    if not referring_doctor_name and admission.discharge_doctor_id:
        referring_doctor_name = admission.discharge_doctor.get_full_name()
    if not referring_doctor_name and admission.admitting_doctor_id:
        referring_doctor_name = admission.admitting_doctor.get_full_name()

    story.append(Spacer(1, 14))
    story.append(
        signature_block(
            left_role="Referring Doctor",
            left_name=referring_doctor_name,
            width=page_width,
        )
    )
    story.append(Spacer(1, 4))
    story.append(small_paragraph(
        "Please return any feedback or follow-up correspondence to the "
        "Ward Management department, quoting the Admission ID above."
    ))

    doc.build(story, document_serial=admission.admission_id or "")
    return buffer.getvalue()


# ---------------------------------------------------------------------------
# Responsibility forms (transfer · DAMA · generic discharge ack)
# ---------------------------------------------------------------------------


RESPONSIBILITY_FORM_TYPES = ("transfer", "dama", "general", "auto")


def _auto_responsibility_form_type(admission) -> str:
    """Pick the right responsibility template based on admission state."""
    if (admission.discharge_type or "") == "against_medical_advice":
        return "dama"
    if (admission.discharge_type or "") == "transfer":
        return "transfer"
    if getattr(admission, "escort", None):
        # Transfer-shaped scenario even when discharge_type isn't set yet.
        return "transfer"
    return "general"


def build_responsibility_form_pdf(admission, form_type: str = "auto") -> bytes:
    """
    Render a Patient / Guardian Responsibility Form for signature.

    ``form_type`` controls the template used:

    * ``"transfer"`` — patient is being transferred to another facility;
      the relative accepts responsibility for transport and acknowledges
      the receiving facility has been briefed.
    * ``"dama"`` — patient is leaving Against Medical Advice; the relative
      accepts the clinical risks of leaving early.
    * ``"general"`` — generic discharge acknowledgment used when neither
      transfer nor DAMA applies (e.g. a regular discharge where local
      policy still wants a signed handout).
    * ``"auto"`` — pick by admission state (default).
    """
    form_type = (form_type or "auto").lower()
    if form_type not in RESPONSIBILITY_FORM_TYPES:
        form_type = "auto"
    if form_type == "auto":
        form_type = _auto_responsibility_form_type(admission)

    buffer = BytesIO()
    document_title = f"Responsibility Form {admission.admission_id}"
    doc = NPADocument(
        buffer,
        department=DEPARTMENT_LINE,
        document_title=document_title,
    )

    styles = npa_styles()
    page_width = doc.usable_width

    # ---------------- title + patient header -------------------------
    title_map = {
        "transfer": "TRANSFER RESPONSIBILITY FORM",
        "dama": "DISCHARGE AGAINST MEDICAL ADVICE",
        "general": "DISCHARGE ACKNOWLEDGMENT FORM",
    }
    story: list = []
    story.append(centered_section_title(title_map[form_type]))
    story.append(Spacer(1, 6))

    patient = admission.patient
    age_phrase = ""
    try:
        years = patient.calculate_age() if hasattr(patient, "calculate_age") else None
        age_phrase = f"{years} yrs" if isinstance(years, int) else ""
    except Exception:
        age_phrase = ""

    left_col = [
        ("Patient", patient.get_full_name()),
        ("Patient ID", getattr(patient, "patient_id", "") or "—"),
        (
            "Sex / Age",
            " · ".join(
                [x for x in [getattr(patient, "gender", "") or "", age_phrase] if x]
            ) or "—",
        ),
    ]
    middle_col = [
        ("Admission ID", admission.admission_id or "—"),
        ("Ward", admission.ward.name if admission.ward_id else "—"),
        ("Bed", getattr(admission.bed, "bed_number", "") if admission.bed_id else "—"),
    ]
    right_col = [
        ("Admitted", _fmt_date(admission.admission_date)),
        (
            "Date of this form",
            _fmt_date(timezone.now()),
        ),
        (
            "Attending Dr.",
            admission.discharge_doctor.get_full_name() if admission.discharge_doctor_id else (
                admission.admitting_doctor.get_full_name() if admission.admitting_doctor_id else "—"
            ),
        ),
    ]
    story.append(patient_info_block(left_col, middle_col, right_col, width=page_width))
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.6, color=COLOR_LINE))
    story.append(Spacer(1, 6))

    # ---------------- declaration block (template-specific) ----------
    long_blank = "_" * 62
    short_blank = "_" * 30

    declaration_intro = (
        f'I, <font name="{FONT_BOLD}">{long_blank}</font> '
        f'(print full name), being the '
        f'<font name="{FONT_BOLD}">patient / parent / guardian / next-of-kin</font>* '
        f'of the above-named patient, hereby acknowledge that:'
    )
    story.append(certification_paragraph(declaration_intro))

    statements: list[str] = []
    if form_type == "transfer":
        escort = getattr(admission, "escort", None)
        referral = getattr(escort, "referral", None) if escort else None
        receiving = (
            (referral.facility if referral else None)
            or (escort.facility_name_snapshot if escort else None)
            or "the receiving facility"
        )
        statements.extend([
            f"1. The patient is being transferred to <font name=\"{FONT_BOLD}\">{_escape(receiving)}</font> "
            "for continued care, and the reasons for the transfer have been explained to me in a language I understand.",
            "2. I accept responsibility for the patient during transport and consent to the mode of "
            "transport arranged by the hospital.",
            "3. I understand that complications, deterioration or unforeseen events may occur during transit, "
            "and I release the referring hospital from liability for events that arise outside its premises.",
            "4. I confirm that I have been provided with the referral letter and any take-home medications "
            "or instructions relevant to this transfer.",
            "5. I will, where possible, notify the referring hospital once the patient has been received at the "
            "destination facility.",
        ])
    elif form_type == "dama":
        statements.extend([
            "1. I am leaving / taking the patient away from this hospital "
            f'<font name="{FONT_BOLD}">against the medical advice</font> of the attending medical team.',
            "2. The medical team has explained, in a language I understand, the current diagnosis, the "
            "recommended treatment plan, and the potential consequences of not continuing in-hospital care — "
            "which may include serious illness, complications, permanent disability or death.",
            "3. I have been given the opportunity to ask questions and my questions have been answered to my "
            "satisfaction.",
            "4. I accept full responsibility for any consequences that may result from this decision, and I "
            "release the hospital and its staff from liability arising from this discharge.",
            "5. I understand that I may return to this hospital for medical care at any time, and that I will "
            "be re-evaluated on return.",
        ])
    else:  # general
        statements.extend([
            "1. The patient's discharge plan, including final diagnosis, take-home medications and "
            "follow-up instructions, has been explained to me in a language I understand.",
            "2. I have received the patient's discharge slip and any prescribed take-home medicines.",
            "3. I will attend the recommended follow-up appointments and return immediately if any of the "
            "warning signs explained to me appear.",
            "4. Any unanswered questions have been raised with the attending staff before signing this form.",
        ])

    for stmt in statements:
        story.append(certification_paragraph(stmt))

    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.4, color=COLOR_LINE))
    story.append(Spacer(1, 4))

    # ---------------- relationship + contact line --------------------
    rel_line = (
        f'Relationship to patient: {short_blank}&nbsp;&nbsp;&nbsp; '
        f'Phone: {short_blank}'
    )
    story.append(small_paragraph(
        "* delete as appropriate. Where the patient is a minor or "
        "incapacitated, the form must be signed by the legal guardian "
        "or next-of-kin."
    ))
    story.append(Spacer(1, 4))
    story.append(Paragraph(rel_line, styles["body"]))
    story.append(Spacer(1, 8))

    # ---------------- signatures -------------------------------------
    # Three-column signature row: patient/relative · witness (nurse) · attending doctor
    attending = (
        admission.discharge_doctor.get_full_name() if admission.discharge_doctor_id
        else admission.admitting_doctor.get_full_name() if admission.admitting_doctor_id
        else ""
    )
    witness_name = ""
    if admission.confirmed_by_nurse_id:
        witness_name = admission.confirmed_by_nurse.get_full_name()
    else:
        # Fall back to the primary escort nurse for transfer-flavoured forms
        # so the bedside witness slot already shows the right person.
        escort = getattr(admission, "escort", None)
        if escort and getattr(escort, "primary_nurse_id", None):
            try:
                witness_name = escort.primary_nurse.get_full_name()
            except Exception:
                witness_name = ""

    story.append(
        signature_block(
            left_role="Patient / Relative signature",
            left_name="",
            right_role="Witness — Nurse",
            right_name=witness_name,
            width=page_width,
        )
    )
    story.append(Spacer(1, 6))
    story.append(
        signature_block(
            left_role="Attending Doctor",
            left_name=attending,
            right_role="Date · Time",
            right_name=_fmt_dt(timezone.now()),
            width=page_width,
        )
    )

    story.append(Spacer(1, 6))
    story.append(small_paragraph(
        "This form forms part of the patient's permanent medical record. "
        "A copy may be issued to the patient / relative on request."
    ))

    doc.build(story, document_serial=admission.admission_id or "")
    return buffer.getvalue()


def _load_radiology(admission) -> list[dict]:
    """Radiology orders + brief report summary."""
    if not admission.visit_id:
        return []
    try:
        from radiology.models import RadiologyOrder
    except Exception:
        return []

    orders = (
        RadiologyOrder.objects.filter(visit_id=admission.visit_id)
        .filter(ordered_at__gte=admission.admission_date)
        .order_by("ordered_at")
    )
    out = []
    for order in orders:
        proc = (
            getattr(order, "procedure_name", "")
            or getattr(getattr(order, "procedure", None), "name", "")
            or "—"
        )
        report = (
            getattr(order, "report_findings", "")
            or getattr(order, "impression", "")
            or ""
        )
        out.append({
            "order_number": getattr(order, "order_number", "")
            or getattr(order, "order_id", "")
            or f"RAD-{order.id}",
            "ordered_at": order.ordered_at,
            "procedure": proc,
            "status": getattr(order, "status", "") or "",
            "report_summary": (report or "")[:160],
        })
    return out
