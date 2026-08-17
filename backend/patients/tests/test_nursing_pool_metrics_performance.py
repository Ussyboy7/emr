from datetime import date, time
from unittest.mock import patch

from django.db.models.query import QuerySet
from rest_framework import status
from rest_framework.test import APITestCase

from common.tests.support import create_test_patient_visit, create_test_user
from consultation.models import ConsultationRoom
from patients.models import Visit


class NursingPoolMetricsPerformanceTests(APITestCase):
    def setUp(self):
        self.nurse = create_test_user(
            "metrics_nurse",
            pages=["/nursing/pool-queue"],
            system_role="Nurse",
        )
        self.client.force_authenticate(user=self.nurse)
        _, self.visit = create_test_patient_visit(patient_id="METRICS-001")
        self.visit.status = "in_progress"
        self.visit.date = date.today()
        self.visit.time = time(8, 0)
        self.visit.save(update_fields=["status", "date", "time"])
        ConsultationRoom.objects.create(name="Metrics Room", room_number="MET-1")

    def test_metrics_does_not_materialize_all_visit_ids(self):
        original_values_list = QuerySet.values_list

        def reject_visit_materialization(queryset, *args, **kwargs):
            if queryset.model is Visit:
                raise AssertionError("nursing metrics materialized all visit ids")
            return original_values_list(queryset, *args, **kwargs)

        with patch.object(QuerySet, "values_list", new=reject_visit_materialization):
            response = self.client.get(
                "/api/v1/visits/nursing-pool-metrics/",
                {"date": date.today().isoformat()},
            )

        self.assertEqual(response.status_code, status.HTTP_200_OK)
