import { Body, Controller, Get, Param, Post, Put, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../users/schemas/user.schema';
import { MechanicTutorialService } from '../application/mechanic-tutorial.service';
import { TutorialScenarioDto } from '../dto/mechanic-tutorial.dto';
import { envelope } from './world-content.http';

/**
 * Authoring a mechanic's tutorial. Admin only, like every other `/admin` surface.
 *
 * Keyed by the mechanic's canonical slug rather than its Mongo id, because the
 * slug is the identifier the rest of the system — gameplay, the Preflight and
 * the authoring taxonomy — already agrees on.
 */
@ApiTags('World Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('admin/mechanics/:mechanicKey/tutorial')
export class AdminMechanicTutorialsController {
  constructor(private readonly tutorials: MechanicTutorialService) {}

  /** Draft and published together — an editor needs to see both. */
  @Get()
  get(@Param('mechanicKey') mechanicKey: string) {
    return envelope(this.tutorials.getForAdmin(mechanicKey));
  }

  @Put('draft')
  saveDraft(
    @Param('mechanicKey') mechanicKey: string,
    @Body() dto: TutorialScenarioDto,
  ) {
    return envelope(this.tutorials.saveDraft(mechanicKey, dto));
  }

  /** Dry-run the publish checks, including the competitive-overlap guard. */
  @Post('validate')
  validate(
    @Param('mechanicKey') mechanicKey: string,
    @Body() dto: TutorialScenarioDto,
  ) {
    return envelope(this.tutorials.validate(mechanicKey, dto));
  }

  @Post('publish')
  publish(@Param('mechanicKey') mechanicKey: string) {
    return envelope(this.tutorials.publish(mechanicKey));
  }
}

/**
 * The read surface hosts actually use.
 *
 * Separate controller, not a role-checked branch inside the admin one: the
 * public path calls `getPublished`, which has no access to the draft field at
 * all. Draft content cannot leak here through a forgotten condition, because
 * there is no condition — only a different method.
 *
 * Public and read-only, matching `PlayerWorldsController`: a tutorial is
 * approved teaching material, and the Preflight that shows it is already behind
 * the identity gate for everything that matters.
 */
@ApiTags('Player Catalog')
@Controller('mechanics/:mechanicKey/tutorial')
export class MechanicTutorialsController {
  constructor(private readonly tutorials: MechanicTutorialService) {}

  @Get()
  published(@Param('mechanicKey') mechanicKey: string) {
    return envelope(this.tutorials.getPublished(mechanicKey));
  }
}
