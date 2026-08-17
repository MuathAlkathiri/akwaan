# Scope: German Cars

- `scopeId`: `cars.german-cars`
- `worldId`: `cars`
- Boundary: German car brands, models, performance divisions, generations,
  naming, and automotive icons.
- Included: Mercedes-Benz, BMW, Porsche, Audi, Volkswagen; performance divisions
  (AMG, BMW M, Audi RS); Porsche model families; famous sedans, sports cars,
  SUVs, generations.
- Excluded: excessive trim-code memorization, M-package vs M confusion,
  AMG-line vs AMG confusion, Audi S vs RS confusion.
- `excludedChallengeTypeIds`: []
- Pattern exclusions: none.
- Safety: verify exact model/generation/variant/model-year before authoring;
  do not confuse M package with real BMW M cars, AMG-line with Mercedes-AMG,
  Audi S with RS, or Porsche generation designations.

# German Cars Knowledge

## Identity and Vocabulary

Durable sets include German manufacturers, performance divisions, iconic model
families, and precise model naming.

## Safe Entity Sets

- Manufacturers: Mercedes-Benz, BMW, Porsche, Audi, Volkswagen.
- Performance divisions: Mercedes-AMG, BMW M, Audi RS/S.
- Iconic models: 911 (Porsche), 911 Turbo, GT3, Boxster/Cayman; BMW 3 Series,
  M3, M5; Mercedes C-Class, S-Class, AMG GT; Audi A4, RS6, R8; VW Golf, Golf GTI,
  Golf R, Beetle.
- Generations: Porsche 911 (991, 992), BMW E30/E36/E46 M3, Golf GTI (Mk1-Mk8).

## Stable Classifications

Model-to-manufacturer, model-to-division, and generation-to-era associations
are deterministic and safe.

## Ambiguity and Sources

M package vs M car, AMG-line vs AMG model, Audi S vs RS, and Porsche generation
designations are high risk. Use exact names. Prefer stable identity facts over
volatile specs. Arabic terms must match established usage.