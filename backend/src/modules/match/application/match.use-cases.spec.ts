import { LiveGameSessionRepository } from '../../live-game-sessions/domain/live-game-session.repository';
import { ScoringService } from '../../scoring/application/scoring.service';
import { ScoringRuleRegistry } from '../../scoring/application/scoring-rule.registry';
import { WorldChallengeSlotKey } from '../../world-content/domain/world-content.constants';
import { Match, MatchState } from '../domain/match';
import {
  MATCH_SLOT_ORDER,
  MatchSlotLaunchability,
  MatchStage,
} from '../domain/match.constants';
import { MatchRepository } from '../persistence/match.repository';
import { MatchConcurrencyError } from '../persistence/mongoose-match.repository';
import {
  ChallengeLauncherRegistry,
  MatchChallengeLauncher,
} from './challenge-launcher.registry';
import {
  MATCH_CHANGED_EVENT,
  MatchTransitionNotifier,
} from './match-transition.notifier';
import {
  CreateSessionJoinAccess,
  GetSessionJoinAccess,
} from '../../live-game-sessions/application/live-session-join-access.use-cases';
import { MatchChallengeReadinessService } from './match-challenge-readiness.service';
import { MatchContentPool } from './match-content-pool.service';
import { MatchContentSelector } from './match-content-selection.service';
import { MatchWorldCatalog } from './match-world.catalog';
import { MatchUseCases } from './match.use-cases';
import { UnifiedMatchSetupValidator } from './unified-match-setup.validator';
import { unifiedMatchBoardPolicy } from '../domain/unified-match-board.policy';
import { unifiedMatchSetupPolicy } from '../domain/unified-match-setup.policy';

const SESSION_ID = 'live-session-1';
const CONTROLLER = 'host-1';
const WORLD_ID = 'world-1';
const RYO = 'read-your-opponent';
const scoring = new ScoringService(new ScoringRuleRegistry());

const launcher = (): MatchChallengeLauncher => ({
  key: RYO,
  launchRequirements: { contentItemCount: 3, requiresPhones: false },
  supports: (input) => input.challengeTypeSlug === RYO,
  validateLaunch: () => Promise.resolve(),
  launch: () => Promise.resolve({ runtimeId: 'runtime-1' }),
  detectTerminal: () => false,
  buildCompletionSummary: () => ({ challengeKey: RYO, details: {} }),
});

describe('MatchUseCases transitions', () => {
  const now = new Date('2026-01-01T00:00:00.000Z');

  const setup = (options: { conflict?: boolean } = {}) => {
    let stored: MatchState | null = null;
    const published: Array<{
      event: string;
      payload: Record<string, unknown>;
    }> = [];
    const load = () => {
      if (!stored) return null;
      const state = structuredClone(stored);
      return Match.restore(state, scoring.restoreEvents(state.scoreEvents));
    };
    const matches: MatchRepository = {
      create: (match) => {
        stored = match.serialize();
        return Promise.resolve();
      },
      findById: () => Promise.resolve(load()),
      findActiveBySessionId: () => Promise.resolve(load()),
      findLatestBySessionId: () => Promise.resolve(load()),
      save: (match, expectedRevision) => {
        if (options.conflict)
          return Promise.reject(new MatchConcurrencyError());
        if (!stored || stored.revision !== expectedRevision) {
          return Promise.reject(new MatchConcurrencyError());
        }
        stored = match.serialize();
        return Promise.resolve();
      },
    };
    const sessions = {
      findById: () =>
        Promise.resolve({
          controllerActorId: CONTROLLER,
          serialize: () => ({
            status: 'active',
            teams: [
              { id: 'team-alpha', name: 'ألفا', active: true },
              { id: 'team-beta', name: 'بيتا', active: true },
            ],
          }),
        }),
    } as unknown as LiveGameSessionRepository;
    // A valid unified board needs all four positions in every occurrence.
    const worldSchedule = {
      worldName: 'كرة القدم',
      slotKeys: [...MATCH_SLOT_ORDER],
      slots: MATCH_SLOT_ORDER.map((slotKey) => ({
        slotKey,
        challengeTypeId: 'type-ryo',
        challengeTypeSlug: RYO,
        displayName: `slot ${slotKey}`,
      })),
    };
    const worlds = {
      scheduleFor: () => Promise.resolve(worldSchedule),
      launchabilityFor: () => MatchSlotLaunchability.LAUNCHABLE,
    } as unknown as MatchWorldCatalog;
    const launchers = new ChallengeLauncherRegistry();
    launchers.register(launcher());
    // World Content eligibility is proven in its own tests; these assert the
    // transitions, so the pool simply accepts what it is given.
    const contentPool = {
      assertOccurrencePool: () => Promise.resolve(),
    } as unknown as MatchContentPool;
    const useCases = new MatchUseCases(
      matches,
      sessions,
      { now: () => now },
      worlds,
      launchers,
      new MatchTransitionNotifier({
        publish: () => undefined,
        publishEvent: (_sessionId, event, payload) =>
          published.push({ event, payload }),
      }),
      contentPool,
      new UnifiedMatchSetupValidator(
        worlds,
        contentPool,
        unifiedMatchSetupPolicy,
        unifiedMatchBoardPolicy,
      ),
      // Server-side content selection has its own tests; these assert transitions.
      {
        select: () => Promise.resolve(['i1', 'i2', 'i3']),
      } as unknown as MatchContentSelector,
      new MatchChallengeReadinessService(),
      {
        execute: () => Promise.resolve(null),
      } as unknown as GetSessionJoinAccess,
      {
        execute: () => Promise.resolve({ joinCode: 'JOIN01' }),
      } as unknown as CreateSessionJoinAccess,
    );
    return { useCases, published, current: load };
  };

  const command = (commandId: string, expectedMatchRevision: number) => ({
    sessionId: SESSION_ID,
    actorId: CONTROLLER,
    commandId,
    expectedMatchRevision,
  });

  const reasons = (
    published: Array<{ payload: Record<string, unknown> }>,
  ): unknown[] => published.map((entry) => entry.payload.reason);

  /** Three occurrences of the same World, each with its own four Scopes. */
  const occurrences = () =>
    [0, 1, 2].map((index) => ({
      occurrenceIndex: index,
      worldId: WORLD_ID,
      selectedScopeIds: ['s1', 's2', 's3', 's4'].map(
        (scope) => `${scope}-${index}`,
      ),
    }));

  /** Creates a fully configured Match, the only way a Match is created now. */
  const createUnified = async (context: ReturnType<typeof setup>) => {
    const { useCases } = context;
    return useCases.createUnified({
      sessionId: SESSION_ID,
      actorId: CONTROLLER,
      occurrences: occurrences(),
    });
  };

  const launch = (
    context: ReturnType<typeof setup>,
    commandId: string,
    expectedMatchRevision: number,
    slotKey: WorldChallengeSlotKey = WorldChallengeSlotKey.SLOT_2,
  ) =>
    context.useCases.launchUnifiedChallenge({
      ...command(commandId, expectedMatchRevision),
      occurrenceIndex: 0,
      slotKey,
    });

  it('announces every authoritative Match change on one channel', async () => {
    const context = setup();

    const created = await createUnified(context);
    const launched = await launch(context, 'launch', created.revision);

    expect(launched.stage).toBe(MatchStage.CHALLENGE);
    expect(
      context.published.every((entry) => entry.event === MATCH_CHANGED_EVENT),
    ).toBe(true);
    expect(reasons(context.published)).toEqual([
      'created',
      'challenge-launched',
    ]);
  });

  it('carries the new authoritative revision and stage, and nothing private', async () => {
    const context = setup();
    const created = await createUnified(context);

    const last = context.published.at(-1)!;
    expect(last.payload).toEqual({
      matchId: created.id,
      matchRevision: created.revision,
      stage: MatchStage.BOARD,
      status: created.status,
      reason: 'created',
    });
    expect(JSON.stringify(context.published)).not.toContain('contentItem');
  });

  it('announces a launched challenge once it is bound and stored', async () => {
    const context = setup();
    const created = await createUnified(context);
    const before = context.published.length;

    const launched = await launch(context, 'launch', created.revision);

    expect(context.published).toHaveLength(before + 1);
    expect(context.published.at(-1)!.payload).toMatchObject({
      matchRevision: launched.revision,
      stage: MatchStage.CHALLENGE,
      reason: 'challenge-launched',
    });
  });

  it('says nothing when a command is a replay', async () => {
    const context = setup();
    const created = await createUnified(context);
    const launched = await launch(context, 'launch', created.revision);
    const before = context.published.length;

    const replay = await launch(context, 'launch', launched.revision);

    expect(replay.revision).toBe(launched.revision);
    expect(context.published).toHaveLength(before);
  });

  it('says nothing when the client acted on a stale revision', async () => {
    const context = setup();
    const created = await createUnified(context);
    await launch(context, 'launch', created.revision);
    const before = context.published.length;

    await expect(
      launch(context, 'launch-2', created.revision),
    ).rejects.toMatchObject({ response: { code: 'MATCH_STALE_REVISION' } });
    expect(context.published).toHaveLength(before);
  });

  it('says nothing when the save itself fails', async () => {
    const conflicted = setup({ conflict: true });
    await createUnified(conflicted);
    const before = conflicted.published.length;

    await expect(launch(conflicted, 'launch', 0)).rejects.toMatchObject({
      response: { code: 'MATCH_CONCURRENT_MODIFICATION' },
    });
    expect(conflicted.published).toHaveLength(before);
  });

  it('refuses a caller who is not the session controller', async () => {
    const context = setup();

    await expect(
      context.useCases.createUnified({
        sessionId: SESSION_ID,
        actorId: 'someone',
        occurrences: occurrences(),
      }),
    ).rejects.toMatchObject({ response: { code: 'MATCH_FORBIDDEN' } });
    expect(context.published).toEqual([]);
  });
});
