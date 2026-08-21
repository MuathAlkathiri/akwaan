---
name: akwaan-content-qa
description: >-
  Workflow skill for reviewing, verifying, and quality-assuring authored Akwaan game content.
  Use when validating facts, checking ambiguity, detecting duplicates, and testing mechanic contracts.
---

# Akwaan Content QA Workflow

## Responsibilities
- Validate authored content items against factual truth, canon, and gameplay quality standards.
- Enforce strict boundaries: no silent fixes, no runtime DB mutations, and no importing without explicit approval.

## QA Validation Gates

1. **Factual & Canon Verification**:
   - Verify every factual claim against canonical references (`ai/.opencode/skills/worlds/<world>/scopes/<scope>/KNOWLEDGE.md`) and reliable external sources.
   - Reject disputed, unverifiable, or speculative assertions.

2. **Ambiguity & Single Truth**:
   - Verify that prompts and clues lead to a clear, unambiguous answer.
   - Eliminate misleading wording or subjective superlatives ("الأشهر", "الأفضل") unless anchored to verifiable metrics.

3. **Duplication & Near-Duplicate Review**:
   - Scan for semantic overlap, identical target entities, or repeated clues across the target Scope and existing catalog.

4. **Accepted-Answer Quality & Arabic Normalization**:
   - Ensure accepted answers cover all legitimate Arabic variants, spellings, and transliterations.
   - Verify compatibility with canonical Arabic normalization (stripping tashkeel, normalizing alef/hamza/ya, collapsing whitespace).
   - Ensure individual accepted answer strings are within length limits (≤120 chars) and free of internal duplicates.

5. **Zero Answer Leakage Rule (Strict QA Gate)**:
   - A question must **NEVER leak its own answer**. Reject or rewrite any item where a player can derive the answer directly from the wording instead of actual knowledge.
   - **Checklist**:
     1. The answer must not appear explicitly in the prompt.
     2. No near-verbatim phrasing of the answer in the prompt.
     3. Famous quotes/catchphrases must not be included if the quote itself contains the answer target (e.g. no "Over 9000" in prompt for answer 9000).
     4. No arithmetic or direct computation embedded in prompt (e.g. no "8 universes × 10 fighters" for answer 80).
     5. Clue chains must not make the answer trivial without real domain knowledge.
     6. For Bomb: visual recognition only; character items must use neutral prompts (`"من هذه الشخصية؟"`).
     7. For RYO: prompt stem must not state or include the correct option text.
   - **Core Test**: *If a player does not know the fact, but can still deduce the answer from prompt wording alone, the item FAILS QA.*

6. **Scope Correctness & Theme Fidelity**:
   - Confirm that the item's core subject and solving operation belong strictly to the declared Scope, not merely mentioning an entity tangential to the Scope.

7. **Mechanic Compatibility & Contract Adherence**:
   - Verify the item matches the runtime content policy (`backend/src/modules/world-content/domain/*-content.policy.ts` and `ai/.opencode/validators/`).
   - Confirm required fields (e.g., image assets for Bomb, `clues` array for One Clue, `comboStage` for Combo).

8. **Difficulty Calibration (When Relevant)**:
   - For staged mechanics like Combo (stages 1–4) or ladders like One Clue, verify the progression is monotonic and calibrated.
   - Ensure Scope and difficulty remain independent (never treat a whole Scope as inherently "easy" or "hard").

