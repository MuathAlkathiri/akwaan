import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import { ContentEngineReviewService } from '../application/content-engine-review.service';
import {
  CandidateApprovalDto,
  CandidateAssessmentDto,
  CandidateEditDto,
  CandidateRejectionDto,
  CreateCandidateDraftDto,
  ReviewCandidateQueryDto,
} from './content-engine-review.dto';

const envelope = <T>(data: T) => ({ data });

@ApiTags('Content Engine Review')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/content-engine')
export class ContentEngineReviewController {
  constructor(private readonly review: ContentEngineReviewService) {}

  @Get('candidates')
  async list(@Query() query: ReviewCandidateQueryDto) {
    return envelope(await this.review.list(query));
  }

  @Get('jobs/:jobId/spending')
  async spending(@Param('jobId') jobId: string) {
    return envelope(await this.review.spending(jobId));
  }

  @Get('candidates/:candidateId')
  async detail(@Param('candidateId') candidateId: string) {
    return envelope(await this.review.detail(candidateId));
  }

  @Patch('candidates/:candidateId')
  async edit(
    @Param('candidateId') candidateId: string,
    @Body() dto: CandidateEditDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(await this.review.edit(candidateId, dto, user));
  }

  @Post('candidates/:candidateId/assessment')
  async assess(
    @Param('candidateId') candidateId: string,
    @Body() dto: CandidateAssessmentDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(await this.review.assess(candidateId, dto, user));
  }

  @Post('candidates/:candidateId/approve')
  async approve(
    @Param('candidateId') candidateId: string,
    @Body() dto: CandidateApprovalDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(await this.review.approve(candidateId, dto, user));
  }

  @Post('candidates/:candidateId/reject')
  async reject(
    @Param('candidateId') candidateId: string,
    @Body() dto: CandidateRejectionDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(await this.review.reject(candidateId, dto, user));
  }

  @Post('candidates/:candidateId/create-draft')
  async createDraft(
    @Param('candidateId') candidateId: string,
    @Body() dto: CreateCandidateDraftDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return envelope(
      await this.review.createDraft(candidateId, dto.expectedRevision, user),
    );
  }
}
