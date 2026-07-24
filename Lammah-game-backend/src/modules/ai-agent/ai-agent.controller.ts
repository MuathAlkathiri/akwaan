import {
  Controller,
  Post,
  Body,
  HttpStatus,
  UseGuards,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ApiBearerAuth,
  ApiBody,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { GenerateQuestionsDto } from './dto/generate-questions.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import { ids } from '../../common/swagger/examples';
import { GenerateQuestionsResponseDto } from './dto/ai-response.dto';

@ApiTags('AI Agent')
@ApiBearerAuth()
@Controller('ai-agent')
export class AiAgentController {
  constructor(private readonly config: ConfigService) {}

  @Post('generate-questions')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBody({
    type: GenerateQuestionsDto,
    examples: {
      default: {
        summary: 'Generate questions for category',
        value: {
          categoryId: ids.category,
          count: 6,
        },
      },
    },
  })
  @ApiOperation({
    operationId: 'aiGenerateQuestions',
    summary:
      'Generate questions for a category using the configured AI provider',
    description:
      'Generates open-answer questions for a selected category. ' +
      'Questions are saved as drafts and must be reviewed/approved by admin before use in games.',
  })
  @ApiResponse({
    status: 200,
    type: GenerateQuestionsResponseDto,
    description: 'Questions generated and saved as drafts successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Bad request - category not found or validation error',
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
  async generateQuestions(@Body() generateQuestionsDto: GenerateQuestionsDto) {
    this.assertGenerationEnabled();
    void generateQuestionsDto;
  }

  private assertGenerationEnabled(): void {
    void this.config.get<string>('AI_QUESTION_GENERATION_ENABLED');
    throw new ServiceUnavailableException({
      statusCode: HttpStatus.SERVICE_UNAVAILABLE,
      code: 'AI_QUESTION_GENERATION_DISABLED',
      message: 'AI question generation is currently disabled.',
    });
  }
}
