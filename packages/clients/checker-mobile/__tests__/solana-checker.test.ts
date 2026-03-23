import { describe, it, expect } from 'vitest';
import { MobileSolanaChecker } from '../src/solana-checker.js';
import {
  base58Decode,
  base58Encode,
  hexToBytes,
  bytesToHex,
  deriveProductIdHex,
} from '../src/solana-pda.js';
import { deserializeEntitlement, deserializeProduct } from '../src/solana-deserialize.js';

describe('base58', () => {
  it('round-trips encoding and decoding', () => {
    const original = '11111111111111111111111111111111'; // system program
    const decoded = base58Decode(original);
    expect(decoded.length).toBe(32);
    expect(decoded.every((b) => b === 0)).toBe(true);
    expect(base58Encode(decoded)).toBe(original);
  });

  it('encodes known values', () => {
    const bytes = new Uint8Array([1]);
    expect(base58Encode(bytes)).toBe('2');
  });
});

describe('hex utilities', () => {
  it('hexToBytes converts correctly', () => {
    const bytes = hexToBytes('deadbeef');
    expect(bytes).toEqual(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
  });

  it('bytesToHex converts correctly', () => {
    const hex = bytesToHex(new Uint8Array([0xde, 0xad, 0xbe, 0xef]));
    expect(hex).toBe('deadbeef');
  });

  it('round-trips hex', () => {
    const original = 'a'.repeat(64);
    expect(bytesToHex(hexToBytes(original))).toBe(original);
  });
});

describe('deriveProductIdHex', () => {
  it('produces a 64-char hex string', () => {
    const id = deriveProductIdHex('pro-monthly');
    expect(id).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic', () => {
    expect(deriveProductIdHex('pro-monthly')).toBe(deriveProductIdHex('pro-monthly'));
  });

  it('produces different IDs for different slugs', () => {
    expect(deriveProductIdHex('pro-monthly')).not.toBe(deriveProductIdHex('pro-yearly'));
  });
});

describe('Solana deserialization', () => {
  // Build a minimal entitlement account buffer
  function buildEntitlementBuffer(opts: {
    productId: string;
    user: Uint8Array;
    grantedAt: number;
    expiresAt: number;
    autoRenew: boolean;
    source: number;
    sourceId: string;
    active: boolean;
    revokedAt: number;
    revokedBy: Uint8Array;
  }): Uint8Array {
    const sourceIdBytes = new TextEncoder().encode(opts.sourceId);
    // 8 (disc) + 32 (productId) + 32 (user) + 8 (grantedAt) + 8 (expiresAt)
    // + 1 (autoRenew) + 1 (source) + 4+len (sourceId) + 1 (active)
    // + 8 (revokedAt) + 32 (revokedBy)
    const size = 8 + 32 + 32 + 8 + 8 + 1 + 1 + 4 + sourceIdBytes.length + 1 + 8 + 32;
    const buf = new Uint8Array(size);
    const view = new DataView(buf.buffer);
    let offset = 0;

    // Discriminator (8 bytes, arbitrary)
    offset = 8;

    // productId (32 bytes)
    const pidBytes = hexToBytes(opts.productId);
    buf.set(pidBytes, offset); offset += 32;

    // user (32 bytes)
    buf.set(opts.user, offset); offset += 32;

    // grantedAt i64 LE
    view.setBigInt64(offset, BigInt(opts.grantedAt), true); offset += 8;

    // expiresAt i64 LE
    view.setBigInt64(offset, BigInt(opts.expiresAt), true); offset += 8;

    // autoRenew
    buf[offset] = opts.autoRenew ? 1 : 0; offset += 1;

    // source u8
    buf[offset] = opts.source; offset += 1;

    // sourceId (u32 len + string bytes)
    view.setUint32(offset, sourceIdBytes.length, true); offset += 4;
    buf.set(sourceIdBytes, offset); offset += sourceIdBytes.length;

    // active
    buf[offset] = opts.active ? 1 : 0; offset += 1;

    // revokedAt i64 LE
    view.setBigInt64(offset, BigInt(opts.revokedAt), true); offset += 8;

    // revokedBy (32 bytes)
    buf.set(opts.revokedBy, offset);

    return buf;
  }

  it('deserializes an active entitlement', () => {
    const productId = 'ab'.repeat(32);
    const user = new Uint8Array(32).fill(1); // non-zero pubkey
    const grantedAt = 1700000000;
    const expiresAt = 1900000000;

    const data = buildEntitlementBuffer({
      productId,
      user,
      grantedAt,
      expiresAt,
      autoRenew: true,
      source: 5, // stripe
      sourceId: 'sub_test_123',
      active: true,
      revokedAt: 0,
      revokedBy: new Uint8Array(32), // default pubkey (all zeros)
    });

    const entitlement = deserializeEntitlement(data);
    expect(entitlement.productId).toBe(productId);
    expect(entitlement.active).toBe(true);
    expect(entitlement.autoRenew).toBe(true);
    expect(entitlement.source).toBe('stripe');
    expect(entitlement.sourceId).toBe('sub_test_123');
    expect(entitlement.expiresAt).toEqual(new Date(expiresAt * 1000));
    expect(entitlement.grantedAt).toEqual(new Date(grantedAt * 1000));
    expect(entitlement.revokedAt).toBeNull();
    expect(entitlement.revokedBy).toBeNull();
  });

  it('deserializes a lifetime entitlement (expiresAt = 0)', () => {
    const data = buildEntitlementBuffer({
      productId: 'cd'.repeat(32),
      user: new Uint8Array(32).fill(2),
      grantedAt: 1700000000,
      expiresAt: 0,
      autoRenew: false,
      source: 0,
      sourceId: 'grant_1',
      active: true,
      revokedAt: 0,
      revokedBy: new Uint8Array(32),
    });

    const entitlement = deserializeEntitlement(data);
    expect(entitlement.expiresAt).toBeNull();
    expect(entitlement.source).toBe('platform');
  });

  it('deserializes a revoked entitlement', () => {
    const revokedBy = new Uint8Array(32).fill(99);
    const data = buildEntitlementBuffer({
      productId: 'ef'.repeat(32),
      user: new Uint8Array(32).fill(3),
      grantedAt: 1700000000,
      expiresAt: 1900000000,
      autoRenew: false,
      source: 3,
      sourceId: 'txn_1',
      active: false,
      revokedAt: 1750000000,
      revokedBy,
    });

    const entitlement = deserializeEntitlement(data);
    expect(entitlement.active).toBe(false);
    expect(entitlement.revokedAt).toEqual(new Date(1750000000 * 1000));
    expect(entitlement.revokedBy).not.toBeNull();
  });
});

describe('MobileSolanaChecker', () => {
  it('constructs without error', () => {
    const checker = new MobileSolanaChecker({
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      programId: 'Dub1oon11111111111111111111111111111111111',
    });
    expect(checker).toBeDefined();
  });

  it('checkEntitlements returns empty for empty list', async () => {
    const checker = new MobileSolanaChecker({
      rpcUrl: 'https://api.mainnet-beta.solana.com',
      programId: 'Dub1oon11111111111111111111111111111111111',
    });
    const result = await checker.checkEntitlements([], 'SomeWallet');
    expect(result.results).toEqual({});
    expect(result.user).toBe('SomeWallet');
  });
});
