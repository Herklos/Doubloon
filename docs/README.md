# Doubloon Docs

## Bridges

Payment store integrations that translate store notifications into normalized mint/revoke instructions.

- [Apple App Store](bridges/apple.md) — App Store Server Notifications V2 (JWS-signed)
- [Google Play](bridges/google.md) — Real-Time Developer Notifications via Pub/Sub
- [Stripe](bridges/stripe.md) — Subscription lifecycle + charge refunds
- [x402](bridges/x402.md) — HTTP 402 Payment Required protocol

## Destinations

Entitlement storage backends.

- [Starfish](destinations/starfish.md) — Append-only hash-chained HTTP store
- [Anchor](destinations/anchor.md) — Supabase / Postgres

## Server

- [Server](server.md) — `defineConfig`, `createServer`, mode enforcement, hooks, dedup, rate limiter
- [Namespaced Server](namespaced-server.md) — `createNamespacedServer`, multi-app / multi-environment routing
