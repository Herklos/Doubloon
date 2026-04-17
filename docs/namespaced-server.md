# Namespaced Server

Package: `@drakkar.software/doubloon-server`

`createNamespacedServer` runs multiple independent app configurations on a single HTTP server. Each namespace gets its own products, destination, bridges, and optional mode enforcement. Deduplication is shared across all namespaces.

Use this when you need to serve multiple mobile apps, multiple environments (prod + staging), or multiple tenants from one process.

---

## Quick Start

```ts
import { createNamespacedServer } from '@drakkar.software/doubloon-server';

const ns = createNamespacedServer({
  namespaces: {
    'app-a': {
      products: [{ slug: 'pro', name: 'Pro', defaultDuration: 2_592_000 }],
      destination: starfishDestA,
      bridges: { stripe: stripeA },
      mode: 'production',
    },
    'app-b': {
      products: [{ slug: 'basic', name: 'Basic', defaultDuration: 0 }],
      destination: anchorDestB,
      bridges: { apple: appleB, google: googleB },
    },
  },
  onMintFailure: async (instruction, error, ctx) => {
    console.error('Mint failed', { instruction, error, ctx });
  },
});

// In your HTTP server:
const result = await ns.handleRequest({ method, url, headers, body });
res.status(result.status).send(result.body);
```

---

## `createNamespacedServer`

### `NamespacedServerConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `namespaces` | `Record<string, NamespaceConfig>` | ✓ | Map of namespace name → config. Names must match `[a-zA-Z0-9_-]+` and may not be `webhook`, `check`, `health`, `products`, `entitlements`, or `batch`. |
| `onMintFailure` | `function` | ✓ | Default `onMintFailure` for namespaces that don't define their own. |
| `dedup` | `DedupStore` | | Shared dedup store across all namespaces. Defaults to `MemoryDedupStore`. |
| `rateLimiter` | `RateLimiterConfig \| false` | | Rate limit applied to each namespace. Default: 60 req/min. |
| `webhookSecret` | `string` | | Shared secret. All inbound webhooks across all namespaces must include `x-doubloon-secret: <value>`. |
| `logger` | `Logger` | | Optional structured logger. |

### `NamespaceConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `products` | `DoubloonProductConfig[]` | ✓ | Products for this namespace. |
| `destination` | `DestinationLike` | ✓ | Entitlement backend for this namespace. |
| `bridges` | `object` | | Bridge map for this namespace. |
| `hooks` | `object` | | Lifecycle hooks (same shape as single-server hooks, plus `onMintFailure`). |
| `mintRetry` | `MintRetryOpts` | | Retry config for this namespace. |
| `mode` | `'production' \| 'sandbox'` | | Environment enforcement for this namespace. Webhooks with a mismatched environment are rejected with 400. |

---

## URL Routing

The first path segment is the namespace name:

| Method | Path | Action |
|---|---|---|
| `POST` | `/{ns}/webhook` | Namespace webhook handler |
| `GET` | `/{ns}/check/{productId}/{wallet}` | Namespace entitlement check |
| `GET` | `/{ns}/health` | Returns `{ ok: true, namespace: "{ns}" }` |
| Any | Unknown namespace | 404 |

---

## `NamespacedServer` API

```ts
interface NamespacedServer {
  handleRequest(req: {
    method:   string;
    url:      string;
    headers:  Record<string, string>;
    body?:    Buffer | string;
  }): Promise<{ status: number; body?: string; headers?: Record<string, string> }>;

  getNamespace(name: string): NamespaceServer | undefined;
  namespaces(): string[];
  checkEntitlement(namespace: string, productId: string, wallet: string): Promise<EntitlementCheck>;
}
```

---

## Per-Namespace Mode

Isolate production and sandbox traffic within one process:

```ts
const ns = createNamespacedServer({
  namespaces: {
    'myapp-prod': {
      bridges: { google: new GoogleBridge({ environment: 'production', ... }) },
      destination: prodDestination,
      mode: 'production',
      ...
    },
    'myapp-staging': {
      bridges: { google: new GoogleBridge({ environment: 'sandbox', ... }) },
      destination: stagingDestination,
      mode: 'sandbox',
      ...
    },
  },
  ...
});
```

Point your production Pub/Sub topic at `/{ns}/webhook` using `myapp-prod`, and your test topic at `myapp-staging`.

---

## Shared vs Namespace-Scoped Resources

| Resource | Scope | Notes |
|---|---|---|
| `dedup` | Shared | Single dedup store prevents cross-namespace duplicate processing. |
| `rateLimiter` | Shared config, per-namespace enforcement | Same limits apply to each namespace. |
| `webhookSecret` | Shared | One secret for all namespaces. |
| `destination` | Per-namespace | Each namespace writes to its own backend. |
| `bridges` | Per-namespace | Each namespace can have different payment providers. |
| `products` | Per-namespace | Each namespace has its own product registry. |
| `mode` | Per-namespace | Independent environment enforcement per namespace. |

---

## Express Integration Example

```ts
import express from 'express';

const app = express();
app.use(express.raw({ type: '*/*' }));

app.all('*', async (req, res) => {
  const result = await ns.handleRequest({
    method:  req.method,
    url:     req.originalUrl,
    headers: req.headers as Record<string, string>,
    body:    req.body,
  });
  res.status(result.status);
  if (result.headers) {
    for (const [k, v] of Object.entries(result.headers)) res.setHeader(k, v);
  }
  res.send(result.body);
});
```
