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

from common.api_payload import list_payload
from .models import MedicalHistory, Patient, Visit, VitalReading
from .serializers import MedicalHistorySerializer, VisitSerializer, VitalReadingSerializer

_OVERVIEW_LIMIT = 100


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
        .select_related(
            "study",
            "study__order",
            "study__order__patient",
            "study__verified_by",
            "order",
            "patient",
        )
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
        .select_related("patient", "visit", "visit__location_clinic", "recorded_by")
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
        .order_by("-admission_date")[:_OVERVIEW_LIMIT],
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
        AnnualCheckup.objects.filter(patient_id=pid).order_by("-programme_year", "-created_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    from patients.models import PatientClinicalDocument
    from patients.serializers import PatientClinicalDocumentSerializer

    clinical_documents = PatientClinicalDocumentSerializer(
        PatientClinicalDocument.objects.filter(patient_id=pid)
        .select_related("uploaded_by", "referral")
        .order_by("-document_date", "-uploaded_at")[:_OVERVIEW_LIMIT],
        many=True,
    ).data

    history, _created = MedicalHistory.objects.get_or_create(patient=patient)
    medical_history = MedicalHistorySerializer(history).data

    return {
        "consultations": list_payload(consultations),
        "lab_results": list_payload(lab_results),
        "radiology_reports": list_payload(radiology_reports),
        "radiology_orders": list_payload(radiology_orders),
        "prescriptions": list_payload(prescriptions),
        "vitals": list_payload(vitals),
        "physio_orders": list_payload(physio_orders),
        "eye_orders": list_payload(eye_orders),
        "ward_admissions": list_payload(ward_admissions),
        "certificates": list_payload(certificates),
        "referrals": list_payload(referrals),
        "clinical_documents": list_payload(clinical_documents),
        "visits": visits,
        "annual_checkups": list_payload(annual_checkups),
        "medical_history": medical_history,
    }
