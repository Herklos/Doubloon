import { describe, it, expect } from 'vitest';
import type { MintInstruction } from '@doubloon/core';
import { DoubloonSolanaWriter } from '../src/writer.js';

const writer = new DoubloonSolanaWriter({
  rpcUrl: 'http://localhost:8899',
  programId: '11111111111111111111111111111111',
});

describe('DoubloonSolanaWriter', () => {
  it('registerProduct returns transaction and productId', async () => {
    const result = await writer.registerProduct({
      slug: 'pro-monthly',
      name: 'Pro Monthly',
      metadataUri: 'https://example.com/meta.json',
      defaultDuration: 2592000,
      creator: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    });
    expect(result.productId).toHaveLength(64);
    expect(result.transaction).toBeDefined();
  });

  it('batchMintEntitlements returns empty array for no mints', async () => {
    const txs = await writer.batchMintEntitlements({
      mints: [],
      signer: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    });
    expect(txs).toEqual([]);
  });

  it('batchMintEntitlements splits into correct number of transactions', async () => {
    const mints: MintInstruction[] = Array.from({ length: 7 }, (_, i) => ({
      productId: 'a'.repeat(64),
      user: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      expiresAt: new Date('2025-01-01'),
      source: 'apple' as const,
      sourceId: `tx_${i}`,
    }));

    const txs = await writer.batchMintEntitlements({
      mints,
      signer: '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
    });
    expect(txs).toHaveLength(3); // 3 + 3 + 1
  });
});
