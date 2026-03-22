import type { Store } from '@doubloon/core';
import type { CacheAdapter } from './cache.js';

export interface ProductMetadata {
  readonly productId: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string;
  readonly images: {
    readonly icon?: string;
    readonly banner?: string;
    readonly screenshots?: readonly string[];
  };
  readonly pricing: {
    readonly currency: string;
    readonly amount: number;
    readonly interval?: 'day' | 'week' | 'month' | 'year';
    readonly intervalCount?: number;
    readonly trialDays?: number;
  };
  readonly storeBindings: {
    readonly apple?: { readonly productIds: readonly string[]; readonly subscriptionGroupId?: string };
    readonly google?: { readonly productIds: readonly string[]; readonly basePlanIds?: readonly string[] };
    readonly stripe?: { readonly priceIds: readonly string[] };
    readonly x402?: { readonly priceUsd: number; readonly durationSeconds: number };
  };
  readonly features?: readonly string[];
  readonly config?: Readonly<Record<string, unknown>>;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface MetadataStore {
  getProduct(productId: string): Promise<ProductMetadata | null>;
  putProduct(metadata: ProductMetadata): Promise<{ uri: string }>;
  deleteProduct(productId: string): Promise<void>;
  listProducts(opts?: { creator?: string; limit?: number; offset?: number }): Promise<ProductMetadata[]>;
  putAsset(productId: string, name: string, data: Buffer, contentType: string): Promise<{ url: string }>;
  getAssetUrl(productId: string, name: string): Promise<string | null>;
}

export interface StoreProductResolver {
  resolveProductId(store: Store, storeSku: string): Promise<string | null>;
  resolveStoreSku(productId: string, store: Store): Promise<string[] | null>;
}

export class DefaultStoreProductResolver implements StoreProductResolver {
  constructor(
    private metadataStore: MetadataStore,
    private cache?: CacheAdapter,
  ) {}

  async resolveProductId(store: Store, storeSku: string): Promise<string | null> {
    const cacheKey = `sku:${store}:${storeSku}`;
    if (this.cache) {
      const cached = await this.cache.get<string>(cacheKey);
      if (cached !== null) return cached;
    }

    const products = await this.metadataStore.listProducts();
    for (const product of products) {
      const bindings = product.storeBindings[store];
      if (!bindings) continue;
      const skus: string[] = [];
      if ('productIds' in bindings) skus.push(...bindings.productIds);
      if ('priceIds' in bindings) skus.push(...(bindings as { priceIds: readonly string[] }).priceIds);
      if (skus.includes(storeSku)) {
        if (this.cache) await this.cache.set(cacheKey, product.productId, 300_000);
        return product.productId;
      }
    }

    return null;
  }

  async resolveStoreSku(productId: string, store: Store): Promise<string[] | null> {
    const product = await this.metadataStore.getProduct(productId);
    if (!product) return null;
    const bindings = product.storeBindings[store];
    if (!bindings) return null;
    if ('productIds' in bindings) return [...bindings.productIds];
    if ('priceIds' in bindings) return [...(bindings as { priceIds: readonly string[] }).priceIds];
    return null;
  }
}
