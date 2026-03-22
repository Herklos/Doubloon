"""Doubloon type definitions. Generated from JSON Schema."""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional


@dataclass(frozen=True)
class Platform:
    authority: str
    product_count: int
    frozen: bool


@dataclass(frozen=True)
class Product:
    creator: str
    product_id: str
    name: str
    metadata_uri: str
    created_at: datetime
    updated_at: datetime
    active: bool
    frozen: bool
    entitlement_count: int
    delegate_count: int
    default_duration: int


@dataclass(frozen=True)
class MintDelegate:
    product_id: str
    delegate: str
    granted_by: str
    granted_at: datetime
    expires_at: Optional[datetime]
    max_mints: int
    mints_used: int
    active: bool


@dataclass(frozen=True)
class Entitlement:
    product_id: str
    user: str
    granted_at: datetime
    expires_at: Optional[datetime]
    auto_renew: bool
    source: str
    source_id: str
    active: bool
    revoked_at: Optional[datetime] = None
    revoked_by: Optional[str] = None


@dataclass(frozen=True)
class EntitlementCheck:
    entitled: bool
    entitlement: Optional[Entitlement]
    reason: str  # 'active' | 'not_found' | 'expired' | 'revoked'
    expires_at: Optional[datetime]
    product: Optional[Product] = None


@dataclass(frozen=True)
class MintInstruction:
    product_id: str
    user: str
    expires_at: Optional[datetime]
    source: str
    source_id: str


@dataclass(frozen=True)
class RevokeInstruction:
    product_id: str
    user: str
    reason: str
