import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import {
  deserializePlatform,
  deserializeProduct,
  deserializeEntitlement,
  deserializeDelegate,
} from '../src/deserialize.js';

const DISC = 8; // 8-byte Anchor discriminator

/** Write a PublicKey (32 bytes) into buf at offset. */
function writePubkey(buf: Buffer, offset: number, pubkey: PublicKey): void {
  pubkey.toBuffer().copy(buf, offset);
}

/** Write a Borsh-style string (u32 length prefix + utf-8 bytes) into buf at offset. Returns bytes written. */
function writeString(buf: Buffer, offset: number, str: string): number {
  const encoded = Buffer.from(str, 'utf-8');
  buf.writeUInt32LE(encoded.length, offset);
  encoded.copy(buf, offset + 4);
  return 4 + encoded.length;
}

// ---------------------------------------------------------------------------
// Platform
// ---------------------------------------------------------------------------

function buildPlatformBuffer(opts: {
  authority: PublicKey;
  productCount: bigint;
  frozen: boolean;
}): Buffer {
  // discriminator(8) + authority(32) + productCount(8) + frozen(1)
  const buf = Buffer.alloc(DISC + 32 + 8 + 1);
  writePubkey(buf, DISC, opts.authority);
  buf.writeBigUInt64LE(opts.productCount, DISC + 32);
  buf[DISC + 40] = opts.frozen ? 1 : 0;
  return buf;
}

describe('deserializePlatform', () => {
  it('deserializes authority, productCount, and frozen=false', () => {
    const authority = PublicKey.unique();
    const buf = buildPlatformBuffer({ authority, productCount: 5n, frozen: false });
    const platform = deserializePlatform(buf);

    expect(platform.authority).toBe(authority.toBase58());
    expect(platform.productCount).toBe(5);
    expect(platform.frozen).toBe(false);
  });

  it('deserializes frozen=true', () => {
    const authority = PublicKey.unique();
    const buf = buildPlatformBuffer({ authority, productCount: 0n, frozen: true });
    const platform = deserializePlatform(buf);

    expect(platform.frozen).toBe(true);
    expect(platform.productCount).toBe(0);
  });

  it('handles large product count', () => {
    const buf = buildPlatformBuffer({
      authority: PublicKey.unique(),
      productCount: 1_000_000n,
      frozen: false,
    });
    const platform = deserializePlatform(buf);
    expect(platform.productCount).toBe(1_000_000);
  });
});

// ---------------------------------------------------------------------------
// Product
// ---------------------------------------------------------------------------

function buildProductBuffer(opts: {
  creator: PublicKey;
  productId: Buffer; // 32 bytes
  name: string;
  metadataUri: string;
  createdAt: bigint;
  updatedAt: bigint;
  active: boolean;
  frozen: boolean;
  entitlementCount: bigint;
  delegateCount: number;
  defaultDuration: bigint;
}): Buffer {
  // Conservative upper bound for allocation
  const size = DISC + 32 + 32 + (4 + 200) + (4 + 400) + 8 + 8 + 1 + 1 + 8 + 4 + 8;
  const buf = Buffer.alloc(size);
  let offset = DISC;

  writePubkey(buf, offset, opts.creator); offset += 32;
  opts.productId.copy(buf, offset); offset += 32;
  offset += writeString(buf, offset, opts.name);
  offset += writeString(buf, offset, opts.metadataUri);
  buf.writeBigInt64LE(opts.createdAt, offset); offset += 8;
  buf.writeBigInt64LE(opts.updatedAt, offset); offset += 8;
  buf[offset] = opts.active ? 1 : 0; offset += 1;
  buf[offset] = opts.frozen ? 1 : 0; offset += 1;
  buf.writeBigUInt64LE(opts.entitlementCount, offset); offset += 8;
  buf.writeUInt32LE(opts.delegateCount, offset); offset += 4;
  buf.writeBigInt64LE(opts.defaultDuration, offset); offset += 8;

  return buf.subarray(0, offset);
}

describe('deserializeProduct', () => {
  it('deserializes all product fields correctly', () => {
    const creator = PublicKey.unique();
    const productId = Buffer.alloc(32, 0xab);
    const ts = BigInt(Math.floor(Date.now() / 1000));

    const buf = buildProductBuffer({
      creator,
      productId,
      name: 'Pro Monthly',
      metadataUri: 'https://example.com/meta.json',
      createdAt: ts,
      updatedAt: ts + 100n,
      active: true,
      frozen: false,
      entitlementCount: 42n,
      delegateCount: 3,
      defaultDuration: 2_592_000n, // 30 days
    });

    const product = deserializeProduct(buf);

    expect(product.creator).toBe(creator.toBase58());
    expect(product.productId).toBe(productId.toString('hex'));
    expect(product.name).toBe('Pro Monthly');
    expect(product.metadataUri).toBe('https://example.com/meta.json');
    expect(product.createdAt).toEqual(new Date(Number(ts) * 1000));
    expect(product.updatedAt).toEqual(new Date(Number(ts + 100n) * 1000));
    expect(product.active).toBe(true);
    expect(product.frozen).toBe(false);
    expect(product.entitlementCount).toBe(42);
    expect(product.delegateCount).toBe(3);
    expect(product.defaultDuration).toBe(2_592_000);
  });

  it('handles empty name and metadataUri', () => {
    const buf = buildProductBuffer({
      creator: PublicKey.unique(),
      productId: Buffer.alloc(32),
      name: '',
      metadataUri: '',
      createdAt: 0n,
      updatedAt: 0n,
      active: false,
      frozen: true,
      entitlementCount: 0n,
      delegateCount: 0,
      defaultDuration: 0n,
    });
    const product = deserializeProduct(buf);
    expect(product.name).toBe('');
    expect(product.metadataUri).toBe('');
    expect(product.active).toBe(false);
    expect(product.frozen).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Delegate
// ---------------------------------------------------------------------------

function buildDelegateBuffer(opts: {
  productId: Buffer;
  delegate: PublicKey;
  grantedBy: PublicKey;
  grantedAt: bigint;
  expiresAt: bigint;
  maxMints: bigint;
  mintsUsed: bigint;
  active: boolean;
}): Buffer {
  // disc(8) + productId(32) + delegate(32) + grantedBy(32) + grantedAt(8) + expiresAt(8)
  // + maxMints(8) + mintsUsed(8) + active(1)
  const buf = Buffer.alloc(DISC + 32 + 32 + 32 + 8 + 8 + 8 + 8 + 1);
  let offset = DISC;

  opts.productId.copy(buf, offset); offset += 32;
  writePubkey(buf, offset, opts.delegate); offset += 32;
  writePubkey(buf, offset, opts.grantedBy); offset += 32;
  buf.writeBigInt64LE(opts.grantedAt, offset); offset += 8;
  buf.writeBigInt64LE(opts.expiresAt, offset); offset += 8;
  buf.writeBigUInt64LE(opts.maxMints, offset); offset += 8;
  buf.writeBigUInt64LE(opts.mintsUsed, offset); offset += 8;
  buf[offset] = opts.active ? 1 : 0;

  return buf;
}

describe('deserializeDelegate', () => {
  it('deserializes delegate with expiry', () => {
    const delegate = PublicKey.unique();
    const grantedBy = PublicKey.unique();
    const productId = Buffer.alloc(32, 0xcc);
    const grantedAt = 1700000000n;
    const expiresAt = 1700100000n;

    const buf = buildDelegateBuffer({
      productId,
      delegate,
      grantedBy,
      grantedAt,
      expiresAt,
      maxMints: 100n,
      mintsUsed: 7n,
      active: true,
    });

    const d = deserializeDelegate(buf);
    expect(d.productId).toBe(productId.toString('hex'));
    expect(d.delegate).toBe(delegate.toBase58());
    expect(d.grantedBy).toBe(grantedBy.toBase58());
    expect(d.grantedAt).toEqual(new Date(1700000000 * 1000));
    expect(d.expiresAt).toEqual(new Date(1700100000 * 1000));
    expect(d.maxMints).toBe(100);
    expect(d.mintsUsed).toBe(7);
    expect(d.active).toBe(true);
  });

  it('deserializes delegate with no expiry (expiresAt=0 → null)', () => {
    const buf = buildDelegateBuffer({
      productId: Buffer.alloc(32),
      delegate: PublicKey.unique(),
      grantedBy: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 0n,
      maxMints: 0n,
      mintsUsed: 0n,
      active: false,
    });

    const d = deserializeDelegate(buf);
    expect(d.expiresAt).toBeNull();
    expect(d.active).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Entitlement
// ---------------------------------------------------------------------------

function buildEntitlementBuffer(opts: {
  productId: Buffer;
  user: PublicKey;
  grantedAt: bigint;
  expiresAt: bigint;
  autoRenew: boolean;
  source: number;
  sourceId: string;
  active: boolean;
  revokedAt: bigint;
  revokedBy: PublicKey;
}): Buffer {
  // Upper bound allocation
  const size = DISC + 32 + 32 + 8 + 8 + 1 + 1 + (4 + 256) + 1 + 8 + 32;
  const buf = Buffer.alloc(size);
  let offset = DISC;

  opts.productId.copy(buf, offset); offset += 32;
  writePubkey(buf, offset, opts.user); offset += 32;
  buf.writeBigInt64LE(opts.grantedAt, offset); offset += 8;
  buf.writeBigInt64LE(opts.expiresAt, offset); offset += 8;
  buf[offset] = opts.autoRenew ? 1 : 0; offset += 1;
  buf[offset] = opts.source; offset += 1;
  offset += writeString(buf, offset, opts.sourceId);
  buf[offset] = opts.active ? 1 : 0; offset += 1;
  buf.writeBigInt64LE(opts.revokedAt, offset); offset += 8;
  writePubkey(buf, offset, opts.revokedBy); offset += 32;

  return buf.subarray(0, offset);
}

const DEFAULT_PUBKEY = new PublicKey('11111111111111111111111111111111');

describe('deserializeEntitlement', () => {
  it('deserializes active entitlement with future expiry', () => {
    const user = PublicKey.unique();
    const futureTs = BigInt(Math.floor(Date.now() / 1000) + 86400);

    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32, 0x01),
      user,
      grantedAt: 1700000000n,
      expiresAt: futureTs,
      autoRenew: true,
      source: 0,
      sourceId: 'txn_abc123',
      active: true,
      revokedAt: 0n,
      revokedBy: DEFAULT_PUBKEY,
    });

    const e = deserializeEntitlement(buf);
    expect(e.user).toBe(user.toBase58());
    expect(e.grantedAt).toEqual(new Date(1700000000 * 1000));
    expect(e.expiresAt).toEqual(new Date(Number(futureTs) * 1000));
    expect(e.autoRenew).toBe(true);
    expect(e.source).toBe('platform');
    expect(e.sourceId).toBe('txn_abc123');
    expect(e.active).toBe(true);
    expect(e.revokedAt).toBeNull();
    expect(e.revokedBy).toBeNull();
  });

  it('deserializes lifetime entitlement (expiresAt=0 → null)', () => {
    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32, 0x02),
      user: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 0n,
      autoRenew: false,
      source: 1,
      sourceId: '',
      active: true,
      revokedAt: 0n,
      revokedBy: DEFAULT_PUBKEY,
    });

    const e = deserializeEntitlement(buf);
    expect(e.expiresAt).toBeNull();
    expect(e.autoRenew).toBe(false);
    expect(e.source).toBe('creator');
  });

  it('deserializes revoked entitlement with non-null revokedBy', () => {
    const revoker = PublicKey.unique();
    const revokedTs = 1700050000n;

    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32, 0x03),
      user: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 1700100000n,
      autoRenew: false,
      source: 0,
      sourceId: 'revoke-test',
      active: false,
      revokedAt: revokedTs,
      revokedBy: revoker,
    });

    const e = deserializeEntitlement(buf);
    expect(e.active).toBe(false);
    expect(e.revokedAt).toEqual(new Date(1700050000 * 1000));
    expect(e.revokedBy).toBe(revoker.toBase58());
  });

  it('maps default pubkey (all zeros) for revokedBy to null', () => {
    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32),
      user: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 0n,
      autoRenew: false,
      source: 0,
      sourceId: '',
      active: true,
      revokedAt: 0n,
      revokedBy: DEFAULT_PUBKEY,
    });

    const e = deserializeEntitlement(buf);
    expect(e.revokedBy).toBeNull();
  });

  it.each([
    [0, 'platform'],
    [1, 'creator'],
    [2, 'delegate'],
    [3, 'apple'],
    [4, 'google'],
    [5, 'stripe'],
    [6, 'x402'],
  ] as const)('source u8=%i maps to %s', (sourceVal, expectedSource) => {
    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32),
      user: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 0n,
      autoRenew: false,
      source: sourceVal,
      sourceId: '',
      active: true,
      revokedAt: 0n,
      revokedBy: DEFAULT_PUBKEY,
    });

    const e = deserializeEntitlement(buf);
    expect(e.source).toBe(expectedSource);
  });

  it('unknown source value falls back to platform', () => {
    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32),
      user: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 0n,
      autoRenew: false,
      source: 255,
      sourceId: '',
      active: true,
      revokedAt: 0n,
      revokedBy: DEFAULT_PUBKEY,
    });

    const e = deserializeEntitlement(buf);
    expect(e.source).toBe('platform');
  });

  it('handles long sourceId string', () => {
    const longId = 'a]'.repeat(128);

    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32),
      user: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 0n,
      autoRenew: false,
      source: 5,
      sourceId: longId,
      active: true,
      revokedAt: 0n,
      revokedBy: DEFAULT_PUBKEY,
    });

    const e = deserializeEntitlement(buf);
    expect(e.sourceId).toBe(longId);
    expect(e.source).toBe('stripe');
  });

  it('handles UTF-8 sourceId', () => {
    const utf8Id = 'txn_日本語_test';

    const buf = buildEntitlementBuffer({
      productId: Buffer.alloc(32),
      user: PublicKey.unique(),
      grantedAt: 1700000000n,
      expiresAt: 0n,
      autoRenew: false,
      source: 4,
      sourceId: utf8Id,
      active: true,
      revokedAt: 0n,
      revokedBy: DEFAULT_PUBKEY,
    });

    const e = deserializeEntitlement(buf);
    expect(e.sourceId).toBe(utf8Id);
    expect(e.source).toBe('google');
  });
});
