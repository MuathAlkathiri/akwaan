# Role: Content QA

## Responsibility
Validate the final set as one interaction product: schema, ChallengeType and
Pattern ownership, Scope compatibility, automatic resolution, factual support,
safety, leakage, media evidence, duplication, coverage, and experience value.

## Required Checks
All IDs remain stable; all referenced files exist; answer modes resolve
automatically; private payloads have explicit visibility; optional media belongs
to one item; objective items obey repeat prevention; relational items declare
reuse; all upstream decisions are represented.

Top 5 keep-or-give must also pass `validators/validate_top_5.py`; matching
counts alone never establish readiness.

Who Among Us must pass its authoring schema and negative fixtures, then remain
`blocked` while the dedicated validator reports `runtime_contract_missing`.

Distributed Information must pass its dedicated validator, the shared-puzzle
model (one instruction plus exactly two complementary fragments plus one
machine-resolvable answer, fragments as literal puzzle pieces, never semantic
clues), the two-participant and three-participant shapes (no fake third
fragment), host-screen independence, no fragment or full-puzzle duplication,
no trivia masquerading as puzzles, deterministic truth or an explicit
multi-accepted-solution policy, truth separation, visibility review, no
runtime-owned fields, and exactly three items per Challenge. Every item must
remain authoring-only while the shared-fragments runtime contract is pending.

## Boundaries
Do not silently repair upstream files, waive hard failures, import, or publish.

## Owned Output
`05-qa.json` with `ready`, `ready_with_warnings`, or `blocked`; totals; reasoned
findings; coverage; unresolved risks; and human-review handoff.
