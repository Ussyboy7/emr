"""
URL configuration for the Analytics app.
"""
from django.urls import path
from . import views

urlpatterns = [
    path('analytics/dashboard/', views.clinical_dashboard_analytics, name='clinical-dashboard-analytics'),
]