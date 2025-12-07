"""
URL configuration for the Nursing app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import NursingOrderViewSet, ProcedureViewSet

router = DefaultRouter()
router.register(r'orders', NursingOrderViewSet, basename='nursing-order')
router.register(r'procedures', ProcedureViewSet, basename='procedure')

urlpatterns = [
    path('nursing/', include(router.urls)),
]

