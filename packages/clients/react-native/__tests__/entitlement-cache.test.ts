import { describe, it, expect } from 'vitest';
import { EntitlementCache } from '../src/entitlement-cache.js';
import type { EntitlementCheck } from '@doubloon/core';

const mockCheck: EntitlementCheck = {
  entitled: true,
  entitlement: null,
  reason: 'active',
  expiresAt: new Date('2025-01-01'),
  product: null,
};

describe('EntitlementCache', () => {
  it('set and get roundtrip', () => {
    const cache = new EntitlementCache();
    cache.set('pid', 'wallet', mockCheck);
    expect(cache.get('pid', 'wallet')).toEqual(mockCheck);
  });

  it('returns null for missing entry', () => {
    const cache = new EntitlementCache();
    expect(cache.get('pid', 'wallet')).toBeNull();
  });

  it('expires entries after TTL', async () => {
    const cache = new EntitlementCache({ defaultTtlMs: 50 });
    cache.set('pid', 'wallet', mockCheck);
    expect(cache.get('pid', 'wallet')).toEqual(mockCheck);
    await new Promise((r) => setTimeout(r, 100));
    expect(cache.get('pid', 'wallet')).toBeNull();
  });

  it('invalidate removes specific entry', () => {
    const cache = new EntitlementCache();
    cache.set('pid1', 'wallet', mockCheck);
    cache.set('pid2', 'wallet', mockCheck);
    cache.invalidate('pid1', 'wallet');
    expect(cache.get('pid1', 'wallet')).toBeNull();
    expect(cache.get('pid2', 'wallet')).toEqual(mockCheck);
  });

  it('invalidateAll clears everything', () => {
    const cache = new EntitlementCache();
    cache.set('pid1', 'w1', mockCheck);
    cache.set('pid2', 'w2', mockCheck);
    cache.invalidateAll();
    expect(cache.size).toBe(0);
  });
});
