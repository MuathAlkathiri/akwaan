import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { parseMultipartJsonBody } from '../../../common/pipes/multipart-json-body.parser';
import { UserRole } from '../../users/schemas/user.schema';
import { WorldChallengeConfigurationService } from '../application/world-challenge-configuration.service';
import {
  CreateWorldChallengeConfigurationDto,
  UpdateWorldChallengeConfigurationDto,
} from '../dto/world-challenge-configuration.dto';
import {
  envelope,
  UploadedWorldContentAsset,
  worldContentAssetInterceptor,
} from './world-content.http';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import type { AuthenticatedUser } from '../../auth/auth.types';
import { WorldContentDeletionService } from '../application/permanent-deletion/world-content-deletion.service';
import {
  deletionActor,
  ExecutePermanentDeletionDto,
} from '../dto/permanent-deletion.dto';

@ApiTags('World Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class WorldChallengeConfigurationsController {
  constructor(
    private readonly configurations: WorldChallengeConfigurationService,
    private readonly deletion: WorldContentDeletionService,
  ) {}

  @Get('worlds/:worldId/challenge-configurations')
  listByWorld(@Param('worldId') worldId: string) {
    return envelope(this.configurations.listByWorld(worldId));
  }

  @Post('worlds/:worldId/challenge-configurations')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  create(
    @Param('worldId') worldId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(
      body,
      'configuration',
      CreateWorldChallengeConfigurationDto,
    );
    return envelope(this.configurations.create(worldId, dto, asset));
  }

  @Patch('challenge-configurations/:configurationId')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  update(
    @Param('configurationId') configurationId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(
      body,
      'configuration',
      UpdateWorldChallengeConfigurationDto,
    );
    return envelope(this.configurations.update(configurationId, dto, asset));
  }

  /**
   * Detach a mechanic from one World: what it would change. Read-only.
   *
   * Detach deletes the board binding only. The mechanic, its content and every
   * other World are untouched (roadmap §19.1: removing a World association never
   * deletes questions).
   */
  @Get('challenge-configurations/:configurationId/detach-preview')
  detachPreview(
    @Param('configurationId') configurationId: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      this.deletion.preview(
        'configuration',
        configurationId,
        deletionActor(user),
      ),
    );
  }

  @Post('challenge-configurations/:configurationId/detach')
  detach(
    @Param('configurationId') configurationId: string,
    @Body() dto: ExecutePermanentDeletionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      this.deletion.execute(
        'configuration',
        configurationId,
        dto,
        deletionActor(user),
      ),
    );
  }
}
