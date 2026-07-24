import {
  Body,
  Controller,
  Get,
  HttpStatus,
  Post,
  ServiceUnavailableException,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { execFile } from 'child_process';
import { promisify } from 'util';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import { GenerateReviewedQuestionsDto } from './dto/generate-reviewed-questions.dto';
import { SaveReviewedDraftsDto } from './dto/save-reviewed-drafts.dto';
import {
  AiToolDiagnosticsResponseDto,
  GenerateReviewedQuestionsResponseDto,
  GenerateReviewedQuestionsErrorResponseDto,
  SaveReviewedDraftsResponseDto,
  WigoloHealthResponseDto,
} from './dto/ai-response.dto';
import { WigoloClient } from './infrastructure/wigolo/wigolo-client';

const execFileAsync = promisify(execFile);

@ApiTags('Admin AI Generator')
@ApiBearerAuth()
@Controller('admin/ai-generator')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAiGeneratorController {
  private wigoloHealthCache?: {
    expiresAt: number;
    value: Awaited<ReturnType<WigoloClient['readiness']>>;
  };

  constructor(
    private readonly wigoloClient: WigoloClient,
    private readonly config: ConfigService,
  ) {}

  @Get('wigolo-health')
  @ApiOperation({
    operationId: 'aiWigoloHealth',
    summary: 'Admin: safe Wigolo verification provider readiness',
  })
  @ApiResponse({ status: 200, type: WigoloHealthResponseDto })
  async wigoloHealth() {
    const cached = this.wigoloHealthCache;
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const value = await this.wigoloClient.readiness();
    this.wigoloHealthCache = { value, expiresAt: Date.now() + 30_000 };
    return value;
  }

  @Get('debug-tools')
  @ApiOperation({
    operationId: 'aiDebugTools',
    summary: 'Debug local media tool availability for AI asset generation',
    deprecated: true,
  })
  @ApiResponse({ status: 200, type: AiToolDiagnosticsResponseDto })
  async debugTools() {
    const [ffmpegWhich, ytDlpWhich, ffmpegVersion, ytDlpVersion] =
      await Promise.all([
        this.runToolCommand('which', ['ffmpeg']),
        this.runToolCommand('which', ['yt-dlp']),
        this.runToolCommand('ffmpeg', ['-version']),
        this.runToolCommand('yt-dlp', ['--version']),
      ]);

    const ffmpegAvailable = this.toolAvailable(ffmpegWhich, ffmpegVersion);
    const ytDlpAvailable = this.toolAvailable(ytDlpWhich, ytDlpVersion);

    return {
      ffmpegAvailable,
      ytDlpAvailable,
      ffmpegVersion: ffmpegAvailable
        ? ffmpegVersion.split('\n')[0]
        : 'unavailable',
      ytDlpVersion: ytDlpAvailable
        ? ytDlpVersion.split('\n')[0]
        : 'unavailable',
    };
  }

  @Post('generate-reviewed')
  @ApiOperation({
    operationId: 'aiGenerateReviewed',
    summary: 'Generate reviewed AI question drafts without saving them',
    description:
      'Generates multiple-choice question drafts from the configured AI provider, validates quality issues, and returns drafts only.',
  })
  @ApiBody({
    type: GenerateReviewedQuestionsDto,
    examples: {
      default: {
        summary: 'Generate reviewed Arabic World Cup questions',
        value: {
          catalogName: 'رياضة',
          categoryName: 'كأس العالم',
          difficulty: 'medium',
          count: 10,
          language: 'ar',
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    type: GenerateReviewedQuestionsResponseDto,
    description: 'Reviewed question drafts generated successfully',
  })
  @ApiResponse({
    status: 503,
    description: 'AI question generation is disabled',
    schema: {
      example: {
        statusCode: 503,
        code: 'AI_QUESTION_GENERATION_DISABLED',
        message: 'AI question generation is currently disabled.',
      },
    },
  })
  @ApiResponse({
    status: 400,
    type: GenerateReviewedQuestionsErrorResponseDto,
    description:
      'No reviewed drafts were approved; bounded source and candidate diagnostics are returned.',
  })
  async generateReviewed(@Body() body: GenerateReviewedQuestionsDto) {
    this.assertGenerationEnabled();
    void body;
  }

  @Post('save-drafts')
  @ApiOperation({
    operationId: 'aiSaveReviewedDrafts',
    summary: 'Persist reviewed questions as unpublished AI drafts',
  })
  @ApiResponse({ status: 201, type: SaveReviewedDraftsResponseDto })
  async saveDrafts(@Body() body: SaveReviewedDraftsDto) {
    this.assertGenerationEnabled();
    void body;
  }

  private assertGenerationEnabled(): void {
    void this.config.get<string>('AI_QUESTION_GENERATION_ENABLED');
    throw new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'AI_QUESTION_GENERATION_DISABLED',
      message: 'AI question generation is currently disabled.',
    });
  }

  private async runToolCommand(
    command: string,
    args: string[],
  ): Promise<string> {
    try {
      const { stdout, stderr } = await execFileAsync(command, args);
      return [stdout, stderr].filter(Boolean).join('\n').trim();
    } catch (error) {
      if (error instanceof Error) {
        return error.message;
      }

      return String(error);
    }
  }

  private sanitizeResponse(value: unknown): Record<string, unknown> {
    return this.sanitizeValue(value) as Record<string, unknown>;
  }

  private toolAvailable(...outputs: string[]): boolean {
    return outputs.every(
      (output) =>
        !/^(Command failed|Error:)/i.test(output) &&
        !/\b(ENOENT|spawn)\b/i.test(output),
    );
  }

  private sanitizeValue(value: unknown): unknown {
    if (Array.isArray(value))
      return value.map((item) => this.sanitizeValue(item));
    if (!value || typeof value !== 'object') return value;
    const source =
      'toObject' in value && typeof value.toObject === 'function'
        ? value.toObject()
        : (value as Record<string, unknown>);
    return Object.fromEntries(
      Object.entries(source)
        .filter(
          ([key]) =>
            key !== '__v' && key !== 'localPath' && !key.startsWith('$'),
        )
        .map(([key, item]) => [key, this.sanitizeValue(item)]),
    );
  }
}
