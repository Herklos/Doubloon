# Apple App Store Bridge

Package: `@drakkar.software/doubloon-bridge-apple`

Handles Apple App Store Server Notifications V2. Incoming webhooks carry a JWS-signed payload; the bridge verifies the certificate chain and signature before trusting any content.

---

## Installation

```bash
pnpm add @drakkar.software/doubloon-bridge-apple
```

---

## Configuration

```ts
import { AppleBridge } from '@drakkar.software/doubloon-bridge-apple';

const apple = new AppleBridge({
  bundleId:    'com.example.app',
  issuerId:    'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
  keyId:       'XXXXXXXXXX',
  privateKey:  process.env.APPLE_PRIVATE_KEY!, // PEM string
  productResolver,
  walletResolver,
});
```

### `AppleBridgeConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `bundleId` | `string` | ✓ | App bundle ID (e.g. `com.example.app`). Validated against the signed payload's `data.bundleId`. |
| `issuerId` | `string` | ✓ | Issuer ID from App Store Connect → Keys. |
| `keyId` | `string` | ✓ | Key ID from App Store Connect → Keys. |
| `privateKey` | `string` | ✓ | PEM-encoded ES256 private key (`.p8` file contents). |
| `rootCertificates` | `Buffer[]` | | Apple root CA certificates for chain verification. If omitted, the built-in Apple Root CA G3 is used for sandbox; production chain terminates at Apple's well-known root. |
| `productResolver` | `StoreProductResolver` | ✓ | Maps Apple product IDs to on-chain product IDs. See [Product Resolver](#product-resolver). |
| `walletResolver` | `WalletResolver` | ✓ | Resolves user wallet from `appAccountToken` or `originalTransactionId`. See [Wallet Resolver](#wallet-resolver). |
| `logger` | `Logger` | | Optional structured logger. |
| `environment` | `'production' \| 'sandbox'` | | **Deprecated.** Environment is now derived from the signed JWS payload's `data.environment` field. This field is ignored. |
| `appAppleId` | `number` | | Reserved for future use. |

---

## Environment Detection

Environment (`'production'` or `'sandbox'`) is read from the signed JWS payload:

```
payload.data.environment → "Sandbox" | "Production"
```

The bridge normalizes it to lowercase. For plain JSON bodies (non-JWS), environment defaults to `'production'`.

> Configure a server `mode` to reject events from the wrong environment. See [server docs](../server.md#mode).

---

## Product Resolver

```ts
interface StoreProductResolver {
  resolveProductId(store: string, storeSku: string): Promise<string | null>;
  resolveStoreSku(store: string, productId: string): Promise<string[]>;
}
```

`store` is `'apple'`. `storeSku` is the Apple `productId` string (e.g. `com.example.pro_monthly`). Return the 64-char hex on-chain product ID, or `null` if unmapped (throws `PRODUCT_NOT_MAPPED`).

---

## Wallet Resolver

```ts
interface WalletResolver {
  resolveWallet(store: string, storeUserId: string): Promise<string | null>;
  linkWallet(store: string, storeUserId: string, wallet: string): Promise<void>;
}
```

Resolution order:
1. `tx.appAccountToken` — UUID set by your app at purchase time via `Product.purchase(options: .appAccountToken(...))`.
2. `tx.originalTransactionId` — fallback for transactions without an account token.

Return `null` to throw `WALLET_NOT_LINKED`. Accepted wallet formats: Solana base58 (32–44 chars) or EVM `0x...` (42 chars).

---

## Notification Types

| Apple type / subtype | Normalized type |
|---|---|
| `SUBSCRIBED` | `initial_purchase` |
| `DID_RENEW` | `renewal` |
| `DID_RENEW` + `BILLING_RECOVERY` | `billing_recovery` |
| `EXPIRED` | `expiration` |
| `REVOKE` | `revocation` |
| `REFUND` | `refund` |
| `DID_CHANGE_RENEWAL_STATUS` (cancel) | `cancellation` |
| `DID_CHANGE_RENEWAL_STATUS` (uncancel) | `uncancellation` |
| `GRACE_PERIOD_EXPIRED` | `grace_period_start` |
| `DID_FAIL_TO_RENEW` | `billing_retry_start` |
| `PRICE_INCREASE` | `price_increase_consent` |
| `OFFER_REDEEMED` | `offer_redeemed` |
| `DID_CHANGE_RENEWAL_PREF` | `plan_change` |
| `DID_PAUSE` | `pause` |
| `DID_RESUME` | `resume` |
| `TEST` | `test` |

**Mint instruction** produced for: `initial_purchase`, `renewal`, `billing_recovery`, `offer_redeemed`, `plan_change`, `resume`.  
**Revoke instruction** produced for: `expiration`, `refund`, `revocation`.  
**No instruction** (pass-through) for: `cancellation`, `uncancellation`, `grace_period_start`, `billing_retry_start`, `price_increase_consent`, `pause`, `test`.

---

## Apple App Store Setup

1. In **App Store Connect → Users & Access → Integrations → App Store Server Notifications**, set the production URL to `https://your-server.com/webhook` (or your namespace path).
2. Generate an **API key** (Issuer ID + Key ID + .p8 file) for receipt validation if needed.
3. Enable **App Account Token** in your iOS/macOS app so the bridge can link purchases to wallets without a database lookup.

---

## Error Codes

| Code | Cause |
|---|---|
| `INVALID_RECEIPT` | Malformed body or missing `notificationType`. |
| `INVALID_SIGNATURE` | JWS certificate chain broken, root CA mismatch, or signature invalid. |
| `PRODUCT_NOT_MAPPED` | `productResolver.resolveProductId` returned `null`. |
| `WALLET_NOT_LINKED` | No wallet resolved, or address format invalid. |
