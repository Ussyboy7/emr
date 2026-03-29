"""
Celery tasks for the consultation app.
"""

import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger(__name__)


@shared_task(name="consultation.tasks.close_cleared_referrals_monthly_task", ignore_result=True)
def close_cleared_referrals_monthly_task() -> None:
    """Month-end auto-close for Records-acknowledged referrals (see close_cleared_referrals_monthly command)."""
    try:
        call_command("close_cleared_referrals_monthly", verbosity=1)
    except Exception:
        logger.exception("close_cleared_referrals_monthly_task failed")
        raise
