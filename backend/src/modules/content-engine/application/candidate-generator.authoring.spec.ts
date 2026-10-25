import { ConfigService } from '@nestjs/config';
import {
  CLOSEST_CANDIDATE_SCHEMA,
  DEFAULT_RYO_DIFFICULTY_TARGETS,
  ORIGINALITY_GUIDANCE,
  PROMPT_VERSIONS,
  RYO_DIFFICULTY_CONFIG_KEYS,
  RYO_CANDIDATE_SCHEMA,
  RYO_CONFIDENCE_BANDS,
  RYO_TARGET_CONFIDENCE_BANDS,
  RYO_TASK_GUIDANCE,
  CLOSEST_TASK_GUIDANCE,
  CandidateGeneratorService,
  OUTPUT_TOKENS_PER_CANDIDATE,
} from './candidate-generator.service';
import { ResolvedAuthoringContext } from './authoring-context.service';

/**
 * Prompt construction and Closest parsing.
 *
 * These assert the *shape* of what is asked of a model and what is kept from
 * its reply. They say nothing about whether a real model then writes good
 * puzzles — only a live pilot shows that.
 */
const service = (config: Record<string, string> = {}) =>
  new CandidateGeneratorService(
    {} as never,
    {} as never,
    {} as never,
    { get: (key: string) => config[key] } as unknown as ConfigService,
  );

const context = (over: Partial<ResolvedAuthoringContext> = {}) =>
  ({
    mechanicKey: 'closest',
    worldKey: 'puzzles',
    scopeKey: 'numbers-estimation',
    global: 'GLOBAL-TEXT',
    mechanic: 'MECHANIC-TEXT',
    world: 'WORLD-TEXT',
    scope: 'SCOPE-TEXT',
    knowledge: 'KNOWLEDGE-TEXT',
    exemplars: '',
    historicalExemplars: '',
    exemplarDiagnostics: [],
    contextHash: 'hash',
    ...over,
  }) as ResolvedAuthoringContext;

const closestItem = (over: Record<string, unknown> = {}) => ({
  concept: 'Cups in a triangular stack',
  answerBasis: 'reasoning',
  playerReasoningStrategy: 'Approximate twelve rows averaging six cups each.',
  prompt: 'كم كوبًا في الهرم كله؟',
  domainDescription: 'totals of a triangular stack, up to about 150',
  min: 0,
  max: 150,
  step: 2,
  correctValue: 78,
  stepsFromMin: 39,
  unit: 'كوب',
  factualClaims: ['A 12-row triangular stack holds 78 cups.'],
  ...over,
});

const parse = (items: unknown[]) =>
  (
    service() as unknown as {
      parse: (raw: string, count: number, mode: string) => unknown[];
    }
  ).parse(JSON.stringify({ candidates: items }), items.length, 'closest');

describe('Closest generation schema', () => {
  const item = (
    CLOSEST_CANDIDATE_SCHEMA.properties as {
      candidates: { items: { required: string[]; properties: object } };
    }
  ).candidates.items;

  it('requires the concept and the reasoning route before any number', () => {
    expect(item.required).toContain('concept');
    expect(item.required).toContain('playerReasoningStrategy');
    const order = Object.keys(item.properties);
    // Field order is the authoring order: a strict schema generates top to
    // bottom, so the concept has to exist before a value can be chosen.
    expect(order.indexOf('concept')).toBeLessThan(
      order.indexOf('correctValue'),
    );
    expect(order.indexOf('playerReasoningStrategy')).toBeLessThan(
      order.indexOf('correctValue'),
    );
  });

  it('makes the span precede the answer, preserving the domain-first rule', () => {
    const order = Object.keys(item.properties);
    for (const field of ['domainDescription', 'min', 'max', 'step']) {
      expect(order.indexOf(field)).toBeLessThan(order.indexOf('correctValue'));
    }
  });

  it('requires the step-grid arithmetic to be stated, not implied', () => {
    expect(item.required).toContain('stepsFromMin');
    expect(
      (item.properties as { stepsFromMin: { type: string } }).stepsFromMin.type,
    ).toBe('integer');
  });
});

describe('both content directions are representable', () => {
  const item = (
    CLOSEST_CANDIDATE_SCHEMA.properties as {
      candidates: {
        items: {
          required: string[];
          properties: Record<string, { enum?: string[]; description?: string }>;
        };
      };
    }
  ).candidates.items;

  it('requires the direction to be declared', () => {
    expect(item.required).toContain('answerBasis');
    expect(item.properties.answerBasis.enum).toEqual([
      'reasoning',
      'knowledge-anchored',
    ]);
  });

  it('does not demand a prompt-derivable answer for knowledge questions', () => {
    // The Phase 2f wording required every answer to be reachable from the
    // prompt, which excluded knowledge-anchored Closest content outright.
    const described = item.properties.playerReasoningStrategy.description ?? '';
    expect(described).toMatch(/knowledge-anchored/);
    expect(described).toMatch(/do NOT pretend the fact is derivable/i);
  });

  it('keeps a knowledge-anchored candidate', () => {
    const [parsed] = parse([
      closestItem({
        answerBasis: 'knowledge-anchored',
        concept: 'Goals across a finished tournament',
        playerReasoningStrategy:
          'Roughly sixty matches at a couple of goals each.',
      }),
    ]) as { authoring: Record<string, unknown> }[];
    expect(parsed.authoring.answerBasis).toBe('knowledge-anchored');
  });

  it('leaves the field unset rather than guessing for older candidates', () => {
    const [parsed] = parse([closestItem({ answerBasis: undefined })]) as {
      authoring: Record<string, unknown>;
    }[];
    expect(parsed.authoring.answerBasis).toBeUndefined();
  });

  it('ignores a value outside the enum', () => {
    const [parsed] = parse([
      closestItem({ answerBasis: 'something-else' }),
    ]) as { authoring: Record<string, unknown> }[];
    expect(parsed.authoring.answerBasis).toBeUndefined();
  });
});

describe('OpenAI strict structured-output compliance', () => {
  // A GPT-5 run was rejected with HTTP 400 before any inference, because two
  // properties were optional. OpenAI strict mode requires every declared
  // property to appear in `required`; optionality is expressed by a nullable
  // type. Gemini accepted the looser schema, which is why this went unnoticed
  // until a paid request failed.
  type SchemaObject = {
    type?: unknown;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: unknown;
  };
  const walk = (
    node: unknown,
    path: string,
    check: (o: SchemaObject, p: string) => void,
  ) => {
    if (!node || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    if (obj.type === 'object' && obj.properties)
      check(obj as SchemaObject, path);
    for (const [key, value] of Object.entries(obj)) {
      walk(value, `${path}.${key}`, check);
    }
  };

  it('lists every property as required, at every level', () => {
    const offenders: string[] = [];
    walk(CLOSEST_CANDIDATE_SCHEMA, '$', (obj, path) => {
      const declared = Object.keys(obj.properties as object);
      const required: string[] = obj.required ?? [];
      for (const key of declared) {
        if (!required.includes(key)) offenders.push(`${path}.${key}`);
      }
    });
    expect(offenders).toEqual([]);
  });

  it('closes every object to additional properties', () => {
    const offenders: string[] = [];
    walk(CLOSEST_CANDIDATE_SCHEMA, '$', (obj, path) => {
      if (obj.additionalProperties !== false) offenders.push(path);
    });
    expect(offenders).toEqual([]);
  });

  it('expresses optional content as a nullable type, not a missing key', () => {
    const item = (
      CLOSEST_CANDIDATE_SCHEMA.properties as {
        candidates: {
          items: { properties: Record<string, { type: unknown }> };
        };
      }
    ).candidates.items;
    expect(item.properties.unit.type).toEqual(['string', 'null']);
    expect(item.properties.displayFormat.type).toEqual(['string', 'null']);
  });

  it('parses a candidate that returns null for the optional fields', () => {
    const [parsed] = parse([
      closestItem({ unit: null, displayFormat: null }),
    ]) as { draft: Record<string, unknown> }[];
    const slider = (
      parsed.draft.mechanicPayload as { closestSlider: Record<string, unknown> }
    ).closestSlider;
    expect(slider.unit).toBeUndefined();
    expect(slider.displayFormat).toBeUndefined();
  });
});

describe('Closest task guidance', () => {
  it('starts from the mechanic-native table experience', () => {
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/GAMEPLAY-FIRST INTENT/);
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/plausible[\s\S]*competing guesses/);
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/something to discuss/);
  });

  it('states the anchor test, not an estimation-only test', () => {
    expect(CLOSEST_TASK_GUIDANCE).toContain('ANCHOR TEST');
    // The decisive sentence: a factual answer is not the defect.
    expect(CLOSEST_TASK_GUIDANCE).toMatch(
      /not "is the answer a fact"\. It is "is there a way in"/,
    );
  });

  it('presents both directions as equally valid', () => {
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/TWO VALID DIRECTIONS/);
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/A factual answer is NOT a defect/);
  });

  it('names the three concept classes that are always rejected', () => {
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/MOVES/);
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/comparison set/i);
    expect(CLOSEST_TASK_GUIDANCE).toMatch(/specialist/i);
  });

  it('leaves originality to the shared block rather than restating it', () => {
    // It used to live here, which is why the multiple-choice path — appending
    // nothing — ended on generic formatting lines instead.
    expect(CLOSEST_TASK_GUIDANCE).not.toMatch(/RETIRED SUBJECT/);
  });

  it('tells the author to change the step, never an endpoint or the answer', () => {
    expect(CLOSEST_TASK_GUIDANCE).toMatch(
      /change the STEP[\s\S]*never move an endpoint, never round the answer/,
    );
  });

  it('defers to the World and Scope on which directions are permitted', () => {
    expect(CLOSEST_TASK_GUIDANCE).toMatch(
      /most Worlds permit both, some permit only one/,
    );
  });

  it('rejects supplied-operation arithmetic without banning reasoning prompts', () => {
    expect(CLOSEST_TASK_GUIDANCE).toMatch(
      /supplies every number and the exact[\s\S]*straightforward arithmetic/,
    );
    expect(CLOSEST_TASK_GUIDANCE).toMatch(
      /reasoning prompt may[\s\S]*supply necessary information/,
    );
    expect(CLOSEST_TASK_GUIDANCE).toMatch(
      /estimation,[\s\S]*visualisation, comparison or approximation/,
    );
  });
});

describe('RYO gameplay and difficulty guidance', () => {
  it('centres opponent prediction rather than ordinary quiz difficulty', () => {
    expect(RYO_TASK_GUIDANCE).toMatch(/GAMEPLAY-FIRST INTENT/);
    expect(RYO_TASK_GUIDANCE).toMatch(
      /opposing team must predict whether the[\s\S]*answering team will get it right/,
    );
    expect(RYO_TASK_GUIDANCE).toMatch(
      /Difficulty changes the knowledge demand[\s\S]*plausible the alternatives/,
    );
  });

  it('keeps every difficulty tier clear, fair and separate from ambiguity', () => {
    expect(RYO_TASK_GUIDANCE).toMatch(
      /never come from ambiguity, trick wording, an unstated criterion/,
    );
    expect(RYO_TASK_GUIDANCE).toMatch(
      /Easy, medium and relatively difficult items all have[\s\S]*clear, fair and factually defensible/,
    );
    expect(RYO_TASK_GUIDANCE).toMatch(
      /Difficulty is not proof[\s\S]*apply the certainty test separately/,
    );
  });

  it('uses the approved experimental 25/50/25 defaults', () => {
    const prompt = service().buildPrompt(context(), 10, 'multiple_choice');
    expect(DEFAULT_RYO_DIFFICULTY_TARGETS).toEqual({
      easy: 25,
      medium: 50,
      relativelyDifficult: 25,
    });
    expect(prompt).toContain('easy: 25%');
    expect(prompt).toContain('medium: 50%');
    expect(prompt).toContain('relatively difficult: 25%');
    expect(prompt).toMatch(/configurable and unvalidated/);
    expect(prompt).toMatch(/do not force exact quotas in a small batch/i);
  });

  it('reads a configured mix deterministically from the existing config seam', () => {
    const configured = service({
      [RYO_DIFFICULTY_CONFIG_KEYS.easy]: '20',
      [RYO_DIFFICULTY_CONFIG_KEYS.medium]: '60',
      [RYO_DIFFICULTY_CONFIG_KEYS.relativelyDifficult]: '20',
    });
    const first = configured.buildPrompt(context(), 10, 'multiple_choice');
    const second = configured.buildPrompt(context(), 10, 'multiple_choice');
    expect(first).toBe(second);
    expect(first).toContain('easy: 20%');
    expect(first).toContain('medium: 60%');
    expect(first).toContain('relatively difficult: 20%');
  });

  it('fails closed when configured targets do not total 100', () => {
    const configured = service({
      [RYO_DIFFICULTY_CONFIG_KEYS.easy]: '25',
      [RYO_DIFFICULTY_CONFIG_KEYS.medium]: '25',
      [RYO_DIFFICULTY_CONFIG_KEYS.relativelyDifficult]: '25',
    });
    expect(() =>
      configured.buildPrompt(context(), 10, 'multiple_choice'),
    ).toThrow(
      expect.objectContaining({ code: 'RYO_DIFFICULTY_TARGETS_INVALID' }),
    );
  });

  it('does not inject the RYO mix into Closest prompts', () => {
    expect(service().buildPrompt(context(), 10, 'closest')).not.toContain(
      'EXPERIMENTAL DIFFICULTY MIX',
    );
  });
});

describe('originality guidance reaches every mechanic', () => {
  // The Phase 2m RYO pilot returned three verbatim copies of the Scope's
  // worked examples. Its prompt ended on "The correct answer must never appear
  // in the prompt text" and said nothing about originality in the task block
  // at all, while Closest ended on exactly that instruction. These assert the
  // resolved prompt, not a constant, because a constant nothing appends is
  // documentation rather than instruction.
  const tail = (mode: 'multiple_choice' | 'closest') =>
    service().buildPrompt(context({ exemplars: 'EXEMPLAR-TEXT' }), 3, mode);

  it.each(['multiple_choice', 'closest'] as const)(
    'ends the %s prompt with the originality block',
    (mode) => {
      const prompt = tail(mode);
      expect(prompt.endsWith(ORIGINALITY_GUIDANCE)).toBe(true);
    },
  );

  it.each(['multiple_choice', 'closest'] as const)(
    'states every originality rule in the %s prompt',
    (mode) => {
      const prompt = tail(mode);
      expect(prompt).toMatch(/RETIRED SUBJECT/);
      expect(prompt).toMatch(/do not copy or paraphrase an example question/i);
      expect(prompt).toMatch(/its answer target, or its option set/i);
      expect(prompt).toMatch(/with a value, a name or a number changed/i);
      expect(prompt).toMatch(
        /Superficial wording\s*\n?\s*changes do not make an item new/i,
      );
      expect(prompt).toMatch(
        /Author genuinely new questions inside this same World, Scope/i,
      );
    },
  );

  it('says exemplars teach properties, not questions', () => {
    expect(ORIGINALITY_GUIDANCE).toMatch(
      /teach you which PROPERTIES make an item work/,
    );
  });

  it('keeps the quality bar attached to the originality demand', () => {
    // Originality must not be bought with a worse question.
    expect(ORIGINALITY_GUIDANCE).toMatch(/factually defensible/);
    expect(ORIGINALITY_GUIDANCE).toMatch(/distractors genuinely/);
    expect(ORIGINALITY_GUIDANCE).toMatch(/opposing team has a/);
  });

  it('gives both mechanics the identical block — one source, not a copy', () => {
    const mc = tail('multiple_choice');
    const closest = tail('closest');
    expect(mc.slice(mc.indexOf('ORIGINALITY —'))).toBe(
      closest.slice(closest.indexOf('ORIGINALITY —')),
    );
  });

  it('appends RYO task guidance where there was none', () => {
    const prompt = tail('multiple_choice');
    expect(prompt).toMatch(/This mechanic is a bet, not a quiz/);
    expect(prompt).toMatch(/THE CERTAINTY TEST/);
    expect(prompt).toMatch(/distractorRationale/);
    expect(prompt).toMatch(/estimatedConfidence/);
    // And closest keeps its own, unchanged.
    expect(tail('closest')).toMatch(/ANCHOR TEST/);
    expect(tail('closest')).not.toMatch(/This mechanic is a bet/);
  });
});

describe('buildPrompt', () => {
  it('versions both changed prompt contracts without changing payload schemas', () => {
    expect(PROMPT_VERSIONS).toEqual({
      multiple_choice: 'mc-v2',
      closest: 'closest-v2',
    });
    expect(RYO_CANDIDATE_SCHEMA).toBeDefined();
    expect(CLOSEST_CANDIDATE_SCHEMA).toBeDefined();
  });

  it('carries every canonical section verbatim', () => {
    const prompt = service().buildPrompt(context(), 3, 'closest');
    for (const text of [
      'GLOBAL-TEXT',
      'MECHANIC-TEXT',
      'WORLD-TEXT',
      'SCOPE-TEXT',
      'KNOWLEDGE-TEXT',
    ]) {
      expect(prompt).toContain(text);
    }
  });

  it('includes Scope exemplars when the Scope supplies them', () => {
    const prompt = service().buildPrompt(
      context({ exemplars: 'EXEMPLAR-TEXT' }),
      3,
      'closest',
    );
    expect(prompt).toContain('## 6. EXEMPLARS');
    expect(prompt).toContain('EXEMPLAR-TEXT');
  });

  it('does not leak the historical exemplar corpus into the generation prompt', () => {
    const prompt = service().buildPrompt(
      context({
        exemplars: 'APPROVED-EXEMPLAR',
        historicalExemplars: 'WITHHELD-ANSWER-MUST-NOT-LEAK',
      }),
      3,
      'multiple_choice',
    );
    expect(prompt).toContain('APPROVED-EXEMPLAR');
    expect(prompt).not.toContain('WITHHELD-ANSWER-MUST-NOT-LEAK');
  });

  it('puts the exemplars after the Scope and before the task', () => {
    const prompt = service().buildPrompt(
      context({ exemplars: 'EXEMPLAR-TEXT' }),
      3,
      'closest',
    );
    expect(prompt.indexOf('SCOPE-TEXT')).toBeLessThan(
      prompt.indexOf('EXEMPLAR-TEXT'),
    );
    expect(prompt.indexOf('EXEMPLAR-TEXT')).toBeLessThan(
      prompt.indexOf('## TASK'),
    );
  });

  it('appends closest guidance only for closest', () => {
    expect(service().buildPrompt(context(), 3, 'closest')).toContain(
      'ANCHOR TEST',
    );
    expect(
      service().buildPrompt(context(), 3, 'multiple_choice'),
    ).not.toContain('ANCHOR TEST');
  });
});

describe('generator capability guard', () => {
  it('rejects an unsupported mechanic before provider or budget work', async () => {
    const budget = { reserve: jest.fn() };
    const generator = new CandidateGeneratorService(
      {} as never,
      { holdsLease: async () => true } as never,
      budget as never,
      { get: () => undefined } as unknown as ConfigService,
    );

    await expect(
      generator.generate({
        jobId: 'job-unsupported',
        leaseEpoch: 1,
        attempt: 1,
        context: context({ mechanicKey: 'moving-xo' }),
        count: 1,
      }),
    ).rejects.toMatchObject({ code: 'MECHANIC_NOT_GENERATABLE' });
    expect(budget.reserve).not.toHaveBeenCalled();
  });
});

describe('parsing a closest candidate', () => {
  it('keeps the authoring rationale beside the draft, never inside it', () => {
    const [parsed] = parse([closestItem()]) as {
      draft: Record<string, unknown>;
      authoring: Record<string, unknown>;
    }[];
    // `CreateContentItemDto` is validated with forbidNonWhitelisted, so an
    // extra key on the draft would fail publication outright.
    expect(parsed.draft.authoring).toBeUndefined();
    expect(parsed.authoring).toMatchObject({
      concept: 'Cups in a triangular stack',
      stepsFromMin: 39,
      domainDescription: 'totals of a triangular stack, up to about 150',
    });
    expect(parsed.authoring.playerReasoningStrategy).toMatch(/twelve rows/);
  });

  it('still produces the canonical closest payload', () => {
    const [parsed] = parse([closestItem()]) as {
      draft: Record<string, unknown>;
    }[];
    expect(parsed.draft.answerPayload).toMatchObject({
      mode: 'closest',
      correctValue: 78,
    });
    expect(
      (parsed.draft.mechanicPayload as { closestSlider: object }).closestSlider,
    ).toMatchObject({ mode: 'numeric-range', min: 0, max: 150, step: 2 });
  });

  it('tolerates a reply that omits the rationale rather than losing the item', () => {
    // The screen, not the parser, is the authority on whether a candidate is
    // acceptable; dropping a whole candidate here would hide it from review.
    const [parsed] = parse([
      closestItem({
        concept: undefined,
        playerReasoningStrategy: undefined,
        stepsFromMin: undefined,
      }),
    ]) as { authoring: Record<string, unknown> }[];
    expect(parsed.authoring.concept).toBeUndefined();
    expect(parsed.authoring.stepsFromMin).toBeUndefined();
  });
});

describe('RYO authoring rationale', () => {
  const ryoItem = (over: Record<string, unknown> = {}) => ({
    concept: 'People reach for oxygen before nitrogen.',
    prompt: 'ما الغاز الأكثر في الغلاف الجوي؟',
    options: [
      { id: 'a', label: 'النيتروجين' },
      { id: 'b', label: 'الأكسجين' },
    ],
    correctOptionId: 'a',
    distractorRationale: [{ optionId: 'b', why: 'The breathing association.' }],
    estimatedConfidence: { band: 'even', why: 'A common misconception.' },
    factualClaims: ['Nitrogen is about 78% of the atmosphere.'],
    ...over,
  });

  const parseMc = (items: unknown[]) =>
    (
      service() as unknown as {
        parse: (raw: string, count: number, mode: string) => unknown[];
      }
    ).parse(
      JSON.stringify({ candidates: items }),
      items.length,
      'multiple_choice',
    ) as {
      draft: Record<string, unknown>;
      authoring: {
        concept?: string;
        distractorRationale?: { optionId: string; why: string }[];
        estimatedConfidence?: { band: string; why: string };
      };
    }[];

  it('requires all three fields in the schema', () => {
    const item = (
      RYO_CANDIDATE_SCHEMA.properties as {
        candidates: { items: { required: string[] } };
      }
    ).candidates.items;
    expect(item.required).toContain('concept');
    expect(item.required).toContain('distractorRationale');
    expect(item.required).toContain('estimatedConfidence');
  });

  it('keys each rationale to an option id rather than a position', () => {
    const entry = (
      RYO_CANDIDATE_SCHEMA.properties as {
        candidates: {
          items: {
            properties: Record<string, { items?: { required?: string[] } }>;
          };
        };
      }
    ).candidates.items.properties.distractorRationale.items;
    expect(entry!.required).toEqual(['optionId', 'why']);
  });

  it('offers five defined bands, not a fabricated probability', () => {
    expect(RYO_CONFIDENCE_BANDS).toEqual([
      'near-certain',
      'likely',
      'even',
      'unlikely',
      'near-impossible',
    ]);
    expect(RYO_TARGET_CONFIDENCE_BANDS).toEqual(['likely', 'even']);
  });

  it('keeps the rationale beside the draft, never inside it', () => {
    // `CreateContentItemDto` is validated with forbidNonWhitelisted, so a key
    // here would fail publication — and nothing here is gameplay.
    const [parsed] = parseMc([ryoItem()]);
    expect(parsed.draft.authoring).toBeUndefined();
    expect(parsed.draft.distractorRationale).toBeUndefined();
    expect(parsed.draft.estimatedConfidence).toBeUndefined();
    expect(parsed.authoring.concept).toMatch(/oxygen before nitrogen/);
    expect(parsed.authoring.distractorRationale).toEqual([
      { optionId: 'b', why: 'The breathing association.' },
    ]);
    expect(parsed.authoring.estimatedConfidence).toEqual({
      band: 'even',
      why: 'A common misconception.',
    });
  });

  it('leaves the player-facing answer payload exactly as before', () => {
    const [parsed] = parseMc([ryoItem()]);
    expect(parsed.draft.answerPayload).toEqual({
      mode: 'multiple_choice',
      options: [
        { id: 'a', label: { ar: 'النيتروجين' } },
        { id: 'b', label: { ar: 'الأكسجين' } },
      ],
      correctOptionId: 'a',
    });
  });

  it('records absence as absence for a reply that omits the fields', () => {
    const [parsed] = parseMc([
      ryoItem({
        concept: undefined,
        distractorRationale: undefined,
        estimatedConfidence: undefined,
      }),
    ]);
    expect(parsed.authoring.concept).toBeUndefined();
    expect(parsed.authoring.distractorRationale).toBeUndefined();
    expect(parsed.authoring.estimatedConfidence).toBeUndefined();
    // And the candidate survives — the screen, not the parser, judges it.
    expect(parsed.draft.answerPayload).toBeDefined();
  });

  it('tolerates a malformed rationale rather than losing the candidate', () => {
    // Dropping it here would hide a reviewable item; the screen blocks it.
    const [parsed] = parseMc([
      ryoItem({ distractorRationale: [{ optionId: 'zzz' }] }),
    ]);
    expect(parsed.authoring.distractorRationale).toEqual([
      { optionId: 'zzz', why: '' },
    ]);
  });
});

describe('output budget', () => {
  it('is the single number used for both reservation and max_tokens', () => {
    expect(OUTPUT_TOKENS_PER_CANDIDATE).toBeGreaterThan(0);
    expect(Number.isInteger(OUTPUT_TOKENS_PER_CANDIDATE)).toBe(true);
  });
});
