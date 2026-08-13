---
patternId: closest
owningChallengeType: read-your-opponent
---

# Pattern: Closest Estimate

- Experience goal: create estimable uncertainty and confidence signaling.
- Interaction shape: submit a number while rivals choose Steal or Trust.
- ContentItem shape: prompt with explicit unit, basis, and bounded context.
- Interaction payload: `{ "unit": "...", "min": 0, "max": 100 }`.
- Resolution payload: `{ "correctValue": 42, "acceptedTolerance": 0 }`.
- Machine resolution: deterministic distance or configured tolerance, followed
  by the owner payoff matrix.
- Constraints: finite value, explicit unit and period, intuitively estimable.
- Scope compatibility: Scopes with reliable numeric dimensions.
- Media compatibility: optional evidence, never decoration.
- Tension levers: sensible magnitude, familiar comparisons, bounded range.
- Anti-patterns: arbitrary exact statistics, unstable live values, hidden unit,
  disputed measurement, or values no audience can reason toward.
- Valid example: estimate a familiar tournament total within a named edition.
- Invalid example: estimate an undocumented production cost.
