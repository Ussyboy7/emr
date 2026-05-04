from rest_framework import viewsets, permissions
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Count
from accounts.models import SystemRole
from accounts.serializers import SystemRoleSerializer

class SystemRoleViewSet(viewsets.ModelViewSet):
    """
    API endpoint for managing system roles (professional identities).
    """
    queryset = SystemRole.objects.all()
    serializer_class = SystemRoleSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        queryset = SystemRole.objects.all()
        # Filter by active status if requested
        is_active = self.request.query_params.get('is_active', None)
        if is_active is not None:
            queryset = queryset.filter(is_active=is_active.lower() == 'true')
        return queryset

    @action(detail=False, methods=['get'])
    def stats(self, request):
        """Get statistics about system roles."""
        stats = {
            'total': SystemRole.objects.count(),
            'active': SystemRole.objects.filter(is_active=True).count(),
            'inactive': SystemRole.objects.filter(is_active=False).count(),
        }
        return Response(stats)