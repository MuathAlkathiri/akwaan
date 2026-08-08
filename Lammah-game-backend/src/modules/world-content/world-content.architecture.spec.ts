import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

/**
 * Structural guarantees from roadmap 0.3 and 17. These are the rules that decay
 * silently, so they are asserted rather than documented.
 */

const SRC_ROOT = join(__dirname, '..', '..');

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((entry) => {
    const path = join(root, entry);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return path.endsWith('.ts') ? [path] : [];
  });
}

const allFiles = sourceFiles(SRC_ROOT);
const worldContentFiles = allFiles.filter((path) =>
  path.includes(join('modules', 'world-content')),
);

describe('World Content architecture', () => {
  it('has world-content source files to check', () => {
    expect(worldContentFiles.length).toBeGreaterThan(10);
  });

  it('does not import legacy game, question, category, or catalog modules', () => {
    const forbidden = [
      'modules/games',
      'modules/questions',
      'modules/categories',
      'modules/catalogs',
      '../games/',
      '../questions/',
      '../categories/',
      '../catalogs/',
    ];
    const offenders = worldContentFiles.filter((path) => {
      const contents = readFileSync(path, 'utf8');
      return forbidden.some(
        (needle) =>
          contents.includes(`from '${needle}`) ||
          contents.includes(`from '../${needle}`) ||
          contents.includes(`from '../../${needle}`),
      );
    });
    expect(offenders).toEqual([]);
  });

  it('keeps exactly one Arabic answer normalizer', () => {
    const normalizers = allFiles.filter(
      (path) =>
        !path.endsWith('.spec.ts') &&
        /export function normalize(Answer|ArabicAnswer|Text)\s*\(/.test(
          readFileSync(path, 'utf8'),
        ),
    );
    expect(normalizers).toEqual([
      join(SRC_ROOT, 'common', 'utils', 'answer-normalization.util.ts'),
    ]);
  });

  it('mints score events in exactly one module', () => {
    const minters = allFiles.filter(
      (path) =>
        !path.endsWith('.spec.ts') &&
        readFileSync(path, 'utf8').includes('mintScoreEvent'),
    );
    expect(
      minters.every((path) => path.includes(join('modules', 'scoring'))),
    ).toBe(true);
    // Only the event module defines it and only the engine calls it.
    expect(minters).toHaveLength(2);
  });

  it('resolves scoring rules through the single registry', () => {
    const registries = allFiles.filter(
      (path) =>
        !path.endsWith('.spec.ts') &&
        readFileSync(path, 'utf8').includes('class ScoringRuleRegistry'),
    );
    expect(registries).toHaveLength(1);
  });

  it('leaves no reference to the replaced content-taxonomy module', () => {
    const offenders = allFiles
      .filter((path) => path !== __filename)
      .filter((path) =>
        /ContentTaxonomy|content-taxonomy/.test(readFileSync(path, 'utf8')),
      );
    expect(offenders).toEqual([]);
  });

  it('keeps world-content imports on explicit legacy and live-game integration edges', () => {
    const legacyImporters = allFiles
      .filter(
        (path) =>
          !path.includes(join('modules', 'world-content')) &&
          !path.includes(join('modules', 'scoring')) &&
          // Match orchestration is a designed consumer of World Content: it reads
          // boards, slot keys, and readiness. That whole edge is intentional.
          !path.includes(join('modules', 'match')) &&
          !path.endsWith('app.module.ts') &&
          !path.includes(join('src', 'scripts')) &&
          readFileSync(path, 'utf8').includes('world-content/'),
      )
      .map((path) => path.replace(`${SRC_ROOT}/`, ''));
    // Everything left is the legacy question bridge or an existing challenge
    // launcher reading the content a mechanic is about to play.
    expect(legacyImporters.sort()).toEqual([
      'modules/live-game-sessions/application/start-closest-gameplay.use-case.ts',
      'modules/live-game-sessions/application/start-distributed-information.use-case.ts',
      'modules/live-game-sessions/application/start-ryo-gameplay.use-case.ts',
      'modules/live-game-sessions/application/start-top5.use-case.ts',
      // The Top 5 plugin reads the content contract's own constants rather than
      // restating ten, five, and the rank set a second time.
      'modules/live-game-sessions/domain/top5-keep-or-give.plugin.ts',
      'modules/live-game-sessions/live-game-sessions.module.ts',
      'modules/live-game-sessions/presentation/gameplay-runtime.dto.ts',
      'modules/questions/application/legacy-question-world-reference.guard.ts',
      'modules/questions/questions.module.ts',
      'modules/questions/questions.service.ts',
    ]);
  });
});
