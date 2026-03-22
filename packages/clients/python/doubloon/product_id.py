"""Product ID derivation matching the TypeScript implementation."""

import hashlib
import re


def validate_slug(slug: str) -> None:
    """Validate a product slug.

    Raises ValueError if invalid.
    """
    if len(slug) < 3 or len(slug) > 64:
        raise ValueError(f"Slug must be 3-64 chars, got {len(slug)}")
    if not re.match(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$", slug):
        raise ValueError(
            f'Slug must be lowercase alphanumeric with hyphens, '
            f'no leading/trailing hyphens: "{slug}"'
        )
    if "--" in slug:
        raise ValueError(f'Slug must not contain consecutive hyphens: "{slug}"')


def derive_product_id(slug: str) -> bytes:
    """Derive a 32-byte product ID from a human-readable slug.

    The derivation is: SHA-256(UTF-8(slug)).
    """
    validate_slug(slug)
    return hashlib.sha256(slug.encode("utf-8")).digest()


def derive_product_id_hex(slug: str) -> str:
    """Derive a hex-encoded product ID from a human-readable slug."""
    return derive_product_id(slug).hex()
