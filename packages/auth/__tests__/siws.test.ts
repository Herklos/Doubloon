import { describe, it, expect } from 'vitest';
import nacl from 'tweetnacl';
import { PublicKey } from '@solana/web3.js';
import { createSIWSMessage, verifySIWS } from '../src/siws.js';
import { DoubloonError } from '@doubloon/core';

describe('SIWS', () => {
  it('create message, sign, and verify', () => {
    const keypair = nacl.sign.keyPair();
    const walletAddress = new PublicKey(keypair.publicKey).toBase58();

    const { message, nonce } = createSIWSMessage(
      { domain: 'app.example.com', statement: 'Sign in to test' },
      walletAddress,
    );

    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);

    const result = verifySIWS(message, signature, nonce);
    expect(result.wallet).toBe(walletAddress);
    expect(result.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it('wrong signature fails', () => {
    const keypair = nacl.sign.keyPair();
    const walletAddress = new PublicKey(keypair.publicKey).toBase58();
    const { message, nonce } = createSIWSMessage({ domain: 'test.com' }, walletAddress);
    const badSig = new Uint8Array(64);
    expect(() => verifySIWS(message, badSig, nonce)).toThrow('Invalid signature');
  });

  it('wrong nonce fails', () => {
    const keypair = nacl.sign.keyPair();
    const walletAddress = new PublicKey(keypair.publicKey).toBase58();
    const { message } = createSIWSMessage({ domain: 'test.com' }, walletAddress);
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    expect(() => verifySIWS(message, signature, 'wrong-nonce')).toThrow('Nonce mismatch');
  });

  it('message format contains expected fields', () => {
    const { message, nonce } = createSIWSMessage(
      { domain: 'app.example.com', statement: 'Custom statement' },
      'TestWalletAddress',
    );
    expect(message).toContain('app.example.com wants you to sign in');
    expect(message).toContain('TestWalletAddress');
    expect(message).toContain('Custom statement');
    expect(message).toContain(`Nonce: ${nonce}`);
    expect(message).toContain('Issued At:');
    expect(message).toContain('Expiration Time:');
  });
});
