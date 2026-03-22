export interface StoreReceipt {
  store: 'apple' | 'google';
  receipt: string;
  productId?: string;
  transactionId?: string;
}

export function packageAppleReceipt(jwsTransaction: string): StoreReceipt {
  return {
    store: 'apple',
    receipt: jwsTransaction,
  };
}

export function packageGoogleReceipt(purchaseToken: string, productId: string): StoreReceipt {
  return {
    store: 'google',
    receipt: purchaseToken,
    productId,
  };
}
