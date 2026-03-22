import type { Store } from '@doubloon/core';

/**
 * Maps store-specific user identifiers to wallet addresses.
 * The consumer implements this interface backed by their storage of choice.
 */
export interface WalletResolver {
  resolveWallet(store: Store, storeUserId: string): Promise<string | null>;
  linkWallet(store: Store, storeUserId: string, wallet: string): Promise<void>;
}
