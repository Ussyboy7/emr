from django.urls import path, include
from rest_framework.routers import DefaultRouter
from accounts.views import SystemRoleViewSet

router = DefaultRouter()
router.register(r'system-roles', SystemRoleViewSet)

urlpatterns = router.urls