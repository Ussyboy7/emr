import logging
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods
import json

logger = logging.getLogger(__name__)


@csrf_exempt
@require_http_methods(["POST"])
def client_logs(request):
    """
    Endpoint to receive client-side logs from the frontend.
    This helps with debugging frontend issues.
    """
    try:
        data = json.loads(request.body)
        level = data.get("level", "info")
        message = data.get("message", "")
        context = data.get("context", {})

        # Log the client message with appropriate level
        log_message = f"CLIENT-{level.upper()}: {message}"
        if context:
            log_message += f" | Context: {context}"

        if level.lower() == "error":
            logger.error(log_message)
        elif level.lower() == "warn":
            logger.warning(log_message)
        else:
            logger.info(log_message)

        return JsonResponse({"status": "logged"})

    except json.JSONDecodeError:
        logger.warning("CLIENT-LOG: Invalid JSON received")
        return JsonResponse({"error": "Invalid JSON"}, status=400)
    except Exception as e:
        logger.error(f"CLIENT-LOG: Error processing log: {str(e)}")
        return JsonResponse({"error": "Internal server error"}, status=500)
