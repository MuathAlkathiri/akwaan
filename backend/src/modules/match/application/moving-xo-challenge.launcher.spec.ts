import { GameplayRuntimeState } from '../../live-game-sessions/domain/gameplay-runtime';
import { ConfigService } from '@nestjs/config';
import { MOVING_XO_MODE_KEY } from '../../live-game-sessions/domain/moving-xo-board';
import { ChallengeLauncherRegistry } from './challenge-launcher.registry';
import { MovingXoChallengeLauncher } from './moving-xo-challenge.launcher';

/**
 * The Match's side of an on-demand mechanic.
 *
 * Three things only this layer can get wrong: asking for a deck a mechanic does
 * not have, burning a puzzle before anyone saw it, and inventing a winner for a
 * challenge that did not produce one.
 */

const launcher = (
  started: Array<Record<string, unknown>> = [],
  minimumUsableItems?: string,
): MovingXoChallengeLauncher =>
  new MovingXoChallengeLauncher(
    new ChallengeLauncherRegistry(),
    {
      execute: (input: Record<string, unknown>) => {
        started.push(input);
        return Promise.resolve(undefined);
      },
    } as never,
    {
      findBySessionId: () => Promise.resolve({ id: 'runtime-1' }),
    } as never,
    new ConfigService(
      minimumUsableItems
        ? { MOVING_XO_MIN_USABLE_ITEMS: minimumUsableItems }
        : {},
    ),
  );

const runtimeWith = (
  runtimeState: Record<string, unknown>,
  presentation: {
    activatedAt?: string | null;
    currentPresentation?: { status: string };
  } = {},
): GameplayRuntimeState =>
  ({
    id: 'runtime-1',
    runtimeState,
    activeRound: { id: 'round-1', modeState: {} },
    // Activated by default: the gate itself is exercised explicitly below.
    presentationActivatedAt:
      presentation.activatedAt === undefined
        ? '2026-10-07T00:00:00.000Z'
        : presentation.activatedAt,
    ...(presentation.currentPresentation
      ? { currentPresentation: presentation.currentPresentation }
      : {}),
  }) as unknown as GameplayRuntimeState;

const running = {
  phase: 'answering',
  presentedContentItemIds: ['item-1', 'item-2'],
  outcome: null,
};

describe('MovingXoChallengeLauncher', () => {
  it('declares that it plays no content at launch', () => {
    // Not an omission: a launch-time deck would reserve content the game may
    // never reach and destroy the on-demand model entirely.
    expect(launcher().launchRequirements.contentItemCount).toBe(0);
    expect(launcher().launchRequirements.minimumUsableContentItems).toBe(24);
    expect(launcher().launchRequirements.requiresPhones).toBe(true);
  });

  it('allows the inventory floor to be configured without creating a deck', () => {
    const requirements = launcher([], '12').launchRequirements;
    expect(requirements.contentItemCount).toBe(0);
    expect(requirements.minimumUsableContentItems).toBe(12);
  });

  it('refuses a launch that tries to hand it a deck', async () => {
    expect(() =>
      launcher().validateLaunch({ contentItemIds: ['a'] } as never),
    ).toThrow(/accepts none at launch/);
    await expect(
      launcher().validateLaunch({
        contentItemIds: [],
        startingTeamId: 'team-a',
      } as never),
    ).resolves.toBeUndefined();
  });

  it('carries the Match turn owner through as the starting team', async () => {
    const started: Array<Record<string, unknown>> = [];
    await launcher(started).launch({
      sessionId: 'session-1',
      actorId: 'account-1',
      worldId: 'world-1',
      slotKey: 'slot_1',
      contentItemIds: [],
      startingTeamId: 'team-b',
    } as never);

    // §23.11: whichever team already owns the canonical Match turn starts. No
    // coin flip is performed here and none is invented downstream.
    expect(started).toEqual([
      {
        sessionId: 'session-1',
        actorId: 'account-1',
        worldId: 'world-1',
        slotKey: 'slot_1',
        startingTeamId: 'team-b',
      },
    ]);
  });

  it('refuses to launch without the canonical Match turn owner', () => {
    expect(() =>
      launcher().validateLaunch({ contentItemIds: [] } as never),
    ).toThrow(/canonical Match turn owner/);
  });

  it('answers to the mechanic by key and by runtime', () => {
    expect(launcher().key).toBe(MOVING_XO_MODE_KEY);
    expect(launcher().supports({ challengeTypeSlug: MOVING_XO_MODE_KEY })).toBe(
      true,
    );
    expect(
      launcher().supports({
        challengeTypeSlug: 'bomb',
        runtimeKey: MOVING_XO_MODE_KEY,
      }),
    ).toBe(true);
    expect(launcher().supports({ challengeTypeSlug: 'bomb' })).toBe(false);
  });

  it('spends only the puzzles a surface has actually shown', () => {
    expect(
      launcher().presentedContentItemIds({
        runtime: runtimeWith(running),
        orderedContentItemIds: [],
      }),
    ).toEqual(['item-1', 'item-2']);
  });

  it('spends nothing while the newest puzzle is still being prepared', () => {
    // Recurring Fair-Start: the puzzle is drawn and committed but hidden, so
    // nobody has seen it and it must not be burned.
    expect(
      launcher().presentedContentItemIds({
        runtime: runtimeWith(running, {
          currentPresentation: { status: 'prepared' },
        }),
        orderedContentItemIds: [],
      }),
    ).toEqual([]);
  });

  it('spends nothing before the one-time activation', () => {
    // The first puzzle is drawn inside the launch, before any surface has
    // acknowledged anything. An abandoned challenge must cost the account
    // nothing, so nothing is spent until a surface is actually showing it.
    expect(
      launcher().presentedContentItemIds({
        runtime: runtimeWith(running, { activatedAt: null }),
        orderedContentItemIds: [],
      }),
    ).toEqual([]);
  });

  it('consults no Match binding, because an on-demand mechanic has none', () => {
    expect(
      launcher().presentedContentItemIds({
        runtime: runtimeWith({
          phase: 'answering',
          presentedContentItemIds: ['item-7'],
        }),
        // A binding that disagreed could not override the mechanic's own record.
        orderedContentItemIds: ['item-999'],
      }),
    ).toEqual(['item-7']);
  });

  it('is not terminal while the challenge is still running', () => {
    expect(launcher().detectTerminal(runtimeWith(running))).toBe(false);
  });

  it('reports a win verbatim', () => {
    const runtime = runtimeWith({
      ...running,
      phase: 'completed',
      outcome: 'win',
      winningTeamId: 'team-a',
      successfulMoveCount: 7,
    });
    expect(launcher().detectTerminal(runtime)).toBe(true);
    expect(launcher().buildCompletionSummary(runtime)).toEqual({
      challengeKey: MOVING_XO_MODE_KEY,
      winnerTeamId: 'team-a',
      details: {
        endedBy: 'win',
        successfulMoveCount: 7,
        questionsPresented: 2,
        decisivePhase: false,
      },
    });
  });

  it('reports a draw and a depleted catalog with no winner at all', () => {
    for (const outcome of ['draw', 'content-exhausted']) {
      const runtime = runtimeWith({
        ...running,
        phase: 'completed',
        outcome,
        winningTeamId: null,
        decisivePhase: outcome === 'draw',
      });
      expect(launcher().detectTerminal(runtime)).toBe(true);
      const summary = launcher().buildCompletionSummary(runtime);
      // Null, never the team that happened to be holding the turn.
      expect(summary.winnerTeamId).toBeNull();
      expect(summary.details.endedBy).toBe(outcome);
    }
  });

  it('reports no mechanic margin, because Moving XO produces none', () => {
    const runtime = runtimeWith({
      ...running,
      phase: 'completed',
      outcome: 'win',
      winningTeamId: 'team-a',
    });
    // Board progress is not a score and must never be summed into the Match
    // scoreboard, so nothing is offered as one.
    expect(launcher().buildCompletionSummary(runtime)).not.toHaveProperty(
      'mechanicSummary',
    );
  });
});
