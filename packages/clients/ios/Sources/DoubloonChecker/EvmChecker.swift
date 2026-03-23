import Foundation
import CryptoKit

/// Lightweight EVM entitlement checker using direct JSON-RPC.
///
/// Calls the Doubloon Solidity contract's `view` functions via `eth_call`.
/// Zero gas cost, no wallet required, no server needed.
///
/// ```swift
/// let checker = EvmChecker(
///     rpcUrl: URL(string: "https://eth.llamarpc.com")!,
///     contractAddress: "0xYourDoubloonContract..."
/// )
///
/// let result = try await checker.checkEntitlement(
///     productId: "a7f3c9...",
///     wallet: "0xUserAddress..."
/// )
///
/// if result.entitled {
///     // Grant access
/// }
/// ```
public actor EvmChecker {
    private let rpcUrl: URL
    private let contractAddress: String
    private let rpc: RpcClient

    public init(rpcUrl: URL, contractAddress: String) {
        self.rpcUrl = rpcUrl
        self.contractAddress = contractAddress
        self.rpc = RpcClient()
    }

    /// Check if a wallet holds an active entitlement.
    public func checkEntitlement(productId: String, wallet: String) async throws -> EntitlementCheck {
        let entitlement = try await getEntitlement(productId: productId, wallet: wallet)
        return DoubloonChecker.checkEntitlement(entitlement)
    }

    /// Quick boolean check using the contract's `isEntitled` view function.
    public func isEntitled(productId: String, wallet: String) async throws -> Bool {
        let calldata = EvmAbi.encodeIsEntitled(productId: productId, user: wallet)
        let result: String = try await ethCall(data: calldata)
        return EvmAbi.decodeBool(result)
    }

    /// Fetch the full entitlement record, or nil if not found.
    public func getEntitlement(productId: String, wallet: String) async throws -> Entitlement? {
        let calldata = EvmAbi.encodeGetEntitlement(productId: productId, user: wallet)
        let result: String = try await ethCall(data: calldata)

        let clean = result.hasPrefix("0x") ? String(result.dropFirst(2)) : result
        guard clean.count >= 64 else { return nil }

        let raw = EvmAbi.decodeGetEntitlement(result)
        guard raw.exists else { return nil }

        return raw.toEntitlement()
    }

    /// Fetch product metadata, or nil if not found.
    public func getProduct(productId: String) async throws -> Product? {
        let calldata = EvmAbi.encodeGetProduct(productId: productId)
        let result: String = try await ethCall(data: calldata)

        let clean = result.hasPrefix("0x") ? String(result.dropFirst(2)) : result
        guard clean.count >= 64 else { return nil }

        let raw = EvmAbi.decodeGetProduct(result)
        guard raw.exists else { return nil }

        return raw.toProduct()
    }

    /// Batch check multiple products.
    public func checkEntitlements(
        productIds: [String],
        wallet: String
    ) async throws -> [String: EntitlementCheck] {
        var checks: [String: EntitlementCheck] = [:]
        // Run checks concurrently
        try await withThrowingTaskGroup(of: (String, EntitlementCheck).self) { group in
            for pid in productIds {
                group.addTask {
                    let check = try await self.checkEntitlement(productId: pid, wallet: wallet)
                    return (pid, check)
                }
            }
            for try await (pid, check) in group {
                checks[pid] = check
            }
        }
        return checks
    }

    // MARK: - Private

    private func ethCall(data: String) async throws -> String {
        let params: [[String: String]] = [
            ["to": contractAddress, "data": "0x" + data],
        ]
        return try await rpc.call(
            url: rpcUrl,
            method: "eth_call",
            params: params + ["latest"] as [Any]
        )
    }
}

// MARK: - ABI Encoding/Decoding

enum EvmAbi {
    // Function selectors (first 4 bytes of keccak256 of signature)
    static let selectorIsEntitled = "2b1c1e9f"
    static let selectorGetEntitlement = "fdb60e41"
    static let selectorGetProduct = "a3e76c0f"

    static func encodeIsEntitled(productId: String, user: String) -> String {
        selectorIsEntitled + encodeBytes32(productId) + encodeAddress(user)
    }

    static func encodeGetEntitlement(productId: String, user: String) -> String {
        selectorGetEntitlement + encodeBytes32(productId) + encodeAddress(user)
    }

    static func encodeGetProduct(productId: String) -> String {
        selectorGetProduct + encodeBytes32(productId)
    }

    static func decodeBool(_ data: String) -> Bool {
        let clean = data.hasPrefix("0x") ? String(data.dropFirst(2)) : data
        guard clean.count >= 64 else { return false }
        return clean.suffix(1) != "0"
    }

    // MARK: - Encoding helpers

    private static func encodeBytes32(_ hex: String) -> String {
        let clean = hex.hasPrefix("0x") ? String(hex.dropFirst(2)) : hex
        return String(repeating: "0", count: max(0, 64 - clean.count)) + clean
    }

    private static func encodeAddress(_ addr: String) -> String {
        let clean = (addr.hasPrefix("0x") ? String(addr.dropFirst(2)) : addr).lowercased()
        return String(repeating: "0", count: max(0, 64 - clean.count)) + clean
    }

    // MARK: - Decoding

    struct RawEntitlement {
        let productId: String
        let user: String
        let grantedAt: UInt64
        let expiresAt: Int64
        let autoRenew: Bool
        let source: UInt8
        let sourceId: String
        let active: Bool
        let revokedAt: UInt64
        let revokedBy: String
        let exists: Bool

        func toEntitlement() -> Entitlement {
            let zeroAddr = "0x0000000000000000000000000000000000000000"
            return Entitlement(
                productId: productId,
                user: user,
                grantedAt: Date(timeIntervalSince1970: TimeInterval(grantedAt)),
                expiresAt: expiresAt == 0 ? nil : Date(timeIntervalSince1970: TimeInterval(expiresAt)),
                autoRenew: autoRenew,
                source: EntitlementSource(rawValue: source) ?? .platform,
                sourceId: sourceId,
                active: active,
                revokedAt: revokedAt == 0 ? nil : Date(timeIntervalSince1970: TimeInterval(revokedAt)),
                revokedBy: revokedBy == zeroAddr ? nil : revokedBy
            )
        }
    }

    struct RawProduct {
        let creator: String
        let productId: String
        let name: String
        let metadataUri: String
        let createdAt: UInt64
        let updatedAt: UInt64
        let active: Bool
        let frozen: Bool
        let entitlementCount: UInt64
        let delegateCount: UInt16
        let defaultDuration: Int64
        let exists: Bool

        func toProduct() -> Product {
            Product(
                creator: creator,
                productId: productId,
                name: name,
                metadataUri: metadataUri,
                createdAt: Date(timeIntervalSince1970: TimeInterval(createdAt)),
                updatedAt: Date(timeIntervalSince1970: TimeInterval(updatedAt)),
                active: active,
                frozen: frozen,
                entitlementCount: entitlementCount,
                delegateCount: delegateCount,
                defaultDuration: defaultDuration
            )
        }
    }

    static func decodeGetEntitlement(_ data: String) -> RawEntitlement {
        let r = SlotReader(data)
        // First slot is offset to tuple data
        let tupleOffset = r.readUint()
        r.seek(to: Int(tupleOffset))

        let productId = r.readHex(64)
        let user = r.readAddress()
        let grantedAt = r.readUint64()
        let expiresAt = r.readInt64()
        let autoRenew = r.readBool()
        let source = UInt8(r.readUint())
        let sourceIdOffset = r.readUint()
        let active = r.readBool()
        let revokedAt = r.readUint64()
        let revokedBy = r.readAddress()
        let exists = r.readBool()

        let sourceId = r.readDynamicString(at: Int(tupleOffset) + Int(sourceIdOffset))

        return RawEntitlement(
            productId: productId, user: user,
            grantedAt: grantedAt, expiresAt: expiresAt,
            autoRenew: autoRenew, source: source, sourceId: sourceId,
            active: active, revokedAt: revokedAt, revokedBy: revokedBy, exists: exists
        )
    }

    static func decodeGetProduct(_ data: String) -> RawProduct {
        let r = SlotReader(data)
        let tupleOffset = r.readUint()
        r.seek(to: Int(tupleOffset))

        let creator = r.readAddress()
        let productId = r.readHex(64)
        let nameOffset = r.readUint()
        let metadataUriOffset = r.readUint()
        let createdAt = r.readUint64()
        let updatedAt = r.readUint64()
        let active = r.readBool()
        let frozen = r.readBool()
        let entitlementCount = r.readUint64()
        let delegateCount = UInt16(r.readUint())
        let defaultDuration = r.readInt64()
        let exists = r.readBool()

        let name = r.readDynamicString(at: Int(tupleOffset) + Int(nameOffset))
        let metadataUri = r.readDynamicString(at: Int(tupleOffset) + Int(metadataUriOffset))

        return RawProduct(
            creator: creator, productId: productId,
            name: name, metadataUri: metadataUri,
            createdAt: createdAt, updatedAt: updatedAt,
            active: active, frozen: frozen,
            entitlementCount: entitlementCount, delegateCount: delegateCount,
            defaultDuration: defaultDuration, exists: exists
        )
    }
}

// MARK: - Slot Reader

private class SlotReader {
    private let hex: String
    private var pos: Int = 0

    init(_ data: String) {
        self.hex = data.hasPrefix("0x") ? String(data.dropFirst(2)) : data
    }

    func seek(to byteOffset: Int) {
        pos = byteOffset * 2
    }

    func readSlot() -> String {
        let start = hex.index(hex.startIndex, offsetBy: pos)
        let end = hex.index(start, offsetBy: 64)
        let slot = String(hex[start..<end])
        pos += 64
        return slot
    }

    func readUint() -> UInt64 {
        let slot = readSlot()
        return UInt64(slot, radix: 16) ?? 0
    }

    func readUint64() -> UInt64 { readUint() }

    func readInt64() -> Int64 {
        let val = readUint()
        if val > UInt64(Int64.max) {
            return Int64(bitPattern: val)
        }
        return Int64(val)
    }

    func readBool() -> Bool { readUint() != 0 }

    func readAddress() -> String {
        let slot = readSlot()
        return "0x" + String(slot.suffix(40))
    }

    func readHex(_ chars: Int) -> String {
        let slot = readSlot()
        return String(slot.prefix(chars))
    }

    func readDynamicString(at byteOffset: Int) -> String {
        let startHex = byteOffset * 2
        let lenStart = hex.index(hex.startIndex, offsetBy: startHex)
        let lenEnd = hex.index(lenStart, offsetBy: 64)
        let len = Int(String(hex[lenStart..<lenEnd]), radix: 16) ?? 0
        guard len > 0 else { return "" }

        let strStart = hex.index(lenEnd, offsetBy: 0)
        let strEnd = hex.index(strStart, offsetBy: len * 2)
        let strHex = String(hex[strStart..<strEnd])

        var bytes: [UInt8] = []
        var i = strHex.startIndex
        while i < strHex.endIndex {
            let next = strHex.index(i, offsetBy: 2)
            bytes.append(UInt8(strHex[i..<next], radix: 16) ?? 0)
            i = next
        }

        return String(bytes: bytes, encoding: .utf8) ?? ""
    }
}
