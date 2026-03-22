import { describe, it, expect } from 'vitest';
import { DoubloonNFTClient } from '../src/erc5643.js';

describe('DoubloonNFTClient', () => {
  const client = new DoubloonNFTClient({
    contractAddress: '0x0000000000000000000000000000000000000001',
    rpcUrl: 'http://localhost:8545',
    chainId: 8453,
  });

  it('constructs without error', () => {
    expect(client).toBeDefined();
  });

  it('getExpiration returns null for non-existent token', async () => {
    const result = await client.getExpiration('0x123');
    expect(result).toBeNull();
  });

  it('isRenewable returns false by default', async () => {
    const result = await client.isRenewable('0x123');
    expect(result).toBe(false);
  });

  it('mintSubscriptionNFT returns hash', async () => {
    const result = await client.mintSubscriptionNFT({
      productId: 'a'.repeat(64),
      user: '0x1234567890abcdef1234567890abcdef12345678',
      expiration: new Date('2025-01-01'),
      renewable: true,
    });
    expect(result).toHaveProperty('hash');
  });
});
