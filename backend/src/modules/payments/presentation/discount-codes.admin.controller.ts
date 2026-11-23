import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { CurrentUser } from '../../../common/decorators/current-user.decorator';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { AuthenticatedUser } from '../../auth/auth.types';
import { UserRole } from '../../users/schemas/user.schema';
import { TOKEN_PACK_IDS } from '../domain/token-pack';
import { DiscountCodeRepository } from '../persistence/discount-code.repository';

export class CreateDiscountCodeDto {
  @IsString()
  @Length(3, 32)
  @Matches(/^[A-Za-z0-9_-]+$/, {
    message: 'code may contain letters, digits, dash and underscore only',
  })
  code!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  percentOff?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  amountOffHalalas?: number;

  @IsOptional()
  @IsArray()
  @IsIn(TOKEN_PACK_IDS, { each: true })
  packIds?: string[];

  /** Left out means unlimited. */
  @IsOptional()
  @IsInt()
  @Min(1)
  maxRedemptions?: number;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  note?: string;
}

export class SetDiscountCodeActiveDto {
  @IsBoolean()
  active!: boolean;
}

/**
 * Making and retiring discount codes.
 *
 * Admin only, and separate from the shop controller on purpose: everything
 * here writes the thing the shop merely reads, and the two have no reason to
 * share a guard, a path or a reviewer's attention.
 */
@ApiTags('Payments')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/discount-codes')
export class DiscountCodesAdminController {
  constructor(private readonly codes: DiscountCodeRepository) {}

  @Get()
  @ApiOperation({ summary: 'Every code, newest first' })
  list() {
    return this.codes.list();
  }

  @Post()
  @ApiOperation({ summary: 'Create a code' })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() body: CreateDiscountCodeDto,
  ) {
    // Exactly one kind of discount. A code carrying both a percentage and an
    // amount would have to apply them in some order, and the order would be a
    // surprise to whoever did not pick it.
    const hasPercent = body.percentOff !== undefined;
    const hasAmount = body.amountOffHalalas !== undefined;
    if (hasPercent === hasAmount) {
      throw new BadRequestException(
        'Give either percentOff or amountOffHalalas, not both and not neither',
      );
    }

    const existing = await this.codes.findByCode(body.code);
    if (existing) {
      throw new BadRequestException(`Code already exists: ${body.code}`);
    }

    return this.codes.create({
      code: body.code,
      percentOff: body.percentOff,
      amountOffHalalas: body.amountOffHalalas,
      packIds: body.packIds,
      maxRedemptions: body.maxRedemptions ?? null,
      expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      createdBy: user.id,
      note: body.note,
    });
  }

  @Patch(':code/active')
  @ApiOperation({ summary: 'Turn a code on or off' })
  async setActive(
    @Param('code') code: string,
    @Body() body: SetDiscountCodeActiveDto,
  ) {
    // Switched off rather than deleted. The intents that used it name it, and
    // a code that vanishes takes the explanation of those sales with it.
    const found = await this.codes.setActive(code, body.active);
    if (!found) {
      throw new NotFoundException(`No such code: ${code}`);
    }
    return { code: code.toUpperCase(), active: body.active };
  }
}
