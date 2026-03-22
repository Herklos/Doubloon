import { describe, it, expect, afterEach } from 'vitest';
import { MemoryCacheAdapter } from '../src/cache.js';

describe('MemoryCacheAdapter', () => {
  let cache: MemoryCacheAdapter;

  afterEach(() => {
    cache?.destroy();
  });

  it('set and get roundtrip', async () => {
    cache = new MemoryCacheAdapter();
    await cache.set('key1', 'value1', 10_000);
    expect(await cache.get('key1')).toBe('value1');
  });

  it('returns null for missing key', async () => {
    cache = new MemoryCacheAdapter();
    expect(await cache.get('nonexistent')).toBeNull();
  });

  it('expires entries after TTL', async () => {
    cache = new MemoryCacheAdapter();
    await cache.set('key1', 'value1', 100);
    expect(await cache.get('key1')).toBe('value1');
    await new Promise((r) => setTimeout(r, 150));
    expect(await cache.get('key1')).toBeNull();
  });

  it('invalidate removes key', async () => {
    cache = new MemoryCacheAdapter();
    await cache.set('key1', 'value1', 10_000);
    await cache.invalidate('key1');
    expect(await cache.get('key1')).toBeNull();
  });

  it('invalidatePrefix removes matching keys', async () => {
    cache = new MemoryCacheAdapter();
    await cache.set('user:123:a', 'a', 10_000);
    await cache.set('user:123:b', 'b', 10_000);
    await cache.set('user:456:a', 'c', 10_000);
    await cache.invalidatePrefix('user:123:');
    expect(await cache.get('user:123:a')).toBeNull();
    expect(await cache.get('user:123:b')).toBeNull();
    expect(await cache.get('user:456:a')).toBe('c');
  });

  it('maxEntries evicts oldest on overflow', async () => {
    cache = new MemoryCacheAdapter({ maxEntries: 3 });
    await cache.set('k1', 'v1', 10_000);
    await cache.set('k2', 'v2', 10_000);
    await cache.set('k3', 'v3', 10_000);
    await cache.set('k4', 'v4', 10_000);
    // k1 should be evicted
    expect(await cache.get('k1')).toBeNull();
    expect(await cache.get('k4')).toBe('v4');
    expect(cache.size).toBe(3);
  });

  it('destroy stops cleanup timer', () => {
    cache = new MemoryCacheAdapter();
    cache.destroy();
    // No assertions needed - just verify no error
  });

  it('handles concurrent set/get operations', async () => {
    cache = new MemoryCacheAdapter();
    const ops = Array.from({ length: 100 }, (_, i) =>
      Promise.all([
        cache.set(`key${i}`, `value${i}`, 10_000),
        cache.get(`key${i}`),
      ]),
    );
    await Promise.all(ops);
    // Verify some values are retrievable
    expect(await cache.get('key50')).toBe('value50');
  });
});
