import { ServiceUnavailableException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { ROLES_KEY } from '../../../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../../common/guards/roles.guard';
import { UserRole } from '../../users/schemas/user.schema';
import { AuthoringContextUnavailableError } from '../application/authoring-context.service';
import type { EngineJobAdminService } from '../application/engine-job-admin.service';
import { ContentEngineJobsController } from './content-engine-jobs.controller';

describe('ContentEngineJobsController', () => {
  it('requires authenticated Admin access for every jobs and options route', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ContentEngineJobsController)).toEqual(
      [UserRole.ADMIN],
    );
    expect(
      Reflect.getMetadata(GUARDS_METADATA, ContentEngineJobsController),
    ).toEqual([JwtAuthGuard, RolesGuard]);
  });

  it('converts AuthoringContextUnavailableError into a structured ServiceUnavailableException (503) rather than unhandled 500', async () => {
    const jobsService = {
      options: jest
        .fn()
        .mockRejectedValue(
          new AuthoringContextUnavailableError('AUTHORING_MANIFEST_MISSING'),
        ),
    } as unknown as EngineJobAdminService;

    const controller = new ContentEngineJobsController(jobsService);

    await expect(controller.options()).rejects.toThrow(
      ServiceUnavailableException,
    );

    try {
      await controller.options();
    } catch (error) {
      expect(error).toBeInstanceOf(ServiceUnavailableException);
      const res = (error as ServiceUnavailableException).getResponse() as {
        code: string;
        message: string;
      };
      expect(res.code).toBe('AUTHORING_MANIFEST_MISSING');
      expect(res.message).toContain(
        'AUTHORING_BLOCKED — AUTHORING_MANIFEST_MISSING',
      );
    }
  });

  it('returns authoring options in a data envelope on success', async () => {
    const mockOptions = {
      worlds: [],
      mechanics: [],
      engine: { engineEnabled: false },
    };
    const jobsService = {
      options: jest.fn().mockResolvedValue(mockOptions),
    } as unknown as EngineJobAdminService;

    const controller = new ContentEngineJobsController(jobsService);
    const result = await controller.options();
    expect(result).toEqual({ data: mockOptions });
  });
});
