"""Lab order and test volume statistics for MR reports."""
from __future__ import annotations

from datetime import date

from laboratory.models import LabOrder, LabTest

PRIORITY_LABELS = {
    "routine": "Routine",
    "urgent": "Urgent",
    "stat": "STAT",
}

STATUS_LABELS = {
    "pending": "Pending",
    "sample_collected": "Sample collected",
    "processing": "Processing",
    "results_ready": "Results ready",
    "rejected": "Rejected",
    "verified": "Verified",
}

PENDING_TEST_STATUSES = ("pending", "sample_collected", "processing", "results_ready")


def _pct(count: int, total: int) -> float:
    return round((count / total * 100) if total > 0 else 0, 1)


def build_lab_statistics_report(period_start: date, period_end: date) -> dict:
    orders = LabOrder.objects.filter(
        ordered_at__date__gte=period_start,
        ordered_at__date__lte=period_end,
        patient__isnull=False,
    )
    tests = LabTest.objects.filter(order__in=orders)

    total_orders = orders.count()
    total_tests = tests.count()
    distinct_patients = orders.values("patient").distinct().count()
    tests_completed = tests.filter(status="verified").count()
    tests_pending = tests.filter(status__in=PENDING_TEST_STATUSES).count()

    priority_breakdown = []
    for priority, label in PRIORITY_LABELS.items():
        count = orders.filter(priority=priority).count()
        if count > 0:
            priority_breakdown.append(
                {
                    "key": priority,
                    "label": label,
                    "count": count,
                    "percentage": _pct(count, total_orders),
                }
            )

    status_breakdown = []
    for status, label in STATUS_LABELS.items():
        count = tests.filter(status=status).count()
        if count > 0:
            status_breakdown.append(
                {
                    "key": status,
                    "label": label,
                    "count": count,
                    "percentage": _pct(count, total_tests),
                }
            )

    return {
        "period_start": period_start.isoformat(),
        "period_end": period_end.isoformat(),
        "summary": {
            "total_orders": total_orders,
            "total_tests": total_tests,
            "distinct_patients": distinct_patients,
            "tests_completed": tests_completed,
            "tests_pending": tests_pending,
        },
        "priority_breakdown": priority_breakdown,
        "status_breakdown": status_breakdown,
        "by_priority": {p: orders.filter(priority=p).count() for p in PRIORITY_LABELS},
        "by_status": {s: tests.filter(status=s).count() for s in STATUS_LABELS},
        "total_orders": total_orders,
        "tests_completed": tests_completed,
        "tests_pending": tests_pending,
    }
