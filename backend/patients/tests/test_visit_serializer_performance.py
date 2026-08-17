from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import Mock

from django.test import SimpleTestCase

from patients.serializers import VisitSerializer


class VisitSerializerPerformanceTests(SimpleTestCase):
    def test_vitals_uses_prefetched_latest_reading(self):
        vital = SimpleNamespace(
            blood_pressure_systolic=120,
            blood_pressure_diastolic=80,
            heart_rate=72,
            temperature=36.5,
            respiratory_rate=16,
            oxygen_saturation=98,
            weight=70,
            height=175,
            bmi=22.9,
            recorded_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        visit = SimpleNamespace(
            _latest_vital_readings=[vital],
            vital_readings=Mock(side_effect=AssertionError("loaded all visit vitals")),
        )

        result = VisitSerializer().get_vitals(visit)

        self.assertEqual(result["pulse"], "72")
        self.assertEqual(result["bp"], "120/80")
