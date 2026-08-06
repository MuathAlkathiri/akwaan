import { Controller, Get, Param, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { PlayerCatalogService } from '../application/player-catalog.service';
import { envelope } from './world-content.http';

/**
 * The player read surface: active Worlds and their active Scopes.
 *
 * Authenticated, but intentionally **not** role restricted — this is what a
 * normal player calls. Everything under `/admin` stays admin-only; this
 * controller exposes a narrower projection of the same, single readiness
 * calculation.
 */
@ApiTags('Player Catalog')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('worlds')
export class PlayerWorldsController {
  constructor(private readonly catalog: PlayerCatalogService) {}

  @Get()
  list() {
    return envelope(this.catalog.listPlayableWorlds());
  }

  @Get(':worldId')
  findOne(@Param('worldId') worldId: string) {
    return envelope(this.catalog.getPlayableWorld(worldId));
  }

  @Get(':worldId/scopes')
  scopes(@Param('worldId') worldId: string) {
    return envelope(this.catalog.listPlayableScopes(worldId));
  }
}
