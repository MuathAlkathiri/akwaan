import { ConfigService } from '@nestjs/config';
import {
  CLOSEST_CANDIDATE_SCHEMA,
  RYO_CANDIDATE_SCHEMA,
  schemaWithCreativeSlots,
} from '../application/candidate-generator.service';
import { QUALITY_JUDGE_SCHEMA } from '../application/quality-judge.service';
import {
  OpenRouterAiProvider,
  OpenRouterTimeoutError,
  OpenRouterUnavailableError,
} from './openrouter-ai.provider';

/**
 * Request-shape compatibility.
 *
 * These assert what reaches OpenRouter, because the parameters a model does
 * *not* accept are what decide whether a paid request succeeds at all. With
 * `require_parameters: true`, OpenRouter routes only to endpoints supporting
 * every parameter in the body — so one unsupported field means zero eligible
 * endpoints and a failed, still-billable attempt.
 */
const config = (overrides: Record<string, string> = {}) =>
  ({
    get: (key: string) =>
      ({
        OPENROUTER_API_KEY: 'test-key',
        ENGINE_GENERATION_MODEL: 'openai/gpt-5',
        ...overrides,
      })[key],
  }) as unknown as ConfigService;

const capture = () => {
  const seen: { body?: Record<string, unknown> } = {};
  const fetchImpl = (async (_url: string, init: { body: string }) => {
    seen.body = JSON.parse(init.body) as Record<string, unknown>;
    return {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"candidates":[]}' } }],
        model: 'openai/gpt-5',
        usage: {
          prompt_tokens: 10,
          completion_tokens: 900,
          total_tokens: 910,
          completion_tokens_details: { reasoning_tokens: 700 },
        },
      }),
    } as unknown as Response;
  }) as unknown as typeof fetch;
  return { seen, fetchImpl };
};

const request = {
  prompt: 'author three candidates',
  temperature: 0.8,
  maxOutputTokens: 3_600,
  responseSchema: { type: 'object' },
};

describe('OpenRouterAiProvider request shape', () => {
  it('sends temperature by default', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(config(), fetchImpl).generateText(request);
    expect(seen.body!.temperature).toBe(0.8);
  });

  it('omits temperature when the model does not accept it', async () => {
    // No `openai/gpt-5` endpoint lists `temperature`. Sending it alongside
    // require_parameters leaves no endpoint able to serve the request.
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({ ENGINE_OMIT_TEMPERATURE: 'true' }),
      fetchImpl,
    ).generateText(request);
    expect(seen.body).not.toHaveProperty('temperature');
  });

  it('still demands a strict schema and parameter-aware routing', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({ ENGINE_OMIT_TEMPERATURE: 'true' }),
      fetchImpl,
    ).generateText(request);
    expect(seen.body!.provider).toEqual({ require_parameters: true });
    expect(
      (seen.body!.response_format as { json_schema: { strict: boolean } })
        .json_schema.strict,
    ).toBe(true);
  });

  it('sends the output ceiling that bounds reasoning and content together', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(config(), fetchImpl).generateText(request);
    expect(seen.body!.max_tokens).toBe(3_600);
  });

  it('asks for a bounded reasoning effort when configured', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({ ENGINE_REASONING_EFFORT: 'low' }),
      fetchImpl,
    ).generateText(request);
    expect(seen.body!.reasoning).toEqual({ effort: 'low' });
  });

  it('ignores a reasoning effort outside the supported set', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({ ENGINE_REASONING_EFFORT: 'turbo' }),
      fetchImpl,
    ).generateText(request);
    expect(seen.body).not.toHaveProperty('reasoning');
  });

  it('sends no reasoning field at all by default', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(config(), fetchImpl).generateText(request);
    expect(seen.body).not.toHaveProperty('reasoning');
  });
});

/**
 * OpenAI strict structured-output validation, against the **serialized** body.
 *
 * A GPT-5 batch was rejected with HTTP 400 for an invalid schema while the
 * model's `supported_parameters` advertised `structured_outputs: true`. The
 * capability flag describes the model, not the schema. These checks run over
 * what `JSON.stringify` actually puts on the wire, because that — not the
 * exported constant — is what OpenAI validates.
 *
 * Limits of this gate, stated honestly: it encodes OpenAI's documented strict
 * rules as of 2026-10. It is not the provider's validator, and no free
 * provider-side validation endpoint exists. It can prove a schema violates a
 * known rule; it cannot prove acceptance.
 */
const STRICT_UNSUPPORTED = [
  'minLength',
  'maxLength',
  'pattern',
  'format',
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'patternProperties',
  'unevaluatedProperties',
  'propertyNames',
  'minProperties',
  'maxProperties',
  'minItems',
  'maxItems',
  'uniqueItems',
  'oneOf',
  'allOf',
  'not',
  'dependentRequired',
  'dependentSchemas',
  'if',
  'then',
  'else',
  '$ref',
  'default',
];

interface Violation {
  path: string;
  rule: string;
}

const validateStrict = (node: unknown, path = '$', depth = 0): Violation[] => {
  const found: Violation[] = [];
  if (!node || typeof node !== 'object') return found;
  if (Array.isArray(node)) {
    node.forEach((item, i) =>
      found.push(...validateStrict(item, `${path}[${i}]`, depth)),
    );
    return found;
  }
  const obj = node as Record<string, unknown>;

  for (const keyword of STRICT_UNSUPPORTED) {
    if (keyword in obj)
      found.push({ path, rule: `unsupported keyword: ${keyword}` });
  }

  const types = Array.isArray(obj.type) ? obj.type : obj.type ? [obj.type] : [];
  if (types.includes('object')) {
    if (obj.additionalProperties !== false) {
      found.push({ path, rule: 'object must set additionalProperties: false' });
    }
    const declared = Object.keys((obj.properties as object) ?? {});
    const required = (obj.required as string[]) ?? [];
    for (const key of declared) {
      if (!required.includes(key)) {
        found.push({
          path: `${path}.${key}`,
          rule: 'property missing from required',
        });
      }
    }
    for (const key of required) {
      if (!declared.includes(key)) {
        found.push({
          path: `${path}.${key}`,
          rule: 'required names an undeclared property',
        });
      }
    }
    if (depth > 5) found.push({ path, rule: 'nesting deeper than 5 levels' });
  }

  // An enum has to agree with its declared type, null included.
  if (Array.isArray(obj.enum) && types.length) {
    for (const value of obj.enum as unknown[]) {
      const actual = value === null ? 'null' : typeof value;
      if (!types.includes(actual)) {
        found.push({
          path,
          rule: `enum value ${JSON.stringify(value)} not in type ${JSON.stringify(types)}`,
        });
      }
    }
  }
  // A nullable field must say so in `type`, not by omission.
  if (types.includes('null') && types.length < 2) {
    found.push({ path, rule: 'null-only type' });
  }

  for (const [key, value] of Object.entries(obj)) {
    if (key === 'enum' || key === 'required' || key === 'description') continue;
    found.push(
      ...validateStrict(
        value,
        `${path}.${key}`,
        key === 'properties' ? depth : depth + 1,
      ),
    );
  }
  return found;
};

describe('the serialized request body OpenAI will validate', () => {
  const serializedSchema = async (schema: Record<string, unknown>) => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({
        ENGINE_OMIT_TEMPERATURE: 'true',
        ENGINE_REASONING_EFFORT: 'low',
      }),
      fetchImpl,
    ).generateText({ ...request, responseSchema: schema });
    // Round-tripped deliberately: this is the wire form, not the object.
    return JSON.parse(
      JSON.stringify(
        (seen.body as { response_format: { json_schema: { schema: unknown } } })
          .response_format.json_schema.schema,
      ),
    ) as Record<string, unknown>;
  };

  it('serializes the real Closest schema with no strict-mode violations', async () => {
    const wire = await serializedSchema(CLOSEST_CANDIDATE_SCHEMA);
    expect(validateStrict(wire)).toEqual([]);
  });

  it('serializes the Closest creative-slot schema with no strict-mode violations', async () => {
    const wire = await serializedSchema(
      schemaWithCreativeSlots(CLOSEST_CANDIDATE_SCHEMA),
    );
    expect(validateStrict(wire)).toEqual([]);
    const item = (
      wire.properties as {
        candidates: {
          items: {
            required: string[];
            properties: Record<string, unknown>;
          };
        };
      }
    ).candidates.items;
    expect(item.required).toContain('slotIndex');
    expect(item.properties.slotIndex).toBeDefined();
  });

  it('serializes the RYO creative-slot schema with no strict-mode violations on the wire', async () => {
    const wire = await serializedSchema(
      schemaWithCreativeSlots(RYO_CANDIDATE_SCHEMA),
    );
    expect(validateStrict(wire)).toEqual([]);
    const item = (
      wire.properties as {
        candidates: {
          items: {
            required: string[];
            properties: Record<string, unknown>;
          };
        };
      }
    ).candidates.items;
    expect(item.required).toContain('slotIndex');
    expect(item.properties.slotIndex).toBeDefined();
  });

  it('serializes the Quality Judge schema with no strict-mode violations and strict additionalProperties', async () => {
    const wire = await serializedSchema(QUALITY_JUDGE_SCHEMA);
    expect(validateStrict(wire)).toEqual([]);
    expect(wire.additionalProperties).toBe(false);
    const props = wire.properties as Record<string, Record<string, unknown>>;
    expect(props.scores.additionalProperties).toBe(false);
    expect(props.reasons.additionalProperties).toBe(false);
  });

  it('keeps the canonical RYO schema constrained at source', () => {
    // The array bounds are deliberate and remain the source of truth. They are
    // removed only at the provider boundary, for the one provider that rejects
    // them, and the rule they expressed is enforced by the deterministic screen
    // (`ANSWER_OPTIONS_TOO_MANY`) for every provider.
    const item = (
      RYO_CANDIDATE_SCHEMA.properties as {
        candidates: {
          items: {
            properties: Record<
              string,
              { minItems?: number; maxItems?: number }
            >;
          };
        };
      }
    ).candidates.items;
    expect(item.properties.options.minItems).toBe(2);
    expect(item.properties.options.maxItems).toBe(4);
    expect(item.properties.factualClaims.minItems).toBe(1);
    // And at source it is therefore still not strict-clean, by design.
    expect(validateStrict(RYO_CANDIDATE_SCHEMA).length).toBe(3);
  });

  it('keeps unit and displayFormat required and nullable on the wire', async () => {
    const wire = await serializedSchema(CLOSEST_CANDIDATE_SCHEMA);
    const item = (
      wire.properties as {
        candidates: {
          items: {
            required: string[];
            properties: Record<string, { type?: unknown; enum?: unknown[] }>;
          };
        };
      }
    ).candidates.items;
    expect(item.required).toContain('unit');
    expect(item.required).toContain('displayFormat');
    expect(item.properties.unit.type).toEqual(['string', 'null']);
    expect(item.properties.displayFormat.type).toEqual(['string', 'null']);
    expect(item.properties.displayFormat.enum).toContain(null);
  });

  it('sends strict mode, parameter-aware routing, and no temperature', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({
        ENGINE_OMIT_TEMPERATURE: 'true',
        ENGINE_REASONING_EFFORT: 'low',
      }),
      fetchImpl,
    ).generateText({ ...request, responseSchema: CLOSEST_CANDIDATE_SCHEMA });
    const body = seen.body as Record<string, unknown> & {
      response_format: { json_schema: { strict: boolean } };
    };
    expect(body).not.toHaveProperty('temperature');
    expect(body.model).toBe('openai/gpt-5');
    expect(body.provider).toEqual({ require_parameters: true });
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_tokens).toBe(3_600);
    expect(body.response_format.json_schema.strict).toBe(true);
  });

  it('catches the exact defect that caused the HTTP 400', async () => {
    // The validator has to fail on the schema that really failed, or it
    // proves nothing. This is that schema in miniature.
    const broken = {
      type: 'object',
      additionalProperties: false,
      required: ['a'],
      properties: { a: { type: 'string' }, optional: { type: 'string' } },
    };
    expect(validateStrict(broken)).toEqual([
      { path: '$.optional', rule: 'property missing from required' },
    ]);
  });

  it('catches an object left open to additional properties', () => {
    expect(
      validateStrict({ type: 'object', required: [], properties: {} }),
    ).toContainEqual({
      path: '$',
      rule: 'object must set additionalProperties: false',
    });
  });

  it('catches an unsupported validation keyword', () => {
    expect(
      validateStrict({
        type: 'object',
        additionalProperties: false,
        required: ['a'],
        properties: { a: { type: 'string', pattern: '^x' } },
      }),
    ).toContainEqual({
      path: '$.properties.a',
      rule: 'unsupported keyword: pattern',
    });
  });
});

describe('provider-specific schema adaptation', () => {
  const wireSchema = async (model: string, schema: Record<string, unknown>) => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({ ENGINE_GENERATION_MODEL: model }),
      fetchImpl,
    ).generateText({ ...request, responseSchema: schema });
    return JSON.parse(
      JSON.stringify(
        (seen.body as { response_format: { json_schema: { schema: unknown } } })
          .response_format.json_schema.schema,
      ),
    ) as Record<string, unknown>;
  };

  it('sends GPT-5 an RYO schema that passes strict-mode validation', async () => {
    // Before this transform the same schema was rejected with HTTP 400.
    const wire = await wireSchema('openai/gpt-5', RYO_CANDIDATE_SCHEMA);
    expect(validateStrict(wire)).toEqual([]);
  });

  it('sends Flash-Lite the original schema, constraints intact', async () => {
    const wire = await wireSchema(
      'google/gemini-2.5-flash-lite',
      RYO_CANDIDATE_SCHEMA,
    );
    const options = (
      wire.properties as {
        candidates: {
          items: {
            properties: Record<
              string,
              { minItems?: number; maxItems?: number }
            >;
          };
        };
      }
    ).candidates.items.properties.options;
    expect(options.minItems).toBe(2);
    expect(options.maxItems).toBe(4);
    expect(wire).toEqual(RYO_CANDIDATE_SCHEMA);
  });

  it('removes only the unsupported keywords, keeping every structural one', async () => {
    const wire = await wireSchema('openai/gpt-5', RYO_CANDIDATE_SCHEMA);
    const item = (
      wire.properties as {
        candidates: {
          items: {
            required: string[];
            additionalProperties: unknown;
            properties: Record<
              string,
              {
                minItems?: number;
                maxItems?: number;
                items?: {
                  required?: string[];
                  properties?: Record<string, { type?: unknown }>;
                };
              }
            >;
          };
        };
      }
    ).candidates.items;
    // Gone: the array bounds strict mode rejects.
    expect(item.properties.options.minItems).toBeUndefined();
    expect(item.properties.options.maxItems).toBeUndefined();
    expect(item.properties.factualClaims.minItems).toBeUndefined();
    // Kept: everything that defines the shape.
    expect(item.required).toEqual([
      'concept',
      'prompt',
      'options',
      'correctOptionId',
      'distractorRationale',
      'estimatedConfidence',
      'factualClaims',
    ]);
    expect(item.additionalProperties).toBe(false);
    const optionItems = item.properties.options.items!;
    expect(optionItems.required).toEqual(['id', 'label']);
    expect(optionItems.properties!.id.type).toBe('string');
  });

  it('keeps the RYO rationale fields through the GPT-5 transform', async () => {
    // The three authoring fields must survive the strip, or the pilot loses
    // exactly the metadata it was added to collect.
    const wire = await wireSchema('openai/gpt-5', RYO_CANDIDATE_SCHEMA);
    const item = (
      wire.properties as {
        candidates: {
          items: {
            required: string[];
            properties: Record<
              string,
              {
                items?: { required?: string[] };
                enum?: unknown[];
                properties?: Record<string, { enum?: unknown[] }>;
              }
            >;
          };
        };
      }
    ).candidates.items;
    expect(item.required).toContain('concept');
    expect(item.required).toContain('distractorRationale');
    expect(item.required).toContain('estimatedConfidence');
    expect(item.properties.distractorRationale.items!.required).toEqual([
      'optionId',
      'why',
    ]);
    expect(item.properties.estimatedConfidence.properties!.band.enum).toEqual([
      'near-certain',
      'likely',
      'even',
      'unlikely',
      'near-impossible',
    ]);
  });

  it('leaves the Closest schema untouched — it has nothing to strip', async () => {
    const wire = await wireSchema('openai/gpt-5', CLOSEST_CANDIDATE_SCHEMA);
    expect(wire).toEqual(CLOSEST_CANDIDATE_SCHEMA);
    expect(validateStrict(wire)).toEqual([]);
  });

  it('automatically injects additionalProperties: false onto unadorned objects for OpenAI strict mode', async () => {
    const looseSchema = {
      type: 'object',
      required: ['child'],
      properties: {
        child: {
          type: 'object',
          required: ['value'],
          properties: { value: { type: 'string' } },
        },
      },
    };
    const wire = await wireSchema('openai/gpt-5', looseSchema);
    expect(wire.additionalProperties).toBe(false);
    expect(
      (wire.properties as Record<string, Record<string, unknown>>).child
        .additionalProperties,
    ).toBe(false);
    expect(validateStrict(wire)).toEqual([]);
  });

  it('can be disabled explicitly', async () => {
    const { seen, fetchImpl } = capture();
    await new OpenRouterAiProvider(
      config({
        ENGINE_GENERATION_MODEL: 'openai/gpt-5',
        ENGINE_STRICT_SCHEMA_ADAPT: 'false',
      }),
      fetchImpl,
    ).generateText({ ...request, responseSchema: RYO_CANDIDATE_SCHEMA });
    const wire = (
      seen.body as { response_format: { json_schema: { schema: unknown } } }
    ).response_format.json_schema.schema;
    expect(wire).toEqual(RYO_CANDIDATE_SCHEMA);
  });

  it('refuses to send a schema carrying an unclassified keyword', async () => {
    // Fail closed: an unknown keyword is not silently stripped and not
    // silently sent. Either guess costs a paid request.
    await expect(
      wireSchema('openai/gpt-5', {
        type: 'object',
        additionalProperties: false,
        required: ['a'],
        properties: { a: { type: 'string', someFutureKeyword: true } },
      }),
    ).rejects.toThrow(/someFutureKeyword/);
  });

  it('names where the unclassified keyword was found', async () => {
    await expect(
      wireSchema('openai/gpt-5', {
        type: 'object',
        additionalProperties: false,
        required: ['a'],
        properties: { a: { type: 'string', mystery: 1 } },
      }),
    ).rejects.toThrow(/\$\.properties\.a/);
  });
});

describe('reasoning token accounting', () => {
  it('charges reasoning once, through completion tokens', async () => {
    const { fetchImpl } = capture();
    const result = await new OpenRouterAiProvider(
      config(),
      fetchImpl,
    ).generateText(request);
    // OpenAI reports reasoning *inside* completion_tokens. The ledger prices
    // completion tokens, so reasoning is already paid for; adding it to usage
    // as well would bill the same tokens twice.
    expect(result.usage?.completionTokens).toBe(900);
    expect(result.usage).not.toHaveProperty('reasoningTokens');
  });

  it('surfaces the reasoning split for observation', async () => {
    const { fetchImpl } = capture();
    const result = await new OpenRouterAiProvider(
      config(),
      fetchImpl,
    ).generateText(request);
    expect(
      (result as { diagnostics?: Record<string, unknown> }).diagnostics,
    ).toMatchObject({ reasoningTokens: 700 });
  });

  it('uses pinned request.model, request.omitTemperature, and request.reasoningEffort rather than drifting to live ConfigService values', async () => {
    const { seen, fetchImpl } = capture();
    // Live ConfigService has drifted to a different model, omitTemperature=true, and effort=high
    const driftedConfig = config({
      ENGINE_GENERATION_MODEL: 'drifted/live-model',
      ENGINE_OMIT_TEMPERATURE: 'true',
      ENGINE_REASONING_EFFORT: 'high',
    });

    await new OpenRouterAiProvider(driftedConfig, fetchImpl).generateText({
      ...request,
      model: 'pinned/spec-model-v1',
      omitTemperature: false,
      temperature: 0.35,
      reasoningEffort: 'low',
      maxOutputTokens: 2_400,
    });

    const body = seen.body as Record<string, unknown>;
    expect(body.model).toBe('pinned/spec-model-v1');
    expect(body.temperature).toBe(0.35);
    expect(body.reasoning).toEqual({ effort: 'low' });
    expect(body.max_tokens).toBe(2_400);
  });
});

describe('provider billing ambiguity and error classification', () => {
  const fakeResponse = (status: number, body = '') =>
    ({
      ok: status >= 200 && status < 300,
      status,
      text: async () => body,
      json: async () => JSON.parse(body || '{}'),
    }) as unknown as Response;

  it.each([400, 401, 402, 403, 404, 422, 429])(
    'classifies HTTP %i as definitelyNotBilled: true (gateway front-door refusal)',
    async (status) => {
      const fetchImpl = (async () =>
        fakeResponse(
          status,
          '{"error":"client_error"}',
        )) as unknown as typeof fetch;
      const provider = new OpenRouterAiProvider(config(), fetchImpl);

      let thrown: unknown;
      try {
        await provider.generateText(request);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(OpenRouterUnavailableError);
      expect((thrown as OpenRouterUnavailableError).definitelyNotBilled).toBe(
        true,
      );
    },
  );

  it.each([500, 502, 503, 504, 524])(
    'classifies HTTP %i as definitelyNotBilled: false (ambiguous upstream failure)',
    async (status) => {
      const fetchImpl = (async () =>
        fakeResponse(status, 'server error')) as unknown as typeof fetch;
      const provider = new OpenRouterAiProvider(config(), fetchImpl);

      let thrown: unknown;
      try {
        await provider.generateText(request);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(OpenRouterUnavailableError);
      expect((thrown as OpenRouterUnavailableError).definitelyNotBilled).toBe(
        false,
      );
    },
  );

  it.each([408, 409, 425, 499, 418])(
    'classifies non-allowlisted status HTTP %i as definitelyNotBilled: false (conservative fallback)',
    async (status) => {
      const fetchImpl = (async () =>
        fakeResponse(status, 'error')) as unknown as typeof fetch;
      const provider = new OpenRouterAiProvider(config(), fetchImpl);

      let thrown: unknown;
      try {
        await provider.generateText(request);
      } catch (err) {
        thrown = err;
      }

      expect(thrown).toBeInstanceOf(OpenRouterUnavailableError);
      expect((thrown as OpenRouterUnavailableError).definitelyNotBilled).toBe(
        false,
      );
    },
  );

  it('classifies empty content (HTTP 200 with no message text) as definitelyNotBilled: false', async () => {
    const fetchImpl = (async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '   ' } }],
        usage: { total_tokens: 50 },
      }),
    })) as unknown as typeof fetch;
    const provider = new OpenRouterAiProvider(config(), fetchImpl);

    let thrown: unknown;
    try {
      await provider.generateText(request);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(OpenRouterUnavailableError);
    expect((thrown as OpenRouterUnavailableError).definitelyNotBilled).toBe(
      false,
    );
  });

  it('classifies network abort or connection drop as OpenRouterTimeoutError (billingUnknown: true)', async () => {
    const fetchImpl = (async () => {
      throw new Error('ECONNRESET: connection reset by peer');
    }) as unknown as typeof fetch;
    const provider = new OpenRouterAiProvider(config(), fetchImpl);

    let thrown: unknown;
    try {
      await provider.generateText(request);
    } catch (err) {
      thrown = err;
    }

    expect(thrown).toBeInstanceOf(OpenRouterTimeoutError);
    expect((thrown as OpenRouterTimeoutError).billingUnknown).toBe(true);
  });
});
