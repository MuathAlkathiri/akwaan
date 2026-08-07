import { CORE_ROUND_RUNTIME_PLUGIN } from './gameplay-mode.plugin';
import { RYO_GAMEPLAY_PLUGIN } from './ryo-gameplay.plugin';
import { TOP5_KEEP_OR_GIVE_PLUGIN } from './top5-keep-or-give.plugin';
import type { GameplayModePlugin } from './gameplay-mode.plugin';
import type { InteractionActorProjection } from './gameplay-interaction.plugin';

/**
 * Some mechanics owe each participant a *different* view of the same runtime —
 * private information one teammate holds and another must not read. That needs an
 * actor, which `projectRuntimeState` does not receive.
 *
 * The hook is optional and additive: a mechanic that shows everyone the same
 * thing keeps using `projectRuntimeState`, and these tests pin that down so the
 * existing mechanics cannot start leaking through a new code path.
 */
describe('actor-aware runtime projection', () => {
  const actor = (
    overrides: Partial<InteractionActorProjection> = {},
  ): InteractionActorProjection => ({
    controller: false,
    participantId: 'participant-1',
    teamId: 'team-alpha',
    ...overrides,
  });

  const withoutHook: GameplayModePlugin[] = [
    CORE_ROUND_RUNTIME_PLUGIN,
    RYO_GAMEPLAY_PLUGIN,
    TOP5_KEEP_OR_GIVE_PLUGIN,
  ];

  it('leaves every existing mechanic on the shared projection', () => {
    for (const plugin of withoutHook) {
      expect(plugin.projectRuntimeStateForActor).toBeUndefined();
    }
  });

  it('keeps RYO projecting the same public state for every actor', () => {
    const state = RYO_GAMEPLAY_PLUGIN.createInitialRuntimeState({
      sessionId: 'session-1',
      runtimeId: 'runtime-1',
      initialState: {
        challengeId: 'challenge-1',
        worldId: 'world-1',
        slotKey: 'slot_2',
        itemsJson: JSON.stringify([{ id: 'i1' }, { id: 'i2' }, { id: 'i3' }]),
        teamIdsJson: JSON.stringify(['team-alpha', 'team-beta']),
        currentItemIndex: 0,
        startingTeamId: 'team-alpha',
        phase: 'intro',
        scoreEventsJson: '[]',
        resultsJson: '[]',
        teamActionJson: JSON.stringify({
          rotations: [
            { teamId: 'team-alpha', order: ['participant-1'], cursor: 0 },
            { teamId: 'team-beta', order: ['participant-2'], cursor: 0 },
          ],
          assignments: [],
          nextSequence: 1,
        }),
      },
      now: new Date('2026-01-01T00:00:00.000Z'),
    });

    const shared = RYO_GAMEPLAY_PLUGIN.projectRuntimeState(state);
    // The hook is absent, so a caller falls back to the shared projection and
    // every actor sees exactly what they saw before.
    expect(
      RYO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor?.(state, actor()) ??
        shared,
    ).toEqual(shared);
    expect(
      RYO_GAMEPLAY_PLUGIN.projectRuntimeStateForActor?.(
        state,
        actor({
          controller: true,
          participantId: undefined,
          teamId: undefined,
        }),
      ) ?? shared,
    ).toEqual(shared);
    // Nothing private travels in the shared projection either.
    expect(shared.itemsJson).toBeUndefined();
    expect(shared.teamIdsJson).toBeUndefined();
  });

  it('lets a mechanic hand two participants different private slices', () => {
    // A minimal stand-in for the contract: the plugin owns the split, the
    // caller only supplies the actor.
    const plugin: Pick<GameplayModePlugin, 'projectRuntimeStateForActor'> = {
      projectRuntimeStateForActor: (state, projectionActor) => ({
        publicPrompt: state.publicPrompt,
        mine:
          projectionActor.participantId === 'participant-1'
            ? state.segmentA
            : state.segmentB,
      }),
    };
    const state = {
      publicPrompt: 'من هو اللاعب؟',
      segmentA: 'لعب في نادٍ إسباني',
      segmentB: 'اعتزل عام 2019',
    };

    const first = plugin.projectRuntimeStateForActor!(state, actor());
    const second = plugin.projectRuntimeStateForActor!(
      state,
      actor({ participantId: 'participant-2' }),
    );

    expect(first).toEqual({
      publicPrompt: 'من هو اللاعب؟',
      mine: 'لعب في نادٍ إسباني',
    });
    expect(second).toEqual({
      publicPrompt: 'من هو اللاعب؟',
      mine: 'اعتزل عام 2019',
    });
    // Neither participant can read the other's segment.
    expect(JSON.stringify(first)).not.toContain('اعتزل');
    expect(JSON.stringify(second)).not.toContain('إسباني');
  });
});
