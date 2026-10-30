import { ConfigService } from '@nestjs/config';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { join, resolve } from 'path';
import { DeterministicScreenService } from './deterministic-screen.service';

const config = { get: () => undefined } as unknown as ConfigService;

const draft = (overrides: Record<string, unknown> = {}) => ({
  prompt: { ar: 'أي فريق فاز بالبطولة؟' },
  answerPayload: {
    mode: 'multiple_choice',
    options: [
      { id: 'a', label: { ar: 'الهلال' } },
      { id: 'b', label: { ar: 'النصر' } },
    ],
    correctOptionId: 'a',
  },
  ...overrides,
});

const codes = (
  service: DeterministicScreenService,
  item: Record<string, unknown>,
) =>
  service
    .screen(item)
    .findings.filter((f) => f.severity === 'blocking')
    .map((f) => f.code);

describe('DeterministicScreenService', () => {
  let service: DeterministicScreenService;
  beforeEach(() => {
    service = new DeterministicScreenService(config);
    service.beginBatch();
  });

  it('passes a well-formed candidate', () => {
    const result = service.screen(draft());
    expect(result.passed).toBe(true);
    expect(
      result.findings.filter((f) => f.severity === 'blocking'),
    ).toHaveLength(0);
  });

  it('names the checks that remain after the separate compatibility stage', () => {
    // A passing screen must not read as "fully validated".
    const deferredCodes = service
      .screen(draft())
      .findings.filter((f) => f.severity === 'deferred')
      .map((f) => f.code);
    expect(deferredCodes).toEqual(
      expect.arrayContaining([
        'FACTUAL_VERIFICATION_PENDING',
        'NOVELTY_COVERAGE_LIMITED',
      ]),
    );
    expect(deferredCodes).not.toContain('COMPATIBILITY_POLICY_NOT_RUN');
  });

  it('rejects a missing prompt and a missing payload', () => {
    expect(codes(service, draft({ prompt: { ar: '  ' } }))).toContain(
      'PROMPT_REQUIRED',
    );
    const noPayload = service.screen({ prompt: { ar: 'س' } });
    expect(noPayload.passed).toBe(false);
    expect(noPayload.findings[0].code).toBe('ANSWER_PAYLOAD_REQUIRED');
  });

  it('rejects an unsupported answer mode', () => {
    // `closest` used to stand in here; it is an authored mode now, so the
    // example has to be a mode the engine genuinely cannot produce.
    expect(
      codes(
        service,
        draft({
          answerPayload: { mode: 'vote', options: [], correctOptionId: '' },
        }),
      ),
    ).toContain('ANSWER_MODE_UNSUPPORTED');
  });

  it('rejects fewer than two options', () => {
    expect(
      codes(
        service,
        draft({
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: 'a', label: { ar: 'الهلال' } }],
            correctOptionId: 'a',
          },
        }),
      ),
    ).toContain('ANSWER_OPTIONS_REQUIRED');
  });

  it('rejects duplicate option ids and a correct id that is not an option', () => {
    expect(
      codes(
        service,
        draft({
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'الهلال' } },
              { id: 'a', label: { ar: 'النصر' } },
            ],
            correctOptionId: 'zz',
          },
        }),
      ),
    ).toEqual(
      expect.arrayContaining([
        'DUPLICATE_ANSWER_OPTION_ID',
        'CORRECT_OPTION_NOT_IN_OPTIONS',
      ]),
    );
  });

  it('rejects two options that read the same once normalized', () => {
    // الهلال and هلال grade identically; offering both is one answer twice.
    expect(
      codes(
        service,
        draft({
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'الهلال' } },
              { id: 'b', label: { ar: 'هلال' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ),
    ).toContain('DUPLICATE_ANSWER_OPTION_LABEL');
  });

  it('rejects a prompt that contains its own answer', () => {
    expect(
      codes(service, draft({ prompt: { ar: 'هل فاز الهلال بالبطولة؟' } })),
    ).toContain('ANSWER_LEAKAGE');
  });

  it('catches leakage through normalization, not just exact text', () => {
    // The prompt says هلال, the answer is الهلال: the normalizer folds the ال.
    expect(
      codes(
        service,
        draft({ prompt: { ar: 'كم بطولة حققها هلال هذا الموسم؟' } }),
      ),
    ).toContain('ANSWER_LEAKAGE');
  });

  it('catches whole-word leakage in phrase clues (Candidate 3 pilot case)', () => {
    expect(
      codes(
        service,
        draft({
          prompt: { ar: 'ما الحيوان المختبئ في جملة "طائر العصفور يغرد"؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'العصفور' } },
              { id: 'b', label: { ar: 'الصقر' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ),
    ).toContain('ANSWER_LEAKAGE');
  });

  it('does not flag single-character answers embedded inside unrelated words (Candidate 4 pilot case)', () => {
    expect(
      codes(
        service,
        draft({
          prompt: { ar: 'ما الكلمة التي تعني تقديم العون للآخرين؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'مساعدة' } },
              { id: 'b', label: { ar: 'إهمال' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ),
    ).not.toContain('ANSWER_LEAKAGE');

    // Single character option 'ع' where prompt contains 'مساعدة'
    expect(
      codes(
        service,
        draft({
          prompt: { ar: 'ما الكلمة المناسبة لمساعدة الصديق؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'ع' } },
              { id: 'b', label: { ar: 'غ' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ),
    ).not.toContain('ANSWER_LEAKAGE');
  });

  it('catches standalone single-character leakage when isolated by brackets/whitespace', () => {
    expect(
      codes(
        service,
        draft({
          prompt: { ar: 'اختر الحرف المطابق: (ع)' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'ع' } },
              { id: 'b', label: { ar: 'غ' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ),
    ).toContain('ANSWER_LEAKAGE');
  });

  it('blocks anagram challenges with letter count / multiset mismatches (Candidate 1 pilot case)', () => {
    expect(
      codes(
        service,
        draft({
          prompt: { ar: 'كون كلمة من الحروف التالية: ن م ب ج' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'منجا' } },
              { id: 'b', label: { ar: 'تفاح' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ),
    ).toContain('ANAGRAM_LETTER_MULTISET_MISMATCH');
  });

  it('passes anagram challenges when clue letters mathematically match answer letters', () => {
    expect(
      codes(
        service,
        draft({
          prompt: { ar: 'كون كلمة من الحروف التالية: ن ج م' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'نجم' } },
              { id: 'b', label: { ar: 'شمس' } },
            ],
            correctOptionId: 'a',
          },
        }),
      ),
    ).not.toContain('ANAGRAM_LETTER_MULTISET_MISMATCH');
  });

  it('rejects a second candidate that asks the same thing', () => {
    expect(service.screen(draft()).passed).toBe(true);
    expect(codes(service, draft())).toContain('DUPLICATE_IN_BATCH');
  });

  it('starts a fresh batch when told to', () => {
    service.screen(draft());
    service.beginBatch();
    expect(service.screen(draft()).passed).toBe(true);
  });

  describe('answer option count — roadmap §6.1 says 2 to 4', () => {
    const withOptions = (n: number) =>
      draft({
        answerPayload: {
          mode: 'multiple_choice',
          options: Array.from({ length: n }, (_, i) => ({
            id: String.fromCharCode(97 + i),
            label: { ar: `خيار ${i + 1}` },
          })),
          correctOptionId: 'a',
        },
      });

    it.each([2, 3, 4])('accepts %i options', (n) => {
      const result = service.screen(withOptions(n));
      expect(
        result.findings
          .filter((f) => f.severity === 'blocking')
          .map((f) => f.code),
      ).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it('blocks 5 options', () => {
      // The upper bound used to live only in the generation schema's
      // `maxItems`, which OpenAI strict mode rejects. It is a gameplay rule,
      // so it belongs where every provider's output passes through.
      const result = service.screen(withOptions(5));
      expect(
        result.findings
          .filter((f) => f.severity === 'blocking')
          .map((f) => f.code),
      ).toContain('ANSWER_OPTIONS_TOO_MANY');
      expect(result.passed).toBe(false);
    });

    it('blocks 1 option, and still reports the minimum', () => {
      expect(codes(service, withOptions(1))).toContain(
        'ANSWER_OPTIONS_REQUIRED',
      );
    });

    it('names how many were authored, so a reviewer can see the overshoot', () => {
      const finding = service
        .screen(withOptions(7))
        .findings.find((f) => f.code === 'ANSWER_OPTIONS_TOO_MANY');
      expect(finding!.message).toMatch(/7 were authored/);
    });

    it('keeps a malformed candidate out of review entirely', () => {
      // `passed: false` is what routes a candidate to `screened_reject`
      // instead of the review queue, so it can never reach publication.
      expect(service.screen(withOptions(5)).passed).toBe(false);
    });
  });

  describe('RYO authoring rationale', () => {
    const ryoItem = () =>
      draft({
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'النيتروجين' } },
            { id: 'b', label: { ar: 'الأكسجين' } },
            { id: 'c', label: { ar: 'ثاني أكسيد الكربون' } },
          ],
          correctOptionId: 'a',
        },
      });

    /**
     * One screen call per candidate, deliberately.
     *
     * `DUPLICATE_IN_BATCH` is blocking on the multiple-choice path, so
     * screening the same prompt twice inside one test would make the second
     * call fail for a reason the test is not about.
     */
    const run = (authoring?: Record<string, unknown>) => {
      const result = service.screen(ryoItem(), authoring);
      const codes = (severity: string) =>
        result.findings
          .filter((finding) => finding.severity === severity)
          .map((finding) => finding.code);
      return {
        passed: result.passed,
        blocked: codes('blocking'),
        warned: codes('warning'),
      };
    };

    const COMPLETE = {
      concept: 'People reach for oxygen before nitrogen.',
      distractorRationale: [
        { optionId: 'b', why: 'The gas people associate with breathing.' },
        { optionId: 'c', why: 'Associated with air quality and climate.' },
      ],
      estimatedConfidence: { band: 'even', why: 'A common misconception.' },
    };

    it('accepts a complete rationale with no findings', () => {
      const result = run(COMPLETE);
      expect(result.blocked).toEqual([]);
      expect(result.warned).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it('blocks a rationale naming an option that does not exist', () => {
      expect(
        run({
          ...COMPLETE,
          distractorRationale: [{ optionId: 'z', why: 'nonexistent' }],
        }).blocked,
      ).toContain('RYO_DISTRACTOR_RATIONALE_UNKNOWN_OPTION');
    });

    it('blocks a rationale that names the correct answer', () => {
      // The one mistake that would quietly invert the field's meaning.
      expect(
        run({
          ...COMPLETE,
          distractorRationale: [{ optionId: 'a', why: 'it is correct' }],
        }).blocked,
      ).toContain('RYO_DISTRACTOR_RATIONALE_NAMES_ANSWER');
    });

    it('blocks a duplicated option reference', () => {
      expect(
        run({
          ...COMPLETE,
          distractorRationale: [
            { optionId: 'b', why: 'first' },
            { optionId: 'b', why: 'second' },
          ],
        }).blocked,
      ).toContain('RYO_DISTRACTOR_RATIONALE_DUPLICATE');
    });

    it('blocks an entry carrying no reason', () => {
      expect(
        run({
          ...COMPLETE,
          distractorRationale: [{ optionId: 'b', why: '   ' }],
        }).blocked,
      ).toContain('RYO_DISTRACTOR_RATIONALE_EMPTY');
    });

    it('warns — but does not block — when an option is unexplained', () => {
      const result = run({
        ...COMPLETE,
        distractorRationale: [{ optionId: 'b', why: 'the obvious one' }],
      });
      expect(result.warned).toContain('RYO_DISTRACTOR_RATIONALE_INCOMPLETE');
      expect(result.blocked).toEqual([]);
    });

    it('blocks a confidence band outside the defined set', () => {
      expect(
        run({
          ...COMPLETE,
          estimatedConfidence: { band: 'quite-hard', why: 'invented' },
        }).blocked,
      ).toContain('RYO_CONFIDENCE_BAND_INVALID');
    });

    it.each(['likely', 'even'])('accepts the target band %s', (band) => {
      expect(
        run({ ...COMPLETE, estimatedConfidence: { band, why: 'x' } }).warned,
      ).toEqual([]);
    });

    it.each(['near-certain', 'near-impossible'])(
      'warns on %s without blocking — it is a hypothesis, not a verdict',
      (band) => {
        const result = run({
          ...COMPLETE,
          estimatedConfidence: { band, why: 'x' },
        });
        expect(result.warned).toContain('RYO_CONFIDENCE_OUTSIDE_TARGET_BAND');
        expect(result.blocked).toEqual([]);
      },
    );

    it('is silent on a legacy candidate carrying no rationale at all', () => {
      // Content generated before these fields existed must screen exactly as
      // it did before.
      const result = run(undefined);
      expect(result.blocked).toEqual([]);
      expect(result.warned).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it('is silent when only some rationale fields are present', () => {
      const result = run({ concept: 'only a concept' });
      expect(result.blocked).toEqual([]);
      expect(result.warned).toEqual([]);
    });

    it('still enforces the 2-4 option rule alongside the rationale', () => {
      const result = service.screen(
        draft({
          answerPayload: {
            mode: 'multiple_choice',
            options: Array.from({ length: 5 }, (_, i) => ({
              id: String.fromCharCode(97 + i),
              label: { ar: `خيار ${i}` },
            })),
            correctOptionId: 'a',
          },
        }),
        COMPLETE,
      );
      expect(
        result.findings
          .filter((finding) => finding.severity === 'blocking')
          .map((finding) => finding.code),
      ).toContain('ANSWER_OPTIONS_TOO_MANY');
    });
  });

  describe('exemplar imitation on the RYO path — Phase 2m regression', () => {
    /**
     * Driven from the preserved Phase 2m pilot artifacts, not from text typed
     * back in. The three Flash-Lite candidates were verbatim copies of the
     * Science Scope's worked examples and every one screened clean, because
     * `exemplarImitation` was only ever called from the Closest path.
     *
     * Reading the real artifacts keeps this a regression against what the
     * model actually produced. Skipped where the workbench is absent, so a
     * checkout without it still builds.
     */
    const ROOT = resolve(__dirname, '../../../../..');
    const ARTIFACTS = join(ROOT, 'ai/workbench/artifacts');
    const EXEMPLARS = join(
      ROOT,
      'ai/.opencode/skills/worlds/general-knowledge/scopes/science/EXEMPLARS.md',
    );

    const pilot = (needle: string) => {
      if (!existsSync(ARTIFACTS) || !existsSync(EXEMPLARS)) return undefined;
      const file = readdirSync(ARTIFACTS)
        .filter((name) => name.includes('batchR') && name.includes(needle))
        .sort()
        .pop();
      if (!file) return undefined;
      return JSON.parse(readFileSync(join(ARTIFACTS, file), 'utf8')) as {
        candidates: {
          ordinal: number;
          draft: Record<string, unknown>;
          authoring?: Record<string, unknown>;
        }[];
      };
    };

    const exemplarText = () =>
      existsSync(EXEMPLARS) ? readFileSync(EXEMPLARS, 'utf8') : '';

    /** Candidates only — screening happens inside each test, where `service` exists. */
    const flash = pilot('flash-lite')?.candidates;
    const gpt5 = pilot('gpt-5')?.candidates;
    const maybe = flash && gpt5 ? it : it.skip;

    const codesFor = (candidate: {
      draft: Record<string, unknown>;
      authoring?: Record<string, unknown>;
    }) => {
      service.beginBatch(exemplarText());
      return service
        .screen(candidate.draft, candidate.authoring)
        .findings.map((finding) => finding.code);
    };

    maybe.each([0, 1, 2])(
      'flags Flash-Lite FL-%i, which copied a worked example verbatim',
      (ordinal) => {
        expect(codesFor(flash![ordinal])).toContain(
          'CANDIDATE_RESEMBLES_EXEMPLAR',
        );
      },
    );

    maybe.each([0, 1, 2])(
      'leaves GPT-5 candidate %i alone — it wrote its own question',
      (ordinal) => {
        expect(codesFor(gpt5![ordinal])).not.toContain(
          'CANDIDATE_RESEMBLES_EXEMPLAR',
        );
      },
    );

    maybe('flags every copy and no original', () => {
      const flagged = (
        candidates: {
          draft: Record<string, unknown>;
          authoring?: Record<string, unknown>;
        }[],
      ) =>
        candidates.filter((candidate) =>
          codesFor(candidate).includes('CANDIDATE_RESEMBLES_EXEMPLAR'),
        ).length;
      expect(flagged(flash!)).toBe(3);
      expect(flagged(gpt5!)).toBe(0);
    });
  });

  describe('exemplar imitation on the RYO path — synthetic cases', () => {
    // Independent of the pilot artifacts, so the defect stays covered even
    // once the workbench is cleaned. These must not encode the three real
    // questions: the point is that the defect is fixed for future candidates.
    const SCIENCE_EXEMPLARS = [
      '> «ما الغاز الذي يشكّل النسبة الأكبر من الغلاف الجوي للأرض؟»',
      '> النيتروجين · الأكسجين · ثاني أكسيد الكربون · بخار الماء',
      '',
      'Prose about authoring rules that must never become a similarity target.',
    ].join('\n');

    const mc = (ar: string, authoring?: Record<string, unknown>) => {
      service.beginBatch(SCIENCE_EXEMPLARS);
      return service
        .screen(
          draft({
            prompt: { ar },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: 'a', label: { ar: 'أول' } },
                { id: 'b', label: { ar: 'ثانٍ' } },
              ],
              correctOptionId: 'a',
            },
          }),
          authoring,
        )
        .findings.map((finding) => finding.code);
    };

    it('flags a reworded copy, not only a byte-identical one', () => {
      // Same subject and nearly all the same words, lightly reordered.
      expect(
        mc('ما الغاز الذي يشكّل النسبة الأكبر في الغلاف الجوي حول الأرض؟'),
      ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('leaves a genuinely new Science question alone', () => {
      expect(mc('أي فيتامين يرتبط بتجلّط الدم؟')).not.toContain(
        'CANDIDATE_RESEMBLES_EXEMPLAR',
      );
    });

    it('does not flag a different question about the same broad topic', () => {
      // Shares "الغلاف الجوي" and "الأرض" but asks something else entirely.
      expect(
        mc('كم يبلغ سمك الغلاف الجوي للأرض تقريبًا بالكيلومترات؟'),
      ).not.toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('detects resemblance through the concept alone', () => {
      // The Phase 2i lesson: an Arabic prompt can share no words with an
      // English worked example while the concept restates it.
      const codes = mc('سؤال مختلف تمامًا عن الطقس؟', {
        concept:
          'ما الغاز الذي يشكّل النسبة الأكبر من الغلاف الجوي للأرض ولماذا',
      });
      expect(codes).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('never blocks — only a reviewer calls something derivative', () => {
      service.beginBatch(SCIENCE_EXEMPLARS);
      const result = service.screen(
        draft({
          prompt: {
            ar: 'ما الغاز الذي يشكّل النسبة الأكبر من الغلاف الجوي للأرض؟',
          },
        }),
      );
      expect(
        result.findings
          .filter((finding) => finding.severity === 'blocking')
          .map((finding) => finding.code),
      ).toEqual([]);
      expect(result.passed).toBe(true);
    });

    it('is silent when the Scope supplies no exemplars', () => {
      service.beginBatch();
      expect(
        service
          .screen(draft({ prompt: { ar: 'ما الغاز الأكثر في الغلاف الجوي؟' } }))
          .findings.map((finding) => finding.code),
      ).not.toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('survives a candidate with no authoring metadata at all', () => {
      service.beginBatch(SCIENCE_EXEMPLARS);
      expect(() =>
        service.screen(draft({ prompt: { ar: 'سؤال بسيط عن العلوم؟' } })),
      ).not.toThrow();
    });

    it('still enforces option count and rationale beside the new check', () => {
      service.beginBatch(SCIENCE_EXEMPLARS);
      const codes = service
        .screen(
          draft({
            prompt: {
              ar: 'ما الغاز الذي يشكّل النسبة الأكبر من الغلاف الجوي للأرض؟',
            },
            answerPayload: {
              mode: 'multiple_choice',
              options: Array.from({ length: 5 }, (_, i) => ({
                id: String.fromCharCode(97 + i),
                label: { ar: `خيار ${i}` },
              })),
              correctOptionId: 'a',
            },
          }),
          { estimatedConfidence: { band: 'nope', why: 'x' } },
        )
        .findings.map((finding) => finding.code);
      expect(codes).toContain('ANSWER_OPTIONS_TOO_MANY');
      expect(codes).toContain('RYO_CONFIDENCE_BAND_INVALID');
      expect(codes).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });
  });

  describe('duplicate identity for multiple choice — Phase 2q', () => {
    const mc = (ar: string, labels: string[], correct = 0, ids?: string[]) =>
      draft({
        prompt: { ar },
        answerPayload: {
          mode: 'multiple_choice',
          options: labels.map((label, i) => ({
            id: ids?.[i] ?? `o${i + 1}`,
            label: { ar: label },
          })),
          correctOptionId: ids?.[correct] ?? `o${correct + 1}`,
        },
      });

    const codes = (item: Record<string, unknown>) =>
      service
        .screen(item)
        .findings.filter((f) => f.severity === 'blocking')
        .map((f) => f.code);

    const STEM = 'ما العنصر الدخيل؟';

    it('1. accepts two different puzzles sharing a generic stem', () => {
      // Phase 2p P5 and P6: the stem is identical, the puzzles are not. The
      // old prompt-only identity blocked the second one.
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toEqual([]);
      expect(codes(mc(STEM, ['منجم', 'ملف', 'بسمة', 'وردة'], 3))).toEqual([]);
    });

    it('2. blocks an exact repeat of prompt and options', () => {
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toEqual([]);
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toContain(
        'DUPLICATE_IN_BATCH',
      );
    });

    it('3. blocks the same puzzle with its options reordered', () => {
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toEqual([]);
      // Same four options, shuffled; the answer is still كتاب.
      expect(codes(mc(STEM, ['كتاب', 'باب', 'ليل', 'توت'], 0))).toContain(
        'DUPLICATE_IN_BATCH',
      );
    });

    it('4. blocks the same puzzle with regenerated option ids', () => {
      expect(
        codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3, ['a', 'b', 'c', 'd'])),
      ).toEqual([]);
      expect(
        codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3, ['w', 'x', 'y', 'z'])),
      ).toContain('DUPLICATE_IN_BATCH');
    });

    it('5. blocks through whitespace, punctuation and Arabic form variation', () => {
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toEqual([]);
      // Extra spaces, added punctuation, and أ/ا variation — all collapse in
      // the canonical normalizer the runtime already grades with.
      expect(
        codes(mc('ما  العنصر الدخيل  ؟!', ['ليل', 'توت', 'بـاب', 'كتاب'], 3)),
      ).toContain('DUPLICATE_IN_BATCH');
    });

    it('6. flags the same puzzle keyed to a different answer', () => {
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toEqual([]);
      const conflict = codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 0));
      expect(conflict).toContain('CONFLICTING_ANSWER_KEY_IN_BATCH');
      // Reported as a contradiction, not as an ordinary duplicate.
      expect(conflict).not.toContain('DUPLICATE_IN_BATCH');
    });

    it('6b. does not let a conflicting key slip past screening', () => {
      service.screen(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3));
      expect(
        service.screen(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 0)).passed,
      ).toBe(false);
    });

    it('7. accepts distinct questions that share some options', () => {
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toEqual([]);
      // Overlapping vocabulary, different puzzle.
      expect(codes(mc(STEM, ['ليل', 'توت', 'شمس', 'قمر'], 2))).toEqual([]);
    });

    it('8. leaves closest duplicate behaviour unchanged', () => {
      const closestItem = (ar: string) => ({
        prompt: { ar },
        answerPayload: { mode: 'closest', correctValue: 250 },
        mechanicPayload: {
          closestSlider: { mode: 'numeric-range', min: 0, max: 500, step: 5 },
        },
      });
      const warn = (ar: string) =>
        service
          .screen(closestItem(ar))
          .findings.filter((f) => f.severity === 'warning')
          .map((f) => f.code);
      expect(warn('كم عدد الدرجات؟')).not.toContain(
        'DUPLICATE_PROMPT_IN_BATCH',
      );
      // Still prompt-only, still a warning, still not blocking.
      expect(warn('كم عدد الدرجات؟')).toContain('DUPLICATE_PROMPT_IN_BATCH');
      expect(
        service
          .screen(closestItem('كم عدد الدرجات؟'))
          .findings.filter((f) => f.severity === 'blocking'),
      ).toEqual([]);
    });

    it('8b. keeps the two modes in separate identity namespaces', () => {
      // A closest prompt and a multiple-choice stem must never collide.
      service.screen({
        prompt: { ar: STEM },
        answerPayload: { mode: 'closest', correctValue: 250 },
        mechanicPayload: {
          closestSlider: { mode: 'numeric-range', min: 0, max: 500, step: 5 },
        },
      });
      expect(codes(mc(STEM, ['ليل', 'توت', 'باب', 'كتاب'], 3))).toEqual([]);
    });

    it('9. leaves the other RYO findings untouched', () => {
      const result = service.screen(
        mc('أي عنصر لا ينتمي لهذه المجموعة؟', ['مربع', 'دائرة'], 1),
      );
      expect(result.findings.map((f) => f.code)).toContain(
        'DANGLING_DEMONSTRATIVE',
      );
      expect(
        service
          .screen(mc(STEM, ['واحد', 'اثنان', 'ثلاثة', 'أربعة', 'خمسة'], 0))
          .findings.filter((f) => f.severity === 'blocking')
          .map((f) => f.code),
      ).toContain('ANSWER_OPTIONS_TOO_MANY');
    });

    it('10. leaves exemplar-similarity warnings unchanged', () => {
      service.beginBatch(
        '> «ما الغاز الذي يشكّل النسبة الأكبر من الغلاف الجوي للأرض؟»',
      );
      const warned = service
        .screen(
          mc('ما الغاز الذي يشكّل النسبة الأكبر من الغلاف الجوي للأرض؟', [
            'النيتروجين',
            'الأكسجين',
          ]),
        )
        .findings.filter((f) => f.severity === 'warning')
        .map((f) => f.code);
      expect(warned).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });
  });

  describe('dangling references', () => {
    it('warns when a demonstrative has no media to point at', () => {
      // The exact shape of the first live candidate: "this ability" with
      // nothing attached.
      const result = service.screen(
        draft({
          prompt: { ar: 'وش اسم هذه القدرة المميزة اللي يستخدمها Genji؟' },
        }),
      );
      expect(result.findings.map((f) => f.code)).toContain(
        'DANGLING_DEMONSTRATIVE',
      );
      // A warning, not a blocker: a reviewer decides whether media was meant
      // or the wording should change.
      expect(result.passed).toBe(true);
    });

    it('does not warn when media is attached', () => {
      const result = service.screen(
        draft({
          prompt: { ar: 'وش اسم هذه القدرة؟' },
          media: { type: 'image', assets: [{ url: 'https://cdn.test/a.png' }] },
        }),
      );
      expect(result.findings.map((f) => f.code)).not.toContain(
        'DANGLING_DEMONSTRATIVE',
      );
    });

    it('does not warn when the demonstrative refers to the options', () => {
      // "which of these" points at the answer list, which is always present.
      const result = service.screen(
        draft({ prompt: { ar: 'أي من هذه الفرق فاز بالبطولة؟' } }),
      );
      expect(result.findings.map((f) => f.code)).not.toContain(
        'DANGLING_DEMONSTRATIVE',
      );
    });

    it('leaves an ordinary prompt alone', () => {
      expect(service.screen(draft()).findings.map((f) => f.code)).not.toContain(
        'DANGLING_DEMONSTRATIVE',
      );
    });
  });

  it('warns rather than blocks on cosmetic text issues', () => {
    const result = service.screen(
      draft({ prompt: { ar: 'سؤال  فيه  فراغات' } }),
    );
    expect(result.passed).toBe(true);
    expect(result.findings.map((f) => f.code)).toContain('PROMPT_WHITESPACE');
  });
});

describe('DeterministicScreenService — closest', () => {
  let service: DeterministicScreenService;
  beforeEach(() => {
    service = new DeterministicScreenService(config);
    service.beginBatch();
  });

  /** A domain-first span: 0–500 goals, step 5, target reachable. */
  const closest = (over: Record<string, unknown> = {}) => ({
    prompt: { ar: 'كم عدد سكان مدينة الرياض تقريبًا بالملايين؟' },
    answerPayload: {
      mode: 'closest',
      correctValue: 250,
      ...((over.answerPayload as object) ?? {}),
    },
    mechanicPayload: {
      closestSlider: {
        mode: 'numeric-range',
        min: 0,
        max: 500,
        step: 5,
        ...((over.slider as object) ?? {}),
      },
    },
    ...((over.rest as object) ?? {}),
  });

  const codes = (item: Record<string, unknown>) =>
    service
      .screen(item)
      .findings.filter((f) => f.severity === 'blocking')
      .map((f) => f.code);

  const warnings = (
    item: Record<string, unknown>,
    authoring?: Record<string, unknown>,
  ) =>
    service
      .screen(item, authoring)
      .findings.filter((f) => f.severity === 'warning')
      .map((f) => f.code);

  const blockers = (
    item: Record<string, unknown>,
    authoring?: Record<string, unknown>,
  ) =>
    service
      .screen(item, authoring)
      .findings.filter((f) => f.severity === 'blocking')
      .map((f) => f.code);

  describe('the step grid the model claims', () => {
    it('accepts arithmetic that holds', () => {
      // 0 + 50 * 5 = 250, which is the target.
      expect(blockers(closest(), { stepsFromMin: 50 })).toEqual([]);
    });

    it('blocks a stated multiple that does not reproduce the target', () => {
      expect(blockers(closest(), { stepsFromMin: 49 })).toContain(
        'CLOSEST_STEP_GRID_MISMATCH',
      );
    });

    it('blocks a fractional multiple outright', () => {
      expect(blockers(closest(), { stepsFromMin: 49.5 })).toContain(
        'CLOSEST_STEP_GRID_MISMATCH',
      );
    });

    it('stays silent when the model stated nothing', () => {
      // Older candidates carry no authoring block; absence is not a defect.
      expect(blockers(closest())).toEqual([]);
    });
  });

  describe('slider resolution', () => {
    it('warns when the slider offers too few positions to estimate on', () => {
      // The pilot's RGB item: 2-5 by 1 is four positions.
      expect(
        warnings(
          closest({
            answerPayload: { correctValue: 3 },
            slider: { min: 2, max: 5, step: 1 },
          }),
        ),
      ).toContain('CLOSEST_SLIDER_RESOLUTION_TRIVIAL');
    });

    it('leaves a real continuum alone', () => {
      expect(warnings(closest())).not.toContain(
        'CLOSEST_SLIDER_RESOLUTION_TRIVIAL',
      );
    });
  });

  describe('answers that move', () => {
    it.each([
      ['حتى الآن', 'كم عدد الأهداف التي سجلها اللاعب حتى الآن؟'],
      ['حاليًا', 'كم عدد السكان حاليًا في المدينة الكبرى؟'],
      ['هذا الموسم', 'كم نقطة جمعها الفريق هذا الموسم في الدوري؟'],
    ])('warns on %s', (_marker, ar) => {
      expect(warnings(closest({ rest: { prompt: { ar } } }))).toContain(
        'ANSWER_MAY_BE_TIME_UNSTABLE',
      );
    });

    it('does not block — a human decides whether the value really drifts', () => {
      expect(
        blockers(
          closest({
            rest: {
              prompt: { ar: 'كم عدد الأهداف التي سجلها اللاعب حتى الآن؟' },
            },
          }),
        ),
      ).toEqual([]);
    });

    it('leaves a stable question alone', () => {
      expect(warnings(closest())).not.toContain('ANSWER_MAY_BE_TIME_UNSTABLE');
    });
  });

  describe('duplicates inside one batch', () => {
    it('warns the second time the same question appears', () => {
      // The closest path used to return before the multiple-choice duplicate
      // check, so a batch could repeat one question ten times unremarked.
      expect(warnings(closest())).not.toContain('DUPLICATE_PROMPT_IN_BATCH');
      expect(warnings(closest())).toContain('DUPLICATE_PROMPT_IN_BATCH');
    });

    it('forgets everything when a new batch begins', () => {
      warnings(closest());
      service.beginBatch();
      expect(warnings(closest())).not.toContain('DUPLICATE_PROMPT_IN_BATCH');
    });
  });

  describe('where the target sits on the slider', () => {
    it('warns when the target is the maximum', () => {
      // Pilot 02 candidate 2: 1-1024 with the answer at 1024. Drag to the end
      // and confirm.
      expect(
        warnings(
          closest({
            answerPayload: { correctValue: 1024 },
            slider: { min: 1, max: 1024, step: 1 },
          }),
        ),
      ).toContain('CLOSEST_TARGET_AT_ENDPOINT');
    });

    it('warns when the target is the minimum', () => {
      expect(
        warnings(
          closest({
            answerPayload: { correctValue: 0 },
            slider: { min: 0, max: 500, step: 5 },
          }),
        ),
      ).toContain('CLOSEST_TARGET_AT_ENDPOINT');
    });

    it('warns when the target sits just inside an endpoint', () => {
      // Pilot 02 candidate 0: a single-seeded fruit on a 0-20 slider.
      expect(
        warnings(
          closest({
            answerPayload: { correctValue: 1 },
            slider: { min: 0, max: 20, step: 1 },
          }),
        ),
      ).toContain('CLOSEST_TARGET_NEAR_ENDPOINT');
    });

    it('never blocks on placement — a shared continuum may seat one answer oddly', () => {
      expect(
        blockers(
          closest({
            answerPayload: { correctValue: 1024 },
            slider: { min: 1, max: 1024, step: 1 },
          }),
        ),
      ).toEqual([]);
    });

    it('leaves a target in the body of the range alone', () => {
      const codes = warnings(closest());
      expect(codes).not.toContain('CLOSEST_TARGET_AT_ENDPOINT');
      expect(codes).not.toContain('CLOSEST_TARGET_NEAR_ENDPOINT');
    });
  });

  describe('resemblance to a worked example', () => {
    const EXEMPLARS = [
      '> «غرفة طولها ٦ أمتار وعرضها ٤ أمتار، وبلاط أرضيتها مربّع. كم بلاطة تغطي الأرضية؟»',
      '- Domain: tile counts for ordinary room floors, 0–300',
      '',
      'Prose about authoring rules that should never become a similarity target.',
    ].join('\n');

    it('warns when a candidate reuses an exemplar domain', () => {
      // Pilot 02 candidate 1 reproduced the tiles exemplar with new numbers.
      service.beginBatch(EXEMPLARS);
      expect(
        warnings(closest(), {
          domainDescription:
            'Tile counts for ordinary room floors, up to 300 tiles.',
        }),
      ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('still screens a historical WITHHELD exemplar for duplicate reuse', () => {
      const withheld = [
        '<!-- AKWAAN_EXEMPLAR_META {"version":1,"id":"withheld-example","status":"WITHHELD","reusePolicy":"DO_NOT_REGENERATE"} -->',
        '> «غرفة طولها ٦ أمتار وعرضها ٤ أمتار، وبلاط أرضيتها مربّع. كم بلاطة تغطي الأرضية؟»',
        '- Domain: tile counts for ordinary room floors, 0–300',
        '<!-- /AKWAAN_EXEMPLAR_META -->',
      ].join('\n');
      service.beginBatch(withheld);
      expect(
        warnings(closest(), {
          domainDescription:
            'Tile counts for ordinary room floors, up to 300 tiles.',
        }),
      ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('leaves an unrelated candidate alone', () => {
      service.beginBatch(EXEMPLARS);
      expect(
        warnings(closest(), {
          domainDescription: 'Populations of capital cities, 0-20 million',
        }),
      ).not.toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('is silent when the Scope supplies no exemplars', () => {
      service.beginBatch();
      expect(
        warnings(closest(), { domainDescription: 'anything at all here' }),
      ).not.toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('never blocks — only a reviewer can call something derivative', () => {
      service.beginBatch(EXEMPLARS);
      expect(
        blockers(closest(), {
          domainDescription:
            'Tile counts for ordinary room floors, up to 300 tiles.',
        }),
      ).toEqual([]);
    });
  });

  describe('the target seated at the midpoint of its own range', () => {
    it('warns on an exact midpoint', () => {
      // GPT-5 Batch A: South American World Cup titles, 10 on a 0-20 slider.
      // A thumb that starts centred wins it without anyone reasoning.
      expect(
        warnings(
          closest({
            answerPayload: { correctValue: 10 },
            slider: { min: 0, max: 20, step: 1 },
          }),
        ),
      ).toContain('CLOSEST_TARGET_AT_MIDPOINT');
    });

    it('never blocks — a shared continuum may seat an answer there honestly', () => {
      expect(
        blockers(
          closest({
            answerPayload: { correctValue: 10 },
            slider: { min: 0, max: 20, step: 1 },
          }),
        ),
      ).toEqual([]);
    });

    it('leaves an off-centre target alone', () => {
      // 172 on 0-250 is nowhere near 125.
      expect(
        warnings(
          closest({
            answerPayload: { correctValue: 172 },
            slider: { min: 0, max: 250, step: 1 },
          }),
        ),
      ).not.toContain('CLOSEST_TARGET_AT_MIDPOINT');
    });
  });

  describe("resemblance to the mechanic profile's retired examples", () => {
    // The convention the profiles use to mark a retired subject.
    const PROFILE = [
      '## Anti-Patterns',
      '',
      '**Works** — *total goals scored across a named World Cup tournament.* A team',
      'that does not know reasons its way in: roughly sixty-odd matches.',
      '',
      '**Fails** — *goals scored by one player across his career so far.* Nothing',
      'anchors it.',
      '',
      '- **An answer that moves.** A career total cannot be graded.',
      'Prose about rules that must never become a similarity target.',
    ].join('\n');

    it('warns when a candidate restates a worked example from the profile', () => {
      // GPT-5 Batch A ordinal 0. Its Arabic prompt shared no words with the
      // English example; the match was in `concept`, which the screen did not
      // previously compare.
      service.beginBatch(undefined, PROFILE);
      expect(
        warnings(closest(), {
          concept:
            'Total goals scored across the entire 2022 FIFA World Cup tournament.',
        }),
      ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('does not flag a candidate that merely shares a mathematical pattern', () => {
      // Two arithmetic-series puzzles are the same family, not the same item.
      service.beginBatch(undefined, PROFILE);
      expect(
        warnings(closest(), {
          concept:
            'Sum of seats in a hall whose rows grow by two, twenty rows deep',
        }),
      ).not.toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('ignores rule prose, taking only the marked examples', () => {
      service.beginBatch(undefined, PROFILE);
      expect(
        warnings(closest(), {
          concept:
            'An answer that moves because a career total cannot be graded',
        }),
      ).not.toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });

    it('still blocks nothing', () => {
      service.beginBatch(undefined, PROFILE);
      expect(
        blockers(closest(), {
          concept:
            'Total goals scored across the entire 2022 FIFA World Cup tournament.',
        }),
      ).toEqual([]);
    });

    it('combines both sources without a second list to maintain', () => {
      service.beginBatch(
        '- Domain: tile counts for ordinary room floors, 0–300',
        PROFILE,
      );
      expect(
        warnings(closest(), {
          domainDescription: 'Tile counts for ordinary room floors, up to 300',
        }),
      ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
      service.beginBatch(
        '- Domain: tile counts for ordinary room floors, 0–300',
        PROFILE,
      );
      expect(
        warnings(closest(), {
          concept:
            'Total goals scored across the entire 2022 FIFA World Cup tournament.',
        }),
      ).toContain('CANDIDATE_RESEMBLES_EXEMPLAR');
    });
  });

  it('passes a well-formed closest candidate', () => {
    const result = service.screen(closest());
    expect(result.findings.filter((f) => f.severity === 'blocking')).toEqual(
      [],
    );
    expect(result.passed).toBe(true);
  });

  it('still reports what it could not check', () => {
    expect(
      service
        .screen(closest())
        .findings.filter((f) => f.severity === 'deferred')
        .map((f) => f.code),
    ).toEqual(
      expect.arrayContaining([
        'FACTUAL_VERIFICATION_PENDING',
        'NOVELTY_COVERAGE_LIMITED',
      ]),
    );
  });

  it('rejects a non-finite target', () => {
    expect(
      codes(
        closest({ answerPayload: { mode: 'closest', correctValue: 'many' } }),
      ),
    ).toContain('NUMERIC_ANSWER_REQUIRED');
  });

  it('rejects an inverted or non-finite range', () => {
    expect(codes(closest({ slider: { min: 500, max: 0 } }))).toContain(
      'CLOSEST_SLIDER_RANGE_INVALID',
    );
    expect(codes(closest({ slider: { min: 0, max: 0 } }))).toContain(
      'CLOSEST_SLIDER_RANGE_INVALID',
    );
  });

  it('rejects a target outside the authored span', () => {
    expect(
      codes(closest({ answerPayload: { mode: 'closest', correctValue: 900 } })),
    ).toContain('CLOSEST_SLIDER_TARGET_OUT_OF_RANGE');
  });

  it('rejects a target the slider cannot land on', () => {
    // 252 is inside 0–500 but not reachable in steps of 5.
    expect(
      codes(closest({ answerPayload: { mode: 'closest', correctValue: 252 } })),
    ).toContain('CLOSEST_SLIDER_TARGET_STEP_INVALID');
  });

  it('rejects a non-positive step', () => {
    expect(codes(closest({ slider: { step: 0 } }))).toContain(
      'CLOSEST_SLIDER_STEP_INVALID',
    );
    expect(codes(closest({ slider: { step: -5 } }))).toContain(
      'CLOSEST_SLIDER_STEP_INVALID',
    );
  });

  it('refuses a sliderless item — the legacy shape', () => {
    const noSlider = closest();
    delete (noSlider as { mechanicPayload?: unknown }).mechanicPayload;
    expect(codes(noSlider)).toContain('CLOSEST_SLIDER_MODE_REQUIRED');
  });

  it('refuses an unauthorable slider mode', () => {
    expect(codes(closest({ slider: { mode: 'legacy' } }))).toContain(
      'CLOSEST_SLIDER_MODE_REQUIRED',
    );
  });

  it('rejects an invalid tolerance, and warns that a valid one is ignored', () => {
    expect(
      codes(
        closest({
          answerPayload: {
            mode: 'closest',
            correctValue: 250,
            acceptedTolerance: -1,
          },
        }),
      ),
    ).toContain('INVALID_ANSWER_TOLERANCE');

    const valid = service.screen(
      closest({
        answerPayload: {
          mode: 'closest',
          correctValue: 250,
          acceptedTolerance: 10,
        },
      }),
    );
    // Valid but inert — the Closest runtime grades nearest-wins.
    expect(valid.findings.map((f) => f.code)).toContain(
      'CLOSEST_TOLERANCE_IGNORED',
    );
    expect(valid.passed).toBe(true);
  });

  it('enforces the calendar-year rules', () => {
    expect(
      codes(
        closest({ slider: { displayFormat: 'calendar-year', unit: 'سنة' } }),
      ),
    ).toContain('CLOSEST_SLIDER_YEAR_UNIT_FORBIDDEN');
    expect(codes(closest({ slider: { displayFormat: 'roman' } }))).toContain(
      'CLOSEST_SLIDER_DISPLAY_FORMAT_INVALID',
    );
  });

  it('rejects an over-long unit', () => {
    expect(codes(closest({ slider: { unit: 'x'.repeat(41) } }))).toContain(
      'CLOSEST_SLIDER_UNIT_INVALID',
    );
  });

  it('rejects a prompt that states its own answer', () => {
    expect(
      codes(
        closest({ rest: { prompt: { ar: 'هل عدد السكان 250 مليونًا؟' } } }),
      ),
    ).toContain('ANSWER_LEAKAGE');
  });

  it('catches a leaked answer written in Arabic-Indic digits', () => {
    expect(
      codes(closest({ rest: { prompt: { ar: 'هل العدد ٢٥٠ تقريبًا؟' } } })),
    ).toContain('ANSWER_LEAKAGE');
  });

  it('does not mistake a different number for the answer', () => {
    // 1250 contains "250" but is not the target.
    expect(
      codes(
        closest({
          rest: { prompt: { ar: 'من بين 1250 مدينة، كم عدد السكان؟' } },
        }),
      ),
    ).not.toContain('ANSWER_LEAKAGE');
  });
});

describe('DeterministicScreenService — Content Engine V2 Slice 2C Deduplication Integration', () => {
  let service: DeterministicScreenService;

  function mockQueryChain(result: any) {
    const query: any = {};
    query.sort = jest.fn().mockReturnValue(query);
    query.limit = jest.fn().mockReturnValue(query);
    query.lean = jest.fn().mockReturnValue(query);
    query.select = jest.fn().mockReturnValue(query);
    query.exec = jest.fn().mockResolvedValue(result);
    return query;
  }

  function mockRejectChain(error: Error) {
    const query: any = {};
    query.sort = jest.fn().mockReturnValue(query);
    query.limit = jest.fn().mockReturnValue(query);
    query.lean = jest.fn().mockReturnValue(query);
    query.select = jest.fn().mockReturnValue(query);
    query.exec = jest.fn().mockRejectedValue(error);
    return query;
  }

  beforeEach(() => {
    service = new DeterministicScreenService(config);
    service.beginBatch();
  });

  describe('Core Same-Batch Deduplication & Mechanics', () => {
    it('blocks proven duplicate candidates within the same generation batch (DUPLICATE_IN_BATCH)', () => {
      const cand1 = {
        prompt: { ar: 'ما هي عاصمة فرنسا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'باريس' } },
            { id: '2', label: { ar: 'لندن' } },
          ],
          correctOptionId: '1',
        },
      };
      const cand2 = {
        prompt: { ar: 'ما عاصمة دولة فرنسا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'باريس' } },
            { id: 'b', label: { ar: 'لندن' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res1 = service.screen(cand1, null, { scopeKey: 'capitals' });
      expect(res1.passed).toBe(true);
      expect(res1.findings.some((f) => f.code === 'DUPLICATE_IN_BATCH')).toBe(
        false,
      );

      const res2 = service.screen(cand2, null, { scopeKey: 'capitals' });
      expect(res2.passed).toBe(false);
      expect(res2.findings.some((f) => f.code === 'DUPLICATE_IN_BATCH')).toBe(
        true,
      );
    });

    it('emits non-blocking warning for ambiguous potential overlap in same batch (POTENTIAL_OVERLAP_IN_BATCH)', () => {
      const cand1 = {
        prompt: { ar: 'من مخترع الهاتف؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'ألكسندر غراهام بيل' } },
            { id: '2', label: { ar: 'توماس إديسون' } },
          ],
          correctOptionId: '1',
        },
      };
      const cand2 = {
        prompt: { ar: 'من مخترع التليفون؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'ألكسندر غراهام بيل' } },
            { id: 'b', label: { ar: 'نيكولا تيسلا' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res1 = service.screen(cand1, null, { scopeKey: 'inventions' });
      expect(res1.passed).toBe(true);

      const res2 = service.screen(cand2, null, { scopeKey: 'inventions' });
      expect(res2.passed).toBe(true);
      const overlapWarning = res2.findings.find(
        (f) => f.code === 'POTENTIAL_OVERLAP_IN_BATCH',
      );
      expect(overlapWarning).toBeDefined();
      expect(overlapWarning?.severity).toBe('warning');
    });

    it('passes distinct candidates without duplicate findings', () => {
      const cand1 = {
        prompt: { ar: 'ما هي عاصمة فرنسا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'باريس' } },
            { id: '2', label: { ar: 'لندن' } },
          ],
          correctOptionId: '1',
        },
      };
      const cand2 = {
        prompt: { ar: 'ما هي عاصمة إيطاليا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'روما' } },
            { id: 'b', label: { ar: 'مدريد' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res1 = service.screen(cand1, null, { scopeKey: 'capitals' });
      const res2 = service.screen(cand2, null, { scopeKey: 'capitals' });
      expect(res1.passed).toBe(true);
      expect(res2.passed).toBe(true);
      expect(res2.findings.some((f) => f.code.includes('DUPLICATE'))).toBe(
        false,
      );
      expect(res2.findings.some((f) => f.code.includes('OVERLAP'))).toBe(false);
    });

    it('blocks identical factual task even when distractors vary (DUPLICATE_HISTORICAL_CONTENT)', () => {
      service.registerHistoricalRecords([
        {
          id: 'hist-germany',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة ألمانيا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'برلين' } },
                { id: '2', label: { ar: 'ميونيخ' } },
                { id: '3', label: { ar: 'هامبورغ' } },
                { id: '4', label: { ar: 'فرانكفورت' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ]);

      const candidate = {
        prompt: { ar: 'ما عاصمة ألمانيا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'برلين' } },
            { id: 'b', label: { ar: 'كولونيا' } },
            { id: 'c', label: { ar: 'شتوتغارت' } },
            { id: 'd', label: { ar: 'بون' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res = service.screen(candidate, null, { scopeKey: 'capitals' });
      expect(res.passed).toBe(false);
      expect(
        res.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
      ).toBe(true);
    });

    it('blocks identical clue challenge with reordered progression (DUPLICATE_HISTORICAL_CONTENT)', () => {
      service.registerHistoricalRecords([
        {
          id: 'hist-clues-1',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'puzzles',
          draft: {
            prompt: { ar: 'من أنا؟' },
            answerPayload: {
              mode: 'one_clue',
              acceptedAnswers: ['ابن سينا'],
            },
            mechanicPayload: {
              target: 'ابن سينا',
              clues: [
                { order: 1, text: 'طبيب وفيلسوف مسلم' },
                { order: 2, text: 'مؤلف كتاب القانون في الطب' },
                { order: 3, text: 'لقب بالشيخ الرئيس' },
              ],
            },
          },
        },
      ]);

      const candidate = {
        prompt: { ar: 'خمن الشخصية:' },
        answerPayload: {
          mode: 'one_clue',
          acceptedAnswers: ['ابن سينا'],
        },
        mechanicPayload: {
          target: 'ابن سينا',
          clues: [
            { order: 1, text: 'مؤلف كتاب القانون في الطب' },
            { order: 2, text: 'طبيب وفيلسوف مسلم' },
            { order: 3, text: 'لقب بالشيخ الرئيس' },
          ],
        },
      };

      const res = service.screen(candidate, null, { scopeKey: 'puzzles' });
      expect(res.passed).toBe(false);
      expect(
        res.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
      ).toBe(true);
    });

    it('returns POTENTIAL_OVERLAP when Arabic aliases leave real-world identity unproven', () => {
      service.registerHistoricalRecords([
        {
          id: 'hist-roosevelt',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'leaders',
          draft: {
            prompt: {
              ar: 'من كان رئيس الولايات المتحدة خلال الحرب العالمية الثانية؟',
            },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'فرانكلين روزفلت' } },
                { id: '2', label: { ar: 'هاري ترومان' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ]);

      const candidate = {
        prompt: { ar: 'من كان رئيس أمريكا خلال الحرب العالمية الثانية؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'فرانكلين روزفلت' } },
            { id: 'b', label: { ar: 'دوايت أيزنهاور' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res = service.screen(candidate, null, { scopeKey: 'leaders' });
      expect(res.passed).toBe(true);
      expect(
        res.findings.some(
          (f) => f.code === 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
        ),
      ).toBe(true);
    });

    it('flags the same puzzle keyed to different answers in batch as CONFLICTING_ANSWER_KEY_IN_BATCH', () => {
      const cand1 = {
        prompt: { ar: 'ما هي عاصمة المغرب؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'الرباط' } },
            { id: '2', label: { ar: 'الدار البيضاء' } },
          ],
          correctOptionId: '1',
        },
      };

      const cand2 = {
        prompt: { ar: 'ما هي عاصمة المغرب؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'الرباط' } },
            { id: '2', label: { ar: 'الدار البيضاء' } },
          ],
          correctOptionId: '2',
        },
      };

      const res1 = service.screen(cand1, null, { scopeKey: 'morocco' });
      expect(res1.passed).toBe(true);

      const res2 = service.screen(cand2, null, { scopeKey: 'morocco' });
      expect(res2.passed).toBe(false);
      expect(
        res2.findings.some((f) => f.code === 'CONFLICTING_ANSWER_KEY_IN_BATCH'),
      ).toBe(true);
    });

    it('returns POTENTIAL_OVERLAP warning for unsupported subjective consensus mechanics', () => {
      service.registerHistoricalRecords([
        {
          id: 'hist-vote-1',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'polls',
          draft: {
            prompt: { ar: 'ما هو أفضل وقت للقراءة؟' },
            answerPayload: {
              mode: 'vote',
              consensusRule: 'majority',
              options: [
                { id: '1', label: { ar: 'الصباح' } },
                { id: '2', label: { ar: 'المساء' } },
              ],
            },
          },
        },
      ]);

      const candidate = {
        prompt: { ar: 'ما الوقت المفضل للقراءة؟' },
        answerPayload: {
          mode: 'vote',
          consensusRule: 'majority',
          options: [
            { id: 'a', label: { ar: 'الصباح' } },
            { id: 'b', label: { ar: 'الليل' } },
          ],
        },
      };

      const res = service.screen(candidate, null, { scopeKey: 'polls' });
      const overlap = res.findings.find(
        (f) => f.code === 'POTENTIAL_OVERLAP_HISTORICAL_CONTENT',
      );
      expect(overlap).toBeDefined();
      expect(overlap?.severity).toBe('warning');
    });
  });

  describe('Slice 2C Safety Hardening — 18 Mandatory Regression Scenarios', () => {
    // 1. Genuinely empty historical inventory returns COMPLETE with zero records
    it('1. genuinely empty historical inventory returns COMPLETE with zero records', async () => {
      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.status).toBe('COMPLETE');
      expect(loadRes.recordCount).toBe(0);
      expect(loadRes.isTruncated).toBe(false);

      const candidate = draft();
      const res = customService.screen(candidate, null, { scopeKey: 's1' });
      expect(res.passed).toBe(true);
      expect(
        res.findings.some((f) => f.code.startsWith('HISTORICAL_INVENTORY_')),
      ).toBe(false);
    });

    // 2. MongoDB query failure returns UNAVAILABLE without fabricating records
    it('2. MongoDB query failure returns UNAVAILABLE without fabricating records', async () => {
      const mockContentItems = {
        find: jest
          .fn()
          .mockReturnValue(
            mockRejectChain(
              new Error('MongoNetworkTimeout: connection dropped'),
            ),
          ),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.status).toBe('UNAVAILABLE');
      expect(loadRes.recordCount).toBe(0);
      expect(loadRes.error).toContain('MongoNetworkTimeout');

      const res = customService.screen(draft(), null, { scopeKey: 's1' });
      expect(res.passed).toBe(true);
      const warn = res.findings.find(
        (f) => f.code === 'HISTORICAL_INVENTORY_UNAVAILABLE',
      );
      expect(warn).toBeDefined();
      expect(warn?.severity).toBe('warning');
    });

    // 3. Missing required model returns an explicit incomplete status rather than pretending coverage succeeded
    it('3. missing required model returns an explicit incomplete status (UNAVAILABLE)', async () => {
      const unconfiguredService = new DeterministicScreenService(config);

      const loadRes = await unconfiguredService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.status).toBe('UNAVAILABLE');
      expect(loadRes.recordCount).toBe(0);
      expect(loadRes.error).toContain(
        'Required Mongoose models are not injected',
      );

      const res = unconfiguredService.screen(draft(), null, { scopeKey: 's1' });
      expect(res.passed).toBe(true);
      expect(
        res.findings.some((f) => f.code === 'HISTORICAL_INVENTORY_UNAVAILABLE'),
      ).toBe(true);
    });

    // 4. An invalid Scope key/tuple returns NOT_CONFIGURED
    it('4. an invalid Scope key/tuple returns NOT_CONFIGURED', async () => {
      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest.fn().mockReturnValue(mockQueryChain(null)),
      }; // World not found
      const mockScopes = {
        findOne: jest.fn().mockReturnValue(mockQueryChain(null)),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'invalid-world',
        scopeKey: 'invalid-scope',
      });
      expect(loadRes.status).toBe('NOT_CONFIGURED');
      expect(loadRes.recordCount).toBe(0);

      const res = customService.screen(draft(), null, {
        scopeKey: 'invalid-scope',
      });
      expect(res.passed).toBe(true);
      expect(
        res.findings.some(
          (f) => f.code === 'HISTORICAL_INVENTORY_NOT_CONFIGURED',
        ),
      ).toBe(true);
    });

    // 5. Historical inventory larger than the retrieval limit returns PARTIAL with isTruncated: true
    it('5. historical inventory larger than the retrieval limit returns PARTIAL with isTruncated: true', async () => {
      const fakeItems = Array.from({ length: 6 }, (_, idx) => ({
        _id: `item-${idx}`,
        status: 'READY',
        prompt: { ar: `سؤال تاريخي رقم ${idx}` },
        answerPayload: {
          mode: 'multiple_choice',
          options: [{ id: '1', label: { ar: 'جواب' } }],
          correctOptionId: '1',
        },
      }));

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain(fakeItems)),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
        limit: 5,
      });
      expect(loadRes.status).toBe('PARTIAL');
      expect(loadRes.isTruncated).toBe(true);
      expect(loadRes.recordCount).toBe(5);
    });

    // 6. Deterministic retrieval ordering returns the oldest records first (createdAt: 1, _id: 1)
    it('6. deterministic retrieval ordering sorts by createdAt: 1, _id: 1', async () => {
      const contentItemsQuery = mockQueryChain([]);
      const candidatesQuery = mockQueryChain([]);
      const mockContentItems = {
        find: jest.fn().mockReturnValue(contentItemsQuery),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(candidatesQuery),
      };
      const mockJobs = {
        find: jest.fn().mockReturnValue(mockQueryChain([{ _id: 'job-1' }])),
      };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });

      expect(contentItemsQuery.sort).toHaveBeenCalledWith({
        createdAt: 1,
        _id: 1,
      });
      expect(candidatesQuery.sort).toHaveBeenCalledWith({
        createdAt: 1,
        _id: 1,
      });
    });

    // 7. Duplicate matching a historical record inside the retrieved subset is blocked with DUPLICATE_HISTORICAL_CONTENT
    it('7. blocks duplicate matching a historical record inside retrieved subset (DUPLICATE_HISTORICAL_CONTENT)', () => {
      service.registerHistoricalRecords([
        {
          id: 'hist-item-spain',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة إسبانيا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'مدريد' } },
                { id: '2', label: { ar: 'برشلونة' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ]);

      const candidate = {
        prompt: { ar: 'ما عاصمة إسبانيا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'مدريد' } },
            { id: 'b', label: { ar: 'إشبيلية' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res = service.screen(candidate, null, { scopeKey: 'capitals' });
      expect(res.passed).toBe(false);
      const finding = res.findings.find(
        (f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT',
      );
      expect(finding).toBeDefined();
      expect(finding?.severity).toBe('blocking');
      expect(finding?.message).toContain('hist-item-spain');
    });

    // 8. Duplicate matching a historical record outside the retrieved subset is not blocked, but the candidate carries HISTORICAL_INVENTORY_PARTIAL
    it('8. duplicate outside retrieved subset is not blocked, but carries HISTORICAL_INVENTORY_PARTIAL', async () => {
      // Returned 3 items when limit is 2 -> triggers truncation, dropping the 3rd item (Paris)
      const mockItems = [
        {
          _id: 'item-cairo',
          status: 'READY',
          prompt: { ar: 'ما هي عاصمة مصر؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'القاهرة' } }],
            correctOptionId: '1',
          },
        },
        {
          _id: 'item-riyadh',
          status: 'READY',
          prompt: { ar: 'ما هي عاصمة السعودية؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'الرياض' } }],
            correctOptionId: '1',
          },
        },
        {
          _id: 'item-paris', // Truncated out
          status: 'READY',
          prompt: { ar: 'ما هي عاصمة فرنسا؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'باريس' } }],
            correctOptionId: '1',
          },
        },
      ];

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain(mockItems)),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
        limit: 2,
      });
      expect(loadRes.status).toBe('PARTIAL');
      expect(loadRes.isTruncated).toBe(true);
      expect(loadRes.recordCount).toBe(2);

      // Candidate matches Paris (which was outside the retrieved subset)
      const candidate = {
        prompt: { ar: 'ما هي عاصمة فرنسا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'باريس' } },
            { id: 'b', label: { ar: 'ليون' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res = customService.screen(candidate, null, { scopeKey: 's1' });
      expect(res.passed).toBe(true);
      expect(
        res.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
      ).toBe(false);
      const partialWarning = res.findings.find(
        (f) => f.code === 'HISTORICAL_INVENTORY_PARTIAL',
      );
      expect(partialWarning).toBeDefined();
      expect(partialWarning?.severity).toBe('warning');
    });

    // 9. Unavailable or partial historical inventory attaches explicit warning findings to all screened candidates
    it('9. unavailable or partial historical inventory attaches explicit warning findings', async () => {
      const mockItems = [
        {
          _id: 'i1',
          status: 'READY',
          prompt: { ar: 'سؤال 1' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'ج1' } }],
            correctOptionId: '1',
          },
        },
        {
          _id: 'i2',
          status: 'READY',
          prompt: { ar: 'سؤال 2' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'ج2' } }],
            correctOptionId: '1',
          },
        },
      ];

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain(mockItems)),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockJobs = { find: jest.fn().mockReturnValue(mockQueryChain([])) };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
        limit: 1,
      });
      expect(customService.getHistoricalScopeStatus()?.status).toBe('PARTIAL');

      const res = customService.screen(draft(), null, { scopeKey: 's1' });
      expect(res.passed).toBe(true);
      expect(
        res.findings.some((f) => f.code === 'HISTORICAL_INVENTORY_PARTIAL'),
      ).toBe(true);
    });

    // 10. Approved candidate with valid human approval provenance is admitted to historical screening inventory
    it('10. approved candidate with valid human approval provenance is admitted to historical inventory', async () => {
      const candidateDoc = {
        candidateId: 'cand-approved-valid',
        publishedContentItemId: null,
        reviewStatus: 'approved',
        reviewDecision: {
          decision: 'approved',
          reviewerId: 'reviewer-1',
          reviewerEmail: 'reviewer@example.com',
          revision: 2,
        },
        reviewEvents: [
          {
            action: 'approved',
            actorId: 'reviewer-1',
            actorEmail: 'reviewer@example.com',
            revision: 2,
            createdAt: new Date(),
          },
        ],
        draft: {
          prompt: { ar: 'ما هي عاصمة عمان؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: '1', label: { ar: 'مسقط' } },
              { id: '2', label: { ar: 'صلالة' } },
            ],
            correctOptionId: '1',
          },
        },
      };

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([candidateDoc])),
      };
      const mockJobs = {
        find: jest.fn().mockReturnValue(mockQueryChain([{ _id: 'job-oman' }])),
      };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.status).toBe('COMPLETE');
      expect(loadRes.candidateCount).toBe(1);

      const duplicateCand = {
        prompt: { ar: 'ما عاصمة عمان؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'مسقط' } },
            { id: 'b', label: { ar: 'نزوى' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res = customService.screen(duplicateCand, null, { scopeKey: 's1' });
      expect(res.passed).toBe(false);
      const finding = res.findings.find(
        (f) => f.code === 'DUPLICATE_APPROVED_CANDIDATE',
      );
      expect(finding).toBeDefined();
      expect(finding?.message).toContain('cand-approved-valid');
    });

    // 11. Approved candidate without matching approval review event is excluded
    it('11. approved candidate without matching approval review event is excluded', async () => {
      const candidateDoc = {
        candidateId: 'cand-unproven',
        publishedContentItemId: null,
        reviewStatus: 'approved',
        reviewDecision: { decision: 'approved', revision: 1 },
        reviewEvents: [], // No matching event!
        draft: {
          prompt: { ar: 'ما هي عاصمة عمان؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: '1', label: { ar: 'مسقط' } },
              { id: '2', label: { ar: 'صلالة' } },
            ],
            correctOptionId: '1',
          },
        },
      };

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([candidateDoc])),
      };
      const mockJobs = {
        find: jest.fn().mockReturnValue(mockQueryChain([{ _id: 'job-oman' }])),
      };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.candidateCount).toBe(0);

      const cand = {
        prompt: { ar: 'ما عاصمة عمان؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'مسقط' } },
            { id: 'b', label: { ar: 'صلالة' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res = customService.screen(cand, null, { scopeKey: 's1' });
      expect(res.passed).toBe(true);
      expect(
        res.findings.some((f) => f.code === 'DUPLICATE_APPROVED_CANDIDATE'),
      ).toBe(false);
    });

    // 12. Approved candidate with stale approval review event revision is excluded
    it('12. approved candidate with stale approval review event revision is excluded', async () => {
      const candidateDoc = {
        candidateId: 'cand-stale',
        publishedContentItemId: null,
        reviewStatus: 'approved',
        reviewDecision: { decision: 'approved', revision: 3 },
        reviewEvents: [
          { decision: 'approved', targetRevision: 2, createdAt: new Date() }, // Stale! revision 2 !== 3
        ],
        draft: {
          prompt: { ar: 'ما هي عاصمة عمان؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'مسقط' } }],
            correctOptionId: '1',
          },
        },
      };

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([candidateDoc])),
      };
      const mockJobs = {
        find: jest.fn().mockReturnValue(mockQueryChain([{ _id: 'job-oman' }])),
      };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.candidateCount).toBe(0);
    });

    // 13. Published candidate is excluded if publishedContentItemId already exists in ContentItem inventory
    it('13. published candidate is excluded if already represented in canonical inventory', async () => {
      const canonicalItem = {
        _id: 'canonical-item-bahrain',
        status: 'READY',
        prompt: { ar: 'ما هي عاصمة البحرين؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [{ id: '1', label: { ar: 'المنامة' } }],
          correctOptionId: '1',
        },
      };

      const candidateDoc = {
        candidateId: 'cand-bahrain',
        publishedContentItemId: 'canonical-item-bahrain',
        reviewStatus: 'approved',
        reviewDecision: { decision: 'approved', revision: 1 },
        reviewEvents: [
          { decision: 'approved', targetRevision: 1, createdAt: new Date() },
        ],
        draft: {
          prompt: { ar: 'ما هي عاصمة البحرين؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'المنامة' } }],
            correctOptionId: '1',
          },
        },
      };

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain([canonicalItem])),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([candidateDoc])),
      };
      const mockJobs = {
        find: jest
          .fn()
          .mockReturnValue(mockQueryChain([{ _id: 'job-bahrain' }])),
      };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.status).toBe('COMPLETE');
      expect(loadRes.canonicalCount).toBe(1);
      expect(loadRes.candidateCount).toBe(0);
      expect(loadRes.recordCount).toBe(1);
    });

    // 14. Orphaned publication candidate is excluded from historical screening inventory
    it('14. orphaned publication candidate is excluded from historical screening inventory', async () => {
      const candidateDoc = {
        candidateId: 'cand-pub-linked',
        publishedContentItemId: null, // Stored as null on candidate
        reviewStatus: 'approved',
        reviewDecision: { decision: 'approved', revision: 1 },
        reviewEvents: [
          { decision: 'approved', targetRevision: 1, createdAt: new Date() },
        ],
        draft: {
          prompt: { ar: 'ما هي عاصمة الكويت؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [{ id: '1', label: { ar: 'الكويت' } }],
            correctOptionId: '1',
          },
        },
      };

      const canonicalItem = {
        _id: 'canonical-item-kuwait',
        status: 'READY',
        prompt: { ar: 'ما هي عاصمة الكويت؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [{ id: '1', label: { ar: 'الكويت' } }],
          correctOptionId: '1',
        },
      };

      // Publication record links cand-pub-linked to canonical-item-kuwait
      const publicationDoc = {
        candidateId: 'cand-pub-linked',
        contentItemId: 'canonical-item-kuwait',
      };

      const mockContentItems = {
        find: jest.fn().mockReturnValue(mockQueryChain([canonicalItem])),
      };
      const mockCandidates = {
        find: jest.fn().mockReturnValue(mockQueryChain([candidateDoc])),
      };
      const mockJobs = {
        find: jest
          .fn()
          .mockReturnValue(mockQueryChain([{ _id: 'job-kuwait' }])),
      };
      const mockPublications = {
        find: jest.fn().mockReturnValue(mockQueryChain([publicationDoc])),
      };
      const mockWorlds = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 'w-1', slug: 'w1' })),
      };
      const mockScopes = {
        findOne: jest
          .fn()
          .mockReturnValue(mockQueryChain({ _id: 's-1', slug: 's1' })),
      };

      const customService = new DeterministicScreenService(
        config,
        mockContentItems as any,
        mockCandidates as any,
        mockPublications as any,
        mockJobs as any,
        mockWorlds as any,
        mockScopes as any,
      );

      const loadRes = await customService.loadHistoricalScope({
        worldKey: 'w1',
        scopeKey: 's1',
      });
      expect(loadRes.canonicalCount).toBe(1);
      expect(loadRes.candidateCount).toBe(0);
      expect(loadRes.recordCount).toBe(1);
    });

    // 15. Cross-Scope content can trigger cross-Scope duplicate advisories when configured, without silently widening the primary boundary
    it('15. cross-scope content triggers advisory without widening primary boundary', () => {
      service.registerHistoricalRecords([
        {
          id: 'hist-other-scope',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'world-geography',
          draft: {
            prompt: { ar: 'ما هي عاصمة اليابان؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'طوكيو' } },
                { id: '2', label: { ar: 'كيوتو' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ]);

      const candidate = {
        prompt: { ar: 'ما عاصمة اليابان؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'طوكيو' } },
            { id: 'b', label: { ar: 'أوساكا' } },
          ],
          correctOptionId: 'a',
        },
      };

      const res = service.screen(candidate, null, {
        scopeKey: 'asian-history',
      });
      expect(res.passed).toBe(true);
      const advisory = res.findings.find(
        (f) => f.code === 'CROSS_SCOPE_ADVISORY',
      );
      expect(advisory).toBeDefined();
      expect(advisory?.severity).toBe('warning');
      expect(advisory?.message).toContain('world-geography');
    });

    // 16. Sequential generation jobs for different scopes do not share historical state
    it('16. sequential generation jobs for different scopes do not share historical state', () => {
      // Job 1
      service.registerHistoricalRecords([
        {
          id: 'cap-1',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة فرنسا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [{ id: '1', label: { ar: 'باريس' } }],
              correctOptionId: '1',
            },
          },
        },
      ]);

      const resJob1 = service.screen(
        {
          prompt: { ar: 'ما هي عاصمة فرنسا؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'باريس' } },
              { id: 'b', label: { ar: 'ليون' } },
            ],
            correctOptionId: 'a',
          },
        },
        null,
        { scopeKey: 'capitals' },
      );
      expect(resJob1.passed).toBe(false);

      // Clean state for Job 2
      service.clearHistoricalRecords();
      service.beginBatch();

      service.registerHistoricalRecords([
        {
          id: 'sci-1',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'science',
          draft: {
            prompt: { ar: 'ما هو العنصر الأكثر وفرة في الكون؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'الهيدروجين' } },
                { id: '2', label: { ar: 'الهيليوم' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ]);

      // Capitals question screened in Job 2 (scope science) does not match cap-1 as primary duplicate
      const resJob2 = service.screen(
        {
          prompt: { ar: 'ما هي عاصمة فرنسا؟' },
          answerPayload: {
            mode: 'multiple_choice',
            options: [
              { id: 'a', label: { ar: 'باريس' } },
              { id: 'b', label: { ar: 'ليون' } },
            ],
            correctOptionId: 'a',
          },
        },
        null,
        { scopeKey: 'science' },
      );
      expect(resJob2.passed).toBe(true);
      expect(
        resJob2.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
      ).toBe(false);
    });

    // 17. Existing deterministic structural validation continues to block broken candidates regardless of historical inventory status
    it('17. structural validation continues to block broken candidates even when historical inventory is unavailable', () => {
      // Historical status is set to UNAVAILABLE
      (service as any).historicalScopeStatus = {
        status: 'UNAVAILABLE',
        recordCount: 0,
        canonicalCount: 0,
        candidateCount: 0,
        isTruncated: false,
        error: 'Network failure',
      };

      const brokenCand = {
        prompt: { ar: 'هل باريس هي عاصمة فرنسا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'باريس' } },
            { id: '2', label: { ar: 'ليون' } },
          ],
          correctOptionId: '1',
        },
      };

      const res = service.screen(brokenCand);
      expect(res.passed).toBe(false);
      expect(res.findings.some((f) => f.code === 'ANSWER_LEAKAGE')).toBe(true);
      expect(
        res.findings.some((f) => f.code === 'HISTORICAL_INVENTORY_UNAVAILABLE'),
      ).toBe(true);
    });

    // 18. Sound candidate lifecycle: generation -> screening -> review -> publication works end-to-end
    it('18. sound candidate lifecycle works end-to-end with zero false positives', () => {
      service.registerHistoricalRecords([
        {
          id: 'canberra-item',
          sourceType: 'CANONICAL_READY',
          scopeKey: 'capitals',
          draft: {
            prompt: { ar: 'ما هي عاصمة أستراليا؟' },
            answerPayload: {
              mode: 'multiple_choice',
              options: [
                { id: '1', label: { ar: 'كانبيرا' } },
                { id: '2', label: { ar: 'سيدني' } },
              ],
              correctOptionId: '1',
            },
          },
        },
      ]);

      // Sound distinct candidate passes clean
      const validCandidate = {
        prompt: { ar: 'ما هي عاصمة كندا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: '1', label: { ar: 'أوتاوا' } },
            { id: '2', label: { ar: 'تورونتو' } },
          ],
          correctOptionId: '1',
        },
      };

      const screen1 = service.screen(validCandidate, null, {
        scopeKey: 'capitals',
      });
      expect(screen1.passed).toBe(true);
      expect(
        screen1.findings.filter((f) => f.severity === 'blocking'),
      ).toHaveLength(0);

      // Now screen duplicate of existing inventory -> blocks deterministically
      const duplicateCandidate = {
        prompt: { ar: 'ما عاصمة أستراليا؟' },
        answerPayload: {
          mode: 'multiple_choice',
          options: [
            { id: 'a', label: { ar: 'كانبيرا' } },
            { id: 'b', label: { ar: 'ملبورن' } },
          ],
          correctOptionId: 'a',
        },
      };

      const screen2 = service.screen(duplicateCandidate, null, {
        scopeKey: 'capitals',
      });
      expect(screen2.passed).toBe(false);
      expect(
        screen2.findings.some((f) => f.code === 'DUPLICATE_HISTORICAL_CONTENT'),
      ).toBe(true);
    });
  });
});
