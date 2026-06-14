"""Celery tasks for HR annual check-up reminders."""

import logging

from celery import shared_task
from django.core.management import call_command

logger = logging.getLogger(__name__)


@shared_task(name="hr.tasks.send_annual_checkup_reminders_task", ignore_result=True)
def send_annual_checkup_reminders_task() -> None:
    try:
        call_command("send_annual_checkup_reminders", verbosity=1)
    except Exception:
        logger.exception("send_annual_checkup_reminders_task failed")
        raise
