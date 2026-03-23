import { describe, it, expect, vi } from 'vitest';
import { DoubloonNFTClient } from '../src/erc5643.js';
import type { DoubloonNFTConfig } from '../src/erc5643.js';
import { DoubloonError } from '@doubloon/core';
import type { Logger } from '@doubloon/core';

function createMockLogger(): Logger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  };
}

describe('DoubloonNFTClient', () => {
  const baseConfig: DoubloonNFTConfig = {
    contractAddress: '0x0000000000000000000000000000000000000001',
    rpcUrl: 'http://localhost:8545',
    chainId: 8453,
  };

  describe('constructor', () => {
    it('constructs with valid config', () => {
      const client = new DoubloonNFTClient(baseConfig);
      expect(client).toBeDefined();
      expect(client).toBeInstanceOf(DoubloonNFTClient);
    });

    it('constructs with custom logger', () => {
      const logger = createMockLogger();
      const client = new DoubloonNFTClient({ ...baseConfig, logger });
      expect(client).toBeDefined();
    });

    it('constructs with different chain IDs', () => {
      for (const chainId of [1, 10, 137, 42161, 8453]) {
        expect(new DoubloonNFTClient({ ...baseConfig, chainId })).toBeDefined();
      }
    });

    it('constructs with various RPC URL formats', () => {
      for (const rpcUrl of [
        'http://localhost:8545',
        'https://mainnet.infura.io/v3/key',
        'wss://eth-mainnet.g.alchemy.com/v2/key',
      ]) {
        expect(new DoubloonNFTClient({ ...baseConfig, rpcUrl })).toBeDefined();
      }
    });

    it('private fields are not accessible at runtime', () => {
      const client = new DoubloonNFTClient(baseConfig) as Record<string, unknown>;
      expect(client['contractAddress']).toBeUndefined();
      expect(client['rpcUrl']).toBeUndefined();
      expect(client['chainId']).toBeUndefined();
      expect(client['logger']).toBeUndefined();
    });
  });

  describe('computeTokenId', () => {
    const client = new DoubloonNFTClient(baseConfig);

    it('throws DoubloonError with RPC_ERROR code', () => {
      expect(() =>
        client.computeTokenId('a'.repeat(64), '0x' + '1'.repeat(40)),
      ).toThrow(
        expect.objectContaining({
          name: 'DoubloonError',
          code: 'RPC_ERROR',
        }),
      );
    });

    it('mentions viem in error message', () => {
      expect(() =>
        client.computeTokenId('a'.repeat(64), '0x' + '1'.repeat(40)),
      ).toThrow(/viem/);
    });

    it('error is not retryable', () => {
      expect(() =>
        client.computeTokenId('a'.repeat(64), '0x' + '1'.repeat(40)),
      ).toThrow(
        expect.objectContaining({ retryable: false }),
      );
    });

    it('logs debug before throwing', () => {
      const logger = createMockLogger();
      const loggedClient = new DoubloonNFTClient({ ...baseConfig, logger });
      expect(() => loggedClient.computeTokenId('product123', '0xuser')).toThrow();
      expect(logger.debug).toHaveBeenCalledWith('computeTokenId', {
        productId: 'product123',
        userAddress: '0xuser',
      });
    });

    it('throws with empty string inputs', () => {
      expect(() => client.computeTokenId('', '')).toThrow(DoubloonError);
    });
  });

  describe('getExpiration', () => {
    const client = new DoubloonNFTClient(baseConfig);

    it('throws DoubloonError with RPC_ERROR code', async () => {
      await expect(client.getExpiration('0x123')).rejects.toMatchObject({
        name: 'DoubloonError',
        code: 'RPC_ERROR',
        retryable: false,
      });
    });

    it('mentions RPC client in error message', async () => {
      await expect(client.getExpiration('0x123')).rejects.toThrow(
        'NFT client requires a configured RPC client',
      );
    });

    it('logs debug with tokenId before throwing', async () => {
      const logger = createMockLogger();
      const loggedClient = new DoubloonNFTClient({ ...baseConfig, logger });
      await expect(loggedClient.getExpiration('0xtoken456')).rejects.toThrow();
      expect(logger.debug).toHaveBeenCalledWith('getExpiration', {
        tokenId: '0xtoken456',
      });
    });

    it('throws with empty tokenId', async () => {
      await expect(client.getExpiration('')).rejects.toThrow(DoubloonError);
    });
  });

  describe('isRenewable', () => {
    const client = new DoubloonNFTClient(baseConfig);

    it('throws DoubloonError with RPC_ERROR code and correct message', async () => {
      await expect(client.isRenewable('0x123')).rejects.toMatchObject({
        name: 'DoubloonError',
        code: 'RPC_ERROR',
        retryable: false,
      });
      await expect(client.isRenewable('0x123')).rejects.toThrow(
        'NFT client requires a configured RPC client',
      );
    });

    it('logs debug before throwing', async () => {
      const logger = createMockLogger();
      const loggedClient = new DoubloonNFTClient({ ...baseConfig, logger });
      await expect(loggedClient.isRenewable('0xtok')).rejects.toThrow();
      expect(logger.debug).toHaveBeenCalledWith('isRenewable', {
        tokenId: '0xtok',
      });
    });
  });

  describe('mintSubscriptionNFT', () => {
    const client = new DoubloonNFTClient(baseConfig);
    const mintParams = {
      productId: 'b'.repeat(64),
      user: '0x' + 'ab'.repeat(20),
      expiration: new Date('2025-12-31T23:59:59Z'),
      renewable: true,
    };

    it('throws DoubloonError with RPC_ERROR code', async () => {
      await expect(client.mintSubscriptionNFT(mintParams)).rejects.toMatchObject({
        name: 'DoubloonError',
        code: 'RPC_ERROR',
        retryable: false,
      });
    });

    it('mentions wallet client in error message', async () => {
      await expect(client.mintSubscriptionNFT(mintParams)).rejects.toThrow(
        'NFT client requires a configured wallet client',
      );
    });

    it('logs info with params before throwing', async () => {
      const logger = createMockLogger();
      const loggedClient = new DoubloonNFTClient({ ...baseConfig, logger });
      await expect(loggedClient.mintSubscriptionNFT(mintParams)).rejects.toThrow();
      expect(logger.info).toHaveBeenCalledWith('mintSubscriptionNFT', mintParams);
    });

    it('throws with renewable=false', async () => {
      await expect(
        client.mintSubscriptionNFT({ ...mintParams, renewable: false }),
      ).rejects.toMatchObject({ code: 'RPC_ERROR' });
    });

    it('throws with past expiration date', async () => {
      await expect(
        client.mintSubscriptionNFT({ ...mintParams, expiration: new Date('2020-01-01') }),
      ).rejects.toMatchObject({ code: 'RPC_ERROR' });
    });
  });

  describe('renewSubscription', () => {
    const client = new DoubloonNFTClient(baseConfig);
    const renewParams = {
      tokenId: '0x' + 'ff'.repeat(32),
      durationSeconds: 30 * 24 * 60 * 60, // 30 days
    };

    it('throws DoubloonError with RPC_ERROR code', async () => {
      await expect(client.renewSubscription(renewParams)).rejects.toMatchObject({
        name: 'DoubloonError',
        code: 'RPC_ERROR',
        retryable: false,
      });
    });

    it('mentions wallet client in error message', async () => {
      await expect(client.renewSubscription(renewParams)).rejects.toThrow(
        'NFT client requires a configured wallet client',
      );
    });

    it('logs info with params before throwing', async () => {
      const logger = createMockLogger();
      const loggedClient = new DoubloonNFTClient({ ...baseConfig, logger });
      await expect(loggedClient.renewSubscription(renewParams)).rejects.toThrow();
      expect(logger.info).toHaveBeenCalledWith('renewSubscription', renewParams);
    });

    it('throws with various duration values', async () => {
      for (const durationSeconds of [0, 3600, 86400, 2592000]) {
        await expect(
          client.renewSubscription({ tokenId: '0x1', durationSeconds }),
        ).rejects.toMatchObject({ code: 'RPC_ERROR' });
      }
    });
  });
});
