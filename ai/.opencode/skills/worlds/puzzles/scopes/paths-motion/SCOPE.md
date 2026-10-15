# Scope: Paths and Motion (مسارات وحركة)

- `scopeId`: `puzzles.paths-motion`
- `worldId`: `puzzles`
- Player-facing Arabic name: **مسارات وحركة**
- Primary solve: **Predict a deterministic system in motion.**
- The question it asks the player: «What happens after the system moves?»
- Boundary: a closed, fully specified mechanism whose outcome follows necessarily from
  what is drawn. Determinism is the contract: one state in, one state out.
- Included: paths, wires, gears, pulleys, dominoes, switches, cause-and-effect diagrams.
- Excluded: real-world physics knowledge, anything whose outcome depends on unstated
  friction, timing or force, and any system the diagram does not fully specify.
- `excludedChallengeTypeIds`: []

## World invariants this Scope inherits

- `PUZZLES_WORLD_NO_TRIVIA` — ordinary trivia in a cosmetic puzzle wrapper is
  invalid here. An item that a player answers by *knowing a fact* does not
  belong in this Scope regardless of how it is dressed.
- `PUZZLE_ITSELF_IS_THE_CHALLENGE` — the puzzle must be self-contained in what
  the player is shown. No outside lookup, no recall dependency.

## Puzzle families (Moving XO authoring)

Families are authoring guidance for the Puzzles Signature mechanic. They are
**not** a database field and carry no runtime behaviour — see
`ai/.opencode/knowledge/architecture/MOVING-XO.md`.

Every family answers on a **text-only** phone within the **15-second** window,
while the prompt and media sit on the shared screen.

| Family | Arabic | Media | Answer modes |
|---|---|---|---|
| `path-trace` | تتبّع مسار | required | `multiple_choice` |
| `mechanism-outcome` | نتيجة آلية | required | `multiple_choice` |

- **`path-trace`** — Following a path, wire or route to its endpoint.
  - Reject: Diagrams too dense to trace at shared-screen distance.
- **`mechanism-outcome`** — Predicting a closed deterministic mechanism's result.
  - Reject: Outcomes depending on real-world physics knowledge.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight,
religion, romantic relationships, intelligence judgements, or awkward
family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See
roadmap §23.11.
