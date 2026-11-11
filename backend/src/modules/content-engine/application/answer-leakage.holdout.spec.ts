import {
  CLEAN_HOLDOUT,
  LEAKY_HOLDOUT,
  LeakageCase,
} from '../testing/answer-leakage-holdout';
import { DeterministicScreenService } from './deterministic-screen.service';

/**
 * What the leakage rules do on questions they were never tuned on. The numbers
 * are pinned so a rule change shows up here, and the misses are recorded as known
 * gaps: they do not fail the build, and each turns red once it is caught.
 */

const LEAKAGE_CODES = [
  'ANSWER_LEAKAGE',
  'ANSWER_DERIVABLE',
  'POSSIBLE_ANSWER_LEAKAGE',
  'GRAMMAR_NARROWS_OPTIONS',
];

const screen = new DeterministicScreenService({
  get: () => undefined,
} as never);

const draftOf = (entry: LeakageCase) =>
  typeof entry.answer === 'number'
    ? {
        prompt: { ar: entry.prompt },
        answerPayload: { mode: 'closest', correctValue: entry.answer },
        mechanicPayload: {
          closestSlider: {
            mode: 'numeric-range',
            min: 0,
            max: 100000,
            step: 1,
          },
        },
      }
    : {
        prompt: { ar: entry.prompt },
        answerPayload: {
          mode: 'multiple_choice',
          correctOptionId: 'a',
          options: [
            { id: 'a', label: { ar: entry.answer } },
            ...(entry.others ?? []).map((label, index) => ({
              id: `b${index}`,
              label: { ar: label },
            })),
          ],
        },
      };

const verdict = (entry: LeakageCase): 'block' | 'warn' | 'none' => {
  const findings = screen
    .screen(draftOf(entry) as never)
    .findings.filter((finding) => LEAKAGE_CODES.includes(finding.code));
  if (findings.some((finding) => finding.severity === 'blocking')) {
    return 'block';
  }
  return findings.length ? 'warn' : 'none';
};

const idsWith = (cases: LeakageCase[], outcome: string) =>
  cases.filter((entry) => verdict(entry) === outcome).map((entry) => entry.id);

describe('answer leakage on the held-out batch', () => {
  it('blocks these leaks', () => {
    expect(idsWith(LEAKY_HOLDOUT, 'block')).toEqual([
      'L01',
      'L02',
      'L03',
      'L04',
      'L12',
      'L13',
      'L14',
      'L15',
      'L16',
      'L18',
    ]);
  });

  it('warns about these leaks', () => {
    expect(idsWith(LEAKY_HOLDOUT, 'warn')).toEqual(['L07', 'L20']);
  });

  it('never blocks a clean question', () => {
    expect(idsWith(CLEAN_HOLDOUT, 'block')).toEqual([]);
  });

  it('warns on these two clean questions', () => {
    expect(idsWith(CLEAN_HOLDOUT, 'warn')).toEqual(['C18', 'C22']);
  });

  describe('known gaps', () => {
    it.failing.each(
      LEAKY_HOLDOUT.filter((entry) =>
        [
          'L05',
          'L06',
          'L08',
          'L09',
          'L10',
          'L11',
          'L17',
          'L19',
          'L21',
          'L22',
        ].includes(entry.id),
      ).map((entry) => [entry.id, entry.kind, entry] as const),
    )('%s (%s) should be flagged', (_id, _kind, entry) => {
      expect(verdict(entry)).not.toBe('none');
    });
  });
});
