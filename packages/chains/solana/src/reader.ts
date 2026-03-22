import { Connection, PublicKey } from '@solana/web3.js';
import {
  type Entitlement,
  type EntitlementCheck,
  type EntitlementCheckBatch,
  type Product,
  type MintDelegate,
  type Platform,
  type Logger,
  checkEntitlement,
  checkEntitlements,
  deriveProductIdHex,
  DoubloonError,
  nullLogger,
} from '@doubloon/core';
import {
  deriveEntitlementPda,
  deriveProductPda,
  deriveDelegatePda,
  derivePlatformPda,
} from './pda.js';
import {
  deserializeEntitlement,
  deserializeProduct,
  deserializeDelegate,
  deserializePlatform,
} from './deserialize.js';

export interface CacheAdapter {
  get<T = unknown>(key: string): Promise<T | null>;
  set<T = unknown>(key: string, value: T, ttlMs: number): Promise<void>;
  invalidate(key: string): Promise<void>;
  invalidatePrefix(prefix: string): Promise<void>;
}

export interface DoubloonSolanaReaderConfig {
  rpcUrl: string;
  programId: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  cache?: CacheAdapter;
  cacheTtlMs?: number;
  logger?: Logger;
}

export class DoubloonSolanaReader {
  private connection: Connection;
  private programId: PublicKey;
  private cache?: CacheAdapter;
  private cacheTtlMs: number;
  private logger: Logger;

  constructor(config: DoubloonSolanaReaderConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment ?? 'confirmed');
    this.programId = new PublicKey(config.programId);
    this.cache = config.cache;
    this.cacheTtlMs = config.cacheTtlMs ?? 30_000;
    this.logger = config.logger ?? nullLogger;
  }

  async getPlatform(): Promise<Platform> {
    const [pda] = derivePlatformPda(this.programId);
    const account = await this.fetchAccount(pda, 'platform');
    if (!account) throw new DoubloonError('ACCOUNT_NOT_FOUND', 'Platform not initialized');
    return deserializePlatform(account);
  }

  async getProduct(productId: string): Promise<Product | null> {
    const [pda] = deriveProductPda(productId, this.programId);
    const account = await this.fetchAccount(pda, `product:${productId}`);
    return account ? deserializeProduct(account) : null;
  }

  async getProductBySlug(slug: string): Promise<Product | null> {
    const productId = deriveProductIdHex(slug);
    return this.getProduct(productId);
  }

  async getEntitlement(productId: string, userWallet: string): Promise<Entitlement | null> {
    const [pda] = deriveEntitlementPda(productId, userWallet, this.programId);
    const cacheKey = `entitlement:${productId}:${userWallet}`;
    const account = await this.fetchAccount(pda, cacheKey);
    return account ? deserializeEntitlement(account) : null;
  }

  async checkEntitlement(productId: string, userWallet: string): Promise<EntitlementCheck> {
    const entitlement = await this.getEntitlement(productId, userWallet);
    return checkEntitlement(entitlement);
  }

  async checkEntitlements(
    productIds: string[],
    userWallet: string,
  ): Promise<EntitlementCheckBatch> {
    const pdas = productIds.map(
      (pid) => deriveEntitlementPda(pid, userWallet, this.programId)[0],
    );
    const accounts = await this.connection.getMultipleAccountsInfo(pdas);

    const entitlements: Record<string, Entitlement | null> = {};
    for (let i = 0; i < productIds.length; i++) {
      entitlements[productIds[i]] = accounts[i]
        ? deserializeEntitlement(accounts[i]!.data as Buffer)
        : null;
    }

    const batch = checkEntitlements(entitlements);
    batch.user = userWallet;
    return batch;
  }

  async getUserEntitlements(
    userWallet: string,
    opts?: { activeOnly?: boolean },
  ): Promise<Entitlement[]> {
    const userPubkey = new PublicKey(userWallet);
    const filters = [
      { memcmp: { offset: 40, bytes: userPubkey.toBase58() } },
    ];
    const accounts = await this.connection.getProgramAccounts(this.programId, { filters });
    let entitlements = accounts.map((a) => deserializeEntitlement(a.account.data as Buffer));
    if (opts?.activeOnly) {
      const now = new Date();
      entitlements = entitlements.filter((e) => checkEntitlement(e, now).entitled);
    }
    return entitlements;
  }

  async getDelegate(productId: string, delegateWallet: string): Promise<MintDelegate | null> {
    const [pda] = deriveDelegatePda(productId, delegateWallet, this.programId);
    const account = await this.fetchAccount(pda, `delegate:${productId}:${delegateWallet}`);
    return account ? deserializeDelegate(account) : null;
  }

  private async fetchAccount(pda: PublicKey, cacheKey: string): Promise<Buffer | null> {
    if (this.cache) {
      const cached = await this.cache.get<Buffer>(cacheKey);
      if (cached !== null) {
        this.logger.debug('Cache hit', { key: cacheKey });
        return cached;
      }
    }

    const accountInfo = await this.connection.getAccountInfo(pda);
    if (!accountInfo) return null;

    if (this.cache) {
      await this.cache.set(cacheKey, accountInfo.data, this.cacheTtlMs);
    }

    return accountInfo.data as Buffer;
  }
}
