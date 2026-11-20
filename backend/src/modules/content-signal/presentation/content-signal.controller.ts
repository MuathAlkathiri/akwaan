import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsIn, IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import {
  CurrentLiveParticipant,
  ParticipantCredentialGuard,
  ParticipantRequest,
} from '../../live-game-sessions/presentation/participant-auth';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { Roles } from '../../../common/decorators/roles.decorator';
import { UserRole } from '../../users/schemas/user.schema';
import { ContentSignalService } from '../application/content-signal.service';
import { ContentSignalRepository } from '../persistence/content-signal.repository';
import {
  CONTENT_SIGNAL_KINDS,
  ContentSignalKind,
} from '../domain/content-signal';

export class RecordContentSignalDto {
  @ApiProperty({ example: '6730a1f2c9e4b81d3a5f2e10' })
  @IsString()
  @MaxLength(64)
  contentItemId!: string;

  @ApiProperty({ enum: CONTENT_SIGNAL_KINDS, example: 'liked' })
  @IsIn(CONTENT_SIGNAL_KINDS)
  kind!: ContentSignalKind;
}

@ApiTags('Content signal')
@Controller('content-signals')
export class ContentSignalController {
  constructor(
    private readonly signals: ContentSignalService,
    private readonly repository: ContentSignalRepository,
  ) {}

  @Post()
  @UseGuards(ParticipantCredentialGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'contentSignalsRecord',
    summary: 'A player’s verdict on the question on screen',
  })
  async record(
    @Body() body: RecordContentSignalDto,
    @CurrentLiveParticipant()
    participant: NonNullable<ParticipantRequest['liveParticipant']>,
  ): Promise<void> {
    const { actor } = participant;
    if (actor.kind !== 'participant') return;
    await this.signals.record({
      sessionId: actor.sessionId,
      participantId: actor.participantId,
      contentItemId: body.contentItemId,
      kind: body.kind,
      source: 'reveal-buttons',
    });
  }

  @Get('tallies')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'contentSignalsTallies',
    summary: 'Every question with a verdict, worst first',
  })
  tallies() {
    return this.repository.tallies();
  }

  @Get('tallies.csv')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @ApiOperation({
    operationId: 'contentSignalsTalliesCsv',
    summary: 'The same tallies, for a spreadsheet',
  })
  async talliesCsv(): Promise<string> {
    // A spreadsheet is the whole reporting surface for the first weeks: the
    // questions worth asking of this data are not known yet, and a chart built
    // before they are would answer the wrong one.
    const rows = await this.repository.tallies();
    const lines = ['contentItemId,challengeTypeKey,liked,defect'];
    for (const row of rows) {
      lines.push(
        [row.contentItemId, row.challengeTypeKey, row.liked, row.defect].join(
          ',',
        ),
      );
    }
    return `${lines.join('\n')}\n`;
  }

  @Get('defects')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'contentSignalsDefects',
    summary: 'The newest reported defects',
  })
  defects(@Query('limit') limit?: string) {
    const parsed = Number(limit);
    return this.repository.recent(
      'defect',
      Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, 500) : 100,
    );
  }
}
