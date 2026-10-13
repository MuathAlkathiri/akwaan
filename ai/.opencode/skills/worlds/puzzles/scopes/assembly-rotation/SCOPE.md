# Scope: Assembly and Rotation (تركيب وتدوير)

- `scopeId`: `puzzles.assembly-rotation`
- `worldId`: `puzzles`
- Player-facing Arabic name: **تركيب وتدوير**
- Primary solve: **Spatial transformation of the object itself.**
- The question it asks the player: «How does the object itself fit, fold, rotate or transform?»
- Boundary: the object is transformed in the player's head and the answer is the result
  of that transformation.
- Included: piece fitting, rotation, fold/unfold, cube nets, 2D↔3D, views and projections, silhouettes, cross-sections, reconstruction.
- Excluded: noticing a static detail — that is `observation-illusions`; predicting a
  system in motion — that is `paths-motion`.
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
| `net-fold` | طيّ وشبكات | required | `multiple_choice` |
| `silhouette-match` | مطابقة الظل | required | `multiple_choice` |
| `view-projection` | إسقاط ومنظور | required | `multiple_choice` |

- **`net-fold`** — A net folded, or a solid unfolded, in the player's head.
  - Reject: Nets complex enough to need physical rotation to verify.
- **`silhouette-match`** — Matching an object to its silhouette or projection.
  - Reject: Answers that can only be expressed as pictures.
- **`view-projection`** — Identifying another view of the same object.
  - Reject: Views requiring measurement rather than recognition.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight,
religion, romantic relationships, intelligence judgements, or awkward
family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See
roadmap §23.11.
