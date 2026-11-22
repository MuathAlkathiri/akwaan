import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import { traceStartupStep } from '../../../common/diagnostics/startup-diagnostics';
import { PAYMENT_PROVIDER, PaymentProvider } from '../domain/payment-provider';
import { PurchaseIntentRepository } from '../persistence/purchase-intent.repository';
import { FulfilPurchase } from './fulfil-purchase.use-case';

/**
 * The part that notices a player who paid and was never given anything.
 *
 * Fulfilment normally happens the moment the provider's webhook lands, and the
 * player's return is a second chance behind it. Both depend on somebody
 * turning up. A provider that retries a delivery and then gives up, a player
 * who pays and closes the tab before the redirect — in either case the money
 * moved, our own record of the charge is sitting there unsettled, and nothing
 * would ever look at it again.
 *
 * Nothing new is written to make that recoverable, because the record already
 * is: an intent without `fulfilledAt` IS the statement that a charge was
 * started and never honoured. This rediscovers those and asks the provider
 * about each one. It grants nothing itself — every candidate goes through
 * `FulfilPurchase`, which stays the only component that moves a balance, with
 * the same price check and the same idempotency key, so a sweep that races a
 * late webhook still adds tokens exactly once.
 */
@Injectable()
export class UnsettledPurchaseSweeper
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private readonly logger = new Logger(UnsettledPurchaseSweeper.name);
  private timer?: NodeJS.Timeout;
  private running = false;
  private stopped = false;

  /** Often enough that a stranded player recovers within a sitting. */
  private static readonly INTERVAL_MS = 120_000;
  /**
   * How settled the dust must be before a charge is questioned. A webhook
   * normally lands in seconds; this keeps the sweeper from racing one and from
   * asking the provider about a player still typing their card number.
   */
  private static readonly SETTLE_GRACE_MS = 180_000;
  /**
   * How far back to look. Most unsettled intents are checkouts that were
   * simply abandoned, and they stay unsettled for ever — without a floor,
   * every one of them would be re-queried on every sweep until the end of
   * time. A charge that has gone a day without being paid never will be.
   */
  private static readonly LOOK_BACK_MS = 24 * 60 * 60 * 1000;
  /** Kept small: this spends provider API calls, and the next sweep is close. */
  private static readonly BATCH = 25;

  constructor(
    @Inject(PAYMENT_PROVIDER) private readonly provider: PaymentProvider,
    private readonly intents: PurchaseIntentRepository,
    private readonly fulfil: FulfilPurchase,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await traceStartupStep(
      'UnsettledPurchaseSweeper.onApplicationBootstrap',
      async () => {
        // The pass at boot is the one that matters: a deploy in the middle of
        // a payment is exactly when a delivery goes missing.
        await this.sweep();
        this.timer = setInterval(() => {
          void this.sweep();
        }, UnsettledPurchaseSweeper.INTERVAL_MS);
        this.timer.unref?.();
      },
    );
  }

  onModuleDestroy(): void {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Public so a person, or a test, can ask for a pass without waiting. */
  async sweep(): Promise<{ checked: number; granted: number }> {
    if (this.running || this.stopped) return { checked: 0, granted: 0 };
    this.running = true;
    try {
      const now = Date.now();
      const candidates = await this.intents.findUnfulfilled({
        provider: this.provider.key,
        startedBefore: new Date(now - UnsettledPurchaseSweeper.SETTLE_GRACE_MS),
        startedAfter: new Date(now - UnsettledPurchaseSweeper.LOOK_BACK_MS),
        limit: UnsettledPurchaseSweeper.BATCH,
      });

      let granted = 0;
      for (const intent of candidates) {
        try {
          const outcome = await this.fulfil.fromRecord(intent);
          if (outcome.granted) {
            granted += 1;
            this.logger.warn({
              event: 'purchase_recovered',
              // Loud on purpose: a grant here means the webhook never arrived,
              // and a player went without what they paid for until now.
              providerPaymentId: intent.providerPaymentId,
              accountId: intent.accountId,
              packId: intent.packId,
            });
          }
        } catch (error) {
          // One unanswerable charge must not stop the rest of the sweep.
          this.logger.error({
            event: 'purchase_sweep_failed',
            providerPaymentId: intent.providerPaymentId,
            message: error instanceof Error ? error.message : String(error),
          });
        }
      }

      if (granted > 0 || candidates.length > 0) {
        this.logger.log({
          event: 'purchase_sweep',
          checked: candidates.length,
          granted,
        });
      }
      return { checked: candidates.length, granted };
    } finally {
      this.running = false;
    }
  }
}
