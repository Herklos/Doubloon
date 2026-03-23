import type {
  MintInstruction,
  RevokeInstruction,
  StoreNotification,
  EntitlementCheck,
  EntitlementCheckBatch,
  Store,
  Logger,
} from '@doubloon/core';
import { nullLogger, isMintInstruction, DoubloonError } from '@doubloon/core';
import { mintWithRetry } from './mint-retry.js';
import type { ChainWriter, ChainSigner, MintRetryOpts, MintRetryResult } from './mint-retry.js';
import { MemoryDedupStore } from './dedup.js';
import type { DedupStore } from './dedup.js';
import { createRateLimiter } from './rate-limiter.js';
import type { RateLimiterConfig, RateLimiter } from './rate-limiter.js';

export interface ServerConfig {
  chain: {
    reader: {
      checkEntitlement(productId: string, wallet: string): Promise<EntitlementCheck>;
      checkEntitlements(productIds: string[], wallet: string): Promise<EntitlementCheckBatch>;
    };
    writer: ChainWriter;
    signer: ChainSigner;
  };

  bridges: {
    apple?: {
      handleNotification(headers: Record<string, string>, body: Buffer): Promise<{
        notification: StoreNotification;
        instruction: MintInstruction | RevokeInstruction | null;
      }>;
    };
    google?: {
      handleNotification(headers: Record<string, string>, body: Buffer): Promise<{
        notification: StoreNotification;
        instruction: MintInstruction | RevokeInstruction | null;
        requiresAcknowledgment?: boolean;
      }>;
    };
    stripe?: {
      handleNotification(headers: Record<string, string>, body: Buffer): Promise<{
        notification: StoreNotification;
        instruction: MintInstruction | RevokeInstruction | null;
      }>;
    };
    x402?: {
      handleNotification(headers: Record<string, string>, body: Buffer): Promise<{
        notification: StoreNotification;
        instruction: MintInstruction | RevokeInstruction | null;
      }>;
    };
  };

  mintRetry?: MintRetryOpts;

  beforeMint?: (instruction: MintInstruction, notification: StoreNotification) => Promise<boolean>;
  afterMint?: (instruction: MintInstruction, txSignature: string) => Promise<void>;
  afterRevoke?: (instruction: RevokeInstruction, txSignature: string) => Promise<void>;
  onAcknowledgmentRequired?: (purchaseToken: string, deadline: Date) => Promise<void>;

  onMintFailure: (
    instruction: MintInstruction,
    error: Error,
    context: { store: Store; retryCount: number; willStoreRetry: boolean },
  ) => Promise<void>;

  /**
   * Deduplication store. If not provided, an in-memory store is used automatically.
   * For multi-instance deployments, provide a Redis or Postgres-backed implementation.
   */
  dedup?: DedupStore;

  /** @deprecated Use `dedup` instead. Kept for backwards compatibility. */
  isDuplicate?: (key: string) => Promise<boolean>;
  /** @deprecated Use `dedup` instead. */
  markProcessed?: (key: string) => Promise<void>;
  /** @deprecated Use `dedup` instead. */
  clearProcessed?: (key: string) => Promise<void>;

  /**
   * Rate limiter config. If not provided, defaults to 60 req/min per IP.
   * Set to `false` to disable rate limiting entirely.
   */
  rateLimiter?: RateLimiterConfig | false;

  logger?: Logger;
}

export function createServer(config: ServerConfig) {
  const logger = config.logger ?? nullLogger;

  // Initialize dedup — always on, defaults to in-memory
  const dedup: DedupStore = config.dedup ?? (
    config.isDuplicate
      ? { isDuplicate: config.isDuplicate, markProcessed: config.markProcessed ?? (async () => {}), clearProcessed: config.clearProcessed ?? (async () => {}) }
      : new MemoryDedupStore()
  );

  // Initialize rate limiter — defaults to 60 req/min, can be disabled with `false`
  const rateLimiter: RateLimiter | null = config.rateLimiter === false
    ? null
    : createRateLimiter(config.rateLimiter ?? undefined);

  function detectStore(req: {
    headers: Record<string, string>;
    body: Buffer | string;
  }): Store | null {
    if (req.headers['stripe-signature']) return 'stripe';

    const bodyStr = typeof req.body === 'string' ? req.body : req.body.toString('utf-8');

    if (bodyStr.startsWith('eyJ') || bodyStr.startsWith('{"signedPayload"')) return 'apple';

    try {
      const parsed = JSON.parse(bodyStr);
      if (parsed.message?.data) return 'google';
    } catch { /* not JSON */ }

    return null;
  }

  async function handleWebhook(req: {
    headers: Record<string, string>;
    body: Buffer | string;
  }): Promise<{ status: number; body?: string }> {
    // Rate limiting
    if (rateLimiter) {
      const allowed = await rateLimiter.check(req);
      if (!allowed) {
        logger.warn('Rate limited', { headers: req.headers });
        return { status: 429, body: 'Too many requests' };
      }
    }

    const store = detectStore(req);
    logger.info('Webhook received', { store });

    switch (store) {
      case 'apple':
        return handleStoreWebhook('apple', config.bridges.apple, req);
      case 'google':
        return handleStoreWebhook('google', config.bridges.google, req);
      case 'stripe':
        return handleStoreWebhook('stripe', config.bridges.stripe, req);
      default:
        return { status: 400, body: 'Unknown store' };
    }
  }

  async function handleStoreWebhook(
    store: Store,
    bridge: ServerConfig['bridges'][keyof ServerConfig['bridges']],
    req: { headers: Record<string, string>; body: Buffer | string },
  ): Promise<{ status: number; body?: string }> {
    if (!bridge) return { status: 404 };

    try {
      const body = typeof req.body === 'string' ? Buffer.from(req.body) : req.body;
      const maxBodySize = 1_048_576; // 1 MB
      if (body.length > maxBodySize) {
        return { status: 400, body: 'Payload too large' };
      }
      const result = await bridge.handleNotification(req.headers, body);

      // Deduplication (always active)
      if (await dedup.isDuplicate(result.notification.deduplicationKey)) {
        logger.info('Duplicate notification, skipping', {
          key: result.notification.deduplicationKey,
        });
        return { status: 200 };
      }

      // Mark as processed BEFORE processing to prevent duplicate processing
      await dedup.markProcessed(result.notification.deduplicationKey);

      try {
        // Process instruction
        if (result.instruction) {
          await processInstruction(result.instruction, result.notification, store);
        }

        // Google acknowledgment
        if (
          store === 'google' &&
          'requiresAcknowledgment' in result &&
          result.requiresAcknowledgment &&
          config.onAcknowledgmentRequired
        ) {
          const purchaseToken = result.notification.originalTransactionId || result.notification.id;
          await config.onAcknowledgmentRequired(purchaseToken, new Date(Date.now() + 3 * 86400000));
        }
      } catch (processingError) {
        // Clear the dedup key so the store can retry
        try {
          await dedup.clearProcessed(result.notification.deduplicationKey);
        } catch { /* don't mask the original error */ }
        throw processingError;
      }

      return { status: 200 };
    } catch (err) {
      logger.error('Webhook processing failed', { store, error: err });
      if (err instanceof DoubloonError) {
        const clientErrorCodes = ['INVALID_RECEIPT', 'PRODUCT_NOT_MAPPED', 'WALLET_NOT_LINKED', 'INVALID_SIGNATURE'];
        if (clientErrorCodes.includes(err.code)) {
          return { status: 400, body: err.message };
        }
      }
      return { status: 500 };
    }
  }

  async function processInstruction(
    instruction: MintInstruction | RevokeInstruction,
    notification: StoreNotification,
    store: Store,
  ): Promise<void> {
    if (isMintInstruction(instruction)) {
      const mint = instruction;

      if (config.beforeMint) {
        const allowed = await config.beforeMint(mint, notification);
        if (!allowed) {
          logger.info('Mint rejected by beforeMint hook', {
            productId: mint.productId,
            user: mint.user,
          });
          return;
        }
      }

      const result = await mintWithRetry(
        config.chain.writer,
        config.chain.signer,
        mint,
        config.mintRetry,
      );

      if (result.success) {
        logger.info('Entitlement minted', {
          productId: mint.productId,
          user: mint.user,
          tx: result.txSignature,
        });
        if (config.afterMint) await config.afterMint(mint, result.txSignature!);
      } else {
        logger.error('Mint failed after all retries', {
          productId: mint.productId,
          user: mint.user,
        });
        await config.onMintFailure(mint, result.lastError!, {
          store,
          retryCount: result.retryCount,
          willStoreRetry: store !== 'x402',
        });
      }
    } else {
      const revoke = instruction;
      try {
        if (config.chain.writer.revokeEntitlement) {
          const tx = await config.chain.writer.revokeEntitlement({
            ...revoke,
            signer: config.chain.signer.publicKey,
          });
          const txSignature = await config.chain.signer.signAndSend(tx);
          logger.info('Entitlement revoked', {
            productId: revoke.productId,
            user: revoke.user,
            tx: txSignature,
          });
          if (config.afterRevoke) await config.afterRevoke(revoke, txSignature);
        } else {
          logger.warn('Revoke not supported by chain writer', {
            productId: revoke.productId,
            user: revoke.user,
          });
        }
      } catch (err) {
        logger.error('Revoke failed', {
          productId: revoke.productId,
          user: revoke.user,
          error: err,
        });
        throw err;
      }
    }
  }

  async function checkEntitlement(
    productId: string,
    wallet: string,
  ): Promise<EntitlementCheck> {
    return config.chain.reader.checkEntitlement(productId, wallet);
  }

  async function checkEntitlements(
    productIds: string[],
    wallet: string,
  ): Promise<EntitlementCheckBatch> {
    return config.chain.reader.checkEntitlements(productIds, wallet);
  }

  return {
    handleWebhook,
    checkEntitlement,
    checkEntitlements,
    detectStore,
    processInstruction,
  };
}
