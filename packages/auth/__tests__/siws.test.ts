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

  it('expired message fails', () => {
    const keypair = nacl.sign.keyPair();
    const walletAddress = new PublicKey(keypair.publicKey).toBase58();
    const { message, nonce } = createSIWSMessage(
      { domain: 'test.com', expirationMinutes: -1 },
      walletAddress,
    );
    const messageBytes = new TextEncoder().encode(message);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    expect(() => verifySIWS(message, signature, nonce)).toThrow('Message has expired');
  });

  it('invalid wallet address fails', () => {
    const keypair = nacl.sign.keyPair();
    const badMessage = [
      'test.com wants you to sign in with your Solana account:',
      'not-a-valid-base58-key!!!',
      '',
      'Sign in to Doubloon',
      '',
      'Nonce: abc123',
      'Expiration Time: 2099-01-01T00:00:00.000Z',
    ].join('\n');
    const messageBytes = new TextEncoder().encode(badMessage);
    const signature = nacl.sign.detached(messageBytes, keypair.secretKey);
    expect(() => verifySIWS(badMessage, signature, 'abc123')).toThrow('Invalid wallet address');
  });

  it('malformed message with too few lines fails', () => {
    expect(() => verifySIWS('single line', new Uint8Array(64), 'nonce')).toThrow('Malformed SIWS message');
  });

  it('message missing Nonce field fails', () => {
    const msg = 'test.com wants you to sign in:\nwallet\n\nstatement\n\nExpiration Time: 2099-01-01T00:00:00.000Z';
    expect(() => verifySIWS(msg, new Uint8Array(64), 'nonce')).toThrow('Missing Nonce');
  });
});
