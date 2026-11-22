import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { PurchaseIntentDocument } from './purchase-intent.schema';

export interface PurchaseIntent {
  providerPaymentId: string;
  provider: string;
  accountId: string;
  packId: string;
  amountHalalas: number;
  fulfilledAt?: Date;
}

@Injectable()
export class PurchaseIntentRepository {
  constructor(
    @InjectModel(PurchaseIntentDocument.name)
    private readonly intents: Model<PurchaseIntentDocument>,
  ) {}

  async record(intent: PurchaseIntent): Promise<void> {
    await this.intents.create(intent);
  }

  async findByProviderPaymentId(
    provider: string,
    providerPaymentId: string,
  ): Promise<PurchaseIntent | undefined> {
    const found = await this.intents
      .findOne({ provider, providerPaymentId })
      .lean()
      .exec();
    return found ?? undefined;
  }

  /** Marks the charge as honoured. Safe to call twice. */
  async markFulfilled(
    provider: string,
    providerPaymentId: string,
    at: Date,
  ): Promise<void> {
    await this.intents
      .updateOne({ provider, providerPaymentId }, { $set: { fulfilledAt: at } })
      .exec();
  }
}
