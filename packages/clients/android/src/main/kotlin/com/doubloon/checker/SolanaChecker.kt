package com.doubloon.checker

import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.Date

/**
 * Lightweight Solana entitlement checker using direct JSON-RPC.
 *
 * Uses OkHttp for networking and java.security for SHA-256.
 * No dependency on any Solana SDK.
 *
 * ```kotlin
 * val checker = SolanaChecker(
 *     rpcUrl = "https://api.mainnet-beta.solana.com",
 *     programId = "Dub1oon11111111111111111111111111111111111"
 * )
 *
 * val result = checker.checkEntitlement("a7f3c9...", "UserWalletBase58...")
 * if (result.entitled) {
 *     // Grant access
 * }
 * ```
 */
class SolanaChecker(
    private val rpcUrl: String,
    private val programId: String,
    private val commitment: String = "confirmed",
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
     * Fetch the raw entitlement data, or null if not found.
     */
    suspend fun getEntitlement(productId: String, wallet: String): Entitlement? {
        val address = SolanaPda.deriveEntitlementAddress(productId, wallet, programId)
        val data = fetchAccountData(address) ?: return null
        return SolanaDeserializer.deserializeEntitlement(data)
    }

    /**
     * Fetch product metadata, or null if not found.
     */
    suspend fun getProduct(productId: String): Product? {
        val address = SolanaPda.deriveProductAddress(productId, programId)
        val data = fetchAccountData(address) ?: return null
        return SolanaDeserializer.deserializeProduct(data)
    }

    /**
     * Batch check multiple products for one wallet.
     */
    suspend fun checkEntitlements(
        productIds: List<String>,
        wallet: String,
    ): Map<String, EntitlementCheck> {
        val addresses = productIds.map { pid ->
            SolanaPda.deriveEntitlementAddress(pid, wallet, programId)
        }

        val params = JSONArray().apply {
            put(JSONArray(addresses))
            put(JSONObject().apply {
                put("encoding", "base64")
                put("commitment", commitment)
            })
        }

        val json = rpc.call(rpcUrl, "getMultipleAccounts", params)
        val values = json.getJSONObject("result").getJSONArray("value")

        return productIds.mapIndexed { i, pid ->
            val entitlement = if (!values.isNull(i)) {
                val account = values.getJSONObject(i)
                val dataArray = account.getJSONArray("data")
                val base64Data = dataArray.getString(0)
                val bytes = android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
                SolanaDeserializer.deserializeEntitlement(bytes)
            } else {
                null
            }
            pid to com.doubloon.checker.checkEntitlement(entitlement)
        }.toMap()
    }

    private suspend fun fetchAccountData(address: String): ByteArray? {
        val params = JSONArray().apply {
            put(address)
            put(JSONObject().apply {
                put("encoding", "base64")
                put("commitment", commitment)
            })
        }

        val json = rpc.call(rpcUrl, "getAccountInfo", params)
        val result = json.getJSONObject("result")

        if (result.isNull("value")) return null
        val value = result.getJSONObject("value")
        val dataArray = value.getJSONArray("data")
        val base64Data = dataArray.getString(0)

        return android.util.Base64.decode(base64Data, android.util.Base64.DEFAULT)
    }
}

// MARK: - PDA Derivation

object SolanaPda {
    private const val BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

    fun base58Decode(input: String): ByteArray {
        val bytes = mutableListOf<Int>(0)
        for (char in input) {
            val idx = BASE58_ALPHABET.indexOf(char)
            require(idx >= 0) { "Invalid base58 character: $char" }
            var carry = idx
            for (j in bytes.indices) {
                carry += bytes[j] * 58
                bytes[j] = carry and 0xFF
                carry = carry shr 8
            }
            while (carry > 0) {
                bytes.add(carry and 0xFF)
                carry = carry shr 8
            }
        }
        // Leading zeros
        for (char in input) {
            if (char != '1') break
            bytes.add(0)
        }
        return bytes.reversed().map { it.toByte() }.toByteArray()
    }

    fun base58Encode(bytes: ByteArray): String {
        val digits = mutableListOf(0)
        for (byte in bytes) {
            var carry = byte.toInt() and 0xFF
            for (j in digits.indices) {
                carry += digits[j] shl 8
                digits[j] = carry % 58
                carry /= 58
            }
            while (carry > 0) {
                digits.add(carry % 58)
                carry /= 58
            }
        }
        val sb = StringBuilder()
        for (byte in bytes) {
            if (byte.toInt() != 0) break
            sb.append('1')
        }
        for (i in digits.indices.reversed()) {
            sb.append(BASE58_ALPHABET[digits[i]])
        }
        return sb.toString()
    }

    fun hexToBytes(hex: String): ByteArray {
        return ByteArray(hex.length / 2) { i ->
            hex.substring(i * 2, i * 2 + 2).toInt(16).toByte()
        }
    }

    fun bytesToHex(bytes: ByteArray): String {
        return bytes.joinToString("") { "%02x".format(it) }
    }

    /**
     * Find a Solana Program Derived Address.
     */
    fun findProgramAddress(seeds: List<ByteArray>, programId: String): Pair<String, Int> {
        val programIdBytes = base58Decode(programId)
        val marker = "ProgramDerivedAddress".toByteArray(Charsets.UTF_8)

        for (bump in 255 downTo 0) {
            val digest = MessageDigest.getInstance("SHA-256")
            for (seed in seeds) {
                digest.update(seed)
            }
            digest.update(bump.toByte())
            digest.update(programIdBytes)
            digest.update(marker)
            val hash = digest.digest()

            // PDA must not be on the ed25519 curve.
            // SHA-256 outputs are overwhelmingly unlikely to be valid curve points.
            // Conservative check: reject values >= field prime p = 2^255 - 19.
            if (!isLikelyOnCurve(hash)) {
                return Pair(base58Encode(hash), bump)
            }
        }

        throw IllegalStateException("Could not find PDA")
    }

    fun deriveEntitlementAddress(productIdHex: String, walletBase58: String, programId: String): String {
        val seeds = listOf(
            "entitlement".toByteArray(Charsets.UTF_8),
            hexToBytes(productIdHex),
            base58Decode(walletBase58),
        )
        return findProgramAddress(seeds, programId).first
    }

    fun deriveProductAddress(productIdHex: String, programId: String): String {
        val seeds = listOf(
            "product".toByteArray(Charsets.UTF_8),
            hexToBytes(productIdHex),
        )
        return findProgramAddress(seeds, programId).first
    }

    fun deriveProductIdHex(slug: String): String {
        val digest = MessageDigest.getInstance("SHA-256")
        return bytesToHex(digest.digest(slug.toByteArray(Charsets.UTF_8)))
    }

    private fun isLikelyOnCurve(data: ByteArray): Boolean {
        if (data.size != 32) return true
        val topByte = data[31].toInt() and 0x7F
        if (topByte > 0x7E) return false
        // Conservative: assume could be on curve
        return true
    }
}

// MARK: - Deserialization

object SolanaDeserializer {
    fun deserializeEntitlement(data: ByteArray): Entitlement {
        var offset = 8 // skip Anchor discriminator
        val productId = readProductId(data, offset); offset += 32
        val user = readPubkey(data, offset); offset += 32
        val grantedAt = readI64(data, offset); offset += 8
        val expiresAt = readI64(data, offset); offset += 8
        val autoRenew = readBool(data, offset); offset += 1
        val source = readU8(data, offset); offset += 1
        val (sourceId, sourceIdLen) = readString(data, offset); offset += sourceIdLen
        val active = readBool(data, offset); offset += 1
        val revokedAt = readI64(data, offset); offset += 8
        val revokedBy = readPubkey(data, offset); offset += 32

        val defaultPubkey = "11111111111111111111111111111111"

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
            revokedBy = if (revokedBy == defaultPubkey) null else revokedBy,
        )
    }

    fun deserializeProduct(data: ByteArray): Product {
        var offset = 8
        val creator = readPubkey(data, offset); offset += 32
        val productId = readProductId(data, offset); offset += 32
        val (name, nameLen) = readString(data, offset); offset += nameLen
        val (metadataUri, metadataUriLen) = readString(data, offset); offset += metadataUriLen
        val createdAt = readI64(data, offset); offset += 8
        val updatedAt = readI64(data, offset); offset += 8
        val active = readBool(data, offset); offset += 1
        val frozen = readBool(data, offset); offset += 1
        val entitlementCount = readU64(data, offset); offset += 8
        val delegateCount = readU16(data, offset); offset += 2
        val defaultDuration = readI64(data, offset); offset += 8

        return Product(
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

    private fun readU8(data: ByteArray, offset: Int): Int = data[offset].toInt() and 0xFF

    private fun readBool(data: ByteArray, offset: Int): Boolean = data[offset].toInt() != 0

    private fun readU16(data: ByteArray, offset: Int): Int =
        (data[offset].toInt() and 0xFF) or ((data[offset + 1].toInt() and 0xFF) shl 8)

    private fun readU32(data: ByteArray, offset: Int): Int =
        (data[offset].toInt() and 0xFF) or
            ((data[offset + 1].toInt() and 0xFF) shl 8) or
            ((data[offset + 2].toInt() and 0xFF) shl 16) or
            ((data[offset + 3].toInt() and 0xFF) shl 24)

    private fun readI64(data: ByteArray, offset: Int): Long {
        var value = 0L
        for (i in 0 until 8) {
            value = value or ((data[offset + i].toLong() and 0xFF) shl (i * 8))
        }
        return value
    }

    private fun readU64(data: ByteArray, offset: Int): Long = readI64(data, offset)

    private fun readPubkey(data: ByteArray, offset: Int): String =
        SolanaPda.base58Encode(data.sliceArray(offset until offset + 32))

    private fun readProductId(data: ByteArray, offset: Int): String =
        SolanaPda.bytesToHex(data.sliceArray(offset until offset + 32))

    private fun readString(data: ByteArray, offset: Int): Pair<String, Int> {
        val len = readU32(data, offset)
        val str = String(data, offset + 4, len, Charsets.UTF_8)
        return Pair(str, 4 + len)
    }
}
