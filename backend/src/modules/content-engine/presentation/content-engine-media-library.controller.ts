import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { ApiBearerAuth, ApiConsumes, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../users/schemas/user.schema';
import { worldContentAssetInterceptor } from '../../world-content/presentation/world-content.http';
import { MediaLibraryService } from '../application/media-library.service';
import { MediaLibraryEntryDto } from './content-engine-media-library.dto';

const envelope = <T>(data: T) => ({ data });

@ApiTags('Content Engine Media Library')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/content-engine/media-library')
export class ContentEngineMediaLibraryController {
  constructor(private readonly library: MediaLibraryService) {}

  @Get()
  async list() {
    return envelope(await this.library.list());
  }

  @Post()
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data')
  async add(
    @Body() dto: MediaLibraryEntryDto,
    @UploadedFile() asset: { buffer?: Buffer } | undefined,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(await this.library.add(dto, asset, user));
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    return envelope(await this.library.remove(id));
  }
}
