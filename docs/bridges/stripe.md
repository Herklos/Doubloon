# Stripe Bridge

Package: `@drakkar.software/doubloon-bridge-stripe`

Handles Stripe webhook events for subscription lifecycle and charge refunds. Environment is derived from `event.livemode` — no config needed.

---

## Installation

```bash
pnpm add @drakkar.software/doubloon-bridge-stripe
```

---

## Configuration

```ts
import { StripeBridge } from '@drakkar.software/doubloon-bridge-stripe';

const stripe = new StripeBridge({
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  productResolver,
  walletResolver,
});
```

### `StripeBridgeConfig`

| Field | Type | Required | Description |
|---|---|---|---|
| `webhookSecret` | `string` | ✓ | Stripe webhook signing secret (starts with `whsec_`). Used to verify the `Stripe-Signature` header via HMAC-SHA256. |
| `productResolver` | `StoreProductResolver` | ✓ | Maps Stripe price IDs to on-chain product IDs. See [Product Resolver](#product-resolver). |
| `walletResolver` | `WalletResolver` | ✓ | Resolves user wallet from a Stripe customer ID. See [Wallet Resolver](#wallet-resolver). |
| `walletValidator` | `(address: string) => boolean` | | Overrides the default Solana/EVM wallet format check. |
| `clientReferenceIdTransform` | `(id: string) => string` | | Transform applied to `client_reference_id` before it is used as the wallet address. Use this when you embed extra data in the field (e.g. `"{userId}_{weddingId}"`) and need to extract just the wallet part. |
| `logger` | `Logger` | | Optional structured logger. |

---

## Payment Links — embedding extra data in `client_reference_id`

Stripe Payment Links pass `client_reference_id` verbatim to the webhook. If you need to embed extra fields (e.g. an internal record ID alongside the user wallet), use `clientReferenceIdTransform` to strip the suffix before wallet validation:

```ts
new StripeBridge({
  webhookSecret: process.env.STRIPE_WEBHOOK_SECRET!,
  productResolver,
  walletResolver,
  walletValidator: (addr) => /^[0-9a-f]{16}$/i.test(addr),
  // client_reference_id is set to "{userId}_{weddingId}" from the client
  clientReferenceIdTransform: (id) => id.split('_')[0],
})
```

The raw `client_reference_id` is still visible in the Stripe Dashboard and in `notification.raw` for traceability.

---

## Environment Detection

Environment is set automatically from the Stripe event:
- `event.livemode === true` → `'production'`
- `event.livemode === false` → `'sandbox'`

No configuration required. Use server `mode` to enforce environment on inbound webhooks. See [server docs](../server.md#mode).

---

## Product Resolver

```ts
interface StoreProductResolver {
  resolveProductId(store: string, storeSku: string): Promise<string | null>;
  resolveStoreSku(store: string, productId: string): Promise<string[]>;
}
```

`store` is `'stripe'`. `storeSku` is the Stripe **price ID** (e.g. `price_1234`). Return the 64-char hex on-chain product ID, or `null` (throws `PRODUCT_NOT_MAPPED`).

---

## Wallet Resolver

```ts
interface WalletResolver {
  resolveWallet(store: string, storeUserId: string): Promise<string | null>;
  linkWallet(store: string, storeUserId: string, wallet: string): Promise<void>;
}
```

`storeUserId` is the Stripe **customer ID** (e.g. `cus_xxx`). You must store the mapping between your user's wallet and their Stripe customer ID during checkout.

Return `null` to throw `WALLET_NOT_LINKED`. Accepted wallet formats: Solana base58 (32–44 chars) or EVM `0x...` (42 chars).

---

## Handled Events

| Stripe event type | Normalized type | Instruction |
|---|---|---|
| `customer.subscription.created` | `initial_purchase` | Mint |
| `customer.subscription.updated` (cancel_at_period_end changed → cancel) | `cancellation` | None |
| `customer.subscription.updated` (cancel_at_period_end changed → uncancel) | `uncancellation` | None |
| `customer.subscription.updated` (items changed) | `plan_change` | Mint |
| `customer.subscription.updated` (status changed) | `renewal` | Mint |
| `customer.subscription.updated` (other) | `renewal` | Mint |
| `customer.subscription.deleted` | `expiration` | Revoke |
| `invoice.payment_succeeded` | `renewal` | Mint |
| `invoice.payment_failed` | `billing_retry_start` | None |
| `charge.refunded` | `refund` | Revoke |

---

## Stripe Dashboard Setup

1. In **Stripe Dashboard → Developers → Webhooks**, add an endpoint pointing to `https://your-server.com/webhook`.
2. Select the events to listen for:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
   - `charge.refunded`
3. Copy the **Signing secret** (`whsec_...`) and set it as `webhookSecret`.
4. For local development, use the [Stripe CLI](https://stripe.com/docs/stripe-cli): `stripe listen --forward-to localhost:3000/webhook`.

---

## Error Codes

| Code | Cause |
|---|---|
| `INVALID_RECEIPT` | `Stripe-Signature` header missing, signature invalid, or event body malformed. |
| `PRODUCT_NOT_MAPPED` | `productResolver.resolveProductId` returned `null` for the price ID. |
| `WALLET_NOT_LINKED` | No wallet resolved for the customer ID, or address format invalid. |
