import {
  Body,
  Controller,
  Get,
  HttpStatus,
  NotFoundException,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { UserRole } from '../../users/schemas/user.schema';
import { UserRepository } from '../../users/persistence/user.repository';
import { TokenLedgerService } from '../application/token-ledger.service';
import { LaunchCampaignService } from '../application/launch-campaign.service';
import { GiftCodeService } from '../application/gift-code.service';
import {
  CreateGiftCodeDto,
  GrantTokensDto,
  RedeemGiftCodeDto,
  SetGiftCodeActiveDto,
  SetWeeklyLimitDto,
  TokenBalanceDto,
  TokenMovementDto,
} from '../dto/token-ledger.dto';

/**
 * Tokens over HTTP: what a player may ask about themselves, and what an
 * operator may do for somebody else.
 *
 * There is no route that takes tokens away. Spending happens where a Match is
 * created, in the same transaction, so a balance can never be moved by a
 * request that is not a Match — including one from an operator who meant well.
 */
@ApiTags('Tokens')
@ApiBearerAuth()
@Controller('tokens')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TokensController {
  constructor(
    private readonly tokens: TokenLedgerService,
    private readonly campaign: LaunchCampaignService,
    private readonly gifts: GiftCodeService,
    private readonly users: UserRepository,
  ) {}

  @Get('me')
  @ApiOperation({
    operationId: 'tokensGetOwnBalance',
    summary: 'How many Matches the signed-in account can still start',
  })
  @ApiResponse({ status: 200, type: TokenBalanceDto })
  async myBalance(@CurrentUser() user: AuthenticatedUser) {
    // The balance and the week's free Matches travel together: a player with
    // nothing bought can still play, and a screen that showed "0" alone would
    // be telling them they cannot.
    const now = new Date();
    const [balance, weekly] = await Promise.all([
      this.tokens.balanceOf(user.id),
      this.campaign.allowanceFor(user.id, now),
    ]);
    return { balance, campaign: this.campaign.status(now), weekly };
  }

  @Post('redeem')
  @ApiOperation({
    operationId: 'tokensRedeemGiftCode',
    summary: 'Turn a gift code into Matches on the signed-in account',
  })
  async redeem(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: RedeemGiftCodeDto,
  ) {
    return this.gifts.redeem(user.id, body.code);
  }

  @Get('campaign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensGetCampaign',
    summary: 'The launch campaign as it stands',
  })
  async campaignSettings() {
    return {
      ...this.campaign.status(new Date()),
      salesOpen: this.campaign.salesOpen(),
      weeklyFreeMatches: await this.campaign.weeklyLimit(),
    };
  }

  @Put('campaign')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensSetCampaign',
    summary: 'Change how many free Matches an account gets a week',
  })
  async setCampaign(
    @Body() body: SetWeeklyLimitDto,
    @CurrentUser() operator: AuthenticatedUser,
  ) {
    return {
      weeklyFreeMatches: await this.campaign.setWeeklyLimit(
        body.weeklyFreeMatches,
        operator.id,
      ),
    };
  }

  @Get('gift-codes')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensListGiftCodes',
    summary: 'Every gift code',
  })
  async giftCodes() {
    return (await this.gifts.list()).map(presentGiftCode);
  }

  @Post('gift-codes')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensCreateGiftCode',
    summary: 'Make a gift code',
  })
  async createGiftCode(@Body() body: CreateGiftCodeDto) {
    const created = await this.gifts.create(body);
    return created ? presentGiftCode(created) : undefined;
  }

  @Patch('gift-codes/:code/active')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensSetGiftCodeActive',
    summary: 'Pause or resume a gift code',
  })
  async setGiftCodeActive(
    @Param('code') code: string,
    @Body() body: SetGiftCodeActiveDto,
  ) {
    await this.gifts.setActive(code, body.active);
    return { active: body.active };
  }

  @Get('accounts/lookup')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensLookupAccount',
    summary: 'Find an account by its email, with its balance',
  })
  async lookup(@Query('email') email?: string) {
    const wanted = (email ?? '').trim().toLowerCase();
    const user = wanted ? await this.users.findByEmail(wanted) : null;
    if (!user) {
      throw new NotFoundException({
        statusCode: HttpStatus.NOT_FOUND,
        code: 'ACCOUNT_NOT_FOUND',
        message: 'ما لقينا حساب بهالإيميل.',
      });
    }
    const accountId = String(user._id);
    const [balance, movements, weekly] = await Promise.all([
      this.tokens.balanceOf(accountId),
      this.tokens.history(accountId, 20),
      this.campaign.allowanceFor(accountId, new Date()),
    ]);
    return {
      accountId,
      email: user.email,
      balance,
      weekly,
      movements: this.present(movements),
    };
  }

  @Get('me/history')
  @ApiOperation({
    operationId: 'tokensGetOwnHistory',
    summary: 'Why the signed-in account’s balance changed, newest first',
  })
  @ApiResponse({ status: 200, type: [TokenMovementDto] })
  async myHistory(
    @CurrentUser() user: AuthenticatedUser,
    @Query('limit') limit?: string,
  ): Promise<TokenMovementDto[]> {
    return this.present(await this.tokens.history(user.id, toLimit(limit)));
  }

  @Get('accounts/:accountId')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensGetAccountBalance',
    summary: 'An account’s balance and recent movements',
  })
  @ApiParam({ name: 'accountId', description: 'User MongoDB ObjectId' })
  async accountLedger(
    @Param('accountId') accountId: string,
    @Query('limit') limit?: string,
  ): Promise<{ balance: number; movements: TokenMovementDto[] }> {
    const [balance, movements] = await Promise.all([
      this.tokens.balanceOf(accountId),
      this.tokens.history(accountId, toLimit(limit)),
    ]);
    return { balance, movements: this.present(movements) };
  }

  @Post('accounts/:accountId/grant')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    operationId: 'tokensGrantToAccount',
    summary: 'Give an account tokens by hand',
  })
  @ApiParam({ name: 'accountId', description: 'User MongoDB ObjectId' })
  @ApiResponse({ status: 201, type: TokenBalanceDto })
  async grant(
    @Param('accountId') accountId: string,
    @Body() body: GrantTokensDto,
    @CurrentUser() operator: AuthenticatedUser,
  ) {
    const movement = await this.tokens.grant({
      accountId,
      amount: body.amount,
      reason: 'admin.grant',
      // Who did it, beside why: a hand-written grant is the one movement with
      // no system behind it to ask afterwards.
      reference: `${operator.id}: ${body.note}`,
      idempotencyKey:
        body.idempotencyKey ?? `admin:${operator.id}:${Date.now()}`,
    });
    return {
      statusCode: HttpStatus.CREATED,
      balance: movement.balanceAfter,
    };
  }

  private present(
    movements: Awaited<ReturnType<TokenLedgerService['history']>>,
  ): TokenMovementDto[] {
    return movements.map((movement) => ({
      delta: movement.entry.delta,
      reason: movement.entry.reason,
      reference: movement.entry.reference,
      balanceAfter: movement.balanceAfter,
    }));
  }
}

const presentGiftCode = (code: {
  code: string;
  tokens: number;
  maxRedemptions: number;
  redemptionCount: number;
  active: boolean;
  note?: string;
}) => ({
  code: code.code,
  tokens: code.tokens,
  maxRedemptions: code.maxRedemptions,
  redemptionCount: code.redemptionCount,
  active: code.active,
  note: code.note,
});

const toLimit = (value?: string): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 50;
};
