import { describe, it, expect } from 'vitest';
import { PublicKey } from '@solana/web3.js';
import { deriveProductIdHex, deriveProductId } from '@doubloon/core';
import {
  derivePlatformPda,
  deriveProductPda,
  deriveProductPdaFromSlug,
  deriveEntitlementPda,
  deriveDelegatePda,
} from '../src/pda.js';

const PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

describe('PDA derivation', () => {
  it('derivePlatformPda returns valid PublicKey', () => {
    const [pda, bump] = derivePlatformPda(PROGRAM_ID);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
    expect(bump).toBeLessThanOrEqual(255);
  });

  it('deriveProductPda is deterministic', () => {
    const productId = deriveProductIdHex('pro-monthly');
    const [a] = deriveProductPda(productId, PROGRAM_ID);
    const [b] = deriveProductPda(productId, PROGRAM_ID);
    expect(a.toBase58()).toBe(b.toBase58());
  });

  it('deriveProductPdaFromSlug matches deriveProductPda with hex', () => {
    const [fromSlug] = deriveProductPdaFromSlug('pro-monthly', PROGRAM_ID);
    const [fromHex] = deriveProductPda(deriveProductIdHex('pro-monthly'), PROGRAM_ID);
    expect(fromSlug.toBase58()).toBe(fromHex.toBase58());
  });

  it('deriveProductPda accepts Uint8Array', () => {
    const bytes = deriveProductId('pro-monthly');
    const hex = deriveProductIdHex('pro-monthly');
    const [fromBytes] = deriveProductPda(bytes, PROGRAM_ID);
    const [fromHex] = deriveProductPda(hex, PROGRAM_ID);
    expect(fromBytes.toBase58()).toBe(fromHex.toBase58());
  });

  it('deriveEntitlementPda differs for different users', () => {
    const productId = deriveProductIdHex('pro-monthly');
    const userA = PublicKey.unique();
    const userB = PublicKey.unique();
    const [pdaA] = deriveEntitlementPda(productId, userA, PROGRAM_ID);
    const [pdaB] = deriveEntitlementPda(productId, userB, PROGRAM_ID);
    expect(pdaA.toBase58()).not.toBe(pdaB.toBase58());
  });

  it('deriveEntitlementPda is deterministic for same inputs', () => {
    const productId = deriveProductIdHex('pro-monthly');
    const user = PublicKey.unique();
    const [a] = deriveEntitlementPda(productId, user, PROGRAM_ID);
    const [b] = deriveEntitlementPda(productId, user, PROGRAM_ID);
    expect(a.toBase58()).toBe(b.toBase58());
  });

  it('deriveEntitlementPda accepts string pubkey', () => {
    const productId = deriveProductIdHex('pro-monthly');
    const user = PublicKey.unique();
    const [fromPubkey] = deriveEntitlementPda(productId, user, PROGRAM_ID);
    const [fromString] = deriveEntitlementPda(productId, user.toBase58(), PROGRAM_ID);
    expect(fromPubkey.toBase58()).toBe(fromString.toBase58());
  });

  it('deriveDelegatePda returns valid PublicKey', () => {
    const productId = deriveProductIdHex('pro-monthly');
    const delegate = PublicKey.unique();
    const [pda, bump] = deriveDelegatePda(productId, delegate, PROGRAM_ID);
    expect(pda).toBeInstanceOf(PublicKey);
    expect(bump).toBeGreaterThanOrEqual(0);
  });
});
