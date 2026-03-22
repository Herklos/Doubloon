import { PublicKey } from '@solana/web3.js';
import { deriveProductId } from '@doubloon/core';

// Placeholder program ID - will be updated after deployment
// Using a deterministic placeholder derived from "doubloon"
let PROGRAM_ID = new PublicKey('11111111111111111111111111111111');

export function setProgramId(id: string | PublicKey): void {
  PROGRAM_ID = typeof id === 'string' ? new PublicKey(id) : id;
}

export function getProgramId(): PublicKey {
  return PROGRAM_ID;
}

export function derivePlatformPda(programId: PublicKey = PROGRAM_ID): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
}

export function deriveProductPda(
  productId: string | Uint8Array,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const id = typeof productId === 'string' ? Buffer.from(productId, 'hex') : Buffer.from(productId);
  return PublicKey.findProgramAddressSync([Buffer.from('product'), id], programId);
}

export function deriveProductPdaFromSlug(
  slug: string,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  return deriveProductPda(deriveProductId(slug), programId);
}

export function deriveEntitlementPda(
  productId: string | Uint8Array,
  userPubkey: PublicKey | string,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const id = typeof productId === 'string' ? Buffer.from(productId, 'hex') : Buffer.from(productId);
  const user = typeof userPubkey === 'string' ? new PublicKey(userPubkey) : userPubkey;
  return PublicKey.findProgramAddressSync(
    [Buffer.from('entitlement'), id, user.toBuffer()],
    programId,
  );
}

export function deriveDelegatePda(
  productId: string | Uint8Array,
  delegatePubkey: PublicKey | string,
  programId: PublicKey = PROGRAM_ID,
): [PublicKey, number] {
  const id = typeof productId === 'string' ? Buffer.from(productId, 'hex') : Buffer.from(productId);
  const delegate = typeof delegatePubkey === 'string' ? new PublicKey(delegatePubkey) : delegatePubkey;
  return PublicKey.findProgramAddressSync(
    [Buffer.from('delegate'), id, delegate.toBuffer()],
    programId,
  );
}
