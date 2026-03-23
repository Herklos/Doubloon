/**
 * Portable Solana account data deserialization.
 *
 * Works with Uint8Array (no Node.js Buffer dependency).
 * Mirrors the deserialization logic in @doubloon/solana but works
 * in React Native and browser environments.
 */
import type { Entitlement, EntitlementSource, Product } from '@doubloon/core';
import { U8_TO_ENTITLEMENT_SOURCE } from '@doubloon/core';
import { base58Encode, bytesToHex } from './solana-pda.js';

function readU8(data: Uint8Array, offset: number): number {
  return data[offset];
}

function readBool(data: Uint8Array, offset: number): boolean {
  return data[offset] !== 0;
}

function readU16LE(data: Uint8Array, offset: number): number {
  return data[offset] | (data[offset + 1] << 8);
}

function readU32LE(data: Uint8Array, offset: number): number {
  return (
    data[offset] |
    (data[offset + 1] << 8) |
    (data[offset + 2] << 16) |
    ((data[offset + 3] << 24) >>> 0)
  );
}

function readI64LE(data: Uint8Array, offset: number): number {
  // Read as two 32-bit values; sufficient for timestamps
  const lo = readU32LE(data, offset);
  const hi = data[offset + 4] | (data[offset + 5] << 8) | (data[offset + 6] << 16) | (data[offset + 7] << 24);
  return hi * 0x100000000 + (lo >>> 0);
}

function readU64LE(data: Uint8Array, offset: number): number {
  const lo = readU32LE(data, offset);
  const hi = readU32LE(data, offset + 4);
  return hi * 0x100000000 + lo;
}

function readPubkey(data: Uint8Array, offset: number): string {
  return base58Encode(data.slice(offset, offset + 32));
}

function readProductId(data: Uint8Array, offset: number): string {
  return bytesToHex(data.slice(offset, offset + 32));
}

function readString(data: Uint8Array, offset: number): { value: string; bytesRead: number } {
  const len = readU32LE(data, offset);
  const bytes = data.slice(offset + 4, offset + 4 + len);
  const value = new TextDecoder().decode(bytes);
  return { value, bytesRead: 4 + len };
}

function i64ToDate(ts: number): Date | null {
  return ts === 0 ? null : new Date(ts * 1000);
}

function i64ToDateNonNull(ts: number): Date {
  return new Date(ts * 1000);
}

const DEFAULT_PUBKEY = '11111111111111111111111111111111';

/**
 * Deserialize a Solana entitlement account from raw bytes.
 * Skips the 8-byte Anchor discriminator.
 */
export function deserializeEntitlement(data: Uint8Array): Entitlement {
  let offset = 8; // skip discriminator
  const productId = readProductId(data, offset); offset += 32;
  const user = readPubkey(data, offset); offset += 32;
  const grantedAt = readI64LE(data, offset); offset += 8;
  const expiresAt = readI64LE(data, offset); offset += 8;
  const autoRenew = readBool(data, offset); offset += 1;
  const source = readU8(data, offset); offset += 1;
  const sourceId = readString(data, offset); offset += sourceId.bytesRead;
  const active = readBool(data, offset); offset += 1;
  const revokedAt = readI64LE(data, offset); offset += 8;
  const revokedBy = readPubkey(data, offset); offset += 32;

  return {
    productId,
    user,
    grantedAt: i64ToDateNonNull(grantedAt),
    expiresAt: i64ToDate(expiresAt),
    autoRenew,
    source: U8_TO_ENTITLEMENT_SOURCE[source] ?? ('platform' as EntitlementSource),
    sourceId: sourceId.value,
    active,
    revokedAt: i64ToDate(revokedAt),
    revokedBy: revokedBy === DEFAULT_PUBKEY ? null : revokedBy,
  };
}

/**
 * Deserialize a Solana product account from raw bytes.
 * Skips the 8-byte Anchor discriminator.
 */
export function deserializeProduct(data: Uint8Array): Product {
  let offset = 8;
  const creator = readPubkey(data, offset); offset += 32;
  const productId = readProductId(data, offset); offset += 32;
  const name = readString(data, offset); offset += name.bytesRead;
  const metadataUri = readString(data, offset); offset += metadataUri.bytesRead;
  const createdAt = readI64LE(data, offset); offset += 8;
  const updatedAt = readI64LE(data, offset); offset += 8;
  const active = readBool(data, offset); offset += 1;
  const frozen = readBool(data, offset); offset += 1;
  const entitlementCount = readU64LE(data, offset); offset += 8;
  const delegateCount = readU32LE(data, offset); offset += 4;
  const defaultDuration = readI64LE(data, offset); offset += 8;

  return {
    creator,
    productId,
    name: name.value,
    metadataUri: metadataUri.value,
    createdAt: i64ToDateNonNull(createdAt),
    updatedAt: i64ToDateNonNull(updatedAt),
    active,
    frozen,
    entitlementCount,
    delegateCount,
    defaultDuration,
  };
}
