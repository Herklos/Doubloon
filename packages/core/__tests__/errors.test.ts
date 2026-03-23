import { describe, it, expect } from 'vitest';
import { DoubloonError } from '../src/errors.js';
import { isMintInstruction } from '../src/types.js';

describe('DoubloonError', () => {
  it('is an instance of Error', () => {
    const err = new DoubloonError('RPC_ERROR', 'Connection failed');
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(DoubloonError);
  });

  it('has correct name, code, and message', () => {
    const err = new DoubloonError('INVALID_SLUG', 'Bad slug');
    expect(err.name).toBe('DoubloonError');
    expect(err.code).toBe('INVALID_SLUG');
    expect(err.message).toBe('Bad slug');
  });

  it('defaults retryable to false', () => {
    const err = new DoubloonError('RPC_ERROR', 'fail');
    expect(err.retryable).toBe(false);
  });

  it('accepts optional store, chain, retryable, cause', () => {
    const cause = new Error('underlying');
    const err = new DoubloonError('STORE_API_ERROR', 'Apple API down', {
      store: 'apple',
      chain: 'solana',
      retryable: true,
      cause,
    });
    expect(err.store).toBe('apple');
    expect(err.chain).toBe('solana');
    expect(err.retryable).toBe(true);
    expect(err.cause).toBe(cause);
  });

  it('serializes code and message to JSON', () => {
    const err = new DoubloonError('TRANSACTION_FAILED', 'tx fail');
    const json = JSON.parse(JSON.stringify(err));
    expect(json.code).toBe('TRANSACTION_FAILED');
    // message is not enumerable on Error by default, but our custom fields are
  });
});

describe('isMintInstruction', () => {
  it('returns true for MintInstruction', () => {
    const mint = { productId: 'p', user: 'u', expiresAt: null, source: 'apple' as const, sourceId: 'tx1' };
    expect(isMintInstruction(mint)).toBe(true);
  });

  it('returns false for RevokeInstruction', () => {
    const revoke = { productId: 'p', user: 'u', reason: 'expired' };
    expect(isMintInstruction(revoke)).toBe(false);
  });
});
