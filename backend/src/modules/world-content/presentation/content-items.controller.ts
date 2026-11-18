import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../users/schemas/user.schema';
import { ContentItemService } from '../application/content-item.service';
import { WorldContentAssetMutator } from '../application/world-content-asset.mutator';
import {
  CreateContentItemDto,
  QueryContentItemsDto,
  UpdateContentItemDto,
} from '../dto/content-item.dto';
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
@Controller('admin/content-items')
export class ContentItemsController {
  constructor(
    private readonly contentItems: ContentItemService,
    private readonly assets: WorldContentAssetMutator,
    private readonly deletion: WorldContentDeletionService,
  ) {}

  @Post('upload-asset')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data')
  uploadAsset(@UploadedFile() asset?: UploadedWorldContentAsset) {
    if (!asset) throw new Error('Asset is required');
    return envelope(this.assets.uploadContentItemAsset(asset));
  }

  @Get()
  list(@Query() query: QueryContentItemsDto) {
    return envelope(this.contentItems.list(query));
  }

  @Post()
  create(@Body() dto: CreateContentItemDto) {
    return envelope(this.contentItems.create(dto));
  }

  @Get(':contentItemId')
  findOne(@Param('contentItemId') contentItemId: string) {
    return envelope(this.contentItems.findOne(contentItemId));
  }

  @Get(':contentItemId/readiness')
  readiness(@Param('contentItemId') contentItemId: string) {
    return envelope(this.contentItems.readiness(contentItemId));
  }

  @Patch(':contentItemId')
  update(
    @Param('contentItemId') contentItemId: string,
    @Body() dto: UpdateContentItemDto,
  ) {
    return envelope(this.contentItems.update(contentItemId, dto));
  }

  /** content item: what permanent deletion would remove, keep and require. Read-only. */
  @Get(':contentItemId/deletion-preview')
  deletionPreview(
    @Param('contentItemId') id: string,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      this.deletion.preview('contentItem', id, deletionActor(user)),
    );
  }

  /**
   * Permanently deletes the content item once the operator confirmed the preview.
   * Refused with DELETION_PREVIEW_STALE if the impact changed since.
   */
  @Post(':contentItemId/permanent-delete')
  permanentDelete(
    @Param('contentItemId') id: string,
    @Body() dto: ExecutePermanentDeletionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      this.deletion.execute('contentItem', id, dto, deletionActor(user)),
    );
  }
}
