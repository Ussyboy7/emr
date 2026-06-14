"""
URL configuration for the Analytics app.
"""
from django.urls import path
from .views import ClinicalDashboardAnalyticsView

urlpatterns = [
    path('analytics/dashboard/', ClinicalDashboardAnalyticsView.as_view(), name='clinical-dashboard-analytics'),
]
