import type { EntitlementCheck, EntitlementCheckBatch, MintInstruction } from '@doubloon/core';
import { checkEntitlement } from '@doubloon/core';

export interface UseEntitlementConfig {
  productId: string;
  wallet: string | null;
  reader: {
    checkEntitlement(productId: string, wallet: string): Promise<EntitlementCheck>;
  };
  pollIntervalMs?: number;
}

export interface UseEntitlementResult {
  loading: boolean;
  entitled: boolean;
  check: EntitlementCheck | null;
  error: Error | null;
  refresh: () => Promise<void>;
}

export interface UsePurchaseConfig {
  serverUrl: string;
  wallet: string | null;
}

export interface UsePurchaseResult {
  purchasing: boolean;
  error: Error | null;
  purchase: (productId: string, receipt: unknown) => Promise<boolean>;
}

// These are React hook signatures - actual implementation requires React
// They're exported as type references for the package API

export function createEntitlementChecker(config: {
  reader: UseEntitlementConfig['reader'];
}) {
  return {
    async check(productId: string, wallet: string): Promise<EntitlementCheck> {
      return config.reader.checkEntitlement(productId, wallet);
    },
    async checkBatch(productIds: string[], wallet: string): Promise<Record<string, EntitlementCheck>> {
      const results: Record<string, EntitlementCheck> = {};
      for (const pid of productIds) {
        results[pid] = await config.reader.checkEntitlement(pid, wallet);
      }
      return results;
    },
  };
}
