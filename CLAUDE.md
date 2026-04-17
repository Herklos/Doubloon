# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm build          # build all packages (Turbo, respects project references)
pnpm test           # unit tests across all packages
pnpm test:e2e       # integration tests in tests/
pnpm lint           # ESLint across all packages
pnpm clean          # remove all dist/ directories
pnpm dev            # run dev server via scripts/run-server.ts

# Single integration test file
vitest run tests/define-config.test.ts
vitest run --config vitest.e2e.config.ts tests/bridge-apple.test.ts

# Single package
turbo test --filter=@drakkar.software/doubloon-server
cd packages/core && vitest run
```

## Architecture

**8 publishable packages** under `packages/`, built with Turbo + TypeScript project references.

```
packages/
  core/                     # shared types, errors, ProductRegistry, deriveProductId
  server/                   # defineConfig, createServer, createNamespacedServer, dedup, rate-limiter
  bridges/
    apple/                  # App Store Server Notifications V2 (JWS-signed)
    google/                 # Play RTDN via Pub/Sub
    stripe/                 # Stripe webhook events
    x402/                   # HTTP 402 Payment Required protocol
  destinations/
    anchor/                 # Supabase/Postgres rows
    starfish/               # append-only hash-chained Starfish sync protocol
tests/                      # E2E integration tests (vitest.e2e.config.ts)
docs/                       # setup guides for every bridge, destination, and server option
```

**Data flow:** store webhook → Bridge (parse + normalize) → Server (dedup → mode check → mint retry) → Destination (read/write/sign)

`defineConfig` is the main entry point. It registers products on the destination and returns a `ServerConfig` for `createServer`. `createNamespacedServer` wraps multiple independent configs behind `/{namespace}/webhook` routing.

**Starfish destination** depends on `@drakkar.software/starfish-client` from a sibling repo at `../../Drakkar-Software/satellite/` — referenced via pnpm workspace.

Each package: `src/` → `tsc` → `dist/`. All packages are ESM (`"module": "ES2022"`), strict TypeScript, with `composite: true` for incremental builds.

Integration tests live in `tests/` (not inside packages). Unit tests live alongside source in each package's `__tests__/` directory.

## IAP Reference

For in-app purchase implementation guidance: https://openiap.dev/llms.txt
