import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../users/schemas/user.schema';
import { ContentEngineReviewController } from './content-engine-review.controller';

describe('ContentEngineReviewController authorization', () => {
  it('requires authenticated Admin access for every review route', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, ContentEngineReviewController),
    ).toEqual([UserRole.ADMIN]);
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ContentEngineReviewController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
  });
});
