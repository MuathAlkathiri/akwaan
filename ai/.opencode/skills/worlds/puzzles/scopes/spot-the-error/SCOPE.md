# Scope: Spot the Error (اكتشف الخطأ)

- `scopeId`: `puzzles.spot-the-error`
- `worldId`: `puzzles`
- Player-facing Arabic name: **اكتشف الخطأ**
- Primary solve: **Infer an objective rule, then find what violates it.**
- The question it asks the player: «What rule is being broken, and where?»
- Boundary: a rule must be inferable from the material itself, and exactly one element
  must break it. Two steps, always: infer the rule, then locate the breach.
- Included: wrong element, intruder, invalid member, incorrect component or order, rule-breaking visual.
- Excluded: noticing a detail with no rule behind it — that is `observation-illusions`;
  anything where the 'error' is only wrong if you already knew the fact.
- `excludedChallengeTypeIds`: []

**اكتشف الخطأ may use Between Two Anchors naturally for spatial targeting («وين الخطأ؟»).**

## World invariants this Scope inherits

- `PUZZLES_WORLD_NO_TRIVIA` — ordinary trivia in a cosmetic puzzle wrapper is
  invalid here. An item that a player answers by *knowing a fact* does not
  belong in this Scope regardless of how it is dressed.
- `PUZZLE_ITSELF_IS_THE_CHALLENGE` — the puzzle must be self-contained in what
  the player is shown. No outside lookup, no recall dependency.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight,
religion, romantic relationships, intelligence judgements, or awkward
family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See
roadmap §23.11.
