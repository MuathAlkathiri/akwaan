import { Body, Controller, Get, Put, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { MediaRightsService } from '../application/media-rights.service';
import { RecordMediaRightsDto } from '../dto/record-media-rights.dto';

/**
 * Admin-only. There is no public counterpart and there must not be one.
 *
 * Rights evidence contains contracts, contacts and commercial terms. The service
 * projects a deliberately narrow view — clearance statuses, replacement flag and
 * the public-safe attribution ingredients — so `evidenceRef`, `notes`,
 * `territory`, `grantedBy` and `commercialUseScope` never leave the registry
 * through this surface, even for an administrator reading the status route.
 */
@ApiTags('Admin Media Rights')
@ApiBearerAuth()
@Controller('admin/media-rights')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminMediaRightsController {
  constructor(private readonly rights: MediaRightsService) {}

  @Get()
  @ApiOperation({
    operationId: 'adminMediaRightsStatus',
    summary: 'Two-layer clearance status for one managed asset',
  })
  @ApiQuery({ name: 'assetUrl', example: '/uploads/questions/bomb-items/x.jpg' })
  async status(@Query('assetUrl') assetUrl: string) {
    return { data: await this.rights.statusFor(assetUrl) };
  }

  @Get('affected')
  @ApiOperation({
    operationId: 'adminMediaRightsAffectedContentItems',
    summary: 'ContentItems that would be affected by changing this asset',
  })
  @ApiQuery({ name: 'assetUrl', example: '/uploads/questions/bomb-items/x.jpg' })
  async affected(@Query('assetUrl') assetUrl: string) {
    return { data: await this.rights.affectedContentItems(assetUrl) };
  }

  @Put()
  @ApiOperation({
    operationId: 'adminMediaRightsRecord',
    summary: 'Create or update the rights record for one managed asset',
  })
  async record(@Body() dto: RecordMediaRightsDto) {
    const { assetUrl, reviewedBy, ...patch } = dto;
    return {
      data: await this.rights.record(assetUrl, patch as never, reviewedBy),
    };
  }
}
