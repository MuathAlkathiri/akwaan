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

Distributed Information must pass its three supported-mode fixtures, all
negative cases, exact A/B/C rules, the personal-puzzle model (each segment an
independent mini-puzzle whose answer is a derived World clue, never a
count/sum/frequency/list-total or arithmetic construction, never a decorative
read-aloud), every canonical 2+1 partition left unable to resolve alone,
machine-readable `candidateSets` (segment sets ≥2, pair intersections ≥2,
triple intersection exactly the ground truth, membership canon-derived and
never bent to fit the triangle), truth
separation, visibility review, no runtime-owned fields, and set size of three.

## Boundaries
Do not silently repair upstream files, waive hard failures, import, or publish.

## Owned Output
`05-qa.json` with `ready`, `ready_with_warnings`, or `blocked`; totals; reasoned
findings; coverage; unresolved risks; and human-review handoff.
