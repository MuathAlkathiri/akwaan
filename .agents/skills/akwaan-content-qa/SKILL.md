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
- **Gate 12: Visual Truth & Identity Integrity (Strict Invariants)**:
  - **`AUTHENTIC_BLANK_CARD_COMPOSITION`**: For FIFA / EA FC player identity questions (`"مين هذا اللاعب؟"`), always use authentic blank-card composition. Never use portrait blur, 2D inpainting, censor bars, silhouettes, striped fills, checkerboards, or obvious patches. Sourcing must use a matching clean blank-card shell from the same card family/edition/promo. If a matching authentic blank card cannot be sourced, reject the candidate.
  - **`PLAYER_IDENTITY_MASKING_AND_DIFFICULTY`**:
    - Always hide: player portrait and player name.
    - **EASY / Base-Gold Cards**: Nationality flag STAYS VISIBLE. Overall rating, position, and all six face stats stay visible.
    - **HARD / Special-Promo-Icon-Hero Cards**: Portrait and name hidden; nationality and direct identity metadata may be hidden. Rating, position, and all six face stats stay visible.
    - **Visible Card Data Integrity**: Position (e.g. ST must not become CT), rating, and stats must remain 100% undamaged, correctly aligned, and authentic.
    - **Difficulty Calibration**: Masking quality never determines difficulty. Difficulty comes strictly from the card variant (Base/Gold $\rightarrow$ Easy; Special/Promo/Icon $\rightarrow$ Hard).
  - **`EVENT_RECOGNITION_VISUAL_TRUTH`**: For FIFA promo event recognition questions (`"وش اسم هذا الحدث؟"`), the prompt must remain neutral and the media itself must carry the challenge. Use a real visual belonging to that exact promo event. `WRONG_EVENT_ASSET_IS_FATAL` — a mismatch between event visual and target event is a fatal defect.
  - **`WRONG_ASSET_IS_FATAL`**: If the underlying media depicts a different player, event, weapon, map, vehicle, or location than the authored answer, the item is invalid and must be completely replaced, never patched superficially.
  - **`NO_FALSE_VISUAL_VERIFICATION`**: Never claim an item or media asset is visually verified based solely on file presence, dimensions, container headers, or assumed download IDs. Final semantic visual truth requires forensic inspection of rendered pixels, text layers, and human product review.
  - **`FUTURE_BATCH_HARD_GATE`**: A FIFA `PLAYER_FROM_CARD` item is incomplete unless it has: (1) authentic player-card factual reference, (2) matching authentic blank-card foundation, (3) final composed player-facing asset, (4) exact verified gameplay values, (5) no portrait, (6) no name, (7) difficulty calibrated by card variant, (8) final visual QA, (9) human product review.
  - **`TARGET_ONLY_MASKING`**: Mask strictly and completely the tested field across its entire bounding area, ensuring zero residual characters or secondary answer leaks remain visible anywhere on the asset.
  - **`CLEAN_CARD_CROP`**: All game assets must be cleanly cropped of web companion UI, external sidebars, tooltips, hover widgets, and synthetic overlays.

---

## 2. Advisory Quality Gates (Warnings & Diversity Score)

- **Archetype Concentration**: Single archetype $\le 35\%$ of batch (mechanic-native exceptions allowed).
- **Archetype Spread**: $\ge 4$ distinct archetypes for batches $\ge 9$ items.
- **Prompt Opening Spread**: $\le 40\%$ starting with generic `"من / ما"`.
- **Clustering**: $\le 2$ consecutive items sharing the exact same archetype.
- **Diversity Score ($D$)**: Evaluated using `validate_question_craft.py`:
  - Target: $D \ge 0.65$ (Passing target $\ge 0.80$).
