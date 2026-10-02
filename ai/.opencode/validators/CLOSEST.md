# مين أقرب (Closest) Validation

## Canonical Identifiers

- ChallengeType: `closest`
- runtime mode: `closest`
- answer payload: `answerPayload.mode = closest` with numeric `correctValue`
- interaction payload: `mechanicPayload.closestSlider`
- authoring rules: `ai/.opencode/skills/challenge-types/closest/SKILL.md`

## Hard Checks

`validate_closest.py` validates the mechanical half of the contract: an explicit
`numeric-range` or `between-anchors` mode (never `legacy`, never unset); finite
`min`/`max` with `min < max`; a positive `step`, required for `numeric-range`;
`correctValue` inside the range **and** exactly reachable from `min` by `step`;
`displayFormat` limited to `number` or `calendar-year`; a `calendar-year` slider
carrying no `unit` and applying only to `numeric-range`; both anchor labels
present and non-empty for `between-anchors`.

For an authored scale batch it additionally proves **nothing drifted during
authoring**: every source ID present, no invented IDs, no duplicate IDs, and
`prompt`, `correctValue` and `acceptedTolerance` identical to the source
worklist. Items carrying `holdForContentReview` must be passed through
unauthored, and a dropped hold is an error.

## What this validator deliberately does NOT decide

**Whether the range is domain-derived.** That is the question that actually
determines whether a Closest item is good, and it is not automatable. A
target-shaped range — `correctValue ± N` dressed up as a domain — satisfies every
mechanical check above.

The reviewer's question stays human:

> **"Could these exact endpoints be justified if `correctValue` were hidden?"**

Automation flags. Human and Product decide.

## Midpoint

`midpoint_signal()` classifies each authored item as `exact-midpoint`,
`near-midpoint` or `clear`, computed **after** the continuum exists. It is
reported, never enforced. Pilot 01 failed because six of seventeen ranges seeded
the thumb exactly on the answer; Pilot 02 showed that a shared, independently
defensible continuum may still place one answer at its midpoint honestly. The
signal exists to start that conversation, not to end it.

## Usage

```
python3 validate_closest.py <authored-batch.json> [<source-batch.json>]
python3 validate_closest.py <single-contentitem.json>
python3 test_closest_fixtures.py
```
