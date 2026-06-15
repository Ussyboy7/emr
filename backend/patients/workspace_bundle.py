"""Shared workspace bundle builder for visit- and session-scoped clinical data."""

from __future__ import annotations

from consultation.models import Diagnosis
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

from common.api_payload import list_payload

_VITALS_SELECT = ("patient", "visit", "visit__location_clinic", "recorded_by")


def build_workspace_bundle(
    *,
    diagnosis_filter: dict,
    order_filter: dict,
    patient_id: int | None,
    vitals_visit_id: int | None,
    vitals_limit: int = 10,
) -> dict:
    """Fetch diagnoses, orders, prescriptions, and vitals for one visit or session."""
    diagnoses = DiagnosisSerializer(
        Diagnosis.objects.filter(**diagnosis_filter)
        .select_related("icd10_code", "diagnosed_by", "patient")
        .order_by("-diagnosed_at"),
        many=True,
    ).data

    prescriptions_qs = Prescription.objects.filter(**order_filter)
    if patient_id:
        prescriptions_qs = prescriptions_qs.filter(patient_id=patient_id)
    prescriptions = PrescriptionSerializer(
        prescriptions_qs.select_related("patient", "doctor", "visit").prefetch_related(
            "medications", "medications__medication", "medications__generic"
        ),
        many=True,
    ).data

    lab_qs = LabOrder.objects.filter(**order_filter)
    if patient_id:
        lab_qs = lab_qs.filter(patient_id=patient_id)
    lab_orders = LabOrderSerializer(
        lab_qs.select_related("patient", "doctor", "visit").prefetch_related("tests"),
        many=True,
    ).data

    radiology_qs = RadiologyOrder.objects.filter(**order_filter)
    if patient_id:
        radiology_qs = radiology_qs.filter(patient_id=patient_id)
    radiology_orders = RadiologyOrderSerializer(
        radiology_qs.select_related("patient", "doctor", "visit").prefetch_related("studies"),
        many=True,
    ).data

    nursing_qs = NursingOrder.objects.filter(**order_filter)
    if patient_id:
        nursing_qs = nursing_qs.filter(patient_id=patient_id)
    nursing_orders = NursingOrderSerializer(
        nursing_qs.select_related("patient", "ordered_by", "visit"),
        many=True,
    ).data

    physio_qs = PhysioOrder.objects.filter(**order_filter)
    if patient_id:
        physio_qs = physio_qs.filter(patient_id=patient_id)
    physio_orders = PhysioOrderSerializer(
        physio_qs.select_related("patient", "ordered_by", "visit"),
        many=True,
    ).data

    eye_qs = EyeOrder.objects.filter(**order_filter)
    if patient_id:
        eye_qs = eye_qs.filter(patient_id=patient_id)
    eye_orders = EyeOrderSerializer(
        eye_qs.select_related("patient", "ordered_by", "visit"),
        many=True,
    ).data

    vitals: list = []
    if vitals_visit_id:
        vitals = VitalReadingSerializer(
            VitalReading.objects.filter(visit_id=vitals_visit_id)
            .select_related(*_VITALS_SELECT)
            .order_by("-recorded_at")[:vitals_limit],
            many=True,
        ).data

    return {
        "diagnoses": list_payload(diagnoses),
        "prescriptions": list_payload(prescriptions),
        "lab_orders": list_payload(lab_orders),
        "radiology_orders": list_payload(radiology_orders),
        "nursing_orders": list_payload(nursing_orders),
        "physio_orders": list_payload(physio_orders),
        "eye_orders": list_payload(eye_orders),
        "vitals": list_payload(vitals),
    }
