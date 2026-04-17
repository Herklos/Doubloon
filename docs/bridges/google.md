# Google Play Bridge

Package: `@drakkar.software/doubloon-bridge-google`

Handles Google Play Real-Time Developer Notifications (RTDN) delivered via Google Cloud Pub/Sub push subscriptions.

---

## Installation

```bash
pnpm add @drakkar.software/doubloon-bridge-google
```

---

## Configuration

```ts
import { GoogleBridge } from '@drakkar.software/doubloon-bridge-google';

const google = new GoogleBridge({
  packageName:       'com.example.app',
  serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY!, // JSON string
  productResolver,
  walletResolver,
});
```

### `GoogleBridgeConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `packageName` | `string` | ✓ | Android application package name (e.g. `com.example.app`). Validated against incoming RTDNs. |
| `serviceAccountKey` | `string` | ✓ | Google service account credentials JSON as a string. Must have `androidpublisher` API access for receipt verification calls. Pass `'{}'` in tests. |
| `productResolver` | `StoreProductResolver` | ✓ | Maps Google subscription IDs / SKUs to on-chain product IDs. See [Product Resolver](#product-resolver). |
| `walletResolver` | `WalletResolver` | ✓ | Resolves user wallet from a purchase token. See [Wallet Resolver](#wallet-resolver). |
| `environment` | `'production' \| 'sandbox'` | | Environment override. Defaults to `'production'`. Google's RTDN schema carries no per-event environment signal — use this flag (or a separate bridge instance) for test traffic. |
| `logger` | `Logger` | | Optional structured logger. |

---

## Environment Detection

Google RTDNs do **not** carry a per-event environment field. The bridge uses `config.environment ?? 'production'`. The only automatic environment override is the top-level `testNotification` object — those always resolve to `'sandbox'`.

Recommended practice for isolating sandbox traffic: configure a **separate Pub/Sub topic** for test purchases and point it at a bridge instance with `environment: 'sandbox'`. With per-namespace servers you can do:

```ts
const server = createNamespacedServer({
  namespaces: {
    'app-prod': { bridges: { google: new GoogleBridge({ environment: 'production', ... }) }, mode: 'production', ... },
    'app-test': { bridges: { google: new GoogleBridge({ environment: 'sandbox',    ... }) }, mode: 'sandbox',    ... },
  },
  ...
});
```

---

## Product Resolver

```ts
interface StoreProductResolver {
  resolveProductId(store: string, storeSku: string): Promise<string | null>;
  resolveStoreSku(store: string, productId: string): Promise<string[]>;
}
```

`store` is `'google'`. For subscription notifications, `storeSku` is `subscriptionNotification.subscriptionId`. For one-time products, it is `oneTimeProductNotification.sku`. Return the 64-char hex on-chain product ID, or `null` (throws `PRODUCT_NOT_MAPPED`).

---

## Wallet Resolver

```ts
interface WalletResolver {
  resolveWallet(store: string, storeUserId: string): Promise<string | null>;
  linkWallet(store: string, storeUserId: string, wallet: string): Promise<void>;
}
```

`storeUserId` is the Pub/Sub message `purchaseToken`. You must store the mapping between your user's wallet and the purchase token at checkout time (e.g., via `obfuscatedExternalAccountId` in Google's billing API).

Return `null` to throw `WALLET_NOT_LINKED`. Accepted wallet formats: Solana base58 (32–44 chars) or EVM `0x...` (42 chars).

---

## Notification Types

### Subscription notifications (`subscriptionNotification`)

| `notificationType` | Normalized type |
|---|---|
| 1 — RECOVERED | `billing_recovery` |
| 2 — RENEWED | `renewal` |
| 3 — CANCELED | `cancellation` |
| 4 — PURCHASED | `initial_purchase` |
| 5 — ON_HOLD | `grace_period_start` |
| 6 — IN_GRACE_PERIOD | `grace_period_start` |
| 7 — RESTARTED | `resume` |
| 8 — PRICE_CHANGE_CONFIRMED | `price_increase_consent` |
| 9 — DEFERRED | `renewal` |
| 10 — PAUSED | `pause` |
| 11 — PAUSE_SCHEDULE_CHANGED | `pause` |
| 12 — REVOKED | `revocation` |
| 13 — EXPIRED | `expiration` |

### One-time product notifications (`oneTimeProductNotification`)

| `notificationType` | Normalized type |
|---|---|
| 1 — ONE_TIME_PRODUCT_PURCHASED | `initial_purchase` |
| 2 — ONE_TIME_PRODUCT_CANCELED | `cancellation` |

### Test notifications (`testNotification`)

Always normalized to `'test'`, `instruction: null`, `requiresAcknowledgment: false`.

---

**Mint instruction** produced for: `initial_purchase`, `renewal`, `billing_recovery`, `resume`.  
**Revoke instruction** produced for: `revocation`, `expiration`.  
**No instruction** for: `cancellation`, `grace_period_start`, `billing_retry_start`, `price_increase_consent`, `pause`, `test`.

`requiresAcknowledgment: true` only for `initial_purchase` subscription events. Deadline: 3 days from store timestamp.

---

## Google Cloud Pub/Sub Setup

1. In **Google Play Console → Monetization → Real-time developer notifications**, create a Cloud Pub/Sub topic and point it at your endpoint.
2. Create a **push subscription** on that topic with the URL `https://your-server.com/webhook` (or your namespace path).
3. The Pub/Sub push delivers a JSON envelope:
   ```json
   {
     "message": {
       "data": "<base64-encoded RTDN JSON>",
       "messageId": "...",
       "publishTime": "..."
     },
     "subscription": "..."
   }
   ```
   Your HTTP server must base64-decode `message.data` and pass the result as the request body to the bridge.
4. Create a **service account** with the `Android Publisher` role and download its JSON key. Pass the JSON string as `serviceAccountKey`.

---

## Error Codes

| Code | Cause |
|---|---|
| `INVALID_RECEIPT` | Malformed body, missing `packageName`, or no recognized notification type. |
| `PRODUCT_NOT_MAPPED` | `productResolver.resolveProductId` returned `null`. |
| `WALLET_NOT_LINKED` | No wallet resolved, or address format invalid. |
