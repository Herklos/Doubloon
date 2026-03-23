import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { createSessionToken, verifySessionToken } from '../src/session.js';
import { DoubloonError } from '@doubloon/core';

describe('Session tokens', () => {
  const keypair = nacl.sign.keyPair();

  it('create and verify roundtrip', () => {
    const token = createSessionToken('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU', keypair.secretKey, 60);
    const result = verifySessionToken(token, keypair.publicKey);
    expect(result.wallet).toBe('7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU');
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('expired token fails verification', async () => {
    // Create a token that expires immediately (0 minutes TTL)
    const token = createSessionToken('wallet123', keypair.secretKey, 0);
    // Wait a tiny bit to ensure expiry
    await new Promise(r => setTimeout(r, 10));
    expect(() => verifySessionToken(token, keypair.publicKey)).toThrow('expired');
  });

  it('wrong key fails', () => {
    const otherKeypair = nacl.sign.keyPair();
    const token = createSessionToken('wallet123', keypair.secretKey, 60);
    expect(() => verifySessionToken(token, otherKeypair.publicKey)).toThrow(DoubloonError);
    expect(() => verifySessionToken(token, otherKeypair.publicKey)).toThrow('Invalid session token signature');
  });

  it('malformed token fails', () => {
    expect(() => verifySessionToken('not-a-token', keypair.publicKey)).toThrow('Malformed session token');
  });

  it('token format is base64url.base64url', () => {
    const token = createSessionToken('wallet123', keypair.secretKey, 60);
    const parts = token.split('.');
    expect(parts).toHaveLength(2);
    // Verify both parts are valid base64url (no +, /, or = chars)
    for (const part of parts) {
      expect(part).not.toMatch(/[+/=]/);
    }
  });

  it('roundtrip with many different wallets', () => {
    for (let i = 0; i < 100; i++) {
      const wallet = `wallet_${i}_${Math.random().toString(36)}`;
      const token = createSessionToken(wallet, keypair.secretKey, 60);
      const result = verifySessionToken(token, keypair.publicKey);
      expect(result.wallet).toBe(wallet);
    }
  });

  it('token with too many parts fails', () => {
    expect(() => verifySessionToken('a.b.c', keypair.publicKey)).toThrow('Malformed session token');
  });

  it('token with invalid payload fields fails', () => {
    // Create a signed token with missing 'w' field
    const payload = JSON.stringify({ e: Date.now() + 60000 });
    const payloadBytes = new TextEncoder().encode(payload);
    const sig = nacl.sign.detached(payloadBytes, keypair.secretKey);
    const b64url = (bytes: Uint8Array) =>
      Buffer.from(bytes).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const token = `${b64url(payloadBytes)}.${b64url(sig)}`;
    expect(() => verifySessionToken(token, keypair.publicKey)).toThrow('Malformed session token payload');
  });
});
