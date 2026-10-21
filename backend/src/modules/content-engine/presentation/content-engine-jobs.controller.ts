import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import {
  AuthenticatedUser,
  CurrentUser,
} from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../users/schemas/user.schema';
import { EngineJobAdminService } from '../application/engine-job-admin.service';
import {
  EngineJobRequestDto,
  EngineRunRequestDto,
} from './content-engine-jobs.dto';

const envelope = <T>(data: T) => ({ data });

/**
 * Starting work, as an authenticated admin action.
 *
 * Same guard stack, same role and same path prefix as the review controller —
 * this is one workspace, not a second surface. Nothing here is public, and no
 * route can raise a spending limit: the caps live in configuration and the
 * override fields in the ledger stay unwritten until an audited approval flow
 * exists.
 */
@ApiTags('Content Engine Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/content-engine')
export class ContentEngineJobsController {
  constructor(private readonly jobs: EngineJobAdminService) {}

  /** Read-only: resolvability, estimated cost, and remaining budget. */
  @Post('jobs/preflight')
  async preflight(@Body() body: EngineJobRequestDto) {
    return envelope(await this.jobs.preflight(body));
  }

  /** Idempotent: the same combination and context resolve to one job. */
  @Post('jobs')
  async submit(@Body() body: EngineJobRequestDto) {
    return envelope(await this.jobs.submit(body));
  }

  /**
   * Run one queued job to completion, now.
   *
   * The owner defaults to the authenticated admin, so a lease is always
   * traceable to a person and two admins cannot collide on one identity.
   */
  @Post('jobs/run')
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: EngineRunRequestDto,
  ) {
    return envelope(
      await this.jobs.runNow(body.owner?.trim() || `admin:${user.id}`),
    );
  }

  @Get('jobs/:jobId')
  async status(@Param('jobId') jobId: string) {
    const status = await this.jobs.status(jobId);
    if (!status) throw new NotFoundException('Job not found');
    return envelope(status);
  }

  @Post('jobs/:jobId/cancel')
  async cancel(@Param('jobId') jobId: string) {
    return envelope(await this.jobs.cancel(jobId));
  }
}
