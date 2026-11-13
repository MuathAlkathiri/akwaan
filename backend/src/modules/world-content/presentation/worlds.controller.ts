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
import { IsArray, IsMongoId } from 'class-validator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { parseMultipartJsonBody } from '../../../common/pipes/multipart-json-body.parser';
import { UserRole } from '../../users/schemas/user.schema';
import { WorldService } from '../application/world.service';
import { WorldReadinessService } from '../application/world-readiness.service';
import { CreateWorldDto, UpdateWorldDto } from '../dto/world.dto';
import {
  envelope,
  UploadedWorldContentAsset,
  worldContentAssetInterceptor,
} from './world-content.http';

export class ValidateMatchWorldSelectionDto {
  @IsArray() @IsMongoId({ each: true }) worldIds: string[];
}

@ApiTags('World Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/worlds')
export class WorldsController {
  constructor(
    private readonly worlds: WorldService,
    private readonly readiness: WorldReadinessService,
  ) {}

  @Get()
  list() {
    return envelope(this.worlds.list());
  }

  @Post()
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(body, 'world', CreateWorldDto);
    return envelope(this.worlds.create(dto, asset));
  }

  /**
   * Roadmap 11. Declared before ":worldId" so the literal path wins.
   */
  @Post('validate-match-selection')
  validateMatchSelection(@Body() dto: ValidateMatchWorldSelectionDto) {
    return envelope(
      this.readiness.validateSelectedWorldsForMatch(dto.worldIds),
    );
  }

  @Get(':worldId')
  findOne(@Param('worldId') worldId: string) {
    return envelope(this.worlds.findOne(worldId));
  }

  @Get(':worldId/readiness')
  worldReadiness(@Param('worldId') worldId: string) {
    return envelope(this.worlds.worldReadiness(worldId));
  }

  @Patch(':worldId')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  update(
    @Param('worldId') worldId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(body, 'world', UpdateWorldDto);
    return envelope(this.worlds.update(worldId, dto, asset));
  }

  @Delete(':worldId')
  remove(@Param('worldId') worldId: string) {
    return envelope(this.worlds.remove(worldId));
  }
}
