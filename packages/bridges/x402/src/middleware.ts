import type { X402Bridge } from './bridge.js';

export interface X402MiddlewareConfig {
  bridge: X402Bridge;
  productId: string;
  priceUsd: number;
  durationSeconds: number;
}

export function createX402Middleware(config: X402MiddlewareConfig) {
  return async (req: any, res: any, next: any) => {
    // Check if request has a payment header
    const paymentHeader = req.headers?.['x-payment'] || req.headers?.['payment'];

    if (!paymentHeader) {
      // No payment provided — return 402 Payment Required
      const paymentRequired = config.bridge.createPaymentRequired({
        productId: config.productId,
        priceUsd: config.priceUsd,
        durationSeconds: config.durationSeconds,
      });
      res.status?.(402);
      res.json?.(paymentRequired) || res.end?.(JSON.stringify(paymentRequired));
      return;
    }

    try {
      // Parse the payment header (base64-encoded JSON receipt from x402 facilitator)
      let receipt: Record<string, unknown>;
      try {
        receipt = JSON.parse(Buffer.from(paymentHeader, 'base64').toString('utf-8'));
      } catch {
        receipt = JSON.parse(paymentHeader);
      }

      const result = await config.bridge.verifyAndMint({
        paymentId: String(receipt.paymentId ?? ''),
        wallet: String(receipt.wallet ?? ''),
        productId: config.productId,
        amountUsd: Number(receipt.amountUsd ?? 0),
        durationSeconds: Math.min(Number(receipt.durationSeconds ?? config.durationSeconds), config.durationSeconds),
        timestamp: Number(receipt.timestamp ?? Date.now()),
        raw: receipt,
      });

      req.doubloon = {
        entitled: true,
        wallet: result.notification.userWallet,
        productId: config.productId,
      };
      next();
    } catch (err) {
      const logger = (config as any).logger;
      if (logger?.error) logger.error('x402 payment verification failed', { error: err });
      res.status?.(402);
      res.json?.({ error: 'Payment verification failed' }) || res.end?.('Payment verification failed');
    }
  };
}
