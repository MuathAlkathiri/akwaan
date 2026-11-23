/** A refusal the purchase flow can explain to a player or to a log. */
export class PaymentError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

export const PAYMENT_ERRORS = {
  UNKNOWN_PACK: 'PAYMENT_UNKNOWN_PACK',
  WEBHOOK_UNVERIFIED: 'PAYMENT_WEBHOOK_UNVERIFIED',
  AMOUNT_MISMATCH: 'PAYMENT_AMOUNT_MISMATCH',
  CODE_REFUSED: 'PAYMENT_CODE_REFUSED',
  PROVIDER_UNAVAILABLE: 'PAYMENT_PROVIDER_UNAVAILABLE',
} as const;
