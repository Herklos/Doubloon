"""Enum constants matching the TypeScript types."""

from typing import Literal

Chain = Literal["solana", "evm"]
Store = Literal["apple", "google", "stripe", "x402"]
EntitlementSource = Literal[
    "platform", "creator", "delegate", "apple", "google", "stripe", "x402"
]
NotificationType = Literal[
    "initial_purchase", "renewal", "cancellation", "uncancellation",
    "expiration", "refund", "revocation", "billing_recovery",
    "billing_retry_start", "grace_period_start", "price_increase_consent",
    "offer_redeemed", "plan_change", "pause", "resume", "test",
]
