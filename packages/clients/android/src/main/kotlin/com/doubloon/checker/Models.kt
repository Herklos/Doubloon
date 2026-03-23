package com.doubloon.checker

import java.util.Date

/**
 * How an entitlement was created. Maps to u8 on-chain.
 */
enum class EntitlementSource(val value: Int) {
    PLATFORM(0),
    CREATOR(1),
    DELEGATE(2),
    APPLE(3),
    GOOGLE(4),
    STRIPE(5),
    X402(6);

    companion object {
        fun fromValue(value: Int): EntitlementSource =
            entries.firstOrNull { it.value == value } ?: PLATFORM
    }
}

/**
 * Reason for an entitlement check result.
 */
enum class CheckReason(val value: String) {
    ACTIVE("active"),
    NOT_FOUND("not_found"),
    EXPIRED("expired"),
    REVOKED("revoked")
}

/**
 * An on-chain entitlement record.
 */
data class Entitlement(
    val productId: String,
    val user: String,
    val grantedAt: Date,
    val expiresAt: Date?,
    val autoRenew: Boolean,
    val source: EntitlementSource,
    val sourceId: String,
    val active: Boolean,
    val revokedAt: Date?,
    val revokedBy: String?,
)

/**
 * Result of checking a single entitlement.
 */
data class EntitlementCheck(
    val entitled: Boolean,
    val entitlement: Entitlement?,
    val reason: CheckReason,
    val expiresAt: Date?,
)

/**
 * A product registered on-chain.
 */
data class Product(
    val creator: String,
    val productId: String,
    val name: String,
    val metadataUri: String,
    val createdAt: Date,
    val updatedAt: Date,
    val active: Boolean,
    val frozen: Boolean,
    val entitlementCount: Long,
    val delegateCount: Int,
    val defaultDuration: Long,
)

/**
 * Check if an entitlement grants access. Pure function — no I/O.
 * Mirrors @doubloon/core's checkEntitlement().
 */
fun checkEntitlement(entitlement: Entitlement?, now: Date = Date()): EntitlementCheck {
    if (entitlement == null) {
        return EntitlementCheck(entitled = false, entitlement = null, reason = CheckReason.NOT_FOUND, expiresAt = null)
    }

    if (!entitlement.active) {
        return EntitlementCheck(entitled = false, entitlement = entitlement, reason = CheckReason.REVOKED, expiresAt = null)
    }

    val expiresAt = entitlement.expiresAt
        ?: // Lifetime
        return EntitlementCheck(entitled = true, entitlement = entitlement, reason = CheckReason.ACTIVE, expiresAt = null)

    if (expiresAt.after(now)) {
        return EntitlementCheck(entitled = true, entitlement = entitlement, reason = CheckReason.ACTIVE, expiresAt = expiresAt)
    }

    return EntitlementCheck(entitled = false, entitlement = entitlement, reason = CheckReason.EXPIRED, expiresAt = null)
}
