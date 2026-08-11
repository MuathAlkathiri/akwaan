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
clues), the two-participant and three-participant shapes (the third participant
holds ONLY the instruction — no third fragment, no distributed rule/axis/visual,
no candidate list, no extra puzzle data), host-screen independence, no fragment
or full-puzzle duplication, no trivia masquerading as puzzles, deterministic
truth or an explicit multi-accepted-solution policy, truth separation,
visibility review, no runtime-owned fields, and exactly three items per
Challenge. QA must run the manual logic gate: re-derive the answer independently
from the instruction plus both fragments and record `derivedAnswer`,
`expectedAnswer`, and `logicVerified` in `05-qa.json`; reject when
`derivedAnswer != expectedAnswer` or when the reasoning relies on an unstated
rule. The validator cannot prove puzzle logic, so this gate is mandatory and may
override a passing validator. QA must also confirm every item's reviewer solo
test recorded `aSoloSolvable` and `bSoloSolvable` as false (the answer must not
be deterministically derivable from instruction plus a single fragment), confirm
each accepted item's scope routing (its primary material and solving operation
genuinely belong to the declared Scope; an item whose core is, for example,
symbol value-decoding is routed to `symbols-codes`, not kept for family
diversity), and recompute difficulty, family, and answer-format counts from final
item metadata instead of hand-written totals. Verify a three-item Challenge
spans three distinct puzzle families. Every item must
remain authoring-only while the shared-fragments runtime contract is pending.

One Clue must pass `validators/validate_one_clue.py` and its fixtures. QA must
re-run the manual monotonic ladder gate on every item (record `ladderTransitions`
in `05-qa.json`), confirm the Reviewer recorded the early-giveaway and
useless-clue tests, confirm no literal or alias leakage beyond the documented
short-alias threshold, confirm each clue fact is verified and adds new
information, confirm the truth lives only in `answerPayload`, confirm `media:
null`, confirm a Challenge spans exactly three distinct items, and confirm the
item may be marked `ready` because the runtime contract is production-ready
(`runtimeContractStatus: fully_playable`). The validator cannot prove monotonic
quality, factual support, or usefulness, so these reasoning gates are mandatory
and may override a passing validator.

## Boundaries
Do not silently repair upstream files, waive hard failures, import, or publish.

## Owned Output
`05-qa.json` with `ready`, `ready_with_warnings`, or `blocked`; totals; reasoned
findings; coverage; unresolved risks; and human-review handoff.
