import {
  Body,
  Controller,
  Delete,
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

@ApiTags('World Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/content-items')
export class ContentItemsController {
  constructor(
    private readonly contentItems: ContentItemService,
    private readonly assets: WorldContentAssetMutator,
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

  @Delete(':contentItemId')
  remove(@Param('contentItemId') contentItemId: string) {
    return envelope(this.contentItems.remove(contentItemId));
  }
}
