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
import { StartPurchase } from '../application/start-purchase.use-case';
import { FulfilPurchase } from '../application/fulfil-purchase.use-case';
import { riyalsOf } from '../domain/token-pack';

/** The one field a player sends to buy. */
export class StartPurchaseDto {
  packId!: string;
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
  ) {}

  @Get('packs')
  @ApiOperation({ summary: 'What a player can buy' })
  packs() {
    return this.startPurchase.catalogue().map((pack) => ({
      id: pack.id,
      tokens: pack.tokens,
      label: pack.label,
      priceHalalas: pack.priceHalalas,
      priceRiyals: riyalsOf(pack),
    }));
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
