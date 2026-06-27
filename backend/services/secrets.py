"""Symmetric encryption for secrets at rest (BYOK provider API keys).

Provider keys were previously stored in plaintext in ``provider_keys.api_key``.
This module encrypts them with Fernet (AES-128-CBC + HMAC) using a key derived
from the ``KEY_ENCRYPTION_SECRET`` environment variable.

Design notes
------------
* Ciphertext is stored with an ``enc::v1::`` prefix so reads can distinguish an
  encrypted value from a legacy plaintext one and migrate transparently.
* ``decrypt_secret`` is tolerant: a value without the prefix (legacy plaintext)
  is returned unchanged, so existing keys keep working until re-encrypted.
* In production ``KEY_ENCRYPTION_SECRET`` MUST be set. A dev fallback is used
  locally with a loud warning — rotating the secret invalidates stored keys.
"""

from __future__ import annotations

import base64
import hashlib
import logging
import os

from cryptography.fernet import Fernet, InvalidToken

logger = logging.getLogger(__name__)

_PREFIX = "enc::v1::"
_DEV_FALLBACK = "dev-insecure-key-encryption-secret-change-me"


def _fernet() -> Fernet:
    secret = os.getenv("KEY_ENCRYPTION_SECRET")
    if not secret:
        logger.warning(
            "KEY_ENCRYPTION_SECRET is not set — using an INSECURE dev fallback. "
            "Set it in production; provider keys are only as safe as this secret."
        )
        secret = _DEV_FALLBACK
    # Derive a stable 32-byte urlsafe-base64 Fernet key from the secret.
    key = base64.urlsafe_b64encode(hashlib.sha256(secret.encode("utf-8")).digest())
    return Fernet(key)


def is_encrypted(value: str | None) -> bool:
    return bool(value) and value.startswith(_PREFIX)


def encrypt_secret(plaintext: str | None) -> str | None:
    """Encrypt a secret for storage. ``None``/empty pass through unchanged."""
    if not plaintext:
        return plaintext
    if is_encrypted(plaintext):
        return plaintext  # already encrypted — don't double-wrap
    token = _fernet().encrypt(plaintext.encode("utf-8")).decode("utf-8")
    return _PREFIX + token


def decrypt_secret(value: str | None) -> str | None:
    """Decrypt a stored secret. Legacy plaintext (no prefix) is returned as-is."""
    if not value or not is_encrypted(value):
        return value
    token = value[len(_PREFIX):]
    try:
        return _fernet().decrypt(token.encode("utf-8")).decode("utf-8")
    except InvalidToken:
        # Wrong/rotated KEY_ENCRYPTION_SECRET — cannot recover this key.
        logger.error("Failed to decrypt a stored provider key (secret rotated?).")
        return None
