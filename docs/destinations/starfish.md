# Starfish Destination

Package: `@drakkar.software/doubloon-starfish`

Stores entitlements in a [Starfish](https://github.com/drakkar-software/starfish) HTTP data store. Starfish is an append-only, hash-chained document store — entitlements are written as JSON documents per user, keyed by wallet address.

---

## Installation

```bash
pnpm add @drakkar.software/doubloon-starfish
```

---

## Quick Start

```ts
import { createStarfishDestination, StarfishClient } from '@drakkar.software/doubloon-starfish';

const client = new StarfishClient({ baseUrl: 'https://starfish.example.com', apiKey: process.env.STARFISH_API_KEY });

const destination = createStarfishDestination({
  client,
  signerKey: process.env.STARFISH_ADMIN_KEY!,
  products: [
    { slug: 'pro', name: 'Pro', defaultDuration: 2_592_000 }, // 30 days
  ],
});

// Use with defineConfig
const { serverConfig } = defineConfig({
  destination,
  products: destination.registry.all(),
  ...
});
```

---

## `createStarfishDestination`

### `StarfishDestinationConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `client` | `StarfishClient` | ✓ | Configured Starfish HTTP client. |
| `products` | `Array<{ slug, name, defaultDuration }>` | ✓ | Product list. `defaultDuration` in seconds; `0` = lifetime. |
| `signerKey` | `string` | ✓ | Admin identity string used as the `signer` field in mint/revoke instructions. Must match an authorized signer on the Starfish server. |
| `storagePath` | `string` | | Path template. `{user}` replaced with wallet address. Default: `"users/{user}/entitlements"`. |
| `field` | `string` | | Field inside the document that holds feature slugs. Default: `"features"`. |
| `logger` | `Logger` | | Optional structured logger. |

Returns a `StarfishDestination` object with `reader`, `writer`, `signer`, and `registry`.

---

## Components

The destination composes three independent sub-components. You can also construct them directly for custom setups.

### `StarfishReader`

Reads entitlements from Starfish via `/pull/{storagePath}`.

```ts
import { StarfishReader } from '@drakkar.software/doubloon-starfish';

const reader = new StarfishReader({
  client,
  registry,
  storagePath: 'users/{user}/entitlements', // optional
  field: 'features',                         // optional
});
```

**`StarfishReaderConfig`**

| Field | Type | Required | Description |
|---|---|---|---|
| `client` | `StarfishClient` | ✓ | |
| `registry` | `ProductRegistry` | ✓ | Used to resolve `productId → slug` for the feature set lookup. |
| `storagePath` | `string` | | Default: `"users/{user}/entitlements"`. The reader prepends `/pull/` to form the HTTP path. |
| `field` | `string` | | Default: `"features"`. |
| `logger` | `Logger` | | |

### `StarfishWriter`

Writes mint/revoke operations to Starfish via `/push/{storagePath}`.

```ts
import { StarfishWriter } from '@drakkar.software/doubloon-starfish';

const writer = new StarfishWriter({ client, registry });
```

**`StarfishWriterConfig`**

| Field | Type | Required | Description |
|---|---|---|---|
| `client` | `StarfishClient` | ✓ | |
| `registry` | `ProductRegistry` | ✓ | |
| `storagePath` | `string` | | Default: `"users/{user}/entitlements"`. |
| `field` | `string` | | Default: `"features"`. |
| `logger` | `Logger` | | |

### `StarfishSigner`

Signs and commits prepared Starfish transactions.

```ts
import { StarfishSigner } from '@drakkar.software/doubloon-starfish';

const signer = new StarfishSigner({ client, publicKey: process.env.STARFISH_ADMIN_KEY! });
```

**`StarfishSignerConfig`**

| Field | Type | Required | Description |
|---|---|---|---|
| `client` | `StarfishClient` | ✓ | |
| `publicKey` | `string` | ✓ | Admin identity. Must match an authorized signer on the Starfish server. |
| `logger` | `Logger` | | |

---

## Document Schema

Entitlements are stored at `users/{wallet}/entitlements` as a JSON document:

```json
{
  "features": ["pro", "analytics"],
  "entitlements": {
    "<productId>": {
      "active":     true,
      "grantedAt":  "2026-04-17T00:00:00.000Z",
      "expiresAt":  "2026-05-17T00:00:00.000Z",
      "autoRenew":  true,
      "source":     "stripe",
      "sourceId":   "sub_xxx"
    }
  }
}
```

The `features` array is the fast-path for entitlement checks. The full `entitlements` map is used for detailed inspection and audit.

---

## Entitlement Check API

```ts
// Check a single product
const check = await destination.reader.checkEntitlement(productId, wallet);
// { entitled: true, reason: 'active', expiresAt: Date, entitlement: {...} }

// Check multiple products at once
const batch = await destination.reader.checkEntitlements([productId1, productId2], wallet);
// { results: { [productId]: EntitlementCheck }, user, checkedAt }
```
