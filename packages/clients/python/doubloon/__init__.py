"""Doubloon Python client for on-chain entitlement verification."""

__version__ = "0.1.0"

from .types import (
    Platform,
    Product,
    MintDelegate,
    Entitlement,
    EntitlementCheck,
    MintInstruction,
    RevokeInstruction,
)
from .product_id import derive_product_id, derive_product_id_hex, validate_slug
from .entitlement import check_entitlement, check_entitlements
