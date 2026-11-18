import hmac
from fastapi import Header, HTTPException, status

from app.config import settings


async def verify_internal_api_key(
    x_ai_service_key: str | None = Header(default=None, alias="X-AI-Service-Key"),
) -> None:
    """
    Ensures only the authenticated Java Spring Boot backend can call Padhaku AI endpoints.
    Uses constant-time comparison to prevent timing attacks.
    """
    if not x_ai_service_key or not hmac.compare_digest(
        x_ai_service_key, settings.ai_service_api_key
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing internal AI service key",
        )
