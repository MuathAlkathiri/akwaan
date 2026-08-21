import { GameplayRuntimeState } from '../domain/gameplay-runtime';
import { MARHALA_COMMANDS } from '../domain/marhala-gameplay.plugin';
import { MARHALA_MODE_KEY } from '../domain/marhala-board';
import { GameplayObserverRegistry } from './gameplay-observer.registry';
import {
  MarhalaDrawOutcome,
  MarhalaQuestionSource,
  MarhalaQuestionSourceRegistry,
} from './marhala-question-source.registry';
import { MarhalaTurnSupplier } from './marhala-turn.supplier';

/**
 * What the supplier does with an answer it cannot act on.
 *
 * The integration suite proves the happy path against real Mongo. These are the
 * cases that are easy to get subtly wrong and expensive to notice: an outcome the
 * source could not determine must never be mistaken for a depleted catalog, and a
 * runtime that is still being assembled must not be commanded at all. Both of
 * those, uncaught, silently end a race that has a full catalog behind it.
 */

const QUESTION = {
  contentItemId: 'item-1',
  scopeId: 'scope-1',
  difficulty: 'hard' as const,
  prompt: { ar: 'سؤال' },
  acceptedAnswers: ['جواب'],
};

const runtime = (
  overrides: {
    phase?: string;
    roundStatus?: string;
    selectedDifficulty?: string | null;
  } = {},
): GameplayRuntimeState =>
  ({
    id: 'runtime-1',
    modeKey: MARHALA_MODE_KEY,
    modeVersion: 1,
    revision: 7,
    runtimeState: {
      phase: overrides.phase ?? 'question-pending',
      selectedDifficulty:
        overrides.selectedDifficulty === undefined
          ? 'hard'
          : overrides.selectedDifficulty,
      turnsJson: '[]',
      availableDifficultiesJson: JSON.stringify(['easy', 'medium', 'hard']),
      questionJson: null,
    },
    activeRound: {
      id: 'round-1',
      status: overrides.roundStatus ?? 'active',
      modeState: { phase: overrides.phase ?? 'question-pending' },
    },
  }) as unknown as GameplayRuntimeState;

describe('MarhalaTurnSupplier', () => {
  const setup = (
    source: Partial<MarhalaQuestionSource>,
    state: GameplayRuntimeState = runtime(),
  ) => {
    const sent: Array<{ commandType: string; payload: unknown }> = [];
    const sources = new MarhalaQuestionSourceRegistry();
    const asked: string[] = [];
    sources.register({
      name: 'test-source',
      draw: () => {
        asked.push('draw');
        return Promise.resolve({ kind: 'exhausted' } as MarhalaDrawOutcome);
      },
      availability: () => {
        asked.push('availability');
        return Promise.resolve(['easy']);
      },
      ...source,
    });
    const supplier = new MarhalaTurnSupplier(
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
            serialize: () => state,
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
    return { supplier, sent, asked, state };
  };

  const converge = (
    supplier: MarhalaTurnSupplier,
    state: GameplayRuntimeState,
  ) =>
    supplier.onRuntimeMutated({
      sessionId: 'session-1',
      runtimeId: state.id,
      runtimeState: state,
    });

  it('opens the question a source drew', async () => {
    const { supplier, sent, state } = setup({
      draw: () => Promise.resolve({ kind: 'question', question: QUESTION }),
    });

    await converge(supplier, state);

    expect(sent).toEqual([
      {
        commandType: MARHALA_COMMANDS.openQuestion,
        payload: { questionJson: JSON.stringify(QUESTION) },
      },
    ]);
  });

  it('leaves the turn owed when the source cannot answer yet', async () => {
    const { supplier, sent, state } = setup({
      draw: () => Promise.resolve({ kind: 'unknown' }),
    });

    const result = await converge(supplier, state);

    // The Match binding is written after the runtime starts, so the first
    // convergence of every launch lands here. Reading it as depletion would end a
    // race with a full catalog behind it.
    expect(result).toEqual({ outcome: 'source-unknown' });
    expect(sent).toEqual([]);
  });

  it('ends the race only when the source says nothing is left', async () => {
    const { supplier, sent, state } = setup({
      draw: () => Promise.resolve({ kind: 'exhausted' }),
    });

    await converge(supplier, state);

    expect(sent.map((command) => command.commandType)).toEqual([
      MARHALA_COMMANDS.exhausted,
    ]);
  });

  it('withdraws a band the source can no longer serve', async () => {
    const { supplier, sent, state } = setup({
      draw: () =>
        Promise.resolve({ kind: 'unavailable', available: ['easy', 'medium'] }),
    });

    await converge(supplier, state);

    expect(sent).toEqual([
      {
        commandType: MARHALA_COMMANDS.refreshAvailability,
        payload: {
          availableDifficultiesJson: JSON.stringify(['easy', 'medium']),
        },
      },
    ]);
  });

  it('does not touch a round that is not playable yet', async () => {
    const { supplier, sent, asked, state } = setup(
      {},
      runtime({
        roundStatus: 'pending',
      }),
    );

    const result = await converge(supplier, state);

    // A launch commits several mutations before the round starts and each one
    // announces itself; commanding one of them would only abort a transaction.
    expect(result).toEqual({ outcome: 'round-not-active' });
    expect(asked).toEqual([]);
    expect(sent).toEqual([]);
  });

  it('leaves declared choices alone when availability is unknown', async () => {
    const { supplier, sent, state } = setup(
      { availability: () => Promise.resolve(undefined) },
      runtime({ phase: 'difficulty-choice', selectedDifficulty: null }),
    );

    const result = await converge(supplier, state);

    expect(result).toEqual({ outcome: 'source-unknown' });
    expect(sent).toEqual([]);
  });

  it('ends a decision that no band can serve', async () => {
    const { supplier, sent, state } = setup(
      { availability: () => Promise.resolve([]) },
      runtime({ phase: 'difficulty-choice', selectedDifficulty: null }),
    );

    await converge(supplier, state);

    expect(sent.map((command) => command.commandType)).toEqual([
      MARHALA_COMMANDS.exhausted,
    ]);
  });

  it('publishes a narrowed set of choices', async () => {
    const { supplier, sent, state } = setup(
      { availability: () => Promise.resolve(['easy']) },
      runtime({ phase: 'difficulty-choice', selectedDifficulty: null }),
    );

    await converge(supplier, state);

    expect(sent).toEqual([
      {
        commandType: MARHALA_COMMANDS.refreshAvailability,
        payload: { availableDifficultiesJson: JSON.stringify(['easy']) },
      },
    ]);
  });

  it('says nothing when the choices have not changed', async () => {
    const { supplier, sent, state } = setup(
      {
        availability: () => Promise.resolve(['easy', 'medium', 'hard']),
      },
      runtime({ phase: 'difficulty-choice', selectedDifficulty: null }),
    );

    const result = await converge(supplier, state);

    expect(result).toEqual({ outcome: 'availability-unchanged' });
    expect(sent).toEqual([]);
  });

  it('ignores a runtime that is not المرحلة', async () => {
    const other = {
      ...runtime(),
      modeKey: 'bomb',
    } as unknown as GameplayRuntimeState;
    const { supplier, sent, asked } = setup({}, other);

    const result = await converge(supplier, other);

    expect(result).toEqual({ outcome: 'not-marhala' });
    expect(asked).toEqual([]);
    expect(sent).toEqual([]);
  });
});
