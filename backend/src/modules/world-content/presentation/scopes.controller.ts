import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
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
import { ScopeService } from '../application/scope.service';
import { CreateScopeDto, UpdateScopeDto } from '../dto/scope.dto';
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
export class ScopesController {
  constructor(
    private readonly scopes: ScopeService,
    private readonly deletion: WorldContentDeletionService,
  ) {}

  @Get('worlds/:worldId/scopes')
  listByWorld(@Param('worldId') worldId: string) {
    return envelope(this.scopes.listByWorld(worldId));
  }

  @Post('worlds/:worldId/scopes')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  create(
    @Param('worldId') worldId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(body, 'scope', CreateScopeDto);
    return envelope(this.scopes.create(worldId, dto, asset));
  }

  @Get('scopes/:scopeId')
  findOne(@Param('scopeId') scopeId: string) {
    return envelope(this.scopes.findOne(scopeId));
  }

  @Get('scopes/:scopeId/readiness')
  readiness(@Param('scopeId') scopeId: string) {
    return envelope(this.scopes.scopeReadiness(scopeId));
  }

  @Patch('scopes/:scopeId')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  update(
    @Param('scopeId') scopeId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(body, 'scope', UpdateScopeDto);
    return envelope(this.scopes.update(scopeId, dto, asset));
  }

  @Delete('scopes/:scopeId')
  remove() {
    throw new GoneException({
      code: 'LEGACY_DELETION_RETIRED',
      message: 'Use the Scope deletion preview and permanent-delete workflow.',
    });
  }

  /** Scope and its content: what permanent deletion would remove, keep and require. Read-only. */
  @Get('scopes/:scopeId/deletion-preview')
  deletionPreview(
    @Param('scopeId') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(this.deletion.preview('scope', id, deletionActor(user)));
  }

  /**
   * Permanently deletes the Scope and its content once the operator confirmed the preview.
   * Refused with DELETION_PREVIEW_STALE if the impact changed since.
   */
  @Post('scopes/:scopeId/permanent-delete')
  permanentDelete(
    @Param('scopeId') id: string,
    @Body() dto: ExecutePermanentDeletionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      this.deletion.execute('scope', id, dto, deletionActor(user)),
    );
  }
}
