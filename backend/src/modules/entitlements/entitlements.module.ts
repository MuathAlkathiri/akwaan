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
import { TokenCollectionsInitialiser } from './persistence/token-collections.initialiser';
import { TokenLedgerService } from './application/token-ledger.service';
import { LaunchCampaignService } from './application/launch-campaign.service';
import { TokensController } from './presentation/tokens.controller';
import { GiftCodeService } from './application/gift-code.service';
import { CampaignRepository } from './persistence/campaign.repository';
import {
  CampaignSettingsDocument,
  CampaignSettingsSchema,
  FreeMatchClaimDocument,
  FreeMatchClaimSchema,
  GiftCodeDocument,
  GiftCodeRedemptionDocument,
  GiftCodeRedemptionSchema,
  GiftCodeSchema,
} from './persistence/campaign.schema';
import { UsersModule } from '../users/users.module';

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
      { name: FreeMatchClaimDocument.name, schema: FreeMatchClaimSchema },
      { name: CampaignSettingsDocument.name, schema: CampaignSettingsSchema },
      { name: GiftCodeDocument.name, schema: GiftCodeSchema },
      {
        name: GiftCodeRedemptionDocument.name,
        schema: GiftCodeRedemptionSchema,
      },
    ]),
    UsersModule,
  ],
  controllers: [TokensController],
  providers: [
    TokenLedgerRepository,
    TokenLedgerService,
    CampaignRepository,
    LaunchCampaignService,
    GiftCodeService,
    TokenCollectionsInitialiser,
  ],
  exports: [TokenLedgerService, LaunchCampaignService],
})
export class EntitlementsModule {}
