import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const MATCH_ROOT = join(__dirname);
const SRC_ROOT = join(__dirname, '..', '..');

function walk(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory()
      ? walk(path)
      : path.endsWith('.ts')
        ? [path]
        : [];
  });
}

const matchFiles = walk(MATCH_ROOT).filter(
  (path) => !path.endsWith('.spec.ts'),
);
const read = (path: string) => readFileSync(path, 'utf8');
const relative = (path: string) => path.replace(`${SRC_ROOT}/`, '');

/**
 * The Match layer is orchestration only. These tests fail the moment it starts
 * re-implementing something a lower layer already owns.
 */
describe('Match module architecture', () => {
  it('introduces no second gateway, runtime, or scoring rule', () => {
    const offenders = matchFiles.filter((path) => {
      const content = read(path);
      return (
        /@WebSocketGateway|SubscribeMessage/.test(content) ||
        /class \w*GameplayRuntime\b/.test(content) ||
        /class \w*ScoringRule|mintScoreEvent|SCORE_EVENT_BRAND/.test(content)
      );
    });
    expect(offenders.map(relative)).toEqual([]);
  });

  it('never touches the legacy Game modules', () => {
    const offenders = matchFiles.filter((path) =>
      /modules\/(games|questions|question-history)\//.test(read(path)),
    );
    expect(offenders.map(relative)).toEqual([]);
  });

  it('launches mechanics through their existing use cases only', () => {
    const launchers = matchFiles.filter((path) =>
      path.endsWith('.launcher.ts'),
    );
    expect(launchers).toHaveLength(3);
    for (const path of launchers) {
      const content = read(path);
      expect(content).toMatch(
        /StartRyoGameplay|StartTop10PoisonDeck|StartDistributedInformation/,
      );
      // No launcher may build a runtime, a round, or an interaction itself.
      expect(content).not.toMatch(
        /CreateGameplayRuntime|CreateGameplayRound|prepareInteraction|GameplayRuntime\.create/,
      );
    }
  });

  it('keeps exactly one ScoreEvent collector shared by every mechanic', () => {
    const collectors = matchFiles.filter((path) =>
      /scoreEventsJson/.test(read(path)),
    );
    expect(collectors.map(relative)).toEqual([
      'modules/match/application/runtime-score-event.collector.ts',
    ]);
  });

  it('keeps exactly one caller of the aggregate completion command', () => {
    // The aggregate declares completeChallenge; only the reconciliation bridge
    // may call it, so a challenge can never be finished from two places.
    const callers = matchFiles
      .filter((path) => !path.endsWith(join('domain', 'match.ts')))
      .filter((path) => /completeChallenge\(/.test(read(path)));
    expect(callers.map(relative)).toEqual([
      'modules/match/application/match-reconciliation.service.ts',
    ]);
  });

  it('exposes no route that finishes a challenge', () => {
    const routes = matchFiles
      .filter((path) => path.includes(join('presentation')))
      .flatMap((path) => [
        ...read(path).matchAll(/@(?:Post|Get|Patch|Delete)\('([^']*)'\)/g),
      ])
      .map((match) => match[1]);
    expect(routes).not.toHaveLength(0);
    expect(
      routes.filter((route) => /complete|finish|score|resolve/.test(route)),
    ).toEqual([]);
  });

  it('never auto-completes an unimplemented mechanic', () => {
    const offenders = matchFiles.filter((path) => {
      const content = read(path);
      return (
        /CONFIGURED_BUT_UNIMPLEMENTED/.test(content) &&
        /completeChallenge|MatchSlotStatus.COMPLETED/.test(content)
      );
    });
    expect(offenders.map(relative)).toEqual([]);
  });

  /**
   * The unified redesign only pays off if the new contract stays clean of the
   * sequential one. These fail the moment unified code borrows a legacy concept
   * instead of leaving it behind.
   */
  describe('the unified preconfigured contract', () => {
    const unifiedFiles = matchFiles.filter((path) =>
      /unified/.test(path.split('/').pop() ?? ''),
    );

    it('has unified modules to guard', () => {
      expect(unifiedFiles.length).toBeGreaterThanOrEqual(4);
    });

    it('never treats currentOccurrenceIndex as an authority', () => {
      const offenders = unifiedFiles.filter((path) =>
        /currentOccurrenceIndex/.test(read(path)),
      );
      expect(offenders.map(relative)).toEqual([]);
    });

    it('never transitions through world_complete', () => {
      const offenders = unifiedFiles.filter((path) =>
        /WORLD_COMPLETE|world_complete|advanceToNextWorld/.test(read(path)),
      );
      expect(offenders.map(relative)).toEqual([]);
    });

    it('never reaches the legacy category or Game modules', () => {
      const offenders = unifiedFiles.filter((path) =>
        /modules\/(games|questions|question-history|categories)\//.test(
          read(path),
        ),
      );
      expect(offenders.map(relative)).toEqual([]);
    });

    it('accepts no client-owned setup state', () => {
      // The creation request carries the configuration and nothing else: stage,
      // board, setup mode, selecting team, and the coin toss are all
      // server-decided, so a frontend can never seed them.
      const dto = classBody('CreateUnifiedMatchDto');
      for (const field of [
        'stage',
        'status',
        'setupMode',
        'selectingTeamId',
        'coinToss',
        'startingTeamId',
        'boardPositions',
        'revision',
      ]) {
        expect(dto).not.toMatch(new RegExp(`\\b${field}[?!]?:`));
      }
    });

    it('accepts no client-chosen content on the launch request', () => {
      // The whole point of the unified launch: the caller names a position, and
      // the server decides what gets played there.
      const dto = classBody('LaunchUnifiedChallengeDto');
      for (const field of [
        'contentItemIds',
        'contentItemId',
        'worldId',
        'scopeIds',
        'challengeTypeId',
        'startingTeamId',
      ]) {
        expect(dto).not.toMatch(new RegExp(`\\b${field}[?!]?:`));
      }
      // And it does name a position.
      expect(dto).toMatch(/\boccurrenceIndex!:/);
      expect(dto).toMatch(/\bslotKey!:/);
    });

    it('never lets a client name the content the server draws', () => {
      const controller = read(
        join(MATCH_ROOT, 'presentation', 'unified-match.controller.ts'),
      );
      expect(controller).not.toMatch(/contentItemIds?/);
    });

    /** One DTO class body, so a shared file cannot blur two contracts together. */
    function classBody(name: string): string {
      const source = read(
        join(MATCH_ROOT, 'presentation', 'unified-match.dto.ts'),
      );
      const start = source.indexOf(`export class ${name}`);
      expect(start).toBeGreaterThanOrEqual(0);
      const next = source.indexOf('export class ', start + 1);
      return source.slice(start, next === -1 ? undefined : next);
    }

    it('builds a board position key in exactly one place', () => {
      const builders = matchFiles.filter((path) =>
        // Any other module joining the index and the slot key into one string
        // would let two spellings of the same identity exist.
        /\$\{[^}]*occurrenceIndex[^}]*\}\S*?\$\{[^}]*slotKey[^}]*\}/.test(
          read(path),
        ),
      );
      expect(builders.map(relative)).toEqual([
        'modules/match/domain/match-board-position-key.ts',
      ]);
    });

    it('keeps the sequential flow inside the files marked for removal', () => {
      // Everything that still speaks the legacy journey carries a deprecation
      // note, so Phase 5 has an exact list rather than a search.
      const legacy = matchFiles.filter((path) =>
        /WorldSelectionMethod\.(TEAM_PICK|AGREED|RANDOM)|MatchStage\.WORLD_COMPLETE|advanceToNextWorld/.test(
          read(path),
        ),
      );
      expect(legacy.length).toBeGreaterThan(0);
      for (const path of legacy) {
        expect({
          path: relative(path),
          deprecated: /@deprecated/.test(read(path)),
        }).toEqual({ path: relative(path), deprecated: true });
      }
    });
  });

  it('reaches live-game-sessions only through its published surfaces', () => {
    const allowed = [
      'live-game-sessions/application/start-ryo-gameplay.use-case',
      'live-game-sessions/application/start-top10-poison-deck.use-case',
      'live-game-sessions/application/start-distributed-information.use-case',
      'live-game-sessions/application/gameplay-observer.registry',
      'live-game-sessions/application/get-live-game-session.use-case',
      'live-game-sessions/application/live-game-session.snapshot',
      'live-game-sessions/application/live-session-actor',
      'live-game-sessions/application/live-session-match.projection',
      'live-game-sessions/application/live-session-transition.publisher',
      // A challenge preflight shows the session's own join code rather than
      // inventing a second join system.
      'live-game-sessions/application/live-session-join-access.use-cases',
      'live-game-sessions/domain/live-session-join-access.repository',
      'live-game-sessions/domain/gameplay-runtime',
      'live-game-sessions/domain/gameplay-runtime.repository',
      'live-game-sessions/domain/live-game-session.repository',
      'live-game-sessions/presentation/live-session-http-exception.filter',
      'live-game-sessions/domain/ryo-gameplay.plugin',
      'live-game-sessions/domain/top10-poison-deck.plugin',
      'live-game-sessions/domain/distributed-information.plugin',
      'live-game-sessions/live-game-sessions.module',
    ];
    const imported = new Set<string>();
    for (const path of matchFiles) {
      for (const match of read(path).matchAll(
        /['"]\.\.\/(?:\.\.\/)?(live-game-sessions\/[\w./-]+)['"]/g,
      )) {
        imported.add(match[1]);
      }
    }
    expect([...imported].filter((entry) => !allowed.includes(entry))).toEqual(
      [],
    );
  });
});
