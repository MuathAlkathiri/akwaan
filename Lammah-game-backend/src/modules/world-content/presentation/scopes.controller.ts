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
import { ScopeService } from '../application/scope.service';
import { CreateScopeDto, UpdateScopeDto } from '../dto/scope.dto';
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
export class ScopesController {
  constructor(private readonly scopes: ScopeService) {}

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
  remove(@Param('scopeId') scopeId: string) {
    return envelope(this.scopes.remove(scopeId));
  }
}
