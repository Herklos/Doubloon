package com.doubloon.checker

import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.coroutineScope
import org.json.JSONArray
import org.json.JSONObject
import java.util.Date

/**
 * Lightweight EVM entitlement checker using direct JSON-RPC.
 *
 * Calls the Doubloon Solidity contract's `view` functions via `eth_call`.
 * Zero gas cost, no wallet required, no server needed.
 *
 * ```kotlin
 * val checker = EvmChecker(
 *     rpcUrl = "https://eth.llamarpc.com",
 *     contractAddress = "0xYourDoubloonContract..."
 * )
 *
 * val result = checker.checkEntitlement("a7f3c9...", "0xUserAddress...")
 * if (result.entitled) {
 *     // Grant access
 * }
 * ```
 */
class EvmChecker(
    private val rpcUrl: String,
    private val contractAddress: String,
    private val rpc: RpcClient = RpcClient(),
) {
    /**
     * Check if a wallet holds an active entitlement.
     */
    suspend fun checkEntitlement(productId: String, wallet: String): EntitlementCheck {
        val entitlement = getEntitlement(productId, wallet)
        return com.doubloon.checker.checkEntitlement(entitlement)
    }

    /**
     * Quick boolean check using the contract's `isEntitled` view function.
     */
    suspend fun isEntitled(productId: String, wallet: String): Boolean {
        val calldata = EvmAbi.encodeIsEntitled(productId, wallet)
        val result = ethCall(calldata)
        return EvmAbi.decodeBool(result)
    }

    /**
     * Fetch the full entitlement record, or null if not found.
     */
    suspend fun getEntitlement(productId: String, wallet: String): Entitlement? {
        val calldata = EvmAbi.encodeGetEntitlement(productId, wallet)
        val result = ethCall(calldata)

        val clean = if (result.startsWith("0x")) result.substring(2) else result
        if (clean.length < 64) return null

        val raw = EvmAbi.decodeGetEntitlement(result)
        if (!raw.exists) return null

        return raw.toEntitlement()
    }

    /**
     * Fetch product metadata, or null if not found.
     */
    suspend fun getProduct(productId: String): Product? {
        val calldata = EvmAbi.encodeGetProduct(productId)
        val result = ethCall(calldata)

        val clean = if (result.startsWith("0x")) result.substring(2) else result
        if (clean.length < 64) return null

        val raw = EvmAbi.decodeGetProduct(result)
        if (!raw.exists) return null

        return raw.toProduct()
    }

    /**
     * Batch check multiple products.
     */
    suspend fun checkEntitlements(
        productIds: List<String>,
        wallet: String,
    ): Map<String, EntitlementCheck> = coroutineScope {
        productIds.map { pid ->
            async { pid to checkEntitlement(pid, wallet) }
        }.awaitAll().toMap()
    }

    private suspend fun ethCall(data: String): String {
        val params = JSONArray().apply {
            put(JSONObject().apply {
                put("to", contractAddress)
                put("data", "0x$data")
            })
            put("latest")
        }
        return rpc.callForString(rpcUrl, "eth_call", params)
    }
}

// MARK: - ABI Encoding/Decoding

object EvmAbi {
    // Function selectors
    private const val SELECTOR_IS_ENTITLED = "2b1c1e9f"
    private const val SELECTOR_GET_ENTITLEMENT = "fdb60e41"
    private const val SELECTOR_GET_PRODUCT = "a3e76c0f"

    fun encodeIsEntitled(productId: String, user: String): String =
        SELECTOR_IS_ENTITLED + encodeBytes32(productId) + encodeAddress(user)

    fun encodeGetEntitlement(productId: String, user: String): String =
        SELECTOR_GET_ENTITLEMENT + encodeBytes32(productId) + encodeAddress(user)

    fun encodeGetProduct(productId: String): String =
        SELECTOR_GET_PRODUCT + encodeBytes32(productId)

    fun decodeBool(data: String): Boolean {
        val clean = if (data.startsWith("0x")) data.substring(2) else data
        if (clean.length < 64) return false
        return clean.substring(0, 64).trimStart('0').isNotEmpty()
    }

    private fun encodeBytes32(hex: String): String {
        val clean = if (hex.startsWith("0x")) hex.substring(2) else hex
        return clean.padStart(64, '0')
    }

    private fun encodeAddress(addr: String): String {
        val clean = (if (addr.startsWith("0x")) addr.substring(2) else addr).lowercase()
        return clean.padStart(64, '0')
    }

    data class RawEntitlement(
        val productId: String,
        val user: String,
        val grantedAt: Long,
        val expiresAt: Long,
        val autoRenew: Boolean,
        val source: Int,
        val sourceId: String,
        val active: Boolean,
        val revokedAt: Long,
        val revokedBy: String,
        val exists: Boolean,
    ) {
        fun toEntitlement(): Entitlement {
            val zeroAddr = "0x0000000000000000000000000000000000000000"
            return Entitlement(
                productId = productId,
                user = user,
                grantedAt = Date(grantedAt * 1000),
                expiresAt = if (expiresAt == 0L) null else Date(expiresAt * 1000),
                autoRenew = autoRenew,
                source = EntitlementSource.fromValue(source),
                sourceId = sourceId,
                active = active,
                revokedAt = if (revokedAt == 0L) null else Date(revokedAt * 1000),
                revokedBy = if (revokedBy == zeroAddr) null else revokedBy,
            )
        }
    }

    data class RawProduct(
        val creator: String,
        val productId: String,
        val name: String,
        val metadataUri: String,
        val createdAt: Long,
        val updatedAt: Long,
        val active: Boolean,
        val frozen: Boolean,
        val entitlementCount: Long,
        val delegateCount: Int,
        val defaultDuration: Long,
        val exists: Boolean,
    ) {
        fun toProduct(): Product = Product(
            creator = creator,
            productId = productId,
            name = name,
            metadataUri = metadataUri,
            createdAt = Date(createdAt * 1000),
            updatedAt = Date(updatedAt * 1000),
            active = active,
            frozen = frozen,
            entitlementCount = entitlementCount,
            delegateCount = delegateCount,
            defaultDuration = defaultDuration,
        )
    }

    fun decodeGetEntitlement(data: String): RawEntitlement {
        val r = SlotReader(data)
        val tupleOffset = r.readUint().toInt()
        r.seek(tupleOffset)

        val productId = r.readHex(64)
        val user = r.readAddress()
        val grantedAt = r.readUint()
        val expiresAt = r.readInt64()
        val autoRenew = r.readBool()
        val source = r.readUint().toInt()
        val sourceIdOffset = r.readUint().toInt()
        val active = r.readBool()
        val revokedAt = r.readUint()
        val revokedBy = r.readAddress()
        val exists = r.readBool()

        val sourceId = r.readDynamicString(tupleOffset + sourceIdOffset)

        return RawEntitlement(productId, user, grantedAt, expiresAt, autoRenew, source, sourceId, active, revokedAt, revokedBy, exists)
    }

    fun decodeGetProduct(data: String): RawProduct {
        val r = SlotReader(data)
        val tupleOffset = r.readUint().toInt()
        r.seek(tupleOffset)

        val creator = r.readAddress()
        val productId = r.readHex(64)
        val nameOffset = r.readUint().toInt()
        val metadataUriOffset = r.readUint().toInt()
        val createdAt = r.readUint()
        val updatedAt = r.readUint()
        val active = r.readBool()
        val frozen = r.readBool()
        val entitlementCount = r.readUint()
        val delegateCount = r.readUint().toInt()
        val defaultDuration = r.readInt64()
        val exists = r.readBool()

        val name = r.readDynamicString(tupleOffset + nameOffset)
        val metadataUri = r.readDynamicString(tupleOffset + metadataUriOffset)

        return RawProduct(creator, productId, name, metadataUri, createdAt, updatedAt, active, frozen, entitlementCount, delegateCount, defaultDuration, exists)
    }

    private class SlotReader(data: String) {
        private val hex = if (data.startsWith("0x")) data.substring(2) else data
        private var pos = 0

        fun seek(byteOffset: Int) {
            pos = byteOffset * 2
        }

        fun readSlot(): String {
            val slot = hex.substring(pos, pos + 64)
            pos += 64
            return slot
        }

        fun readUint(): Long = java.lang.Long.parseUnsignedLong(readSlot().takeLast(16), 16)

        fun readInt64(): Long {
            val slot = readSlot()
            val unsigned = java.lang.Long.parseUnsignedLong(slot.takeLast(16), 16)
            return unsigned // Java long is already signed 64-bit
        }

        fun readBool(): Boolean = readUint() != 0L

        fun readAddress(): String = "0x" + readSlot().takeLast(40)

        fun readHex(chars: Int): String = readSlot().take(chars)

        fun readDynamicString(byteOffset: Int): String {
            val startHex = byteOffset * 2
            val len = hex.substring(startHex, startHex + 64).trimStart('0').ifEmpty { "0" }.toLong(16).toInt()
            if (len == 0) return ""
            val strHex = hex.substring(startHex + 64, startHex + 64 + len * 2)
            return ByteArray(len) { i ->
                strHex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
            }.toString(Charsets.UTF_8)
        }
    }
}
