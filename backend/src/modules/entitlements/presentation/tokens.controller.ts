import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Param,
  Post,
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
import { TokenLedgerService } from '../application/token-ledger.service';
import {
  GrantTokensDto,
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
  constructor(private readonly tokens: TokenLedgerService) {}

  @Get('me')
  @ApiOperation({
    operationId: 'tokensGetOwnBalance',
    summary: 'How many Matches the signed-in account can still start',
  })
  @ApiResponse({ status: 200, type: TokenBalanceDto })
  async myBalance(
    @CurrentUser() user: AuthenticatedUser,
  ): Promise<TokenBalanceDto> {
    return { balance: await this.tokens.balanceOf(user.id) };
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

const toLimit = (value?: string): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 50;
};
