"""
URL configuration for the Eyecare app.
"""
from django.urls import path
from .views import EyecareAnalyticsSummaryView

urlpatterns = [
    path('eyecare/analytics/summary/', EyecareAnalyticsSummaryView.as_view(), name='eyecare-analytics-summary'),
]