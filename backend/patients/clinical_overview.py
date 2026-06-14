"""Aggregate patient clinical data for history panels (one request)."""

from __future__ import annotations

from consultation.models import ConsultationSession, Referral
from consultation.serializers import ConsultationSessionSerializer, ReferralSerializer
from eyecare.models import EyeOrder
from eyecare.serializers import EyeOrderSerializer
from laboratory.models import LabTest
from laboratory.serializers import LabTestSerializer
from physiotherapy.models import PhysioOrder
from physiotherapy.serializers import PhysioOrderSerializer
from pharmacy.models import Prescription
from pharmacy.serializers import PrescriptionSerializer
from radiology.models import RadiologyOrder, RadiologyReport
from radiology.serializers import RadiologyOrderSerializer, RadiologyReportSerializer
from wards.models import PatientAdmission
from wards.serializers import PatientAdmissionSerializer

from .models import MedicalHistory, Patient, Visit, VitalReading
from .serializers import MedicalHistorySerializer, VisitSerializer, VitalReadingSerializer

_OVERVIEW_LIMIT = 100


def _list_payload(data: list) -> dict:
    return {"results": data, "count": len(data)}


def build_patient_clinical_overview(patient: Patient) -> dict:
    pid = patient.id

    consultations = ConsultationSessionSerializer(
        ConsultationSession.objects.filter(patient_id=pid)
        .select_related("room", "patient", "doctor", "visit")
        .order_by("-started_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    lab_results = LabTestSerializer(
        LabTest.objects.filter(
            order__patient_id=pid,
            status__in=["results_ready", "verified"],
        )
        .select_related("order", "order__patient", "template")
        .order_by("-verified_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    radiology_reports = RadiologyReportSerializer(
        RadiologyReport.objects.filter(study__order__patient_id=pid, study__status="verified")
        .select_related("study", "study__order", "study__order__patient", "verified_by")
        .order_by("-study__verified_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    radiology_orders = RadiologyOrderSerializer(
        RadiologyOrder.objects.filter(patient_id=pid)
        .select_related("patient", "doctor", "visit")
        .prefetch_related("studies")
        .order_by("-ordered_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    prescriptions = PrescriptionSerializer(
        Prescription.objects.filter(patient_id=pid)
        .select_related("patient", "doctor", "visit")
        .prefetch_related("medications")
        .order_by("-prescribed_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    vitals = VitalReadingSerializer(
        VitalReading.objects.filter(patient_id=pid)
        .select_related("patient", "visit", "recorded_by", "location_clinic")
        .order_by("-recorded_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    physio_orders = PhysioOrderSerializer(
        PhysioOrder.objects.filter(patient_id=pid)
        .select_related("patient", "ordered_by", "visit")
        .order_by("-ordered_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    eye_orders = EyeOrderSerializer(
        EyeOrder.objects.filter(patient_id=pid)
        .select_related("patient", "ordered_by", "visit")
        .order_by("-ordered_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    ward_admissions = PatientAdmissionSerializer(
        PatientAdmission.objects.filter(patient_id=pid)
        .select_related("patient", "ward", "visit")
        .order_by("-admitted_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    from patients.models import MedicalCertificate
    from patients.serializers import MedicalCertificateSerializer

    certificates = MedicalCertificateSerializer(
        MedicalCertificate.objects.filter(patient_id=pid).order_by("-issued_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    referrals = ReferralSerializer(
        Referral.objects.filter(patient_id=pid)
        .select_related("patient", "visit", "session", "referred_by", "facility_partner")
        .order_by("-referred_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    visits = VisitSerializer(
        Visit.objects.filter(patient_id=pid)
        .select_related("patient", "doctor", "created_by")
        .order_by("-date", "-time")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    from patients.models import AnnualCheckup
    from patients.serializers import AnnualCheckupSerializer

    annual_checkups = AnnualCheckupSerializer(
        AnnualCheckup.objects.filter(patient_id=pid).order_by("-checkup_date")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    history, _created = MedicalHistory.objects.get_or_create(patient=patient)
    medical_history = MedicalHistorySerializer(history).data

    return {
        "consultations": _list_payload(consultations),
        "lab_results": _list_payload(lab_results),
        "radiology_reports": _list_payload(radiology_reports),
        "radiology_orders": _list_payload(radiology_orders),
        "prescriptions": _list_payload(prescriptions),
        "vitals": _list_payload(vitals),
        "physio_orders": _list_payload(physio_orders),
        "eye_orders": _list_payload(eye_orders),
        "ward_admissions": _list_payload(ward_admissions),
        "certificates": _list_payload(certificates),
        "referrals": _list_payload(referrals),
        "visits": visits,
        "annual_checkups": _list_payload(annual_checkups),
        "medical_history": medical_history,
    }
