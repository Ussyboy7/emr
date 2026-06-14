"""drf-spectacular extensions for accounts authentication."""
from drf_spectacular.extensions import OpenApiAuthenticationExtension


class JWTAuthenticationWithActivityScheme(OpenApiAuthenticationExtension):
    target_class = "accounts.authentication.JWTAuthenticationWithActivity"
    name = "jwtAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
        }


class JWTCookieAuthenticationScheme(OpenApiAuthenticationExtension):
    target_class = "accounts.authentication.JWTCookieAuthentication"
    name = "jwtCookieAuth"

    def get_security_definition(self, auto_schema):
        return {
            "type": "http",
            "scheme": "bearer",
            "bearerFormat": "JWT",
            "description": "JWT via Authorization header or access-token cookie.",
        }
