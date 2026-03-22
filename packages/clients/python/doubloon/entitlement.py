"""Entitlement check — pure function matching TypeScript implementation."""

from datetime import datetime
from typing import Optional

from .types import Entitlement, EntitlementCheck, Product


def check_entitlement(
    entitlement: Optional[Entitlement],
    now: Optional[datetime] = None,
) -> EntitlementCheck:
    """Check if an entitlement grants access.

    Pure function — no I/O, no side effects.
    """
    if now is None:
        now = datetime.utcnow()

    # Case 1: Not found
    if entitlement is None:
        return EntitlementCheck(
            entitled=False,
            entitlement=None,
            reason="not_found",
            expires_at=None,
        )

    # Case 2: Revoked
    if not entitlement.active:
        return EntitlementCheck(
            entitled=False,
            entitlement=entitlement,
            reason="revoked",
            expires_at=None,
        )

    # Case 3: Lifetime
    if entitlement.expires_at is None:
        return EntitlementCheck(
            entitled=True,
            entitlement=entitlement,
            reason="active",
            expires_at=None,
        )

    # Case 4: Active (not expired)
    if entitlement.expires_at > now:
        return EntitlementCheck(
            entitled=True,
            entitlement=entitlement,
            reason="active",
            expires_at=entitlement.expires_at,
        )

    # Case 5: Expired
    return EntitlementCheck(
        entitled=False,
        entitlement=entitlement,
        reason="expired",
        expires_at=None,
    )


def check_entitlements(
    entitlements: dict[str, Optional[Entitlement]],
    now: Optional[datetime] = None,
) -> dict[str, EntitlementCheck]:
    """Batch check multiple entitlements."""
    if now is None:
        now = datetime.utcnow()
    return {
        pid: check_entitlement(ent, now)
        for pid, ent in entitlements.items()
    }
