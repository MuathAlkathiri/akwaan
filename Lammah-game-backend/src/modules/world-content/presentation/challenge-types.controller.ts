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
import { ChallengeTypeService } from '../application/challenge-type.service';
import {
  CreateChallengeTypeDto,
  UpdateChallengeTypeDto,
} from '../dto/challenge-type.dto';
import {
  envelope,
  UploadedWorldContentAsset,
  worldContentAssetInterceptor,
} from './world-content.http';

/** Global mechanic definitions — deliberately not nested under a World. */
@ApiTags('World Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/challenge-types')
export class ChallengeTypesController {
  constructor(private readonly challengeTypes: ChallengeTypeService) {}

  @Get()
  list() {
    return envelope(this.challengeTypes.list());
  }

  /** Declared before ":challengeTypeId" so the literal path wins. */
  @Get('metadata')
  metadata() {
    return envelope(this.challengeTypes.metadata());
  }

  @Post()
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  create(
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(
      body,
      'challengeType',
      CreateChallengeTypeDto,
    );
    return envelope(this.challengeTypes.create(dto, asset));
  }

  @Get(':challengeTypeId')
  findOne(@Param('challengeTypeId') challengeTypeId: string) {
    return envelope(this.challengeTypes.findOne(challengeTypeId));
  }

  @Get(':challengeTypeId/readiness')
  readiness(@Param('challengeTypeId') challengeTypeId: string) {
    return envelope(this.challengeTypes.readiness(challengeTypeId));
  }

  @Patch(':challengeTypeId')
  @UseInterceptors(worldContentAssetInterceptor)
  @ApiConsumes('multipart/form-data', 'application/json')
  update(
    @Param('challengeTypeId') challengeTypeId: string,
    @Body() body: Record<string, unknown>,
    @UploadedFile() asset?: UploadedWorldContentAsset,
  ) {
    const dto = parseMultipartJsonBody(
      body,
      'challengeType',
      UpdateChallengeTypeDto,
    );
    return envelope(this.challengeTypes.update(challengeTypeId, dto, asset));
  }

  @Delete(':challengeTypeId')
  remove(@Param('challengeTypeId') challengeTypeId: string) {
    return envelope(this.challengeTypes.remove(challengeTypeId));
  }
}
