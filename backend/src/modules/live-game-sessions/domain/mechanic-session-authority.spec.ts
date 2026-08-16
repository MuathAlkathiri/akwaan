import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { GameplayModeRegistry } from './gameplay-mode.registry';

/**
 * A board position may not end the Match.
 *
 * Bomb once did: its skip cost the active team five seconds, and when that
 * penalty emptied the clock the effect handler finished the whole
 * LiveGameSession — deciding global completion from inside one of twelve
 * positions, with the rest still unplayed. The mechanic's job is to resolve
 * *itself*; whether the game is over is the Match's judgement, made from the
 * board after the challenge is scored.
 *
 * `finish-live-session` is still a member of the effect union and still handled,
 * because removing a domain contract is not this batch's business. What must not
 * happen is a mechanic reaching for it. This is source-level for the same reason
 * the deadline wiring test is: whether a reducer emits an effect on some branch
 * cannot be observed without running every branch of it.
 */
/**
 * The contract files, which legitimately name the effect because they declare
 * or handle it. Only mechanics are scanned.
 */
const CONTRACT_FILES = new Set([
  'gameplay-mode.plugin.ts',
  'gameplay-interaction.plugin.ts',
]);

describe('mechanic authority over the live session', () => {
  const domain = __dirname;
  const pluginFiles = readdirSync(domain).filter(
    (file) => file.endsWith('.plugin.ts') && !CONTRACT_FILES.has(file),
  );

  it('finds a mechanic file for every registered mechanic but the core one', () => {
    // Guards the guard: if plugins ever move, the scan below would silently
    // pass by reading nothing. The core reference runtime lives in the contract
    // file, hence the one allowance.
    expect(pluginFiles.length).toBe(
      new GameplayModeRegistry().all().length - 1,
    );
  });

  it.each(pluginFiles)(
    '%s does not claim authority to finish the live session',
    (file) => {
      const source = readFileSync(join(domain, file), 'utf8');
      expect(source).not.toContain('finish-live-session');
    },
  );

  it('leaves clock adjustment as a mechanic-level effect only', () => {
    // Bomb still spends the session clock — that is its mechanic. What it no
    // longer does is treat an emptied clock as the end of the session.
    const bomb = readFileSync(join(domain, 'bomb-gameplay.plugin.ts'), 'utf8');
    expect(bomb).toContain('adjust-active-team-time');
    expect(bomb).not.toContain('finish-live-session');
  });
});
