import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MobileEvmChecker } from '../src/evm-checker.js';
import {
  encodeIsEntitled,
  encodeGetEntitlement,
  encodeGetProduct,
  decodeBool,
  SELECTORS,
} from '../src/evm-abi.js';

describe('EVM ABI encoding', () => {
  const productId = 'a'.repeat(64);
  const userAddress = '0x1234567890abcdef1234567890abcdef12345678';

  it('encodes isEntitled correctly', () => {
    const encoded = encodeIsEntitled(productId, userAddress);
    // Starts with the function selector
    expect(encoded.startsWith(SELECTORS.isEntitled)).toBe(true);
    // Total: 4-byte selector + 32-byte productId + 32-byte address = 68 bytes = 136 hex chars
    // But selector is already 8 chars (without 0x prefix stored as-is)
    expect(encoded.length).toBe(8 + 64 + 64); // selector + bytes32 + address
  });

  it('encodes getEntitlement correctly', () => {
    const encoded = encodeGetEntitlement(productId, userAddress);
    expect(encoded.startsWith(SELECTORS.getEntitlement)).toBe(true);
    expect(encoded.length).toBe(8 + 64 + 64);
  });

  it('encodes getProduct correctly', () => {
    const encoded = encodeGetProduct(productId);
    expect(encoded.startsWith(SELECTORS.getProduct)).toBe(true);
    expect(encoded.length).toBe(8 + 64);
  });

  it('decodes bool true', () => {
    const data = '0x' + '0'.repeat(63) + '1';
    expect(decodeBool(data)).toBe(true);
  });

  it('decodes bool false', () => {
    const data = '0x' + '0'.repeat(64);
    expect(decodeBool(data)).toBe(false);
  });

  it('decodes empty data as false', () => {
    expect(decodeBool('0x')).toBe(false);
    expect(decodeBool('')).toBe(false);
  });
});

describe('MobileEvmChecker', () => {
  it('constructs without error', () => {
    const checker = new MobileEvmChecker({
      rpcUrl: 'https://eth.example.com',
      contractAddress: '0x' + 'ab'.repeat(20),
    });
    expect(checker).toBeDefined();
  });

  it('checkEntitlements returns empty for empty list', async () => {
    const checker = new MobileEvmChecker({
      rpcUrl: 'https://eth.example.com',
      contractAddress: '0x' + 'ab'.repeat(20),
    });
    const result = await checker.checkEntitlements([], '0x' + '11'.repeat(20));
    expect(result.results).toEqual({});
    expect(result.user).toBe('0x' + '11'.repeat(20));
  });
});
