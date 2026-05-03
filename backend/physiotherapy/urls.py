"""
URL configuration for the Physiotherapy app.
"""
from django.urls import path
from .views import PhysiotherapyAnalyticsSummaryView

urlpatterns = [
    path('physiotherapy/analytics/summary/', PhysiotherapyAnalyticsSummaryView.as_view(), name='physiotherapy-analytics-summary'),
]