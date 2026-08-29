---
name: challenge-type-rakkibha
description: Canonical authoring contract and interaction-pattern library for ركّبها.
---

# ركّبها / Rakkibha

Load this skill before authoring, reviewing, or validating Rakkibha content.
Read `../../knowledge/architecture/RAKKIBHA.md`, Craft guidance, and
`BATCH-VARIETY.md` first. Rakkibha belongs to Puzzles World: the puzzle itself
is the challenge, never ordinary trivia.

## Experience Goal

Make private information genuinely useful only after verbal comparison, yielding
a quick shared deduction rather than a recall test.

## Social Dynamic

Players have asymmetric private roles and must explain, clarify, disagree, and
eliminate together; nobody inspects another player's screen.

## Stable identity

**Private information → verbal description/comparison → shared reasoning → team
solution.** Players cannot inspect one another's phones. No player may possess
all required information. Private views must create real uncertainty or
comparison; visual theme variation is not interaction variation.

For the currently implemented runtime, author the native visual-assembly
payload: one private reference and two candidate-holder views with 2–3 local
candidates each. `canonicalIdentity` is server-only. Never put correctness,
ownership, or a solution marker in visible text/media.

## Canonical interaction patterns

| ID | Arabic product name | Runtime status | Conversation operation |
| --- | --- | --- | --- |
| `ROUTE_NAVIGATION` | أي طريق يوصل؟ | `CURRENT_RUNTIME_COMPATIBLE` | Describe turns, obstacles, landmarks, and route relations; eliminate invalid candidate routes. |
| `SYMBOL_CODE_RECONSTRUCTION` | فك الرمز | `CURRENT_RUNTIME_COMPATIBLE` | Combine private symbol meanings, transformations, positions, and sequences to select an output. |
| `CONSTRAINT_SATISFACTION` | أي واحد يحقق الشروط؟ | `CURRENT_RUNTIME_COMPATIBLE` | Compare at least two constraints against candidate arrangements; distractors satisfy some but not all. |
| `DEFUSE_LOGIC` | فك القنبلة | `CURRENT_RUNTIME_COMPATIBLE` | Combine device state, conditional rules, and exceptions to select one safe action. This is not the Bomb ChallengeType. |
| `MISSING_PIECE` | القطعة الناقصة | `CURRENT_RUNTIME_COMPATIBLE` | Describe an incomplete reference and identify its matching candidate. Valid, but never the default identity. |
| `DISTRIBUTED_ARABIC_NAME_BANK` | استخرج الأسماء | `NEEDS_RUNTIME_EXTENSION` | Combine private Arabic letter sets and discover many names. Requires repeated submissions/progress at runtime. |
| `ODD_SCENE_MATCHING_PAIR` | مين المختلف؟ / مين نفس بعض؟ | `NEEDS_RUNTIME_EXTENSION` | Compare near-identical private scenes to determine the odd player or matching pair. Requires peer-scene assignment/runtime resolution. |

Do not add a new canonical pattern without explicit Product approval. Record a
candidate as `PROPOSED_PATTERN`; do not treat it as production-ready.

## Pattern-specific gates

- Routes are spatial, mobile-readable, and not microscopic mazes or pure counts.
- Symbol Code Reconstruction requires a real decoding, transformation, derivation, mapping, sequencing, or reconstruction operation. Record `symbolReconstruction` with input, rule, operation, and derived candidate; direct visual copying is invalid.
- Constraint items include ≥2 meaningful constraints and uniquely defensible output.
- Defuse Logic models one shared device and one actionable state. Record `defuseLogic` with that device and contributions that all name its `deviceId`; independent panel/device states are invalid. Conditions and exceptions must affect the uniquely defensible candidate action.
- Missing Piece is at most 20% of a 10+ item batch. Gears, tangrams, grids and polygons are still one pattern.
- Name Bank has a target of 9, an authoring solution pool of ≥12 recognizable Arabic names, independent per-name letter reuse, and multiset limits within each name.
- Odd Scene variants depict the same semantic scene; differences are readable at phone size and may be color/count/position/orientation/relational, not scene-type swaps.

## Batch workflow

For a batch of 10+ items, plan this table before items:

| Item | Scope Slug | Interaction Pattern | Runtime Compatibility | Interaction Summary |
| --- | --- | --- | --- |

Require at least 5 distinct canonical patterns; no pattern exceeds 2 items
unless explicitly requested; `MISSING_PIECE` is ≤20%. Reject a batch whose
labels differ but whose expected player conversations are materially identical.

`interactionPattern` describes how the team plays; `scopeSlug` describes the Puzzles content domain. They are independent. Select `scopeSlug` only from canonical Puzzles Scope manifests; never invent it from an interaction theme. If none fits, stop with `SCOPE_COVERAGE_BLOCKER`.

For every item, include a brief `expectedConversation` with description,
clarification, comparison/elimination, and shared deduction. Complexity is not
the goal: simple private information plus interesting communication is.

## Authoring status

Only `CURRENT_RUNTIME_COMPATIBLE` patterns may be marked fully playable. For
`NEEDS_RUNTIME_EXTENSION`, set authoring metadata to `authoring_only`, state the
runtime blocker, and never promote as production-ready. This skill does not add
runtime commands, media, or database content.

## Validation

Use `python3 .opencode/validators/validate_rakkibha.py <item-or-batch.json>`.
The validator checks the native payload plus interaction-pattern metadata,
batch variety, compatibility status, and Name Bank letter/name rules.

## Player Emotion

Curiosity, useful uncertainty, and shared relief when the team eliminates a
plausible alternative together.

## Interaction Pattern

The pattern records what players do and discuss, not the drawing's theme.

## Thinking Pattern

Translate private spatial, symbolic, or conditional information into a shared
model, test candidates, and eliminate mismatches.

## Success Pattern

The team identifies a holder and that holder's local candidate through spoken
comparison; that holder submits it.

## Failure Pattern

A plausible local candidate is wrong; the existing five-second team lock applies
without revealing ownership.

## Input Contract

The implemented runtime accepts `submit-candidate` with the current
`contentItemId` plus the holder-local `localCandidateId`.

## Resolution Contract

The server resolves participant plus local ID to a private identity and compares
that identity with the canonical one.

## Content Structure

One ContentItem carries neutral instruction, private reference media, candidate
views, server-only identities, and authoring metadata.

## Allowed Content Patterns

Use only the canonical library; unapproved ideas remain `PROPOSED_PATTERN`.

## Content Safety Rules

No trivia, answer leakage, cosmetic private views, tiny inaccessible details, or
any dependency on players showing phones to each other.

## Media Compatibility

Media must carry information and remain readable on phones using the existing
media contract.

## Scope Compatibility

Rakkibha belongs to Puzzles World; scope chooses material rather than behavior. `scopeSlug` must be an existing canonical Puzzles scope, never a pattern-shaped invention such as `device-logic`, `logic-mazes`, or `logic-grids`.

## Validation Rules

Validate the native payload and authoring metadata before human review.

## Anti-patterns

Do not make Missing Piece the default, copy conversation shapes across a batch, conflate Defuse Logic with Bomb, or claim extension-only patterns are playable. Reject fake Symbol reconstruction, split-state Defuse puzzles, and invented scopes.
