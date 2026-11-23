import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { IsIn, IsOptional, IsString, Length, Matches } from 'class-validator';
import { StartPurchase } from '../application/start-purchase.use-case';
import { FulfilPurchase } from '../application/fulfil-purchase.use-case';
import { LaunchCampaignService } from '../../entitlements/application/launch-campaign.service';
import { TOKEN_PACK_IDS, riyalsOf } from '../domain/token-pack';

/**
 * The one field a player sends to buy.
 *
 * Every property needs a validator, and not merely to be checked: the app
 * validates with `forbidNonWhitelisted`, so a property without one is stripped
 * and then rejected — a DTO with no decorators makes the endpoint refuse every
 * request it receives. This one shipped bare and did exactly that.
 *
 * The catalogue is the authority on what may be bought, here as everywhere, so
 * the allowed values are read from it rather than copied.
 */
export class StartPurchaseDto {
  @IsString()
  @IsIn(TOKEN_PACK_IDS)
  packId!: string;

  /**
   * A discount code, as the player typed it.
   *
   * Bounded and limited to the characters a code can contain, so the field
   * cannot be used to push arbitrary text at the lookup. What it is worth is
   * decided server side from the stored code, never from this string.
   */
  @IsOptional()
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may contain letters, digits, dash and underscore only',
  })
  code?: string;
}

/** A price the shop wants to show before it charges anything. */
export class QuotePurchaseDto {
  @IsString()
  @IsIn(TOKEN_PACK_IDS)
  packId!: string;

  @IsOptional()
  @IsString()
  @Length(1, 32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may contain letters, digits, dash and underscore only',
  })
  code?: string;
}

/** The charge a returning player is asking us to settle. */
export class SettlePurchaseDto {
  @IsString()
  @Length(1, 64)
  invoiceId!: string;
}

/**
 * Buying Matches, over HTTP.
 *
 * Two very different doors. The shop is behind the usual guard and acts for
 * whoever is signed in — a request can only ever buy for itself, because the
 * account comes from the token and never from the body. The webhook has no
 * guard at all, because the caller is مُيسّر: it authenticates itself by the
 * secret inside its delivery, and the adapter then reads the invoice back from
 * Moyasar before a single token moves.
 */
@ApiTags('Payments')
@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly startPurchase: StartPurchase,
    private readonly fulfil: FulfilPurchase,
    private readonly campaign: LaunchCampaignService,
  ) {}

  @Get('packs')
  @ApiOperation({
    summary: 'What a player can buy, and whether the shop sells',
  })
  packs() {
    // While the launch month runs, every Match is free and balances are not
    // consumed — so the shop shows its prices and refuses to take money for
    // something the player already has. The screen needs to know that before
    // it draws a buy button, which is why it travels with the catalogue
    // rather than being inferred from a date the browser would have to know.
    const campaign = this.campaign.status(new Date());
    return {
      packs: this.startPurchase.catalogue().map((pack) => ({
        id: pack.id,
        tokens: pack.tokens,
        label: pack.label,
        priceHalalas: pack.priceHalalas,
        priceRiyals: riyalsOf(pack),
      })),
      selling: !campaign.open,
      freeUntil: campaign.endsAt,
    };
  }

  @Post('quote')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'What a pack costs, with a code applied' })
  quote(@Body() body: QuotePurchaseDto) {
    // Behind the guard although it reads nothing of the account's: a public
    // one would be a free oracle for guessing which codes exist.
    return this.startPurchase.quote({ packId: body.packId, code: body.code });
  }

  @Post('checkout')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Open a payment page for a pack' })
  checkout(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: StartPurchaseDto,
  ) {
    // The account is the authenticated one. A body that named an account would
    // let anyone buy for — or as — anyone else.
    return this.startPurchase.execute({
      accountId: user.id,
      packId: body.packId,
      code: body.code,
    });
  }

  @Post('settle')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Settle a charge the player came back with' })
  settle(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: SettlePurchaseDto,
  ) {
    // The second way in. A webhook can be lost for good, and then only the
    // player knows they paid — so their return is treated as a question worth
    // answering, not as proof of anything. The charge is still read from the
    // provider, and it is only ever looked for among this account's own.
    return this.fulfil.fromReturn({
      providerPaymentId: body.invoiceId,
      accountId: user.id,
    });
  }

  @Post('webhook/moyasar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Moyasar tells us a charge settled' })
  async webhook(@Req() request: Request & { rawBody?: Buffer }) {
    // Moyasar documents that an endpoint must answer 2xx quickly. A refusal is
    // still a refusal — an unverified delivery throws and is never fulfilled —
    // but anything we merely decline to act on answers 200, because answering
    // an ordinary `pending` with an error only earns a retry storm.
    const raw =
      request.rawBody?.toString('utf8') ?? JSON.stringify(request.body);
    const outcome = await this.fulfil.fromWebhook({
      rawBody: raw,
      headers: request.headers as Record<string, string | undefined>,
    });
    return { received: true, granted: outcome.granted };
  }
}
