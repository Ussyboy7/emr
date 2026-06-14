"""Single-request workspace payload for an active consultation session."""

from __future__ import annotations

from consultation.models import ConsultationSession, Diagnosis
from consultation.serializers import DiagnosisSerializer
from eyecare.models import EyeOrder
from eyecare.serializers import EyeOrderSerializer
from laboratory.models import LabOrder
from laboratory.serializers import LabOrderSerializer
from nursing.models import NursingOrder
from nursing.serializers import NursingOrderSerializer
from patients.models import VitalReading
from patients.serializers import VitalReadingSerializer
from pharmacy.models import Prescription
from pharmacy.serializers import PrescriptionSerializer
from physiotherapy.models import PhysioOrder
from physiotherapy.serializers import PhysioOrderSerializer
from radiology.models import RadiologyOrder
from radiology.serializers import RadiologyOrderSerializer


def _paginated_payload(serializer_data: list) -> dict:
    return {"results": serializer_data, "count": len(serializer_data)}


def build_session_workspace_bundle(session: ConsultationSession, *, vitals_limit: int = 10) -> dict:
    """Fetch diagnoses, orders, prescriptions, and vitals for one consultation session."""
    session_id = session.id
    patient_id = session.patient_id
    visit_id = session.visit_id

    diagnoses_qs = (
        Diagnosis.objects.filter(session_id=session_id)
        .select_related("icd10_code", "diagnosed_by", "patient")
        .order_by("-diagnosed_at")
    )
    diagnoses = DiagnosisSerializer(diagnoses_qs, many=True).data

    prescriptions_qs = Prescription.objects.filter(consultation_session_id=session_id)
    if patient_id:
        prescriptions_qs = prescriptions_qs.filter(patient_id=patient_id)
    prescriptions_qs = prescriptions_qs.select_related("patient", "doctor", "visit").prefetch_related(
        "medications", "medications__medication", "medications__generic"
    )
    prescriptions = PrescriptionSerializer(prescriptions_qs, many=True).data

    lab_qs = LabOrder.objects.filter(consultation_session_id=session_id)
    if patient_id:
        lab_qs = lab_qs.filter(patient_id=patient_id)
    lab_qs = lab_qs.select_related("patient", "doctor", "visit").prefetch_related("tests")
    lab_orders = LabOrderSerializer(lab_qs, many=True).data

    radiology_qs = RadiologyOrder.objects.filter(consultation_session_id=session_id)
    if patient_id:
        radiology_qs = radiology_qs.filter(patient_id=patient_id)
    radiology_qs = radiology_qs.select_related("patient", "doctor", "visit").prefetch_related("studies")
    radiology_orders = RadiologyOrderSerializer(radiology_qs, many=True).data

    nursing_qs = NursingOrder.objects.filter(consultation_session_id=session_id)
    if patient_id:
        nursing_qs = nursing_qs.filter(patient_id=patient_id)
    nursing_qs = nursing_qs.select_related("patient", "ordered_by", "visit")
    nursing_orders = NursingOrderSerializer(nursing_qs, many=True).data

    physio_qs = PhysioOrder.objects.filter(consultation_session_id=session_id)
    if patient_id:
        physio_qs = physio_qs.filter(patient_id=patient_id)
    physio_qs = physio_qs.select_related("patient", "ordered_by", "visit")
    physio_orders = PhysioOrderSerializer(physio_qs, many=True).data

    eye_qs = EyeOrder.objects.filter(consultation_session_id=session_id)
    if patient_id:
        eye_qs = eye_qs.filter(patient_id=patient_id)
    eye_qs = eye_qs.select_related("patient", "ordered_by", "visit")
    eye_orders = EyeOrderSerializer(eye_qs, many=True).data

    vitals: list = []
    if visit_id:
        vitals_qs = (
            VitalReading.objects.filter(visit_id=visit_id)
            .select_related("patient", "visit", "recorded_by", "location_clinic")
            .order_by("-recorded_at")[:vitals_limit]
        )
        vitals = VitalReadingSerializer(vitals_qs, many=True).data

    return {
        "diagnoses": _paginated_payload(diagnoses),
        "prescriptions": _paginated_payload(prescriptions),
        "lab_orders": _paginated_payload(lab_orders),
        "radiology_orders": _paginated_payload(radiology_orders),
        "nursing_orders": _paginated_payload(nursing_orders),
        "physio_orders": _paginated_payload(physio_orders),
        "eye_orders": _paginated_payload(eye_orders),
        "vitals": _paginated_payload(vitals),
    }
