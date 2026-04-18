import type { StoreNotification, MintInstruction, RevokeInstruction } from '@drakkar.software/doubloon-core';

export interface BridgeResult {
  notification: StoreNotification;
  instruction: MintInstruction | RevokeInstruction | null;
}

export interface StripeBridgeConfig {
  webhookSecret: string;
  productResolver: { resolveProductId(store: string, storeSku: string | null): Promise<string | null> };
  walletResolver: import('@drakkar.software/doubloon-core').WalletResolver;
  /** Optional custom wallet address validator. Overrides the default Solana/EVM check. */
  walletValidator?: (address: string) => boolean;
  /**
   * Optional transform applied to `client_reference_id` before it is used as
   * the wallet address. Use this when you embed extra data in the field
   * (e.g. `"{userId}_{weddingId}"`) and need to extract just the wallet part.
   *
   * @example
   * // Strip a trailing "_{weddingId}" suffix
   * clientReferenceIdTransform: (id) => id.split('_')[0]
   */
  clientReferenceIdTransform?: (id: string) => string;
  logger?: import('@drakkar.software/doubloon-core').Logger;
}
