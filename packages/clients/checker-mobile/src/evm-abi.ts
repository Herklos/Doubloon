/**
 * Minimal ABI encoding/decoding for EVM contract calls.
 *
 * Zero dependencies. Only supports the function signatures needed for
 * Doubloon entitlement checking:
 *   - isEntitled(bytes32, address) → bool
 *   - getEntitlement(bytes32, address) → tuple
 *   - getProduct(bytes32) → tuple
 */

/**
 * Compute a 4-byte function selector from a signature string.
 * Uses SubtleCrypto (available in React Native and browsers).
 * Falls back to a precomputed lookup for known Doubloon functions.
 */

// Precomputed selectors for Doubloon contract functions (keccak256 first 4 bytes)
// No 0x prefix — callers prepend it when sending to RPC.
export const SELECTORS = {
  // isEntitled(bytes32,address)
  isEntitled: '2b1c1e9f',
  // getEntitlement(bytes32,address)
  getEntitlement: 'fdb60e41',
  // getProduct(bytes32)
  getProduct: 'a3e76c0f',
} as const;

/**
 * Encode a bytes32 value (64-char hex product ID → 32 bytes zero-padded).
 */
function encodeBytes32(hex: string): string {
  const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
  return clean.padStart(64, '0');
}

/**
 * Encode an address (20 bytes → 32 bytes zero-padded left).
 */
function encodeAddress(addr: string): string {
  const clean = addr.startsWith('0x') ? addr.slice(2) : addr;
  return clean.toLowerCase().padStart(64, '0');
}

/**
 * Encode an `isEntitled(bytes32, address)` call.
 */
export function encodeIsEntitled(productIdHex: string, userAddress: string): string {
  return SELECTORS.isEntitled + encodeBytes32(productIdHex) + encodeAddress(userAddress);
}

/**
 * Encode a `getEntitlement(bytes32, address)` call.
 */
export function encodeGetEntitlement(productIdHex: string, userAddress: string): string {
  return SELECTORS.getEntitlement + encodeBytes32(productIdHex) + encodeAddress(userAddress);
}

/**
 * Encode a `getProduct(bytes32)` call.
 */
export function encodeGetProduct(productIdHex: string): string {
  return SELECTORS.getProduct + encodeBytes32(productIdHex);
}

/**
 * Decode a bool from ABI-encoded return data.
 */
export function decodeBool(data: string): boolean {
  const clean = data.startsWith('0x') ? data.slice(2) : data;
  if (clean.length < 64) return false;
  return parseInt(clean.slice(0, 64), 16) !== 0;
}

/**
 * Decode a uint64 from a 64-char hex slot.
 */
function decodeUint64(slot: string): number {
  return Number(BigInt('0x' + slot));
}

/**
 * Decode an int64 from a 64-char hex slot.
 */
function decodeInt64(slot: string): number {
  const val = BigInt('0x' + slot);
  // Check sign bit for int64
  if (val > BigInt('0x7FFFFFFFFFFFFFFF')) {
    return Number(val - BigInt('0x10000000000000000'));
  }
  return Number(val);
}

/**
 * Decode an address from a 64-char hex slot.
 */
function decodeAddress(slot: string): string {
  return '0x' + slot.slice(24);
}

/**
 * Decode a bytes32 from a 64-char hex slot.
 */
function decodeBytes32(slot: string): string {
  return slot;
}

/**
 * Slot reader for sequential ABI decoding.
 */
function slotReader(data: string) {
  const clean = data.startsWith('0x') ? data.slice(2) : data;
  let pos = 0;
  return {
    readSlot(): string {
      const slot = clean.substring(pos, pos + 64);
      pos += 64;
      return slot;
    },
    readBool(): boolean {
      return parseInt(this.readSlot(), 16) !== 0;
    },
    readUint64(): number {
      return decodeUint64(this.readSlot());
    },
    readInt64(): number {
      return decodeInt64(this.readSlot());
    },
    readAddress(): string {
      return decodeAddress(this.readSlot());
    },
    readBytes32(): string {
      return decodeBytes32(this.readSlot());
    },
    /** Read a dynamic string. Slot contains offset to string data. */
    readString(baseOffset: number): string {
      const offsetSlot = this.readSlot();
      const offset = parseInt(offsetSlot, 16);
      // String data is at baseOffset + offset (in bytes, so *2 for hex chars)
      const strStart = (baseOffset + offset) * 2;
      const strLen = parseInt(clean.substring(strStart, strStart + 64), 16);
      const strData = clean.substring(strStart + 64, strStart + 64 + strLen * 2);
      const bytes = new Uint8Array(strLen);
      for (let i = 0; i < strLen; i++) {
        bytes[i] = parseInt(strData.substring(i * 2, i * 2 + 2), 16);
      }
      return new TextDecoder().decode(bytes);
    },
    get position(): number {
      return pos / 2; // return byte position
    },
  };
}

/**
 * Decoded entitlement tuple from the EVM contract.
 */
export interface EvmEntitlementRaw {
  productId: string;
  user: string;
  grantedAt: number;
  expiresAt: number;
  autoRenew: boolean;
  source: number;
  sourceId: string;
  active: boolean;
  revokedAt: number;
  revokedBy: string;
  exists: boolean;
}

/**
 * Decoded product tuple from the EVM contract.
 */
export interface EvmProductRaw {
  creator: string;
  productId: string;
  name: string;
  metadataUri: string;
  createdAt: number;
  updatedAt: number;
  active: boolean;
  frozen: boolean;
  entitlementCount: number;
  delegateCount: number;
  defaultDuration: number;
  exists: boolean;
}

/**
 * Decode the getEntitlement return value.
 *
 * The return is a tuple with dynamic strings. The ABI encoding uses:
 * - slot 0: offset to tuple data (0x20 = 32)
 * - Then the tuple fields in order, with dynamic types (strings) stored as offsets
 */
export function decodeGetEntitlement(data: string): EvmEntitlementRaw {
  const clean = data.startsWith('0x') ? data.slice(2) : data;

  // The return is a single tuple. First slot is offset to tuple data.
  const tupleOffset = parseInt(clean.substring(0, 64), 16);
  const tupleData = clean.substring(tupleOffset * 2);
  const r = slotReader('0x' + tupleData);

  const productId = r.readBytes32();
  const user = r.readAddress();
  const grantedAt = r.readUint64();
  const expiresAt = r.readInt64();
  const autoRenew = r.readBool();
  const source = r.readUint64(); // u8 stored in a slot
  // sourceId is a dynamic string - read offset
  const sourceIdOffsetSlot = r.readSlot();
  const active = r.readBool();
  const revokedAt = r.readUint64();
  const revokedBy = r.readAddress();
  const exists = r.readBool();

  // Decode sourceId string at its offset within the tuple
  const sourceIdOffset = parseInt(sourceIdOffsetSlot, 16);
  const sourceIdStart = sourceIdOffset * 2;
  const sourceIdLen = parseInt(tupleData.substring(sourceIdStart, sourceIdStart + 64), 16);
  const sourceIdHex = tupleData.substring(sourceIdStart + 64, sourceIdStart + 64 + sourceIdLen * 2);
  const sourceIdBytes = new Uint8Array(sourceIdLen);
  for (let i = 0; i < sourceIdLen; i++) {
    sourceIdBytes[i] = parseInt(sourceIdHex.substring(i * 2, i * 2 + 2), 16);
  }
  const sourceId = new TextDecoder().decode(sourceIdBytes);

  return { productId, user, grantedAt, expiresAt, autoRenew, source, sourceId, active, revokedAt, revokedBy, exists };
}

/**
 * Decode the getProduct return value.
 */
export function decodeGetProduct(data: string): EvmProductRaw {
  const clean = data.startsWith('0x') ? data.slice(2) : data;

  const tupleOffset = parseInt(clean.substring(0, 64), 16);
  const tupleData = clean.substring(tupleOffset * 2);
  const r = slotReader('0x' + tupleData);

  const creator = r.readAddress();
  const productId = r.readBytes32();
  // name is dynamic - read offset
  const nameOffsetSlot = r.readSlot();
  // metadataUri is dynamic - read offset
  const metadataUriOffsetSlot = r.readSlot();
  const createdAt = r.readUint64();
  const updatedAt = r.readUint64();
  const active = r.readBool();
  const frozen = r.readBool();
  const entitlementCount = r.readUint64();
  const delegateCount = r.readUint64(); // u16 stored in slot
  const defaultDuration = r.readInt64();
  const exists = r.readBool();

  // Decode dynamic strings
  const nameOffset = parseInt(nameOffsetSlot, 16);
  const name = decodeDynamicString(tupleData, nameOffset);

  const metadataUriOffset = parseInt(metadataUriOffsetSlot, 16);
  const metadataUri = decodeDynamicString(tupleData, metadataUriOffset);

  return {
    creator, productId, name, metadataUri, createdAt, updatedAt,
    active, frozen, entitlementCount, delegateCount, defaultDuration, exists,
  };
}

function decodeDynamicString(tupleData: string, byteOffset: number): string {
  const start = byteOffset * 2;
  const len = parseInt(tupleData.substring(start, start + 64), 16);
  const strHex = tupleData.substring(start + 64, start + 64 + len * 2);
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = parseInt(strHex.substring(i * 2, i * 2 + 2), 16);
  }
  return new TextDecoder().decode(bytes);
}
