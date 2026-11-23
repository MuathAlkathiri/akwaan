import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { MongooseModule } from '@nestjs/mongoose';
import { EntitlementsModule } from '../entitlements/entitlements.module';
import { PAYMENT_PROVIDER } from './domain/payment-provider';
import { MoyasarProvider } from './infrastructure/moyasar.provider';
import { StartPurchase } from './application/start-purchase.use-case';
import { FulfilPurchase } from './application/fulfil-purchase.use-case';
import { UnsettledPurchaseSweeper } from './application/unsettled-purchase.sweeper';
import { PurchaseIntentRepository } from './persistence/purchase-intent.repository';
import { PaymentsController } from './presentation/payments.controller';
import { DiscountCodesAdminController } from './presentation/discount-codes.admin.controller';
import { DiscountCodeRepository } from './persistence/discount-code.repository';
import {
  DiscountCodeDocument,
  DiscountCodeSchema,
} from './persistence/discount-code.schema';
import {
  PurchaseIntentDocument,
  PurchaseIntentSchema,
} from './persistence/purchase-intent.schema';

/**
 * Buying Matches.
 *
 * The gateway is bound here and nowhere else: swapping مُيسّر for another
 * provider is a different class behind `PAYMENT_PROVIDER`, and nothing above
 * this line changes.
 */
@Module({
  imports: [
    ConfigModule,
    EntitlementsModule,
    MongooseModule.forFeature([
      { name: PurchaseIntentDocument.name, schema: PurchaseIntentSchema },
      { name: DiscountCodeDocument.name, schema: DiscountCodeSchema },
    ]),
  ],
  controllers: [PaymentsController, DiscountCodesAdminController],
  providers: [
    PurchaseIntentRepository,
    DiscountCodeRepository,
    StartPurchase,
    FulfilPurchase,
    UnsettledPurchaseSweeper,
    { provide: PAYMENT_PROVIDER, useClass: MoyasarProvider },
  ],
  exports: [StartPurchase, FulfilPurchase],
})
export class PaymentsModule {}
