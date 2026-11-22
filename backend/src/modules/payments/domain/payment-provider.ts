/**
 * The gateway, as the rest of the product needs to see it.
 *
 * Saudi gateways differ in their APIs and barely at all in what a token shop
 * asks of them: start a payment, and later be told — credibly — that one
 * succeeded. Everything above this interface is written once; swapping مُيسّر
 * for تاب is a new adapter and an environment variable, not a rewrite of the
 * purchase flow. That is deliberate: the provider is the part of this system
 * most likely to change for commercial reasons rather than technical ones.
 */

/** What a provider is asked to charge for. */
export interface PaymentRequest {
  /** Our own id for this attempt. Round-trips through the provider. */
  reference: string;
  amountHalalas: number;
  /** Carried through the provider and returned on the webhook. */
  metadata: { accountId: string; packId: string };
  description: string;
  /** Where the player lands after paying. */
  callbackUrl: string;
}

/** Where to send the player to pay. */
export interface StartedPayment {
  /** The provider's own id. Becomes part of the ledger's idempotency key. */
  providerPaymentId: string;
  redirectUrl: string;
}

export type PaymentStatus = 'paid' | 'failed' | 'pending';

/**
 * A payment as the PROVIDER says it stands — never as the request body claims.
 *
 * An adapter must establish this from the provider itself: verify the
 * signature, then read the payment back from the provider's API. A webhook body
 * is an unauthenticated POST from the open internet, and treating its
 * `status: "paid"` as true is how a token shop gives its stock away.
 */
export interface VerifiedPayment {
  providerPaymentId: string;
  status: PaymentStatus;
  /** What was actually captured, in halalas, according to the provider. */
  amountHalalas: number;
  metadata: { accountId?: string; packId?: string };
}

export interface PaymentProvider {
  /** Names this provider in ledger references and idempotency keys. */
  readonly key: string;
  start(request: PaymentRequest): Promise<StartedPayment>;
  /**
   * Turns a webhook delivery into what the provider itself reports, or throws
   * if it cannot be authenticated. Never returns a status it did not confirm.
   */
  verifyWebhook(input: {
    rawBody: string;
    headers: Record<string, string | undefined>;
  }): Promise<VerifiedPayment>;
}

export const PAYMENT_PROVIDER = Symbol('PAYMENT_PROVIDER');
