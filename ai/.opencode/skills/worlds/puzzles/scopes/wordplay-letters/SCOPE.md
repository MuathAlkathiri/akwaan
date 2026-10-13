# Scope: Wordplay and Letters (التلاعب بالكلمات والحروف)

- `scopeId`: `puzzles.wordplay-letters`
- `worldId`: `puzzles`
- Player-facing Arabic name: **التلاعب بالكلمات والحروف**
- Primary solve: **Language itself is the puzzle.**
- The question it asks the player: «What is the language doing here?»
- Boundary: the Arabic script and the words built from it are the material being
  manipulated, not merely the medium the question is written in.
- Included: anagrams, hidden words, add/remove/substitute letters, letter patterns, Arabic-script transformations.
- Excluded: vocabulary recall, spelling tests, 'how many letters in X', definitions,
  and anything resolved by knowing a word rather than by operating on it.
- `excludedChallengeTypeIds`: []

**«شفرة الضاد» is a question family inside this Scope — not a Scope of its own.**

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
| `anagram-rearrange` | إعادة ترتيب الحروف | none | `multiple_choice | match` |
| `letter-operation` | عملية على الحروف | none | `multiple_choice | match` |
| `hidden-word` | كلمة مخبأة | optional | `multiple_choice` |

- **`anagram-rearrange`** — Letters of a word rearranged into another.
  - Reject: Words whose rearrangement has more than one valid result.
- **`letter-operation`** — Add, remove or substitute a letter to transform a word.
  - Reject: Operations depending on an unstated spelling convention.
- **`hidden-word`** — A word concealed inside a longer string or phrase.
  - Reject: Strings where a second hidden word is equally defensible.

## Safety

No real-person names or likenesses, no brands, no money, body shape or weight,
religion, romantic relationships, intelligence judgements, or awkward
family-group topics. Keep to neutral, everyday material.

Forward Scope approved 2026-10-06; canonical slug approved 2026-10-09. See
roadmap §23.11.
