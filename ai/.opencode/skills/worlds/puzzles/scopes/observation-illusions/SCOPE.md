# Scope: Observation and Visual Illusions (قوة الملاحظة والخداع البصري)

- `scopeId`: `puzzles.observation-illusions`
- `worldId`: `puzzles`
- Player-facing Arabic name: **قوة الملاحظة والخداع البصري**
- Primary solve: **Notice what is already present.**
- The question it asks the player: «Did you notice it?»
- Boundary: the image in front of the player is the whole puzzle. The answer is
  visible before it is understood, and no inferred rule is required to reach it.
- Included: hidden detail, optical illusion, reflection, perspective, visual count, visual inconsistency.
- Excluded: anything that needs an inferred rule to solve — that is `spot-the-error`;
  anything solved by transforming the object — that is `assembly-rotation`;
  anything whose answer depends on recall.
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
| `hidden-detail` | تفصيلة مخفية | required | `multiple_choice` |
| `illusion-perception` | خداع بصري | required | `multiple_choice` |
| `visual-count` | عدّ بصري | required | `multiple_choice` |

- **`hidden-detail`** — A detail that is present and overlooked. Findable at shared-screen distance.
  - Reject: A detail only visible by zooming or peering close.
- **`illusion-perception`** — A perceptual effect the player names or resolves.
  - Reject: Illusions needing an explanation longer than the answer itself.
- **`visual-count`** — Counting a small, clearly separated set.
  - Reject: Counts above roughly a dozen, or overlapping shapes, inside 15s.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight,
religion, romantic relationships, intelligence judgements, or awkward
family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See
roadmap §23.11.
