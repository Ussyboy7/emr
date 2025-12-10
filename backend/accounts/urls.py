"""
URL configuration for the Accounts app.
"""
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenRefreshView
from .views import UserViewSet
from .auth_views import CustomTokenObtainPairView, CustomTokenBlacklistView

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='user')

urlpatterns = [
    # Authentication endpoints
    path('auth/token/', CustomTokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('auth/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('auth/token/blacklist/', CustomTokenBlacklistView.as_view(), name='token_blacklist'),
    
    # User endpoints
    path('auth/me/', UserViewSet.as_view({'get': 'me'}), name='user-me'),
    path('auth/me/', UserViewSet.as_view({'patch': 'update_me'}), name='user-update-me'),
    path('auth/change-password/', UserViewSet.as_view({'post': 'change_password'}), name='user-change-password'),
    
    # Include router URLs
    path('', include(router.urls)),
]
