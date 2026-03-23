import Foundation

/// How an entitlement was created. Maps to u8 on-chain.
public enum EntitlementSource: UInt8, Codable, Sendable {
    case platform = 0
    case creator = 1
    case delegate = 2
    case apple = 3
    case google = 4
    case stripe = 5
    case x402 = 6
}

/// Result reason for an entitlement check.
public enum CheckReason: String, Codable, Sendable {
    case active
    case notFound = "not_found"
    case expired
    case revoked
}

/// An on-chain entitlement record.
public struct Entitlement: Codable, Sendable {
    public let productId: String
    public let user: String
    public let grantedAt: Date
    public let expiresAt: Date?
    public let autoRenew: Bool
    public let source: EntitlementSource
    public let sourceId: String
    public let active: Bool
    public let revokedAt: Date?
    public let revokedBy: String?
}

/// Result of checking a single entitlement.
public struct EntitlementCheck: Sendable {
    public let entitled: Bool
    public let entitlement: Entitlement?
    public let reason: CheckReason
    public let expiresAt: Date?

    public init(entitled: Bool, entitlement: Entitlement?, reason: CheckReason, expiresAt: Date?) {
        self.entitled = entitled
        self.entitlement = entitlement
        self.reason = reason
        self.expiresAt = expiresAt
    }
}

/// A product registered on-chain.
public struct Product: Codable, Sendable {
    public let creator: String
    public let productId: String
    public let name: String
    public let metadataUri: String
    public let createdAt: Date
    public let updatedAt: Date
    public let active: Bool
    public let frozen: Bool
    public let entitlementCount: UInt64
    public let delegateCount: UInt16
    public let defaultDuration: Int64
}

// MARK: - Pure entitlement check (no I/O)

/// Check if an entitlement grants access. Pure function — no I/O.
/// Mirrors @doubloon/core's checkEntitlement().
public func checkEntitlement(_ entitlement: Entitlement?, now: Date = Date()) -> EntitlementCheck {
    guard let e = entitlement else {
        return EntitlementCheck(entitled: false, entitlement: nil, reason: .notFound, expiresAt: nil)
    }

    guard e.active else {
        return EntitlementCheck(entitled: false, entitlement: e, reason: .revoked, expiresAt: nil)
    }

    guard let expiresAt = e.expiresAt else {
        // Lifetime
        return EntitlementCheck(entitled: true, entitlement: e, reason: .active, expiresAt: nil)
    }

    if expiresAt > now {
        return EntitlementCheck(entitled: true, entitlement: e, reason: .active, expiresAt: expiresAt)
    }

    return EntitlementCheck(entitled: false, entitlement: e, reason: .expired, expiresAt: nil)
}
