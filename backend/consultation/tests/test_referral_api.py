"""API tests for ReferralViewSet — CRUD, workflow actions, filtering, and auth."""
from datetime import date, time

from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APITestCase

from consultation.models import (
    ConsultationRoom,
    ConsultationSession,
    Referral,
    ReferralFacility,
    ResponsibilityFormIssuance,
)
from patients.models import Patient, Visit

User = get_user_model()

BASE_URL = "/api/v1/consultation/referrals/"


class ReferralSetupMixin:
    """Shared setUp: user, patient, visit, session, and facility."""

    def setUp(self):
        self.user = User.objects.create_superuser(
            username="ref_dr",
            password="testpass123",
            email="ref_dr@test.local",
            first_name="Ref",
            last_name="Doctor",
        )
        self.client.force_authenticate(user=self.user)

        self.patient = Patient.objects.create(
            patient_id="REF-PT-001",
            surname="Doe",
            first_name="Jane",
            gender="female",
            date_of_birth=date(1990, 3, 15),
        )
        self.patient2 = Patient.objects.create(
            patient_id="REF-PT-002",
            surname="Smith",
            first_name="John",
            gender="male",
            date_of_birth=date(1985, 7, 20),
        )

        self.visit = Visit.objects.create(
            patient=self.patient,
            date=date.today(),
            time=time(10, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.room = ConsultationRoom.objects.create(
            name="Referral Room 1",
            room_number="REF-R1",
        )
        self.session = ConsultationSession.objects.create(
            room=self.room,
            patient=self.patient,
            doctor=self.user,
            visit=self.visit,
        )

        self.facility_partner = ReferralFacility.objects.create(
            name="City General Hospital",
            code="CGH",
            facility_type="external",
            address="123 Main St, Cityville",
            contact_person_title="The Medical Director",
            is_active=True,
        )

    def _referral_payload(self, **overrides):
        defaults = {
            "patient": self.patient.pk,
            "visit": self.visit.pk,
            "session": self.session.pk,
            "specialty": "Cardiology",
            "facility": "City General Hospital",
            "facility_partner": self.facility_partner.pk,
            "facility_type": "external",
            "reason": "Suspected cardiac arrhythmia requiring specialist evaluation",
            "clinical_summary": "Patient presents with palpitations and syncope.",
            "urgency": "routine",
            "contact_person": "Dr. Heart",
            "contact_phone": "+234-800-111-2222",
            "contact_email": "heart@citygen.local",
            "notes": "Patient aware of referral.",
        }
        defaults.update(overrides)
        return defaults

    def _create_referral(self, **overrides):
        """Persist a Referral via the ORM (bypasses API)."""
        defaults = {
            "patient": self.patient,
            "visit": self.visit,
            "session": self.session,
            "referred_by": self.user,
            "created_by": self.user,
            "specialty": "Cardiology",
            "facility": "City General Hospital",
            "facility_partner": self.facility_partner,
            "facility_type": "external",
            "reason": "Suspected cardiac arrhythmia",
            "clinical_summary": "Palpitations and syncope",
            "urgency": "routine",
            "status": "draft",
        }
        defaults.update(overrides)
        return Referral.objects.create(**defaults)


class ReferralCreateTests(ReferralSetupMixin, APITestCase):
    """POST /api/v1/consultation/referrals/"""

    def test_create_referral_returns_201(self):
        resp = self.client.post(BASE_URL, self._referral_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["specialty"], "Cardiology")
        self.assertEqual(resp.data["urgency"], "routine")
        self.assertEqual(resp.data["facility"], "City General Hospital")
        self.assertEqual(resp.data["status"], "draft")

    def test_create_auto_generates_referral_id(self):
        resp = self.client.post(BASE_URL, self._referral_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertTrue(resp.data["referral_id"].startswith("REF-"))

    def test_create_sets_referred_by_and_created_by(self):
        resp = self.client.post(BASE_URL, self._referral_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["referred_by"], self.user.pk)
        self.assertEqual(resp.data["created_by"], self.user.pk)

    def test_create_with_urgent_urgency(self):
        payload = self._referral_payload(urgency="urgent")
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["urgency"], "urgent")

    def test_create_with_emergency_urgency(self):
        payload = self._referral_payload(urgency="emergency")
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["urgency"], "emergency")

    def test_create_without_required_fields_returns_400(self):
        resp = self.client.post(BASE_URL, {"notes": "incomplete"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_without_patient_returns_400(self):
        payload = self._referral_payload()
        del payload["patient"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_without_reason_returns_400(self):
        payload = self._referral_payload()
        del payload["reason"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_without_specialty_returns_400(self):
        payload = self._referral_payload()
        del payload["specialty"]
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_snapshots_facility_address_from_partner(self):
        resp = self.client.post(BASE_URL, self._referral_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["facility_address_snapshot"], "123 Main St, Cityville")

    def test_create_without_facility_partner_uses_free_text(self):
        payload = self._referral_payload(
            facility_partner=None,
            facility="One-off Clinic",
        )
        resp = self.client.post(BASE_URL, payload, format="json")
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["facility"], "One-off Clinic")
        self.assertIsNone(resp.data["facility_partner"])


class ReferralRetrieveTests(ReferralSetupMixin, APITestCase):
    """GET /api/v1/consultation/referrals/{id}/"""

    def test_retrieve_referral(self):
        ref = self._create_referral()
        resp = self.client.get(f"{BASE_URL}{ref.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["id"], ref.pk)
        self.assertEqual(resp.data["specialty"], "Cardiology")
        self.assertEqual(resp.data["patient_name"], self.patient.get_full_name())
        self.assertIn("referred_by_name", resp.data)
        self.assertIn("facility_partner_detail", resp.data)

    def test_retrieve_nonexistent_returns_404(self):
        resp = self.client.get(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)

    def test_retrieve_includes_responsibility_forms_count(self):
        ref = self._create_referral()
        resp = self.client.get(f"{BASE_URL}{ref.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["responsibility_forms_count"], 0)


class ReferralUpdateTests(ReferralSetupMixin, APITestCase):
    """PATCH /api/v1/consultation/referrals/{id}/"""

    def test_patch_urgency(self):
        ref = self._create_referral()
        resp = self.client.patch(f"{BASE_URL}{ref.pk}/", {"urgency": "urgent"}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["urgency"], "urgent")

    def test_patch_reason(self):
        ref = self._create_referral()
        resp = self.client.patch(
            f"{BASE_URL}{ref.pk}/",
            {"reason": "Updated reason for referral"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["reason"], "Updated reason for referral")

    def test_patch_clinical_summary(self):
        ref = self._create_referral()
        resp = self.client.patch(
            f"{BASE_URL}{ref.pk}/",
            {"clinical_summary": "Updated summary with new lab results"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["clinical_summary"], "Updated summary with new lab results")

    def test_patch_specialty(self):
        ref = self._create_referral()
        resp = self.client.patch(
            f"{BASE_URL}{ref.pk}/",
            {"specialty": "Neurology"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["specialty"], "Neurology")


class ReferralDeleteTests(ReferralSetupMixin, APITestCase):
    """DELETE /api/v1/consultation/referrals/{id}/"""

    def test_delete_referral(self):
        ref = self._create_referral()
        resp = self.client.delete(f"{BASE_URL}{ref.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_204_NO_CONTENT)
        self.assertFalse(Referral.objects.filter(pk=ref.pk).exists())

    def test_delete_nonexistent_returns_404(self):
        resp = self.client.delete(f"{BASE_URL}99999/")
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ReferralListTests(ReferralSetupMixin, APITestCase):
    """GET /api/v1/consultation/referrals/"""

    def setUp(self):
        super().setUp()
        self.ref1 = self._create_referral()
        self.ref2 = self._create_referral(urgency="urgent", specialty="Neurology")
        self.visit2 = Visit.objects.create(
            patient=self.patient2,
            date=date.today(),
            time=time(11, 0),
            status="in_progress",
            visit_type="consultation",
            clinic="GOPD",
        )
        self.ref3 = self._create_referral(
            patient=self.patient2,
            visit=self.visit2,
            session=None,
            specialty="Ophthalmology",
            status="submitted_to_records",
        )

    def test_list_all(self):
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 3)

    def test_filter_by_patient(self):
        resp = self.client.get(BASE_URL, {"patient": self.patient.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 2)
        for item in resp.data["results"]:
            self.assertEqual(item["patient"], self.patient.pk)

    def test_filter_by_status(self):
        resp = self.client.get(BASE_URL, {"status": "submitted_to_records"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["status"], "submitted_to_records")

    def test_filter_by_urgency(self):
        resp = self.client.get(BASE_URL, {"urgency": "urgent"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["urgency"], "urgent")

    def test_filter_by_specialty(self):
        resp = self.client.get(BASE_URL, {"specialty": "Ophthalmology"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)
        self.assertEqual(resp.data["results"][0]["specialty"], "Ophthalmology")

    def test_filter_by_visit(self):
        resp = self.client.get(BASE_URL, {"visit": self.visit2.pk})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data["results"]), 1)

    def test_search_by_reason(self):
        resp = self.client.get(BASE_URL, {"search": "arrhythmia"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(resp.data["results"]) >= 1)

    def test_search_by_facility(self):
        resp = self.client.get(BASE_URL, {"search": "City General"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertTrue(len(resp.data["results"]) >= 1)

    def test_ordering_by_referred_at(self):
        resp = self.client.get(BASE_URL, {"ordering": "-referred_at"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        ids = [r["id"] for r in resp.data["results"]]
        self.assertEqual(ids[0], self.ref3.pk)

    def test_exclude_draft_filter(self):
        resp = self.client.get(BASE_URL, {"exclude_draft": "true"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            self.assertNotEqual(item["status"], "draft")

    def test_exclude_status_filter(self):
        resp = self.client.get(BASE_URL, {"exclude_status": "draft,submitted_to_records"})
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        for item in resp.data["results"]:
            self.assertNotIn(item["status"], ["draft", "submitted_to_records"])


class ReferralSubmitToRecordsTests(ReferralSetupMixin, APITestCase):
    """POST /api/v1/consultation/referrals/{id}/submit_to_records/"""

    def test_submit_draft_with_forms_succeeds(self):
        ref = self._create_referral(status="draft")
        ResponsibilityFormIssuance.objects.create(
            referral=ref,
            sequence_number=1,
            valid_from=date.today(),
            valid_to=date.today(),
            status="active",
            issued_by=self.user,
        )
        resp = self.client.post(f"{BASE_URL}{ref.pk}/submit_to_records/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "submitted_to_records")

    def test_submit_draft_without_forms_returns_400(self):
        ref = self._create_referral(status="draft")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/submit_to_records/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_submit_non_draft_returns_400(self):
        ref = self._create_referral(status="submitted_to_records")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/submit_to_records/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ReferralApproveForFormsTests(ReferralSetupMixin, APITestCase):
    """POST /api/v1/consultation/referrals/{id}/approve_for_forms/"""

    def test_approve_records_review_succeeds(self):
        ref = self._create_referral(status="records_review")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/approve_for_forms/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "approved_for_forms")
        self.assertIsNotNone(resp.data["approved_at"])

    def test_approve_non_review_returns_400(self):
        ref = self._create_referral(status="draft")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/approve_for_forms/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ReferralReturnForCorrectionTests(ReferralSetupMixin, APITestCase):
    """POST /api/v1/consultation/referrals/{id}/return_for_correction/"""

    def test_return_submitted_referral(self):
        ref = self._create_referral(status="submitted_to_records")
        resp = self.client.post(
            f"{BASE_URL}{ref.pk}/return_for_correction/",
            {"notes": "Missing clinical summary detail."},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "returned_for_correction")
        self.assertIn("Missing clinical summary detail", resp.data["notes"])

    def test_return_records_review_referral(self):
        ref = self._create_referral(status="records_review")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/return_for_correction/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "returned_for_correction")

    def test_return_draft_returns_400(self):
        ref = self._create_referral(status="draft")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/return_for_correction/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ReferralCloseTests(ReferralSetupMixin, APITestCase):
    """POST /api/v1/consultation/referrals/{id}/close_referral/"""

    def test_close_approved_referral(self):
        ref = self._create_referral(status="approved_for_forms")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/close_referral/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(resp.data["status"], "closed")
        self.assertIsNotNone(resp.data["closed_at"])

    def test_close_draft_returns_400(self):
        ref = self._create_referral(status="draft")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/close_referral/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_close_submitted_returns_400(self):
        ref = self._create_referral(status="submitted_to_records")
        resp = self.client.post(f"{BASE_URL}{ref.pk}/close_referral/")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ReferralAcknowledgeResponsibilityFormTests(ReferralSetupMixin, APITestCase):
    """POST /api/v1/consultation/referrals/{id}/acknowledge_responsibility_form/"""

    def setUp(self):
        super().setUp()
        self.ref = self._create_referral(status="submitted_to_records")
        self.form1 = ResponsibilityFormIssuance.objects.create(
            referral=self.ref,
            sequence_number=1,
            valid_from=date.today(),
            valid_to=date.today(),
            status="active",
            issued_by=self.user,
        )

    def test_acknowledge_stamps_form(self):
        resp = self.client.post(
            f"{BASE_URL}{self.ref.pk}/acknowledge_responsibility_form/",
            {"form_id": self.form1.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIsNotNone(resp.data["records_acknowledged_at"])
        self.assertEqual(resp.data["records_acknowledged_by"], self.user.pk)

    def test_acknowledge_all_forms_promotes_referral(self):
        resp = self.client.post(
            f"{BASE_URL}{self.ref.pk}/acknowledge_responsibility_form/",
            {"form_id": self.form1.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.ref.refresh_from_db()
        self.assertEqual(self.ref.status, "approved_for_forms")

    def test_acknowledge_partial_does_not_promote(self):
        self.form2 = ResponsibilityFormIssuance.objects.create(
            referral=self.ref,
            sequence_number=2,
            valid_from=date.today(),
            valid_to=date.today(),
            status="active",
            issued_by=self.user,
        )
        resp = self.client.post(
            f"{BASE_URL}{self.ref.pk}/acknowledge_responsibility_form/",
            {"form_id": self.form1.pk},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.ref.refresh_from_db()
        self.assertEqual(self.ref.status, "submitted_to_records")

    def test_acknowledge_without_form_id_returns_400(self):
        resp = self.client.post(
            f"{BASE_URL}{self.ref.pk}/acknowledge_responsibility_form/",
            {},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_acknowledge_nonexistent_form_returns_404(self):
        resp = self.client.post(
            f"{BASE_URL}{self.ref.pk}/acknowledge_responsibility_form/",
            {"form_id": 99999},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_404_NOT_FOUND)


class ReferralFormsTests(ReferralSetupMixin, APITestCase):
    """GET/POST /api/v1/consultation/referrals/{id}/forms/"""

    def test_list_forms_empty(self):
        ref = self._create_referral()
        resp = self.client.get(f"{BASE_URL}{ref.pk}/forms/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertEqual(len(resp.data), 0)

    def test_create_form_issuance(self):
        ref = self._create_referral()
        resp = self.client.post(
            f"{BASE_URL}{ref.pk}/forms/",
            {"valid_from": str(date.today()), "valid_to": str(date.today())},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_201_CREATED)
        self.assertEqual(resp.data["sequence_number"], 1)

    def test_create_form_without_dates_returns_400(self):
        ref = self._create_referral()
        resp = self.client.post(f"{BASE_URL}{ref.pk}/forms/", {}, format="json")
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)

    def test_create_form_invalid_date_range_returns_400(self):
        ref = self._create_referral()
        resp = self.client.post(
            f"{BASE_URL}{ref.pk}/forms/",
            {"valid_from": "2025-12-31", "valid_to": "2025-01-01"},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_400_BAD_REQUEST)


class ReferralListStatsTests(ReferralSetupMixin, APITestCase):
    """GET /api/v1/consultation/referrals/list-stats/"""

    def setUp(self):
        super().setUp()
        self._create_referral(status="submitted_to_records")
        self._create_referral(status="records_review")
        self._create_referral(status="approved_for_forms")

    def test_list_stats_returns_counts(self):
        resp = self.client.get(f"{BASE_URL}list-stats/")
        self.assertEqual(resp.status_code, status.HTTP_200_OK)
        self.assertIn("total", resp.data)
        self.assertIn("submitted", resp.data)
        self.assertIn("inReview", resp.data)
        self.assertIn("approved", resp.data)
        self.assertEqual(resp.data["total"], 3)
        self.assertEqual(resp.data["submitted"], 1)
        self.assertEqual(resp.data["inReview"], 1)
        self.assertEqual(resp.data["approved"], 1)


class ReferralAuthTests(ReferralSetupMixin, APITestCase):
    """Unauthenticated requests must be rejected with 401."""

    def test_list_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.get(BASE_URL)
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_create_unauthenticated_returns_401(self):
        self.client.force_authenticate(user=None)
        resp = self.client.post(BASE_URL, self._referral_payload(), format="json")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_retrieve_unauthenticated_returns_401(self):
        ref = self._create_referral()
        self.client.force_authenticate(user=None)
        resp = self.client.get(f"{BASE_URL}{ref.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_delete_unauthenticated_returns_401(self):
        ref = self._create_referral()
        self.client.force_authenticate(user=None)
        resp = self.client.delete(f"{BASE_URL}{ref.pk}/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_submit_to_records_unauthenticated_returns_401(self):
        ref = self._create_referral()
        self.client.force_authenticate(user=None)
        resp = self.client.post(f"{BASE_URL}{ref.pk}/submit_to_records/")
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)

    def test_acknowledge_form_unauthenticated_returns_401(self):
        ref = self._create_referral()
        self.client.force_authenticate(user=None)
        resp = self.client.post(
            f"{BASE_URL}{ref.pk}/acknowledge_responsibility_form/",
            {"form_id": 1},
            format="json",
        )
        self.assertEqual(resp.status_code, status.HTTP_401_UNAUTHORIZED)
