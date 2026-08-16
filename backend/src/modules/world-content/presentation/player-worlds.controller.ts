import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlayerCatalogService } from '../application/player-catalog.service';
import { envelope } from './world-content.http';

/**
 * The player read surface: active Worlds and their active Scopes.
 *
 * Public and read-only so a guest can compose a Match selection before the
 * identity gate. Everything under `/admin`, every mutation, and Match runtime
 * state remain guarded; this controller exposes only the active player-safe
 * projection.
 */
@ApiTags('Player Catalog')
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
