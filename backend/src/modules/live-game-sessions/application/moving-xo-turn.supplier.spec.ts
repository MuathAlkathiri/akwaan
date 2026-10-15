import { GameplayRuntimeState } from '../domain/gameplay-runtime';
import { MOVING_XO_COMMANDS } from '../domain/moving-xo-gameplay.plugin';
import { MOVING_XO_MODE_KEY } from '../domain/moving-xo-board';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import {
  MovingXoDrawOutcome,
  MovingXoQuestionSource,
  MovingXoQuestionSourceRegistry,
} from './moving-xo-question-source.registry';
import { MovingXoTurnSupplier } from './moving-xo-turn.supplier';

/**
 * What the supplier does with an answer it cannot act on.
 *
 * The integration suite proves the happy path against real Mongo. These are the
 * cases that are easy to get subtly wrong and expensive to notice: an outcome the
 * source could not determine must never be mistaken for a depleted catalog, a
 * runtime that is still being assembled must not be commanded at all, and a draw
 * that returns after its turn resolved must not open a puzzle for whatever turn
 * is current now. Each of those, uncaught, either ends a challenge with a full
 * catalog behind it or shows one team the other team's puzzle.
 */

const QUESTION = {
  contentItemId: 'item-2',
  scopeId: 'scope-1',
  answerMode: 'match' as const,
  prompt: { ar: 'كم مثلثًا؟' },
  acceptedAnswers: ['٧'],
};

const runtime = (
  overrides: {
    phase?: string;
    roundStatus?: string;
    modeKey?: string;
    presented?: string[];
  } = {},
): GameplayRuntimeState =>
  ({
    id: 'runtime-1',
    modeKey: overrides.modeKey ?? MOVING_XO_MODE_KEY,
    modeVersion: 1,
    revision: 7,
    runtimeState: {
      phase: overrides.phase ?? 'question-pending',
      presentedContentItemIds: overrides.presented ?? ['item-1'],
    },
    activeRound: {
      id: 'round-1',
      status: overrides.roundStatus ?? 'active',
      modeState: { phase: overrides.phase ?? 'question-pending' },
    },
  }) as unknown as GameplayRuntimeState;

describe('MovingXoTurnSupplier', () => {
  const setup = (
    source: Partial<MovingXoQuestionSource>,
    state: GameplayRuntimeState = runtime(),
    /** State as re-read at send time, when it differs from what was notified. */
    atSendTime: GameplayRuntimeState = state,
  ) => {
    const sent: Array<{ commandType: string; payload: unknown }> = [];
    const drawn: Array<{ turnNumber: number; presented: readonly string[] }> =
      [];
    const sources = new MovingXoQuestionSourceRegistry();
    sources.register({
      name: 'test-source',
      draw: (request) => {
        drawn.push({
          turnNumber: request.turnNumber,
          presented: request.presentedContentItemIds,
        });
        return Promise.resolve({ kind: 'unknown' } as MovingXoDrawOutcome);
      },
      ...source,
    });
    const supplier = new MovingXoTurnSupplier(
      new GameplayObserverRegistry(),
      sources,
      {
        findById: () =>
          Promise.resolve({ revision: 3, controllerActorId: 'account-1' }),
      } as never,
      {
        findBySessionId: () =>
          Promise.resolve({
            revision: 7,
            serialize: () => atSendTime,
          }),
      } as never,
      {
        get: () => ({
          execute: (command: { commandType: string; payload: unknown }) => {
            sent.push({
              commandType: command.commandType,
              payload: command.payload,
            });
            return Promise.resolve(undefined);
          },
        }),
      } as never,
    );
    return { supplier, sent, drawn, state };
  };

  const converge = (
    supplier: MovingXoTurnSupplier,
    state: GameplayRuntimeState,
  ) =>
    supplier.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: state.id,
      runtimeState: state,
    });

  it('opens the puzzle a source drew', async () => {
    const { supplier, sent, state } = setup({
      draw: () => Promise.resolve({ kind: 'question', question: QUESTION }),
    });

    await converge(supplier, state);

    expect(sent).toEqual([
      {
        commandType: MOVING_XO_COMMANDS.openQuestion,
        payload: { questionJson: JSON.stringify(QUESTION) },
      },
    ]);
  });

  it('asks for exactly one puzzle, for the turn that owes it', async () => {
    const requests: Array<{
      turnNumber: number;
      presented: readonly string[];
    }> = [];
    const { supplier, state } = setup(
      {
        draw: (request) => {
          requests.push({
            turnNumber: request.turnNumber,
            presented: request.presentedContentItemIds,
          });
          return Promise.resolve({
            kind: 'question',
            question: QUESTION,
          } as MovingXoDrawOutcome);
        },
      },
      runtime({ presented: ['item-a', 'item-b'] }),
    );

    await converge(supplier, state);

    const drawn = requests;

    // No lookahead and no deck: one draw, for turn three, told exactly what this
    // challenge has already shown.
    expect(drawn).toEqual([{ turnNumber: 3, presented: ['item-a', 'item-b'] }]);
  });

  it('leaves the turn owed when the source cannot answer yet', async () => {
    const { supplier, sent, state } = setup({
      draw: () => Promise.resolve({ kind: 'unknown' }),
    });

    const result = await converge(supplier, state);

    // The Match binding is written after the runtime starts, so the first
    // convergence of every launch lands here. Reading it as depletion would end a
    // challenge with a full catalog behind it.
    expect(result).toEqual({ outcome: 'source-unknown' });
    expect(sent).toEqual([]);
  });

  it('ends the challenge only when the source says nothing is left', async () => {
    const { supplier, sent, state } = setup({
      draw: () => Promise.resolve({ kind: 'exhausted' }),
    });

    await converge(supplier, state);

    expect(sent).toEqual([
      { commandType: MOVING_XO_COMMANDS.exhausted, payload: {} },
    ]);
  });

  it('never draws for a turn that is not waiting for a puzzle', async () => {
    for (const phase of ['answering', 'placement', 'completed']) {
      const { supplier, sent, drawn, state } = setup({}, runtime({ phase }));
      const result = await converge(supplier, state);
      expect(result).toEqual({ outcome: 'nothing-pending' });
      expect(drawn).toEqual([]);
      expect(sent).toEqual([]);
    }
  });

  it('does not touch a round that is not playable yet', async () => {
    const { supplier, sent, drawn, state } = setup(
      {},
      runtime({ roundStatus: 'pending' }),
    );

    const result = await converge(supplier, state);

    // A launch commits several mutations before the round starts and each one
    // announces itself; commanding one of them would only abort a transaction.
    expect(result).toEqual({ outcome: 'round-not-active' });
    expect(drawn).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('ignores a runtime belonging to another mechanic', async () => {
    const { supplier, drawn, state } = setup({}, runtime({ modeKey: 'bomb' }));
    expect(await converge(supplier, state)).toEqual({
      outcome: 'not-moving-xo',
    });
    expect(drawn).toEqual([]);
  });

  it('does nothing at all until the Match registers a source', async () => {
    const sources = new MovingXoQuestionSourceRegistry();
    const supplier = new MovingXoTurnSupplier(
      new GameplayObserverRegistry(),
      sources,
      { findById: () => Promise.resolve(undefined) } as never,
      { findBySessionId: () => Promise.resolve(undefined) } as never,
      { get: () => ({ execute: () => Promise.resolve() }) } as never,
    );

    // A fabricated puzzle would be far worse than a visibly pending turn.
    expect(await converge(supplier, runtime())).toEqual({
      outcome: 'no-source-registered',
    });
  });

  it('refuses to open a puzzle for a turn that already moved on', async () => {
    // The draw started on turn two and returned after the question window had
    // already expired and the turn passed. Opening it now would put this team's
    // puzzle in front of the other team.
    const { supplier, sent, state } = setup(
      { draw: () => Promise.resolve({ kind: 'question', question: QUESTION }) },
      runtime({ presented: ['item-1'] }),
      runtime({ presented: ['item-1', 'item-9'], phase: 'question-pending' }),
    );

    const result = await converge(supplier, state);

    expect(result).toEqual({ outcome: 'turn-moved-on' });
    expect(sent).toEqual([]);
  });

  it('refuses to open a puzzle into a turn that is no longer waiting', async () => {
    const { supplier, sent, state } = setup(
      { draw: () => Promise.resolve({ kind: 'question', question: QUESTION }) },
      runtime(),
      runtime({ phase: 'placement' }),
    );

    expect(await converge(supplier, state)).toEqual({
      outcome: 'turn-moved-on',
    });
    expect(sent).toEqual([]);
  });

  it('keeps gameplay alive when the source throws', async () => {
    const { supplier, sent, state } = setup({
      draw: () => Promise.reject(new Error('mongo is having a day')),
    });

    const result = await converge(supplier, state);

    // The obligation stays pending and the next mutation or read tries again.
    expect(result).toEqual({ outcome: 'failed' });
    expect(sent).toEqual([]);
  });

  it('recovers an obligation announced while nobody was listening', async () => {
    const { supplier, sent } = setup({
      draw: () => Promise.resolve({ kind: 'question', question: QUESTION }),
    });

    // A snapshot read converges too, so progress never depends on one in-memory
    // callback having fired once.
    await supplier.enrich({ sessionId: 'session-1' } as never);

    expect(sent.map((command) => command.commandType)).toEqual([
      MOVING_XO_COMMANDS.openQuestion,
    ]);
  });
});
