"""
Eyecare views.
"""
from django.http import JsonResponse
from django.utils.decorators import method_decorator
from django.views import View
from django.views.decorators.csrf import csrf_exempt
from django.utils.dateparse import parse_datetime
from django.utils import timezone
from .analytics import build_eyecare_analytics


@method_decorator(csrf_exempt, name='dispatch')
class EyecareAnalyticsSummaryView(View):
    """
    API view for eyecare analytics summary.
    """

    def get(self, request):
        """Return eyecare analytics data."""
        # Get date range from query params
        start_date_str = request.GET.get('start_date')
        end_date_str = request.GET.get('end_date')

        # Default to last 30 days if not provided
        if not start_date_str or not end_date_str:
            end_date = timezone.now()
            start_date = end_date - timezone.timedelta(days=30)
        else:
            start_date = parse_datetime(start_date_str) or (timezone.now() - timezone.timedelta(days=30))
            end_date = parse_datetime(end_date_str) or timezone.now()

        # Ensure start_date is timezone aware
        if timezone.is_naive(start_date):
            start_date = timezone.make_aware(start_date)
        if timezone.is_naive(end_date):
            end_date = timezone.make_aware(end_date)

        analytics_data = build_eyecare_analytics(start_date, end_date)

        return JsonResponse(analytics_data)