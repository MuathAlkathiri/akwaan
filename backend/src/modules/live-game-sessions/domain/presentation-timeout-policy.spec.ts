import {
  PRESENTATION_ACTIVATION_TIMEOUT_SECONDS,
  PRESENTATION_INITIAL_TIMEOUT_SECONDS,
  pendingDeadline,
} from '../application/gameplay-deadline.scheduler';
import { RYO_GAMEPLAY_PLUGIN } from './ryo-gameplay.plugin';
import { ODD_PIECE_GAMEPLAY_PLUGIN } from './odd-piece-gameplay.plugin';
import type { GameplayRuntimeState } from './gameplay-runtime';

/**
 * What a held barrier does when it runs out of time — and the fact that the
 * answer is the mechanic's, not the scheduler's.
 *
 * M3 treated every timeout as readiness: the server force-activated, which is
 * right for a board already in the snapshot and wrong for a question that *is*
 * a clip. These assert the split, and that the default side of it is exactly
 * what every fair-start mechanic did before the split existed.
 */
describe('presentation timeout policy', () => {
  const NOW = new Date('2026-01-01T00:00:00.000Z');

  const teamActionJson = JSON.stringify({
    rotations: [
      { teamId: 'a', order: ['p'], cursor: 0 },
      { teamId: 'b', order: ['q'], cursor: 0 },
    ],
    assignments: [
      { teamId: 'a', participantId: 'p', action: 'ryo.answer', sequence: 1 },
      { teamId: 'b', participantId: 'q', action: 'ryo.decision', sequence: 2 },
    ],
    nextSequence: 3,
  });

  const ryoRuntime = (media: unknown, currentItemIndex = 0) => ({
    teamActionJson,
    itemsJson: JSON.stringify(
      [0, 1, 2].map((index) => ({
        id: `i${index}`,
        prompt: 'س',
        correctOptionId: 'x',
        media: index === currentItemIndex ? media : null,
      })),
    ),
    teamIdsJson: JSON.stringify(['a', 'b']),
    startingTeamId: 'a',
    currentItemIndex,
    phase: 'collecting',
    challengeId: 'c',
    worldId: 'w',
    slotKey: 's',
  });

  describe('RYO decides per item', () => {
    it('FAILS a held audio item rather than starting a silent question', () => {
      // Ten seconds of blind window on a clip nobody can hear is not a harder
      // question — both teams are scored on it, and that cannot be undone.
      expect(
        RYO_GAMEPLAY_PLUGIN.presentationTimeoutPolicy!({
          runtimeState: ryoRuntime({ type: 'audio', url: 'https://cdn/x.mp3' }),
          roundState: {},
        }),
      ).toBe('fail');
    });

    it('ACTIVATES a held text item — a late screen costs only its own loading', () => {
      expect(
        RYO_GAMEPLAY_PLUGIN.presentationTimeoutPolicy!({
          runtimeState: ryoRuntime(null),
          roundState: {},
        }),
      ).toBe('activate');
    });

    it('ACTIVATES an image item: the picture is in the snapshot that opens it', () => {
      expect(
        RYO_GAMEPLAY_PLUGIN.presentationTimeoutPolicy!({
          runtimeState: ryoRuntime({ type: 'image', url: 'https://cdn/x.png' }),
          roundState: {},
        }),
      ).toBe('activate');
    });

    it('decides for the item actually held, not always the first', () => {
      expect(
        RYO_GAMEPLAY_PLUGIN.presentationTimeoutPolicy!({
          runtimeState: ryoRuntime(
            { type: 'audio', url: 'https://cdn/x.mp3' },
            2,
          ),
          roundState: {},
        }),
      ).toBe('fail');
    });

    it('falls back to ACTIVATE on an unreadable runtime rather than stranding it', () => {
      expect(
        RYO_GAMEPLAY_PLUGIN.presentationTimeoutPolicy!({
          runtimeState: { itemsJson: 'not json' },
          roundState: {},
        }),
      ).toBe('activate');
    });
  });

  describe('other mechanics keep the pre-existing behaviour', () => {
    it('Odd Piece declares no policy at all, so the scheduler activates', () => {
      // The default is what every fair-start mechanic did before failure
      // existed. A mechanic that never opts in is untouched by this mechanism.
      expect(
        ODD_PIECE_GAMEPLAY_PLUGIN.presentationTimeoutPolicy,
      ).toBeUndefined();
    });
  });

  describe('a failed barrier stops being re-armed', () => {
    const base = (
      overrides: Partial<GameplayRuntimeState> = {},
    ): GameplayRuntimeState =>
      ({
        id: 'runtime-1',
        sessionId: 'session-1',
        modeKey: 'read-your-opponent',
        modeVersion: 1,
        status: 'round-active',
        revision: 3,
        runtimeState: {},
        completedRounds: [],
        processedCommandIds: [],
        transitions: [],
        events: [],
        createdAt: NOW,
        startedAt: NOW,
        activeRound: {
          id: 'round-1',
          sequence: 1,
          status: 'active',
          startedAt: NOW,
          modeState: {},
          transitionRevision: 3,
        },
        ...overrides,
      }) as unknown as GameplayRuntimeState;

    it('arms the bounded INITIAL barrier while a multi-surface mechanic waits', () => {
      // The gap M3 left open: only the recurring checkpoint was watched, so a
      // shared screen that never arrived froze the first item exactly as before.
      const pending = pendingDeadline(base(), undefined, undefined, {
        multiSurface: true,
      });
      expect(pending?.kind).toBe('presentation-activation');
      expect(Date.parse(pending!.deadlineAt)).toBe(
        NOW.getTime() + PRESENTATION_INITIAL_TIMEOUT_SECONDS * 1000,
      );
    });

    it('arms nothing once a failure is recorded — only a host retry restarts it', () => {
      // Re-arming against a standing failure would re-fire the same timeout
      // against a clip that is still missing, for ever.
      expect(
        pendingDeadline(
          base({
            presentationFailure: {
              reason: 'media-unavailable',
              capability: 'shared',
              at: NOW.toISOString(),
            },
          }),
          undefined,
          undefined,
          { multiSurface: true },
        ),
      ).toBeUndefined();
    });

    it('arms nothing for a single-surface mechanic that never opted in', () => {
      // No declaration and no required surfaces: this whole mechanism is
      // invisible to it.
      expect(
        pendingDeadline(base(), undefined, undefined, { multiSurface: false }),
      ).toBeUndefined();
    });

    it('never takes a running gameplay deadline away from a legacy runtime', () => {
      // A document from before activation was persisted looks like "awaiting"
      // while actually playing. Arming a barrier over it would remove the
      // deadline it still needs.
      const running = base({
        activeRound: {
          id: 'round-1',
          sequence: 1,
          status: 'active',
          startedAt: NOW,
          modeState: {},
          transitionRevision: 3,
          interaction: {
            id: 'interaction-1',
            status: 'open',
            revision: 2,
            submissions: [],
            processedRequestIds: [],
            prompt: {
              id: 'prompt-1',
              deadlineAt: new Date(NOW.getTime() + 25_000).toISOString(),
            },
          },
        },
      } as unknown as Partial<GameplayRuntimeState>);
      const pending = pendingDeadline(running, undefined, undefined, {
        multiSurface: true,
      });
      expect(pending?.kind).toBe('interaction');
    });

    it('still bounds a prepared RECURRING checkpoint from preparedAt', () => {
      const preparedAt = new Date(NOW.getTime() + 60_000);
      const pending = pendingDeadline(
        base({
          presentationActivatedAt: NOW.toISOString(),
          currentPresentation: {
            generation: 2,
            status: 'prepared',
            preparedAt: preparedAt.toISOString(),
            readiness: [],
          },
        }),
        undefined,
        undefined,
        { multiSurface: true },
      );
      expect(pending?.kind).toBe('presentation-activation');
      expect(Date.parse(pending!.deadlineAt)).toBe(
        preparedAt.getTime() + PRESENTATION_ACTIVATION_TIMEOUT_SECONDS * 1000,
      );
    });
  });
});
