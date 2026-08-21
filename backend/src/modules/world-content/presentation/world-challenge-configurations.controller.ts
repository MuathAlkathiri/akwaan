import {
  Body,
  Controller,
  Delete,
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
import { WorldSlotMechanicRemovalService } from '../application/world-slot-mechanic-removal.service';
import { ReleaseWorldSlotDto } from '../dto/world-challenge-configuration.dto';
import {
  CreateWorldChallengeConfigurationDto,
  UpdateWorldChallengeConfigurationDto,
} from '../dto/world-challenge-configuration.dto';
import {
  envelope,
  UploadedWorldContentAsset,
  worldContentAssetInterceptor,
} from './world-content.http';

@ApiTags('World Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin')
export class WorldChallengeConfigurationsController {
  constructor(
    private readonly configurations: WorldChallengeConfigurationService,
    private readonly slotRemoval: WorldSlotMechanicRemovalService,
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

  @Delete('challenge-configurations/:configurationId')
  remove(@Param('configurationId') configurationId: string) {
    return envelope(this.configurations.remove(configurationId));
  }

  /**
   * What releasing this board position would cost, counted server-side.
   *
   * Read-only: opening the confirmation dialog must not change anything.
   */
  @Get('challenge-configurations/:configurationId/removal-preview')
  removalPreview(@Param('configurationId') configurationId: string) {
    return envelope(this.slotRemoval.preview(configurationId));
  }

  /**
   * Release one board position of one World, disposing of that World's content
   * for the mechanic. Not ChallengeType deletion, and not any other World's
   * content. One request, one transaction — the browser never orchestrates the
   * two destructive halves separately.
   */
  @Post('challenge-configurations/:configurationId/release')
  release(
    @Param('configurationId') configurationId: string,
    @Body() dto: ReleaseWorldSlotDto,
  ) {
    return envelope(
      this.slotRemoval.remove(configurationId, {
        expectedChallengeTypeId: dto.expectedChallengeTypeId,
      }),
    );
  }
}
