import type { MintInstruction, RevokeInstruction, EntitlementSource, Logger } from '@doubloon/core';
import { nullLogger } from '@doubloon/core';

export interface DoubloonEvmWriterConfig {
  rpcUrl: string;
  contractAddress: string;
  chainId: number;
  logger?: Logger;
}

function entitlementSourceToU8(source: EntitlementSource): number {
  const map: Record<EntitlementSource, number> = {
    platform: 0, creator: 1, delegate: 2,
    apple: 3, google: 4, stripe: 5, x402: 6,
  };
  return map[source];
}

// TODO: Connect to viem WalletClient for live RPC calls
export class DoubloonEvmWriter {
  private contractAddress: string;
  private logger: Logger;

  constructor(config: DoubloonEvmWriterConfig) {
    this.contractAddress = config.contractAddress;
    this.logger = config.logger ?? nullLogger;
  }

  /**
   * Registers a new product on-chain.
   * Placeholder – returns an empty hash until viem integration is complete.
   */
  async registerProduct(params: {
    productId: string;
    name: string;
    metadataUri: string;
    defaultDuration: number;
  }): Promise<{ hash: string }> {
    this.logger.info('Building registerProduct tx (placeholder – no wallet client configured)', { productId: params.productId });
    return { hash: '' };
  }

  /**
   * Mints an entitlement for a user.
   * Placeholder – returns an empty hash until viem integration is complete.
   */
  async mintEntitlement(params: MintInstruction & {
    autoRenew?: boolean;
  }): Promise<{ hash: string }> {
    this.logger.info('Building mintEntitlement tx (placeholder – no wallet client configured)', {
      productId: params.productId,
      user: params.user,
    });
    return { hash: '' };
  }

  /**
   * Revokes an existing entitlement.
   * Placeholder – returns an empty hash until viem integration is complete.
   */
  async revokeEntitlement(params: RevokeInstruction): Promise<{ hash: string }> {
    this.logger.info('Building revokeEntitlement tx (placeholder – no wallet client configured)', {
      productId: params.productId,
      user: params.user,
    });
    return { hash: '' };
  }
}
