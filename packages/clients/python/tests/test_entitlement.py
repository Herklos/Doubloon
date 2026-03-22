"""Tests for entitlement check — must match TypeScript output."""

from datetime import datetime, timedelta
from doubloon.entitlement import check_entitlement, check_entitlements
from doubloon.types import Entitlement


def make_entitlement(**kwargs) -> Entitlement:
    defaults = dict(
        product_id="a" * 64,
        user="7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU",
        granted_at=datetime(2024, 1, 1),
        expires_at=datetime(2025, 1, 1),
        auto_renew=True,
        source="apple",
        source_id="2000000123456789",
        active=True,
        revoked_at=None,
        revoked_by=None,
    )
    defaults.update(kwargs)
    return Entitlement(**defaults)


NOW = datetime(2024, 6, 15)


def test_not_found():
    result = check_entitlement(None, NOW)
    assert not result.entitled
    assert result.reason == "not_found"
    assert result.entitlement is None


def test_active_future_expiry():
    ent = make_entitlement(expires_at=datetime(2024, 12, 31))
    result = check_entitlement(ent, NOW)
    assert result.entitled
    assert result.reason == "active"
    assert result.expires_at == datetime(2024, 12, 31)


def test_expired():
    ent = make_entitlement(expires_at=datetime(2024, 6, 14))
    result = check_entitlement(ent, NOW)
    assert not result.entitled
    assert result.reason == "expired"


def test_revoked():
    ent = make_entitlement(
        expires_at=datetime(2025, 1, 1),
        active=False,
        revoked_at=datetime(2024, 6, 1),
        revoked_by="platform",
    )
    result = check_entitlement(ent, NOW)
    assert not result.entitled
    assert result.reason == "revoked"


def test_lifetime():
    ent = make_entitlement(expires_at=None)
    result = check_entitlement(ent, NOW)
    assert result.entitled
    assert result.reason == "active"
    assert result.expires_at is None


def test_boundary_equals_now():
    ent = make_entitlement(expires_at=NOW)
    result = check_entitlement(ent, NOW)
    assert not result.entitled
    assert result.reason == "expired"


def test_batch_check():
    ents = {
        "a" * 64: make_entitlement(expires_at=datetime(2024, 12, 31)),
        "b" * 64: make_entitlement(expires_at=datetime(2024, 1, 1)),
        "c" * 64: None,
    }
    results = check_entitlements(ents, NOW)
    assert results["a" * 64].entitled
    assert not results["b" * 64].entitled
    assert not results["c" * 64].entitled
    assert results["c" * 64].reason == "not_found"
