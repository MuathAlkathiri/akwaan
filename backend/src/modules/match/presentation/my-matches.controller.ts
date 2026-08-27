import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import {
  ListMyMatches,
  MyMatchesPage,
} from '../application/list-my-matches.use-case';

@ApiTags('match')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matches')
export class MyMatchesController {
  constructor(private readonly listMyMatches: ListMyMatches) {}

  @Get('mine')
  @ApiOperation({ summary: "List the authenticated controller's Matches" })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  list(
    @CurrentUser() user: AuthenticatedUser,
    @Query('page') rawPage?: string,
    @Query('limit') rawLimit?: string,
  ): Promise<MyMatchesPage> {
    const page = Math.max(1, Number.parseInt(rawPage ?? '1', 10) || 1);
    const limit = Math.min(
      20,
      Math.max(1, Number.parseInt(rawLimit ?? '10', 10) || 10),
    );
    return this.listMyMatches.execute({
      controllerActorId: user.id,
      page,
      limit,
    });
  }
}
