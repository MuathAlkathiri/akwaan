---
name: akwaan-content-qa
description: >-
  Master workflow skill for reviewing, verifying, and quality-assuring authored Akwaan game content.
  Use when validating facts, checking ambiguity, detecting duplicates, auditing batch variety, and testing mechanic contracts.
---

# Akwaan Content QA Workflow

## 0. Responsibilities & Validation Philosophy

QA evaluates content across three distinct tiers:

1. **HARD ERRORS (Hard Invariants)**: Violations of factual truth, Zero Answer Leakage, schema, runtime contracts, or prompt length limits (>250 chars). These **block** review and must be fixed.
2. **ADVISORY WARNINGS (Quality Targets)**: Highlights batch diversity concerns (archetype concentration >35%, repetitive prompt openings >40%, clustering). These are guidance for authoring optimization and do not automatically invalidate mechanic-native batches.
3. **DIVERSITY SCORE (Advisory Product QA)**: A holistic metric ($D \ge 0.65$) assessing set texture.

---

## 1. Hard QA Gates (Errors)

- **Gate 1: Zero Answer Leakage**: Prompt text, media assets, or quote excerpts must never contain or trivially leak the answer target.
- **Gate 2: Archetype Validity**: If specified, `authoring.questionArchetype` or `questionArchetype` must be a recognized canonical ID from `QUESTION-ARCHETYPES.md`.
- **Gate 3: Factual & Canon Truth**: 100% verified against canonical Scope references (`KNOWLEDGE.md`) and authoritative sources.
- **Gate 4: Normalization & Collision-Free Answers**: `acceptedAnswers` must contain all legitimate Arabic spelling variants; zero collisions within the same Scope.
- **Gate 5: Prompt Length**: Must not exceed 250 characters (`ANTI_WALL_TEXT`).
- **Gate 6: Mechanic Schema Compliance**: Must adhere strictly to the target runtime content policy (`bomb`, `combo`, `marhala`, `one-clue`, `ryo`, `closest`, `top-5`, `distributed-information`).
- **Gate 7: Bomb Semantic Alignment**: Verify identity across prompt type, authored subject, accepted answers, and actual visual subject.
- **Gate 8: Scope-Native Alignment**: The core fact and question target must meaningfully belong to the selected Scope, not merely to the broader World (e.g. a generic career fact must not be placed in Champions League without an authentic Champions League anchor).
- **Gate 9: Unique-Answer Defensibility**: The question must have exactly one defensible target answer. If a knowledgeable player could give another equally valid answer (e.g. under-specified nickname with multiple candidates), the question must be rewritten or replaced.
- **Gate 10: Media-Earns-Its-Place**: For IMAGE and AUDIO items, the media must carry the core gameplay challenge. If the prompt contains an identifying nickname, title, or verbal giveaway that allows answering without seeing/hearing the media, the prompt must be stripped of the giveaway clue.
- **Gate 11: Difficulty Trust**: For risk-choice mechanics (especially Marhala), difficulty labels must be genuinely calibrated. Hard must require deeper recognizable fandom recall, not obscure wiki minutiae, tiny crops, or confusing wording. Evaluate comparatively (Easy vs Medium, Medium vs Hard) from the player's risk/reward perspective.

---

## 2. Advisory Quality Gates (Warnings & Diversity Score)

- **Archetype Concentration**: Single archetype $\le 35\%$ of batch (mechanic-native exceptions allowed).
- **Archetype Spread**: $\ge 4$ distinct archetypes for batches $\ge 9$ items.
- **Prompt Opening Spread**: $\le 40\%$ starting with generic `"من / ما"`.
- **Clustering**: $\le 2$ consecutive items sharing the exact same archetype.
- **Diversity Score ($D$)**: Evaluated using `validate_question_craft.py`:
  - Target: $D \ge 0.65$ (Passing target $\ge 0.80$).
