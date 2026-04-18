# Changelog

## 0.3.1 (2026-04-18)

### Features

#### Stripe (`@drakkar.software/doubloon-bridge-stripe`)

- New `clientReferenceIdTransform?: (id: string) => string` option in `StripeBridgeConfig`. When set, the transform is applied to `client_reference_id` before it is used as the wallet address. This lets you embed extra data in the field (e.g. `"{userId}_{weddingId}"` from a Payment Link URL) without breaking wallet validation or storage path resolution. The raw value remains available in `notification.raw` and in the Stripe Dashboard for traceability.

### Tests

- 2 new tests in `packages/bridges/stripe/__tests__/bridge.test.ts` — plain `client_reference_id` as wallet, compound `client_reference_id` with transform.

### Docs

- `docs/bridges/stripe.md`: new **Payment Links — embedding extra data** section with example; `walletValidator` and `clientReferenceIdTransform` added to config table.

---

## 0.3.0 (2026-04-17)

### Features

- **Sandbox/testnet environment support** — bridges now correctly label `StoreNotification.environment` and the server can enforce an environment mode.

#### Apple (`@drakkar.software/doubloon-bridge-apple`)

- Environment is now derived from the signed JWS payload (`payload.environment`, fallback `data.environment`) instead of a static config flag. This means a sandbox-signed notification is always labelled `sandbox` regardless of server config.
- `AppleBridgeConfig.environment` is deprecated (kept for backward compatibility, has no effect).

#### Google (`@drakkar.software/doubloon-bridge-google`)

- `subscriptionNotification.testPurchase` presence now sets `environment: 'sandbox'` automatically.
- `oneTimeProductNotification` is now handled: type 1 → `initial_purchase` (mint), type 2 → `cancellation` (no-op). Supports `testPurchase` detection for sandbox labelling.

#### Server (`@drakkar.software/doubloon-server`)

- New `mode?: 'production' | 'sandbox'` option in `defineConfig` / `ServerConfig`. When set, webhooks with a mismatched `environment` are rejected with HTTP 400 before deduplication. Omit to accept both (backward-compatible default).
- `NamespaceConfig` gains per-namespace `mode`, so a single namespaced server can host both a production namespace and a staging namespace.

### Tests

- 5 new tests in `tests/server-mode.test.ts` — mode enforcement, namespaced mode, backward compat.
- 2 new tests in `packages/bridges/apple/__tests__/bridge.test.ts` — deprecated config field, default production env.
- 4 new tests in `packages/bridges/google/__tests__/bridge.test.ts` — testPurchase sandbox labelling, oneTimeProductNotification (purchased + sandbox).

---

## 0.2.0 (2026-04-16)

### New Packages

- **`@drakkar.software/doubloon-anchor`** (`packages/destinations/anchor/`) — Supabase entitlement destination. Stores full entitlement rows with expiry, source, and revocation metadata. Anchor-compatible schema lets client-side `@drakkar.software/anchor` stores read the same table. Uses `@supabase/supabase-js` directly for upsert-with-`onConflict` and composite-filter updates.

  Key capabilities vs Starfish:
  - Four check reasons: `active`, `not_found`, `expired`, `revoked` (Starfish only returns `active`/`not_found`)
  - Real expiry timestamps persisted per entitlement
  - Re-subscribing upserts the existing row (reactivates without creating a duplicate)
  - Revocation stores `revoked_at` and `revoked_by`

  Reference DDL: `packages/destinations/anchor/schema.sql`

### Breaking Changes

- **`@drakkar.software/doubloon-core`**: `Chain` type extended — `'anchor'` added alongside `'starfish'` and `'local'`.

### Other

- Root `package.json`: removed stale `@drakkar.software/doubloon-auth` workspace reference, added `@supabase/supabase-js` dev dependency.
- 19 new e2e tests in `tests/anchor-destination.test.ts` (all 4 check reasons, full lifecycle, mintWithRetry, ProductRegistry).

## 0.1.0 (initial)

- `@drakkar.software/doubloon-core` — shared types, ProductRegistry, WalletResolver, error codes
- `@drakkar.software/doubloon-server` — webhook handler, defineConfig, createNamespacedServer, dedup, rate limiter, reconciliation
- `@drakkar.software/doubloon-starfish` — Starfish destination with pull-modify-push OCC retry
- `@drakkar.software/doubloon-bridge-apple` — Apple App Store Server Notifications V2
- `@drakkar.software/doubloon-bridge-google` — Google Play Real-Time Developer Notifications
- `@drakkar.software/doubloon-bridge-stripe` — Stripe webhook events with signature verification
- `@drakkar.software/doubloon-bridge-x402` — HTTP 402 Payment Required protocol
