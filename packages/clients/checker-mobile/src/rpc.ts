import { DoubloonError } from '@doubloon/core';

/**
 * Minimal JSON-RPC client using fetch(). Works in React Native, browsers, and Node.js.
 * No external dependencies.
 */

let rpcIdCounter = 1;

export interface JsonRpcResponse<T> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string };
}

export async function jsonRpcCall<T>(
  url: string,
  method: string,
  params: unknown[],
): Promise<T> {
  const id = rpcIdCounter++;
  const body = JSON.stringify({ jsonrpc: '2.0', id, method, params });

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  if (!res.ok) {
    throw new DoubloonError('RPC_ERROR', `RPC HTTP ${res.status}: ${res.statusText}`, {
      retryable: res.status >= 500,
    });
  }

  const json = (await res.json()) as JsonRpcResponse<T>;

  if (json.error) {
    throw new DoubloonError('RPC_ERROR', `RPC error ${json.error.code}: ${json.error.message}`, {
      retryable: json.error.code === -32005, // rate limited
    });
  }

  return json.result as T;
}

/**
 * Batch JSON-RPC call. Sends multiple requests in a single HTTP request.
 */
export async function jsonRpcBatch<T>(
  url: string,
  calls: Array<{ method: string; params: unknown[] }>,
): Promise<T[]> {
  if (calls.length === 0) return [];

  const batch = calls.map((call) => ({
    jsonrpc: '2.0' as const,
    id: rpcIdCounter++,
    method: call.method,
    params: call.params,
  }));

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(batch),
  });

  if (!res.ok) {
    throw new DoubloonError('RPC_ERROR', `RPC HTTP ${res.status}: ${res.statusText}`, {
      retryable: res.status >= 500,
    });
  }

  const results = (await res.json()) as Array<JsonRpcResponse<T>>;

  // Sort by id to match input order
  const sorted = [...results].sort((a, b) => a.id - b.id);
  return sorted.map((r) => {
    if (r.error) {
      throw new DoubloonError('RPC_ERROR', `RPC error ${r.error.code}: ${r.error.message}`);
    }
    return r.result as T;
  });
}
