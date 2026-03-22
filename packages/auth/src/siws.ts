import { randomBytes } from 'node:crypto';
import { DoubloonError } from '@doubloon/core';

export interface SIWSConfig {
  domain: string;
  statement?: string;
  expirationMinutes?: number;
}

export function createSIWSMessage(
  config: SIWSConfig,
  walletAddress: string,
): { message: string; nonce: string } {
  const nonce = randomBytes(16).toString('hex');
  const issuedAt = new Date().toISOString();
  const expiresAt = new Date(
    Date.now() + (config.expirationMinutes ?? 10) * 60_000,
  ).toISOString();

  const message = [
    `${config.domain} wants you to sign in with your Solana account:`,
    walletAddress,
    '',
    config.statement ?? 'Sign in to Doubloon',
    '',
    `Nonce: ${nonce}`,
    `Issued At: ${issuedAt}`,
    `Expiration Time: ${expiresAt}`,
  ].join('\n');

  return { message, nonce };
}

export function verifySIWS(
  message: string,
  signature: Uint8Array,
  expectedNonce: string,
): { wallet: string; expiresAt: Date } {
  const wallet = parseWalletFromMessage(message);
  const nonce = parseFieldFromMessage(message, 'Nonce');
  const expiresAtStr = parseFieldFromMessage(message, 'Expiration Time');

  if (nonce !== expectedNonce) {
    throw new DoubloonError('SIGNATURE_INVALID', 'Nonce mismatch');
  }

  const expiresAt = new Date(expiresAtStr);
  if (expiresAt < new Date()) {
    throw new DoubloonError('SIGNATURE_INVALID', 'Message has expired');
  }

  // Dynamically import tweetnacl to keep it as peer dep
  let nacl: typeof import('tweetnacl');
  try {
    nacl = require('tweetnacl');
  } catch {
    throw new DoubloonError('MISSING_CREDENTIALS', 'tweetnacl is required for SIWS verification');
  }

  let PublicKey: typeof import('@solana/web3.js').PublicKey;
  try {
    PublicKey = require('@solana/web3.js').PublicKey;
  } catch {
    throw new DoubloonError('MISSING_CREDENTIALS', '@solana/web3.js is required for SIWS verification');
  }

  const publicKey = new PublicKey(wallet);
  const messageBytes = new TextEncoder().encode(message);
  const valid = nacl.sign.detached.verify(messageBytes, signature, publicKey.toBytes());
  if (!valid) {
    throw new DoubloonError('SIGNATURE_INVALID', 'Invalid signature');
  }

  return { wallet, expiresAt };
}

function parseWalletFromMessage(message: string): string {
  const lines = message.split('\n');
  if (lines.length < 2) {
    throw new DoubloonError('SIGNATURE_INVALID', 'Malformed SIWS message');
  }
  return lines[1];
}

function parseFieldFromMessage(message: string, field: string): string {
  const prefix = `${field}: `;
  for (const line of message.split('\n')) {
    if (line.startsWith(prefix)) {
      return line.substring(prefix.length);
    }
  }
  throw new DoubloonError('SIGNATURE_INVALID', `Missing ${field} in message`);
}
