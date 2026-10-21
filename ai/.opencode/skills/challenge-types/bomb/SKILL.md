# Mechanic Profile: Bomb (سؤال القنبلة)

## Identity & Player Experience
Rapid-fire, high-pressure recognition. The clock is continuous; hesitation is punished. Players must recognize the subject instantly from clean, distinctive evidence.

## Gameplay / Authoring Contract
No extra reading. No complex inference. The prompt must be $<70$ chars. The media (if any) MUST be instantly clear.

## Item Structure
1 Prompt (Text). Up to 1 Media Asset.

## Payload Contract
`mode: 'match'`
Run cardinality: 10–15 items per pack.

## Answer Semantics
1-10 accepted aliases. Max 120 chars each.
Brevity must preserve uniqueness.

## Modality Constraints
- Allowed: `image`, `none`
- FORBIDDEN: `audio` (Clock continuous mechanics do not support audio-driven items).

## Mechanic-Native Quality Bar
- Fast-Answer Naming: Prefer the SHORTEST widely recognized unique designation.
- Prompt & Answer Granularity Alignment (e.g. "وش هذا السلاح؟" -> "Ray Gun").

### Cars World specialization

When Bomb is used with the Cars World, apply the mechanic-specific fast-answer
contract here: use the shortest unambiguous model or trim designation; reject
generic labels such as `Turbo`, `Sport`, `RS`, or `GT` when they are ambiguous;
align prompt granularity with the requested model/trim; normalize only
punctuation, spacing, and equivalent Arabic/English transliterations; and do
not accept a manufacturer-only fallback for a model question. Manufacturer
branding may remain, but readable model/trim badges or plate text that answer
the prompt must be cropped or obscured. This specializes Bomb and does not
replace the global contextual leakage rule in QUESTION-CRAFT.

## Anti-Patterns
- Complex multi-step reasoning.
- Long prompts.
- Audio media.

## QA Gates
- `BOMB_FAST_ANSWER_UNIQUENESS`
- `NO_AUDIO`
