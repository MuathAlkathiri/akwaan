import { Controller, Inject, Post, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { UserRole } from '../users/schemas/user.schema';
import {
  AI_PROVIDER_TOKEN,
  type AiProvider,
} from './domain/ai-provider.interface';

@ApiTags('Admin AI Provider')
@ApiBearerAuth()
@Controller('admin/ai')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminAiProviderController {
  constructor(
    @Inject(AI_PROVIDER_TOKEN) private readonly provider: AiProvider,
  ) {}

  @Post('test-provider')
  @ApiOperation({
    operationId: 'aiTestProvider',
    summary: 'Admin: test the configured text-generation provider',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: {
        ok: true,
        provider: 'gemini',
        model: 'gemini-2.5-flash',
        text: 'جاهز',
        durationMs: 1234,
      },
    },
  })
  async testProvider() {
    const result = await this.provider.generateText({
      systemInstruction:
        'Reply with one short Arabic word. Do not use Markdown.',
      prompt: 'Confirm that the provider is ready.',
      temperature: 0,
      maxOutputTokens: 16,
    });
    return {
      ok: true,
      provider: result.provider,
      model: result.model,
      text: result.text,
      durationMs: result.durationMs,
    };
  }
}
