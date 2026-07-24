import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiTags,
  ApiExtraModels,
  getSchemaPath,
} from '@nestjs/swagger';
import { QueryQuestionsService } from './application/query-questions.service';
import { MutateQuestionService } from './application/mutate-question.service';
import { ReviewQuestionService } from './application/review-question.service';
import { QuestionAssetRetryService } from './application/question-asset-retry.service';
import { QueryQuestionsDto } from './dto/query-questions.dto';
import { BulkQuestionActionDto } from './dto/review-question.dto';
import { QuestionResponseMapper } from './mappers/question-response.mapper';
import {
  BulkQuestionActionResponseDto,
  QuestionDetailResponseDto,
  QuestionListResponseDto,
  QuestionMutationResponseDto,
  QuestionAudioCandidatesResponseDto,
} from './dto/question-response.dto';
import {
  CreateQuestionDto,
  UpdateQuestionDto,
} from './dto/create-question.dto';
import { Question } from './schemas/question.schema';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { UserRole } from '../users/schemas/user.schema';
import {
  ids,
  publicQuestionExample,
  questionExample,
} from '../../common/swagger/examples';
import { parseMultipartJsonBody } from '../../common/pipes/multipart-json-body.parser';
import type { UploadedImageFile } from '../../common/uploads/local-image-storage.service';
import type { UploadedAudioFile } from '../../common/uploads/local-audio-storage.service';
import { QuestionDuplicateDetectionService } from './application/question-duplicate-detection.service';
import { QuestionAudioReviewService } from './application/question-audio-review.service';
import {
  CheckQuestionDuplicatesDto,
  PreviewQuestionMediaClipDto,
  UpdateQuestionAudioClipDto,
  UpdateQuestionAudioRequestDto,
  RetryQuestionAudioDto,
} from './dto/question-audio.dto';
import {
  AcceptedAnswerGenerationResponseDto,
  GenerateAcceptedAnswersDto,
  GenerateRankedAcceptedAnswersDto,
  RankedAcceptedAnswerGenerationResponseDto,
} from './dto/accepted-answer-generation.dto';
import { AcceptedAnswerExpansionService } from './application/accepted-answer-expansion.service';

const questionImageUploadInterceptor = FileInterceptor('image', {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) {
      callback(
        new BadRequestException(
          'Question image must be jpg, jpeg, png, or webp',
        ),
        false,
      );
      return;
    }
    callback(null, true);
  },
});

const questionMediaImageUploadInterceptor = FileInterceptor('file', {
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (!/^image\/(jpe?g|png|webp)$/.test(file.mimetype)) {
      callback(
        new BadRequestException({
          code: 'QUESTION_IMAGE_FORMAT_UNSUPPORTED',
          message: 'Question image must be jpg, jpeg, png, or webp.',
        }),
        false,
      );
      return;
    }
    callback(null, true);
  },
});

const questionAudioUploadInterceptor = FileInterceptor('audio', {
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    if (
      !/^audio\/(mpeg|mp4|x-m4a|wav|ogg|webm)$/.test(file.mimetype) &&
      file.mimetype !== 'video/mp4'
    ) {
      callback(
        new BadRequestException({
          code: 'MEDIA_FORMAT_UNSUPPORTED',
          message: 'Media must be mp3, m4a, wav, ogg, webm, or mp4.',
        }),
        false,
      );
      return;
    }
    callback(null, true);
  },
});

@ApiTags('Questions')
@ApiExtraModels(CreateQuestionDto, UpdateQuestionDto)
@Controller('questions')
export class QuestionsController {
  constructor(
    private readonly queries: QueryQuestionsService,
    private readonly mutations: MutateQuestionService,
  ) {}

  @Post()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @UseInterceptors(questionImageUploadInterceptor)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'questionsCreate',
    summary: 'Create a new question',
  })
  @ApiConsumes('multipart/form-data', 'application/json')
  @ApiBody({
    schema: {
      allOf: [
        { $ref: getSchemaPath(CreateQuestionDto) },
        {
          type: 'object',
          properties: {
            image: { type: 'string', format: 'binary' },
          },
        },
      ],
    },
    examples: {
      default: {
        summary: 'Create approved free-game question',
        value: {
          category: ids.category,
          question: 'What planet is known as the Red Planet?',
          answer: 'Mars',
          explanation: 'Mars appears red because of iron oxide on its surface.',
          difficulty: 'easy',
          points: 200,
          type: 'text',
          status: 'approved',
          source: 'manual',
          isFreeGameQuestion: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Question created successfully',
    type: QuestionMutationResponseDto,
    schema: {
      example: {
        statusCode: 201,
        message: 'Question created successfully',
        data: questionExample,
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() image?: UploadedImageFile,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Question;
  }> {
    const createQuestionDto = parseMultipartJsonBody(
      body,
      'question',
      CreateQuestionDto,
    );
    const question = await this.mutations.create(createQuestionDto, image);
    return {
      statusCode: HttpStatus.CREATED,
      message: 'Question created successfully',
      data: QuestionResponseMapper.toResponse(question) as unknown as Question,
    };
  }

  @Get()
  @ApiOperation({ operationId: 'questionsList', summary: 'Get all questions' })
  @ApiResponse({
    status: 200,
    description: 'Questions retrieved successfully. Answers are hidden.',
    type: QuestionListResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: [publicQuestionExample],
      },
    },
  })
  async findAll(): Promise<{
    statusCode: number;
    data: Question[];
  }> {
    const questions = await this.queries.listPublic();
    return {
      statusCode: HttpStatus.OK,
      data: QuestionResponseMapper.toResponseList(
        questions,
      ) as unknown as Question[],
    };
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'questionsGetById',
    summary: 'Get a specific question by ID',
  })
  @ApiParam({
    name: 'id',
    example: ids.question,
    description: 'Question MongoDB ObjectId',
  })
  @ApiResponse({
    status: 200,
    description: 'Question retrieved successfully. Answer is hidden.',
    type: QuestionDetailResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: publicQuestionExample,
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'Question not found',
    schema: {
      example: {
        statusCode: 404,
        message: `Question with ID "${ids.question}" not found`,
        error: 'Not Found',
      },
    },
  })
  async findById(@Param('id') id: string): Promise<{
    statusCode: number;
    data: Question;
  }> {
    const question = await this.queries.getPublic(id);
    return {
      statusCode: HttpStatus.OK,
      data: QuestionResponseMapper.toResponse(question) as unknown as Question,
    };
  }

  @Patch(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    operationId: 'questionsUpdate',
    summary: 'Update a question',
  })
  @ApiParam({
    name: 'id',
    example: ids.question,
    description: 'Question MongoDB ObjectId',
  })
  @ApiConsumes('application/json')
  @ApiBody({
    type: UpdateQuestionDto,
    examples: {
      default: {
        summary: 'Approve and mark as free-game question',
        value: {
          status: 'approved',
          isFreeGameQuestion: true,
        },
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'Question updated successfully',
    type: QuestionMutationResponseDto,
    schema: {
      example: {
        statusCode: 200,
        message: 'Question updated successfully',
        data: questionExample,
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Question not found' })
  async update(
    @Param('id') id: string,
    @Body() updateQuestionDto: UpdateQuestionDto,
  ): Promise<{
    statusCode: number;
    message: string;
    data: Question;
  }> {
    const question = await this.mutations.update(id, updateQuestionDto);
    return {
      statusCode: HttpStatus.OK,
      message: 'Question updated successfully',
      data: QuestionResponseMapper.toResponse(question) as unknown as Question,
    };
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    operationId: 'questionsDelete',
    summary: 'Delete a question',
  })
  @ApiParam({
    name: 'id',
    example: ids.question,
    description: 'Question MongoDB ObjectId',
  })
  @ApiResponse({ status: 204, description: 'Question deleted successfully' })
  @ApiResponse({ status: 404, description: 'Question not found' })
  async delete(@Param('id') id: string): Promise<void> {
    await this.mutations.delete(id);
  }
}

@ApiTags('Admin Questions')
@ApiBearerAuth()
@Controller('admin/questions')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminQuestionsController {
  constructor(
    private readonly queries: QueryQuestionsService,
    private readonly reviews: ReviewQuestionService,
    private readonly assetRetry: QuestionAssetRetryService,
    private readonly duplicates: QuestionDuplicateDetectionService,
    private readonly audioReview: QuestionAudioReviewService,
    private readonly acceptedAnswers: AcceptedAnswerExpansionService,
    private readonly mutations: MutateQuestionService,
  ) {}

  @Post('accepted-answers/generate')
  @ApiOperation({
    operationId: 'questionsGenerateAcceptedAnswers',
    summary: 'Generate reviewable accepted-answer aliases during authoring',
  })
  @ApiResponse({ status: 201, type: AcceptedAnswerGenerationResponseDto })
  generateAcceptedAnswers(@Body() body: GenerateAcceptedAnswersDto) {
    return this.acceptedAnswers.generate(body);
  }

  @Post('accepted-answers/generate-ranked-list')
  @ApiOperation({
    operationId: 'questionsGenerateRankedAcceptedAnswers',
    summary: 'Generate reviewable aliases for all ranked-list entries',
  })
  @ApiResponse({
    status: 201,
    type: RankedAcceptedAnswerGenerationResponseDto,
  })
  generateRankedAcceptedAnswers(
    @Body() body: GenerateRankedAcceptedAnswersDto,
  ) {
    return this.acceptedAnswers.generateRanked(body);
  }

  @Post('check-duplicates')
  @ApiOperation({
    operationId: 'questionsCheckDuplicates',
    summary: 'Check a manually-authored question for duplicates',
  })
  @ApiResponse({
    status: 201,
    schema: {
      example: { exactMatch: false, highestSimilarity: 0.88, matches: [] },
    },
  })
  async checkDuplicates(@Body() body: CheckQuestionDuplicatesDto) {
    return this.duplicates.check(body);
  }

  @Get()
  @ApiOperation({
    operationId: 'adminQuestionsList',
    summary: 'Admin: get all questions including answers',
  })
  @ApiResponse({
    status: 200,
    description: 'Questions retrieved successfully with answers.',
    type: QuestionListResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: [questionExample],
      },
    },
  })
  async findAll(): Promise<{
    statusCode: number;
    data: Question[];
  }> {
    const questions = await this.queries.listAdmin();
    return {
      statusCode: HttpStatus.OK,
      data: QuestionResponseMapper.toResponseList(
        questions,
      ) as unknown as Question[],
    };
  }

  @Get('ai-generated/list')
  @ApiOperation({
    operationId: 'questionsListAiGenerated',
    summary: 'List AI-generated questions for review',
  })
  @ApiResponse({ status: 200, type: QuestionListResponseDto })
  async findAiGenerated(@Query() filters: QueryQuestionsDto) {
    return {
      statusCode: HttpStatus.OK,
      data: QuestionResponseMapper.toResponseList(
        await this.queries.listAiGenerated(filters),
      ),
    };
  }

  @Post('bulk-action')
  @ApiOperation({
    operationId: 'questionsBulkAction',
    summary: 'Apply an admin review action to questions',
  })
  @ApiResponse({ status: 201, type: BulkQuestionActionResponseDto })
  async bulkAction(@Body() body: BulkQuestionActionDto) {
    return this.reviews.bulkAction(body);
  }

  @Post(':id/media/image')
  @HttpCode(HttpStatus.OK)
  @UseInterceptors(questionMediaImageUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: {
          type: 'string',
          format: 'binary',
          description: 'JPEG, PNG, or WebP image up to 5MB.',
        },
      },
    },
  })
  @ApiOperation({
    operationId: 'questionsUploadImage',
    summary: 'Upload or replace the canonical optional question image',
  })
  @ApiResponse({ status: 200, type: QuestionDetailResponseDto })
  async uploadImage(
    @Param('id') id: string,
    @UploadedFile() file?: UploadedImageFile,
  ) {
    if (!file)
      throw new BadRequestException({
        code: 'QUESTION_IMAGE_FILE_REQUIRED',
        message: 'An image file is required.',
      });
    return {
      statusCode: HttpStatus.OK,
      data: QuestionResponseMapper.toResponse(
        await this.mutations.uploadImage(id, file),
      ),
    };
  }

  @Delete(':id/media/image')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    operationId: 'questionsRemoveImage',
    summary: 'Explicitly remove the canonical optional question image',
  })
  @ApiResponse({ status: 200, type: QuestionDetailResponseDto })
  async removeImage(@Param('id') id: string) {
    return {
      statusCode: HttpStatus.OK,
      data: QuestionResponseMapper.toResponse(
        await this.mutations.removeImage(id),
      ),
    };
  }

  @Post(':id/retry-primary-asset')
  @ApiOperation({
    operationId: 'questionsRetryPrimaryAsset',
    summary: 'Retry primary asset resolution',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async retryPrimaryAsset(@Param('id') id: string) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.assetRetry.retry(id, 'primary'),
      ),
    };
  }

  @Post(':id/retry-cover-image')
  @ApiOperation({
    operationId: 'questionsRetryCoverImage',
    summary: 'Retry cover image resolution',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async retryCoverImage(@Param('id') id: string) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.assetRetry.retry(id, 'cover'),
      ),
    };
  }

  @Post(':id/audio/retry')
  @ApiOperation({
    operationId: 'questionsRetryAudio',
    summary: 'Retry audio processing',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async retryAudio(
    @Param('id') id: string,
    @Body() body?: RetryQuestionAudioDto,
  ) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.retry(id, body?.mode),
      ),
    };
  }

  @Patch(':id/audio-request')
  @ApiOperation({
    operationId: 'questionsUpdateAudioRequest',
    summary: 'Update an audio request and enqueue fresh candidate research',
  })
  @ApiResponse({ status: 200, type: QuestionDetailResponseDto })
  async updateAudioRequest(
    @Param('id') id: string,
    @Body() body: UpdateQuestionAudioRequestDto,
  ) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.updateRequest(id, body.audioRequest),
      ),
    };
  }

  @Get(':id/audio/candidates')
  @ApiOperation({
    operationId: 'questionsListAudioCandidates',
    summary: 'List bounded candidates for the active audio request',
  })
  @ApiResponse({ status: 200, type: QuestionAudioCandidatesResponseDto })
  async listAudioCandidates(@Param('id') id: string) {
    return { data: await this.audioReview.candidates(id) };
  }

  @Post(':id/audio/candidates/:candidateId/select')
  @ApiOperation({
    operationId: 'questionsSelectAudioCandidate',
    summary: 'Select and process one candidate from the active audio request',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async selectAudioCandidate(
    @Param('id') id: string,
    @Param('candidateId') candidateId: string,
  ) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.selectCandidate(id, candidateId),
      ),
    };
  }

  @Patch(':id/audio/clip')
  @ApiOperation({
    operationId: 'questionsUpdateAudioClip',
    summary: 'Update audio clip settings without starting processing',
  })
  @ApiResponse({ status: 200, type: QuestionDetailResponseDto })
  async updateAudioClip(
    @Param('id') id: string,
    @Body() body: UpdateQuestionAudioClipDto,
  ) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.updateClip(id, body),
      ),
    };
  }

  @Post(':id/audio/preview')
  @ApiOperation({
    operationId: 'questionsPreviewMediaClip',
    summary:
      'Regenerate the selected audio or video candidate using current timing',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async previewMediaClip(
    @Param('id') id: string,
    @Body() body: PreviewQuestionMediaClipDto,
  ) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.previewClip(id, body),
      ),
    };
  }

  @Post(':id/audio/approve')
  @ApiOperation({
    operationId: 'questionsApproveAudio',
    summary: 'Approve a ready audio asset',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async approveAudio(@Param('id') id: string) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.approve(id),
      ),
    };
  }

  @Post(':id/audio/reject')
  @ApiOperation({
    operationId: 'questionsRejectAudio',
    summary: 'Reject an audio asset without deleting the question',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async rejectAudio(@Param('id') id: string) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.reject(id),
      ),
    };
  }

  @Post(':id/audio/upload')
  @UseInterceptors(questionAudioUploadInterceptor)
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['audio'],
      properties: {
        audio: {
          type: 'string',
          format: 'binary',
          description:
            'Audio file, or an MP4 file when the question type is video.',
        },
      },
    },
  })
  @ApiOperation({
    operationId: 'questionsUploadAudio',
    summary: 'Upload replacement question audio or video',
  })
  @ApiResponse({ status: 201, type: QuestionDetailResponseDto })
  async uploadAudio(
    @Param('id') id: string,
    @UploadedFile() audio?: UploadedAudioFile,
  ) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.upload(id, audio),
      ),
    };
  }

  @Delete(':id/audio/asset')
  @ApiOperation({
    operationId: 'questionsRemoveAudioAsset',
    summary: 'Remove the current audio or video asset',
  })
  @ApiResponse({ status: 200, type: QuestionDetailResponseDto })
  async removeAudioAsset(@Param('id') id: string) {
    return {
      data: QuestionResponseMapper.toResponse(
        await this.audioReview.removeAsset(id),
      ),
    };
  }

  @Get(':id')
  @ApiOperation({
    operationId: 'adminQuestionsGetById',
    summary: 'Admin: get a specific question including answer',
  })
  @ApiParam({
    name: 'id',
    example: ids.question,
    description: 'Question MongoDB ObjectId',
  })
  @ApiResponse({
    status: 200,
    description: 'Question retrieved successfully with answer.',
    type: QuestionDetailResponseDto,
    schema: {
      example: {
        statusCode: 200,
        data: questionExample,
      },
    },
  })
  async findById(@Param('id') id: string): Promise<{
    statusCode: number;
    data: Question;
  }> {
    const question = await this.queries.getAdmin(id);
    return {
      statusCode: HttpStatus.OK,
      data: QuestionResponseMapper.toResponse(question) as unknown as Question,
    };
  }
}
