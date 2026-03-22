import type {
  Entitlement, EntitlementCheck, EntitlementSource, Product, Logger, Platform,
} from '@doubloon/core';
import { checkEntitlement, DoubloonError, nullLogger } from '@doubloon/core';
import { DoubloonAbi } from './abi.js';

const SOURCE_MAP: Record<number, EntitlementSource> = {
  0: 'platform', 1: 'creator', 2: 'delegate',
  3: 'apple', 4: 'google', 5: 'stripe', 6: 'x402',
};

export interface DoubloonEvmReaderConfig {
  rpcUrl: string;
  contractAddress: string;
  chainId: number;
  cacheTtlMs?: number;
  logger?: Logger;
}

// TODO: Connect to viem PublicClient for live RPC calls
export class DoubloonEvmReader {
  private contractAddress: string;
  private rpcUrl: string;
  private logger: Logger;

  constructor(config: DoubloonEvmReaderConfig) {
    this.contractAddress = config.contractAddress;
    this.rpcUrl = config.rpcUrl;
    this.logger = config.logger ?? nullLogger;
  }

  /**
   * Checks whether a user holds an active entitlement for the given product.
   * Requires a live RPC connection; returns false until viem integration is complete.
   */
  async isEntitled(productId: string, userAddress: string): Promise<boolean> {
    this.logger.debug('isEntitled check (placeholder – no RPC client configured)', { productId, userAddress });
    return false;
  }

  /**
   * Fetches the full entitlement record for a user/product pair.
   * Requires a live RPC connection; returns null until viem integration is complete.
   */
  async getEntitlement(productId: string, userAddress: string): Promise<Entitlement | null> {
    this.logger.debug('getEntitlement (placeholder – no RPC client configured)', { productId, userAddress });
    return null;
  }

  async checkEntitlement(productId: string, userAddress: string): Promise<EntitlementCheck> {
    const entitlement = await this.getEntitlement(productId, userAddress);
    return checkEntitlement(entitlement);
  }

  /**
   * Fetches on-chain product metadata.
   * Requires a live RPC connection; returns null until viem integration is complete.
   */
  async getProduct(productId: string): Promise<Product | null> {
    this.logger.debug('getProduct (placeholder – no RPC client configured)', { productId });
    return null;
  }
}
