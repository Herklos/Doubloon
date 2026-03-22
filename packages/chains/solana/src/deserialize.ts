import type {
  Platform,
  Product,
  MintDelegate,
  Entitlement,
  EntitlementSource,
} from '@doubloon/core';
import { PublicKey } from '@solana/web3.js';

const ENTITLEMENT_SOURCE_MAP: Record<number, EntitlementSource> = {
  0: 'platform',
  1: 'creator',
  2: 'delegate',
  3: 'apple',
  4: 'google',
  5: 'stripe',
  6: 'x402',
};

function readPubkey(data: Buffer, offset: number): string {
  const bytes = data.subarray(offset, offset + 32);
  const pubkey = new PublicKey(bytes);
  return pubkey.toBase58();
}

function readI64(data: Buffer, offset: number): number {
  return Number(data.readBigInt64LE(offset));
}

function readU64(data: Buffer, offset: number): number {
  return Number(data.readBigUInt64LE(offset));
}

function readU16(data: Buffer, offset: number): number {
  return data.readUInt16LE(offset);
}

function readBool(data: Buffer, offset: number): boolean {
  return data[offset] !== 0;
}

function readU8(data: Buffer, offset: number): number {
  return data[offset];
}

function readString(data: Buffer, offset: number): { value: string; bytesRead: number } {
  const len = data.readUInt32LE(offset);
  const value = data.subarray(offset + 4, offset + 4 + len).toString('utf-8');
  return { value, bytesRead: 4 + len };
}

function readProductId(data: Buffer, offset: number): string {
  return data.subarray(offset, offset + 32).toString('hex');
}

function i64ToDate(ts: number): Date | null {
  return ts === 0 ? null : new Date(ts * 1000);
}

function i64ToDateNonNull(ts: number): Date {
  return new Date(ts * 1000);
}

function pubkeyIsDefault(address: string): boolean {
  return address === '11111111111111111111111111111111';
}

export function deserializePlatform(data: Buffer): Platform {
  // Skip 8-byte discriminator
  const offset = 8;
  return {
    authority: readPubkey(data, offset),
    productCount: readU64(data, offset + 32),
    frozen: readBool(data, offset + 40),
  };
}

export function deserializeProduct(data: Buffer): Product {
  let offset = 8; // discriminator
  const creator = readPubkey(data, offset); offset += 32;
  const productId = readProductId(data, offset); offset += 32;
  const name = readString(data, offset); offset += name.bytesRead;
  const metadataUri = readString(data, offset); offset += metadataUri.bytesRead;
  const createdAt = readI64(data, offset); offset += 8;
  const updatedAt = readI64(data, offset); offset += 8;
  const active = readBool(data, offset); offset += 1;
  const frozen = readBool(data, offset); offset += 1;
  const entitlementCount = readU64(data, offset); offset += 8;
  const delegateCount = readU16(data, offset); offset += 2;
  const defaultDuration = readI64(data, offset); offset += 8;

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

export function deserializeDelegate(data: Buffer): MintDelegate {
  let offset = 8;
  const productId = readProductId(data, offset); offset += 32;
  const delegate = readPubkey(data, offset); offset += 32;
  const grantedBy = readPubkey(data, offset); offset += 32;
  const grantedAt = readI64(data, offset); offset += 8;
  const expiresAt = readI64(data, offset); offset += 8;
  const maxMints = readU64(data, offset); offset += 8;
  const mintsUsed = readU64(data, offset); offset += 8;
  const active = readBool(data, offset); offset += 1;

  return {
    productId,
    delegate,
    grantedBy,
    grantedAt: i64ToDateNonNull(grantedAt),
    expiresAt: i64ToDate(expiresAt),
    maxMints,
    mintsUsed,
    active,
  };
}

export function deserializeEntitlement(data: Buffer): Entitlement {
  let offset = 8;
  const productId = readProductId(data, offset); offset += 32;
  const user = readPubkey(data, offset); offset += 32;
  const grantedAt = readI64(data, offset); offset += 8;
  const expiresAt = readI64(data, offset); offset += 8;
  const autoRenew = readBool(data, offset); offset += 1;
  const source = readU8(data, offset); offset += 1;
  const sourceId = readString(data, offset); offset += sourceId.bytesRead;
  const active = readBool(data, offset); offset += 1;
  const revokedAt = readI64(data, offset); offset += 8;
  const revokedBy = readPubkey(data, offset); offset += 32;

  return {
    productId,
    user,
    grantedAt: i64ToDateNonNull(grantedAt),
    expiresAt: i64ToDate(expiresAt),
    autoRenew,
    source: ENTITLEMENT_SOURCE_MAP[source] ?? 'platform',
    sourceId: sourceId.value,
    active,
    revokedAt: i64ToDate(revokedAt),
    revokedBy: pubkeyIsDefault(revokedBy) ? null : revokedBy,
  };
}
