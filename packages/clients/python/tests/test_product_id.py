"""Tests for product ID derivation — must match TypeScript output."""

import hashlib
import pytest
from doubloon.product_id import derive_product_id, derive_product_id_hex, validate_slug


def test_derive_product_id_deterministic():
    a = derive_product_id("pro-monthly")
    b = derive_product_id("pro-monthly")
    assert a == b
    assert len(a) == 32


def test_derive_product_id_hex_matches_sha256():
    expected = hashlib.sha256(b"pro-monthly").hexdigest()
    assert derive_product_id_hex("pro-monthly") == expected


def test_derive_product_id_hex_length():
    result = derive_product_id_hex("pro-monthly")
    assert len(result) == 64
    assert all(c in "0123456789abcdef" for c in result)


def test_different_slugs_different_ids():
    a = derive_product_id_hex("pro-monthly")
    b = derive_product_id_hex("pro-annual")
    assert a != b


def test_validate_slug_valid():
    validate_slug("pro")
    validate_slug("pro-monthly")
    validate_slug("my-app-premium-annual-v2")
    validate_slug("a1b")
    validate_slug("a" * 64)


def test_validate_slug_too_short():
    with pytest.raises(ValueError, match="3-64 chars"):
        validate_slug("ab")


def test_validate_slug_too_long():
    with pytest.raises(ValueError, match="3-64 chars"):
        validate_slug("a" * 65)


def test_validate_slug_uppercase():
    with pytest.raises(ValueError, match="lowercase"):
        validate_slug("Pro-Monthly")


def test_validate_slug_consecutive_hyphens():
    with pytest.raises(ValueError, match="consecutive"):
        validate_slug("pro--monthly")


def test_validate_slug_leading_hyphen():
    with pytest.raises(ValueError, match="lowercase"):
        validate_slug("-pro-monthly")
