
# MANDATORY QA CONTEXT INDEPENDENCE (FAIL-CLOSED)
You MUST NOT evaluate content based on the generator's freeform rationale.
1. Extract the `mechanicKey`, `worldKey`, and `scopeKey` from the artifact's `_authoringContext` block.
2. Independently execute: `python3 ai/scripts/resolve_authoring_context.py --mechanic <slug> --world <slug> --scope <slug>`
3. Compare the generated hash with the artifact's `composedHash`. If they mismatch, or if the metadata block is missing, REJECT the item with `STALE_AUTHORING_CONTEXT`.
4. Evaluate the item strictly against the rules returned by the resolver.

---
name: akwaan-content-qa
description: >-
  Master workflow skill for reviewing, verifying, and quality-assuring authored Akwaan game content.
  Use when validating facts, checking ambiguity, detecting duplicates, auditing batch variety, and testing mechanic contracts.
---

# Akwaan Content QA Workflow

## 0. Mandatory QA Hard Gates (Fatal Errors)

1. **`BATCH_MEDIA_TARGET_90_PERCENT` (Fatal)**:
   - Batch achieves >= 90% media-bearing questions overall (>= 173 / 192 items).
   - Media carries the cognitive challenge; decorative media is rejected.

2. **`EXTRA_CLUE_WITH_MEDIA` (Fatal)**:
   - When media is present, the prompt MUST NOT contain descriptive clauses, player records, club hints, or answer-defining biography.
   - Default prompt shape: 2–6 words with scope-native noun (`"من هذا اللاعب؟"`, `"من هذه الشخصية؟"`, `"وش اسم هذا السلاح؟"`).

3. **`ASSET_FACTUAL_IDENTITY_MATCH_REQUIRED` (Fatal)**:


4. **`EXPERIENCE_GATE_FAILURE` (Fatal)**:
   - Does this question make the player recall or interact with the experience of the Scope, or does it merely test Wikipedia-style information about the Scope?
   - A technically correct, unambiguous question STILL FAILS if it feels like ordinary meta-trivia (e.g., release dates, studio history, sales numbers).
   - Batches dominated by Category B/C (Factual/Meta) content must fail QA even if all answers are factually correct.


5. **`MEDIA_EXPERIENCE_GATE_FAILURE` (Fatal)**:
   - Does the batch overwhelmingly rely on text-only content despite obvious native media opportunities?
   - Is media decorative instead of carrying gameplay information?
   - Are image/audio floors unmet across compatible mechanics without explicit mechanic-compatibility justification?
   - Is media being forced into incompatible mechanics (e.g., audio in Bomb) merely to satisfy percentages?
   - If any of these are true, the batch fails Product QA.


6. **`MEDIA_LED_PHRASING_GATE_FAILURE` (Rewrite Required)**:
   - Does the prompt repeat information visible/audible in the media or contain unnecessary narration?
   - Does it directly address the player without a mechanic-specific reason?
   - Has it been compressed so far that it feels robotic or lifeless?
   - Is formal trivia phrasing used where a simpler natural formulation works?
   - If yes, rewrite the prompt. The wording must be clear, neutral, and media-led, feeling like a polished game product.
   - PROMPT ↔ TARGET ANSWER ↔ EXACT MEDIA ASSET ↔ CARD/EVENT VERSION ↔ DISPLAYED VALUES ↔ EVIDENCE must strictly agree.

4. **`EXISTING_APPROVED_ASSET_AUTHENTICITY` (Fatal)**:
   - `EXISTING_APPROVED_ASSET` is permitted ONLY for assets proven from prior approved production batches. All new authentic public assets must be sourced via Wigolo workflow.

5. **`TOP5_TOPIC_NOT_INSTRUCTIONS` & `TOP5_VISIBLE_CANDIDATE_NAME_ONLY` (Fatal)**:
   - Prompt is Challenge Topic only. Candidate cards show ENTITY NAMES ONLY (0 numbers, goals, points, or ranks).

6. **`CONTENT_PROMPT_NOT_MECHANIC_TUTORIAL` (Fatal)**:
   - Zero tutorial phrasing ("تعاونوا...", "تجنبوا الفخاخ...", "رتبهم...").

7. **`NO_SYNTHETIC_ORDINARY_MEDIA` (Fatal)**:
   - 0 synthetic/AI-generated images for football players, anime scenes, or video games where authentic online media exists.

8. **`CONTEXTUAL_ANSWER_LEAKAGE` (Fatal)**:
   - Zero direct answer exposure in image or audio. Leakage is evaluated against **WHAT THE PLAYER IS REQUIRED TO ANSWER**:
     - ✅ **PASS**: Manufacturer logo/branding visible when player is identifying model/trim (e.g. Porsche crest + answer `GT3 RS`; Ferrari badge + answer `F40`).
     - ❌ **FAIL (Fatal Leakage)**: Readable model/trim text, badges, or plate lettering that directly expose the required answer (e.g. readable `GT3 RS`, `GT-R`, `F40`).
     - ❌ **FAIL (Fatal Leakage)**: Brand logos/text in multiple-choice questions where options are distinct vehicle brands.

9. **`BOMB_FAST_ANSWER_UNIQUENESS` (Fatal)**:
   - Cars Bomb answers must prioritize fast recognition over typing speed using the shortest unambiguous model/trim (e.g. `GT3 RS`, `GT-R`, `F40`).
   - Short answers must remain uniquely defensible (generic terms like `Turbo` or `RS` without unique context are rejected).
   - Prompt granularity must strictly match answer granularity (`"وش هذي الفئة؟"` for trim vs `"وش هذا الموديل؟"` for model line).

### Media QA & Failure Classifications
When auditing media candidates, apply the following strict failure classifications:
- **`MEDIA_INTENT_FIDELITY_FAILURE`**: The candidate fails to match the precise evidence requested. Example: The prompt asks about a crafting recipe, but the media shows the final crafted object (the answer replaced the evidence).
- **`TARGET_PROMINENCE_FAILURE`**: The required subject is present but lacks visual granularity. Example: A requested in-game Typewriter is tiny and lost within a broad room screenshot.
- **`SOURCE_LIVENESS_FAILURE`**: A candidate link (e.g., YouTube audio source) is dead, deleted, or unavailable. Such sources must never reach Human Product Review.
- **`RESOLUTION_STATE_CONSISTENCY_FAILURE`**: An item that already possesses a resolved canonical asset is erroneously downgraded or presented as lacking candidates.
- **`DUPLICATE_CANDIDATE`**: Fake A/B choices where candidates are functionally identical or share the exact same fallback media.

### Media QA vs Question Playability
Maintain explicit separation between:
- **MEDIA QUALITY:** "Is the media correct, authentic, reviewable, and faithful to the intent?"
- **QUESTION PLAYABILITY:** "Does this media + prompt combination create a satisfying game question?"

An item can PASS Media QA but FAIL the Playable Question Gate. Do not let strong media hide a weak question concept.

### Failure Classification Separation
Do not collapse failures into one generic media error. Use these distinct classifications:
- **`QUESTION_CONCEPT_FAILURE`:** The underlying task is not fun/meaningful even if media is technically and semantically correct (e.g., merely describing an obvious action like the Axe Recall).
- **`MEDIA_INTENT_FIDELITY_FAILURE`:** The media does not match the intended evidence (e.g., Cake object instead of crafting recipe grid).
- **`TARGET_PROMINENCE_FAILURE`:** The correct subject exists but is not visually/audibly prominent enough.
- **`SOURCE_PLAYABILITY_FAILURE`:** Candidate cannot actually be reviewed/extracted/played.
- **`MEDIA_VERIFICATION_FAILURE`:** Technical file validity is mistaken for semantic correctness.

### QA GATE: THE QUESTIONNESS GATE
- **Rule**: Items must be clear, crisp questions with concrete answers.
- **Reject**: Tactical scenarios ("what should you do?"), coaching prompts, hypothetical discussions, or questions that only make sense after reading their cognitive metadata.
- **Accept**: Simple, direct identification/recognition questions IF the underlying media evidence is strong and memorable. Identification is NOT automatically a failure.

- **Evidence-Driven Shape**: `THE EVIDENCE CHOOSES THE QUESTION SHAPE`. Do not fail a question for being "too simple" if the recognition moment is strong and native to the game. `MORE ANSWER PARTS != BETTER QUESTION`.
- **Reviewer Test**: Hide rationale, QA labels, and metadata. Ask: "Would this be fun and clear if a player saw/heard it in a real match?" If yes, accept it.
- **Batch Variety**: `VARIETY IS ENFORCED ACROSS THE BATCH, NOT BY OVERLOADING EACH QUESTION`. Do not penalize an individual item for lacking multiple cognitive steps if the batch as a whole has cognitive variety.

## Canonical QA Order

Before evaluating content semantics, you MUST execute QA in this exact order:

1. **Context/Provenance Gate:** Verify `_authoringContext`.
2. **Schema & Mechanic Constraints:** Check mechanic payload requirements.
3. **Duplicate/Novelty Gate:** Check concept against canonical history (APPROVED/REJECTED/SEEN). A duplicate concept MUST be rejected with `QA_REJECT — DUPLICATE_CONCEPT`. SEEN = NOT FRESH.
4. **Ambiguity Gate:** Could multiple distinct factual targets satisfy the prompt? If yes, `QA_REJECT — AMBIGUOUS_EXPECTED_ANSWER`.
5. **Answer Integrity Gate:** Does the expected answer set accurately and completely represent the ONE intended target? Every alias MUST refer to exactly the same factual entity. Semantic paraphrases for outcomes must contain the load-bearing consequence. Reject if aliases are merely related concepts or incomplete. (`QA_REJECT — ANSWER_INTEGRITY`)
6. **Scope/World Taste QA:** Evaluate against `KNOWLEDGE.md`.
7. **Factual Defensibility:** Verify the truthfulness of the answer.
8. **Media Contract:** Ensure the `mediaIntent` or attached media aligns with the mechanic. Do not duplicate audio text in the prompt.
9. **Human Product Review:** If all pass, output `QA_PASS — PENDING_HUMAN_PRODUCT_REVIEW`.

## Important Principles
- `ANSWER INTEGRITY != AMBIGUITY`. Ambiguity means the prompt is unclear. Answer Integrity means the prompt is clear but the alias array is polluting the answer with non-equivalents.
## Important Principles

- `ALIASES MUST BE SEMANTICALLY EQUIVALENT`
- Aliases must not represent different entities or different factual answers.
- `EXEMPLAR != GENERATION TARGET`
- Do not let authors reuse concrete historical examples as new questions unless explicitly requested.
