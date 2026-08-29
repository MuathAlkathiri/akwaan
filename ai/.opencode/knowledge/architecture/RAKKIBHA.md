# ركّبها / Rakkibha — Canonical Authoring Definition

Rakkibha is a cooperative Puzzle World mechanic: **private information → verbal
description/comparison → shared reasoning → team solution**. It is not ordinary
trivia and it is not synonymous with a missing geometric piece.

## Current runtime representation

The active `rakkibha` runtime uses asymmetric visual candidate selection:

- one reference holder receives an incomplete/private reference and cannot submit;
- one or two candidate holders receive 2–3 local candidates;
- exactly one candidate globally resolves to the server-only canonical identity;
- players compare their private views aloud; the appropriate candidate holder
  submits a local candidate; and
- the shared screen remains neutral.

This runtime representation supports several distinct interaction patterns.
The content must label the actual player operation in authoring metadata; visual
themes do not create a new interaction pattern.

## Canonical authoring patterns

`ROUTE_NAVIGATION`, `SYMBOL_CODE_RECONSTRUCTION`, `CONSTRAINT_SATISFACTION`,
`DEFUSE_LOGIC`, and `MISSING_PIECE` are `CURRENT_RUNTIME_COMPATIBLE`.
`DISTRIBUTED_ARABIC_NAME_BANK` and `ODD_SCENE_MATCHING_PAIR` are product-approved
but `NEEDS_RUNTIME_EXTENSION`; they remain authoring-only and cannot be claimed
as runtime-playable.

`SYMBOL_CODE_RECONSTRUCTION` must show a real decoding, transformation, derivation, mapping, sequencing, or reconstruction operation. A final sequence already visible for direct candidate matching is not this pattern. `DEFUSE_LOGIC` has exactly one shared device and one actionable state: every private contribution refers to that same device, never independent panel states.

`MISSING_PIECE` is valid but is not the default Rakkibha identity. In a 10+ item
batch it is ≤20%; at least five patterns are represented and no pattern has more
than two items unless explicitly requested.

## Required authoring proof

Every item records an expected player exchange that demonstrates material
description, clarification/comparison, elimination or disagreement, and shared
deduction. Reject fake variety where different pictures lead to the same
“describe the gap → I have it” conversation.

For `DISTRIBUTED_ARABIC_NAME_BANK`, names are evaluated independently: letters
are reusable between proposed names but never beyond their combined multiplicity
within one name. The source solution pool is ≥12 recognizable Arabic names while
the default objective is 9.

## Boundaries

No player sees the whole solution, private views are never cosmetic, and no
authoring source encodes runtime state, correct owner, or visible answer leakage.
Do not infer new canonical patterns: use `PROPOSED_PATTERN` until Product
approves one.

`interactionPattern` describes team behavior while `scopeSlug` describes the Puzzles content domain. Select only an existing canonical Puzzles Scope; never invent a pattern-shaped scope. If none fits, flag `SCOPE_COVERAGE_BLOCKER`.
