import { Module } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';
import {
  TokenLedgerEntryDocument,
  TokenLedgerEntrySchema,
} from './persistence/token-ledger-entry.schema';
import {
  TokenBalanceDocument,
  TokenBalanceSchema,
} from './persistence/token-balance.schema';
import { TokenLedgerRepository } from './persistence/token-ledger.repository';
import { TokenLedgerService } from './application/token-ledger.service';
import { LaunchCampaignService } from './application/launch-campaign.service';

/**
 * Tokens: what an account may spend, and the record of why it changed.
 *
 * Exports the service alone. Nothing outside reaches the repository, so the
 * rules about signs and about movements happening once stay in one place.
 */
@Module({
  imports: [
    MongooseModule.forFeature([
      { name: TokenLedgerEntryDocument.name, schema: TokenLedgerEntrySchema },
      { name: TokenBalanceDocument.name, schema: TokenBalanceSchema },
    ]),
  ],
  providers: [TokenLedgerRepository, TokenLedgerService, LaunchCampaignService],
  exports: [TokenLedgerService, LaunchCampaignService],
})
export class EntitlementsModule {}
