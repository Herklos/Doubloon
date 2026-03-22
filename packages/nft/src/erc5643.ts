import type { Logger } from '@doubloon/core';
import { nullLogger } from '@doubloon/core';

export interface DoubloonNFTConfig {
  contractAddress: string;
  rpcUrl: string;
  chainId: number;
  logger?: Logger;
}

export class DoubloonNFTClient {
  private contractAddress: string;
  private logger: Logger;

  constructor(config: DoubloonNFTConfig) {
    this.contractAddress = config.contractAddress;
    this.logger = config.logger ?? nullLogger;
  }

  computeTokenId(productId: string, userAddress: string): string {
    // keccak256(abi.encodePacked(productId, user))
    // In production, use viem's keccak256
    this.logger.debug('computeTokenId', { productId, userAddress });
    return '';
  }

  async getExpiration(tokenId: string): Promise<Date | null> {
    this.logger.debug('getExpiration', { tokenId });
    return null;
  }

  async isRenewable(tokenId: string): Promise<boolean> {
    this.logger.debug('isRenewable', { tokenId });
    return false;
  }

  async mintSubscriptionNFT(params: {
    productId: string;
    user: string;
    expiration: Date;
    renewable: boolean;
  }): Promise<{ hash: string }> {
    this.logger.info('mintSubscriptionNFT', params);
    return { hash: '' };
  }

  async renewSubscription(params: {
    tokenId: string;
    durationSeconds: number;
  }): Promise<{ hash: string }> {
    this.logger.info('renewSubscription', params);
    return { hash: '' };
  }
}
