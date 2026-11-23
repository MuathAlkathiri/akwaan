import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayMaxSize, IsArray, IsMongoId } from 'class-validator';
import { Transform } from 'class-transformer';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { AuthenticatedUser } from '../../auth/auth.types';
import { WorldRemainingService } from '../application/world-remaining.service';

/** The Worlds a screen is asking about. */
export class WorldRemainingQueryDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.split(',').filter(Boolean) : value,
  )
  @IsArray()
  // The home page shows a handful. A cap keeps one request from asking for a
  // derivation of the entire catalogue.
  @ArrayMaxSize(20)
  @IsMongoId({ each: true })
  worldIds!: string[];
}

/**
 * How much of each World is still new to the player asking.
 *
 * Always the caller's own figure: the account comes from the token, and there
 * is no way to ask about somebody else's progress.
 */
@ApiTags('Content progress')
@Controller('content-progress')
export class WorldRemainingController {
  constructor(private readonly remaining: WorldRemainingService) {}

  @Get('worlds')
  @ApiBearerAuth()
  @UseGuards(JwtAuthGuard)
  @ApiOperation({ summary: 'Questions each World still owes this player' })
  async worlds(
    @CurrentUser() user: AuthenticatedUser,
    @Query() query: WorldRemainingQueryDto,
  ) {
    const counts = await this.remaining.remainingFor(user.id, query.worldIds);
    return query.worldIds.map((worldId) => ({
      worldId,
      remaining: counts.get(worldId) ?? 0,
    }));
  }
}
