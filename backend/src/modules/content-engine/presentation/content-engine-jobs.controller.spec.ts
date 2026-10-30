import {
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
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

  describe('Slice 3D API Contract & Authorization Audit', () => {
    it('enforces actor attribution and rejects missing or unauthenticated user on submit', async () => {
      const jobsService = {
        submit: jest.fn(),
      } as unknown as EngineJobAdminService;
      const controller = new ContentEngineJobsController(jobsService);

      await expect(
        controller.submit(undefined as never, {
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
          targetCount: 3,
          planDigest: 'digest-123',
        }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        controller.submit({ id: '   ' } as never, {
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
          targetCount: 3,
          planDigest: 'digest-123',
        }),
      ).rejects.toThrow(UnauthorizedException);

      expect(jobsService.submit).not.toHaveBeenCalled();
    });

    it('returns preflight response in data envelope containing generationPlan preview metadata and excluding secrets', async () => {
      const mockPreflight = {
        resolvable: true,
        submissionReady: true,
        planDigest: 'sha256-abcdef1234567890',
        pricingConfigured: true,
        liveProviderEnabled: false,
        engineEnabled: true,
        budget: {
          periodKey: '2026-10',
          capMicros: 1000000,
          spentMicros: 0,
          reservedMicros: 0,
          availableMicros: 1000000,
        },
        generationPlan: {
          worldKey: 'puzzles',
          scopeKey: 'wordplay-letters',
          mechanicKey: 'read-your-opponent',
          count: 3,
          difficulty: 'mixed',
          difficultyQuotas: { easy: 1, medium: 2 },
          archetypes: [],
          decisionLoopGuidelines: [],
          antiPatterns: [],
          correctnessRequirements: [],
          mediaIntent: {
            gameplayMediaRequired: false,
            displayArtworkPolicy: 'none',
            allowedAspectRatios: [],
          },
          digest: 'sha256-digest-plan-999',
          slots: [
            {
              slotIndex: 0,
              familyKey: 'letter-count',
              familyNameAr: 'عد الأحرف',
              mode: 'exploitation' as const,
              difficulty: 'easy' as const,
              cognitiveTask: 'عد الحروف',
              creativeAngle: 'كلمات سهلة',
              mechanicFit: 'natural' as const,
              selectionReason: 'تغطية أولية',
            },
          ],
          diversityMetrics: {
            exploitationCount: 1,
            explorationCount: 0,
            distinctFamiliesCount: 1,
            diagnostics: [],
          },
        },
      };

      const jobsService = {
        preflight: jest.fn().mockResolvedValue(mockPreflight),
      } as unknown as EngineJobAdminService;

      const controller = new ContentEngineJobsController(jobsService);
      const res = await controller.preflight({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        targetCount: 3,
      });

      expect(res).toEqual({ data: mockPreflight });
      expect(jobsService.preflight).toHaveBeenCalledWith({
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        targetCount: 3,
      });

      // Verify no sensitive keys are present
      const preflightData = res.data as Record<string, unknown>;
      expect(preflightData.apiKey).toBeUndefined();
      expect(preflightData.secret).toBeUndefined();
      expect(preflightData.systemPrompt).toBeUndefined();
    });

    it('returns status response with persisted pinnedPlan in data envelope', async () => {
      const mockStatus = {
        jobId: 'job-pinned-100',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        status: 'awaiting_review',
        pipelineStage: 'review',
        attempts: 1,
        pinnedPlan: {
          digest: 'sha256-pinned-plan-digest',
          slots: [
            {
              slotIndex: 0,
              familyKey: 'letter-count',
              familyNameAr: 'عد الأحرف',
              mode: 'exploitation',
            },
          ],
        },
      };

      const jobsService = {
        status: jest.fn().mockResolvedValue(mockStatus),
      } as unknown as EngineJobAdminService;

      const controller = new ContentEngineJobsController(jobsService);
      const res = await controller.status('job-pinned-100');

      expect(res).toEqual({ data: mockStatus });
      expect(res.data.pinnedPlan).toEqual(mockStatus.pinnedPlan);
    });

    it('returns pinnedPlan: null for legacy job without pinned plan and throws NotFoundException for missing job', async () => {
      const mockLegacyStatus = {
        jobId: 'job-legacy-1',
        worldKey: 'puzzles',
        scopeKey: 'wordplay-letters',
        mechanicKey: 'read-your-opponent',
        status: 'completed',
        pipelineStage: 'completed',
        attempts: 1,
        pinnedPlan: null,
      };

      const jobsService = {
        status: jest.fn().mockImplementation(async (id: string) => {
          if (id === 'job-legacy-1') return mockLegacyStatus;
          return null;
        }),
      } as unknown as EngineJobAdminService;

      const controller = new ContentEngineJobsController(jobsService);
      const res = await controller.status('job-legacy-1');

      expect(res.data.pinnedPlan).toBeNull();

      await expect(controller.status('non-existent-job')).rejects.toThrow(
        NotFoundException,
      );
    });
  });
});
