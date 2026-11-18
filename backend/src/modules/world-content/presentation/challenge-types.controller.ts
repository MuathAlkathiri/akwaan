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
import { ChallengeTypeService } from '../application/challenge-type.service';
import {
  CreateChallengeTypeDto,
  UpdateChallengeTypeDto,
} from '../dto/challenge-type.dto';
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

/** Global mechanic definitions — deliberately not nested under a World. */
@ApiTags('World Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/challenge-types')
export class ChallengeTypesController {
  constructor(
    private readonly challengeTypes: ChallengeTypeService,
    private readonly deletion: WorldContentDeletionService,
  ) {}

  @Get()
  list() {
    return envelope(this.challengeTypes.list());
  }

  /** Declared before ":challengeTypeId" so the literal path wins. */
  @Get('metadata')
  metadata() {
    return envelope(this.challengeTypes.metadata());
  }

  @Post()
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(
      body,
      'challengeType',
      CreateChallengeTypeDto,
    );
    return envelope(this.challengeTypes.create(dto, asset));
  }

  @Get(':challengeTypeId')
  findOne(@Param('challengeTypeId') challengeTypeId: string) {
    return envelope(this.challengeTypes.findOne(challengeTypeId));
  }

  @Get(':challengeTypeId/readiness')
  readiness(@Param('challengeTypeId') challengeTypeId: string) {
    return envelope(this.challengeTypes.readiness(challengeTypeId));
  }

  @Patch(':challengeTypeId')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  update(
    @Param('challengeTypeId') challengeTypeId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(
      body,
      'challengeType',
      UpdateChallengeTypeDto,
    );
    return envelope(this.challengeTypes.update(challengeTypeId, dto, asset));
  }

  /** mechanic (exclusive content deleted, shared content kept): what permanent deletion would remove, keep and require. Read-only. */
  @Get(':challengeTypeId/deletion-preview')
  deletionPreview(
    @Param('challengeTypeId') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      this.deletion.preview('challengeType', id, deletionActor(user)),
    );
  }

  /**
   * Permanently deletes the mechanic (exclusive content deleted, shared content kept) once the operator confirmed the preview.
   * Refused with DELETION_PREVIEW_STALE if the impact changed since.
   */
  @Post(':challengeTypeId/permanent-delete')
  permanentDelete(
    @Param('challengeTypeId') id: string,
    @Body() dto: ExecutePermanentDeletionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      this.deletion.execute('challengeType', id, dto, deletionActor(user)),
    );
  }
}
