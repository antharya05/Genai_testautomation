"""Single-tenant authentication gate.

The platform is protected by one shared password (``APP_PASSWORD``). A successful
login returns a signed, time-limited bearer token; every non-public route then
requires that token (enforced centrally by the auth middleware in ``main.py``).

There is intentionally no per-user model here — this is a single-tenant gate that
closes the previously wide-open API. See ``security.py`` for the token mechanism
and ``router.py`` for the ``/auth/*`` endpoints.
"""

from .security import (  # noqa: F401
    actor_from_token,
    decode_token,
    issue_token,
    validate_token,
    verify_password,
)
from .router import router  # noqa: F401

__all__ = [
    "router", "issue_token", "validate_token", "verify_password",
    "decode_token", "actor_from_token",
]
