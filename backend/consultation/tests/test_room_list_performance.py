from types import SimpleNamespace
from unittest.mock import Mock

from django.test import SimpleTestCase

from consultation.serializers import ConsultationRoomSerializer


class RoomListPerformanceTests(SimpleTestCase):
    def test_queue_count_uses_queryset_annotation(self):
        room = SimpleNamespace(
            queue_count=4,
            queue_items=Mock(side_effect=AssertionError("counted queue per room")),
        )

        self.assertEqual(ConsultationRoomSerializer().get_queue_count(room), 4)
