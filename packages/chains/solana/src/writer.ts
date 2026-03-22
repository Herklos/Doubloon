import { Connection, PublicKey, Transaction, SystemProgram } from '@solana/web3.js';
import type { MintInstruction, RevokeInstruction, EntitlementSource, Logger } from '@doubloon/core';
import { deriveProductId, DoubloonError, nullLogger } from '@doubloon/core';
import {
  derivePlatformPda,
  deriveProductPda,
  deriveEntitlementPda,
  deriveDelegatePda,
} from './pda.js';

export interface DoubloonSolanaWriterConfig {
  rpcUrl: string;
  programId: string;
  commitment?: 'processed' | 'confirmed' | 'finalized';
  logger?: Logger;
}

function entitlementSourceToU8(source: EntitlementSource): number {
  const map: Record<EntitlementSource, number> = {
    platform: 0,
    creator: 1,
    delegate: 2,
    apple: 3,
    google: 4,
    stripe: 5,
    x402: 6,
  };
  return map[source];
}

export class DoubloonSolanaWriter {
  readonly connection: Connection;
  private programId: PublicKey;
  private logger: Logger;

  constructor(config: DoubloonSolanaWriterConfig) {
    this.connection = new Connection(config.rpcUrl, config.commitment ?? 'confirmed');
    this.programId = new PublicKey(config.programId);
    this.logger = config.logger ?? nullLogger;
  }

  async registerProduct(params: {
    slug: string;
    name: string;
    metadataUri: string;
    defaultDuration: number;
    creator: string;
  }): Promise<{ transaction: Transaction; productId: string }> {
    const productIdBytes = deriveProductId(params.slug);
    const productIdHex = Buffer.from(productIdBytes).toString('hex');
    const [productPda] = deriveProductPda(productIdBytes, this.programId);
    const [platformPda] = derivePlatformPda(this.programId);

    this.logger.info('Building registerProduct transaction', {
      slug: params.slug,
      productId: productIdHex,
    });

    const tx = new Transaction();
    // Note: In production, this would use the Anchor Program.methods API
    // For now, we build the transaction structure
    tx.feePayer = new PublicKey(params.creator);

    return { transaction: tx, productId: productIdHex };
  }

  async mintEntitlement(params: MintInstruction & {
    signer: string;
    autoRenew?: boolean;
  }): Promise<Transaction> {
    const [platformPda] = derivePlatformPda(this.programId);
    const [productPda] = deriveProductPda(params.productId, this.programId);
    const [entitlementPda] = deriveEntitlementPda(params.productId, params.user, this.programId);
    const [delegatePda] = deriveDelegatePda(params.productId, params.signer, this.programId);

    const expiresAtUnix = params.expiresAt ? Math.floor(params.expiresAt.getTime() / 1000) : 0;
    const sourceU8 = entitlementSourceToU8(params.source);

    this.logger.info('Building mintEntitlement transaction', {
      productId: params.productId,
      user: params.user,
      expiresAt: expiresAtUnix,
      source: params.source,
    });

    const tx = new Transaction();
    tx.feePayer = new PublicKey(params.signer);

    return tx;
  }

  async extendEntitlement(params: {
    productId: string;
    user: string;
    newExpiresAt: Date;
    source: EntitlementSource;
    sourceId: string;
    signer: string;
  }): Promise<Transaction> {
    const tx = new Transaction();
    tx.feePayer = new PublicKey(params.signer);
    return tx;
  }

  async revokeEntitlement(params: RevokeInstruction & {
    signer: string;
  }): Promise<Transaction> {
    const tx = new Transaction();
    tx.feePayer = new PublicKey(params.signer);
    return tx;
  }

  async batchMintEntitlements(params: {
    mints: MintInstruction[];
    signer: string;
    autoRenew?: boolean;
  }): Promise<Transaction[]> {
    if (params.mints.length === 0) return [];

    const MINTS_PER_TX = 3;
    const transactions: Transaction[] = [];

    for (let i = 0; i < params.mints.length; i += MINTS_PER_TX) {
      const batch = params.mints.slice(i, i + MINTS_PER_TX);
      const tx = new Transaction();
      tx.feePayer = new PublicKey(params.signer);
      transactions.push(tx);
    }

    return transactions;
  }

  async grantDelegation(params: {
    productId: string;
    delegate: string;
    expiresAt?: Date;
    maxMints?: number;
    signer: string;
  }): Promise<Transaction> {
    const tx = new Transaction();
    tx.feePayer = new PublicKey(params.signer);
    return tx;
  }

  async revokeDelegation(params: {
    productId: string;
    delegate: string;
    signer: string;
  }): Promise<Transaction> {
    const tx = new Transaction();
    tx.feePayer = new PublicKey(params.signer);
    return tx;
  }
}
