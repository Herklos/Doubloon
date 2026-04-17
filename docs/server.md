# Server

Package: `@drakkar.software/doubloon-server`

The Doubloon server wires bridges, a destination, and lifecycle hooks into a single webhook handler plus entitlement check endpoint.

---

## Installation

```bash
pnpm add @drakkar.software/doubloon-server
```

---

## Quick Start with `defineConfig`

`defineConfig` is the recommended entry point. It auto-registers products on the destination and returns a ready `ServerConfig`.

```ts
import { defineConfig, createServer } from '@drakkar.software/doubloon-server';

const { serverConfig } = defineConfig({
  products: [
    { slug: 'pro', name: 'Pro', defaultDuration: 2_592_000 },
  ],
  destination: starfishDestination,
  bridges: { apple, google, stripe },
  onMintFailure: async (instruction, error, ctx) => {
    console.error('Mint failed', { instruction, error, ctx });
  },
});

const server = createServer(serverConfig);
```

---

## `defineConfig`

### `DoubloonConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `products` | `DoubloonProductConfig[]` | ✓ | Product definitions. Each entry is registered with the destination's registry. |
| `destination` | `DestinationLike` | ✓ | Entitlement backend. Pass `createStarfishDestination(...)` or `createAnchorDestination(...)`. |
| `bridges` | `object` | | Bridge map. Keys: `apple`, `google`, `stripe`, `x402`, or any custom string. |
| `onMintFailure` | `function` | ✓ | Called when a mint fails after all retries. Use to alert/queue for manual retry. |
| `hooks` | `object` | | Lifecycle hooks (see [Hooks](#hooks)). |
| `mintRetry` | `MintRetryOpts` | | Retry config for mint operations (see [Mint Retry](#mint-retry)). |
| `dedup` | `DedupStore` | | Deduplication store. Defaults to `MemoryDedupStore`. Use Redis/Postgres for multi-instance. |
| `rateLimiter` | `RateLimiterConfig \| false` | | Rate limiter config. Defaults to 60 req/min. Set `false` to disable. |
| `webhookSecret` | `string` | | Shared webhook secret. All inbound webhooks must include `x-doubloon-secret: <value>` header. |
| `mode` | `'production' \| 'sandbox'` | | Environment enforcement. Rejects webhooks with a mismatched `environment` field with HTTP 400. |
| `logger` | `Logger` | | Optional structured logger. |

### `DoubloonProductConfig`

| Field | Type | Description |
|---|---|---|
| `slug` | `string` | URL-safe product identifier (e.g. `'pro'`). Used to derive the on-chain product ID (SHA-256 hex). |
| `name` | `string` | Human-readable name. |
| `defaultDuration` | `number` | Entitlement duration in seconds. `0` = lifetime. |

---

## `createServer`

```ts
const server = createServer(serverConfig);

// Webhook handler (POST /webhook)
const result = await server.handleWebhook({ headers, body });
// result: { status: number; body?: string; headers?: Record<string, string> }

// Entitlement check (GET /check/:productId/:wallet)
const check = await server.checkEntitlement(productId, wallet);
// check: EntitlementCheck
```

Bridge routing: the server reads `x-doubloon-bridge` header to select a custom bridge. For built-in bridges (`apple`, `google`, `stripe`, `x402`), routing is automatic based on header patterns:
- Apple: `x-original-transaction-id` or `apple-original-transaction-id` present
- Google: Pub/Sub envelope detected
- Stripe: `stripe-signature` header present
- x402: `x-payment-id` header present
- Custom: set `x-doubloon-bridge: <key>` explicitly

---

## Mode

```ts
{ mode: 'production' }  // reject sandbox events (400)
{ mode: 'sandbox' }     // reject production events (400)
// omit mode            // accept both (default)
```

The check runs **before** deduplication so rejected events do not poison the dedup cache.

| Bridge | Environment source |
|---|---|
| Stripe | `event.livemode` |
| Apple | `payload.data.environment` (from signed JWS) |
| Google | `config.environment` (default `'production'`) |
| x402 | Always `'production'` |

---

## Hooks

All hooks are optional async functions.

```ts
hooks: {
  beforeMint: async (instruction, notification) => {
    // Return false to skip this mint (e.g., fraud check failed)
    return true;
  },
  afterMint: async (instruction, txSignature) => {
    // Triggered after successful mint
  },
  afterRevoke: async (instruction, txSignature) => {
    // Triggered after successful revoke
  },
  onAcknowledgmentRequired: async (purchaseToken, deadline) => {
    // Store the token for acknowledgment within deadline (Apple initial purchases)
  },
}
```

| Hook | Signature | Description |
|---|---|---|
| `beforeMint` | `(instruction, notification) => Promise<boolean>` | Return `false` to cancel the mint. |
| `afterMint` | `(instruction, txSignature) => Promise<void>` | Runs after a successful mint transaction. |
| `afterRevoke` | `(instruction, txSignature) => Promise<void>` | Runs after a successful revoke transaction. |
| `onAcknowledgmentRequired` | `(purchaseToken, deadline) => Promise<void>` | Called when a store requires acknowledgment (currently Apple `initial_purchase`). |

---

## Mint Retry

```ts
mintRetry: {
  maxRetries:  3,      // default
  baseDelayMs: 1000,   // default — exponential backoff from here
  maxDelayMs:  8000,   // default — backoff cap
}
```

Uses exponential backoff. Non-retryable errors (e.g. `PRODUCT_NOT_ACTIVE`) exit immediately. `onMintFailure` is called when all retries are exhausted.

---

## Deduplication

```ts
import { MemoryDedupStore } from '@drakkar.software/doubloon-server';

// Default: in-memory, 24h TTL, max 100k entries
const dedup = new MemoryDedupStore({ ttlMs: 24 * 60 * 60 * 1000, maxEntries: 100_000 });
```

### `DedupStore` Interface

For multi-instance deployments, implement `DedupStore` backed by Redis or Postgres:

```ts
interface DedupStore {
  isDuplicate(key: string): Promise<boolean>;
  markProcessed(key: string): Promise<void>;
  clearProcessed(key: string): Promise<void>;
  checkAndMark?(key: string): Promise<boolean>; // atomic check+mark (preferred)
}
```

Redis example using `checkAndMark` for atomicity:

```ts
const redisDedupStore: DedupStore = {
  async checkAndMark(key) {
    const result = await redis.set(key, '1', 'EX', 86400, 'NX');
    return result === null; // null = key existed = duplicate
  },
  async isDuplicate(key)      { return (await redis.exists(key)) === 1; },
  async markProcessed(key)    { await redis.set(key, '1', 'EX', 86400); },
  async clearProcessed(key)   { await redis.del(key); },
};
```

---

## Rate Limiter

```ts
rateLimiter: {
  maxRequests:  60,           // default: 60 per window
  windowMs:     60_000,       // default: 1 minute sliding window
  trustProxy:   true,         // trust x-forwarded-for (only behind a trusted proxy!)
  store:        customStore,  // optional RateLimiterStore implementation
  keyExtractor: (req) => req.headers['x-real-ip'] ?? 'unknown',
}
```

Set `rateLimiter: false` to disable entirely.

> **Warning:** Setting `trustProxy: true` without an actual trusted proxy allows clients to spoof their IP and bypass rate limiting. Provide a custom `keyExtractor` using `req.socket.remoteAddress` from your HTTP framework for per-IP limiting.

---

## Webhook Secret

```ts
webhookSecret: process.env.DOUBLOON_WEBHOOK_SECRET
```

When set, every inbound webhook must include `x-doubloon-secret: <value>`. Compared with a timing-safe equality check. Use this to protect the endpoint from unauthorized callers (e.g., in staging where no store signature verification exists).

---

## HTTP Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/webhook` | Receive store notifications. Body is the raw store payload. |
| `GET` | `/check/:productId/:wallet` | Check entitlement for a wallet. Returns `EntitlementCheck` JSON. |
| `GET` | `/health` | Returns `{ ok: true }`. |

---

## `EntitlementCheck` Response

```json
{
  "entitled":    true,
  "reason":      "active",
  "expiresAt":   "2026-05-17T00:00:00.000Z",
  "entitlement": {
    "productId":  "...",
    "user":       "7xKXtg...",
    "grantedAt":  "2026-04-17T00:00:00.000Z",
    "expiresAt":  "2026-05-17T00:00:00.000Z",
    "autoRenew":  true,
    "source":     "stripe",
    "sourceId":   "sub_xxx",
    "active":     true,
    "revokedAt":  null,
    "revokedBy":  null
  },
  "product":     null
}
```

`reason` values: `'active'`, `'not_found'`, `'expired'`, `'revoked'`.
