import { describe, it, expect } from 'vitest';
import { DefaultStoreProductResolver } from '../src/metadata.js';
import type { MetadataStore, ProductMetadata } from '../src/metadata.js';
import { MemoryCacheAdapter } from '../src/cache.js';

function makeMockMetadataStore(products: ProductMetadata[]): MetadataStore {
  return {
    async getProduct(productId: string) {
      return products.find((p) => p.productId === productId) ?? null;
    },
    async putProduct() { return { uri: '' }; },
    async deleteProduct() {},
    async listProducts() { return products; },
    async putAsset() { return { url: '' }; },
    async getAssetUrl() { return null; },
  };
}

const testProducts: ProductMetadata[] = [
  {
    productId: 'aaa', slug: 'pro-monthly', name: 'Pro Monthly', description: '',
    images: {}, pricing: { currency: 'USD', amount: 9.99 },
    storeBindings: {
      apple: { productIds: ['com.app.pro.monthly'] },
      stripe: { priceIds: ['price_1234'] },
    },
    createdAt: '', updatedAt: '',
  },
  {
    productId: 'bbb', slug: 'pro-annual', name: 'Pro Annual', description: '',
    images: {}, pricing: { currency: 'USD', amount: 99.99 },
    storeBindings: {
      apple: { productIds: ['com.app.pro.annual'] },
      google: { productIds: ['pro_annual'] },
    },
    createdAt: '', updatedAt: '',
  },
  {
    productId: 'ccc', slug: 'lifetime', name: 'Lifetime', description: '',
    images: {}, pricing: { currency: 'USD', amount: 299 },
    storeBindings: {
      stripe: { priceIds: ['price_5678'] },
    },
    createdAt: '', updatedAt: '',
  },
];

describe('DefaultStoreProductResolver', () => {
  it('resolves Apple SKU to productId', async () => {
    const resolver = new DefaultStoreProductResolver(makeMockMetadataStore(testProducts));
    expect(await resolver.resolveProductId('apple', 'com.app.pro.monthly')).toBe('aaa');
  });

  it('returns null for unknown SKU', async () => {
    const resolver = new DefaultStoreProductResolver(makeMockMetadataStore(testProducts));
    expect(await resolver.resolveProductId('apple', 'unknown-sku')).toBeNull();
  });

  it('resolves Stripe price to productId', async () => {
    const resolver = new DefaultStoreProductResolver(makeMockMetadataStore(testProducts));
    expect(await resolver.resolveProductId('stripe', 'price_1234')).toBe('aaa');
  });

  it('resolves store SKU from productId', async () => {
    const resolver = new DefaultStoreProductResolver(makeMockMetadataStore(testProducts));
    expect(await resolver.resolveStoreSku('aaa', 'apple')).toEqual(['com.app.pro.monthly']);
  });

  it('returns null for missing store binding', async () => {
    const resolver = new DefaultStoreProductResolver(makeMockMetadataStore(testProducts));
    expect(await resolver.resolveStoreSku('bbb', 'stripe')).toBeNull();
  });

  it('uses cache on second call', async () => {
    const cache = new MemoryCacheAdapter();
    const store = makeMockMetadataStore(testProducts);
    let listCallCount = 0;
    const trackedStore = {
      ...store,
      async listProducts() {
        listCallCount++;
        return store.listProducts();
      },
    };
    const resolver = new DefaultStoreProductResolver(trackedStore, cache);

    await resolver.resolveProductId('apple', 'com.app.pro.monthly');
    expect(listCallCount).toBe(1);
    await resolver.resolveProductId('apple', 'com.app.pro.monthly');
    expect(listCallCount).toBe(1); // Cache hit

    cache.destroy();
  });
});
