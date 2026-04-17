# Anchor Destination

Package: `@drakkar.software/doubloon-anchor`

Stores entitlements in a [Supabase](https://supabase.com) Postgres database. Entitlements are rows in a single table with full audit columns.

---

## Installation

```bash
pnpm add @drakkar.software/doubloon-anchor
```

---

## Quick Start

```ts
import { createAnchorDestination } from '@drakkar.software/doubloon-anchor';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const destination = createAnchorDestination({
  supabase,
  signerKey: 'service-role',
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

## `createAnchorDestination`

### `AnchorDestinationConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `supabase` | `SupabaseClient` | ✓ | Supabase client initialized with the **service role** key (bypasses RLS). |
| `products` | `Array<{ slug, name, defaultDuration }>` | ✓ | Product list. `defaultDuration` in seconds; `0` = lifetime. |
| `signerKey` | `string` | ✓ | Identity string used as the `signer` field in mint/revoke records. Typically `'service-role'` or a descriptive admin label. |
| `tableName` | `string` | | Table to read/write entitlements. Default: `"entitlements"`. |
| `logger` | `Logger` | | Optional structured logger. |

Returns an `AnchorDestination` with `reader`, `writer`, `signer`, and `registry`.

---

## Database Schema

Run this migration in your Supabase project:

```sql
create table entitlements (
  id            uuid        primary key default gen_random_uuid(),
  product_id    text        not null,
  user_wallet   text        not null,
  active        boolean     not null default true,
  granted_at    timestamptz not null default now(),
  expires_at    timestamptz,
  auto_renew    boolean     not null default false,
  source        text        not null,
  source_id     text        not null,
  revoked_at    timestamptz,
  revoked_by    text,
  signer        text        not null,

  unique (product_id, user_wallet)
);

-- Optional: index for wallet lookups
create index on entitlements (user_wallet);
create index on entitlements (product_id, user_wallet);
```

> The table name is configurable via `tableName`. The schema column names are fixed.

---

## Components

### `AnchorReader`

Reads entitlements from Supabase.

**`AnchorReaderConfig`**

| Field | Type | Required | Description |
|---|---|---|---|
| `supabase` | `SupabaseClient` | ✓ | |
| `registry` | `ProductRegistry` | ✓ | Used to resolve `productId → slug`. |
| `tableName` | `string` | | Default: `"entitlements"`. |
| `logger` | `Logger` | | |

### `AnchorWriter`

Writes mint/revoke operations via Supabase upsert.

**`AnchorWriterConfig`**

| Field | Type | Required | Description |
|---|---|---|---|
| `registry` | `ProductRegistry` | ✓ | |
| `tableName` | `string` | | Default: `"entitlements"`. |
| `logger` | `Logger` | | |

> The writer does not require a `SupabaseClient` directly — it builds a transaction that the signer commits.

### `AnchorSigner`

Commits prepared transactions to Supabase.

**`AnchorSignerConfig`**

| Field | Type | Required | Description |
|---|---|---|---|
| `supabase` | `SupabaseClient` | ✓ | |
| `publicKey` | `string` | ✓ | Identity label stored in the `signer` column of each row. |
| `logger` | `Logger` | | |

---

## Entitlement Check API

```ts
// Single product
const check = await destination.reader.checkEntitlement(productId, wallet);
// { entitled: true, reason: 'active', expiresAt: Date, entitlement: {...} }

// Multiple products
const batch = await destination.reader.checkEntitlements([productId1, productId2], wallet);
// { results: { [productId]: EntitlementCheck }, user, checkedAt }
```

---

## Row-Level Security

The service role key bypasses RLS. If you want user-facing reads with RLS:

```sql
alter table entitlements enable row level security;

-- Allow users to read their own entitlements (requires auth.uid() mapped to wallet)
create policy "users read own"
  on entitlements for select
  using (user_wallet = auth.jwt() ->> 'wallet');
```

Server-side writes always use the service role and are not affected by RLS policies.
