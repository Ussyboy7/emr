import json
import logging

from rest_framework import views
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from common.openapi import JSON_MUTATION_RESPONSES, document_api_view

logger = logging.getLogger(__name__)


@document_api_view(
    tag="Common",
    summary="Receive client-side debug logs",
    methods=("post",),
    responses=JSON_MUTATION_RESPONSES,
)
class ClientLogsView(views.APIView):
    """Endpoint to receive client-side logs from the frontend."""

    authentication_classes = []
    permission_classes = [AllowAny]

    def post(self, request):
        try:
            data = request.data if isinstance(request.data, dict) else json.loads(request.body)
            level = data.get("level", "info")
            message = data.get("message", "")
            context = data.get("context", {})

            log_message = f"CLIENT-{level.upper()}: {message}"
            if context:
                log_message += f" | Context: {context}"

            if level.lower() == "error":
                logger.error(log_message)
            elif level.lower() == "warn":
                logger.warning(log_message)
            else:
                logger.info(log_message)

            return Response({"status": "logged"})

        except json.JSONDecodeError:
            logger.warning("CLIENT-LOG: Invalid JSON received")
            return Response({"error": "Invalid JSON"}, status=400)
        except Exception as e:
            logger.error(f"CLIENT-LOG: Error processing log: {str(e)}")
            return Response({"error": "Internal server error"}, status=500)
