import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Query,
  UnauthorizedException,
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
import {
  EngineAdminActor,
  EngineJobAdminService,
} from '../application/engine-job-admin.service';
import {
  EngineJobListQueryDto,
  EngineJobRequestDto,
  EnginePreflightRequestDto,
  EngineRunRequestDto,
} from './content-engine-jobs.dto';

const envelope = <T>(data: T) => ({ data });

/**
 * Starting work, as an authenticated admin action.
 *
 * Same guard stack, same role and same path prefix as the review controller —
 * this is one workspace, not a second surface. Nothing here is public, actor
 * attribution is derived strictly from the authenticated Admin user, and job
 * execution always targets an explicit `jobId`.
 */
@ApiTags('Content Engine Jobs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/content-engine')
export class ContentEngineJobsController {
  constructor(private readonly jobs: EngineJobAdminService) {}

  private requireAdminActor(user?: AuthenticatedUser): EngineAdminActor {
    if (!user?.id?.trim()) {
      throw new UnauthorizedException({
        code: 'AUTHENTICATED_ADMIN_REQUIRED',
        message: 'Authenticated Admin context is required',
      });
    }
    return {
      actorId: user.id.trim(),
      actorEmail: user.email?.trim() ?? '',
    };
  }

  /**
   * Read-only authoring options derived from canonical World/Scope eligibility,
   * generator capability, and runtime ContentItem compatibility.
   */
  @Get('options')
  async options() {
    return envelope(await this.jobs.options());
  }

  /** Read-only: resolvability, estimated cost, remaining budget, and planDigest. */
  @Post('jobs/preflight')
  async preflight(@Body() body: EnginePreflightRequestDto) {
    return envelope(await this.jobs.preflight(body));
  }

  /**
   * Read-only paginated job listing ordered newest-first (`_id: -1`).
   */
  @Get('jobs')
  async list(@Query() query: EngineJobListQueryDto) {
    return envelope(await this.jobs.listJobs(query));
  }

  /**
   * Idempotent: the same generation specification resolves to one job.
   * Requires a matching preflight `planDigest` and attributes the job to the
   * authenticated Admin.
   */
  @Post('jobs')
  async submit(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: EngineJobRequestDto,
  ) {
    const actor = this.requireAdminActor(user);
    return envelope(await this.jobs.submit(body, actor));
  }

  /**
   * Run one specific queued job to completion, now.
   *
   * Requires an explicit `jobId` and derives lease ownership strictly from the
   * authenticated Admin user — never from client-supplied owner fields.
   */
  @Post('jobs/run')
  async run(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: EngineRunRequestDto,
  ) {
    const actor = this.requireAdminActor(user);
    return envelope(await this.jobs.runJob(body?.jobId ?? '', actor));
  }

  /** Run one specific queued job by path parameter `:jobId`. */
  @Post('jobs/:jobId/run')
  async runById(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ) {
    const actor = this.requireAdminActor(user);
    return envelope(await this.jobs.runJob(jobId, actor));
  }

  @Get('jobs/:jobId')
  async status(@Param('jobId') jobId: string) {
    const status = await this.jobs.status(jobId);
    if (!status) throw new NotFoundException('Job not found');
    return envelope(status);
  }

  @Post('jobs/:jobId/cancel')
  async cancel(
    @CurrentUser() user: AuthenticatedUser,
    @Param('jobId') jobId: string,
  ) {
    this.requireAdminActor(user);
    return envelope(await this.jobs.cancel(jobId));
  }
}
